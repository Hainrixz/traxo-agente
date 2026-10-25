// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type CarrierProvider, type MockCarrierProvider, selectQuote } from "@traxo/carriers";
import type { CommerceAdapter } from "@traxo/commerce";
import {
  canAutoCreateShipment,
  type EventBus,
  formatCOP,
  newId,
  type Order,
  type Quote,
  type ShipmentDraft,
} from "@traxo/core";
import {
  addTrackingEvents,
  carrierReliability,
  createApproval,
  type Db,
  getSettings,
  orderFromRow,
  saveQuotes,
  saveShipment,
  storeNameOf,
} from "@traxo/db";
import { addressLooksComplete } from "@traxo/geo-co";
import { type MessagingProvider, render } from "@traxo/messaging";
import type { PaymentLinkProvider } from "@traxo/payments";
import { needsConfirmation, requestConfirmation, riskFor } from "./confirmation.ts";

export type AgentDeps = {
  db: Db;
  bus: EventBus;
  commerce: CommerceAdapter;
  carriers: CarrierProvider[];
  messaging: MessagingProvider;
  storeName: string;
  /** Links de pago para el prepago (simulado sin WOMPI_PRIVATE_KEY). */
  payments?: PaymentLinkProvider;
  /** Simuladores, para que la demo pueda avanzar las guías. */
  mocks?: MockCarrierProvider[];
};

export type OrderOutcome =
  | { status: "shipped"; trackingNumber: string; carrier: string }
  | { status: "needs_approval"; approvalId: string }
  | { status: "needs_address" }
  | { status: "awaiting_confirmation"; risk: number }
  | { status: "no_coverage" };

export function draftFor(order: Order, originDane: string): ShipmentDraft {
  const cod = order.payment === "cod" ? order.total : 0;
  return {
    orderId: order.id,
    origin: { dane: originDane },
    destination: order.address,
    weightGrams: order.lines.reduce((s, l) => s + l.weightGrams * l.quantity, 0),
    declaredValue: order.total,
    codAmount: cod,
    contents: order.lines
      .map((l) => `${l.quantity} x ${l.title}`)
      .join(", ")
      .slice(0, 120),
  };
}

/**
 * Flujo "pedido nuevo": valida la dirección → cotiza en todas las vías → elige → (según autonomía) genera la guía →
 * la escribe en la tienda → avisa al cliente. Cada paso emite un evento en primera persona para el feed.
 */
