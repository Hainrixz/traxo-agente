// Utilidades compartidas por setup, doctor y railway-vars. Nunca imprimen valores de variables.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Lee un .env simple (KEY=valor, # comentarios). */
export function readEnv(dir) {
  const file = join(dir, ".env");
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Dónde se consigue cada llave (para guiar a la persona sin pedirle que la pegue en el chat). */
export const WHERE = {
  SHOPIFY_ADMIN_TOKEN:
    "Shopify → Ajustes → Apps → Desarrollar apps → tu app → Token de acceso de Admin API",
  SHOPIFY_WEBHOOK_SECRET: "Shopify → tu app → Credenciales de la API → Secreto de la API",
  TIENDANUBE_STORE_ID: "Tiendanube → Mis aplicaciones → tu app (user_id de la tienda)",
  TIENDANUBE_ACCESS_TOKEN: "Tiendanube → token que devuelve la autorización OAuth de tu app",
  TIENDANUBE_APP_SECRET: "Tiendanube → Mis aplicaciones → tu app → Client secret",
  WOOCOMMERCE_KEY: "WooCommerce → Ajustes → Avanzado → API REST → Clave de consumidor",
  WOOCOMMERCE_SECRET: "WooCommerce → Ajustes → Avanzado → API REST → Secreto de consumidor",
  ENVIA_TOKEN: "Envia.com → panel de desarrolladores → API token (empieza con el de sandbox)",
  ENVIA_WEBHOOK_SECRET: "Envia.com → webhooks → secreto de firma",
  ZERNIO_API_KEY: "Zernio → Configuración → API keys",
  ZERNIO_WEBHOOK_SECRET: "Zernio → Webhooks → secreto de firma",
  WOMPI_PRIVATE_KEY: "Wompi → Desarrolladores → llave privada (sandbox primero)",
  WOMPI_EVENTS_SECRET: "Wompi → Desarrolladores → secreto de eventos",
  ANTHROPIC_API_KEY: "console.anthropic.com → API keys",
};
