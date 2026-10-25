#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { randomBytes } from "node:crypto";
// Asistente de configuración de Traxo (no interactivo: lo maneja /traxo:instalar o tú con --answers).
// Crea el .env con lo que NO es secreto ya puesto, genera los secretos propios (sesión, token de MCP, contraseña de admin)
// y deja en blanco las llaves de terceros para que las pongas tú en el archivo. Nunca imprime ningún valor.
//
//   node scripts/setup.mjs --answers '{"adminEmail":"yo@mitienda.co","platform":"shopify","storeDomain":"mitienda.myshopify.com"}'
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv, WHERE } from "./_env.mjs";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const root = resolve(flag("dir") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
let a = {};
try {
  a = flag("answers-file")
    ? JSON.parse(readFileSync(flag("answers-file"), "utf8"))
    : JSON.parse(flag("answers") ?? "{}");
} catch {
  console.error(JSON.stringify({ ok: false, error: "Las respuestas no son un JSON válido." }));
  process.exit(2);
}
const clean = (v, max = 120) =>
  String(v ?? "")
    .replace(/[\r\n"'`$\\]/g, "")
    .trim()
    .slice(0, max);
const hex = (n) => randomBytes(n).toString("hex");
const pass = () => randomBytes(18).toString("base64url");

const had = readEnv(root);
const env = { ...had };
const generated = [];
const keep = (k, v) => {
  // Lo que ya tenías se respeta; solo se rellena lo que falta.
  if (env[k] === undefined || env[k] === "") env[k] = v ?? "";
};
const gen = (k, make) => {
  if (!env[k]) {
    env[k] = make();
    generated.push(k);
  }
};

gen("TRAXO_SESSION_SECRET", () => hex(32));
gen("TRAXO_MCP_TOKEN", () => hex(24));
if (a.adminEmail) env.TRAXO_ADMIN_EMAIL = clean(a.adminEmail);
keep("TRAXO_ADMIN_EMAIL", "");
gen("TRAXO_ADMIN_PASSWORD", pass);
if (a.storeName) env.TRAXO_STORE_NAME = clean(a.storeName);
keep("TRAXO_STORE_NAME", "Mi tienda");
if (a.storeUrl) env.TRAXO_STORE_URL = clean(a.storeUrl, 200);
keep("TRAXO_STORE_URL", "");

const platform = clean(a.platform);
if (platform === "shopify") {
  if (a.storeDomain) env.SHOPIFY_STORE_DOMAIN = clean(a.storeDomain, 200);
  keep("SHOPIFY_STORE_DOMAIN", "");
  keep("SHOPIFY_ADMIN_TOKEN", "");
  keep("SHOPIFY_WEBHOOK_SECRET", "");
  keep("SHOPIFY_API_VERSION", "2026-07");
} else if (platform === "tiendanube") {
  if (a.storeId) env.TIENDANUBE_STORE_ID = clean(a.storeId);
  keep("TIENDANUBE_STORE_ID", "");
  keep("TIENDANUBE_ACCESS_TOKEN", "");
  keep("TIENDANUBE_APP_SECRET", "");
} else if (platform === "woocommerce") {
  if (a.storeDomain) env.WOOCOMMERCE_URL = clean(a.storeDomain, 200);
  keep("WOOCOMMERCE_URL", "");
  keep("WOOCOMMERCE_KEY", "");
  keep("WOOCOMMERCE_SECRET", "");
}
if (a.envia) {
  keep("ENVIA_TOKEN", "");
  keep("ENVIA_ENV", "sandbox");
  keep("ENVIA_WEBHOOK_SECRET", "");
}
if (a.zernio) {
  keep("ZERNIO_API_KEY", "");
  keep("ZERNIO_WEBHOOK_SECRET", "");
}
if (a.wompi) {
  keep("WOMPI_PRIVATE_KEY", "");
  keep("WOMPI_ENV", "sandbox");
  keep("WOMPI_EVENTS_SECRET", "");
}
if (a.ai) keep("ANTHROPIC_API_KEY", "");
const o = a.origin ?? {};
for (const [k, v] of [
  ["ORIGIN_NAME", o.name],
  ["ORIGIN_PHONE", o.phone],
  ["ORIGIN_STREET", o.street],
  ["ORIGIN_CITY", o.city],
  ["ORIGIN_DANE", o.dane],
])
  if (v) env[k] = clean(v, 120);
keep("PORT", "8787");

// Valores con espacios o # van entre comillas (si no, el # empezaría un comentario).
const q = (v) => (/[#\s]/.test(v) ? `"${v}"` : v);

const SECTIONS = [
  [
    "Acceso al panel y sesiones (generado por el asistente)",
    [
      "TRAXO_ADMIN_EMAIL",
      "TRAXO_ADMIN_PASSWORD",
      "TRAXO_SESSION_SECRET",
      "TRAXO_MCP_TOKEN",
      "TRAXO_STORE_NAME",
      "TRAXO_STORE_URL",
    ],
  ],
  [
    "Tu tienda",
    [
      "SHOPIFY_STORE_DOMAIN",
      "SHOPIFY_ADMIN_TOKEN",
      "SHOPIFY_WEBHOOK_SECRET",
      "SHOPIFY_API_VERSION",
      "TIENDANUBE_STORE_ID",
      "TIENDANUBE_ACCESS_TOKEN",
      "TIENDANUBE_APP_SECRET",
      "WOOCOMMERCE_URL",
      "WOOCOMMERCE_KEY",
      "WOOCOMMERCE_SECRET",
    ],
  ],
  [
    "Envíos",
    [
      "ENVIA_TOKEN",
      "ENVIA_ENV",
      "ENVIA_WEBHOOK_SECRET",
      "ORIGIN_NAME",
      "ORIGIN_PHONE",
      "ORIGIN_STREET",
      "ORIGIN_CITY",
      "ORIGIN_DANE",
    ],
  ],
  ["Mensajería y anuncios (Zernio)", ["ZERNIO_API_KEY", "ZERNIO_WEBHOOK_SECRET"]],
  ["Pagos", ["WOMPI_PRIVATE_KEY", "WOMPI_ENV", "WOMPI_EVENTS_SECRET"]],
  ["IA (opcional)", ["ANTHROPIC_API_KEY"]],
  ["Servidor", ["PORT", "DATABASE_URL", "TRAXO_MEDIA_DIR"]],
];
const seen = new Set();
const lines = [
  "# Traxo — generado por el asistente. Este archivo NO se sube a GitHub (.gitignore).",
  "# Pon tus llaves aquí; nunca las pegues en un chat.",
  "",
];
for (const [title, keys] of SECTIONS) {
  const present = keys.filter((k) => k in env);
  if (!present.length) continue;
  lines.push(`# --- ${title} ---`);
  for (const k of present) {
    lines.push(`${k}=${q(env[k])}`);
    seen.add(k);
  }
  lines.push("");
}
const rest = Object.keys(env).filter((k) => !seen.has(k));
if (rest.length) {
  lines.push("# --- Otras ---");
  for (const k of rest) lines.push(`${k}=${q(env[k])}`);
  lines.push("");
}
const file = join(root, ".env");
const existed = existsSync(file);
writeFileSync(file, lines.join("\n"), { mode: 0o600 });
try {
  chmodSync(file, 0o600);
} catch {}

const mustFill = Object.keys(WHERE).filter((k) => k in env && !env[k]);
const out = {
  ok: true,
  envFile: ".env",
  created: !existed,
  generated, // nombres de lo que se generó, nunca sus valores
  adminPasswordIsInEnvFile: "TRAXO_ADMIN_PASSWORD" in env,
  pending: mustFill.map((k) => ({ key: k, where: WHERE[k] })),
  needsAdminEmail: !env.TRAXO_ADMIN_EMAIL,
};
console.log(JSON.stringify(out, null, 2));
