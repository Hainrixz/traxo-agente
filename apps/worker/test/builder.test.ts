import { type Db, ensureDemoAdmin, openDb } from "@traxo/db";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { mountAuth } from "../src/auth.ts";
import { registerBuilderApi } from "../src/builder.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";
import { hardenApp } from "../src/security.ts";
import { ingestCarrierEvent } from "../src/tracking.ts";

let db: Db;
let rt: Runtime;
let app: Hono;
let n = 0;

const signup = async (): Promise<string> => {
  const r = await app.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ana",
      email: `ana${++n}@t.co`,
      password: "secreto1",
      storeName: "Café Ana",
    }),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.7.0.${n}` },
  });
  return (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
};
const call = (cookie: string, path: string, init: RequestInit = {}) =>
  app.request(path, {
    ...init,
    headers: {
      cookie,
      "content-type": "application/json",
      "x-forwarded-for": `10.7.1.${n}`,
      ...(init.headers ?? {}),
    },
  });

beforeAll(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({
    db,
    bus: rt.bus,
    commerce: rt.commerceMap,
    onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
  });
  hardenApp(app, { authConfigured: true, live: false });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
  registerBuilderApi(app, rt);
}, 60_000);
afterAll(async () => {
  await db.close?.();
});

describe("constructor de tienda", () => {
  it("exige sesión", async () => {
    const r = await app.request("/api/builder");
    expect(r.status).toBe(401);
  });

  it("crea un diseño con el nombre de la tienda y lo lista", async () => {
    const c = await signup();
    const r = await call(c, "/api/builder", {
      method: "POST",
      body: JSON.stringify({ style: "calido", ai: false }),
    });
    const j = (await r.json()) as {
      ok: boolean;
      project: { id: string; platform: string; design: { brand: string; style: string } };
    };
    expect(j.ok).toBe(true);
    expect(j.project.design.brand).toBe("Café Ana");
    expect(j.project.design.style).toBe("calido");
    const list = (await (await call(c, "/api/builder")).json()) as unknown[];
    expect(list).toHaveLength(1);
  });

  it("cada tienda ve solo sus diseños", async () => {
    const a = await signup();
    const b = await signup();
    const mine = (await (
      await call(a, "/api/builder", { method: "POST", body: JSON.stringify({ ai: false }) })
    ).json()) as { project: { id: string } };
    expect((await call(b, `/api/builder/${mine.project.id}`)).status).toBe(404);
    expect((await call(b, `/api/builder/${mine.project.id}/preview`)).status).toBe(404);
    expect((await call(b, `/api/builder/${mine.project.id}`, { method: "DELETE" })).status).toBe(
      404,
    );
    expect((await call(a, `/api/builder/${mine.project.id}`)).status).toBe(200);
  });

  it("rechaza una paleta ilegible y un enlace que no es de GitHub", async () => {
    const c = await signup();
    const { project } = (await (
      await call(c, "/api/builder", { method: "POST", body: JSON.stringify({ ai: false }) })
    ).json()) as { project: { id: string } };
    const bad = await call(c, `/api/builder/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ design: { palette: { text: "#EEEEEE", bg: "#FFFFFF" } } }),
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toContain("contraste");
    const evil = await call(c, `/api/builder/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ githubUrl: "https://evil.test/x" }),
    });
    expect(evil.status).toBe(400);
    const ok = await call(c, `/api/builder/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        githubUrl: "https://github.com/ana/tienda",
        status: "en-github",
        design: { copy: { cta: "Pide el tuyo" } },
      }),
    });
    const j = (await ok.json()) as {
      project: { status: string; design: { copy: { cta: string; headline: string } } };
    };
    expect(j.project.status).toBe("en-github");
    expect(j.project.design.copy.cta).toBe("Pide el tuyo");
    expect(j.project.design.copy.headline.length).toBeGreaterThan(2); // el resto del copy se conserva
  });

  it("la vista previa se puede enmarcar solo desde el mismo sitio y no ejecuta scripts", async () => {
    const c = await signup();
    const { project } = (await (
      await call(c, "/api/builder", {
        method: "POST",
        body: JSON.stringify({ brand: "<img src=x onerror=1>", ai: false }),
      })
    ).json()) as { project: { id: string } };
    const r = await call(c, `/api/builder/${project.id}/preview`);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(r.headers.get("content-security-policy")).not.toContain("script-src");
    const html = await r.text();
    expect(html).not.toContain("<img src=x onerror=1>");
  });

  it("el resto de la API sigue sin poder enmarcarse", async () => {
    const c = await signup();
    const r = await call(c, "/api/builder/catalog");
    expect(r.headers.get("x-frame-options")).toBe("DENY");
  });

  it("descarga el zip del tema y marca el diseño como generado", async () => {
    const c = await signup();
    const { project } = (await (
      await call(c, "/api/builder", {
        method: "POST",
        body: JSON.stringify({ platform: "shopify", ai: false }),
      })
    ).json()) as { project: { id: string } };
    const r = await call(c, `/api/builder/${project.id}/theme.zip`);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toContain("tema-shopify.zip");
    const buf = Buffer.from(await r.arrayBuffer());
    expect(buf.subarray(0, 4).toString("hex")).toBe("504b0304");
    const after = (await (await call(c, `/api/builder/${project.id}`)).json()) as {
      status: string;
    };
    expect(after.status).toBe("generado");
    const bundle = (await (await call(c, `/api/builder/${project.id}/bundle`)).json()) as {
      files: Record<string, string>;
      problems: string[];
    };
    expect(Object.keys(bundle.files)).toContain("layout/theme.liquid");
    expect(bundle.problems).toEqual([]);
  });

  it("para otras plataformas entrega un sitio estático y lo dice", async () => {
    const c = await signup();
    const { project } = (await (
      await call(c, "/api/builder", {
        method: "POST",
        body: JSON.stringify({ platform: "tiendanube", ai: false }),
      })
    ).json()) as { project: { id: string } };
    const bundle = (await (await call(c, `/api/builder/${project.id}/bundle`)).json()) as {
      platform: string;
      files: Record<string, string>;
    };
    expect(bundle.platform).toBe("tiendanube");
    expect(Object.keys(bundle.files).sort()).toEqual(["LEEME.md", "diseno.json", "index.html"]);
    expect(bundle.files["LEEME.md"]).toContain("no admite todavía un tema automático");
  });
});
