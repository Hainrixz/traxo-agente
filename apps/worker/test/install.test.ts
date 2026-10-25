// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { openDb } from "@traxo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { mountAuth } from "../src/auth.ts";
import { registerGrowthApi } from "../src/growth.ts";
import { createRuntime } from "../src/runtime.ts";
import { ingestCarrierEvent } from "../src/tracking.ts";

afterEach(() => vi.unstubAllEnvs());

describe("instalación normal (sin modo demo)", () => {
  it("arranca con tu tienda vacía: sin datos de ejemplo, sin simuladores y sin importar la tienda de ejemplo", async () => {
    vi.stubEnv("TRAXO_DEMO", "");
    const db = await openDb({ dataDir: "memory://" });
    const rt = await createRuntime({ TRAXO_STORE_NAME: "Mi Marca" }, { db });
    expect(rt.storeId).toBe("store_main");
    expect(rt.storeName).toBe("Mi Marca");
    expect(await db.prisma.product.count()).toBe(0);
    expect(await db.prisma.order.count()).toBe(0);
    expect(await db.prisma.customer.count()).toBe(0);
    expect(rt.connections.find((c) => c.kind === "tienda")?.name).toBe("Sin tienda conectada");

    const app = createApp({
      db,
      bus: rt.bus,
      commerce: rt.commerceMap,
      onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
    });
    mountAuth(app, rt, { demo: false, login: false });
    registerApi(app, rt);
    registerGrowthApi(app, rt);
    const state = (await (await app.request("/api/state")).json()) as { demo: boolean };
    expect(state.demo).toBe(false);
    expect((await app.request("/api/demo/order", { method: "POST", body: "{}" })).status).toBe(404);
    const imp = (await (await app.request("/api/store/import", { method: "POST" })).json()) as {
      ok: boolean;
      message: string;
    };
    expect(imp.ok).toBe(false);
    expect(imp.message).toContain("/traxo:instalar");
    expect(await db.prisma.product.count()).toBe(0);
    // En una instalación normal no hay registro libre.
    const reg = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: "x", email: "x@y.co", password: "secreto12", storeName: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(reg.status).toBe(403);
    await db.close();
  });

  it("el modo demo solo se activa con TRAXO_DEMO=1", async () => {
    vi.stubEnv("TRAXO_DEMO", "1");
    const db = await openDb({ dataDir: "memory://" });
    const rt = await createRuntime({}, { db });
    expect(rt.storeName).toBe("Café de Origen");
    expect(await db.prisma.product.count()).toBeGreaterThan(0);
    await db.close();
  });
});
