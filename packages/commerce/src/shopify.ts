// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type Customer, newId, type Order, type Product } from "@traxo/core";
import { findCity, normalizePhone, normalizeStreet } from "@traxo/geo-co";
import { header, hmac, safeEqual } from "./hmac.ts";
import type { CommerceAdapter, FulfillmentInput } from "./types.ts";

export type ShopifyConfig = {
  storeId: string;
  domain: string;
  adminToken: string;
  webhookSecret: string;
  /** Versión estable fijada de la Admin API. */
  apiVersion?: string;
  fetch?: typeof fetch;
};

type ShopifyAddress = {
  name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  address1?: string;
  address2?: string | null;
  city?: string;
  province?: string;
  zip?: string | null;
};

type ShopifyOrderPayload = {
  id: number | string;
  name?: string;
  order_number?: number;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  total_price?: string;
  subtotal_price?: string;
  payment_gateway_names?: string[];
  gateway?: string;
  tags?: string;
  landing_site?: string | null;
  referring_site?: string | null;
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  customer?: {
    id?: number | string;
    first_name?: string;
    last_name?: string;
    phone?: string | null;
  };
  line_items?: Array<{
    product_id?: number | string | null;
    title: string;
    quantity: number;
    price: string;
    grams?: number;
  }>;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
};

const COD_MARKERS = [
  "cash on delivery",
  "cod",
  "contra entrega",
  "contraentrega",
  "pago contra entrega",
];

export function isCodOrder(
  p: Pick<ShopifyOrderPayload, "payment_gateway_names" | "gateway" | "tags">,
): boolean {
  const text = [...(p.payment_gateway_names ?? []), p.gateway ?? "", p.tags ?? ""]
    .join(" ")
    .toLowerCase();
  return COD_MARKERS.some((m) => text.includes(m));
}

const toInt = (s: string | undefined): number => Math.round(Number.parseFloat(s ?? "0") || 0);

