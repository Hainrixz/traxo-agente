// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type Customer, newId, type Order, type Product } from "@traxo/core";
import { findCity, normalizePhone, normalizeStreet } from "@traxo/geo-co";
import { header, hmac, safeEqual } from "./hmac.ts";
import type { CommerceAdapter, FulfillmentInput } from "./types.ts";

export type WooConfig = {
  storeId: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  webhookSecret: string;
  fetch?: typeof fetch;
};

type WooOrder = {
  id: number;
  number?: string;
  status?: string;
  date_created_gmt?: string;
  total?: string;
  shipping_total?: string;
  payment_method?: string;
  billing?: { email?: string; phone?: string };
  shipping?: {
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    phone?: string;
  };
  line_items?: Array<{
    product_id: number;
    name: string;
    quantity: number;
    price: number | string;
  }>;
};

const toInt = (s: string | number | undefined): number =>
  Math.round(Number.parseFloat(String(s ?? "0")) || 0);

export function orderFromWoo(o: WooOrder, storeId: string): Order | undefined {
  const a = o.shipping;
  if (!a?.city || !a.address_1 || !o.line_items?.length) return undefined;
  const city = findCity(a.city);
  const lines = o.line_items.map((l) => ({
    productId: String(l.product_id),
    title: l.name,
    quantity: l.quantity,
    unitPrice: toInt(l.price),
    weightGrams: 500,
  }));
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  return {
    id: newId("ord"),
    externalId: String(o.id),
    number: `#${o.number ?? o.id}`,
    storeId,
    email: o.billing?.email,
    address: {
      name: [a.first_name, a.last_name].filter(Boolean).join(" "),
      phone: normalizePhone(a.phone ?? o.billing?.phone ?? "") ?? a.phone ?? o.billing?.phone ?? "",
      street: normalizeStreet([a.address_1, a.address_2].filter(Boolean).join(" ")),
      city: city?.name ?? a.city,
      dane: city?.dane ?? "00000",
      department: city?.department ?? a.state ?? "",
    },
    lines,
    subtotal,
    shippingCharged: toInt(o.shipping_total),
    total: toInt(o.total) || subtotal,
    payment: o.payment_method === "cod" ? "cod" : "prepaid",
    createdAt: o.date_created_gmt ? `${o.date_created_gmt}Z` : new Date().toISOString(),
  };
}

export class WooCommerce implements CommerceAdapter {
  readonly platform = "woocommerce" as const;
  readonly storeId: string;
  private f: typeof fetch;

  constructor(private cfg: WooConfig) {
    this.storeId = cfg.storeId;
    this.f = cfg.fetch ?? fetch;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const auth = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString(
      "base64",
    );
    const res = await this.f(`${this.cfg.url.replace(/\/$/, "")}/wp-json/wc/v3${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    });
    if (!res.ok)
      throw new Error(
        `WooCommerce respondió ${res.status} en ${path}. Revisa las claves y que la tienda use HTTPS.`,
      );
    return (await res.json()) as T;
  }

  async listProducts(): Promise<Product[]> {
    const rows =
      await this.call<
        Array<{
          id: number;
          name: string;
          price: string;
          weight?: string;
          images?: Array<{ src: string }>;
          short_description?: string;
        }>
      >("/products?per_page=100");
    return rows.map((p) => ({
      id: `prod_${p.id}`,
      externalId: String(p.id),
      title: p.name,
      price: toInt(p.price),
      weightGrams: p.weight ? Math.max(1, Math.round(Number.parseFloat(p.weight) * 1000)) : 500,
      imageUrl: p.images?.[0]?.src,
      description: p.short_description?.replace(/<[^>]+>/g, " ").trim(),
    }));
  }

  async listCustomers(): Promise<Customer[]> {
    const rows =
      await this.call<
        Array<{
          id: number;
          first_name: string;
          last_name: string;
          email: string;
          billing?: { phone?: string; city?: string };
        }>
      >("/customers?per_page=100");
    return rows.map((c) => ({
      id: `cust_${c.id}`,
      externalId: String(c.id),
      name: `${c.first_name} ${c.last_name}`.trim(),
      phone: normalizePhone(c.billing?.phone ?? "") ?? c.billing?.phone ?? "",
      email: c.email,
      city: c.billing?.city,
      whatsappConsent: false,
    }));
  }

  async listOrders(opts: { limit?: number } = {}): Promise<Order[]> {
    const rows = await this.call<WooOrder[]>(`/orders?per_page=${opts.limit ?? 50}`);
    return rows.map((o) => orderFromWoo(o, this.storeId)).filter((o): o is Order => Boolean(o));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return orderFromWoo(await this.call<WooOrder>(`/orders/${id}`), this.storeId);
  }

  /** Woo no trae tracking nativo: se deja como nota al cliente y se marca completado. */
  async addFulfillment(orderId: string, input: FulfillmentInput): Promise<void> {
    await this.call(`/orders/${orderId}/notes`, {
      method: "POST",
      body: JSON.stringify({
        note: `Tu pedido va con ${input.carrier}. Guía ${input.trackingNumber}. Rastréalo: ${input.url}`,
        customer_note: input.notifyCustomer ?? false,
      }),
    });
    await this.call(`/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "completed",
        meta_data: [
          { key: "_traxo_tracking_number", value: input.trackingNumber },
          { key: "_traxo_carrier", value: input.carrier },
        ],
      }),
    });
  }

  async addNote(orderId: string, note: string): Promise<void> {
    await this.call(`/orders/${orderId}/notes`, { method: "POST", body: JSON.stringify({ note }) });
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean {
    const sig = header(headers, "x-wc-webhook-signature");
    return (
      Boolean(sig) && safeEqual(sig as string, hmac(this.cfg.webhookSecret, rawBody, "base64"))
    );
  }

  normalizeOrderWebhook(
    headers: Record<string, string | undefined>,
    payload: unknown,
  ): Order | undefined {
    const topic = header(headers, "x-wc-webhook-topic");
    if (topic && topic !== "order.created") return undefined;
    return orderFromWoo(payload as WooOrder, this.storeId);
  }
}
