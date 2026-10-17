import type { Customer, Order, Platform, Product } from "@traxo/core";
import { DEMO_PRODUCTS, DEMO_STORE, demoCustomers, demoHistory } from "./demo-data.ts";
import type { CommerceAdapter, FulfillmentInput } from "./types.ts";

export type FulfillmentRecord = FulfillmentInput & { orderId: string; at: string };

/** Tienda en memoria con datos demo. Es el adapter por defecto cuando no hay credenciales. */
export class MockCommerce implements CommerceAdapter {
  readonly platform: Platform = "mock";
  readonly storeId = DEMO_STORE.id;
  readonly fulfillments: FulfillmentRecord[] = [];
  readonly notes: Array<{ orderId: string; note: string }> = [];
  private orders = new Map<string, Order>();

  constructor(seedHistory = true) {
    if (seedHistory) for (const o of demoHistory()) this.orders.set(o.id, o);
  }

  async listProducts(): Promise<Product[]> {
    return DEMO_PRODUCTS;
  }
  async listCustomers(): Promise<Customer[]> {
    return demoCustomers();
  }
  async listOrders(opts: { limit?: number } = {}): Promise<Order[]> {
    const all = [...this.orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts.limit ? all.slice(0, opts.limit) : all;
  }
  async getOrder(id: string): Promise<Order | undefined> {
    return this.find(id);
  }
  /** Los pedidos se buscan por id interno o por id de la tienda (los adapters reales solo conocen el externo). */
  private find(id: string): Order | undefined {
    return this.orders.get(id) ?? [...this.orders.values()].find((o) => o.externalId === id);
  }
  async addFulfillment(orderId: string, input: FulfillmentInput): Promise<void> {
    if (!this.find(orderId)) throw new Error(`Pedido ${orderId} no existe en la tienda`);
    this.fulfillments.push({ ...input, orderId, at: new Date().toISOString() });
  }
  async addNote(orderId: string, note: string): Promise<void> {
    this.notes.push({ orderId, note });
  }
  verifyWebhook(): boolean {
    return true;
  }
  normalizeOrderWebhook(
    _h: Record<string, string | undefined>,
    payload: unknown,
  ): Order | undefined {
    const o = payload as Order | undefined;
    if (o && typeof o === "object" && "lines" in o) {
      this.orders.set(o.id, o);
      return o;
    }
    return undefined;
  }

  /** Para el botón "Simular pedido": mete un pedido nuevo en la tienda. */
  receive(order: Order): Order {
    this.orders.set(order.id, order);
    return order;
  }
}
