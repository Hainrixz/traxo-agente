import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTraxoMcp, httpClient, inProcessClient } from "@traxo/mcp-server";
import { registerApi } from "./api.ts";
import { createApp } from "./app.ts";
import { createRuntime } from "./runtime.ts";

/**
 * Servidor MCP por stdio para Claude Code.
 * - Con TRAXO_URL: habla con un worker ya corriendo (local o Railway).
 * - Sin TRAXO_URL: levanta Traxo en proceso (PGlite local + mocks). Un solo proceso puede usar la carpeta de datos a la vez.
 */
const url = process.env.TRAXO_URL;
let client: ReturnType<typeof httpClient>;
if (url) {
  client = httpClient(url, process.env.TRAXO_MCP_TOKEN);
} else {
  const rt = await createRuntime();
  const app = createApp({ db: rt.db, bus: rt.bus, commerce: rt.commerceMap });
  registerApi(app, rt);
  client = inProcessClient(app);
}
await createTraxoMcp(client).connect(new StdioServerTransport());
