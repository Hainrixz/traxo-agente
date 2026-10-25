#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
// Sube a Railway las variables de tu .env (sin imprimir ningún valor). Requiere la CLI de Railway con sesión y el proyecto enlazado.
//   node scripts/railway-vars.mjs --service traxo-app [--dry-run]
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv } from "./_env.mjs";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const root = resolve(flag("dir") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const service = flag("service");
const dry = argv.includes("--dry-run");
const env = readEnv(root);
// Lo que NO se sube: cosas locales. En Railway la base la inyecta el Postgres del proyecto y los archivos van a un volumen.
const LOCAL = new Set(["PORT", "DATABASE_URL", "TRAXO_MEDIA_DIR", "TRAXO_DATA_DIR"]);
const vars = Object.entries(env).filter(([k, v]) => v && !LOCAL.has(k));
vars.push(["DATABASE_URL", "${{Postgres.DATABASE_URL}}"], ["TRAXO_MEDIA_DIR", "/data/media"]);
if (!service && !dry) {
  console.error("Falta --service <nombre del servicio en Railway>.");
  process.exit(2);
}
let okN = 0;
const failed = [];
for (const [k, v] of vars) {
  if (dry) {
    okN++;
    continue;
  }
  const r = spawnSync(
    "railway",
    ["variables", "--service", service, "--set", `${k}=${v}`, "--skip-deploys"],
    { stdio: ["ignore", "ignore", "ignore"] },
  );
  if (r.status === 0) okN++;
  else failed.push(k);
}
console.log(
  JSON.stringify(
    { ok: failed.length === 0, dryRun: dry, uploaded: okN, failed, names: vars.map(([k]) => k) },
    null,
    2,
  ),
);
process.exit(failed.length ? 1 : 0);
