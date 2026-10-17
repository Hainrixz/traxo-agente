import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

describe("servidor MCP por stdio (como lo arranca el plugin)", () => {
  it("arranca con el mismo comando de .mcp.json y responde herramientas reales", async () => {
    const root = new URL("../../../", import.meta.url).pathname;
    const transport = new StdioClientTransport({
      command: "pnpm",
      args: ["--silent", "--dir", root, "exec", "tsx", "apps/worker/src/mcp-stdio.ts"],
      env: {
        ...(process.env as Record<string, string>),
        TRAXO_DATA_DIR: "memory://",
        TRAXO_URL: "",
      },
    });
    const client = new Client({ name: "test", version: "0" });
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools.map((t) => t.name);
      expect(tools).toContain("crear_guia");
      const r = (await client.callTool({
        name: "demo_simular_pedido",
        arguments: { dane: "66001" },
      })) as { content: Array<{ text: string }> };
      expect(r.content[0]?.text).toContain('"status":"shipped"');
    } finally {
      await client.close();
    }
  }, 60000);
});
