// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { AgentEvent, CreatedShipment, Quote, StoreSettings, TrackingEvent } from "@traxo/core";
import { newId, StoreSettingsSchema } from "@traxo/core";
import type { Db } from "./client.ts";

export async function getSettings(db: Db, storeId: string): Promise<StoreSettings> {
  const row = await db.prisma.store.findUnique({ where: { id: storeId } });
  return StoreSettingsSchema.parse(row?.settings ?? {});
}

export async function setSettings(
  db: Db,
  storeId: string,
  patch: Partial<StoreSettings>,
): Promise<StoreSettings> {
  const next = StoreSettingsSchema.parse({ ...(await getSettings(db, storeId)), ...patch });
  await db.prisma.store.update({ where: { id: storeId }, data: { settings: next } });
  return next;
}

export async function logEvent(db: Db, storeId: string, e: AgentEvent): Promise<void> {
  await db.prisma.agentRun.create({
    data: {
      id: e.id,
      storeId,
      orderId: e.orderId ?? null,
      kind: e.kind,
      summary: e.summary,
      data: (e.data as object | undefined) ?? undefined,
      at: new Date(e.at),
    },
  });
}

export async function recentEvents(db: Db, storeId: string, limit = 100): Promise<AgentEvent[]> {
  const rows = await db.prisma.agentRun.findMany({
    where: { storeId },
    orderBy: { at: "desc" },
    take: limit,
  });
  return rows
    .map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      kind: r.kind as AgentEvent["kind"],
      summary: r.summary,
      orderId: r.orderId ?? undefined,
      data: (r.data as Record<string, unknown> | null) ?? undefined,
    }))
    .reverse();
}

export async function saveQuotes(
  db: Db,
  orderId: string,
  quotes: Array<Quote & { score?: number }>,
  chosenKey: string | undefined,
): Promise<void> {
  if (quotes.length === 0) return;
  await db.prisma.carrierQuote.createMany({
    data: quotes.map((q) => ({
      id: newId("qt"),
      orderId,
      provider: q.provider,
      carrier: q.carrier,
      service: q.service,
      freight: q.freight,
      codCommission: q.codCommission,
      supportsCod: q.supportsCod,
      businessDays: q.businessDays,
      simulated: q.simulated,
      chosen: `${q.provider}|${q.carrier}` === chosenKey,
      score: q.score ?? null,
    })),
  });
}

export async function saveShipment(db: Db, orderId: string, s: CreatedShipment): Promise<string> {
  const id = newId("shp");
  await db.prisma.shipment.create({
    data: {
      id,
      orderId,
      provider: s.provider,
      carrier: s.carrier,
      service: s.service,
      trackingNumber: s.trackingNumber,
      labelUrl: s.labelUrl,
      trackUrl: s.trackUrl,
      total: s.total,
      simulated: s.simulated,
    },
  });
  await db.prisma.order.update({ where: { id: orderId }, data: { status: "shipped" } });
  return id;
}

const eventKey = (e: { status: string; description: string; at: string | Date }): string =>
  `${e.status}|${e.description}|${new Date(e.at).toISOString().slice(0, 10)}`;

/**
 * Guarda los eventos que no teníamos (mismo estado, texto y día = mismo evento, aunque la hora difiera)
 * y deja la guía en el estado del evento MÁS RECIENTE de todos, no del último que llegó.
 */
export async function addTrackingEvents(
  db: Db,
  shipmentId: string,
  events: TrackingEvent[],
): Promise<TrackingEvent[]> {
  const existing = await db.prisma.trackingEventRow.findMany({ where: { shipmentId } });
  const seen = new Set(existing.map(eventKey));
  const fresh = events.filter((e) => {
    const k = eventKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (fresh.length === 0) return [];
  await db.prisma.trackingEventRow.createMany({
    data: fresh.map((e) => ({
      id: newId("trk"),
      shipmentId,
      status: e.status,
      description: e.description,
      location: e.location ?? null,
      at: new Date(e.at),
    })),
  });
  const all = [
    ...existing.map((r) => ({ status: r.status, at: r.at.toISOString() })),
    ...fresh.map((e) => ({ status: e.status, at: new Date(e.at).toISOString() })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const last = all.at(-1);
  if (last) {
    await db.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: last.status,
        deliveredAt: last.status === "delivered" ? new Date(last.at) : null,
      },
    });
  }
  return fresh;
}

export async function createApproval(
  db: Db,
  a: {
    storeId: string;
    orderId?: string;
    kind: string;
    title: string;
    detail: string;
    payload: object;
  },
): Promise<string> {
  const id = newId("apr");
  await db.prisma.approval.create({ data: { id, ...a, orderId: a.orderId ?? null } });
  return id;
}

/** Tasa de entregas sin novedad por transportadora, para el selector. */
export async function carrierReliability(db: Db): Promise<Record<string, number>> {
  const rows = await db.prisma.shipment.findMany({ select: { carrier: true, status: true } });
  const by = new Map<string, { ok: number; total: number }>();
  for (const r of rows) {
    if (!["delivered", "incident", "returning", "returned"].includes(r.status)) continue;
    const e = by.get(r.carrier) ?? { ok: 0, total: 0 };
    e.total += 1;
    if (r.status === "delivered") e.ok += 1;
    by.set(r.carrier, e);
  }
  const out: Record<string, number> = {};
  // Con pocos datos se mezcla con un prior de 0,9 para no castigar ni premiar por 1 o 2 envíos.
  for (const [carrier, { ok, total }] of by) out[carrier] = (ok + 0.9 * 5) / (total + 5);
  return out;
}

export type OrderRow = NonNullable<Awaited<ReturnType<Db["prisma"]["order"]["findUnique"]>>>;

export function orderFromRow(r: OrderRow): import("@traxo/core").Order {
  return {
    id: r.id,
    externalId: r.externalId,
    number: r.number,
    storeId: r.storeId,
    customerId: r.customerId ?? undefined,
    address: r.address as import("@traxo/core").Order["address"],
    lines: r.lines as import("@traxo/core").Order["lines"],
    subtotal: r.subtotal,
    shippingCharged: r.shippingCharged,
    total: r.total,
    payment: r.payment as "cod" | "prepaid",
    utm: (r.utm as Record<string, string> | null) ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

const storeNames = new Map<string, string>();
/** Nombre de la tienda para los mensajes al cliente (con caché: se pide una vez por tienda). */
export async function storeNameOf(
  db: Db,
  storeId: string,
  fallback = "tu tienda",
): Promise<string> {
  const hit = storeNames.get(storeId);
  if (hit) return hit;
  const row = await db.prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  const name = row?.name ?? fallback;
  storeNames.set(storeId, name);
  return name;
}
