import { mapEnviaStatus, verifyEnviaWebhook } from "@traxo/carriers";
import { type CommerceAdapter } from "@traxo/commerce";
import { EventBus, type Order, type TrackingEvent } from "@traxo/core";
import { claimWebhookEvent, type Db, saveOrder } from "@traxo/db";
import type { InboundMessage, MessagingProvider } from "@traxo/messaging";
import { Hono } from "hono";

export type AppDeps = {
  db: Db;
  bus: EventBus;
  /** Un adapter por plataforma instalada. */
  commerce: Partial<Record<string, CommerceAdapter>>;
  /** Se llama una sola vez por pedido nuevo (F3 conecta aquí el bucle del agente). */
  onOrder?: (order: Order) => Promise<void> | void;
  /** Canal de mensajería (Zernio) y qué hacer con lo que el cliente responde. */
  messaging?: MessagingProvider;
  /** Evento de tracking que llega por webhook de una transportadora. Devuelve false si la guía no existe. */
  onCarrierEvent?: (trackingNumber: string, event: TrackingEvent) => Promise<boolean> | boolean;
  onInbound?: (msg: InboundMessage) => Promise<void> | void;
  /** Proveedor de pagos con verificación de eventos firmados (Wompi). */
  payments?: { verifyEvent?: (event: any) => boolean };
  /** Un pago aprobado de un link: devuelve false si no hay un pedido esperándolo. */
  onPaymentApproved?: (paymentLinkId: string) => Promise<boolean> | boolean;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true, db: deps.db.mode }));

  /**
   * Webhook de pedidos de cualquier tienda: /webhooks/commerce/shopify, /tiendanube, /woocommerce.
   * 1) firma sobre el cuerpo CRUDO  2) dedupe  3) normaliza  4) guarda  5) responde 200 rápido.
   */
  app.post("/webhooks/commerce/:platform", async (c) => {
    const platform = c.req.param("platform");
    const adapter = deps.commerce[platform];
    if (!adapter) return c.json({ error: `Plataforma ${platform} no está conectada` }, 404);

    const raw = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });

    if (!adapter.verifyWebhook(headers, raw)) return c.json({ error: "Firma inválida" }, 401);

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ error: "Cuerpo no es JSON" }, 400);
    }

    const eventId =
      headers["x-shopify-webhook-id"] ??
      headers["x-wc-webhook-delivery-id"] ??
      String((payload as { id?: string | number }).id ?? "") ??
      "";
    if (eventId && !(await claimWebhookEvent(deps.db, platform, eventId))) {
      return c.json({ ok: true, duplicate: true });
    }

    const order = adapter.normalizeOrderWebhook(headers, payload);
    if (!order) return c.json({ ok: true, ignored: true });

    const { order: saved, created } = await saveOrder(deps.db, order);
    if (created) {
      deps.bus.emit(
        "order.received",
        `Me llegó el pedido ${saved.number} de ${saved.address.name} (${saved.address.city}).`,
        {
          orderId: saved.id,
        },
      );
      // No bloquea la respuesta: la tienda espera 200 en pocos segundos.
      void Promise.resolve(deps.onOrder?.(saved)).catch((e) =>
        deps.bus.emit(
          "error",
          `No pude procesar el pedido ${saved.number}: ${(e as Error).message}`,
          { orderId: saved.id },
        ),
      );
    }
    return c.json({ ok: true, orderId: saved.id, created });
  });

  /**
   * Webhook de tracking de Envia.com (evento `tracking.simple`): firma → dedupe por X-Webhook-Id → guarda el evento.
   * La firma (v1=HMAC) se verifica con ENVIA_WEBHOOK_SECRET; sin secreto configurado se rechaza todo.
   */
  app.post("/webhooks/carriers/envia-com", async (c) => {
    const secret = process.env.ENVIA_WEBHOOK_SECRET;
    const raw = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (!secret || !verifyEnviaWebhook(headers, raw, secret))
      return c.json({ error: "Firma inválida" }, 401);
    const id = headers["x-webhook-id"];
    if (id && !(await claimWebhookEvent(deps.db, "envia-com", id)))
      return c.json({ ok: true, duplicate: true });
    let payload: {
      data?: {
        tracking_number?: string;
        status?: string;
        status_description?: string;
        location?: string;
      };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ error: "Cuerpo no es JSON" }, 400);
    }
    const d = payload.data;
    if (!d?.tracking_number) return c.json({ ok: true, ignored: true });
    const description = d.status_description ?? d.status ?? "Actualización de la transportadora";
    const known = await deps.onCarrierEvent?.(d.tracking_number, {
      status: mapEnviaStatus(`${d.status ?? ""} ${description}`),
      description,
      location: d.location,
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, known: known !== false });
  });

  /** Mensajes entrantes de WhatsApp: firma → dedupe → interpreta → responde 200 rápido. */
  app.post("/webhooks/messaging", async (c) => {
    const m = deps.messaging;
    if (!m) return c.json({ error: "No hay canal de mensajería conectado" }, 404);
    const raw = await c.req.text();
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    if (!m.verifyWebhook(headers, raw)) return c.json({ error: "Firma inválida" }, 401);
    const eventId = headers["x-zernio-event-id"];
    if (eventId && !(await claimWebhookEvent(deps.db, "messaging", eventId)))
      return c.json({ ok: true, duplicate: true });
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return c.json({ error: "Cuerpo no es JSON" }, 400);
    }
    const inbound = m.parseInbound(payload);
    if (!inbound) return c.json({ ok: true, ignored: true });
    void Promise.resolve(deps.onInbound?.(inbound)).catch((e) =>
      deps.bus.emit(
        "error",
        `No pude atender un mensaje de ${inbound.from}: ${(e as Error).message}`,
      ),
    );
    return c.json({ ok: true });
  });

  /** Eventos de Wompi: firma → dedupe → si el pago del link fue aprobado, el pedido pasa a prepagado y sale la guía. */
  app.post("/webhooks/payments/wompi", async (c) => {
    if (!deps.payments?.verifyEvent)
      return c.json({ error: "No hay pagos con Wompi conectados" }, 404);
    let event: {
      event?: string;
      data?: { transaction?: { status?: string; payment_link_id?: string } };
      signature?: { checksum?: string };
    };
    try {
      event = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: "Cuerpo no es JSON" }, 400);
    }
    if (!deps.payments.verifyEvent(event)) return c.json({ error: "Firma inválida" }, 401);
    const id = event.signature?.checksum;
    if (id && !(await claimWebhookEvent(deps.db, "payments", id)))
      return c.json({ ok: true, duplicate: true });
    const tx = event.data?.transaction;
    if (event.event === "transaction.updated" && tx?.status === "APPROVED" && tx.payment_link_id) {
      const link = tx.payment_link_id;
      void Promise.resolve(deps.onPaymentApproved?.(link)).catch((e) =>
        deps.bus.emit("error", `No pude registrar un pago aprobado: ${(e as Error).message}`),
      );
    }
    return c.json({ ok: true });
  });

  return app;
}
