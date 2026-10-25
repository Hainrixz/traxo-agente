// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type Db, ensureDemoAdmin, openDb } from "@traxo/db";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { answer, registerAssistantApi, snapshot } from "../src/assistant.ts";
import { mountAuth } from "../src/auth.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";
import { ingestCarrierEvent } from "../src/tracking.ts";

let db: Db;
let rt: Runtime;
let app: Hono;
let cookie = "";

beforeAll(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db, rich: true });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({
    db,
    bus: rt.bus,
    commerce: rt.commerceMap,
    onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
  });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
  registerAssistantApi(app, rt);
  const r = await app.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@traxo.demo", password: "traxo-demo" }),
    headers: { "content-type": "application/json" },
  });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}, 60_000);
afterAll(async () => db.close());

describe("agente del panel: responde con los datos de la tienda", () => {
  it("ventas, anuncios, tienda, clientes y envíos salen de la base, sin inventar", async () => {
    const s = await snapshot(db, rt.storeId);
    const v = answer(s, "¿Cuánto vendí esta semana?");
    expect(v.answer).toMatch(/\$ [\d.]+/);
    expect(v.kpis?.length).toBeGreaterThan(0);
    const ads = answer(s, "¿Qué anuncio funciona y cuál no?");
    expect(ads.answer).toMatch(/ROAS/);
    expect(ads.answer).toMatch(/gasta más de lo que vende/);
    expect(answer(s, "¿Qué debo arreglar primero en mi tienda?").answer).toMatch(/sobre 100/);
    expect(answer(s, "clientes para reactivar").kpis?.length).toBe(3);
    expect(answer(s, "¿Cómo les va a las transportadoras?").answer).toMatch(/envíos/);
  });

  it("encuentra un pedido por su número y no inventa uno que no existe", async () => {
    const s = await snapshot(db, rt.storeId);
    const n = s.orders[0]?.number.replace("#", "") ?? "";
    expect(answer(s, `¿dónde está el pedido #${n}?`).answer).toContain(`#${n}`);
    expect(answer(s, "¿dónde está el pedido #999999?").answer).toMatch(/No encuentro/);
  });

  it("por HTTP exige sesión y responde a la pregunta; una cuenta nueva no ve datos ajenos", async () => {
    expect((await app.request("/api/assistant/ask", { method: "POST", body: "{}" })).status).toBe(
      401,
    );
    const ask = async (ck: string, question: string) =>
      (
        await app.request("/api/assistant/ask", {
          method: "POST",
          body: JSON.stringify({ question }),
          headers: { "content-type": "application/json", cookie: ck },
        })
      ).json() as Promise<{ answer: string; mode: string }>;
    const a = await ask(cookie, "resumen de hoy");
    expect(a.mode).toBe("datos");
    expect(a.answer).toMatch(/Esta semana/);
    const r = await app.request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Ana",
        email: "ana@t.co",
        password: "secreto1",
        storeName: "Tienda de Ana",
      }),
      headers: { "content-type": "application/json", "x-forwarded-for": "10.2.2.2" },
    });
    const ck2 = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const b = await ask(ck2, "¿cuánto vendí esta semana?");
    expect(b.answer).toMatch(/\$ 0 en 0 pedidos|0 pedidos/);
  });
});