function utmFrom(landing: string | null | undefined): Record<string, string> | undefined {
  if (!landing) return undefined;
  try {
    const u = new URL(landing, "https://x.invalid");
    const out: Record<string, string> = {};
    for (const [k, v] of u.searchParams) if (k.startsWith("utm_")) out[k] = v;
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Pedido de Shopify (webhook orders/create o REST) → Order de Traxo. Devuelve undefined si la dirección no sirve. */
export function orderFromShopify(p: ShopifyOrderPayload, storeId: string): Order | undefined {
  const a = p.shipping_address ?? p.billing_address;
  if (!a?.city || !a.address1) return undefined;
  const city = findCity(a.city);
  const lines = (p.line_items ?? []).map((l) => ({
    productId: String(l.product_id ?? l.title),
    title: l.title,
    quantity: l.quantity,
    unitPrice: toInt(l.price),
    weightGrams: l.grams && l.grams > 0 ? l.grams : 500,
  }));
  if (lines.length === 0) return undefined;
  const phone = normalizePhone(a.phone ?? p.phone ?? p.customer?.phone ?? "") ?? a.phone ?? "";
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  return {
    id: newId("ord"),
    externalId: String(p.id),
    number: p.name ?? `#${p.order_number ?? p.id}`,
    storeId,
    email: p.email ?? undefined,
    address: {
      name: a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" "),
      phone,
      street: normalizeStreet([a.address1, a.address2].filter(Boolean).join(" ")),
      city: city?.name ?? a.city,
      // Sin DANE no se puede cotizar: el agente lo pide al cliente. "00000" no pasa el selector de cobertura.
      dane: city?.dane ?? "00000",
      department: city?.department ?? a.province ?? "",
    },
    lines,
    subtotal,
    shippingCharged: toInt(p.total_shipping_price_set?.shop_money?.amount),
    total: toInt(p.total_price) || subtotal,
    payment: isCodOrder(p) ? "cod" : "prepaid",
    utm: utmFrom(p.landing_site),
    createdAt: p.created_at ?? new Date().toISOString(),
  };
}

export class ShopifyCommerce implements CommerceAdapter {
  readonly platform = "shopify" as const;
  readonly storeId: string;
  private f: typeof fetch;

  constructor(private cfg: ShopifyConfig) {
    this.storeId = cfg.storeId;
    this.f = cfg.fetch ?? fetch;
  }

  private get base(): string {
    return `https://${this.cfg.domain}/admin/api/${this.cfg.apiVersion ?? "2026-07"}`;
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.f(`${this.base}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.cfg.adminToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok)
      throw new Error(`Shopify respondió ${res.status}. Revisa el token y los permisos de la app.`);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (json.errors?.length)
      throw new Error(`Shopify: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data as T;
  }

  private async rest<T>(path: string): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      headers: { "X-Shopify-Access-Token": this.cfg.adminToken },
    });
    if (!res.ok) throw new Error(`Shopify respondió ${res.status} en ${path}.`);
    return (await res.json()) as T;
  }

  async listProducts(): Promise<Product[]> {
    const { products } = await this.rest<{
      products: Array<{
        id: number;
        title: string;
        body_html?: string;
        image?: { src: string };
        variants: Array<{ price: string; grams?: number }>;
      }>;
    }>("/products.json?limit=100");
    return products.map((p) => ({
      id: `prod_${p.id}`,
      externalId: String(p.id),
      title: p.title,
      price: toInt(p.variants[0]?.price),
      weightGrams: p.variants[0]?.grams && p.variants[0].grams > 0 ? p.variants[0].grams : 500,
      imageUrl: p.image?.src,
      description: p.body_html?.replace(/<[^>]+>/g, " ").trim(),
    }));
  }

  async listCustomers(): Promise<Customer[]> {
    const { customers } = await this.rest<{
      customers: Array<{
        id: number;
        first_name?: string;
        last_name?: string;
        phone?: string | null;
        email?: string | null;
        default_address?: { city?: string };
        sms_marketing_consent?: { state?: string } | null;
      }>;
    }>("/customers.json?limit=250");
    return customers.map((c) => ({
      id: `cust_${c.id}`,
      externalId: String(c.id),
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Cliente",
      phone: normalizePhone(c.phone ?? "") ?? c.phone ?? "",
      email: c.email ?? undefined,
      city: c.default_address?.city,
      whatsappConsent: c.sms_marketing_consent?.state === "subscribed",
    }));
  }

  async listOrders(opts: { limit?: number } = {}): Promise<Order[]> {
    const { orders } = await this.rest<{ orders: ShopifyOrderPayload[] }>(
      `/orders.json?status=any&limit=${opts.limit ?? 50}`,
    );
    return orders
      .map((o) => orderFromShopify(o, this.storeId))
      .filter((o): o is Order => Boolean(o));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const { order } = await this.rest<{ order: ShopifyOrderPayload }>(`/orders/${id}.json`);
    return orderFromShopify(order, this.storeId);
  }

  /** Crea el fulfillment con tracking sobre las fulfillment orders abiertas del pedido. */
  async addFulfillment(orderId: string, input: FulfillmentInput): Promise<void> {
    const gid = `gid://shopify/Order/${orderId}`;
    const open = await this.gql<{
      order: { fulfillmentOrders: { nodes: Array<{ id: string; status: string }> } } | null;
    }>(
      `query($id: ID!) { order(id: $id) { fulfillmentOrders(first: 10) { nodes { id status } } } }`,
      { id: gid },
    );
    const targets = open.order?.fulfillmentOrders.nodes.filter(
      (n) => n.status === "OPEN" || n.status === "IN_PROGRESS",
    );
    if (!targets?.length)
      throw new Error(`El pedido ${orderId} no tiene envíos pendientes en Shopify.`);
    const res = await this.gql<{ fulfillmentCreate: { userErrors: Array<{ message: string }> } }>(
      `mutation($f: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { field message } }
      }`,
      {
        f: {
          lineItemsByFulfillmentOrder: targets.map((t) => ({ fulfillmentOrderId: t.id })),
          trackingInfo: { number: input.trackingNumber, company: input.carrier, url: input.url },
          notifyCustomer: input.notifyCustomer ?? false,
        },
      },
    );
    const errs = res.fulfillmentCreate.userErrors;
    if (errs.length)
      throw new Error(`Shopify no aceptó el envío: ${errs.map((e) => e.message).join("; ")}`);
  }

  async addNote(orderId: string, note: string): Promise<void> {
    await this.gql(
      `mutation($input: OrderInput!) { orderUpdate(input: $input) { userErrors { message } } }`,
      { input: { id: `gid://shopify/Order/${orderId}`, note } },
    );
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean {
    const sig = header(headers, "x-shopify-hmac-sha256");
    return (
      Boolean(sig) && safeEqual(sig as string, hmac(this.cfg.webhookSecret, rawBody, "base64"))
    );
  }

  normalizeOrderWebhook(
    headers: Record<string, string | undefined>,
    payload: unknown,
  ): Order | undefined {
    const topic = header(headers, "x-shopify-topic");
    if (topic && topic !== "orders/create") return undefined;
    return orderFromShopify(payload as ShopifyOrderPayload, this.storeId);
  }
}
