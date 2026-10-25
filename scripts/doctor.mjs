#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
// Revisa que Traxo esté bien instalado y configurado. Muestra ✓ / ✗ / – por cosa; nunca imprime valores de variables.
//   node scripts/doctor.mjs            (o: pnpm doctor)      --json para máquina · --offline para no probar conexiones
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnv, WHERE } from "./_env.mjs";

const argv = process.argv.slice(2);
const flag = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const root = resolve(flag("dir") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const json = argv.includes("--json");
const offline = argv.includes("--offline");
const env = readEnv(root);
const has = (k) => Boolean(env[k]);

const checks = [];
const add = (area, name, state, hint = "", note = "") =>
  checks.push({ area, name, state, hint, note }); // state: ok | fail | skip | warn

const major = Number(process.versions.node.split(".")[0]);
add(
  "Sistema",
  "Node 24 o superior",
  major >= 24 ? "ok" : "fail",
  `Tienes Node ${process.versions.node}. Instala Node 24 (nvm install 24).`,
);
add(
  "Sistema",
  "Dependencias instaladas",
  existsSync(join(root, "node_modules")) ? "ok" : "fail",
  "Corre: pnpm install",
);
add(
  "Sistema",
  "Base de datos generada (Prisma)",
  existsSync(join(root, "packages/db/src/generated")) ? "ok" : "fail",
  "Corre: pnpm db:generate",
);
add(
  "Sistema",
  "Panel compilado",
  existsSync(join(root, "apps/dashboard/dist/index.html")) ? "ok" : "fail",
  "Corre: pnpm build",
);
add(
  "Sistema",
  "Archivo .env",
  existsSync(join(root, ".env")) ? "ok" : "fail",
  "Corre /traxo:instalar o: node scripts/setup.mjs",
);

if (existsSync(join(root, ".env"))) {
  add(
    "Acceso",
    "Correo y contraseña del administrador",
    has("TRAXO_ADMIN_EMAIL") && has("TRAXO_ADMIN_PASSWORD") ? "ok" : "fail",
    "Falta TRAXO_ADMIN_EMAIL / TRAXO_ADMIN_PASSWORD en .env",
  );
  add(
    "Acceso",
    "Secreto de sesiones",
    has("TRAXO_SESSION_SECRET") ? "ok" : "fail",
    "Falta TRAXO_SESSION_SECRET",
  );
  add(
    "Acceso",
    "Token de /mcp",
    has("TRAXO_MCP_TOKEN") ? "ok" : "warn",
    "Sin TRAXO_MCP_TOKEN, /mcp solo responde desde tu computador",
  );
  add(
    "Datos",
    "Base de datos",
    "ok",
    "",
    has("DATABASE_URL") ? "Postgres (DATABASE_URL)" : "PGlite local (.traxo-data)",
  );

  const store = has("SHOPIFY_STORE_DOMAIN")
    ? "shopify"
    : has("TIENDANUBE_STORE_ID")
      ? "tiendanube"
      : has("WOOCOMMERCE_URL")
        ? "woocommerce"
        : null;
  if (!store)
    add(
      "Tienda",
      "Tienda conectada",
      "warn",
      "Sin tienda: Traxo corre vacío. Define SHOPIFY_*, TIENDANUBE_* o WOOCOMMERCE_*",
    );
  const need = {
    shopify: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_TOKEN", "SHOPIFY_WEBHOOK_SECRET"],
    tiendanube: ["TIENDANUBE_STORE_ID", "TIENDANUBE_ACCESS_TOKEN", "TIENDANUBE_APP_SECRET"],
    woocommerce: ["WOOCOMMERCE_URL", "WOOCOMMERCE_KEY", "WOOCOMMERCE_SECRET"],
  };
  if (store)
    for (const k of need[store])
      add("Tienda", k, has(k) ? "ok" : "fail", WHERE[k] ?? "Falta en .env");
  const group = (area, keys, label) => {
    if (!keys.some(has)) return add(area, label, "skip", "No configurado (opcional)");
    for (const k of keys) add(area, k, has(k) ? "ok" : "fail", WHERE[k] ?? "Falta en .env");
  };
  group("Envíos", ["ENVIA_TOKEN"], "Envia.com");
  const origin = has("ORIGIN_STREET") && has("ORIGIN_CITY") && has("ORIGIN_DANE");
  add(
    "Envíos",
    "Dirección de origen",
    origin ? "ok" : "warn",
    origin ? "" : "Define ORIGIN_STREET, ORIGIN_CITY y ORIGIN_DANE para generar guías reales",
  );
  group("Mensajería", ["ZERNIO_API_KEY", "ZERNIO_WEBHOOK_SECRET"], "Zernio");
  group("Pagos", ["WOMPI_PRIVATE_KEY", "WOMPI_EVENTS_SECRET"], "Wompi");
  group("IA", ["ANTHROPIC_API_KEY"], "Claude (IA)");

  // Pruebas de conexión (solo el código de estado; nunca valores).
  if (!offline) {
    const probe = async (area, name, url, init) => {
      try {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) });
        if (r.ok) add(area, `${name}: responde`, "ok");
        else if (r.status === 401 || r.status === 403)
          add(
            area,
            `${name}: la llave no es válida`,
            "fail",
            `Respondió ${r.status}. Revisa la llave en .env`,
          );
        else add(area, `${name}: respondió ${r.status}`, "warn");
      } catch {
        add(
          area,
          `${name}: no se pudo conectar`,
          "warn",
          "Revisa tu conexión a internet y la dirección",
        );
      }
    };
    if (store === "shopify" && has("SHOPIFY_ADMIN_TOKEN"))
      await probe(
        "Tienda",
        "Shopify",
        `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION || "2026-07"}/shop.json`,
        { headers: { "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_TOKEN } },
      );
    if (store === "tiendanube" && has("TIENDANUBE_ACCESS_TOKEN"))
      await probe(
        "Tienda",
        "Tiendanube",
        `https://api.tiendanube.com/2025-03/${env.TIENDANUBE_STORE_ID}/store`,
        {
          headers: {
            Authentication: `bearer ${env.TIENDANUBE_ACCESS_TOKEN}`,
            "User-Agent": "Traxo (soporte@traxo.invalid)",
          },
        },
      );
    if (store === "woocommerce" && has("WOOCOMMERCE_KEY"))
      await probe(
        "Tienda",
        "WooCommerce",
        `${env.WOOCOMMERCE_URL.replace(/\/$/, "")}/wp-json/wc/v3/orders?per_page=1`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${env.WOOCOMMERCE_KEY}:${env.WOOCOMMERCE_SECRET}`).toString("base64")}`,
          },
        },
      );
    if (has("ANTHROPIC_API_KEY"))
      await probe("IA", "Anthropic", "https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      });
  }
}

const bad = checks.filter((c) => c.state === "fail");
if (json) console.log(JSON.stringify({ ok: bad.length === 0, checks }, null, 2));
else {
  const icon = { ok: "✓", fail: "✗", skip: "–", warn: "!" };
  let area = "";
  for (const c of checks) {
    if (c.area !== area) {
      area = c.area;
      console.log(`\n${area}`);
    }
    console.log(
      `  ${icon[c.state]} ${c.name}${c.state !== "ok" && c.hint ? `  → ${c.hint}` : c.note ? `  (${c.note})` : ""}`,
    );
  }
  console.log(
    `\n${bad.length ? `Faltan ${bad.length} cosas para que esté listo.` : "Todo lo necesario está listo."}`,
  );
}
process.exit(bad.length ? 1 : 0);
