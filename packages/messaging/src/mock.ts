// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { InboundMessage, MessagingProvider, OutboundMessage, SentMessage } from "./types.ts";

export class MockMessaging implements MessagingProvider {
  readonly name = "mock";
  readonly sent: SentMessage[] = [];
  private seen = new Map<string, SentMessage>();

  async send(msg: OutboundMessage): Promise<SentMessage> {
    const prev = this.seen.get(msg.idempotencyKey);
    if (prev) return prev;
    const out: SentMessage = {
      id: `wamid_mock_${this.sent.length + 1}`,
      to: msg.to,
      text: msg.text,
      at: new Date().toISOString(),
      simulated: true,
    };
    this.sent.push(out);
    this.seen.set(msg.idempotencyKey, out);
    return out;
  }
  verifyWebhook(): boolean {
    return true;
  }
  parseInbound(payload: unknown): InboundMessage | undefined {
    const p = payload as Partial<InboundMessage> | undefined;
    return p?.from && p.text
      ? { from: p.from, text: p.text, at: p.at ?? new Date().toISOString() }
      : undefined;
  }
}
