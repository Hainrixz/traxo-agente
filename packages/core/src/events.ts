// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
/** Eventos que el agente emite. Alimentan el feed del dashboard (SSE) y la tabla agent_runs. */
export type AgentEventKind =
  | "order.received"
  | "address.normalized"
  | "quotes.requested"
  | "quotes.received"
  | "carrier.selected"
  | "approval.requested"
  | "shipment.created"
  | "fulfillment.written"
  | "message.sent"
  | "tracking.updated"
  | "incident.detected"
  | "incident.resolved"
  | "marketing.draft"
  | "confirmation.requested"
  | "confirmation.received"
  | "order.cancelled"
  | "payment.link"
  | "payment.received"
  | "store.imported"
  | "audit.done"
  | "error";

export type AgentEvent = {
  id: string;
  at: string;
  kind: AgentEventKind;
  orderId?: string;
  /** Tienda a la que pertenece el evento (para que cada cuenta vea solo lo suyo). */
  storeId?: string;
  /** Frase en primera persona, en español, lista para mostrar. */
  summary: string;
  data?: Record<string, unknown>;
};

type Listener = (e: AgentEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  private seq = 0;
  private last = 0;
  /** Decide a qué tienda pertenece un evento (por su pedido). Lo define el runtime. */
  resolveStore?: (e: Pick<AgentEvent, "orderId" | "data">) => string | undefined;

  emit(kind: AgentEventKind, summary: string, extra: Partial<AgentEvent> = {}): AgentEvent {
    // Marca de tiempo estrictamente creciente: el feed conserva el orden real aunque dos eventos caigan en el mismo milisegundo.
    const t = Math.max(Date.now(), this.last + 1);
    this.last = t;
    const event: AgentEvent = {
      id: `ev_${t.toString(36)}_${(this.seq++).toString(36)}`,
      at: new Date(t).toISOString(),
      kind,
      summary,
      ...extra,
    };
    event.storeId ??= this.resolveStore?.(event);
    for (const l of this.listeners) l(event);
    return event;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
