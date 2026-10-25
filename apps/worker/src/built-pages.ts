// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
/**
 * Páginas construidas de referencia (solo modo demo, cuenta de ejemplo). Es el ÚNICO lugar donde se definen:
 * para sumar otra, agrega un objeto a BUILT_PAGES y deja su captura en apps/dashboard/public/paginas/.
 * Una cuenta nueva no las ve: ahí «Páginas construidas» sale vacío hasta que construya las suyas.
 */
export type BuiltPage = {
  id: string;
  name: string;
  description: string;
  /** Sitio ya publicado. Debe ser https y, para verse dentro del panel, permitir iframe. */
  url: string;
  /** Código fuente (opcional). */
  repo?: string;
  /** Capturas de respaldo (rutas públicas del panel) si el iframe no carga. */
  shots: { pc: string; mobile: string };
  tools: string[];
  /** «referencia» = ejemplo hecho por Traxo, no un proyecto de la cuenta. */
  kind: "referencia";
};

export const BUILT_PAGES: BuiltPage[] = [
  {
    id: "claudio-dogs",
    name: "Claudio Dogs",
    description:
      "Landing de estética canina en la Roma, CDMX. Hecha con WebKit Builder (Next.js + Tailwind) y publicada en Vercel.",
    url: "https://claudio-dogs.vercel.app",
    repo: "https://github.com/Hainrixz/claude-webkit",
    shots: { pc: "/paginas/claudio-dogs-pc.jpg", mobile: "/paginas/claudio-dogs-movil.jpg" },
    tools: ["WebKit Builder", "UI/UX Pro Max", "Emil Kowalski", "GitHub"],
    kind: "referencia",
  },
];

/** Dominios que el panel puede mostrar en un marco (los https de BUILT_PAGES). */
export const framedOrigins = (): string[] => [
  ...new Set(BUILT_PAGES.map((p) => new URL(p.url).origin)),
];

const embedCache = new Map<string, { ok: boolean; at: number }>();

/**
 * ¿La página se puede mostrar en un marco? Lo decide el sitio con X-Frame-Options o frame-ancestors.
 * Solo se consultan las URLs de BUILT_PAGES (nunca una que mande el usuario). El resultado se guarda 10 minutos.
 */
export async function checkEmbeddable(url: string, f: typeof fetch = fetch): Promise<boolean> {
  if (!BUILT_PAGES.some((p) => p.url === url)) return false;
  const hit = embedCache.get(url);
  if (hit && Date.now() - hit.at < 600_000) return hit.ok;
  let ok = false;
  try {
    const r = await f(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    const xfo = (r.headers.get("x-frame-options") ?? "").toLowerCase();
    const fa = /frame-ancestors([^;]*)/i.exec(r.headers.get("content-security-policy") ?? "")?.[1];
    ok =
      r.ok &&
      !xfo.includes("deny") &&
      !xfo.includes("sameorigin") &&
      (!fa || fa.includes("*") || fa.includes("https:"));
  } catch {
    ok = false;
  }
  embedCache.set(url, { ok, at: Date.now() });
  return ok;
}

export const resetEmbedCache = (): void => embedCache.clear();
