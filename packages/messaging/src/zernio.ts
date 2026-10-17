import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundMessage, MessagingProvider, OutboundMessage, SentMessage } from "./types.ts";

export type ZernioConfig = {
  apiKey: string;
  webhookSecret?: string;
  /** Por defecto https://zernio.com/api/v1 */
  baseUrl?: string;
  /** Perfil de la tienda en Zernio (el `externalId` es el id de la tienda en Traxo). */
  profileId?: string;
  /** Idioma de las plantillas aprobadas. */
  templateLanguage?: string;
  fetch?: typeof fetch;
};

type ZernioMessageEvent = {
  id?: string;
  event?: string;
  conversation?: { id?: string };
  message?: {
    id?: string;
    from?: string;
    text?: string;
    createdAt?: string;
    type?: string;
    button?: { text?: string; payload?: string };
  };
};

/**
 * Cliente de Zernio (API unificada de WhatsApp/Instagram/Facebook). Reglas de diseño:
 * - Fuera de la ventana de 24 h solo se puede iniciar con una plantilla aprobada; dentro, texto libre.
 * - Cada envío lleva `Idempotency-Key` (id del mensaje en nuestra BD).
 * - Un 5xx es ambiguo (pudo salir o no): se avisa en vez de reintentar a ciegas. Un 429 respeta `Retry-After`.
 *
 * SIN VERIFICAR contra la cuenta real (ver docs/integraciones/tiendas-y-canales.md): rutas exactas de
 * envío y la forma del "button reply". El adapter está probado con fetch simulado.
 */
export class ZernioMessaging implements MessagingProvider {
  readonly name = "zernio";
  private f: typeof fetch;

  constructor(private cfg: ZernioConfig) {
    this.f = cfg.fetch ?? fetch;
  }

  private get base(): string {
    return (this.cfg.baseUrl ?? "https://zernio.com/api/v1").replace(/\/$/, "");
  }

  private async post<T>(
    path: string,
    body: unknown,
    idempotencyKey: string,
    attempt = 0,
  ): Promise<T> {
    const res = await this.f(`${this.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Zernio rechazó la clave. Cópiala de nuevo en ZERNIO_API_KEY (Ajustes → API).",
      );
    }
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? "1"), 10) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      return this.post(path, body, idempotencyKey, attempt + 1);
    }
    if (res.status >= 500) {
      throw new Error(
        `Zernio respondió ${res.status}. No sé si el mensaje salió; revisa la conversación antes de reenviar.`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok) throw new Error(`Zernio: ${json.error ?? json.message ?? `HTTP ${res.status}`}`);
    return json;
  }

  async send(msg: OutboundMessage): Promise<SentMessage> {
    // Con plantilla se puede iniciar o reabrir la conversación (también fuera de la ventana de 24 h).
    const body = msg.template
      ? {
          profileId: this.cfg.profileId,
          channel: "whatsapp",
          to: msg.to,
          templateName: msg.template.name,
          templateLanguage: this.cfg.templateLanguage ?? "es_CO",
          templateParams: msg.template.params,
        }
      : {
          profileId: this.cfg.profileId,
          channel: "whatsapp",
          to: msg.to,
          text: msg.text,
          ...(msg.buttons?.length
            ? { interactive: { type: "buttons", buttons: msg.buttons.map((b) => ({ title: b })) } }
            : {}),
        };
    const path = msg.template ? "/inbox/conversations" : "/inbox/messages";
    const out = await this.post<{ id?: string; messageId?: string }>(
      path,
      body,
      msg.idempotencyKey,
    );
    return {
      id: out.messageId ?? out.id ?? msg.idempotencyKey,
      to: msg.to,
      text: msg.text,
      at: new Date().toISOString(),
      simulated: false,
    };
  }

  /** `X-Zernio-Signature`: HMAC-SHA256 en hex del cuerpo crudo. */
  verifyWebhook(headers: Record<string, string | undefined>, rawBody: string): boolean {
    if (!this.cfg.webhookSecret) return false;
    const sig = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === "x-zernio-signature",
    )?.[1];
    if (!sig) return false;
    const expected = createHmac("sha256", this.cfg.webhookSecret)
      .update(rawBody, "utf8")
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseInbound(payload: unknown): InboundMessage | undefined {
    const p = payload as ZernioMessageEvent;
    if (p.event && p.event !== "message.received") return undefined;
    const m = p.message;
    if (!m?.from) return undefined;
    const button = m.button?.text ?? m.button?.payload;
    const text = m.text ?? button;
    if (!text) return undefined;
    return {
      from: normalizeE164(m.from),
      text,
      at: m.createdAt ?? new Date().toISOString(),
      buttonReply: button,
    };
  }
}

function normalizeE164(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.startsWith("57") && d.length === 12 ? `+${d}` : raw.startsWith("+") ? raw : `+${d}`;
}
