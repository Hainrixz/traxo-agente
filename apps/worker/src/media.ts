import { randomUUID } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import { storeOf } from "./auth.ts";
import { demoCatalog, loadDemoMedia } from "./demo-media.ts";
import { isDemo } from "./mode.ts";
import type { Runtime } from "./runtime.ts";
import { reportUsage } from "./usage.ts";

const MAX_BYTES = 60 * 1024 * 1024;
export const TYPES: Record<string, { kind: "image" | "video"; mime: string }> = {
  ".jpg": { kind: "image", mime: "image/jpeg" },
  ".jpeg": { kind: "image", mime: "image/jpeg" },
  ".png": { kind: "image", mime: "image/png" },
  ".webp": { kind: "image", mime: "image/webp" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".mov": { kind: "video", mime: "video/quicktime" },
  ".webm": { kind: "video", mime: "video/webm" },
};
const ROLES = new Set(["ugc", "producto", "lifestyle", "referencia"]);

export const mediaDir = (): string => {
  const d = process.env.TRAXO_MEDIA_DIR ?? ".traxo-data/media";
  mkdirSync(d, { recursive: true });
  return d;
};

/** Biblioteca de creativos: imágenes y videos (UGC, producto, referencias) que se usan en los anuncios. */
export function registerMediaApi(app: Hono, rt: Runtime): void {
  const { db } = rt;
  const sid = (c: Context): string => storeOf(c, rt.storeId);
  const demo = isDemo;
  const view = (m: Awaited<ReturnType<typeof db.prisma.mediaAsset.findMany>>[number]) => ({
    ...m,
    url: m.file ? `/api/media/${m.id}/file` : (m.externalUrl ?? null),
    file: undefined,
  });

  app.get("/api/media", async (c) =>
    c.json(
      (
        await db.prisma.mediaAsset.findMany({
          where: { storeId: sid(c) },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      ).map(view),
    ),
  );

  // Subida directa: el cuerpo es el archivo; el nombre y la etiqueta viajan en los encabezados.
  app.post("/api/media/upload", async (c) => {
    const name = decodeURIComponent(c.req.header("x-filename") ?? "archivo");
    const type = TYPES[extname(name).toLowerCase()];
    if (!type)
      return c.json(
        { ok: false, message: "Solo imágenes (jpg, png, webp) o videos (mp4, mov, webm)." },
        400,
      );
    const role = ROLES.has(c.req.header("x-role") ?? "")
      ? (c.req.header("x-role") as string)
      : "ugc";
    // Solo en modo demo: título y origen vienen del catálogo del material de ejemplo, y repetir la carga no duplica.
    const demoTitle =
      demo() && c.req.header("x-title")
        ? decodeURIComponent(c.req.header("x-title") as string).slice(0, 80)
        : null;
    const demoSource =
      demo() && ["higgsfield", "subido", "generado"].includes(c.req.header("x-source") ?? "")
        ? (c.req.header("x-source") as string)
        : "subido";
    if (demoTitle) {
      const dup = await db.prisma.mediaAsset.findFirst({
        where: { storeId: sid(c), title: demoTitle },
      });
      if (dup) return c.json({ ok: true, duplicate: true, asset: view(dup) });
    }
    const buf = Buffer.from(await c.req.arrayBuffer());
    if (buf.length === 0) return c.json({ ok: false, message: "El archivo está vacío." }, 400);
    if (buf.length > MAX_BYTES)
      return c.json({ ok: false, message: "El archivo pesa más de 60 MB." }, 413);
    const id = `media_${randomUUID().slice(0, 12)}`;
    const file = `${id}${extname(name).toLowerCase()}`;
    writeFileSync(join(mediaDir(), file), buf);
    const row = await db.prisma.mediaAsset.create({
      data: {
        id,
        storeId: sid(c),
        kind: type.kind,
        title: demoTitle ?? name.replace(/\.[^.]+$/, "").slice(0, 80),
        source: demoSource,
        role,
        product: c.req.header("x-product")
          ? decodeURIComponent(c.req.header("x-product") as string)
          : null,
        file,
        mime: type.mime,
        bytes: buf.length,
      },
    });
    return c.json({ ok: true, asset: view(row) });
  });

  // Registra un archivo que ya vive en otra parte (p. ej. un video generado en Higgsfield): solo guarda el enlace, no lo descarga.
  app.post("/api/media/link", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as Record<string, string | number | undefined>;
    let url: URL;
    try {
      url = new URL(String(b.url ?? ""));
    } catch {
      return c.json({ ok: false, message: "El enlace no es válido." }, 400);
    }
    if (url.protocol !== "https:")
      return c.json({ ok: false, message: "El enlace debe empezar con https://." }, 400);
    const kind =
      b.kind === "video" || /\.(mp4|mov|webm)(\?|$)/i.test(url.pathname) ? "video" : "image";
    const role = ROLES.has(String(b.role)) ? String(b.role) : "ugc";
    const source = ["higgsfield", "generado", "subido"].includes(String(b.source))
      ? String(b.source)
      : "higgsfield";
    const row = await db.prisma.mediaAsset.create({
      data: {
        id: `media_${randomUUID().slice(0, 12)}`,
        storeId: sid(c),
        kind,
        title: String(b.title ?? url.pathname.split("/").pop() ?? "Archivo").slice(0, 80),
        source,
        role,
        product: b.product ? String(b.product).slice(0, 80) : null,
        externalUrl: url.toString(),
        durationS: typeof b.durationS === "number" ? b.durationS : null,
      },
    });
    const credits = Number(b.credits);
    if (source !== "subido" && Number.isFinite(credits) && credits > 0)
      reportUsage(sid(c), {
        kind: row.kind === "video" ? "video" : "imagen",
        feature: `Higgsfield · ${row.title}`.slice(0, 60),
        credits,
      });
    return c.json({ ok: true, asset: view(row) });
  });

  // Estado de la conexión con Higgsfield. En la demo es SIMULADA: no se llama a Higgsfield ni se gastan créditos.
  app.get("/api/media/higgsfield", async (c) => {
    const have = await db.prisma.mediaAsset.count({
      where: { storeId: sid(c), source: "higgsfield" },
    });
    return c.json({
      simulated: demo(),
      connected: demo(),
      imported: have,
      available: demo()
        ? demoCatalog().filter((i) => i.fuente === "higgsfield").length || null
        : null,
    });
  });

  // Trae a la biblioteca los creativos de Higgsfield. En la demo carga los del material de ejemplo (simulado); con una cuenta real lo hace Claude con el conector.
  app.post("/api/media/import-higgsfield", async (c) => {
    if (!demo())
      return c.json({
        ok: false,
        message:
          "Pídele a Claude: «trae mis videos UGC de Higgsfield» (skill /traxo:campana). Así se conecta con tu cuenta.",
      });
    const r = await loadDemoMedia(db, sid(c), { only: "higgsfield" });
    const have = await db.prisma.mediaAsset.count({
      where: { storeId: sid(c), source: "higgsfield" },
    });
    return c.json({
      ok: true,
      simulated: true,
      imported: r.imported,
      total: have,
      missing: r.missing,
    });
  });

  app.delete("/api/media/:id", async (c) => {
    const m = await db.prisma.mediaAsset.findFirst({
      where: { id: c.req.param("id"), storeId: sid(c) },
    });
    if (!m) return c.json({ ok: false, message: "No encuentro ese archivo." }, 404);
    if (m.file) {
      try {
        unlinkSync(join(mediaDir(), m.file));
      } catch {
        /* ya no estaba */
      }
    }
    await db.prisma.mediaAsset.delete({ where: { id: m.id } });
    return c.json({ ok: true });
  });

  // Descarga con soporte de rangos (para que el video se pueda adelantar).
  app.get("/api/media/:id/file", async (c) => {
    const m = await db.prisma.mediaAsset.findFirst({
      where: { id: c.req.param("id"), storeId: sid(c) },
    });
    const path = m?.file ? join(mediaDir(), m.file) : "";
    if (!m || !existsSync(path))
      return c.json({ ok: false, message: "No encuentro ese archivo." }, 404);
    const size = statSync(path).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
    const headers = {
      "content-type": m.mime ?? "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
    };
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start > end || start >= size)
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new Response(
        Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream,
        {
          status: 206,
          headers: {
            ...headers,
            "content-range": `bytes ${start}-${end}/${size}`,
            "content-length": String(end - start + 1),
          },
        },
      );
    }
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { ...headers, "content-length": String(size) },
    });
  });
}
