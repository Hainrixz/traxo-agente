// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { ThemeFiles } from "./shopify.ts";

/**
 * Revisa el tema sin necesitar Shopify CLI: JSON válido, secciones y snippets que existen, etiquetas Liquid balanceadas
 * y archivos de assets enlazados. Lista vacía = el tema es coherente (no reemplaza a `shopify theme check`).
 */
export function lintTheme(files: ThemeFiles): string[] {
  const out: string[] = [];
  const has = (p: string): boolean => p in files;

  for (const [path, text] of Object.entries(files)) {
    if (path.endsWith(".json")) {
      try {
        JSON.parse(text);
      } catch {
        out.push(`${path}: JSON inválido.`);
      }
    }
    if (path.endsWith(".liquid")) {
      const m = text.match(/\{% schema %\}([\s\S]*?)\{% endschema %\}/);
      if (m) {
        try {
          JSON.parse(m[1] as string);
        } catch {
          out.push(`${path}: el bloque {% schema %} no es JSON válido.`);
        }
      }
      const body = text.replace(/\{% schema %\}[\s\S]*?\{% endschema %\}/, "");
      for (const [open, close] of [
        ["if", "endif"],
        ["unless", "endunless"],
        ["for", "endfor"],
        ["form", "endform"],
        ["paginate", "endpaginate"],
        ["style", "endstyle"],
      ] as const) {
        const o = [...body.matchAll(new RegExp(`\\{%-?\\s*${open}\\b`, "g"))].length;
        const c = [...body.matchAll(new RegExp(`\\{%-?\\s*${close}\\b`, "g"))].length;
        if (o !== c) out.push(`${path}: {% ${open} %} abiertos ${o}, cerrados ${c}.`);
      }
      for (const r of body.matchAll(/\{%-?\s*render\s+'([\w-]+)'/g))
        if (!has(`snippets/${r[1]}.liquid`)) out.push(`${path}: falta el snippet «${r[1]}».`);
      for (const r of body.matchAll(/\{%-?\s*section\s+'([\w-]+)'/g))
        if (!has(`sections/${r[1]}.liquid`)) out.push(`${path}: falta la sección «${r[1]}».`);
      for (const r of body.matchAll(/'([\w.-]+\.(?:css|js))'\s*\|\s*asset_url/g))
        if (!has(`assets/${r[1]}`)) out.push(`${path}: falta el asset «${r[1]}».`);
    }
  }

  // Cada plantilla JSON apunta a secciones que existen y respeta el orden declarado.
  for (const [path, text] of Object.entries(files)) {
    if (!path.startsWith("templates/") || !path.endsWith(".json")) continue;
    try {
      const t = JSON.parse(text) as {
        sections?: Record<
          string,
          { type: string; blocks?: Record<string, { type: string }>; block_order?: string[] }
        >;
        order?: string[];
      };
      for (const [id, s] of Object.entries(t.sections ?? {})) {
        if (!has(`sections/${s.type}.liquid`))
          out.push(`${path}: la sección «${id}» usa el tipo «${s.type}», que no existe.`);
        for (const b of s.block_order ?? [])
          if (!s.blocks?.[b])
            out.push(`${path}: «${id}» ordena el bloque «${b}», que no está definido.`);
      }
      for (const id of t.order ?? [])
        if (!t.sections?.[id])
          out.push(`${path}: el orden menciona «${id}», que no está en sections.`);
    } catch {
      /* ya se reportó como JSON inválido */
    }
  }
  for (const required of [
    "layout/theme.liquid",
    "config/settings_schema.json",
    "templates/index.json",
  ])
    if (!has(required)) out.push(`Falta ${required}.`);
  return out;
}
