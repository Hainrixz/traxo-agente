import { z } from "zod";

/** Secciones que puede llevar la portada. El orden de la lista es el orden en la página. */
export const SECTION_CATALOG = [
  { id: "hero", label: "Portada con promesa y botón", type: "hero" },
  { id: "beneficios", label: "Beneficios: envío, contraentrega, seguimiento", type: "benefits" },
  { id: "productos", label: "Productos destacados", type: "featured-products" },
  { id: "historia", label: "Historia de la marca", type: "story" },
  { id: "prueba-social", label: "Reseñas de clientes reales", type: "social-proof" },
  { id: "contraentrega", label: "Banner de pago contraentrega", type: "cod-banner" },
  { id: "faq", label: "Preguntas frecuentes", type: "faq" },
  { id: "whatsapp", label: "Botón flotante de WhatsApp", type: "whatsapp-cta" },
] as const;
export type SectionId = (typeof SECTION_CATALOG)[number]["id"];
export const SECTION_IDS = SECTION_CATALOG.map((s) => s.id) as [SectionId, ...SectionId[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Usa un color hex de 6 dígitos, como #1A1A1A.");

export const PaletteSchema = z.object({
  bg: hex,
  surface: hex,
  text: hex,
  muted: hex,
  accent: hex,
  accentText: hex,
});
export type Palette = z.infer<typeof PaletteSchema>;

/** Relación de contraste WCAG entre dos colores hex (1 a 21). */
export function contrast(a: string, b: string): number {
  const lum = (h: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = Number.parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Problemas de legibilidad de una paleta (AA = 4,5:1). Lista vacía = cumple. */
export function paletteProblems(p: Palette): string[] {
  const pairs: Array<[string, string, string]> = [
    [p.text, p.bg, "el texto sobre el fondo"],
    [p.text, p.surface, "el texto sobre las tarjetas"],
    [p.muted, p.bg, "el texto secundario sobre el fondo"],
    [p.muted, p.surface, "el texto secundario sobre las tarjetas"],
    [p.accentText, p.accent, "el texto de los botones"],
  ];
  return pairs
    .filter(([fg, bg]) => contrast(fg, bg) < 4.5)
    .map(
      ([fg, bg, what]) =>
        `Poco contraste en ${what} (${contrast(fg, bg).toFixed(1)}:1; se necesita 4,5:1).`,
    );
}

export const STYLE_IDS = ["calido", "limpio", "audaz", "premium"] as const;
export type StyleId = (typeof STYLE_IDS)[number];

/** Fuentes que Shopify aloja: nombre → handle del selector de fuentes (regular y negrita). */
export const FONTS: Record<string, { regular: string; bold: string }> = {
  Archivo: { regular: "archivo_n4", bold: "archivo_n7" },
  Inter: { regular: "inter_n4", bold: "inter_n7" },
  "DM Sans": { regular: "dm_sans_n4", bold: "dm_sans_n7" },
  Lora: { regular: "lora_n4", bold: "lora_n7" },
  "Playfair Display": { regular: "playfair_display_n4", bold: "playfair_display_n7" },
};

export const STYLES: Record<
  StyleId,
  { label: string; text: string; palette: Palette; fonts: { heading: string; body: string } }
> = {
  calido: {
    label: "Cálido y artesanal",
    text: "Tonos tierra, serif en los títulos. Para café, comida, hogar y productos hechos a mano.",
    palette: {
      bg: "#FBF7F0",
      surface: "#FFFFFF",
      text: "#2B2118",
      muted: "#6B5B4D",
      accent: "#A64B1B",
      accentText: "#FFFFFF",
    },
    fonts: { heading: "Lora", body: "DM Sans" },
  },
  limpio: {
    label: "Limpio y moderno",
    text: "Blanco, negro y mucho aire. Para moda, tecnología y catálogos grandes.",
    palette: {
      bg: "#FFFFFF",
      surface: "#F4F5F7",
      text: "#111827",
      muted: "#4B5563",
      accent: "#111827",
      accentText: "#FFFFFF",
    },
    fonts: { heading: "Inter", body: "Inter" },
  },
  audaz: {
    label: "Audaz y llamativo",
    text: "Negro con mostaza, títulos grandes. Para marcas jóvenes y ofertas que deben verse.",
    palette: {
      bg: "#FFFDF5",
      surface: "#FFFFFF",
      text: "#0B0B0B",
      muted: "#4A4A4A",
      accent: "#F2B705",
      accentText: "#0B0B0B",
    },
    fonts: { heading: "Archivo", body: "Archivo" },
  },
  premium: {
    label: "Oscuro y premium",
    text: "Fondo oscuro con dorado suave. Para joyería, cosmética y productos de ticket alto.",
    palette: {
      bg: "#0F0F10",
      surface: "#1A1A1C",
      text: "#F5F2EA",
      muted: "#B8B2A4",
      accent: "#D9B26F",
      accentText: "#1A1308",
    },
    fonts: { heading: "Playfair Display", body: "Inter" },
  },
};

export const StoreDesignSchema = z
  .object({
    brand: z.string().min(1).max(60),
    tagline: z.string().max(120).default(""),
    tone: z.enum(["cercano", "profesional", "divertido"]).default("cercano"),
    style: z.enum(STYLE_IDS).default("limpio"),
    palette: PaletteSchema,
    fonts: z.object({
      heading: z.string().refine((f) => f in FONTS, "Fuente no disponible."),
      body: z.string().refine((f) => f in FONTS, "Fuente no disponible."),
    }),
    sections: z.array(z.enum(SECTION_IDS)).min(1).max(SECTION_IDS.length),
    copy: z.object({
      headline: z.string().min(3).max(90),
      sub: z.string().max(220).default(""),
      cta: z.string().min(2).max(28).default("Ver productos"),
      story: z.string().max(600).default(""),
      benefits: z
        .array(z.object({ title: z.string().max(40), text: z.string().max(120) }))
        .max(4)
        .default([]),
      faq: z
        .array(z.object({ q: z.string().max(100), a: z.string().max(400) }))
        .max(6)
        .default([]),
    }),
    products: z
      .array(
        z.object({
          title: z.string().max(100),
          price: z.number().int().nonnegative(),
          image: z.string().url().optional(),
        }),
      )
      .max(12)
      .default([]),
    contact: z.object({ whatsapp: z.string().max(20).optional() }).default({}),
    /** Muestra que se puede pagar al recibir. */
    cod: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    for (const m of paletteProblems(d.palette))
      ctx.addIssue({ code: "custom", path: ["palette"], message: m });
  });
export type StoreDesign = z.infer<typeof StoreDesignSchema>;

const norm = (s: string): string => s.trim().replace(/\s+/g, " ");

/**
 * Diseño de partida con reglas, sin IA: toma el nombre de la marca, el estilo y el catálogo real.
 * No inventa cifras ni reseñas: lo que no se sabe se deja para que la persona lo escriba.
 */
export function defaultDesign(input: {
  brand: string;
  style?: StyleId;
  tone?: StoreDesign["tone"];
  tagline?: string;
  products?: Array<{ title: string; price: number; imageUrl?: string | null }>;
  whatsapp?: string;
  cod?: boolean;
  sections?: SectionId[];
}): StoreDesign {
  const style = input.style ?? "limpio";
  const tone = input.tone ?? "cercano";
  const brand = norm(input.brand).slice(0, 60) || "Mi tienda";
  const preset = STYLES[style];
  const cod = input.cod ?? true;
  const first = input.products?.[0]?.title;
  const headline =
    tone === "profesional"
      ? `${brand}: ${first ? first.toLowerCase() : "calidad que se nota"}`.slice(0, 90)
      : tone === "divertido"
        ? `Aquí empieza tu antojo de ${brand}`.slice(0, 90)
        : first
          ? `${first}, directo a tu puerta`.slice(0, 90)
          : `Bienvenido a ${brand}`.slice(0, 90);
  const benefits = [
    {
      title: "Enviamos a toda Colombia",
      text: "Elegimos la transportadora que mejor llega a tu ciudad.",
    },
    ...(cod
      ? [{ title: "Pagas al recibir", text: "Contraentrega en las ciudades con cobertura." }]
      : []),
    { title: "Te avisamos por WhatsApp", text: "Sabes cuándo sale y cuándo llega tu pedido." },
  ];
  const faq = [
    {
      q: "¿Cuánto tarda mi envío?",
      a: "Te mostramos el tiempo estimado al comprar y te avisamos por WhatsApp cuando sale y cuando llega.",
    },
    ...(cod
      ? [
          {
            q: "¿Puedo pagar al recibir?",
            a: "Sí, en las ciudades con cobertura. Confirmas tu pedido por WhatsApp y pagas cuando lo recibes.",
          },
        ]
      : []),
    {
      q: "¿Cómo rastreo mi pedido?",
      a: "Te enviamos el número de guía por WhatsApp y puedes consultarlo en la página de la transportadora.",
    },
  ];
  const wanted = input.sections ?? SECTION_IDS.filter((s) => cod || s !== "contraentrega");
  return StoreDesignSchema.parse({
    brand,
    tagline: norm(input.tagline ?? "").slice(0, 120),
    tone,
    style,
    palette: preset.palette,
    fonts: preset.fonts,
    sections: SECTION_IDS.filter((s) => wanted.includes(s)),
    copy: {
      headline,
      sub: input.tagline ? norm(input.tagline).slice(0, 220) : "",
      cta: "Ver productos",
      story: "",
      benefits,
      faq,
    },
    products: (input.products ?? []).slice(0, 8).map((p) => ({
      title: p.title.slice(0, 100),
      price: Math.max(0, Math.round(p.price)),
      ...(p.imageUrl?.startsWith("https://") ? { image: p.imageUrl } : {}),
    })),
    contact: input.whatsapp ? { whatsapp: input.whatsapp.replace(/\D/g, "").slice(0, 15) } : {},
    cod,
  });
}
