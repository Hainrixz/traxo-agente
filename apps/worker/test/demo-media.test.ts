import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, ensureDemoAdmin, openDb } from "@traxo/db";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { mountAuth } from "../src/auth.ts";
import { registerMediaApi } from "../src/media.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";

let db: Db;
let rt: Runtime;
let app: Hono;
let root: string;
let cookie = "";

const CATALOG = [
  {
    archivo: "imagenes/a.jpg",
    tipo: "imagen",
    titulo: "Producto A",
    rol: "producto",
    producto: "Matcha",
    fuente: "higgsfield",
  },
  {
    archivo: "videos/b.mp4",
    tipo: "video",
    titulo: "UGC B",
    rol: "ugc",
    producto: "Kumis",
    fuente: "higgsfield",
  },
  {
    archivo: "videos/c.mp4",
    tipo: "video",
    titulo: "Referencia C",
    rol: "referencia",
    producto: null,
    fuente: "subido",
  },
];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "traxo-demo-media-"));
  mkdirSync(join(root, "imagenes"));
  mkdirSync(join(root, "videos"));
  for (const it of CATALOG) writeFileSync(join(root, it.archivo), Buffer.from([1, 2, 3, 4]));
  writeFileSync(join(root, "catalogo.json"), JSON.stringify({ archivos: CATALOG }));
  process.env.TRAXO_DEMO_MEDIA_DIR = root;
  process.env.TRAXO_MEDIA_DIR = join(root, "_store");
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({ db, bus: rt.bus, commerce: rt.commerceMap });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
  registerMediaApi(app, rt);
  const r = await app.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@traxo.demo", password: "traxo-demo" }),
    headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
  });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}, 60_000);
afterAll(async () => {
  delete process.env.TRAXO_DEMO_MEDIA_DIR;
  delete process.env.TRAXO_MEDIA_DIR;
  rmSync(root, { recursive: true, force: true });
  await db.close?.();
});

const list = async () =>
  (await (await app.request("/api/media", { headers: { cookie } })).json()) as Array<{
    title: string;
    source: string;
    role: string;
    product: string | null;
    sample: boolean;
  }>;

describe("material de demo en la biblioteca", () => {
  it("la subida acepta título, origen y producto del catálogo y es idempotente", async () => {
    const up = () =>
      app.request("/api/media/upload", {
        method: "POST",
        headers: {
          cookie,
          "x-filename": "a.jpg",
          "x-title": encodeURIComponent("Producto A"),
          "x-source": "higgsfield",
          "x-role": "producto",
          "x-product": "Matcha",
        },
        body: Buffer.from([1, 2, 3]),
      });
    expect(((await (await up()).json()) as { duplicate?: boolean }).duplicate).toBeUndefined();
    expect(((await (await up()).json()) as { duplicate?: boolean }).duplicate).toBe(true);
    const rows = (await list()).filter((r) => r.title === "Producto A");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "higgsfield",
      role: "producto",
      product: "Matcha",
      sample: false,
    });
  });

  it("importar de Higgsfield (simulado) trae solo los de esa fuente, sin duplicar", async () => {
    const st = (await (
      await app.request("/api/media/higgsfield", { headers: { cookie } })
    ).json()) as { simulated: boolean; available: number };
    expect(st.simulated).toBe(true);
    expect(st.available).toBe(2);
    const r1 = (await (
      await app.request("/api/media/import-higgsfield", { method: "POST", headers: { cookie } })
    ).json()) as { ok: boolean; imported: number; simulated: boolean };
    expect(r1).toMatchObject({ ok: true, simulated: true, imported: 1 }); // «Producto A» ya estaba
    const r2 = (await (
      await app.request("/api/media/import-higgsfield", { method: "POST", headers: { cookie } })
    ).json()) as { imported: number };
    expect(r2.imported).toBe(0);
    const titles = (await list()).map((r) => r.title);
    expect(titles).toContain("UGC B");
    expect(titles).not.toContain("Referencia C"); // fuente «subido»: no viene de Higgsfield
  });

  it("los archivos cargados se pueden reproducir con rangos", async () => {
    const all = (await (await app.request("/api/media", { headers: { cookie } })).json()) as Array<{
      id: string;
      title: string;
      url: string;
    }>;
    const b = all.find((r) => r.title === "UGC B");
    const res = await app.request(b?.url as string, { headers: { cookie, range: "bytes=1-2" } });
    expect(res.status).toBe(206);
  });
});
