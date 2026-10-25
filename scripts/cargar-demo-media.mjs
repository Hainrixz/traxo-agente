#!/usr/bin/env node
// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
// Carga el material de demo (demo-media/) en la Biblioteca de la cuenta admin de ejemplo, en local o en una URL de Railway.
//   node scripts/cargar-demo-media.mjs [URL] [--dir demo-media]
// Solo funciona con el servidor en modo demo (TRAXO_DEMO=1). Es idempotente: correrlo dos veces no duplica.
// No llama a Higgsfield ni gasta créditos; los archivos NO van al repositorio.
import { readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const url = (
  args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--dir") ?? "http://localhost:8787"
).replace(/\/$/, "");
const dir = resolve(flag("--dir", "demo-media"));
const email = process.env.TRAXO_DEMO_EMAIL ?? "admin@traxo.demo";
const password = process.env.TRAXO_DEMO_PASSWORD ?? "traxo-demo";

const catalog = JSON.parse(readFileSync(join(dir, "catalogo.json"), "utf8")).archivos ?? [];
const login = await fetch(`${url}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(
    `No pude entrar a ${url} (${login.status}). ¿El servidor está en modo demo (TRAXO_DEMO=1)?`,
  );
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

let nuevos = 0;
let ya = 0;
let fallos = 0;
// Al revés: la biblioteca ordena por fecha de carga (lo último primero) y así se ve en el orden del catálogo.
for (const it of [...catalog].reverse()) {
  const body = readFileSync(join(dir, it.archivo));
  const r = await fetch(`${url}/api/media/upload`, {
    method: "POST",
    headers: {
      cookie,
      "x-filename": encodeURIComponent(it.archivo.split("/").pop()),
      "x-title": encodeURIComponent(it.titulo),
      "x-role": it.rol,
      "x-source": it.fuente,
      ...(it.producto ? { "x-product": encodeURIComponent(it.producto) } : {}),
    },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (j.ok && j.duplicate) ya++;
  else if (j.ok) nuevos++;
  else {
    fallos++;
    console.error(`  ✗ ${it.archivo}: ${j.message ?? r.status} (${extname(it.archivo)})`);
  }
}
console.log(
  `Biblioteca de ${url}: ${nuevos} cargados, ${ya} ya estaban${fallos ? `, ${fallos} con error` : ""} (de ${catalog.length}).`,
);
process.exit(fallos ? 1 : 0);
