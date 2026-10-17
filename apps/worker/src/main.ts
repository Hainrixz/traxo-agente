import { serve } from "@hono/node-server";
import { ensureDemoAdmin } from "@traxo/db";
import { handleNewOrder } from "./agent.ts";
import { registerApi } from "./api.ts";
import { createApp } from "./app.ts";
import { registerAssistantApi } from "./assistant.ts";
import { mountAuth } from "./auth.ts";
import { registerBuilderApi } from "./builder.ts";
import { checkConfirmationTimeouts, markPaid } from "./confirmation.ts";
import { registerGrowthApi } from "./growth.ts";
import { handleInbound } from "./inbound.ts";
import { mountMcp } from "./mcp.ts";
import { registerMediaApi } from "./media.ts";
import { isDemo } from "./mode.ts";
import { createRuntime } from "./runtime.ts";
import { hardenApp } from "./security.ts";
import { mountDashboard } from "./static.ts";
import { ingestCarrierEvent, pollTracking } from "./tracking.ts";
import { registerUsageApi } from "./usage-api.ts";

// Los datos de ejemplo solo se cargan en modo demo (TRAXO_DEMO=1). Una instalación normal arranca limpia.
const demo = isDemo();
const rich = demo && process.env.TRAXO_RICH_DEMO !== "0";
const rt = await createRuntime(process.env, { rich });
const app = createApp({
  db: rt.db,
  bus: rt.bus,
  commerce: rt.commerceMap,
  messaging: rt.messaging,
  onCarrierEvent: (tn, e) => ingestCarrierEvent(rt, tn, e),
  onInbound: async (m) => {
    await handleInbound(rt, m);
  },
  payments: rt.payments as { verifyEvent?: (event: unknown) => boolean },
  onPaymentApproved: async (linkId) => {
    const row = await rt.db.prisma.order.findFirst({ where: { paymentLinkId: linkId } });
    if (!row) return false;
    await markPaid(rt, row.id);
    return true;
  },
  onOrder: async (order) => {
    await handleNewOrder(rt, order);
  },
});
// Modo demo (TRAXO_DEMO=1): cuenta de ejemplo y registro libre. Instalación normal: una sola cuenta definida por variables.
const apiToken = process.env.TRAXO_API_TOKEN;
if (demo) {
  await ensureDemoAdmin(rt.db, rt.storeId);
} else if (process.env.TRAXO_ADMIN_EMAIL && process.env.TRAXO_ADMIN_PASSWORD) {
  await ensureDemoAdmin(rt.db, rt.storeId, {
    email: process.env.TRAXO_ADMIN_EMAIL,
    password: process.env.TRAXO_ADMIN_PASSWORD,
    name: "Administrador",
  });
}
hardenApp(app, {
  authConfigured: demo || Boolean(process.env.TRAXO_ADMIN_EMAIL) || Boolean(apiToken),
  live: !demo,
  mcpToken: process.env.TRAXO_MCP_TOKEN,
});
mountAuth(app, rt, {
  demo,
  apiToken,
  login: process.env.TRAXO_AUTH !== "off" && (demo || Boolean(process.env.TRAXO_ADMIN_EMAIL)),
});
registerApi(app, rt);
registerGrowthApi(app, rt);
registerAssistantApi(app, rt);
registerMediaApi(app, rt);
registerUsageApi(app, rt);
registerBuilderApi(app, rt);
mountMcp(app);
mountDashboard(app);

// Rastreo periódico de las guías abiertas.
const everyMs = Number(process.env.TRACKING_POLL_MS ?? 60_000);
setInterval(() => {
  checkConfirmationTimeouts(rt).catch(() => 0);
  pollTracking(rt).catch((e) =>
    rt.bus.emit("error", `Falló el rastreo periódico: ${(e as Error).message}`),
  );
}, everyMs);

if (!apiToken && !process.env.TRAXO_ADMIN_EMAIL && !demo) {
  console.warn(
    "AVISO: hay una tienda real conectada y la API está abierta. Define TRAXO_ADMIN_EMAIL y TRAXO_ADMIN_PASSWORD (o TRAXO_API_TOKEN).",
  );
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(
    `Traxo escuchando en http://localhost:${port} (base: ${rt.db.mode}, tienda: ${rt.storeName})`,
  );
});
