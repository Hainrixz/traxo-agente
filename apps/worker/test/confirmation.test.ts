// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { buildDemoOrder, type MockCommerce } from "@traxo/commerce";
import { type Db, openDb, saveOrder, setSettings } from "@traxo/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleNewOrder } from "../src/agent.ts";
import { approve, reject } from "../src/approvals.ts";
import { checkConfirmationTimeouts, markPaid } from "../src/confirmation.ts";
import { handleInbound } from "../src/inbound.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";

let db: Db;
let rt: Runtime;
let events: string[];
const sent = () =>
  (rt.messaging as unknown as { sent: Array<{ text: string }> }).sent.map((m) => m.text);

beforeEach(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  events = [];
  rt.bus.subscribe((e) => events.push(e.kind));
  await setSettings(db, rt.storeId, { confirmCod: "all", prepaidDiscountPct: 5 });
});
afterEach(async () => db.close());

async function newOrder(over: Parameters<typeof buildDemoOrder>[0] = {}) {
  const o = buildDemoOrder({ dane: "66001", payment: "cod", ...over });
  (rt.commerce as MockCommerce).receive(o);
  return (await saveOrder(db, o)).order;
}
const reply = (order: { address: { phone: string } }, text: string) =>
  handleInbound(rt, { from: order.address.phone, text, at: new Date().toISOString() });
const shipments = () => db.prisma.shipment.count();

