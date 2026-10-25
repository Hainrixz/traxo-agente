// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHmac } from "node:crypto";
import type {
  CreatedShipment,
  Quote,
  ShipmentDraft,
  TrackingEvent,
  TrackingStatus,
} from "@traxo/core";
import { cityByDane } from "@traxo/geo-co";
import type { CarrierProvider } from "./types.ts";

export type EnviaConfig = {
  token: string;
  env?: "sandbox" | "production";
  origin: {
    name: string;
    phone: string;
    street: string;
    city: string;
    dane: string;
    department?: string;
  };
  /** Transportadoras de Colombia que se cotizan (códigos de Envia.com). */
  carriers?: string[];
  /**
   * Dónde va `cash_on_delivery`. La documentación de Envia.com se contradice
   * (additionalServices del envío vs. de cada paquete): se verifica en sandbox.
   */
  codPlacement?: "shipment" | "package";
  fetch?: typeof fetch;
};

const HOSTS = {
  sandbox: "https://api-test.envia.com",
  production: "https://api.envia.com",
} as const;
const DEFAULT_CARRIERS = ["coordinadora", "servientrega", "interrapidisimo", "tcc", "deprisa"];

type EnviaResponse<T> = {
  meta?: string;
  data?: T;
  error?: { message?: string; description?: string } | string;
};

export function mapEnviaStatus(text: string): TrackingStatus {
  const t = text.toLowerCase();
  if (/entregad|delivered/.test(t)) return "delivered";
  if (/novedad|incident|exception|fallid|failed|rechaz|no se pudo/.test(t)) return "incident";
  if (/devol|return/.test(t)) return "returning";
  if (/reparto|out for delivery|ultima milla|last mile/.test(t)) return "out_for_delivery";
  if (/tr[aá]nsito|transit|en ruta/.test(t)) return "in_transit";
  if (/recogid|picked|recolect/.test(t)) return "picked_up";
  if (/cancel/.test(t)) return "cancelled";
  return "created";
}

