import { zoneFor } from "@traxo/carriers";
import { formatCOP, type Order, type RiskResult, riskScore, type StoreSettings } from "@traxo/core";
import { createApproval, orderFromRow, storeNameOf } from "@traxo/db";
import { addressLooksComplete, findCity, normalizeStreet } from "@traxo/geo-co";
import { render } from "@traxo/messaging";
import { MockPayments } from "@traxo/payments";
import {
  type AgentDeps,
  handleNewOrder,
  type OrderOutcome,
  recordInbound,
  recordMessage,
} from "./agent.ts";

const CANCEL = /^(cancelar|cancela|anular|no quiero|ya no|no lo quiero)/i;
const PAY = /(pagar|pago|prepago|descuento|link|ahora)/i;
const CHANGE = /(cambiar direcci|otra direcci|nueva direcci|cambiar la direcci)/i;
const CONFIRM = /^(confirmo|s[ií]\b|dale|ok\b|listo|claro|de una|perfecto|correcto|confirmado)/i;

/** Riesgo de una contraentrega, con el historial real del cliente en esta tienda. */
export async function riskFor(
  deps: AgentDeps,
  order: Order,
  settings: StoreSettings,
): Promise<RiskResult> {
  let history: { delivered: number; returned: number; cancelled: number } | undefined;
  if (order.customerId) {
    const prev = await deps.db.prisma.order.findMany({
      where: { customerId: order.customerId, id: { not: order.id } },
      select: { status: true, shipments: { select: { status: true } } },
    });
    history = { delivered: 0, returned: 0, cancelled: 0 };
    for (const p of prev) {
      if (p.status === "cancelled") history.cancelled++;
      else if (p.shipments.some((s) => s.status === "returned" || s.status === "returning"))
        history.returned++;
      else if (p.status === "delivered") history.delivered++;
    }
  }
  return riskScore(order, {
    history,
    farCity: zoneFor(settings.originDane, order.address.dane) === "lejano",
  });
}

export function needsConfirmation(
  settings: StoreSettings,
  order: Order,
  risk: RiskResult,
): boolean {
  if (order.payment !== "cod") return false;
  if (settings.confirmCod === "all") return true;
  return settings.confirmCod === "risky" && risk.score >= settings.riskThreshold;
}

/** Monto si el cliente cambia a pagar ahora (sin la comisión de recaudo), redondeado a $ 100. */
export const prepaidAmount = (
  order: Pick<Order, "total">,
  settings: Pick<StoreSettings, "prepaidDiscountPct">,
): number => Math.round((order.total * (1 - settings.prepaidDiscountPct / 100)) / 100) * 100;

const say = async (
  deps: AgentDeps,
  order: Order,
  text: string,
  template?: Parameters<typeof recordMessage>[3],
) => {
  const sent = await deps.messaging.send({
    to: order.address.phone,
    text,
    idempotencyKey: `${order.id}:${Date.now()}:${text.length}`,
  });
  await recordMessage(deps.db, order, text, template, sent.simulated);
};

export async function requestConfirmation(
  deps: AgentDeps,
  order: Order,
  settings: StoreSettings,
  risk: RiskResult,
): Promise<OrderOutcome> {
  const { db, bus } = deps;
  await db.prisma.order.update({
    where: { id: order.id },
    data: { status: "awaiting_confirmation", confirmAt: new Date() },
  });
  if (!order.address.phone.startsWith("+57")) {
    await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "no_response",
      title: `Confirma por otro medio ${order.number}`,
      detail: `No tengo un celular válido de ${order.address.name} para confirmar la contraentrega (riesgo ${risk.score}/100).`,
      payload: { orderId: order.id },
    });
    bus.emit(
      "approval.requested",
      `No pude pedirle confirmación a ${order.address.name}: el pedido ${order.number} no trae un celular válido.`,
      { orderId: order.id },
    );
    return { status: "awaiting_confirmation", risk: risk.score };
  }
  const pct = settings.prepaidDiscountPct;
  const prepaid = prepaidAmount(order, settings);
  const store = await storeNameOf(db, order.storeId, deps.storeName);
  const text = render("confirmar_contraentrega", {
    nombre: order.address.name,
    tienda: store,
    monto: order.total,
    descuentoPct: pct || undefined,
    montoPrepago: pct ? prepaid : undefined,
  });
  const buttons = [
    "Confirmo",
    ...(pct ? [`Pagar ahora (-${pct} %)`] : []),
    "Cambiar dirección",
    "Cancelar",
  ];
  const sent = await deps.messaging.send({
    to: order.address.phone,
    text,
    buttons,
    template: {
      name: "confirmar_contraentrega",
      params: [order.address.name, formatCOP(order.total)],
    },
    idempotencyKey: `${order.id}:confirmar`,
  });
  await recordMessage(db, order, text, "confirmar_contraentrega", sent.simulated);
  bus.emit(
    "confirmation.requested",
    `El pedido ${order.number} tiene riesgo ${risk.level} (${risk.score}/100): ${risk.reasons[1] ?? risk.reasons[0]} Antes de gastar en una guía, le pedí a ${order.address.name} que confirme por WhatsApp.${sent.simulated ? " (mensaje simulado)" : ""}`,
    { orderId: order.id, data: { risk } },
  );
  return { status: "awaiting_confirmation", risk: risk.score };
}