describe("confirmación de contraentrega por WhatsApp", () => {
  it("con confirmCod = all no genera guía: pide confirmar y ofrece pagar ahora con descuento", async () => {
    const o = await newOrder();
    const out = await handleNewOrder(rt, o);
    expect(out.status).toBe("awaiting_confirmation");
    expect(await shipments()).toBe(0);
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
      "awaiting_confirmation",
    );
    expect(sent()[0]).toMatch(/Pagas \$ [\d.]+ al recibir/);
    expect(sent()[0]).toContain("5 % de descuento");
    expect(events).toContain("confirmation.requested");
  });

  it("«Confirmo» desbloquea el envío y genera la guía", async () => {
    const o = await newOrder();
    await handleNewOrder(rt, o);
    const r = await reply(o, "Confirmo");
    expect(r.intent).toBe("confirm");
    expect(await shipments()).toBe(1);
    expect(events).toContain("confirmation.received");
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
      "shipped",
    );
  });

  it("pagar ahora: manda el link, al pagar el pedido pasa a prepagado con descuento y se envía sin comisión de recaudo", async () => {
    const o = await newOrder();
    await handleNewOrder(rt, o);
    expect((await reply(o, "Pagar ahora (-5 %)")).intent).toBe("pay");
    expect(sent().some((t) => t.includes("pago.traxo.invalid"))).toBe(true);
    expect(await shipments()).toBe(0);
    const out = await markPaid(rt, o.id);
    expect(out?.status).toBe("shipped");
    const row = await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(row.payment).toBe("prepaid");
    expect(row.total).toBe(Math.round((o.total * 0.95) / 100) * 100);
    expect(
      (await db.prisma.carrierQuote.findFirstOrThrow({ where: { chosen: true } })).codCommission,
    ).toBe(0);
    expect(events).toEqual(expect.arrayContaining(["payment.link", "payment.received"]));
    expect(await markPaid(rt, o.id)).toBeUndefined(); // no se paga dos veces
  });

  it("cancelar: el pedido queda cancelado y no se gasta en ninguna guía", async () => {
    const o = await newOrder();
    await handleNewOrder(rt, o);
    expect((await reply(o, "Cancelar")).intent).toBe("cancel_order");
    expect(await shipments()).toBe(0);
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe(
      "cancelled",
    );
    expect(events).toContain("order.cancelled");
  });

  it("cambiar dirección: pide la nueva, la valida y sigue esperando la confirmación", async () => {
    const o = await newOrder();
    await handleNewOrder(rt, o);
    expect((await reply(o, "Cambiar dirección")).intent).toBe("address_ask");
    expect((await reply(o, "por el parque azul 123456")).intent).toBe("address_ask"); // no es una dirección usable
    expect((await reply(o, "Carrera 15 # 100-25 Cali")).intent).toBe("address_update");
    const row = await db.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect((row.address as { city: string; street: string }).city).toBe("Cali");
    expect(row.status).toBe("awaiting_confirmation");
    await reply(o, "Confirmo");
    expect(await shipments()).toBe(1);
  });

  it("una respuesta que no entiende se escala a una persona", async () => {
    const o = await newOrder();
    await handleNewOrder(rt, o);
    expect((await reply(o, "mmm quien eres")).intent).toBe("unknown");
    expect(await db.prisma.approval.count({ where: { kind: "unknown_reply" } })).toBe(1);
  });

  it("sin respuesta en 24 h: pide decidir; aprobar envía igual y rechazar cancela", async () => {
    const a = await newOrder();
    const b = await newOrder();
    await handleNewOrder(rt, a);
    await handleNewOrder(rt, b);
    expect(await checkConfirmationTimeouts(rt, 24 * 3_600_000, Date.now())).toBe(0);
    expect(await checkConfirmationTimeouts(rt, 24 * 3_600_000, Date.now() + 25 * 3_600_000)).toBe(
      2,
    );
    expect(await checkConfirmationTimeouts(rt, 24 * 3_600_000, Date.now() + 25 * 3_600_000)).toBe(
      0,
    ); // no duplica
    const ap = await db.prisma.approval.findMany({ where: { kind: "no_response" } });
    const forA = ap.find((x) => x.orderId === a.id);
    const forB = ap.find((x) => x.orderId === b.id);
    expect((await approve(rt, forA?.id ?? "")).message).toContain("sin confirmación");
    expect(await shipments()).toBe(1);
    await reject(rt, forB?.id ?? "");
    expect((await db.prisma.order.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(
      "cancelled",
    );
  });

  it("confirmCod = risky solo confirma lo riesgoso; el cliente recurrente que siempre recibió pasa directo", async () => {
    await setSettings(db, rt.storeId, { confirmCod: "risky", riskThreshold: 40 });
    const risky = await newOrder({ seed: 5 });
    await db.prisma.order.update({ where: { id: risky.id }, data: { total: 320000 } });
    const out1 = await handleNewOrder(rt, {
      ...risky,
      total: 320000,
      address: { ...risky.address, street: "por el parque" },
    });
    expect(out1.status).toBe("needs_address"); // la dirección vaga se frena antes de preguntar
    const big = await newOrder({ seed: 6 });
    expect((await handleNewOrder(rt, { ...big, total: 320000 })).status).toBe(
      "awaiting_confirmation",
    );
    const cheap = await newOrder({ seed: 7 });
    for (let i = 0; i < 3; i++) {
      const prev = await newOrder({ seed: 20 + i });
      await db.prisma.order.update({
        where: { id: prev.id },
        data: { status: "delivered", customerId: cheap.customerId },
      });
    }
    expect((await handleNewOrder(rt, { ...cheap, total: 60000 })).status).toBe("shipped");
  });

  it("los pedidos prepagados nunca piden confirmación", async () => {
    expect((await handleNewOrder(rt, await newOrder({ payment: "prepaid" }))).status).toBe(
      "shipped",
    );
  });
});

describe("baja de mensajes (Ley 1581)", () => {
  it("«BAJA» saca al cliente de las campañas, lo confirma y no se vuelve a escribir en campañas", async () => {
    const o = await newOrder();
    await db.prisma.customer.update({
      where: { id: o.customerId ?? "" },
      data: { whatsappConsent: true },
    });
    const r = await reply(o, "BAJA");
    expect(r.intent).toBe("opt_out");
    const c = await db.prisma.customer.findUniqueOrThrow({ where: { id: o.customerId ?? "" } });
    expect(c.whatsappConsent).toBe(false);
    expect(c.optOutAt).not.toBeNull();
    expect(sent().at(-1)).toContain("no te escribiremos más");
  });
});
