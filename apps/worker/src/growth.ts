import { auditUrl, sampleAudit, UnsafeUrlError } from "@traxo/audit";
import { MockCommerce } from "@traxo/commerce";
import {
  type AdPlatform,
  AdPlatform as AdPlatformSchema,
  COPY_LIMITS,
  formatCOP,
  newId,
  suggestCampaign,
  validateCopy,
} from "@traxo/core";
import { addTrackingEvents } from "@traxo/db";
import { TEMPLATES } from "@traxo/messaging";
import type { Context, Hono } from "hono";
import { recordOutbound } from "./agent.ts";
import { askClaude } from "./ai.ts";
import { storeOf } from "./auth.ts";
import { importStore, isImported } from "./importer.ts";
import { isDemo } from "./mode.ts";
import type { Runtime } from "./runtime.ts";

type Json = Record<string, unknown>;
const DAY = 86_400_000;

/** Segmentos de la base de clientes (misma definición que /api/customers). */
async function loadCustomers(rt: Runtime, storeId: string) {
  const rows = await rt.db.prisma.customer.findMany({
    where: { storeId },
    include: { orders: { select: { total: true, createdAt: true, status: true } } },
  });
  const now = Date.now();
  return rows.map((r) => {
    const live = r.orders.filter((o) => o.status !== "cancelled");
    const last = live.reduce((m, o) => Math.max(m, o.createdAt.getTime()), 0);
    const segments: string[] = [];
    if (live.length >= 2) segments.push("recompra");
    if (live.length === 1 && last && now - last < 30 * DAY) segments.push("nuevo");
    if (live.length >= 1 && last && now - last > 60 * DAY) segments.push("inactivo");
    if (!r.whatsappConsent) segments.push("sin_consentimiento");
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      consent: r.whatsappConsent && !r.optOutAt,
      optOut: Boolean(r.optOutAt),
      segments,
      orders: live.length,
      spent: live.reduce((s, o) => s + o.total, 0),
      last,
    };
  });
}

const SEGMENTS = ["recompra", "nuevo", "inactivo"] as const;

