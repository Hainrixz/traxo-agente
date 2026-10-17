import { hmac, ShopifyCommerce, shopifyOrder } from "@traxo/commerce";
import { EventBus } from "@traxo/core";
import { type Db, openDb, seedDemo } from "@traxo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

let db: Db;
beforeAll(async () => {
  db = await openDb({ dataDir: "memory://" });
  await seedDemo(db);
});
afterAll(async () => db.close());

describe("webhook de pedidos → BD", () => {
  const secret = "whsec";
  const build = () => {
    const bus = new EventBus();
    const received: string[] = [];
    bus.subscribe((e) => received.push(e.kind));
    const seen: string[] = [];
    const app = createApp({
      db,
      bus,
      commerce: {
        shopify: new ShopifyCommerce({
          storeId: "store_demo",
          domain: "d",
          adminToken: "t",
          webhookSecret: secret,
        }),
      },
      onOrder: (o) => {
        seen.push(o.number);
      },
    });
    return { app, received, seen };
  };
  const post = (app: ReturnType<typeof build>["app"], body: string, sig: string, id: string) =>
    app.request("/webhooks/commerce/shopify", {
      method: "POST",
      body,
      headers: {
        "x-shopify-hmac-sha256": sig,
        "x-shopify-topic": "orders/create",
        "x-shopify-webhook-id": id,
      },
    });

  it("rechaza firmas inválidas con 401", async () => {
    const { app } = build();
    const res = await post(app, JSON.stringify(shopifyOrder), "firma-falsa", "w0");
    expect(res.status).toBe(401);
  });

  it("guarda el pedido, crea al cliente y emite el evento", async () => {
    const { app, received, seen } = build();
    const raw = JSON.stringify(shopifyOrder);
    const res = await post(app, raw, hmac(secret, raw, "base64"), "w1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { created: boolean };
    expect(json.created).toBe(true);
    expect(received).toContain("order.received");
    expect(seen).toEqual(["#1042"]);
    const row = await db.prisma.order.findFirst({ where: { number: "#1042" } });
    expect(row?.payment).toBe("cod");
    expect(await db.prisma.customer.count({ where: { phone: "+573001234567" } })).toBe(1);
  });

  it("un reintento del mismo webhook no duplica el pedido", async () => {
    const { app, seen } = build();
    const raw = JSON.stringify(shopifyOrder);
    const sig = hmac(secret, raw, "base64");
    const again = await post(app, raw, sig, "w1");
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    // Mismo pedido con otro id de entrega: la BD tampoco lo duplica.
    const third = await post(app, raw, sig, "w2");
    expect(((await third.json()) as { created: boolean }).created).toBe(false);
    expect(seen).toEqual([]);
    expect(await db.prisma.order.count({ where: { number: "#1042" } })).toBe(1);
  });
});

describe("webhook de mensajería → agente", () => {
  it("rechaza firma inválida y atiende un mensaje firmado una sola vez", async () => {
    const { ZernioMessaging } = await import("@traxo/messaging");
    const { createHmac } = await import("node:crypto");
    const got: string[] = [];
    const app = createApp({
      db,
      bus: new EventBus(),
      commerce: {},
      messaging: new ZernioMessaging({ apiKey: "k", webhookSecret: "ws" }),
      onInbound: (m) => {
        got.push(m.text);
      },
    });
    const raw = JSON.stringify({
      event: "message.received",
      message: { from: "573001234567", text: "Sí" },
    });
    const sig = createHmac("sha256", "ws").update(raw).digest("hex");
    expect(
      (
        await app.request("/webhooks/messaging", {
          method: "POST",
          body: raw,
          headers: { "x-zernio-signature": "mala" },
        })
      ).status,
    ).toBe(401);
    const h = { "x-zernio-signature": sig, "x-zernio-event-id": "evt_1" };
    expect(
      (await app.request("/webhooks/messaging", { method: "POST", body: raw, headers: h })).status,
    ).toBe(200);
    const again = await app.request("/webhooks/messaging", {
      method: "POST",
      body: raw,
      headers: h,
    });
    expect(((await again.json()) as { duplicate?: boolean }).duplicate).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(got).toEqual(["Sí"]);
  });
});

describe("protección de la API", () => {
  it("con token exige Bearer o ?token y deja pasar webhooks y health", async () => {
    const { Hono } = await import("hono");
    const { protectApi } = await import("../src/api.ts");
    const app = new Hono();
    protectApi(app, "t0k");
    app.get("/api/x", (c) => c.json({ ok: true }));
    app.get("/health", (c) => c.json({ ok: true }));
    expect((await app.request("/api/x")).status).toBe(401);
    expect((await app.request("/api/x", { headers: { authorization: "Bearer mal" } })).status).toBe(
      401,
    );
    expect((await app.request("/api/x", { headers: { authorization: "Bearer t0k" } })).status).toBe(
      200,
    );
    expect((await app.request("/api/x?token=t0k")).status).toBe(200);
    expect((await app.request("/health")).status).toBe(200);
  });
});
