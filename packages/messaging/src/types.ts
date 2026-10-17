export type TemplateName =
  | "pedido_en_camino"
  | "llega_hoy"
  | "novedad_entrega"
  | "confirmar_contraentrega"
  | "pago_recibido"
  | "pedido_cancelado";

export type OutboundMessage = {
  /** Teléfono en E.164. */
  to: string;
  /** Texto final, ya renderizado (también sirve para el modo mock y el dashboard). */
  text: string;
  template?: { name: TemplateName; params: string[] };
  buttons?: string[];
  /** Clave de idempotencia: id del mensaje en nuestra BD. */
  idempotencyKey: string;
};

export type SentMessage = { id: string; to: string; text: string; at: string; simulated: boolean };

export type InboundMessage = { from: string; text: string; at: string; buttonReply?: string };

/** Todo envío pasa por aquí. Nadie más llama a Zernio directamente. */
export interface MessagingProvider {
  readonly name: string;
  send(msg: OutboundMessage): Promise<SentMessage>;
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean;
  parseInbound(payload: unknown): InboundMessage | undefined;
}
