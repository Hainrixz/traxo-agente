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
import { isDemo } from "./mode.ts";
import type { Runtime } from "./runtime.ts";
import { reportUsage } from "./usage.ts";

const MAX_BYTES = 60 * 1024 * 1024;
const TYPES: Record<string, { kind: "image" | "video"; mime: string }> = {
  ".jpg": { kind: "image", mime: "image/jpeg" },
  ".jpeg": { kind: "image", mime: "image/jpeg" },
  ".png": { kind: "image", mime: "image/png" },
  ".webp": { kind: "image", mime: "image/webp" },
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".mov": { kind: "video", mime: "video/quicktime" },
  ".webm": { kind: "video", mime: "video/webm" },
};
const ROLES = new Set(["ugc", "producto", "lifestyle", "referencia"]);

/** Ejemplos que "importa" la demo (no hay conexión real con Higgsfield en la demo). */
const HIGGSFIELD_SAMPLES = [
  { kind: "video", title: "UGC · Reseña en la cocina (Higgsfield)", role: "ugc", durationS: 24 },
  {
    kind: "image",
    title: "Foto de producto · fondo limpio (Higgsfield)",
    role: "producto",
    durationS: null,
  },
  {
    kind: "video",
    title: "Reel · del grano a la taza (Higgsfield)",
    role: "lifestyle",
    durationS: 12,
  },
] as const;

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
        title: name.replace(/\.[^.]+$/, "").slice(0, 80),
        source: "subido",
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

  // Importa de Higgsfield. En la demo agrega ejemplos; con una cuenta real lo hace Claude con el conector (skill /traxo:campana).
  app.post("/api/media/import-higgsfield", async (c) => {
    if (!demo())
      return c.json({
        ok: false,
        message:
          "Pídele a Claude: «trae mis videos UGC de Higgsfield» (skill /traxo:campana). Así se conecta con tu cuenta.",
      });
    const have = await db.prisma.mediaAsset.count({
      where: { storeId: sid(c), source: "higgsfield" },
    });
    const next = HIGGSFIELD_SAMPLES.slice(have % 3)
      .concat(HIGGSFIELD_SAMPLES.slice(0, have % 3))
      .slice(0, 2);
    const rows = [];
    for (const [i, s] of next.entries())
      rows.push(
        await db.prisma.mediaAsset.create({
          data: {
            id: `media_${randomUUID().slice(0, 12)}`,
            storeId: sid(c),
            kind: s.kind,
            title: s.title,
            source: "higgsfield",
            role: s.role,
            seed: `hf-${have + i}`,
            durationS: s.durationS,
            sample: true,
          },
        }),
      );
    return c.json({ ok: true, assets: rows.map(view) });
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
