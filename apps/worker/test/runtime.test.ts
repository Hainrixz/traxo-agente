// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { DEMO_STORE } from "@traxo/commerce";
import { openDb } from "@traxo/db";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../src/runtime.ts";

describe("tienda principal y datos de ejemplo", () => {
  it("con cuentas nuevas creadas después, los datos de ejemplo siguen siendo de la tienda demo", async () => {
    const db = await openDb({ dataDir: "memory://" });
    const first = await createRuntime({}, { db, rich: true });
    expect(first.storeId).toBe(DEMO_STORE.id);
    await db.prisma.store.create({
      data: {
        id: "store_ajena",
        name: "Tienda ajena",
        platform: "mock",
        url: "https://x.co",
        settings: {},
        createdAt: new Date(Date.now() + 60_000),
      },
    });
    await db.prisma.customer.create({
      data: {
        id: "cust_ajeno",
        storeId: "store_ajena",
        name: "Cliente ajeno",
        phone: "+573000000000",
      },
    });
    // Un reinicio con una base que ya tiene más de una tienda no toca la de otra persona.
    const again = await createRuntime({}, { db, rich: true });
    expect(again.storeId).toBe(DEMO_STORE.id);
    expect(await db.prisma.customer.count({ where: { storeId: "store_ajena" } })).toBe(1);
    expect(await db.prisma.order.count({ where: { storeId: DEMO_STORE.id } })).toBeGreaterThan(100);
    await db.close();
  }, 60_000);
});
