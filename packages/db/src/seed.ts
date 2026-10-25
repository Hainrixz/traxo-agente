// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { DEMO_PRODUCTS, DEMO_STORE, demoCustomers, demoHistory } from "@traxo/commerce";
import { StoreSettingsSchema } from "@traxo/core";
import type { Db } from "./client.ts";

export type SeedResult = { storeId: string; products: number; customers: number; orders: number };

/** Carga la tienda demo "Café de Origen". Se puede correr varias veces: no duplica. */
export async function seedDemo(db: Db): Promise<SeedResult> {
  const { prisma } = db;
  const settings = StoreSettingsSchema.parse({ autonomy: 1, preferredProvider: "envia-com" });

  await prisma.store.upsert({
    where: { id: DEMO_STORE.id },
    update: {},
    create: {
      id: DEMO_STORE.id,
      name: DEMO_STORE.name,
      platform: "mock",
      url: DEMO_STORE.url,
      settings,
      profile: { vertical: DEMO_STORE.vertical, shipsWith: "Envia.com", codShare: 0.7 },
    },
  });

  for (const p of DEMO_PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        storeId: DEMO_STORE.id,
        externalId: p.externalId,
        title: p.title,
        price: p.price,
        cost: p.cost ?? null,
        weightGrams: p.weightGrams,
        imageUrl: p.imageUrl ?? null,
        description: p.description ?? null,
      },
    });
  }

  const customers = demoCustomers();
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        storeId: DEMO_STORE.id,
        externalId: c.externalId ?? null,
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        city: c.city ?? null,
        whatsappConsent: c.whatsappConsent,
      },
    });
  }

  const orders = demoHistory();
  for (const o of orders) {
    await prisma.order.upsert({
      where: { storeId_externalId: { storeId: DEMO_STORE.id, externalId: o.externalId } },
      update: {},
      create: {
        id: o.id,
        storeId: DEMO_STORE.id,
        externalId: o.externalId,
        number: o.number,
        address: o.address,
        lines: o.lines,
        subtotal: o.subtotal,
        shippingCharged: o.shippingCharged,
        total: o.total,
        payment: o.payment,
        utm: o.utm ?? undefined,
        status: "delivered",
        createdAt: new Date(o.createdAt),
      },
    });
  }

  return {
    storeId: DEMO_STORE.id,
    products: DEMO_PRODUCTS.length,
    customers: customers.length,
    orders: orders.length,
  };
}
