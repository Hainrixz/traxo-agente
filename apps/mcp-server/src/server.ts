// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TraxoClient } from "./client.ts";
import { registerTools } from "./tools.ts";
import { registerGrowthTools } from "./tools-growth.ts";

export * from "./client.ts";

export function createTraxoMcp(api: TraxoClient): McpServer {
  const server = new McpServer({ name: "traxo", version: "0.1.0" });
  registerTools(server, api);
  registerGrowthTools(server, api);
  return server;
}
