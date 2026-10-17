import { randomUUID } from "node:crypto";
import {
  buildShopifyTheme,
  defaultDesign,
  lintTheme,
  previewHtml,
  SECTION_CATALOG,
  STYLE_IDS,
  STYLES,
  type StoreDesign,
  StoreDesignSchema,
  zipFiles,
} from "@traxo/storefront";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { askClaude } from "./ai.ts";
import { storeOf } from "./auth.ts";
import { BUILT_PAGES, checkEmbeddable } from "./built-pages.ts";
import { isDemo } from "./mode.ts";
import type { Runtime } from "./runtime.ts";

const PLATFORMS = ["shopify", "tiendanube", "woocommerce", "otra"] as const;
const STATUSES = ["borrador", "generado", "en-github", "subido"] as const;

const slug = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "tienda";

/** El tema real solo existe para Shopify; para las demás plataformas se entrega el sitio estático y el diseño en JSON. */
export function filesFor(platform: string, d: StoreDesign): Record<string, string> {
  if (platform === "shopify") return buildShopifyTheme(d);
  return {
    "index.html": previewHtml(d),
    "diseno.json": `${JSON.stringify(d, null, 2)}\n`,
    "LEEME.md": `# ${d.brand}: diseño de tienda generado por Traxo

Esta plataforma (${platform}) no admite todavía un tema automático. Aquí tienes:
- \`index.html\`: la portada lista para ver en cualquier navegador.
- \`diseno.json\`: colores, fuentes, textos y secciones, para llevarlos a tu plantilla.
`,
  };
}

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  platform: z.enum(PLATFORMS).optional(),
  status: z.enum(STATUSES).optional(),
  githubUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://github.com/"), "Debe ser un enlace de github.com.")
    .nullable()
    .optional(),
  note: z.string().max(300).nullable().optional(),
  design: z.record(z.string(), z.unknown()).optional(),
});

/** Merge superficial por clave (palette, copy, fonts, contact se mezclan; listas se reemplazan). */
function mergeDesign(base: StoreDesign, patch: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] =
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur)
        ? { ...(cur as object), ...(v as object) }
        : v;
  }
  return out;
}

const AiPatchSchema = z.object({
  tagline: z.string().max(120).optional(),
  headline: z.string().min(3).max(90).optional(),
  sub: z.string().max(220).optional(),
  story: z.string().max(600).optional(),
  cta: z.string().min(2).max(28).optional(),
});

/** Claude pule los textos (nunca los colores ni los datos). Si no hay IA, cupo o respuesta válida, quedan los de reglas. */
async function polishCopy(storeId: string, d: StoreDesign): Promise<StoreDesign> {
  const out = await askClaude(storeId, {
    feature: "Diseño de tienda",
    system:
      "Eres redactor de e-commerce para Colombia. Escribes los textos de la portada de una tienda en español natural y cercano. " +
      "No inventes cifras, premios, reseñas, años de experiencia ni promesas de envío gratis. Si no sabes algo, no lo menciones. " +
      'Responde SOLO un JSON: {"tagline":"máx 120","headline":"máx 90","sub":"máx 220","story":"máx 500, solo si hay base real para escribirla","cta":"máx 28"}.',
    user: `Marca y catálogo:\n<datos>${JSON.stringify({ brand: d.brand, tone: d.tone, style: d.style, products: d.products.map((p) => p.title) }).slice(0, 1500)}</datos>`,
    maxTokens: 500,
  });
  if (!out) return d;
  try {
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const p = AiPatchSchema.safeParse(json);
    if (!p.success) return d;
    const next = StoreDesignSchema.safeParse({
      ...d,
      tagline: p.data.tagline ?? d.tagline,
      copy: {
        ...d.copy,
        headline: p.data.headline ?? d.copy.headline,
        sub: p.data.sub ?? d.copy.sub,
        story: p.data.story ?? d.copy.story,
        cta: p.data.cta ?? d.copy.cta,
      },
    });
    return next.success ? next.data : d;
  } catch {
    return d;
  }
}

