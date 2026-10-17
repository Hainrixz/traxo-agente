import { createHmac } from "node:crypto";
import { type Db, ensureDemoAdmin, openDb } from "@traxo/db";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { mountAuth } from "../src/auth.ts";
import { registerGrowthApi } from "../src/growth.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";
import { ingestCarrierEvent } from "../src/tracking.ts";

let db: Db;
let rt: Runtime;
let app: Hono;
let cookie: string;
let n = 0;

beforeEach(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({
    db,
    bus: rt.bus,
    commerce: rt.commerceMap,
    onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
  });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
  registerGrowthApi(app, rt);
  // Cuenta nueva y vacía: así se prueba también el camino del primer día.
  const r = await app.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ana",
      email: "ana@t.co",
      password: "secreto1",
      storeName: "Tienda de Ana",
    }),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++n}` },
  });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
});
afterEach(async () => db.close());

const call = async <T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> => {
  const res = await app.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
};
const importStore = () => call("POST", "/api/store/import");

describe("importar la tienda", () => {
  it("trae catálogo, clientes e historial a la cuenta nueva y es idempotente", async () => {
    expect((await call<{ imported: boolean }>("GET", "/api/store/status")).json.imported).toBe(
      false,
    );
    const first = (await importStore()).json as {
      products: number;
      customers: number;
      orders: number;
    };
    expect(first.products).toBe(6);
    expect(first.customers).toBeGreaterThan(5);
    expect(first.orders).toBe(10);
    const second = (await importStore()).json as { products: number; orders: number };
    expect(second.products).toBe(0);
    expect(second.orders).toBe(0);
    const st = (await call<{ kpis: { orders: number } }>("GET", "/api/state")).json;
    expect(st.kpis.orders).toBe(10);
    // La tienda de ejemplo del admin no se tocó.
    expect(await db.prisma.product.count({ where: { storeId: rt.storeId } })).toBe(6); // los 6 de ejemplo del admin, sin cambios
  });
});

describe("auditoría de tienda", () => {
  it("sin URL entrega el informe de ejemplo, marcado como ejemplo, y lo guarda", async () => {
    const r = (
      await call<{ report: { source: string; score: number; evaluated: number; total: number } }>(
        "POST",
        "/api/audits/run",
        { kind: "seo" },
      )
    ).json.report;
    expect(r.source).toBe("sample");
    expect(r.evaluated).toBeLessThan(r.total);
    const got = (
      await call<{ seo: { source: string } | null; diseno: unknown }>("GET", "/api/audits")
    ).json;
    expect(got.seo?.source).toBe("sample");
    expect(got.diseno).toBeNull();
  });
  it("auditar una URL real está apagado por defecto y no se puede usar para tocar la red interna", async () => {
    const off = await call<{ message: string }>("POST", "/api/audits/run", {
      kind: "seo",
      url: "https://example.com",
    });
    expect(off.status).toBe(403);
    process.env.TRAXO_AUDIT_LIVE = "1";
    try {
      const internal = await call<{ message: string }>("POST", "/api/audits/run", {
        kind: "seo",
        url: "http://169.254.169.254/latest/meta-data",
      });
      expect(internal.status).toBe(400);
      expect(internal.json.message).toContain("internas");
    } finally {
      process.env.TRAXO_AUDIT_LIVE = undefined as unknown as string;
      delete process.env.TRAXO_AUDIT_LIVE;
    }
  });
});

describe("campañas: asistente, creativos y lanzamiento simulado", () => {
  it("sugiere copy dentro de los límites con datos reales del producto y lo guarda como borrador", async () => {
    await importStore();
    const products = (await call<Array<{ id: string }>>("GET", "/api/products")).json;
    const s = (
      await call<{
        ok: boolean;
        copy: unknown;
        utmCampaign: string;
        credits: { total: number };
        productId: string;
      }>("POST", "/api/campaigns/suggest", {
        productId: products[0]?.id,
        platform: "meta",
        objective: "ventas",
        dailyBudget: 40000,
      })
    ).json;
    expect(s.ok).toBe(true);
    expect(s.credits.total).toBeGreaterThan(0);
    const saved = await call<{ ok: boolean; id: string }>("POST", "/api/campaigns", {
      platform: "meta",
      productTitle: "Café",
      dailyBudget: 40000,
      audience: { cities: [] },
      copy: s.copy,
      utmCampaign: s.utmCampaign,
      creatives: [{ kind: "image", prompt: "Foto de producto con luz natural" }],
    });
    expect(saved.json.ok).toBe(true);
    const id = saved.json.id;
    // Higgsfield: sin confirmar solo cotiza.
    const quote = (
      await call<{ quote?: boolean; credits: number }>(
        "POST",
        `/api/campaigns/${id}/creatives/generate`,
        {},
      )
    ).json;
    expect(quote.quote).toBe(true);
    expect(quote.credits).toBe(6);
    const done = (
      await call<{ simulated: boolean }>("POST", `/api/campaigns/${id}/creatives/generate`, {
        confirm: true,
      })
    ).json;
    expect(done.simulated).toBe(true);
    // Lanzar: queda en pausa, nunca activa.
    const l = (
      await call<{ status: string; simulated: boolean }>("POST", `/api/campaigns/${id}/launch`)
    ).json;
    expect(l).toMatchObject({ status: "PAUSED", simulated: true });
    expect((await db.prisma.campaignDraft.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PAUSED",
    );
  });
  it("no deja operar borradores de otra cuenta", async () => {
    const admin = await db.prisma.campaignDraft.create({
      data: {
        id: "cmp_x",
        storeId: rt.storeId,
        platform: "meta",
        product: "X",
        payload: { creatives: [] },
      },
    });
    expect((await call("POST", `/api/campaigns/${admin.id}/launch`)).status).toBe(404);
  });
});

describe("audiencias, mensajes y datos del cliente", () => {
  it("las audiencias y los mensajes solo cuentan a quien dio consentimiento y no pidió la baja", async () => {
    await importStore();
    const all = await db.prisma.customer.findMany({ where: { storeId: { not: rt.storeId } } });
    // Todos con una compra reciente y pedidos antiguos → mezclamos consentimientos.
    for (const [i, c] of all.entries())
      await db.prisma.customer.update({
        where: { id: c.id },
        data: { whatsappConsent: i % 2 === 0 },
      });
    await db.prisma.order.updateMany({
      where: { storeId: { not: rt.storeId } },
      data: { createdAt: new Date(Date.now() - 80 * 86_400_000) },
    });
    const consented = all.filter((_, i) => i % 2 === 0).length;
    const a = (
      await call<{ ok: boolean; audience: { size: number } }>("POST", "/api/audiences", {
        segment: "inactivo",
      })
    ).json;
    expect(a.audience.size).toBeLessThanOrEqual(consented);
    expect(a.audience.size).toBeGreaterThan(0);
    const preview = (
      await call<{ preview: boolean; recipients: number; excluded: number }>(
        "POST",
        "/api/broadcasts",
        { segment: "inactivo", text: "Hola, te extrañamos. Mira lo nuevo." },
      )
    ).json;
    expect(preview.preview).toBe(true);
    expect(preview.recipients).toBe(a.audience.size);
    expect(preview.excluded).toBeGreaterThan(0);
    const sent = (
      await call<{ sent: number; simulated: boolean }>("POST", "/api/broadcasts", {
        segment: "inactivo",
        text: "Hola, te extrañamos. Mira lo nuevo.",
        confirm: true,
      })
    ).json;
    expect(sent.sent).toBe(preview.recipients);
    expect(sent.simulated).toBe(true);
    expect(
      (rt.messaging as unknown as { sent: Array<{ text: string }> }).sent.every((m) =>
        m.text.includes("BAJA"),
      ),
    ).toBe(true);
  });
  it("exportar y borrar datos de un cliente (Ley 1581)", async () => {
    await importStore();
    const cu = await db.prisma.customer.findFirstOrThrow({
      where: { storeId: { not: rt.storeId } },
      include: { orders: true },
    });
    const exp = (
      await call<{ customer: { name: string; orders: unknown[] } }>(
        "GET",
        `/api/customers/${cu.id}/export`,
      )
    ).json;
    expect(exp.customer.name).toBe(cu.name);
    const del = (await call<{ ok: boolean }>("DELETE", `/api/customers/${cu.id}`)).json;
    expect(del.ok).toBe(true);
    const after = await db.prisma.customer.findUniqueOrThrow({
      where: { id: cu.id },
      include: { orders: true },
    });
    expect(after.name).toBe("Cliente eliminado");
    expect(after.email).toBeNull();
    for (const o of after.orders)
      expect((o.address as { name: string; phone: string }).phone).toBe("");
  });
  it("un cliente de otra tienda no se puede exportar ni borrar", async () => {
    const other = await db.prisma.customer.findFirstOrThrow({ where: { storeId: rt.storeId } });
    expect((await call("GET", `/api/customers/${other.id}/export`)).status).toBe(404);
    expect((await call("DELETE", `/api/customers/${other.id}`)).status).toBe(404);
  });
});

describe("envíos y reportes", () => {
  it("cancelar y programar recogida solo cuando corresponde", async () => {
    const made = (
      await call<{ outcome: { trackingNumber: string } }>("POST", "/api/demo/order", {
        dane: "66001",
      })
    ).json;
    const tn = made.outcome.trackingNumber;
    expect((await call("POST", `/api/shipments/${tn}/pickup`)).status).toBe(200);
    expect((await call("POST", `/api/shipments/${tn}/pickup`)).status).toBe(400); // ya no está "recién creada"
    expect((await call("POST", `/api/shipments/${tn}/cancel`)).status).toBe(200);
    const list = (
      await call<Array<{ trackingNumber: string; status: string }>>("GET", "/api/shipments")
    ).json;
    expect(list.find((s) => s.trackingNumber === tn)?.status).toBe("cancelled");
    expect((await call("POST", `/api/shipments/${tn}/cancel`)).status).toBe(400);
  });
  it("atribución: ROAS solo con gasto conocido; sin gasto dice N/A", async () => {
    await call("POST", "/api/demo/order", { dane: "66001" });
    await db.prisma.campaignDraft.create({
      data: {
        id: "cmp_a",
        storeId: (await db.prisma.store.findFirstOrThrow({ where: { name: "Tienda de Ana" } })).id,
        platform: "meta",
        product: "Café",
        payload: { utmCampaign: "cafe-meta-2610" },
      },
    });
    const r = (
      await call<{
        campaigns: Array<{ roas: number | null; spend: number | null }>;
        sources: unknown[];
      }>("GET", "/api/reports/attribution")
    ).json;
    expect(r.campaigns[0]?.spend).toBeNull();
    expect(r.campaigns[0]?.roas).toBeNull();
    expect(r.sources.length).toBeGreaterThan(0);
  });
  it("el reporte logístico agrupa por transportadora y no inventa cuándo consigna el recaudo", async () => {
    await call("POST", "/api/demo/order", { dane: "76001" });
    const r = (
      await call<{ carriers: Array<{ shipments: number; codInTransit: number }>; note: string }>(
        "GET",
        "/api/reports/logistics",
      )
    ).json;
    expect(r.carriers[0]?.shipments).toBe(1);
    expect(r.carriers[0]?.codInTransit).toBeGreaterThan(0);
    expect(r.note).toContain("N/A");
  });
  it("las plantillas se muestran con el texto real", async () => {
    const t = (await call<Array<{ name: string; text: string }>>("GET", "/api/templates")).json;
    expect(t.map((x) => x.name)).toEqual(
      expect.arrayContaining(["confirmar_contraentrega", "llega_hoy"]),
    );
  });
});

describe("webhook de tracking de Envia.com", () => {
  const send = (secret: string | undefined, body: object, id = "w1") => {
    const raw = JSON.stringify(body);
    const ts = "1760000000000";
    const sig = `v1=${createHmac("sha256", secret ?? "x")
      .update(`${ts}.tracking.simple.${raw}`)
      .digest("hex")}`;
    return app.request("/webhooks/carriers/envia-com", {
      method: "POST",
      body: raw,
      headers: {
        "x-webhook-signature": sig,
        "x-webhook-timestamp": ts,
        "x-webhook-event": "tracking.simple",
        "x-webhook-id": id,
      },
    });
  };
  it("sin secreto configurado rechaza; con firma válida actualiza la guía y no repite", async () => {
    const made = (
      await call<{ outcome: { trackingNumber: string } }>("POST", "/api/demo/order", {
        dane: "66001",
      })
    ).json;
    const tn = made.outcome.trackingNumber;
    expect((await send("s3", { data: { tracking_number: tn, status: "Entregado" } })).status).toBe(
      401,
    );
    process.env.ENVIA_WEBHOOK_SECRET = "s3";
    try {
      expect(
        (await send("otro", { data: { tracking_number: tn, status: "Entregado" } })).status,
      ).toBe(401);
      const ok = await send("s3", {
        data: {
          tracking_number: tn,
          status: "Entregado",
          status_description: "Entregado al destinatario",
          location: "Pereira",
        },
      });
      expect(ok.status).toBe(200);
      expect(
        (
          (await (
            await send("s3", { data: { tracking_number: tn, status: "Entregado" } })
          ).json()) as { duplicate?: boolean }
        ).duplicate,
      ).toBe(true);
      const s = await db.prisma.shipment.findFirstOrThrow({ where: { trackingNumber: tn } });
      expect(s.status).toBe("delivered");
    } finally {
      delete process.env.ENVIA_WEBHOOK_SECRET;
    }
  });
});

describe("aislamiento de eventos entre cuentas", () => {
  it("nada de lo que hace una cuenta nueva aparece en el feed del admin", async () => {
    const admin =
      (
        await app.request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: "admin@traxo.demo", password: "traxo-demo" }),
          headers: { "content-type": "application/json" },
        })
      ).headers
        .get("set-cookie")
        ?.split(";")[0] ?? "";
    const feed = async () =>
      (
        (await (
          await app.request("/api/events", { headers: { cookie: admin } })
        ).json()) as unknown[]
      ).length;
    const before = await feed();
    await importStore();
    await call("POST", "/api/audits/run", { kind: "seo" });
    const s = (
      await call<{ copy: unknown }>("POST", "/api/campaigns/suggest", {
        productId: (await call<Array<{ id: string }>>("GET", "/api/products")).json[0]?.id,
        platform: "meta",
        dailyBudget: 30000,
      })
    ).json;
    const saved = (
      await call<{ id: string }>("POST", "/api/campaigns", {
        platform: "meta",
        productTitle: "Café",
        dailyBudget: 30000,
        audience: { cities: [] },
        copy: s.copy,
        creatives: [],
      })
    ).json;
    await call("POST", `/api/campaigns/${saved.id}/launch`);
    await call("POST", "/api/demo/order", { dane: "66001", scenario: "risky" });
    await call("POST", "/api/audiences", { segment: "nuevo" });
    expect(await feed()).toBe(before);
    // y sí aparecen en el suyo
    const mine = (await call<Array<{ kind: string }>>("GET", "/api/events")).json.map(
      (e) => e.kind,
    );
    for (const k of ["store.imported", "audit.done", "marketing.draft"])
      expect(mine, k).toContain(k);
  });
});