async function proceed(deps: AgentDeps, orderId: string): Promise<OrderOutcome> {
  await deps.db.prisma.order.update({ where: { id: orderId }, data: { status: "confirmed" } });
  const row = await deps.db.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  return handleNewOrder(deps, orderFromRow(row), { skipConfirmation: true });
}

export async function cancelOrder(deps: AgentDeps, order: Order, why: string): Promise<void> {
  await deps.db.prisma.order.update({ where: { id: order.id }, data: { status: "cancelled" } });
  const store = await storeNameOf(deps.db, order.storeId, deps.storeName);
  deps.bus.emit(
    "order.cancelled",
    `Cancelé ${order.number}: ${why}. No generé ninguna guía, así que no gasté en envío.`,
    { orderId: order.id },
  );
  if (order.address.phone.startsWith("+57"))
    await say(
      deps,
      order,
      render("pedido_cancelado", { nombre: order.address.name, tienda: store }),
      "pedido_cancelado",
    );
}

export type ConfirmationIntent =
  | "confirm"
  | "pay"
  | "cancel_order"
  | "address_update"
  | "address_ask"
  | "unknown";

/** Atiende lo que responde el cliente cuando está pendiente la confirmación de su contraentrega. */
export async function handleConfirmationReply(
  deps: AgentDeps,
  order: Order,
  text: string,
): Promise<ConfirmationIntent> {
  const { db, bus } = deps;
  const t = text.trim();
  const settings = (await import("@traxo/db")).getSettings;
  const s = await settings(db, order.storeId);

  if (CANCEL.test(t)) {
    await cancelOrder(deps, order, `${order.address.name} no quiere el pedido`);
    return "cancel_order";
  }
  if (PAY.test(t) && !CONFIRM.test(t)) {
    const prepaid = prepaidAmount(order, s);
    const link = await (deps.payments ?? new MockPayments()).createLink({
      orderId: order.number,
      amount: prepaid,
      description: `Pedido ${order.number}`,
    });
    await db.prisma.order.update({ where: { id: order.id }, data: { paymentLinkId: link.id } });
    await say(
      deps,
      order,
      `Aquí tienes tu link de pago con ${s.prepaidDiscountPct} % de descuento (${formatCOP(prepaid)}): ${link.url}`,
    );
    bus.emit(
      "payment.link",
      `${order.address.name} quiere pagar ahora ${order.number}: le mandé el link por ${formatCOP(prepaid)} (${s.prepaidDiscountPct} % de descuento).${link.simulated ? " (link simulado)" : ""}`,
      { orderId: order.id, data: { url: link.url, amount: prepaid } },
    );
    return "pay";
  }
  if (CHANGE.test(t)) {
    await say(
      deps,
      order,
      "Claro. Escríbeme la dirección completa (vía y número, barrio y ciudad) y la actualizo.",
    );
    return "address_ask";
  }
  if (/\d/.test(t) && t.length > 8 && !CONFIRM.test(t)) {
    const city = findCity(t) ?? findCity(order.address.city);
    const street = normalizeStreet(t);
    if (!city || !addressLooksComplete(street)) {
      await say(
        deps,
        order,
        "No logré entender la dirección. ¿Me la escribes con vía y número? Por ejemplo: Calle 10 # 4-45, Pereira.",
      );
      return "address_ask";
    }
    const address = {
      ...order.address,
      street,
      city: city.name,
      dane: city.dane,
      department: city.department,
    };
    await db.prisma.order.update({ where: { id: order.id }, data: { address } });
    await say(
      deps,
      { ...order, address },
      `Anoté tu dirección: ${street}, ${city.name}. ¿Confirmas el pedido? Responde «Confirmo».`,
    );
    bus.emit(
      "address.normalized",
      `${order.address.name} cambió la dirección de ${order.number}: ${street}, ${city.name}.`,
      { orderId: order.id },
    );
    return "address_update";
  }
  if (CONFIRM.test(t)) {
    bus.emit(
      "confirmation.received",
      `${order.address.name} confirmó ${order.number}. Sigo con el envío.`,
      { orderId: order.id },
    );
    await say(deps, order, "Perfecto, ya preparo tu envío. Te aviso cuando salga.");
    await proceed(deps, order.id);
    return "confirm";
  }
  await createApproval(db, {
    storeId: order.storeId,
    orderId: order.id,
    kind: "unknown_reply",
    title: `Respuesta que no entendí de ${order.address.name}`,
    detail: `Escribió: «${t}» al confirmar ${order.number}. Respóndele tú o dime cómo seguir.`,
    payload: { orderId: order.id },
  });
  bus.emit(
    "approval.requested",
    `No entendí la respuesta de ${order.address.name} a la confirmación de ${order.number} («${t}»). Te la paso.`,
    { orderId: order.id },
  );
  return "unknown";
}