/** "2-3 días", "3 days", "Next day"… → días hábiles (el mayor del rango). */
export function parseDeliveryDays(estimate: unknown): number {
  const s = String(estimate ?? "");
  if (/next day|siguiente/i.test(s)) return 1;
  const nums = [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
  return nums.length ? Math.max(1, ...nums) : 3;
}

/**
 * Firma de webhooks firmados de Envia.com: `X-Webhook-Signature: v1=HMAC(ts + "." + event + "." + body)`.
 * SUPUESTO sin verificar: el hash es SHA-256 en hex. Confirmar con el secreto del panel de Envia.com.
 */
export function verifyEnviaWebhook(
  headers: Record<string, string | undefined>,
  rawBody: string,
  secret: string,
): boolean {
  const get = (n: string) => Object.entries(headers).find(([k]) => k.toLowerCase() === n)?.[1];
  const sig = get("x-webhook-signature");
  const ts = get("x-webhook-timestamp");
  const ev = get("x-webhook-event");
  if (!sig || !ts || !ev) return false;
  const expected = `v1=${createHmac("sha256", secret).update(`${ts}.${ev}.${rawBody}`).digest("hex")}`;
  return expected.length === sig.length && expected === sig;
}

export class EnviaComProvider implements CarrierProvider {
  readonly id = "envia-com";
  readonly label = "Envia.com";
  readonly live = true;
  private f: typeof fetch;
  private carrierByTracking = new Map<string, string>();

  constructor(private cfg: EnviaConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  private get host(): string {
    return HOSTS[this.cfg.env ?? "sandbox"];
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.f(`${this.host}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401)
      throw new Error(
        "Envia.com rechazó el token. Copia de nuevo la clave desde Ajustes → Desarrolladores.",
      );
    const text = await res.text();
    let json: EnviaResponse<T>;
    try {
      json = JSON.parse(text) as EnviaResponse<T>;
    } catch {
      throw new Error(`Envia.com respondió ${res.status} sin JSON: ${text.slice(0, 120)}`);
    }
    // Algunos errores llegan con HTTP 200 y meta:"error".
    if (!res.ok || json.meta === "error") {
      const e = json.error;
      const msg =
        typeof e === "string" ? e : (e?.description ?? e?.message ?? `HTTP ${res.status}`);
      throw new Error(`Envia.com: ${msg}`);
    }
    return json.data as T;
  }

  private address(a: {
    name: string;
    phone: string;
    street: string;
    city: string;
    dane: string;
    department?: string;
  }) {
    const city = cityByDane(a.dane);
    return {
      name: a.name,
      phone: a.phone,
      street: a.street,
      city: a.city,
      // SUPUESTO sin verificar: Envia.com pide sus propios códigos de estado (GET /state?country_code=CO). Mientras tanto, DIVIPOLA de 2 dígitos.
      state: a.dane.slice(0, 2),
      country: "CO",
      postalCode: a.dane,
      ...(city ? { district: city.department } : {}),
    };
  }

  private body(draft: ShipmentDraft, carrier: string, service?: string) {
    const cod =
      draft.codAmount > 0
        ? [{ service: "cash_on_delivery", data: { amount: draft.codAmount } }]
        : undefined;
    const placement = this.cfg.codPlacement ?? "shipment";
    const pkg = {
      type: "box",
      content: draft.contents,
      amount: 1,
      declaredValue: draft.declaredValue,
      weight: Math.max(0.5, Math.round(draft.weightGrams / 100) / 10),
      weightUnit: "KG",
      lengthUnit: "CM",
      dimensions: { length: 25, width: 20, height: 12 },
      ...(cod && placement === "package" ? { additionalServices: cod } : {}),
    };
    return {
      origin: this.address({ ...this.cfg.origin, dane: draft.origin.dane }),
      destination: this.address(draft.destination),
      packages: [pkg],
      shipment: { type: 1, carrier, ...(service ? { service } : {}) },
      settings: { currency: "COP" },
      ...(cod && placement === "shipment" ? { additionalServices: cod } : {}),
    };
  }

  async quote(draft: ShipmentDraft): Promise<Quote[]> {
    const carriers = this.cfg.carriers ?? DEFAULT_CARRIERS;
    // Envia.com cotiza una transportadora por llamada: se paralelizan y las que fallan no tumban a las demás.
    const results = await Promise.allSettled(
      carriers.map((c) =>
        this.post<
          Array<{
            carrier?: string;
            service: string;
            serviceDescription?: string;
            deliveryEstimate?: string;
            totalPrice: number;
            cashOnDeliveryCommission?: number;
          }>
        >("/ship/rate/", this.body(draft, c)),
      ),
    );
    const quotes: Quote[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      for (const row of r.value ?? []) {
        const commission = Math.round(row.cashOnDeliveryCommission ?? 0);
        quotes.push({
          provider: this.id,
          carrier: prettyCarrier(row.carrier ?? carriers[i] ?? ""),
          service: row.serviceDescription ?? row.service,
          freight: Math.round(row.totalPrice),
          codCommission: commission,
          // Si pedimos recaudo y la transportadora no devolvió comisión, esa ruta no ofrece contraentrega.
          supportsCod: draft.codAmount === 0 ? true : commission > 0,
          businessDays: parseDeliveryDays(row.deliveryEstimate),
          currency: "COP",
          // Las tarifas del sandbox son simuladas.
          simulated: (this.cfg.env ?? "sandbox") === "sandbox",
        });
      }
    });
    if (quotes.length === 0) {
      const firstError = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      if (firstError) throw firstError.reason;
    }
    return quotes;
  }

  async createShipment(draft: ShipmentDraft, chosen: Quote): Promise<CreatedShipment> {
    const data = await this.post<
      Array<{
        carrier?: string;
        service?: string;
        trackingNumber: string;
        label: string;
        trackUrl: string;
        totalPrice?: number;
      }>
    >(
      "/ship/generate/",
      this.body(draft, chosen.carrier.toLowerCase().replace(/[^a-z]/g, ""), chosen.service),
    );
    const row = data?.[0];
    if (!row?.trackingNumber) throw new Error("Envia.com no devolvió número de guía.");
    this.carrierByTracking.set(
      row.trackingNumber,
      chosen.carrier.toLowerCase().replace(/[^a-z]/g, ""),
    );
    return {
      provider: this.id,
      carrier: chosen.carrier,
      service: chosen.service,
      trackingNumber: row.trackingNumber,
      labelUrl: row.label,
      trackUrl: row.trackUrl,
      total: Math.round(row.totalPrice ?? chosen.freight + chosen.codCommission),
      simulated: (this.cfg.env ?? "sandbox") === "sandbox",
    };
  }

  async track(trackingNumber: string): Promise<TrackingEvent[]> {
    const data = await this.post<
      Array<{
        status?: string;
        statusDescription?: string;
        eventHistory?: Array<{
          status?: string;
          description?: string;
          location?: string;
          date?: string;
        }>;
      }>
    >("/ship/generaltrack/", { trackingNumbers: [trackingNumber] });
    const row = data?.[0];
    if (!row) return [];
    const history = row.eventHistory?.length
      ? row.eventHistory.map((e) => ({
          status: mapEnviaStatus(`${e.status ?? ""} ${e.description ?? ""}`),
          description: e.description ?? e.status ?? "",
          location: e.location,
          at: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
        }))
      : [
          {
            status: mapEnviaStatus(`${row.status ?? ""} ${row.statusDescription ?? ""}`),
            description: row.statusDescription ?? row.status ?? "",
            at: new Date().toISOString(),
          },
        ];
    return history;
  }

  /** La documentación se contradice (carrier+trackingNumber vs shipmentId): se envía lo que sabemos; verificar en sandbox. */
  async cancel(trackingNumber: string): Promise<void> {
    const carrier = this.carrierByTracking.get(trackingNumber);
    if (!carrier)
      throw new Error(
        "No sé con qué transportadora salió esa guía; cancélala desde el panel de Envia.com.",
      );
    await this.post("/ship/cancel/", { carrier, trackingNumber });
  }
}

function prettyCarrier(code: string): string {
  const map: Record<string, string> = {
    coordinadora: "Coordinadora",
    servientrega: "Servientrega",
    interrapidisimo: "Interrapidísimo",
    tcc: "TCC",
    deprisa: "Deprisa",
  };
  return map[code.toLowerCase()] ?? code;
}
