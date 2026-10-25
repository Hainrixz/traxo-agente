// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHash } from "node:crypto";
import { buildDemoOrder, type MockCommerce } from "@traxo/commerce";
import { type Db, openDb, saveOrder, setSettings } from "@traxo/db";
import { WompiPayments } from "@traxo/payments";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleNewOrder } from "../src/agent.ts";
import { createApp } from "../src/app.ts";
import { markPaid } from "../src/confirmation.ts";
import { handleInbound } from "../src/inbound.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";

let db: Db;
let rt: Runtime;
const SECRET = "eventos-secretos";

beforeEach(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  // Wompi con la API simulada: el link se crea con un id conocido.
  rt.payments = new WompiPayments({
    privateKey: "prv_test",
    eventsSecret: SECRET,
    fetch: (async () =>
      new Response(JSON.stringify({ data: { id: "link_abc" } }), { status: 201 })) as typeof fetch,
  });
  await setSettings(db, rt.storeId, { confirmCod: "all", prepaidDiscountPct: 5 });
});
afterEach(async () => db.close());

const signed = (status: string, link = "link_abc") => {
  const data = { transaction: { id: "t1", status, payment_link_id: link } };
  const timestamp = 1_700_000_000;
  const properties = ["transaction.id", "transaction.status"];
  const checksum = createHash("sha256").update(`t1${status}${timestamp}${SECRET}`).digest("hex");
  return { event: "transaction.updated", data, timestamp, signature: { properties, checksum } };
};

async function awaitingPayment() {
  const o = buildDemoOrder({ dane: "66001", payment: "cod" });
  (rt.commerce as MockCommerce).receive(o);
  const { order } = await saveOrder(db, o);
  await handleNewOrder(rt, order);
  await handleInbound(rt, {
    from: order.address.phone,
    text: "Pagar ahora",
    at: new Date().toISOString(),
  });
  return order;
}

describe("webhook de pagos de Wompi", () => {
  const appOf = () =>
    createApp({
      db,
      bus: rt.bus,
      commerce: rt.commerceMap,
      payments: rt.payments as never,
      onPaymentApproved: async (link) => {
        const row = await db.prisma.order.findFirst({ where: { paymentLinkId: link } });
        if (!row) return false;
        await markPaid(rt, row.id);
        return true;
      },
    });
  const post = (app: ReturnType<typeof appOf>, body: unknown) =>
    app.request("/webhooks/payments/wompi", { method: "POST", body: JSON.stringify(body) });
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it("un pago aprobado y bien firmado deja el pedido prepagado y genera la guía", async () => {
    const o = await awaitingPayment();
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).paymentLinkId).toBe(
      "link_abc",
    );
    const r = await post(appOf(), signed("APPROVED"));
    expect(r.status).toBe(200);
    await settle();
    const row = await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.payment).toBe("prepaid");
    expect(await db.prisma.shipment.count()).toBe(1);
  });

  it("rechaza firmas falsas, ignora pagos no aprobados y no cobra dos veces el mismo evento", async () => {
    const o = await awaitingPayment();
    const app = appOf();
    const falso = signed("APPROVED");
    falso.signature.checksum = "0".repeat(64);
    expect((await post(app, falso)).status).toBe(401);
    expect((await post(app, signed("DECLINED"))).status).toBe(200);
    await settle();
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).payment).toBe("cod");
    expect((await post(app, signed("APPROVED"))).status).toBe(200);
    expect(await (await post(app, signed("APPROVED"))).json()).toMatchObject({ duplicate: true });
    await settle();
    expect(await db.prisma.shipment.count()).toBe(1);
  });

  it("sin Wompi conectado la ruta no existe", async () => {
    const app = createApp({ db, bus: rt.bus, commerce: rt.commerceMap });
    expect((await post(app, signed("APPROVED"))).status).toBe(404);
  });
});