/** Simula (o recibe del webhook de Wompi) el pago del link: el pedido pasa a prepagado y se envía sin comisión de recaudo. */
export async function markPaid(
  deps: AgentDeps,
  orderId: string,
): Promise<OrderOutcome | undefined> {
  const row = await deps.db.prisma.order.findUnique({ where: { id: orderId } });
  if (!row || row.status !== "awaiting_confirmation") return undefined;
  const order = orderFromRow(row);
  const s = await (await import("@traxo/db")).getSettings(deps.db, order.storeId);
  const amount = prepaidAmount(order, s);
  await deps.db.prisma.order.update({
    where: { id: order.id },
    data: { payment: "prepaid", total: amount, status: "confirmed" },
  });
  deps.bus.emit(
    "payment.received",
    `Recibí el pago de ${formatCOP(amount)} de ${order.number}. Ya no hay recaudo en riesgo: genero la guía.`,
    { orderId: order.id },
  );
  const store = await storeNameOf(deps.db, order.storeId, deps.storeName);
  if (order.address.phone.startsWith("+57"))
    await say(
      deps,
      order,
      render("pago_recibido", { nombre: order.address.name, tienda: store }),
      "pago_recibido",
    );
  const fresh = await deps.db.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  return handleNewOrder(deps, orderFromRow(fresh), { skipConfirmation: true });
}

/** Si el cliente no responde en `olderThanMs` (24 h por defecto), el agente te lo pasa en vez de esperar para siempre. */
export async function checkConfirmationTimeouts(
  deps: AgentDeps,
  olderThanMs = 24 * 3_600_000,
  now = Date.now(),
): Promise<number> {
  const stale = await deps.db.prisma.order.findMany({
    where: { status: "awaiting_confirmation", confirmAt: { lt: new Date(now - olderThanMs) } },
  });
  let n = 0;
  for (const row of stale) {
    const exists = await deps.db.prisma.approval.findFirst({
      where: { orderId: row.id, kind: "no_response", status: "pending" },
    });
    if (exists) continue;
    const order = orderFromRow(row);
    await createApproval(deps.db, {
      storeId: row.storeId,
      orderId: row.id,
      kind: "no_response",
      title: `${order.address.name} no confirmó ${row.number}`,
      detail: `Pasaron más de ${Math.round(olderThanMs / 3_600_000)} h sin respuesta. Puedes enviarlo igual (aprobar) o cancelarlo (rechazar).`,
      payload: { orderId: row.id },
    });
    deps.bus.emit(
      "approval.requested",
      `${order.address.name} no respondió la confirmación de ${row.number} en ${Math.round(olderThanMs / 3_600_000)} h. Te dejo decidir: enviarlo igual o cancelarlo.`,
      { orderId: row.id },
    );
    n++;
  }
  return n;
}

export { proceed as proceedAfterConfirmation, recordInbound };
