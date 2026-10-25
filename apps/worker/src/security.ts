// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ipOf } from "./auth.ts";

const isLoopback = (c: Context): boolean => {
  const host = new URL(c.req.url).hostname;
  return !c.req.header("x-forwarded-for") && (host === "localhost" || host === "127.0.0.1");
};

/**
 * Endurecimiento de lo que queda expuesto a internet:
 *  - cabeceras de seguridad en todo,
 *  - límite de peticiones por IP en /api y /mcp,
 *  - tope de tamaño del cuerpo (1 MB; solo la subida de archivos admite más),
 *  - /mcp cerrado salvo con token (o desde tu propio computador),
 *  - una tienda real sin ninguna autenticación solo responde desde tu propio computador.
 */
export function hardenApp(
  app: Hono,
  opts: { authConfigured: boolean; live: boolean; mcpToken?: string },
): void {
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    // La vista previa del constructor se muestra en un marco del mismo sitio y fija su propia regla.
    if (!c.res.headers.has("X-Frame-Options")) c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Cross-Origin-Opener-Policy", "same-origin");
    if (new URL(c.req.url).protocol === "https:" || c.req.header("x-forwarded-proto") === "https")
      c.header("Strict-Transport-Security", "max-age=31536000");
  });

  const hits = new Map<string, { n: number; t: number }>();
  const perMinute = Number(process.env.TRAXO_RATE_PER_MIN ?? 300);
  app.use("*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (!path.startsWith("/api/") && path !== "/mcp") return next();
    if (path === "/api/stream") return next();
    const k = ipOf(c);
    const now = Date.now();
    const h = hits.get(k);
    if (!h || now - h.t > 60_000) hits.set(k, { n: 1, t: now });
    else if (++h.n > perMinute)
      return c.json({ ok: false, message: "Demasiadas peticiones. Espera un minuto." }, 429);
    if (hits.size > 5000) for (const [key, v] of hits) if (now - v.t > 60_000) hits.delete(key);
    return next();
  });

  const small = bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ ok: false, message: "La petición es demasiado grande." }, 413),
  });
  app.use("/api/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    return path === "/api/media/upload" ? next() : small(c, next);
  });

  app.use("/mcp", async (c, next) => {
    if (!opts.mcpToken && !isLoopback(c))
      return c.json(
        { error: "/mcp está cerrado: define TRAXO_MCP_TOKEN para usarlo fuera de tu computador." },
        401,
      );
    return next();
  });

  if (opts.live && !opts.authConfigured)
    app.use("/api/*", async (c, next) => {
      if (isLoopback(c)) return next();
      return c.json(
        {
          ok: false,
          message:
            "Esta instalación tiene una tienda real y no tiene acceso configurado. Define TRAXO_ADMIN_EMAIL y TRAXO_ADMIN_PASSWORD (o TRAXO_API_TOKEN).",
        },
        403,
      );
    });
}