export function registerBuilderApi(app: Hono, rt: Runtime): void {
  const { db } = rt;
  const sid = (c: Context): string => storeOf(c, rt.storeId);
  const find = (c: Context) =>
    db.prisma.siteProject.findFirst({ where: { id: c.req.param("id") ?? "", storeId: sid(c) } });
  const view = (r: NonNullable<Awaited<ReturnType<typeof find>>>) => ({
    ...r,
    design: r.design as StoreDesign,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  });
  const notFound = (c: Context) => c.json({ ok: false, message: "No encuentro ese diseño." }, 404);

  app.get("/api/builder/catalog", (c) =>
    c.json({
      styles: STYLE_IDS.map((id) => ({ id, ...STYLES[id] })),
      sections: SECTION_CATALOG.map(({ id, label }) => ({ id, label })),
      platforms: PLATFORMS,
    }),
  );

  // Páginas ya construidas de referencia: solo la cuenta de ejemplo en modo demo; el resto ve la lista vacía.
  app.get("/api/builder/pages", (c) =>
    c.json(isDemo() && sid(c) === rt.storeId ? BUILT_PAGES : []),
  );

  app.get("/api/builder/pages/:id/embeddable", async (c) => {
    const page =
      isDemo() && sid(c) === rt.storeId
        ? BUILT_PAGES.find((p) => p.id === c.req.param("id"))
        : undefined;
    if (!page) return c.json({ ok: false, message: "No encuentro esa página." }, 404);
    return c.json({ embeddable: await checkEmbeddable(page.url) });
  });

  app.get("/api/builder", async (c) =>
    c.json(
      (
        await db.prisma.siteProject.findMany({
          where: { storeId: sid(c) },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      ).map(view),
    ),
  );

  app.post("/api/builder", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const store = await db.prisma.store.findUnique({ where: { id: sid(c) } });
    const products = await db.prisma.product.findMany({ where: { storeId: sid(c) }, take: 8 });
    const style = STYLE_IDS.includes(b.style as never)
      ? (b.style as (typeof STYLE_IDS)[number])
      : "limpio";
    const tone = ["cercano", "profesional", "divertido"].includes(String(b.tone))
      ? (b.tone as StoreDesign["tone"])
      : "cercano";
    const known = PLATFORMS.includes(String(b.platform) as never)
      ? String(b.platform)
      : PLATFORMS.includes(String(store?.platform) as never)
        ? String(store?.platform)
        : "shopify";
    const sections = Array.isArray(b.sections)
      ? SECTION_CATALOG.map((s) => s.id).filter((id) => (b.sections as unknown[]).includes(id))
      : undefined;
    let design: StoreDesign;
    try {
      design = defaultDesign({
        brand: String(b.brand ?? store?.name ?? "Mi tienda"),
        style,
        tone,
        tagline: typeof b.tagline === "string" ? b.tagline : undefined,
        products: products.map((p) => ({ title: p.title, price: p.price, imageUrl: p.imageUrl })),
        whatsapp: typeof b.whatsapp === "string" ? b.whatsapp : undefined,
        cod: b.cod === false ? false : true,
        sections: sections?.length ? sections : undefined,
      });
    } catch {
      return c.json({ ok: false, message: "Revisa el nombre, el estilo y las secciones." }, 400);
    }
    if (b.ai !== false) design = await polishCopy(sid(c), design);
    const row = await db.prisma.siteProject.create({
      data: {
        id: `site_${randomUUID().slice(0, 12)}`,
        storeId: sid(c),
        name: String(b.name ?? `Tienda ${design.brand}`).slice(0, 80),
        platform: known,
        design: design as object,
      },
    });
    return c.json({ ok: true, project: view(row) });
  });

  app.get("/api/builder/:id", async (c) => {
    const r = await find(c);
    return r ? c.json(view(r)) : notFound(c);
  });

  // PATCH para el panel; POST para quien solo puede hacer GET/POST (el servidor MCP).
  app.on(["PATCH", "POST"], "/api/builder/:id", async (c) => {
    const r = await find(c);
    if (!r) return notFound(c);
    const p = PatchSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!p.success)
      return c.json({ ok: false, message: p.error.issues[0]?.message ?? "Datos no válidos." }, 400);
    let design = r.design as StoreDesign;
    if (p.data.design) {
      const next = StoreDesignSchema.safeParse(mergeDesign(design, p.data.design));
      if (!next.success)
        return c.json(
          { ok: false, message: next.error.issues[0]?.message ?? "Diseño no válido." },
          400,
        );
      design = next.data;
    }
    const row = await db.prisma.siteProject.update({
      where: { id: r.id },
      data: {
        design: design as object,
        ...(p.data.name ? { name: p.data.name } : {}),
        ...(p.data.platform ? { platform: p.data.platform } : {}),
        ...(p.data.status ? { status: p.data.status } : {}),
        ...(p.data.githubUrl !== undefined ? { githubUrl: p.data.githubUrl } : {}),
        ...(p.data.note !== undefined ? { note: p.data.note } : {}),
        updatedAt: new Date(),
      },
    });
    return c.json({ ok: true, project: view(row) });
  });

  app.delete("/api/builder/:id", async (c) => {
    const r = await find(c);
    if (!r) return notFound(c);
    await db.prisma.siteProject.delete({ where: { id: r.id } });
    return c.json({ ok: true });
  });

  // Vista previa: HTML autosuficiente dentro de un marco sin scripts, con una política de contenido estricta.
  app.get("/api/builder/:id/preview", async (c) => {
    const r = await find(c);
    if (!r) return notFound(c);
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    );
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Cache-Control", "no-store");
    return c.html(previewHtml(r.design as StoreDesign, { preview: true }));
  });

  // Archivos del tema como JSON (los usa la herramienta MCP para escribirlos en tu carpeta) y el informe de revisión.
  app.get("/api/builder/:id/bundle", async (c) => {
    const r = await find(c);
    if (!r) return notFound(c);
    const files = filesFor(r.platform, r.design as StoreDesign);
    return c.json({
      platform: r.platform,
      name: r.name,
      files,
      problems: r.platform === "shopify" ? lintTheme(files) : [],
    });
  });

  app.get("/api/builder/:id/theme.zip", async (c) => {
    const r = await find(c);
    if (!r) return notFound(c);
    const files = filesFor(r.platform, r.design as StoreDesign);
    if (r.status === "borrador")
      await db.prisma.siteProject.update({ where: { id: r.id }, data: { status: "generado" } });
    c.header("Content-Type", "application/zip");
    c.header(
      "Content-Disposition",
      `attachment; filename="${slug((r.design as StoreDesign).brand)}-${r.platform === "shopify" ? "tema-shopify" : "sitio"}.zip"`,
    );
    return c.body(zipFiles(files) as unknown as ArrayBuffer);
  });
}
