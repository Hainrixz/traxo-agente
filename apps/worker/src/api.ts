// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { buildDemoOrder, DEMO_PRODUCTS } from "@traxo/commerce";
import {
  type AgentEvent,
  CampaignDraftInputSchema,
  newId,
  renderCampaignMarkdown,
  StoreSettingsSchema,
  validateCopy,
} from "@traxo/core";
import { getSettings, recentEvents, saveOrder, setSettings, storeNameOf } from "@traxo/db";
import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { findOrder, handleNewOrder, quoteOrder, recordMessage, shipOrder } from "./agent.ts";
import { approve, fixAddress, reject } from "./approvals.ts";
import { storeOf } from "./auth.ts";
import { checkConfirmationTimeouts, markPaid } from "./confirmation.ts";
import { handleInbound } from "./inbound.ts";
import { isDemo } from "./mode.ts";
import { isMockCommerce, type Runtime } from "./runtime.ts";
import { advanceDemoShipment, pollTracking, reportIncident } from "./tracking.ts";

/**
 * Si TRAXO_API_TOKEN está definido, /api/* exige `Authorization: Bearer <token>` o `?token=<token>` (el feed SSE no puede mandar headers).
 * Sin token la API queda abierta: está bien para la demo con datos simulados, NO para una tienda real.
 */
export function protectApi(app: Hono, token = process.env.TRAXO_API_TOKEN): void {
  if (!token) return;
  app.use("/api/*", async (c, next) => {
    const given =
      c.req.header("authorization")?.replace(/^Bearer /, "") ??
      new URL(c.req.url).searchParams.get("token");
    if (given !== token)
      return c.json({ error: "Falta el token de Traxo (TRAXO_API_TOKEN)." }, 401);
    await next();
  });
}

