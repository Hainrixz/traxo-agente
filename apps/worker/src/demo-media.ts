// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import type { Db } from "@traxo/db";
import { mediaDir, TYPES } from "./media.ts";

export type DemoItem = {
  archivo: string;
  tipo: string;
  titulo: string;
  rol: "ugc" | "producto" | "lifestyle" | "referencia";
  producto: string | null;
  fuente: "higgsfield" | "subido" | "generado";
};

/** Carpeta del material de ejemplo (nunca va al repositorio: son marcas de terceros). */
export const demoMediaRoot = (): string =>
  resolve(process.env.TRAXO_DEMO_MEDIA_DIR ?? "demo-media");

export function demoCatalog(): DemoItem[] {
  try {
    const j = JSON.parse(readFileSync(join(demoMediaRoot(), "catalogo.json"), "utf8")) as {
      archivos?: DemoItem[];
    };
    return j.archivos ?? [];
  } catch {
    return [];
  }
}

/**
 * Carga a la biblioteca los archivos del catálogo que aún no estén (por título: repetirlo no duplica).
 * No llama a Higgsfield ni gasta créditos: solo copia archivos locales.
 */
export async function loadDemoMedia(
  db: Db,
  storeId: string,
  opts: { only?: DemoItem["fuente"] } = {},
): Promise<{ imported: number; missing: number }> {
  const root = demoMediaRoot();
  let imported = 0;
  let missing = 0;
  for (const it of demoCatalog()) {
    if (opts.only && it.fuente !== opts.only) continue;
    const title = it.titulo.slice(0, 80);
    if (await db.prisma.mediaAsset.findFirst({ where: { storeId, title } })) continue;
    const src = join(root, it.archivo);
    const type = TYPES[extname(src).toLowerCase()];
    if (!type || !existsSync(src) || !src.startsWith(root)) {
      missing++;
      continue;
    }
    const id = `media_${randomUUID().slice(0, 12)}`;
    const file = `${id}${extname(src).toLowerCase()}`;
    copyFileSync(src, join(mediaDir(), file));
    await db.prisma.mediaAsset.create({
      data: {
        id,
        storeId,
        kind: type.kind,
        title,
        source: it.fuente,
        role: it.rol,
        product: it.producto,
        file,
        mime: type.mime,
        bytes: statSync(src).size,
      },
    });
    imported++;
  }
  return { imported, missing };
}
