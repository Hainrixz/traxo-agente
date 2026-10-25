// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { MockCommerce } from "./mock.ts";
import { ShopifyCommerce } from "./shopify.ts";
import { TiendanubeCommerce } from "./tiendanube.ts";
import type { CommerceAdapter } from "./types.ts";
import { WooCommerce } from "./woocommerce.ts";

type Env = Record<string, string | undefined>;

/** Arma los adapters de las tiendas que tienen credenciales en el entorno. Sin ninguna, queda el mock. */
export function commerceFromEnv(
  env: Env = process.env,
  storeId = "store_demo",
): Record<string, CommerceAdapter> {
  const out: Record<string, CommerceAdapter> = {};
  if (env.SHOPIFY_STORE_DOMAIN && env.SHOPIFY_ADMIN_TOKEN) {
    out.shopify = new ShopifyCommerce({
      storeId,
      domain: env.SHOPIFY_STORE_DOMAIN,
      adminToken: env.SHOPIFY_ADMIN_TOKEN,
      webhookSecret: env.SHOPIFY_WEBHOOK_SECRET ?? "",
      apiVersion: env.SHOPIFY_API_VERSION,
    });
  }
  if (env.TIENDANUBE_STORE_ID && env.TIENDANUBE_ACCESS_TOKEN) {
    out.tiendanube = new TiendanubeCommerce({
      storeId,
      tnStoreId: env.TIENDANUBE_STORE_ID,
      accessToken: env.TIENDANUBE_ACCESS_TOKEN,
      appSecret: env.TIENDANUBE_APP_SECRET ?? "",
    });
  }
  if (env.WOOCOMMERCE_URL && env.WOOCOMMERCE_KEY && env.WOOCOMMERCE_SECRET) {
    out.woocommerce = new WooCommerce({
      storeId,
      url: env.WOOCOMMERCE_URL,
      consumerKey: env.WOOCOMMERCE_KEY,
      consumerSecret: env.WOOCOMMERCE_SECRET,
      webhookSecret: env.WOOCOMMERCE_WEBHOOK_SECRET ?? "",
    });
  }
  if (Object.keys(out).length === 0) out.mock = new MockCommerce();
  return out;
}
