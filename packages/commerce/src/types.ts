// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Customer, Order, Platform, Product } from "@traxo/core";

export type FulfillmentInput = {
  carrier: string;
  trackingNumber: string;
  url: string;
  notifyCustomer?: boolean;
};

/** Todo lo que Traxo necesita de una tienda. Un adapter por plataforma; el agente no sabe cuál es. */
export interface CommerceAdapter {
  readonly platform: Platform;
  readonly storeId: string;
  listProducts(): Promise<Product[]>;
  listCustomers(): Promise<Customer[]>;
  listOrders(opts?: { limit?: number }): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;
  /** Escribe la guía en la tienda (fulfillment + tracking). */
  addFulfillment(orderId: string, input: FulfillmentInput): Promise<void>;
  addNote(orderId: string, note: string): Promise<void>;
  /** Verifica la firma del webhook con el cuerpo CRUDO. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean;
  /** Convierte el payload de la plataforma en un Order de Traxo (o undefined si el tema no es de pedido nuevo). */
  normalizeOrderWebhook(
    headers: Record<string, string | undefined>,
    payload: unknown,
  ): Order | undefined;
}
