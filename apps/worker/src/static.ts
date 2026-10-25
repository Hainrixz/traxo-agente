// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";

const DIST = new URL("../../dashboard/dist/", import.meta.url).pathname;

/** Sirve el dashboard compilado en `/`. Si no está compilado (`pnpm build`), `/` explica cómo hacerlo. */
export function mountDashboard(app: Hono): boolean {
  if (!existsSync(`${DIST}index.html`)) {
    app.get("/", (c) =>
      c.html(
        "<!doctype html><meta charset=utf-8><title>Traxo</title><body style='font:16px system-ui;padding:32px'><h1>Traxo está corriendo</h1><p>El dashboard no está compilado. Ejecuta <code>pnpm build</code> o usa <code>pnpm dev:ui</code>.</p><p>La API está en <code>/api/state</code>.</p>",
      ),
    );
    return false;
  }
  const root = relative(process.cwd(), DIST) || ".";
  app.use("/assets/*", serveStatic({ root }));
  app.use("/paginas/*", serveStatic({ root })); // capturas de las páginas construidas
  app.get("/favicon.svg", serveStatic({ root }));
  // Rutas de la SPA (el dashboard usa hash, pero por si acaso): todo lo que no sea API ni webhook devuelve index.html.
  app.get("*", (c) => {
    const p = new URL(c.req.url).pathname;
    if (p.startsWith("/api") || p.startsWith("/webhooks") || p === "/health" || p === "/mcp")
      return c.notFound();
    // Se lee en cada petición: así una recompilación no deja el HTML apuntando a archivos viejos.
    return c.html(readFileSync(`${DIST}index.html`, "utf8"));
  });
  return true;
}
