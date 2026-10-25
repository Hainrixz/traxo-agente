// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type AdPlatform, type CampaignDraftInput, COPY_LIMITS } from "./campaign.ts";

export type SuggestInput = {
  platform: AdPlatform;
  objective: CampaignDraftInput["objective"];
  productTitle: string;
  price: number;
  /** null cuando la tienda no cargó el costo: el margen no se inventa. */
  marginPct: number | null;
  unitsSold: number;
  topCities: string[];
  storeName: string;
  dailyBudget: number;
};

export type Suggestion = {
  copy: CampaignDraftInput["copy"];
  audience: CampaignDraftInput["audience"];
  creatives: CampaignDraftInput["creatives"];
  utmCampaign: string;
  /** Costo estimado de generar los creativos, en créditos (estimado y simulado: el real lo cotiza Higgsfield antes de generar). */
  credits: { image: number; video: number; total: number; estimated: true };
  rationale: string[];
};

const strip = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Recorta en el último espacio antes del límite, sin dejar la frase a medias. */
export const fit = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[,.;:–-]+$/, "")}…`;
};

const short = (title: string): string =>
  title
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\b\d+\s?g\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const CREDITS = { image: 6, video: 40 } as const;

/**
 * Propuesta de campaña a partir de datos reales del producto. Determinista y sin LLM: sirve de punto de partida
 * (y de demo); el copy final lo afina Claude con la skill /traxo:campana.
 */
export function suggestCampaign(i: SuggestInput, now = new Date()): Suggestion {
  const name = short(i.productTitle);
  const cities = i.topCities.slice(0, 3);
  const cityTxt =
    cities.length >= 2
      ? `${cities.slice(0, -1).join(", ")} y ${cities.at(-1)}`
      : (cities[0] ?? "todo el país");
  const L = COPY_LIMITS[i.platform];
  const promise: Record<CampaignDraftInput["objective"], string> = {
    ventas: "Pídelo hoy y págalo al recibir",
    trafico: "Conoce cómo lo tostamos y pruébalo",
    mensajes: "Escríbenos por WhatsApp y te asesoramos",
    reconocimiento: "El sabor de origen, en tu casa",
  };
  const base = `${promise[i.objective]}. Contraentrega en ${cityTxt}.`;

  let headlines: string[];
  let primaryTexts: string[];
  let descriptions: string[];
  if (i.platform === "google") {
    headlines = [
      `${name} a domicilio`,
      "Contraentrega en Colombia",
      "Tostado esta semana",
      "Compra fácil y segura",
      "Envío en 2 a 4 días",
    ].map((h) => fit(h, L.headline));
    primaryTexts = [
      fit(`${name}. ${base}`, L.primaryText),
      fit(`Café de origen colombiano. ${promise[i.objective]}.`, L.primaryText),
    ];
    descriptions = [
      fit(`${name} de ${i.storeName}. Pago contra entrega y envío a todo el país.`, L.description),
      fit("Pide hoy, recibe en pocos días y paga cuando llegue a tu puerta.", L.description),
    ];
  } else if (i.platform === "tiktok") {
    headlines = [
      fit(`${name}: tienes que probarlo`, L.headline),
      fit(`Así sabe ${name}`, L.headline),
    ];
    primaryTexts = [
      fit(`${name} 🇨🇴 ${base}`.replace(/\s🇨🇴/, ""), L.primaryText),
      fit(`Pruébalo y cuéntanos. ${base}`, L.primaryText),
    ];
    descriptions = [fit("Contraentrega disponible", L.description)];
  } else {
    headlines = [
      fit(`${name}, a tu puerta`, L.headline),
      fit(`${name}: pide y paga al recibir`, L.headline),
    ];
    primaryTexts = [
      fit(base, L.primaryText),
      fit(`${name} de ${i.storeName}. ${promise[i.objective]}.`, L.primaryText),
    ];
    descriptions = [fit("Contraentrega disponible", L.description)];
  }

  const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const creatives: Suggestion["creatives"] = [
    {
      kind: "image",
      prompt: `Fotografía de producto de ${name} sobre una mesa de madera clara, luz natural de mañana, fondo desenfocado de cocina colombiana, composición limpia, espacio libre arriba para texto`,
    },
    {
      kind: "image",
      prompt: `Persona en Colombia sirviendo ${name} en una taza de cerámica, plano medio, ambiente cálido, estilo documental, sin texto`,
    },
    {
      kind: "video",
      prompt: `Video vertical de 15 segundos estilo UGC: desempaque de ${name}, primer sorbo y reacción, subtítulos en español, termina con «Pide y paga al recibir»`,
    },
  ];
  const images = creatives.filter((c) => c.kind === "image").length;
  const videos = creatives.length - images;
  const credits = {
    image: CREDITS.image,
    video: CREDITS.video,
    total: images * CREDITS.image + videos * CREDITS.video,
    estimated: true as const,
  };

  const rationale = [
    i.unitsSold > 0
      ? `Se han vendido ${i.unitsSold} unidades de este producto.`
      : "Todavía no hay ventas de este producto: la campaña sirve para probarlo.",
    i.marginPct == null
      ? "Margen N/A: falta cargar el costo del producto para saber cuánto se puede invertir por venta."
      : `Margen del ${i.marginPct} %: con un presupuesto diario de $ ${i.dailyBudget.toLocaleString("es-CO")} cada venta debe dejar más que el costo de conseguirla.`,
    cities.length
      ? `Ciudades con más pedidos: ${cities.join(", ")}.`
      : "Sin historial de ciudades: se apunta a todo el país.",
  ];

  return {
    copy: {
      headlines,
      primaryTexts,
      descriptions,
      cta: i.objective === "mensajes" ? "Enviar mensaje" : "Comprar ahora",
    },
    audience: {
      cities,
      ageMin: 25,
      ageMax: 54,
      interests: ["café de especialidad", "gastronomía", "regalos"],
      customerSegment: undefined,
    },
    creatives,
    utmCampaign: `${strip(name)}-${i.platform}-${yymm}`,
    credits,
    rationale,
  };
}