export async function handleNewOrder(
  deps: AgentDeps,
  order: Order,
  opts: { skipConfirmation?: boolean } = {},
): Promise<OrderOutcome> {
  const { db, bus } = deps;
  const settings = await getSettings(db, order.storeId);
  const ev = (
    kind: Parameters<EventBus["emit"]>[0],
    summary: string,
    data?: Record<string, unknown>,
  ) => bus.emit(kind, summary, { orderId: order.id, data });

  // 1) Dirección
  if (order.address.dane === "00000" || !addressLooksComplete(order.address.street)) {
    const why =
      order.address.dane === "00000"
        ? `No reconozco el municipio "${order.address.city}"`
        : `La dirección "${order.address.street}" parece incompleta`;
    const id = await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "address",
      title: `Dirección por confirmar en ${order.number}`,
      detail: `${why}. Necesito que se la confirmes al cliente antes de generar la guía.`,
      payload: { orderId: order.id },
    });
    ev(
      "approval.requested",
      `${why} en el pedido ${order.number}. Necesito que confirmes la dirección con ${order.address.name}.`,
      { approvalId: id },
    );
    return { status: "needs_address" };
  }
  ev(
    "address.normalized",
    `Normalicé la dirección de ${order.number}: ${order.address.street}, ${order.address.city}.`,
  );

  // 1b) Contraentrega de riesgo: se confirma con el cliente antes de gastar en una guía.
  if (!opts.skipConfirmation) {
    const risk = await riskFor(deps, order, settings);
    if (needsConfirmation(settings, order, risk))
      return requestConfirmation(deps, order, settings, risk);
  }

  // 2) Cotizar en todas las vías a la vez
  const draft = draftFor(order, settings.originDane);
  ev(
    "quotes.requested",
    `Cotizo el envío de ${order.number} a ${order.address.city} en ${deps.carriers.length} vías${draft.codAmount ? ` con recaudo de ${formatCOP(draft.codAmount)}` : ""}.`,
  );
  const settled = await Promise.allSettled(deps.carriers.map((c) => c.quote(draft)));
  const quotes: Quote[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") quotes.push(...r.value);
    else
      ev(
        "error",
        `${deps.carriers[i]?.label ?? "Una vía"} no pudo cotizar: ${(r.reason as Error).message}`,
      );
  });
  const reliability = await carrierReliability(db);
  const selection = selectQuote(quotes, { codAmount: draft.codAmount, settings, reliability });
  if (!selection) {
    ev(
      "approval.requested",
      `Nadie cubre ${order.address.city}${draft.codAmount ? " con contraentrega" : ""}. Te toca decidir cómo enviar ${order.number}.`,
    );
    await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "coverage",
      title: `Sin cobertura para ${order.number}`,
      detail: `Ninguna transportadora conectada llega a ${order.address.city}${draft.codAmount ? " con contraentrega" : ""}.`,
      payload: { orderId: order.id },
    });
    return { status: "no_coverage" };
  }
  ev(
    "quotes.received",
    `Recibí ${quotes.length} cotizaciones; ${selection.ranking.length} transportadoras distintas pueden llevarlo.`,
    {
      ranking: selection.ranking.map((q) => ({
        carrier: q.carrier,
        provider: q.provider,
        total: q.total,
        days: q.businessDays,
        score: q.score,
      })),
    },
  );
  const w = selection.winner;
  await saveQuotes(db, order.id, selection.ranking, `${w.provider}|${w.carrier}`);
  ev("carrier.selected", selection.explanation, {
    carrier: w.carrier,
    provider: w.provider,
    total: w.total,
  });

  // 3) Política de autonomía
  const policy = canAutoCreateShipment(settings, w);
  if (!policy.allowed) {
    const id = await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "shipment",
      title: `Aprobar guía de ${order.number} con ${w.carrier}`,
      detail: `${selection.explanation} ${policy.reason}`,
      payload: { orderId: order.id, provider: w.provider, carrier: w.carrier },
    });
    ev(
      "approval.requested",
      `Dejé lista la guía de ${order.number} con ${w.carrier} (${formatCOP(w.total)}). ${policy.reason}`,
      { approvalId: id },
    );
    return { status: "needs_approval", approvalId: id };
  }
  return createAndNotify(deps, order, draft, w);
}

/** Genera la guía con la vía ganadora, la escribe en la tienda y avisa al cliente. También sirve al aprobar. */
export async function createAndNotify(
  deps: AgentDeps,
  order: Order,
  draft: ShipmentDraft,
  chosen: Quote,
): Promise<OrderOutcome> {
  const { db, bus } = deps;
  const provider = deps.carriers.find((c) => c.id === chosen.provider);
  if (!provider) throw new Error(`La vía ${chosen.provider} ya no está conectada.`);
  const ev = (
    kind: Parameters<EventBus["emit"]>[0],
    summary: string,
    data?: Record<string, unknown>,
  ) => bus.emit(kind, summary, { orderId: order.id, data });

  const shipment = await provider.createShipment(draft, chosen);
  const shipmentId = await saveShipment(db, order.id, shipment);
  await addTrackingEvents(db, shipmentId, [
    { status: "created", description: "Guía generada", at: new Date().toISOString() },
  ]);
  ev(
    "shipment.created",
    `Generé la guía ${shipment.trackingNumber} con ${shipment.carrier} (${formatCOP(shipment.total)}).${shipment.simulated ? " Es una guía simulada." : ""}`,
    {
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      simulated: shipment.simulated,
    },
  );

  try {
    await deps.commerce.addFulfillment(order.externalId, {
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      url: shipment.trackUrl,
    });
    await deps.commerce.addNote(
      order.externalId,
      `Traxo: guía ${shipment.trackingNumber} con ${shipment.carrier}.`,
    );
    ev(
      "fulfillment.written",
      `Escribí la guía y el tracking en la tienda (${deps.commerce.platform}).`,
    );
  } catch (e) {
    ev("error", `Generé la guía, pero no pude escribirla en la tienda: ${(e as Error).message}`);
  }

  const phone = order.address.phone;
  if (phone.startsWith("+57")) {
    const text = render("pedido_en_camino", {
      nombre: order.address.name,
      tienda: await storeNameOf(deps.db, order.storeId, deps.storeName),
      guia: shipment.trackingNumber,
      transportadora: shipment.carrier,
      url: shipment.trackUrl,
      dias: chosen.businessDays,
    });
    const sent = await deps.messaging.send({
      to: phone,
      text,
      template: {
        name: "pedido_en_camino",
        params: [order.address.name, shipment.carrier, shipment.trackingNumber],
      },
      idempotencyKey: `${order.id}:pedido_en_camino`,
    });
    await recordMessage(deps.db, order, text, "pedido_en_camino", sent.simulated);
    ev(
      "message.sent",
      `Le avisé a ${order.address.name} por WhatsApp que su pedido va en camino.${sent.simulated ? " (mensaje simulado)" : ""}`,
    );
  }
  return { status: "shipped", trackingNumber: shipment.trackingNumber, carrier: shipment.carrier };
}