export function registerGrowthApi(app: Hono, rt: Runtime): void {
  const { db } = rt;
  const sid = (c: Context): string => storeOf(c, rt.storeId);
  const demo = isDemo;

  // ---------------- Tienda ----------------
  app.get("/api/store/status", async (c) => {
    const [products, customers, orders, store] = await Promise.all([
      db.prisma.product.count({ where: { storeId: sid(c) } }),
      db.prisma.customer.count({ where: { storeId: sid(c) } }),
      db.prisma.order.count({ where: { storeId: sid(c) } }),
      db.prisma.store.findUnique({ where: { id: sid(c) } }),
    ]);
    return c.json({
      imported: products > 0,
      demo: isDemo(),
      connected: rt.commerce.platform !== "mock",
      products,
      customers,
      orders,
      platform: store?.platform ?? "mock",
      profile: store?.profile ?? null,
    });
  });

  app.post("/api/store/import", async (c) => {
    // Con tu tienda real se importa esa. La tienda de ejemplo solo existe en modo demo.
    if (rt.commerce.platform === "mock" && !isDemo())
      return c.json({
        ok: false,
        message:
          "Todavía no hay una tienda conectada. Define SHOPIFY_*, TIENDANUBE_* o WOOCOMMERCE_* en tu .env (o corre /traxo:instalar en Claude) y reinicia.",
      });
    const adapter = rt.commerce.platform === "mock" ? new MockCommerce() : rt.commerce;
    const result = await importStore(rt, sid(c), adapter);
    return c.json({ ok: true, ...result, platform: adapter.platform });
  });

  // ---------------- Auditoría de tienda (SEO y diseño) ----------------
  app.get("/api/audits", async (c) => {
    const out: Json = {};
    const history: Json = {};
    for (const kind of ["seo", "diseno"]) {
      const rows = await db.prisma.storeAudit.findMany({
        where: { storeId: sid(c), kind },
        orderBy: { createdAt: "desc" },
        take: 8,
      });
      const row = rows[0];
      out[kind] = row ? { ...(row.payload as Json), id: row.id } : null;
      history[kind] = rows
        .map((r) => ({ score: r.score, evaluated: r.evaluated, at: r.createdAt }))
        .reverse();
    }
    return c.json({ ...out, history });
  });

  app.post("/api/audits/run", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { kind?: string; url?: string };
    if (b.kind !== "seo" && b.kind !== "diseno")
      return c.json({ ok: false, message: "Elige SEO o diseño." }, 400);
    let report: Awaited<ReturnType<typeof auditUrl>>;
    if (b.url) {
      if (process.env.TRAXO_AUDIT_LIVE !== "1") {
        return c.json(
          {
            ok: false,
            message:
              "Auditar URLs reales está desactivado en esta instalación. Actívalo con TRAXO_AUDIT_LIVE=1; mientras tanto puedes ver el informe de ejemplo.",
          },
          403,
        );
      }
      try {
        report = await auditUrl(b.kind, b.url);
      } catch (e) {
        return c.json(
          {
            ok: false,
            message:
              e instanceof UnsafeUrlError
                ? e.message
                : `No pude leer esa página: ${(e as Error).message}`,
          },
          400,
        );
      }
    } else {
      const store = await db.prisma.store.findUnique({ where: { id: sid(c) } });
      report = sampleAudit(
        b.kind,
        store?.url?.startsWith("http") ? store.url : `https://${store?.url ?? "tienda.example"}`,
      );
    }
    const id = newId("aud");
    await db.prisma.storeAudit.create({
      data: {
        id,
        storeId: sid(c),
        kind: b.kind,
        source: report.source,
        score: report.score,
        evaluated: report.evaluated,
        total: report.total,
        url: report.url,
        payload: report as unknown as object,
      },
    });
    rt.bus.emit(
      "audit.done",
      `Auditoría de ${b.kind === "seo" ? "SEO" : "diseño"} lista${report.source === "sample" ? " (informe de ejemplo)" : ""}: ${report.score ?? "N/A"} sobre ${report.evaluated} checks evaluados de ${report.total}. Lo primero: ${report.quickWins[0] ?? "nada urgente"}`,
      { data: { storeId: sid(c) } },
    );
    return c.json({ ok: true, report: { ...report, id } });
  });

  // ---------------- Campañas: asistente, creativos y lanzamiento simulado ----------------
  // Reescribe el copy con IA (más variedad y gancho) dentro de los límites de la plataforma. Si no cumple o no hay IA, queda el original.
  app.post("/api/campaigns/improve-copy", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as {
      platform?: string;
      productTitle?: string;
      objective?: string;
      tone?: string;
      copy?: {
        headlines?: string[];
        primaryTexts?: string[];
        descriptions?: string[];
        cta?: string;
      };
    };
    const platform = AdPlatformSchema.safeParse(b.platform);
    if (!platform.success || !b.copy?.headlines?.length || !b.copy.primaryTexts?.length)
      return c.json({ ok: false, message: "Faltan datos del copy." }, 400);
    const lim = COPY_LIMITS[platform.data];
    const out = await askClaude(sid(c), {
      feature: "Copy de anuncios",
      system:
        "Eres redactor publicitario para e-commerce en Colombia. Reescribes el copy de un anuncio: gancho claro, beneficio concreto, tono cercano, sin promesas falsas ni cifras inventadas. " +
        `Límites estrictos de caracteres (${platform.data}): título ${lim.headline}, texto principal ${lim.primaryText}, descripción ${lim.description}. ` +
        'Responde SOLO un JSON: {"headlines":[...],"primaryTexts":[...],"descriptions":[...]} con la misma cantidad de elementos que el original.',
      user: `Producto: ${String(b.productTitle ?? "").slice(0, 120)}. Objetivo: ${String(b.objective ?? "ventas").slice(0, 40)}. Tono: ${String(b.tone ?? "cercano").slice(0, 40)}.\n<datos>${JSON.stringify(b.copy).slice(0, 2500)}</datos>`,
      maxTokens: 700,
    });
    if (!out)
      return c.json({
        ok: false,
        message: "La IA no está disponible ahora. Dejé el copy como estaba.",
      });
    try {
      const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as {
        headlines?: string[];
        primaryTexts?: string[];
        descriptions?: string[];
      };
      const strs = (v: unknown): string[] | null =>
        Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim())
          ? (v as string[]).map((x) => x.trim())
          : null;
      const copy = {
        headlines: strs(j.headlines) ?? [],
        primaryTexts: strs(j.primaryTexts) ?? [],
        descriptions: strs(j.descriptions) ?? [],
        cta: b.copy.cta ?? "Comprar ahora",
      };
      if (!copy.headlines.length || !copy.primaryTexts.length)
        return c.json({
          ok: false,
          message: "La IA no devolvió un copy utilizable. Dejé el original.",
        });
      const problems = validateCopy(platform.data, copy);
      if (problems.length)
        return c.json({
          ok: false,
          message: "La IA se pasó de los límites de la plataforma. Dejé el original.",
          problems,
        });
      return c.json({ ok: true, copy });
    } catch {
      return c.json({
        ok: false,
        message: "La IA no devolvió un copy utilizable. Dejé el original.",
      });
    }
  });

  app.post("/api/campaigns/suggest", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as {
      productId?: string;
      platform?: string;
      objective?: string;
      dailyBudget?: number;
    };
    const platform = AdPlatformSchema.safeParse(b.platform);
    if (!platform.success)
      return c.json({ ok: false, message: "Elige Meta, Google o TikTok." }, 400);
    const product = await db.prisma.product.findFirst({
      where: { id: b.productId ?? "", storeId: sid(c) },
    });
    if (!product) return c.json({ ok: false, message: "Elige un producto de tu tienda." }, 400);
    const orders = await db.prisma.order.findMany({
      where: { storeId: sid(c), status: { not: "cancelled" } },
      select: { lines: true, address: true },
    });
    let units = 0;
    const cityCount = new Map<string, number>();
    for (const o of orders) {
      const mine = (o.lines as Array<{ productId: string; quantity: number }>).filter(
        (l) => l.productId === product.id || l.productId === product.externalId,
      );
      if (!mine.length) continue;
      units += mine.reduce((s, l) => s + l.quantity, 0);
      const city = (o.address as { city?: string }).city;
      if (city) cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
    }
    const store = await db.prisma.store.findUnique({ where: { id: sid(c) } });
    const topCities = [...cityCount.entries()].sort((x, y) => y[1] - x[1]).map(([k]) => k);
    const objective =
      (["ventas", "trafico", "mensajes", "reconocimiento"] as const).find(
        (o) => o === b.objective,
      ) ?? "ventas";
    const suggestion = suggestCampaign({
      platform: platform.data,
      objective,
      productTitle: product.title,
      price: product.price,
      marginPct:
        product.cost == null || product.price === 0
          ? null
          : Math.round(((product.price - product.cost) / product.price) * 100),
      unitsSold: units,
      topCities,
      storeName: store?.name ?? "tu tienda",
      dailyBudget: Math.max(5000, Math.round(b.dailyBudget ?? 30000)),
    });
    return c.json({
      ok: true,
      productTitle: product.title,
      productId: product.id,
      platform: platform.data,
      objective,
      dailyBudget: Math.max(5000, Math.round(b.dailyBudget ?? 30000)),
      ...suggestion,
    });
  });

  const ownDraft = async (c: Context) => {
    const row = await db.prisma.campaignDraft.findUnique({
      where: { id: c.req.param("id") ?? "" },
    });
    return row && row.storeId === sid(c) ? row : undefined;
  };

  /** Higgsfield cuesta créditos: sin `confirm` solo cotiza. En la demo "genera" imágenes simuladas, sin gastar nada. */
  app.post("/api/campaigns/:id/creatives/generate", async (c) => {
    const row = await ownDraft(c);
    if (!row) return c.json({ ok: false, message: "No encuentro ese borrador." }, 404);
    const b = (await c.req.json().catch(() => ({}))) as { confirm?: boolean };
    const payload = row.payload as {
      creatives?: Array<{ kind: string; prompt: string; generated?: boolean; seed?: string }>;
    };
    const pending = (payload.creatives ?? []).filter((x) => !x.generated);
    const cost = pending.reduce((s, x) => s + (x.kind === "video" ? 40 : 6), 0);
    if (!b.confirm)
      return c.json({
        ok: true,
        quote: true,
        pending: pending.length,
        credits: cost,
        estimated: true,
        message: `Generar ${pending.length} creativos cuesta unos ${cost} créditos (estimado). Confirma para continuar.`,
      });
    if (!demo())
      return c.json(
        {
          ok: false,
          message:
            "Los creativos reales se generan desde Claude con /traxo:campana (Higgsfield pide el costo y tu confirmación).",
        },
        409,
      );
    const creatives = (payload.creatives ?? []).map((x) =>
      x.generated ? x : { ...x, generated: true, seed: newId("art"), mock: true },
    );
    await db.prisma.campaignDraft.update({
      where: { id: row.id },
      data: { payload: { ...payload, creatives } },
    });
    rt.bus.emit(
      "marketing.draft",
      `Generé ${pending.length} creativos de ${row.product} (simulados: no se gastaron créditos reales).`,
      { data: { storeId: sid(c) } },
    );
    return c.json({ ok: true, generated: pending.length, credits: cost, simulated: true });
  });

  app.post("/api/campaigns/:id/launch", async (c) => {
    const row = await ownDraft(c);
    if (!row) return c.json({ ok: false, message: "No encuentro ese borrador." }, 404);
    if (!demo())
      return c.json(
        {
          ok: false,
          message:
            "Crear la campaña en la plataforma se hace desde Claude con /traxo:campana y el conector de la plataforma. Siempre queda en pausa.",
        },
        409,
      );
    const externalId = `sim_${row.platform}_${Math.floor(Math.random() * 9e6 + 1e6)}`;
    await db.prisma.campaignDraft.update({
      where: { id: row.id },
      data: { status: "PAUSED", externalId },
    });
    rt.bus.emit(
      "marketing.draft",
      `Creé la campaña de ${row.product} en ${row.platform} y verifiqué que quedó EN PAUSA (simulado). Actívala tú cuando la revises.`,
      { data: { storeId: sid(c) } },
    );
    return c.json({ ok: true, status: "PAUSED", externalId, simulated: true });
  });

  // ---------------- Audiencias y mensajes a clientes ----------------
  app.get("/api/audiences", async (c) =>
    c.json(
      await db.prisma.audience.findMany({
        where: { storeId: sid(c) },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );

  app.post("/api/audiences", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { segment?: string; name?: string };
    if (!SEGMENTS.includes(b.segment as (typeof SEGMENTS)[number]))
      return c.json({ ok: false, message: "Elige un segmento: recompra, nuevo o inactivo." }, 400);
    const all = await loadCustomers(rt, sid(c));
    const size = all.filter((x) => x.segments.includes(b.segment as string) && x.consent).length;
    const labels: Record<string, string> = {
      recompra: "Clientes que recompran",
      nuevo: "Clientes nuevos (30 días)",
      inactivo: "Clientes inactivos (60+ días)",
    };
    const a = await db.prisma.audience.create({
      data: {
        id: newId("aud"),
        storeId: sid(c),
        name: (b.name ?? labels[b.segment as string] ?? "Audiencia").slice(0, 80),
        segment: b.segment as string,
        size,
      },
    });
    return c.json({
      ok: true,
      audience: a,
      excluded: all.filter((x) => x.segments.includes(b.segment as string) && !x.consent).length,
    });
  });

  app.post("/api/audiences/:id/sync", async (c) => {
    const a = await db.prisma.audience.findFirst({
      where: { id: c.req.param("id"), storeId: sid(c) },
    });
    if (!a) return c.json({ ok: false, message: "No encuentro esa audiencia." }, 404);
    if (!demo())
      return c.json(
        {
          ok: false,
          message:
            "Subir la audiencia a Meta se hace desde Claude con el conector de Meta: los teléfonos se envían cifrados (SHA-256) y solo de clientes con consentimiento.",
        },
        409,
      );
    await db.prisma.audience.update({ where: { id: a.id }, data: { status: "SYNC_SIMULADO" } });
    rt.bus.emit(
      "marketing.draft",
      `Preparé la audiencia «${a.name}» (${a.size} clientes con consentimiento) para Meta. Es una simulación: no se subió ningún dato.`,
      { data: { storeId: sid(c) } },
    );
    return c.json({ ok: true, status: "SYNC_SIMULADO", simulated: true });
  });

  /** Mensaje de recompra o reactivación: solo a quien dio consentimiento y no pidió la baja. Sin `confirm` solo muestra a cuántos llegaría. */
  app.post("/api/broadcasts", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as {
      segment?: string;
      text?: string;
      confirm?: boolean;
    };
    if (!SEGMENTS.includes(b.segment as (typeof SEGMENTS)[number]))
      return c.json({ ok: false, message: "Elige un segmento." }, 400);
    const text = (b.text ?? "").trim();
    if (text.length < 10)
      return c.json({ ok: false, message: "Escribe el mensaje (mínimo 10 caracteres)." }, 400);
    const all = (await loadCustomers(rt, sid(c))).filter((x) =>
      x.segments.includes(b.segment as string),
    );
    const ok = all.filter((x) => x.consent && x.phone.startsWith("+57"));
    const excluded = all.length - ok.length;
    if (!b.confirm)
      return c.json({
        ok: true,
        preview: true,
        recipients: ok.length,
        excluded,
        sample: ok.slice(0, 3).map((x) => x.name),
      });
    const batch = ok.slice(0, 25);
    for (const r of batch) {
      const body = `${text}\n\nPara no recibir más mensajes responde BAJA.`;
      const sent = await rt.messaging.send({
        to: r.phone,
        text: body,
        idempotencyKey: `bc:${r.id}:${Date.now()}`,
      });
      await recordOutbound(db, sid(c), r.id, body, sent.simulated);
    }
    rt.bus.emit(
      "message.sent",
      `Envié el mensaje a ${batch.length} clientes del segmento «${b.segment}» con consentimiento (${excluded} excluidos por no tenerlo o haber pedido la baja).${rt.messaging.name === "mock" ? " (mensajes simulados)" : ""}`,
      { data: { storeId: sid(c) } },
    );
    return c.json({
      ok: true,
      sent: batch.length,
      excluded,
      capped: ok.length > batch.length,
      simulated: rt.messaging.name === "mock",
    });
  });

  // ---------------- Datos del cliente (Ley 1581) ----------------
  const ownCustomer = (c: Context) =>
    db.prisma.customer.findFirst({ where: { id: c.req.param("id") ?? "", storeId: sid(c) } });

  app.post("/api/customers/:id/opt-out", async (c) => {
    const cu = await ownCustomer(c);
    if (!cu) return c.json({ ok: false, message: "No encuentro ese cliente." }, 404);
    await db.prisma.customer.update({
      where: { id: cu.id },
      data: { whatsappConsent: false, optOutAt: new Date() },
    });
    return c.json({ ok: true });
  });

  app.get("/api/customers/:id/export", async (c) => {
    const cu = await db.prisma.customer.findFirst({
      where: { id: c.req.param("id"), storeId: sid(c) },
      include: {
        orders: {
          select: {
            number: true,
            total: true,
            payment: true,
            status: true,
            createdAt: true,
            address: true,
            lines: true,
          },
        },
        conversations: {
          include: { messages: { select: { direction: true, text: true, at: true } } },
        },
      },
    });
    if (!cu) return c.json({ ok: false, message: "No encuentro ese cliente." }, 404);
    return c.json({ ok: true, exportedAt: new Date().toISOString(), customer: cu });
  });

  /** Derecho de supresión: se borra la conversación y se anonimiza al cliente; los pedidos quedan sin datos personales (contabilidad). */
  app.delete("/api/customers/:id", async (c) => {
    const cu = await ownCustomer(c);
    if (!cu) return c.json({ ok: false, message: "No encuentro ese cliente." }, 404);
    const convs = await db.prisma.conversation.findMany({
      where: { customerId: cu.id },
      select: { id: true },
    });
    await db.prisma.message.deleteMany({
      where: { conversationId: { in: convs.map((x) => x.id) } },
    });
    await db.prisma.conversation.deleteMany({ where: { customerId: cu.id } });
    const orders = await db.prisma.order.findMany({ where: { customerId: cu.id } });
    for (const o of orders) {
      const a = o.address as { city?: string; dane?: string; department?: string };
      await db.prisma.order.update({
        where: { id: o.id },
        data: {
          address: {
            name: "Cliente eliminado",
            phone: "",
            street: "",
            city: a.city ?? "",
            dane: a.dane ?? "00000",
            department: a.department ?? "",
          },
        },
      });
    }
    await db.prisma.customer.update({
      where: { id: cu.id },
      data: {
        name: "Cliente eliminado",
        phone: `eliminado:${cu.id}`,
        email: null,
        city: null,
        whatsappConsent: false,
        optOutAt: new Date(),
      },
    });
    return c.json({ ok: true, anonymizedOrders: orders.length });
  });

  // ---------------- Envíos ----------------
  app.get("/api/shipments", async (c) => {
    const rows = await db.prisma.shipment.findMany({
      where: { order: { storeId: sid(c) } },
      include: { order: true, events: { orderBy: { at: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 120,
    });
    return c.json(
      rows.map((s) => ({
        id: s.id,
        trackingNumber: s.trackingNumber,
        carrier: s.carrier,
        provider: s.provider,
        status: s.status,
        total: s.total,
        simulated: s.simulated,
        labelUrl: s.labelUrl,
        trackUrl: s.trackUrl,
        createdAt: s.createdAt,
        deliveredAt: s.deliveredAt,
        lastEvent: s.events[0]?.description ?? null,
        order: {
          id: s.order.id,
          number: s.order.number,
          payment: s.order.payment,
          total: s.order.total,
          name: (s.order.address as { name?: string }).name ?? "",
          city: (s.order.address as { city?: string }).city ?? "",
        },
      })),
    );
  });

  const ownShipment = (c: Context) =>
    db.prisma.shipment.findFirst({
      where: { trackingNumber: c.req.param("tracking") ?? "", order: { storeId: sid(c) } },
      include: { order: true },
    });

  app.post("/api/shipments/:tracking/cancel", async (c) => {
    const s = await ownShipment(c);
    if (!s) return c.json({ ok: false, message: "No encuentro esa guía." }, 404);
    if (!["created", "pickup_scheduled"].includes(s.status))
      return c.json(
        { ok: false, message: "Solo se puede cancelar una guía que todavía no fue recogida." },
        400,
      );
    const provider = rt.carriers.find((p) => p.id === s.provider);
    try {
      await provider?.cancel(s.trackingNumber);
    } catch (e) {
      return c.json(
        { ok: false, message: `La transportadora no dejó cancelar: ${(e as Error).message}` },
        502,
      );
    }
    await addTrackingEvents(db, s.id, [
      {
        status: "cancelled",
        description: "Guía cancelada por la tienda",
        at: new Date().toISOString(),
      },
    ]);
    await db.prisma.order.update({ where: { id: s.orderId }, data: { status: "confirmed" } });
    rt.bus.emit(
      "tracking.updated",
      `Cancelé la guía ${s.trackingNumber} de ${s.order.number}. El pedido quedó listo para generar otra.${s.simulated ? "" : " Recuerda que el saldo se devuelve si la cancelas antes de la recogida."}`,
      { orderId: s.orderId },
    );
    return c.json({ ok: true });
  });

  app.post("/api/shipments/:tracking/pickup", async (c) => {
    const s = await ownShipment(c);
    if (!s) return c.json({ ok: false, message: "No encuentro esa guía." }, 404);
    if (s.status !== "created")
      return c.json(
        { ok: false, message: "La recogida solo se programa cuando la guía está recién creada." },
        400,
      );
    const provider = rt.carriers.find((p) => p.id === s.provider);
    if (provider?.live)
      return c.json(
        {
          ok: false,
          message:
            "La recogida en vivo con esta transportadora todavía no está integrada: prográmala en su portal.",
        },
        501,
      );
    await addTrackingEvents(db, s.id, [
      {
        status: "pickup_scheduled",
        description: "Recogida programada para mañana entre 8 a. m. y 12 m.",
        at: new Date().toISOString(),
      },
    ]);
    rt.bus.emit(
      "tracking.updated",
      `Programé la recogida de ${s.order.number} con ${s.carrier} para mañana en la mañana (simulado).`,
      { orderId: s.orderId },
    );
    return c.json({ ok: true });
  });

  // ---------------- Plantillas ----------------
  app.get("/api/templates", async (c) => {
    const vars = {
      nombre: "Valentina Ospina",
      tienda: "tu tienda",
      guia: "240045871236",
      transportadora: "Coordinadora",
      url: "https://rastreo.ejemplo/240045871236",
      monto: 136000,
      dias: 3,
      descuentoPct: 5,
      montoPrepago: 129200,
    };
    return c.json(Object.entries(TEMPLATES).map(([name, fn]) => ({ name, text: fn(vars) })));
  });

  // ---------------- Reportes ----------------
  app.get("/api/reports/overview", async (c) => {
    const days = Math.min(120, Math.max(7, Number(c.req.query("days") ?? 90)));
    const since = new Date(Date.now() - days * DAY);
    const orders = await db.prisma.order.findMany({
      where: { storeId: sid(c), createdAt: { gte: since } },
      include: { shipments: { select: { status: true } } },
    });
    const byDay = new Map<string, { orders: number; revenue: number }>();
    for (let i = days - 1; i >= 0; i--)
      byDay.set(new Date(Date.now() - i * DAY).toISOString().slice(0, 10), {
        orders: 0,
        revenue: 0,
      });
    let revenue = 0;
    let cod = 0;
    let delivered = 0;
    let shipped = 0;
    let returned = 0;
    let cancelled = 0;
    for (const o of orders) {
      const d = byDay.get(o.createdAt.toISOString().slice(0, 10));
      if (o.status === "cancelled") {
        cancelled++;
        continue;
      }
      if (d) {
        d.orders++;
        d.revenue += o.total;
      }
      revenue += o.total;
      if (o.payment === "cod") cod++;
      if (o.shipments.length) {
        shipped++;
        if (o.shipments.some((s) => s.status === "delivered")) delivered++;
        if (o.shipments.some((s) => s.status === "returned" || s.status === "returning"))
          returned++;
      }
    }
    const live = orders.length - cancelled;
    return c.json({
      days,
      series: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      totals: {
        orders: live,
        revenue,
        avgTicket: live ? Math.round(revenue / live) : null,
        codShare: live ? Math.round((cod / live) * 100) : null,
        deliveredPct: shipped ? Math.round((delivered / shipped) * 100) : null,
        returnedPct: shipped ? Math.round((returned / shipped) * 100) : null,
        cancelled,
      },
    });
  });

  app.get("/api/reports/attribution", async (c) => {
    const orders = await db.prisma.order.findMany({
      where: { storeId: sid(c), status: { not: "cancelled" } },
      include: { shipments: { select: { status: true } } },
    });
    const campaigns = await db.prisma.campaignDraft.findMany({ where: { storeId: sid(c) } });
    type Agg = { orders: number; revenue: number; delivered: number; returned: number };
    const blank = (): Agg => ({ orders: 0, revenue: 0, delivered: 0, returned: 0 });
    const bySource = new Map<string, Agg>();
    const byCampaign = new Map<string, Agg>();
    for (const o of orders) {
      const utm = (o.utm ?? {}) as Record<string, string>;
      const src = utm.utm_source ?? "directo";
      for (const [map, key] of [
        [bySource, src],
        [byCampaign, utm.utm_campaign ?? ""],
      ] as const) {
        if (!key) continue;
        const a = map.get(key) ?? blank();
        a.orders++;
        a.revenue += o.total;
        if (o.shipments.some((s) => s.status === "delivered")) a.delivered++;
        if (o.shipments.some((s) => s.status === "returned" || s.status === "returning"))
          a.returned++;
        map.set(key, a);
      }
    }
    const sources = [...bySource.entries()]
      .map(([source, a]) => ({
        source,
        ...a,
        deliveredPct: a.orders ? Math.round((a.delivered / a.orders) * 100) : null,
        avgTicket: a.orders ? Math.round(a.revenue / a.orders) : null,
      }))
      .sort((x, y) => y.revenue - x.revenue);
    const camps = campaigns.map((d) => {
      const p = d.payload as { utmCampaign?: string };
      const a = (p.utmCampaign && byCampaign.get(p.utmCampaign)) || blank();
      const m = (d.metrics ?? null) as { spend?: number } | null;
      const spend = m?.spend ?? null;
      return {
        id: d.id,
        product: d.product,
        platform: d.platform,
        status: d.status,
        utmCampaign: p.utmCampaign ?? null,
        sample: d.sample,
        orders: a.orders,
        revenue: a.revenue,
        spend,
        // Sin gasto conocido no hay ROAS: se dice N/A en vez de inventarlo.
        roas: spend && spend > 0 ? Math.round((a.revenue / spend) * 10) / 10 : null,
        costPerOrder: spend && a.orders ? Math.round(spend / a.orders) : null,
      };
    });
    return c.json({ sources, campaigns: camps });
  });

  app.get("/api/reports/logistics", async (c) => {
    const rows = await db.prisma.shipment.findMany({
      where: { order: { storeId: sid(c) } },
      include: {
        order: { select: { total: true, payment: true, status: true } },
        events: { select: { status: true } },
      },
    });
    type Agg = {
      shipments: number;
      delivered: number;
      incidents: number;
      returned: number;
      cost: number;
      days: number[];
      codCollected: number;
      codInTransit: number;
    };
    const by = new Map<string, Agg>();
    for (const s of rows) {
      const a = by.get(s.carrier) ?? {
        shipments: 0,
        delivered: 0,
        incidents: 0,
        returned: 0,
        cost: 0,
        days: [],
        codCollected: 0,
        codInTransit: 0,
      };
      a.shipments++;
      a.cost += s.total;
      if (s.events.some((e) => e.status === "incident")) a.incidents++;
      if (s.status === "returned" || s.status === "returning") a.returned++;
      if (s.status === "delivered") {
        a.delivered++;
        if (s.deliveredAt) a.days.push((s.deliveredAt.getTime() - s.createdAt.getTime()) / DAY);
        if (s.order.payment === "cod") a.codCollected += s.order.total;
      } else if (
        s.order.payment === "cod" &&
        !["returned", "returning", "cancelled"].includes(s.status)
      )
        a.codInTransit += s.order.total;
      by.set(s.carrier, a);
    }
    const carriers = [...by.entries()]
      .map(([carrier, a]) => ({
        carrier,
        shipments: a.shipments,
        deliveredPct: Math.round((a.delivered / a.shipments) * 100),
        incidentPct: Math.round((a.incidents / a.shipments) * 100),
        returnedPct: Math.round((a.returned / a.shipments) * 100),
        avgCost: Math.round(a.cost / a.shipments),
        avgDays: a.days.length
          ? Math.round((a.days.reduce((x, y) => x + y, 0) / a.days.length) * 10) / 10
          : null,
        codCollected: a.codCollected,
        codInTransit: a.codInTransit,
      }))
      .sort((x, y) => y.shipments - x.shipments);
    return c.json({
      carriers,
      cod: {
        collected: carriers.reduce((s, x) => s + x.codCollected, 0),
        inTransit: carriers.reduce((s, x) => s + x.codInTransit, 0),
      },
      note: "«Recaudado» son entregas con contraentrega; cuándo consigna cada transportadora depende de su contrato y no se conoce desde aquí (N/A).",
    });
  });

  // ---------------- Reinicio ----------------
  app.post("/api/demo/reset", async (c) => {
    const store = sid(c);
    if (!demo())
      return c.json({ ok: false, message: "Reiniciar solo está disponible en la demo." }, 403);
    const where = { storeId: store };
    const convs = (await db.prisma.conversation.findMany({ where, select: { id: true } })).map(
      (x) => x.id,
    );
    const ships = (
      await db.prisma.shipment.findMany({ where: { order: where }, select: { id: true } })
    ).map((x) => x.id);
    await db.prisma.message.deleteMany({ where: { conversationId: { in: convs } } });
    await db.prisma.conversation.deleteMany({ where });
    await db.prisma.trackingEventRow.deleteMany({ where: { shipmentId: { in: ships } } });
    await db.prisma.shipment.deleteMany({ where: { order: where } });
    await db.prisma.carrierQuote.deleteMany({ where: { order: where } });
    await db.prisma.order.deleteMany({ where });
    for (const t of [
      "approval",
      "agentRun",
      "campaignDraft",
      "audience",
      "storeAudit",
      "customer",
      "product",
    ] as const) {
      await (db.prisma[t] as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany(
        { where },
      );
    }
    await db.prisma.store.update({ where: { id: store }, data: { profile: {} } });
    await db.prisma.account.updateMany({
      where: { storeId: store, role: "owner" },
      data: { tourDone: false },
    });
    if (store === rt.storeId && rt.reseed) await rt.reseed();
    return c.json({
      ok: true,
      message:
        store === rt.storeId && rt.reseed
          ? "Datos de ejemplo restaurados."
          : "Tu espacio quedó vacío otra vez.",
    });
  });

  void formatCOP;
  void isImported;
}

export type { AdPlatform };
