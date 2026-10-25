// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { mkdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "./generated/client.ts";

export type Db = {
  prisma: PrismaClient;
  /** "pglite" en local, "postgres" en la nube (Railway). */
  mode: "pglite" | "postgres";
  close(): Promise<void>;
};

const SCHEMA_SQL = (): string =>
  readFileSync(new URL("../prisma/schema.sql", import.meta.url), "utf8");
const PATCHES_SQL = (): string =>
  readFileSync(new URL("../prisma/patches.sql", import.meta.url), "utf8");

export type DbOptions = {
  /** URL de Postgres. Por defecto process.env.DATABASE_URL. Sin URL se usa PGlite. */
  url?: string;
  /** Carpeta de PGlite. "memory://" para tests. Por defecto .traxo-data/pg. */
  dataDir?: string;
};

/**
 * Abre la base de datos y deja el esquema listo (idempotente).
 * Local: PGlite (Postgres real en WASM, sin Docker). Nube: Postgres de Railway.
 */
export async function openDb(opts: DbOptions = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url) {
    const pool = new pg.Pool({ connectionString: url });
    const exists = await pool.query(`SELECT to_regclass('"Store"') AS t`);
    if (!exists.rows[0]?.t) await pool.query(SCHEMA_SQL());
    await pool.query(PATCHES_SQL());
    const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    return {
      prisma,
      mode: "postgres",
      close: async () => {
        await prisma.$disconnect();
        await pool.end();
      },
    };
  }

  const dataDir = opts.dataDir ?? process.env.TRAXO_DATA_DIR ?? ".traxo-data/pg";
  if (!dataDir.startsWith("memory://")) mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  const exists = await lite.query<{ t: string | null }>(`SELECT to_regclass('"Store"') AS t`);
  if (!exists.rows[0]?.t) await lite.exec(SCHEMA_SQL());
  await lite.exec(PATCHES_SQL());
  const prisma = new PrismaClient({ adapter: new PrismaPGlite(lite) });
  return {
    prisma,
    mode: "pglite",
    close: async () => {
      await prisma.$disconnect();
      await lite.close();
    },
  };
}
