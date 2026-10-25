// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { newId, type Order } from "@traxo/core";
import type { Db } from "./client.ts";

/** Guarda el pedido y su cliente. Idempotente: el mismo (tienda, externalId) no se duplica. */
export async function saveOrder(db: Db, order: Order): Promise<{ order: Order; created: boolean }> {
  const { prisma } = db;
  const existing = await prisma.order.findUnique({
    where: { storeId_externalId: { storeId: order.storeId, externalId: order.externalId } },
  });
  if (existing) {
    orderStoreIndex.set(existing.id, order.storeId);
    return { order: { ...order, id: existing.id }, created: false };
  }

  let customerId: string | null = null;
  if (order.address.phone) {
    const found = await prisma.customer.findFirst({
      where: { storeId: order.storeId, phone: order.address.phone },
    });
    customerId = found?.id ?? null;
    if (!found) {
      customerId = newId("cust");
      await prisma.customer.create({
        data: {
          id: customerId,
          storeId: order.storeId,
          name: order.address.name,
          phone: order.address.phone,
          email: order.email ?? null,
          city: order.address.city,
        },
      });
    }
  }

  await prisma.order.create({
    data: {
      id: order.id,
      storeId: order.storeId,
      customerId,
      externalId: order.externalId,
      number: order.number,
      address: order.address,
      lines: order.lines,
      subtotal: order.subtotal,
      shippingCharged: order.shippingCharged,
      total: order.total,
      payment: order.payment,
      utm: order.utm ?? undefined,
      status: "received",
      createdAt: new Date(order.createdAt),
    },
  });
  orderStoreIndex.set(order.id, order.storeId);
  return { order: { ...order, customerId: customerId ?? undefined }, created: true };
}

/** Devuelve true la primera vez que ve el evento y false si ya lo había recibido (webhooks llegan 2+ veces). */
export async function claimWebhookEvent(db: Db, source: string, eventId: string): Promise<boolean> {
  try {
    await db.prisma.webhookEvent.create({ data: { id: newId("wh"), source, eventId } });
    return true;
  } catch {
    return false;
  }
}

/** Índice pedido → tienda, para que los eventos del agente lleguen solo a la cuenta correcta. */
export const orderStoreIndex = new Map<string, string>();

export async function loadOrderStoreIndex(db: Db): Promise<void> {
  const rows = await db.prisma.order.findMany({ select: { id: true, storeId: true } });
  for (const r of rows) orderStoreIndex.set(r.id, r.storeId);
}