export function registerApi(app: Hono, rt: Runtime): void {
  const { db } = rt;
  const sid = (c: Context): string => storeOf(c, rt.storeId);

  app.get("/api/state", async (c) => {
    const [settings, orders, shipments, pending, incidents] = await Promise.all([
      getSettings(db, sid(c)),
      db.prisma.order.count({ where: { storeId: sid(c) } }),
      db.prisma.shipment.findMany({
        where: { order: { storeId: sid(c) } },
        select: { status: true, total: true, simulated: true },
      }),
      db.prisma.approval.count({ where: { storeId: sid(c), status: "pending" } }),
      db.prisma.shipment.count({ where: { status: "incident", order: { storeId: sid(c) } } }),
    ]);
    return c.json({
      store: { id: sid(c), name: await storeNameOf(db, sid(c), rt.storeName) },
      settings,
      db: db.mode,
      demo: isDemo(),
      connections: rt.connections,
      kpis: {
        orders,
        shipments: shipments.length,
        delivered: shipments.filter((s) => s.status === "delivered").length,
        inTransit: shipments.filter((s) =>
          ["created", "picked_up", "in_transit", "out_for_delivery"].includes(s.status),
        ).length,
        incidents,
        pendingApprovals: pending,
        shippingSpend: shipments.reduce((s, x) => s + x.total, 0),
        simulatedShipments: shipments.filter((s) => s.simulated).length,
      },
    });
  });

  app.get("/api/orders", async (c) => {
    const rows = await db.prisma.order.findMany({
      where: { storeId: sid(c) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { shipments: { include: { events: { orderBy: { at: "asc" } } } }, quotes: true },
    });
    return c.json(rows);
  });

  app.get("/api/approvals", async (c) =>
    c.json(
      await db.prisma.approval.findMany({
        where: { storeId: sid(c) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
  );
  /** Una aprobación solo la puede resolver quien es dueño de su tienda. */
  const ownsApproval = async (c: Context): Promise<boolean> => {
    const a = await db.prisma.approval.findUnique({ where: { id: c.req.param("id") ?? "" } });
    return Boolean(a && a.storeId === sid(c));
  };
  app.post("/api/approvals/:id/approve", async (c) =>
    (await ownsApproval(c))
      ? c.json(await approve(rt, c.req.param("id")))
      : c.json({ ok: false, message: "No encuentro esa aprobación." }, 404),
  );
  app.post("/api/approvals/:id/reject", async (c) =>
    (await ownsApproval(c))
      ? c.json(await reject(rt, c.req.param("id")))
      : c.json({ ok: false, message: "No encuentro esa aprobación." }, 404),
  );
  app.post("/api/approvals/:id/address", async (c) => {
    const body = (await c.req.json()) as { street?: string; city?: string };
    if (!body.street) return c.json({ ok: false, message: "Falta la dirección." }, 400);
    if (!(await ownsApproval(c)))
      return c.json({ ok: false, message: "No encuentro esa aprobación." }, 404);
    return c.json(
      await fixAddress(rt, c.req.param("id"), { street: body.street, city: body.city }),
    );
  });

  app.get("/api/conversations", async (c) => {
    const rows = await db.prisma.conversation.findMany({
      where: { storeId: sid(c) },
      include: {
        customer: {
          include: {
            orders: {
              select: { number: true, total: true, status: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 3,
            },
          },
        },
        messages: { orderBy: { at: "asc" } },
      },
    });
    // La más reciente arriba, como en cualquier bandeja de mensajes.
    const last = (r: (typeof rows)[number]) =>
      r.messages.at(-1)?.at.getTime() ?? r.createdAt.getTime();
    return c.json(rows.sort((a, b) => last(b) - last(a)).slice(0, 40));
  });

  app.post("/api/settings", async (c) => {
    const patch = StoreSettingsSchema.partial().safeParse(await c.req.json());
    if (!patch.success) return c.json({ ok: false, message: "Valores no válidos." }, 400);
    return c.json(await setSettings(db, sid(c), patch.data));
  });

  // --- Catálogo y clientes (alimentan marketing y seguimiento comercial) ---
  app.get("/api/products", async (c) => {
    const [products, orders] = await Promise.all([
      db.prisma.product.findMany({ where: { storeId: sid(c) } }),
      db.prisma.order.findMany({ where: { storeId: sid(c) }, select: { lines: true } }),
    ]);
    const sold = new Map<string, { units: number; revenue: number }>();
    for (const o of orders) {
      for (const l of o.lines as Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
      }>) {
        const e = sold.get(l.productId) ?? { units: 0, revenue: 0 };
        e.units += l.quantity;
        e.revenue += l.quantity * l.unitPrice;
        sold.set(l.productId, e);
      }
    }
    return c.json(
      products
        .map((p) => ({
          id: p.id,
          title: p.title,
          price: p.price,
          cost: p.cost,
          // Sin costo cargado no se inventa margen.
          marginPct:
            p.cost == null || p.price === 0
              ? null
              : Math.round(((p.price - p.cost) / p.price) * 100),
          unitsSold: sold.get(p.id)?.units ?? 0,
          revenue: sold.get(p.id)?.revenue ?? 0,
          description: p.description,
        }))
        .sort((a, b) => b.revenue - a.revenue),
    );
  });

  app.get("/api/customers", async (c) => {
    const rows = await db.prisma.customer.findMany({
      where: { storeId: sid(c) },
      include: { orders: { select: { total: true, createdAt: true, status: true } } },
    });
    const now = Date.now();
    const day = 86_400_000;
    const customers = rows.map((r) => {
      const last = r.orders.reduce((m, o) => Math.max(m, o.createdAt.getTime()), 0);
      const orders = r.orders.length;
      const segments: string[] = [];
      if (orders >= 2) segments.push("recompra");
      if (orders === 1 && last && now - last < 30 * day) segments.push("nuevo");
      if (orders >= 1 && last && now - last > 60 * day) segments.push("inactivo");
      if (!r.whatsappConsent || r.optOutAt) segments.push("sin_consentimiento");
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        city: r.city,
        whatsappConsent: r.whatsappConsent && !r.optOutAt,
        optOut: Boolean(r.optOutAt),
        orders,
        spent: r.orders.reduce((s, o) => s + o.total, 0),
        lastOrderAt: last ? new Date(last).toISOString() : null,
        segments,
      };
    });
    const count = (seg: string) => customers.filter((x) => x.segments.includes(seg)).length;
    return c.json({
      total: customers.length,
      segments: {
        recompra: count("recompra"),
        nuevo: count("nuevo"),
        inactivo: count("inactivo"),
        sin_consentimiento: count("sin_consentimiento"),
      },
      customers,
    });
  });

  // --- Borradores de campaña: siempre en borrador o en pausa, nunca activos ---
  app.post("/api/campaigns", async (c) => {
    const parsed = CampaignDraftInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          message: `Faltan datos: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
        },
        400,
      );
    }
    const problems = validateCopy(parsed.data.platform, parsed.data.copy);
    if (problems.length)
      return c.json(
        {
          ok: false,
          message: `El copy no cumple los límites de ${parsed.data.platform}:\n${problems.join("\n")}`,
          problems,
        },
        400,
      );
    const id = newId("cmp");
    await db.prisma.campaignDraft.create({
      data: {
        id,
        storeId: sid(c),
        platform: parsed.data.platform,
        product: parsed.data.productTitle,
        status: "DRAFT",
        payload: parsed.data,
      },
    });
    rt.bus.emit(
      "marketing.draft",
      `Dejé listo el borrador de campaña de ${parsed.data.productTitle} para ${parsed.data.platform}. No gasté nada y no está creada en la plataforma.`,
      { data: { campaignId: id, storeId: sid(c) } },
    );
    return c.json({ ok: true, id, status: "DRAFT" });
  });

  app.get("/api/campaigns", async (c) =>
    c.json(
      await db.prisma.campaignDraft.findMany({
        where: { storeId: sid(c) },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ),
  );

  app.get("/api/campaigns/:id/markdown", async (c) => {
    const row = await db.prisma.campaignDraft.findUnique({ where: { id: c.req.param("id") } });
    if (!row) return c.json({ error: "No encuentro ese borrador." }, 404);
    const md = renderCampaignMarkdown({
      ...(row.payload as object as Parameters<typeof renderCampaignMarkdown>[0]),
      id: row.id,
      status: row.status as "DRAFT" | "PAUSED",
      createdAt: row.createdAt.toISOString(),
    });
    return c.json({ markdown: md });
  });

  /** Se llama DESPUÉS de crearla en la plataforma. Solo pasa a PAUSED si la pausa se verificó; si no, avisa. */
  app.post("/api/campaigns/:id/mark-created", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      externalId?: string;
      verifiedPaused?: boolean;
    };
    const row = await db.prisma.campaignDraft.findUnique({ where: { id: c.req.param("id") } });
    if (!row) return c.json({ error: "No encuentro ese borrador." }, 404);
    if (!body.externalId)
      return c.json({ ok: false, message: "Falta el id de la campaña en la plataforma." }, 400);
    if (!body.verifiedPaused) {
      await db.prisma.campaignDraft.update({
        where: { id: row.id },
        data: { externalId: body.externalId },
      });
      rt.bus.emit(
        "error",
        `La campaña ${body.externalId} se creó pero NO pude confirmar que esté en pausa. Revísala y páusala a mano en ${row.platform}.`,
        { data: { campaignId: row.id, storeId: row.storeId } },
      );
      return c.json({
        ok: false,
        status: row.status,
        message: `No está confirmada en pausa. Páusala a mano en ${row.platform} (id ${body.externalId}).`,
      });
    }
    await db.prisma.campaignDraft.update({
      where: { id: row.id },
      data: { externalId: body.externalId, status: "PAUSED" },
    });
    return c.json({ ok: true, status: "PAUSED" });
  });

  // --- Feed en vivo ---
  app.get("/api/events", async (c) => c.json(await recentEvents(db, sid(c), 150)));
  app.get("/api/stream", (c) =>
    streamSSE(c, async (stream) => {
      const queue: AgentEvent[] = [];
      let wake: (() => void) | undefined;
      const mine = sid(c);
      const off = rt.bus.subscribe((e) => {
        if ((e.storeId ?? rt.storeId) !== mine) return;
        queue.push(e);
        wake?.();
      });
      stream.onAbort(off);
      await stream.writeSSE({ event: "hello", data: "ok" });
      while (!stream.aborted) {
        while (queue.length)
          await stream.writeSSE({ event: "agent", data: JSON.stringify(queue.shift()) });
        await Promise.race([
          new Promise<void>((r) => {
            wake = r;
          }),
          new Promise((r) => setTimeout(r, 15000)),
        ]);
        if (!queue.length && !stream.aborted) await stream.writeSSE({ event: "ping", data: "." });
      }
    }),
  );

  // --- Demo: simular que pasan cosas en la tienda (solo con TRAXO_DEMO=1) ---
  app.use("/api/demo/*", async (c, next) => {
    if (!isDemo()) return c.json({ ok: false, message: "No disponible." }, 404);
    await next();
  });
  app.post("/api/demo/order", async (c) => {
    if (!isMockCommerce(rt.commerce))
      return c.json(
        { ok: false, message: "La demo solo simula pedidos en la tienda de ejemplo." },
        400,
      );
    const body = (await c.req.json().catch(() => ({}))) as {
      dane?: string;
      payment?: "cod" | "prepaid";
      badAddress?: boolean;
      scenario?: "safe" | "risky";
    };
    const order = buildDemoOrder({ dane: body.dane, payment: body.payment ?? "cod" });
    order.storeId = sid(c);
    // Escenarios para la demo guiada: «safe» sale solo; «risky» (cliente nuevo y $ 294.000 por cobrar) pide confirmación.
    if (body.scenario === "safe" || body.scenario === "risky") {
      const p =
        DEMO_PRODUCTS.find(
          (x) => x.id === (body.scenario === "safe" ? "prod_huila" : "prod_kit"),
        ) ?? DEMO_PRODUCTS[0];
      if (p) {
        const qty = body.scenario === "safe" ? 1 : 3;
        order.lines = [
          {
            productId: p.id,
            title: p.title,
            quantity: qty,
            unitPrice: p.price,
            weightGrams: p.weightGrams,
          },
        ];
        order.subtotal = order.total = p.price * qty;
        order.payment = "cod";
      }
    }
    if (body.badAddress) order.address.street = "por el parque, casa azul";
    rt.commerce.receive(order);
    const { order: saved } = await saveOrder(db, order);
    rt.bus.emit(
      "order.received",
      `Me llegó el pedido ${saved.number} de ${saved.address.name} (${saved.address.city}).`,
      { orderId: saved.id },
    );
    const outcome = await handleNewOrder(rt, saved);
    return c.json({ ok: true, orderId: saved.id, number: saved.number, outcome });
  });

  /** Demo: el cliente "paga" el link (en producción lo dispara el webhook de Wompi). */
  app.post("/api/demo/pay", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { orderId?: string };
    const own = await db.prisma.order.findFirst({
      where: { id: body.orderId ?? "", storeId: sid(c) },
    });
    if (!own) return c.json({ ok: false, message: "No encuentro ese pedido." }, 404);
    const out = await markPaid(rt, own.id);
    return out
      ? c.json({ ok: true, outcome: out })
      : c.json({ ok: false, message: "Ese pedido no estaba esperando un pago." }, 400);
  });

  /** Demo: adelanta el reloj 25 h para ver qué hace el agente cuando el cliente no responde. */
  app.post("/api/demo/expire-confirmation", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { orderId?: string };
    const own = await db.prisma.order.findFirst({
      where: { id: body.orderId ?? "", storeId: sid(c), status: "awaiting_confirmation" },
    });
    if (!own)
      return c.json({ ok: false, message: "Ese pedido no está esperando confirmación." }, 400);
    await db.prisma.order.update({
      where: { id: own.id },
      data: { confirmAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    return c.json({ ok: true, flagged: await checkConfirmationTimeouts(rt) });
  });

  app.post("/api/demo/advance", async (c) => {
    const body = (await c.req.json()) as { trackingNumber?: string; incident?: boolean };
    if (!body.trackingNumber) return c.json({ ok: false, message: "Falta la guía." }, 400);
    const own = await db.prisma.shipment.findFirst({
      where: { trackingNumber: body.trackingNumber, order: { storeId: sid(c) } },
    });
    if (!own) return c.json({ ok: false, message: "No encuentro esa guía." }, 404);
    try {
      const status = await advanceDemoShipment(rt, rt.mocks, body.trackingNumber, {
        incident: body.incident,
      });
      return c.json({ ok: true, status });
    } catch (e) {
      return c.json({ ok: false, message: (e as Error).message }, 400);
    }
  });

  app.post("/api/demo/reply", async (c) => {
    const body = (await c.req.json()) as { phone?: string; text?: string };
    if (!body.phone || !body.text)
      return c.json({ ok: false, message: "Faltan teléfono y texto." }, 400);
    return c.json({
      ok: true,
      result: await handleInbound(
        rt,
        { from: body.phone, text: body.text, at: new Date().toISOString() },
        sid(c),
      ),
    });
  });

  app.post("/api/track/poll", async (c) => c.json({ ok: true, events: await pollTracking(rt) }));

  // --- Acciones sobre un pedido o una guía (las usa el servidor MCP) ---
  app.get("/api/orders/:key", async (c) => {
    const order = await findOrder(db, c.req.param("key"), sid(c));
    if (!order) return c.json({ error: "No encuentro ese pedido." }, 404);
    const [shipments, quotes] = await Promise.all([
      db.prisma.shipment.findMany({
        where: { orderId: order.id },
        include: { events: { orderBy: { at: "asc" } } },
      }),
      db.prisma.carrierQuote.findMany({ where: { orderId: order.id } }),
    ]);
    return c.json({ order, shipments, quotes });
  });

  app.get("/api/orders/:key/quote", async (c) => {
    const order = await findOrder(db, c.req.param("key"), sid(c));
    if (!order) return c.json({ error: "No encuentro ese pedido." }, 404);
    const q = await quoteOrder(rt, order);
    return c.json({
      order: {
        id: order.id,
        number: order.number,
        city: order.address.city,
        payment: order.payment,
        total: order.total,
      },
      codAmount: q.draft.codAmount,
      explanation: q.selection?.explanation ?? null,
      ranking: q.selection?.ranking ?? [],
      failed: q.failed,
    });
  });

  app.post("/api/orders/:key/ship", async (c) => {
    const order = await findOrder(db, c.req.param("key"), sid(c));
    if (!order) return c.json({ error: "No encuentro ese pedido." }, 404);
    return c.json(await shipOrder(rt, order));
  });

  app.get("/api/shipments/:tracking", async (c) => {
    await pollTracking(rt).catch(() => 0);
    const s = await db.prisma.shipment.findFirst({
      where: { trackingNumber: c.req.param("tracking"), order: { storeId: sid(c) } },
      include: { events: { orderBy: { at: "asc" } }, order: true },
    });
    return s ? c.json(s) : c.json({ error: "No encuentro esa guía." }, 404);
  });

  app.post("/api/shipments/:tracking/incident", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { description?: string };
    const own = await db.prisma.shipment.findFirst({
      where: { trackingNumber: c.req.param("tracking"), order: { storeId: sid(c) } },
    });
    if (!own) return c.json({ ok: false, message: "No encuentro esa guía." }, 404);
    try {
      await reportIncident(
        rt,
        c.req.param("tracking"),
        body.description ?? "Novedad reportada por la tienda",
      );
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, message: (e as Error).message }, 404);
    }
  });

  app.post("/api/messages", async (c) => {
    const body = (await c.req.json()) as { orderKey?: string; text?: string };
    if (!body.orderKey || !body.text)
      return c.json({ ok: false, message: "Faltan el pedido y el texto." }, 400);
    const order = await findOrder(db, body.orderKey, sid(c));
    if (!order) return c.json({ ok: false, message: "No encuentro ese pedido." }, 404);
    if (!order.address.phone.startsWith("+57"))
      return c.json({ ok: false, message: "El pedido no tiene un celular válido." }, 400);
    const sent = await rt.messaging.send({
      to: order.address.phone,
      text: body.text,
      idempotencyKey: `manual:${order.id}:${Date.now()}`,
    });
    await recordMessage(db, order, body.text, undefined, sent.simulated);
    rt.bus.emit(
      "message.sent",
      `Le escribí a ${order.address.name} por WhatsApp.${sent.simulated ? " (simulado)" : ""}`,
      { orderId: order.id },
    );
    return c.json({ ok: true, simulated: sent.simulated });
  });
}
