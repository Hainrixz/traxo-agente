import { type Customer, newId, type Order, type Product } from "@traxo/core";
import { findCity, normalizePhone, normalizeStreet } from "@traxo/geo-co";
import { header, hmac, safeEqual } from "./hmac.ts";
import type { CommerceAdapter, FulfillmentInput } from "./types.ts";

export type TiendanubeConfig = {
  storeId: string;
  /** user_id que devuelve el OAuth: es el id de la tienda en Tiendanube. */
  tnStoreId: string;
  accessToken: string;
  appSecret: string;
  /** Obligatorio: Tiendanube responde 400 sin User-Agent. */
  userAgent?: string;
  fetch?: typeof fetch;
};

type TnOrder = {
  id: number;
  number?: number;
  contact_email?: string;
  contact_name?: string;
  contact_phone?: string;
  created_at?: string;
  total?: string;
  subtotal?: string;
  shipping_cost_customer?: string;
  gateway?: string;
  payment_details?: { method?: string };
  shipping_address?: {
    address?: string;
    number?: string;
    floor?: string;
    city?: string;
    province?: string;
    name?: string;
    phone?: string;
  };
  products?: Array<{
    product_id: number;
    name: string;
    quantity: number;
    price: string;
    weight?: string;
  }>;
};

const toInt = (s: string | undefined): number => Math.round(Number.parseFloat(s ?? "0") || 0);

export function orderFromTiendanube(o: TnOrder, storeId: string): Order | undefined {
  const a = o.shipping_address;
  if (!a?.city || !a.address || !o.products?.length) return undefined;
  const city = findCity(a.city);
  const lines = o.products.map((p) => ({
    productId: String(p.product_id),
    title: p.name,
    quantity: p.quantity,
    unitPrice: toInt(p.price),
    // Tiendanube entrega el peso en kg.
    weightGrams: p.weight ? Math.max(1, Math.round(Number.parseFloat(p.weight) * 1000)) : 500,
  }));
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const isCod = /cash|contra|cod/i.test(`${o.gateway ?? ""} ${o.payment_details?.method ?? ""}`);
  return {
    id: newId("ord"),
    externalId: String(o.id),
    number: `#${o.number ?? o.id}`,
    storeId,
    email: o.contact_email,
    address: {
      name: a.name ?? o.contact_name ?? "",
      phone: normalizePhone(a.phone ?? o.contact_phone ?? "") ?? a.phone ?? o.contact_phone ?? "",
      street: normalizeStreet([a.address, a.number, a.floor].filter(Boolean).join(" ")),
      city: city?.name ?? a.city,
      dane: city?.dane ?? "00000",
      department: city?.department ?? a.province ?? "",
    },
    lines,
    subtotal,
    shippingCharged: toInt(o.shipping_cost_customer),
    total: toInt(o.total) || subtotal,
    payment: isCod ? "cod" : "prepaid",
    createdAt: o.created_at ?? new Date().toISOString(),
  };
}

export class TiendanubeCommerce implements CommerceAdapter {
  readonly platform = "tiendanube" as const;
  readonly storeId: string;
  private f: typeof fetch;

  constructor(private cfg: TiendanubeConfig) {
    this.storeId = cfg.storeId;
    this.f = cfg.fetch ?? fetch;
  }

  private get base(): string {
    return `https://api.tiendanube.com/2025-03/${this.cfg.tnStoreId}`;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.cfg.accessToken;
    const res = await this.f(`${this.base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": this.cfg.userAgent ?? "Traxo (soporte@traxo.app)",
        // La documentación pública se contradice en el nombre del header; se envían ambos hasta verificar con una tienda real.
        Authentication: `bearer ${token}`,
        Authorization: `Bearer ${token}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (res.status === 429)
      throw new Error("Tiendanube pidió esperar (límite de 2 solicitudes por segundo).");
    if (!res.ok) throw new Error(`Tiendanube respondió ${res.status} en ${path}.`);
    return (await res.json()) as T;
  }

  async listProducts(): Promise<Product[]> {
    const rows =
      await this.call<
        Array<{
          id: number;
          name: { es?: string };
          variants: Array<{ price: string; weight?: string }>;
          images?: Array<{ src: string }>;
          description?: { es?: string };
        }>
      >("/products?per_page=100");
    return rows.map((p) => ({
      id: `prod_${p.id}`,
      externalId: String(p.id),
      title: p.name.es ?? "Producto",
      price: toInt(p.variants[0]?.price),
      weightGrams: p.variants[0]?.weight
        ? Math.max(1, Math.round(Number.parseFloat(p.variants[0].weight) * 1000))
        : 500,
      imageUrl: p.images?.[0]?.src,
      description: p.description?.es?.replace(/<[^>]+>/g, " ").trim(),
    }));
  }

  async listCustomers(): Promise<Customer[]> {
    const rows =
      await this.call<
        Array<{
          id: number;
          name: string;
          phone?: string;
          email?: string;
          default_address?: { city?: string };
        }>
      >("/customers?per_page=200");
    return rows.map((c) => ({
      id: `cust_${c.id}`,
      externalId: String(c.id),
      name: c.name,
      phone: normalizePhone(c.phone ?? "") ?? c.phone ?? "",
      email: c.email,
      city: c.default_address?.city,
      whatsappConsent: false,
    }));
  }

  async listOrders(opts: { limit?: number } = {}): Promise<Order[]> {
    const rows = await this.call<TnOrder[]>(`/orders?per_page=${opts.limit ?? 50}`);
    return rows
      .map((o) => orderFromTiendanube(o, this.storeId))
      .filter((o): o is Order => Boolean(o));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return orderFromTiendanube(await this.call<TnOrder>(`/orders/${id}`), this.storeId);
  }

  /** Marca la orden de envío como despachada y le pone el tracking. */
  async addFulfillment(orderId: string, input: FulfillmentInput): Promise<void> {
    const fos = await this.call<Array<{ id: string }>>(`/orders/${orderId}/fulfillment-orders`);
    const fo = fos[0];
    if (!fo) throw new Error(`El pedido ${orderId} no tiene orden de envío en Tiendanube.`);
    await this.call(`/orders/${orderId}/fulfillment-orders/${fo.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "DISPATCHED",
        tracking_info: {
          code: input.trackingNumber,
          url: input.url,
          notify_customer: input.notifyCustomer ?? false,
        },
      }),
    });
  }

  async addNote(orderId: string, note: string): Promise<void> {
    await this.call(`/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify({ owner_note: note }),
    });
  }

  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean {
    const sig = header(headers, "x-linkedstore-hmac-sha256");
    if (!sig) return false;
    // La documentación no dice la codificación: aceptamos hex o base64 del mismo HMAC.
    return (
      safeEqual(sig, hmac(this.cfg.appSecret, rawBody, "hex")) ||
      safeEqual(sig, hmac(this.cfg.appSecret, rawBody, "base64"))
    );
  }

  /** El webhook de Tiendanube solo trae `{store_id, event, id}`: el pedido completo se pide aparte con getOrder(id). */
  normalizeOrderWebhook(
    _headers: Record<string, string | undefined>,
    payload: unknown,
  ): Order | undefined {
    const p = payload as TnOrder & { event?: string };
    if (p.event && p.event !== "order/created") return undefined;
    return orderFromTiendanube(p, this.storeId);
  }
}
