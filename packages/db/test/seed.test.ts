import { afterAll, describe, expect, it } from "vitest";
import { type Db, openDb, seedDemo } from "../src/index.ts";

let db: Db;
afterAll(async () => db?.close());

describe("db + seed (PGlite en memoria)", () => {
  it("crea el esquema, carga la demo y es idempotente", async () => {
    db = await openDb({ dataDir: "memory://" });
    expect(db.mode).toBe("pglite");
    const first = await seedDemo(db);
    const second = await seedDemo(db);
    expect(second).toEqual(first);
    expect(await db.prisma.product.count()).toBe(6);
    expect(await db.prisma.customer.count()).toBe(12);
    expect(await db.prisma.order.count()).toBe(10);
  });
});
