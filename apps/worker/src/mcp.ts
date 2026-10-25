// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createTraxoMcp, inProcessClient } from "@traxo/mcp-server";
import type { Hono } from "hono";
import { INTERNAL } from "./auth.ts";

/**
 * Expone las herramientas de Traxo por MCP sobre HTTP en /mcp (para usarlas desde Claude con el worker en Railway).
 * Sin estado: cada petición crea su propio servidor. Si TRAXO_MCP_TOKEN está definido, exige `Authorization: Bearer <token>`.
 */
export function mountMcp(app: Hono, token = process.env.TRAXO_MCP_TOKEN): void {
  app.all("/mcp", async (c) => {
    if (token && c.req.header("authorization") !== `Bearer ${token}`) {
      return c.json({ error: "Falta el token de Traxo (TRAXO_MCP_TOKEN)." }, 401);
    }
    // El servidor se llama a sí mismo: ya validamos el token de /mcp, así que entra con el pase interno.
    const internal = {
      request: (path: string, init: RequestInit = {}) =>
        app.request(path, {
          ...init,
          headers: {
            ...(init.headers as Record<string, string> | undefined),
            "x-traxo-internal": INTERNAL,
          },
        }),
    };
    const server = createTraxoMcp(inProcessClient(internal));
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });
}
