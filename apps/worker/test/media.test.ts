// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { mkdtempSync, rmSync } from "node:fs";
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
import { ingestCarrierEvent } from "../src/tracking.ts";

let db: Db;
let rt: Runtime;
let app: Hono;
let dir: string;
let n = 0;

const signup = async (): Promise<string> => {
  const r = await app.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ana",
      email: `ana${++n}@t.co`,
      password: "secreto1",
      storeName: "Tienda de Ana",
    }),
    headers: { "content-type": "application/json", "x-forwarded-for": `10.4.0.${n}` },
  });
  return (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "traxo-media-"));
  process.env.TRAXO_MEDIA_DIR = dir;
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  await ensureDemoAdmin(db, rt.storeId);
  app = createApp({
    db,
    bus: rt.bus,
    commerce: rt.commerceMap,
    onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
  });
  mountAuth(app, rt, { demo: true });
  registerApi(app, rt);
  registerMediaApi(app, rt);
}, 60_000);
afterAll(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
  delete process.env.TRAXO_MEDIA_DIR;
});

describe("biblioteca de creativos", () => {
  it("sube un archivo, lo sirve con rangos, lo lista y lo borra", async () => {
    const cookie = await signup();
    const bytes = Buffer.from("0123456789".repeat(10));
    const up = await app.request("/api/media/upload", {
      method: "POST",
      body: bytes,
      headers: { cookie, "x-filename": encodeURIComponent("Reseña UGC.mp4"), "x-role": "ugc" },
    });
    const j = (await up.json()) as {
      ok: boolean;
      asset: { id: string; kind: string; url: string; title: string };
    };
    expect(j.ok).toBe(true);
    expect(j.asset.kind).toBe("video");
    expect(j.asset.title).toBe("Reseña UGC");
    const full = await app.request(j.asset.url, { headers: { cookie } });
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect((await full.arrayBuffer()).byteLength).toBe(100);
    const part = await app.request(j.asset.url, { headers: { cookie, range: "bytes=10-19" } });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("0123456789");
    const list = (await (
      await app.request("/api/media", { headers: { cookie } })
    ).json()) as unknown[];
    expect(list).toHaveLength(1);
    expect(
      (await app.request(`/api/media/${j.asset.id}`, { method: "DELETE", headers: { cookie } }))
        .status,
    ).toBe(200);
    expect((await app.request(j.asset.url, { headers: { cookie } })).status).toBe(404);
  });

  it("rechaza tipos raros, archivos vacíos y enlaces que no son https", async () => {
    const cookie = await signup();
    const bad = (name: string, body: string) =>
      app.request("/api/media/upload", {
        method: "POST",
        body,
        headers: { cookie, "x-filename": name },
      });
    expect((await bad("virus.exe", "x")).status).toBe(400);
    expect((await bad("vacio.png", "")).status).toBe(400);
    const link = (url: string) =>
      app.request("/api/media/link", {
        method: "POST",
        body: JSON.stringify({ url, title: "Video de Higgsfield" }),
        headers: { cookie, "content-type": "application/json" },
      });
    expect((await link("http://x.co/a.mp4")).status).toBe(400);
    expect((await link("javascript:alert(1)")).status).toBe(400);
    const ok = (await (await link("https://cdn.example.com/a.mp4")).json()) as {
      ok: boolean;
      asset: { kind: string; url: string };
    };
    expect(ok.ok).toBe(true);
    expect(ok.asset.kind).toBe("video");
    expect(ok.asset.url).toBe("https://cdn.example.com/a.mp4");
  });

  it("cada cuenta ve solo lo suyo y no puede borrar ni leer lo ajeno", async () => {
    const a = await signup();
    const b = await signup();
    const up = await app.request("/api/media/upload", {
      method: "POST",
      body: "abc",
      headers: { cookie: a, "x-filename": "foto.png" },
    });
    const id = ((await up.json()) as { asset: { id: string } }).asset.id;
    expect(
      ((await (await app.request("/api/media", { headers: { cookie: b } })).json()) as unknown[])
        .length,
    ).toBe(0);
    expect((await app.request(`/api/media/${id}/file`, { headers: { cookie: b } })).status).toBe(
      404,
    );
    expect(
      (await app.request(`/api/media/${id}`, { method: "DELETE", headers: { cookie: b } })).status,
    ).toBe(404);
    expect((await app.request("/api/media")).status).toBe(401);
  });
});
