import { type Db, ensureDemoAdmin, openDb } from "@traxo/db";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { mountAuth, readSession, signSession } from "../src/auth.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";

let db: Db;
let rt: Runtime;
let app: Hono;

beforeEach(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({ db, bus: rt.bus, commerce: rt.commerceMap });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
});
afterEach(async () => db.close());

const post = (path: string, body: unknown, cookie?: string) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });
const cookieOf = (res: Response): string =>
  (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
const get = (path: string, cookie?: string) =>
  app.request(path, { headers: cookie ? { cookie } : {} });

describe("sesiones", () => {
  it("sin sesión la API responde 401, pero /api/auth/me dice cómo entrar", async () => {
    expect((await get("/api/state")).status).toBe(401);
    const me = (await (await get("/api/auth/me")).json()) as {
      account: unknown;
      demo: boolean;
      demoAdmin?: { email: string };
    };
    expect(me.account).toBeNull();
    expect(me.demo).toBe(true);
    expect(me.demoAdmin?.email).toBe("admin@traxo.demo");
  });

  it("login correcto, incorrecto y cookie HttpOnly", async () => {
    const bad = await post("/api/auth/login", { email: "admin@traxo.demo", password: "mala" });
    expect(bad.status).toBe(401);
    const ok = await post("/api/auth/login", { email: "ADMIN@traxo.demo", password: "traxo-demo" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
    expect((await get("/api/state", cookieOf(ok))).status).toBe(200);
  });

  it("una cookie alterada o vencida no sirve", () => {
    const t = signSession({ a: "acc_admin", s: "store_demo", r: "admin" }, "s3");
    expect(readSession(t, "s3")?.s).toBe("store_demo");
    expect(readSession(`${t}x`, "s3")).toBeUndefined();
    expect(readSession(t, "otro")).toBeUndefined();
    expect(readSession(t, "s3", Date.now() + 15 * 86_400_000)).toBeUndefined();
  });
});

describe("cuenta nueva y aislamiento", () => {
  const signup = async (email = "ana@tienda.co") =>
    post("/api/auth/signup", {
      name: "Ana",
      email,
      password: "secreto1",
      storeName: "Tienda de Ana",
    });

  it("el registro crea una tienda vacía y valida los datos", async () => {
    expect(
      (
        await post("/api/auth/signup", {
          name: "A",
          email: "mal",
          password: "secreto1",
          storeName: "T",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post("/api/auth/signup", {
          name: "A",
          email: "a@b.co",
          password: "123",
          storeName: "T",
        })
      ).status,
    ).toBe(400);
    const res = await signup();
    expect(res.status).toBe(200);
    const state = (await (await get("/api/state", cookieOf(res))).json()) as {
      store: { name: string };
      kpis: { orders: number };
    };
    expect(state.store.name).toBe("Tienda de Ana");
    expect(state.kpis.orders).toBe(0);
    expect((await signup()).status).toBe(400); // correo repetido
  });

  it("cada cuenta ve solo lo suyo: pedidos, guías, eventos y aprobaciones", async () => {
    const admin = cookieOf(
      await post("/api/auth/login", { email: "admin@traxo.demo", password: "traxo-demo" }),
    );
    const ana = cookieOf(await signup());
    const adminBefore = (await (await get("/api/state", admin)).json()) as {
      kpis: { orders: number };
    };

    const made = (await (await post("/api/demo/order", { dane: "66001" }, ana)).json()) as {
      ok: boolean;
      outcome: { status: string; trackingNumber: string };
    };
    expect(made.outcome.status).toBe("shipped");

    const anaState = (await (await get("/api/state", ana)).json()) as {
      kpis: { orders: number; shipments: number };
    };
    const adminAfter = (await (await get("/api/state", admin)).json()) as {
      kpis: { orders: number; shipments: number };
    };
    expect(anaState.kpis).toMatchObject({ orders: 1, shipments: 1 });
    expect(adminAfter.kpis.orders).toBe(adminBefore.kpis.orders);

    const anaEvents = (await (await get("/api/events", ana)).json()) as Array<{ summary: string }>;
    const adminEvents = (await (await get("/api/events", admin)).json()) as Array<{
      summary: string;
    }>;
    expect(anaEvents.length).toBeGreaterThan(4);
    expect(adminEvents.some((e) => e.summary.includes("Generé la guía"))).toBe(false);

    // La guía de Ana no se puede tocar desde otra cuenta.
    const tn = made.outcome.trackingNumber;
    expect((await post("/api/demo/advance", { trackingNumber: tn }, admin)).status).toBe(404);
    expect((await get(`/api/shipments/${tn}`, admin)).status).toBe(404);
    expect((await post(`/api/shipments/${tn}/incident`, {}, admin)).status).toBe(404);
  });

  it("una aprobación de otra tienda no se puede resolver", async () => {
    const admin = cookieOf(
      await post("/api/auth/login", { email: "admin@traxo.demo", password: "traxo-demo" }),
    );
    const ana = cookieOf(await signup());
    await post("/api/demo/order", { dane: "76001", badAddress: true }, ana);
    const list = (await (await get("/api/approvals", ana)).json()) as Array<{ id: string }>;
    expect(list).toHaveLength(1);
    expect(((await (await get("/api/approvals", admin)).json()) as unknown[]).length).toBe(0);
    expect((await post(`/api/approvals/${list[0]?.id}/approve`, {}, admin)).status).toBe(404);
    expect(
      (await post(`/api/approvals/${list[0]?.id}/address`, { street: "Calle 1 # 2-3" }, admin))
        .status,
    ).toBe(404);
  });

  it("el token de API entra a la tienda por defecto", async () => {
    const app2 = createApp({ db, bus: rt.bus, commerce: rt.commerceMap });
    mountAuth(app2, rt, { apiToken: "tok" });
    registerApi(app2, rt);
    expect((await app2.request("/api/state")).status).toBe(401);
    expect(
      (await app2.request("/api/state", { headers: { authorization: "Bearer tok" } })).status,
    ).toBe(200);
  });
});

describe("el endpoint /mcp con sesiones activas", () => {
  it("responde a las herramientas con el token de /mcp aunque la API pida sesión", async () => {
    const { mountMcp } = await import("../src/mcp.ts");
    const { registerGrowthApi } = await import("../src/growth.ts");
    registerGrowthApi(app, rt);
    mountMcp(app, "tok-mcp");
    const call = async (method: string, params: unknown, id: number) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer tok-mcp",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    await call(
      "initialize",
      { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      1,
    );
    const r = (await (
      await call("tools/call", { name: "reporte_logistica", arguments: {} }, 2)
    ).json()) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(r.result.isError, JSON.stringify(r.result.content)).not.toBe(true);
    expect(r.result.content[0]?.text).toContain("Recaudo");
    // Sin el token de /mcp sigue cerrado y la API directa sigue pidiendo sesión.
    expect((await app.request("/mcp", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await app.request("/api/reports/logistics")).status).toBe(401);
  });
});