export async function recordMessage(
  db: Db,
  order: Order,
  text: string,
  template: string | undefined,
  simulated: boolean,
) {
  const customerId = (await db.prisma.order.findUnique({ where: { id: order.id } }))?.customerId;
  if (!customerId) return;
  let conv = await db.prisma.conversation.findFirst({
    where: { storeId: order.storeId, customerId },
  });
  if (!conv)
    conv = await db.prisma.conversation.create({
      data: { id: newId("conv"), storeId: order.storeId, customerId },
    });
  await db.prisma.message.create({
    data: {
      id: newId("msg"),
      conversationId: conv.id,
      direction: "out",
      text,
      template: template ?? null,
      simulated,
    },
  });
}

/** Busca un pedido por id interno, id de la tienda o número visible (#1042). */
export async function findOrder(db: Db, key: string, storeId?: string): Promise<Order | undefined> {
  const k = key.trim();
  const row =
    (await db.prisma.order.findFirst({ where: { id: k, ...(storeId ? { storeId } : {}) } })) ??
    (await db.prisma.order.findFirst({
      where: {
        OR: [{ externalId: k }, { number: k.startsWith("#") ? k : `#${k}` }],
        ...(storeId ? { storeId } : {}),
      },
    }));
  return row ? orderFromRow(row) : undefined;
}

/** Cotiza sin gastar nada: devuelve el ranking y la explicación. */
export async function quoteOrder(deps: AgentDeps, order: Order) {
  const settings = await getSettings(deps.db, order.storeId);
  const draft = draftFor(order, settings.originDane);
  const settled = await Promise.allSettled(deps.carriers.map((c) => c.quote(draft)));
  const quotes: Quote[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = settled.flatMap((r, i) =>
    r.status === "rejected" ? [`${deps.carriers[i]?.label}: ${(r.reason as Error).message}`] : [],
  );
  const selection = selectQuote(quotes, {
    codAmount: draft.codAmount,
    settings,
    reliability: await carrierReliability(deps.db),
  });
  return { draft, quotes, selection, failed, settings };
}

/** Genera la guía con la mejor opción. Lo llama una persona (con confirmación), así que no pasa por la política de autonomía. */
export async function shipOrder(
  deps: AgentDeps,
  order: Order,
): Promise<OrderOutcome | { status: "already_shipped"; trackingNumber: string }> {
  const existing = await deps.db.prisma.shipment.findFirst({
    where: { orderId: order.id, status: { not: "cancelled" } },
  });
  if (existing) return { status: "already_shipped", trackingNumber: existing.trackingNumber };
  const { draft, selection } = await quoteOrder(deps, order);
  if (!selection) return { status: "no_coverage" };
  await saveQuotes(
    deps.db,
    order.id,
    selection.ranking,
    `${selection.winner.provider}|${selection.winner.carrier}`,
  );
  deps.bus.emit("carrier.selected", selection.explanation, { orderId: order.id });
  return createAndNotify(deps, order, draft, selection.winner);
}

/** Guarda un mensaje del cliente en la conversación (la crea si hace falta). */
export async function recordInbound(
  db: Db,
  storeId: string,
  customerId: string,
  text: string,
  simulated: boolean,
) {
  let conv = await db.prisma.conversation.findFirst({ where: { storeId, customerId } });
  if (!conv)
    conv = await db.prisma.conversation.create({
      data: { id: newId("conv"), storeId, customerId },
    });
  await db.prisma.message.create({
    data: { id: newId("msg"), conversationId: conv.id, direction: "in", text, simulated },
  });
}

/** Guarda un mensaje del agente al cliente sin necesitar un pedido. */
export async function recordOutbound(
  db: Db,
  storeId: string,
  customerId: string,
  text: string,
  simulated: boolean,
) {
  let conv = await db.prisma.conversation.findFirst({ where: { storeId, customerId } });
  if (!conv)
    conv = await db.prisma.conversation.create({
      data: { id: newId("conv"), storeId, customerId },
    });
  await db.prisma.message.create({
    data: { id: newId("msg"), conversationId: conv.id, direction: "out", text, simulated },
  });
}
