import { z } from "zod";

export const AdPlatform = z.enum(["meta", "google", "tiktok"]);
export type AdPlatform = z.infer<typeof AdPlatform>;

/**
 * Un borrador de campaña NUNCA es "ACTIVE": nace como borrador local (DRAFT) o, si se creó en la plataforma, en pausa (PAUSED).
 * Activarla es de la persona, en la plataforma.
 */
export const CampaignStatus = z.enum(["DRAFT", "PAUSED"]);

export const CreativeSchema = z.object({
  kind: z.enum(["image", "video"]),
  /** Prompt listo para Higgsfield u otro generador. Generar cuesta créditos y se aprueba aparte. */
  prompt: z.string().min(10),
  /** URL del archivo si ya se generó. */
  url: z.string().url().optional(),
  /** Si el creativo sale de la biblioteca del usuario (UGC, foto de producto…), su id: no cuesta créditos. */
  assetId: z.string().optional(),
  generated: z.boolean().optional(),
  seed: z.string().optional(),
});

export const CampaignDraftInputSchema = z.object({
  platform: AdPlatform,
  productId: z.string().optional(),
  productTitle: z.string().min(2),
  objective: z.enum(["ventas", "trafico", "mensajes", "reconocimiento"]).default("ventas"),
  /** Presupuesto diario en COP. */
  dailyBudget: z.number().int().positive(),
  audience: z.object({
    cities: z.array(z.string()).default([]),
    ageMin: z.number().int().min(18).max(65).default(22),
    ageMax: z.number().int().min(18).max(65).default(55),
    interests: z.array(z.string()).default([]),
    /** Segmento de clientes de la base para audiencias personalizadas o excluir (p. ej. "inactivo"). */
    customerSegment: z.string().optional(),
  }),
  copy: z.object({
    headlines: z.array(z.string().min(1)).min(1),
    primaryTexts: z.array(z.string().min(1)).min(1),
    descriptions: z.array(z.string()).default([]),
    cta: z.string().default("Comprar ahora"),
  }),
  creatives: z.array(CreativeSchema).default([]),
  /** Valor de utm_campaign de los enlaces del anuncio: es lo que permite saber qué pedidos trajo. */
  utmCampaign: z.string().optional(),
});
export type CampaignDraftInput = z.infer<typeof CampaignDraftInputSchema>;

/** Límites de caracteres por plataforma (texto del anuncio). */
export const COPY_LIMITS: Record<
  AdPlatform,
  {
    headline: number;
    primaryText: number;
    description: number;
    minHeadlines?: number;
    maxHeadlines?: number;
  }
> = {
  meta: { headline: 40, primaryText: 125, description: 30 },
  google: { headline: 30, primaryText: 90, description: 90, minHeadlines: 3, maxHeadlines: 15 },
  tiktok: { headline: 40, primaryText: 100, description: 100 },
};

/** Devuelve los problemas del copy en español; lista vacía = cumple los límites. */
export function validateCopy(
  platform: AdPlatform,
  copy: Pick<CampaignDraftInput["copy"], "headlines" | "primaryTexts" | "descriptions">,
): string[] {
  const lim = COPY_LIMITS[platform];
  const errs: string[] = [];
  copy.headlines.forEach((h, i) => {
    if (h.length > lim.headline)
      errs.push(
        `Título ${i + 1} tiene ${h.length} caracteres; ${platform} permite ${lim.headline}.`,
      );
  });
  copy.primaryTexts.forEach((t, i) => {
    if (t.length > lim.primaryText)
      errs.push(
        `Texto ${i + 1} tiene ${t.length} caracteres; ${platform} recomienda hasta ${lim.primaryText}.`,
      );
  });
  copy.descriptions.forEach((d, i) => {
    if (d.length > lim.description)
      errs.push(
        `Descripción ${i + 1} tiene ${d.length} caracteres; ${platform} permite ${lim.description}.`,
      );
  });
  if (lim.minHeadlines && copy.headlines.length < lim.minHeadlines)
    errs.push(`${platform} necesita al menos ${lim.minHeadlines} títulos.`);
  if (lim.maxHeadlines && copy.headlines.length > lim.maxHeadlines)
    errs.push(`${platform} admite máximo ${lim.maxHeadlines} títulos.`);
  return errs;
}

const PLATFORM_NAME: Record<AdPlatform, string> = {
  meta: "Meta (Facebook e Instagram)",
  google: "Google Ads",
  tiktok: "TikTok Ads",
};

/** Borrador exportable, listo para copiar a la plataforma. */
export function renderCampaignMarkdown(
  d: CampaignDraftInput & { id: string; status: "DRAFT" | "PAUSED"; createdAt: string },
): string {
  const cop = (n: number) => `$ ${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  const list = (xs: string[]) => xs.map((x) => `- ${x} (${x.length})`).join("\n");
  return [
    `# Campaña ${d.productTitle} · ${PLATFORM_NAME[d.platform]}`,
    "",
    `Estado: **${d.status === "PAUSED" ? "creada en pausa" : "borrador, no creada en la plataforma"}**. Actívala tú, en la plataforma, cuando la hayas revisado.`,
    `Id: ${d.id} · ${d.createdAt.slice(0, 10)}`,
    "",
    `## Objetivo y presupuesto`,
    `- Objetivo: ${d.objective}`,
    `- Presupuesto diario: ${cop(d.dailyBudget)}`,
    "",
    `## Público`,
    `- Ciudades: ${d.audience.cities.join(", ") || "todo el país"}`,
    `- Edad: ${d.audience.ageMin}–${d.audience.ageMax}`,
    `- Intereses: ${d.audience.interests.join(", ") || "—"}`,
    d.audience.customerSegment
      ? `- Segmento de la base de clientes: ${d.audience.customerSegment}`
      : "",
    "",
    `## Copy (entre paréntesis, caracteres)`,
    `Títulos:\n${list(d.copy.headlines)}`,
    `\nTextos principales:\n${list(d.copy.primaryTexts)}`,
    d.copy.descriptions.length ? `\nDescripciones:\n${list(d.copy.descriptions)}` : "",
    `\nLlamado a la acción: ${d.copy.cta}`,
    "",
    `## Creativos`,
    d.creatives.length
      ? d.creatives
          .map(
            (c, i) =>
              `${i + 1}. ${c.kind === "image" ? "Imagen" : "Video"}${c.url ? ` (${c.url})` : " (sin generar)"}\n   Prompt: ${c.prompt}`,
          )
          .join("\n")
      : "Sin creativos todavía.",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
