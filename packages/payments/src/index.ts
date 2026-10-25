// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHash } from "node:crypto";
import { newId } from "@traxo/core";

export type PaymentLinkInput = {
  orderId: string;
  /** Monto final a pagar, en COP (ya con el descuento aplicado). */
  amount: number;
  description: string;
};
export type PaymentLink = {
  id: string;
  url: string;
  amount: number;
  expiresAt: string;
  simulated: boolean;
};

/** Todo cobro por link pasa por aquí. Traxo nunca custodia dinero: usa las credenciales del comercio. */
export interface PaymentLinkProvider {
  readonly name: string;
  readonly live: boolean;
  createLink(input: PaymentLinkInput): Promise<PaymentLink>;
}

export class MockPayments implements PaymentLinkProvider {
  readonly name = "mock";
  readonly live = false;
  async createLink(i: PaymentLinkInput): Promise<PaymentLink> {
    const id = newId("pay");
    return {
      id,
      url: `https://pago.traxo.invalid/${id}`,
      amount: i.amount,
      expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      simulated: true,
    };
  }
}

export type WompiConfig = {
  privateKey: string;
  env?: "sandbox" | "production";
  eventsSecret?: string;
  fetch?: typeof fetch;
};

/**
 * Links de pago de Wompi (POST /v1/payment_links). SIN VERIFICAR contra una cuenta real: forma del cuerpo y de la respuesta
 * según la documentación pública; se prueba con fetch simulado.
 */
export class WompiPayments implements PaymentLinkProvider {
  readonly name = "wompi";
  readonly live = true;
  private f: typeof fetch;
  constructor(private cfg: WompiConfig) {
    this.f = cfg.fetch ?? fetch;
  }
  private get base(): string {
    return this.cfg.env === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";
  }
  async createLink(i: PaymentLinkInput): Promise<PaymentLink> {
    const expiresAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
    const res = await this.f(`${this.base}/payment_links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.privateKey}`,
      },
      body: JSON.stringify({
        name: `Pedido ${i.orderId}`.slice(0, 60),
        description: i.description.slice(0, 200),
        single_use: true,
        collect_shipping: false,
        currency: "COP",
        amount_in_cents: Math.round(i.amount) * 100,
        expires_at: expiresAt,
      }),
    });
    if (res.status === 401 || res.status === 403)
      throw new Error("Wompi rechazó la llave privada. Revisa WOMPI_PRIVATE_KEY.");
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id?: string };
      error?: { messages?: unknown };
    };
    if (!res.ok || !json.data?.id) throw new Error(`Wompi no creó el link (HTTP ${res.status}).`);
    const host = this.cfg.env === "production" ? "checkout.wompi.co/l" : "checkout.wompi.co/l";
    return {
      id: json.data.id,
      url: `https://${host}/${json.data.id}`,
      amount: i.amount,
      expiresAt,
      simulated: this.cfg.env !== "production",
    };
  }

  /** Firma de eventos: SHA-256 de los valores de `signature.properties` + timestamp + secreto. */
  verifyEvent(event: {
    data?: Record<string, unknown>;
    signature?: { properties?: string[]; checksum?: string };
    timestamp?: number;
  }): boolean {
    const sig = event.signature;
    if (
      !this.cfg.eventsSecret ||
      !sig?.checksum ||
      !sig.properties ||
      event.timestamp === undefined
    )
      return false;
    const values = sig.properties.map((p) =>
      p
        .split(".")
        .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], event.data),
    );
    const digest = createHash("sha256")
      .update(`${values.join("")}${event.timestamp}${this.cfg.eventsSecret}`)
      .digest("hex");
    return digest === sig.checksum;
  }
}

export function paymentsFromEnv(
  env: Record<string, string | undefined> = process.env,
): PaymentLinkProvider {
  return env.WOMPI_PRIVATE_KEY
    ? new WompiPayments({
        privateKey: env.WOMPI_PRIVATE_KEY,
        env: env.WOMPI_ENV === "production" ? "production" : "sandbox",
        eventsSecret: env.WOMPI_EVENTS_SECRET,
      })
    : new MockPayments();
}
