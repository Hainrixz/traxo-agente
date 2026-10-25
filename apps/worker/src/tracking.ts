// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { MockCarrierProvider } from "@traxo/carriers";
import { formatCOP, type Order, type TrackingEvent, type TrackingStatus } from "@traxo/core";
import { addTrackingEvents, orderFromRow, storeNameOf } from "@traxo/db";
import { render } from "@traxo/messaging";
import { type AgentDeps, recordMessage } from "./agent.ts";

const FINAL: TrackingStatus[] = ["delivered", "returned", "cancelled"];

/** Revisa cada guía abierta: guarda eventos nuevos, avisa al cliente y abre novedades. Devuelve cuántos eventos nuevos hubo. */
export async function pollTracking(deps: AgentDeps): Promise<number> {
  const { db, bus } = deps;
  const open = await db.prisma.shipment.findMany({
    where: { status: { notIn: FINAL } },
    include: { order: true },
  });
  let count = 0;
  for (const s of open) {
    const provider = deps.carriers.find((c) => c.id === s.provider);
    if (!provider) continue;
    let events: TrackingEvent[];
    try {
      events = await provider.track(s.trackingNumber);
    } catch (e) {
      bus.emit("error", `No pude rastrear la guía ${s.trackingNumber}: ${(e as Error).message}`, {
        orderId: s.orderId,
      });
      continue;
    }
    const fresh = await addTrackingEvents(db, s.id, events);
    if (fresh.length === 0) continue;
    count += fresh.length;
    const order = orderFromRow(s.order);
    for (const e of fresh.sort((a, b) => a.at.localeCompare(b.at))) {
      if (e.status === "created") continue;
      await onStatus(deps, order, s.trackingNumber, s.carrier, s.trackUrl, e);
    }
  }
  return count;
}

async function onStatus(
  deps: AgentDeps,
  order: Order,
  guide: string,
  carrier: string,
  trackUrl: string,
  e: TrackingEvent,
): Promise<void> {
  const { bus } = deps;
  const ev = (
    kind: Parameters<typeof bus.emit>[0],
    summary: string,
    data?: Record<string, unknown>,
  ) => bus.emit(kind, summary, { orderId: order.id, data });
  ev("tracking.updated", `Guía ${guide} (${carrier}): ${e.description}.`, { status: e.status });

  const send = async (name: "llega_hoy" | "novedad_entrega", text: string) => {
    if (!order.address.phone.startsWith("+57")) return;
    const sent = await deps.messaging.send({
      to: order.address.phone,
      text,
      template: { name, params: [order.address.name, guide] },
      idempotencyKey: `${order.id}:${name}:${e.status}`,
    });
    await recordMessage(deps.db, order, text, name, sent.simulated);
    ev(
      "message.sent",
      `Le escribí a ${order.address.name}: ${name === "llega_hoy" ? "llega hoy" : "tuvimos una novedad"}.${sent.simulated ? " (simulado)" : ""}`,
    );
  };

  if (e.status === "out_for_delivery") {
    await send(
      "llega_hoy",
      render("llega_hoy", {
        nombre: order.address.name,
        tienda: await storeNameOf(deps.db, order.storeId, deps.storeName),
        guia: guide,
        monto: order.payment === "cod" ? order.total : undefined,
      }),
    );
  } else if (e.status === "incident") {
    ev(
      "incident.detected",
      `Novedad en la guía ${guide}: ${e.description}. Contacto al cliente para reprogramar.`,
      { trackUrl },
    );
    await send(
      "novedad_entrega",
      render("novedad_entrega", {
        nombre: order.address.name,
        tienda: await storeNameOf(deps.db, order.storeId, deps.storeName),
        guia: guide,
      }),
    );
  } else if (e.status === "delivered") {
    await deps.db.prisma.order.update({ where: { id: order.id }, data: { status: "delivered" } });
    ev(
      "tracking.updated",
      `Entregué ${order.number} a ${order.address.name}${order.payment === "cod" ? ` y se recaudaron ${formatCOP(order.total)}` : ""}.`,
      { status: "delivered" },
    );
  }
}

/** Para la demo: avanza una guía simulada y vuelve a rastrear. */
export async function advanceDemoShipment(
  deps: AgentDeps,
  mocks: MockCarrierProvider[],
  trackingNumber: string,
  opts: { incident?: boolean } = {},
): Promise<TrackingStatus> {
  const row = await deps.db.prisma.shipment.findFirst({ where: { trackingNumber } });
  if (!row) throw new Error(`No encuentro la guía ${trackingNumber}.`);
  const mock = mocks.find((m) => m.id === row.provider);
  if (!mock) throw new Error("Esta guía no es simulada: avanza sola con la transportadora.");
  const status = mock.advance(trackingNumber, opts);
  await pollTracking(deps);
  return status;
}

/** La persona marca una novedad a mano (el agente contacta al cliente igual que con una novedad de la transportadora). */
export async function reportIncident(
  deps: AgentDeps,
  trackingNumber: string,
  description: string,
): Promise<void> {
  const row = await deps.db.prisma.shipment.findFirst({
    where: { trackingNumber },
    include: { order: true },
  });
  if (!row) throw new Error(`No encuentro la guía ${trackingNumber}.`);
  const e: TrackingEvent = { status: "incident", description, at: new Date().toISOString() };
  await addTrackingEvents(deps.db, row.id, [e]);
  await onStatus(deps, orderFromRow(row.order), row.trackingNumber, row.carrier, row.trackUrl, e);
}

/** Un evento que llega por webhook de la transportadora: se guarda y dispara los mismos avisos que el rastreo periódico. */
export async function ingestCarrierEvent(
  deps: AgentDeps,
  trackingNumber: string,
  e: TrackingEvent,
): Promise<boolean> {
  const row = await deps.db.prisma.shipment.findFirst({
    where: { trackingNumber },
    include: { order: true },
  });
  if (!row) return false;
  const fresh = await addTrackingEvents(deps.db, row.id, [e]);
  if (fresh.length === 0) return true;
  await onStatus(deps, orderFromRow(row.order), row.trackingNumber, row.carrier, row.trackUrl, e);
  return true;
}
