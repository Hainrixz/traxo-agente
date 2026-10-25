// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MockMessaging, messagingFromEnv, render, ZernioMessaging } from "../src/index.ts";

function fake(handler: (url: string, body: Record<string, unknown>, headers: Headers) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const headers = new Headers(init.headers);
    calls.push({ url, body, headers });
    return handler(url, body, headers);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (o: unknown, status = 200, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(o), { status, headers: h });

describe("ZernioMessaging", () => {
  it("con plantilla inicia la conversación y manda Idempotency-Key y Bearer", async () => {
    const { f, calls } = fake(() => json({ id: "m1" }));
    const z = new ZernioMessaging({ apiKey: "sk_x", profileId: "store_demo", fetch: f });
    const r = await z.send({
      to: "+573001234567",
      text: "hola",
      template: { name: "pedido_en_camino", params: ["Ana", "Coordinadora", "123"] },
      idempotencyKey: "ord1:camino",
    });
    expect(r).toMatchObject({ id: "m1", simulated: false });
    expect(calls[0]?.url).toBe("https://zernio.com/api/v1/inbox/conversations");
    expect(calls[0]?.headers.get("idempotency-key")).toBe("ord1:camino");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk_x");
    expect(calls[0]?.body).toMatchObject({
      templateName: "pedido_en_camino",
      templateLanguage: "es_CO",
      templateParams: ["Ana", "Coordinadora", "123"],
    });
  });
  it("sin plantilla manda texto libre con botones", async () => {
    const { f, calls } = fake(() => json({ messageId: "m2" }));
    await new ZernioMessaging({ apiKey: "k", fetch: f }).send({
      to: "+573001234567",
      text: "¿Confirmas?",
      buttons: ["Sí", "No"],
      idempotencyKey: "k1",
    });
    expect(calls[0]?.body.text).toBe("¿Confirmas?");
    expect((calls[0]?.body.interactive as { buttons: unknown[] }).buttons).toHaveLength(2);
  });
  it("respeta Retry-After en un 429 y luego envía", async () => {
    let n = 0;
    const { f } = fake(() =>
      n++ === 0 ? json({}, 429, { "retry-after": "0" }) : json({ id: "ok" }),
    );
    const r = await new ZernioMessaging({ apiKey: "k", fetch: f }).send({
      to: "+573001234567",
      text: "x",
      idempotencyKey: "k",
    });
    expect(r.id).toBe("ok");
    expect(n).toBe(2);
  });
  it("un 500 no se reintenta a ciegas y avisa que el mensaje pudo salir", async () => {
    let n = 0;
    const { f } = fake(() => {
      n++;
      return json({}, 500);
    });
    await expect(
      new ZernioMessaging({ apiKey: "k", fetch: f }).send({
        to: "+573001234567",
        text: "x",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("No sé si el mensaje salió");
    expect(n).toBe(1);
  });
  it("traduce una clave inválida", async () => {
    const { f } = fake(() => json({}, 401));
    await expect(
      new ZernioMessaging({ apiKey: "mala", fetch: f }).send({
        to: "+573001234567",
        text: "x",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("ZERNIO_API_KEY");
  });
  it("verifica la firma hex del webhook sobre el cuerpo crudo", () => {
    const z = new ZernioMessaging({ apiKey: "k", webhookSecret: "whsec" });
    const raw = JSON.stringify({ event: "message.received" });
    const sig = createHmac("sha256", "whsec").update(raw).digest("hex");
    expect(z.verifyWebhook({ "X-Zernio-Signature": sig }, raw)).toBe(true);
    expect(z.verifyWebhook({ "X-Zernio-Signature": sig }, `${raw} `)).toBe(false);
    expect(
      new ZernioMessaging({ apiKey: "k" }).verifyWebhook({ "x-zernio-signature": sig }, raw),
    ).toBe(false);
  });
  it("interpreta mensajes entrantes, incluido el botón", () => {
    const z = new ZernioMessaging({ apiKey: "k" });
    expect(
      z.parseInbound({ event: "message.received", message: { from: "573001234567", text: "Sí" } }),
    ).toMatchObject({ from: "+573001234567", text: "Sí" });
    expect(
      z.parseInbound({
        event: "message.received",
        message: { from: "573001234567", button: { text: "Reprogramar" } },
      })?.buttonReply,
    ).toBe("Reprogramar");
    expect(
      z.parseInbound({ event: "message.sent", message: { from: "1", text: "x" } }),
    ).toBeUndefined();
  });
});

describe("selección y plantillas", () => {
  it("sin clave usa el simulador; con clave, Zernio", () => {
    expect(messagingFromEnv({}).name).toBe("mock");
    expect(messagingFromEnv({ ZERNIO_API_KEY: "k" }).name).toBe("zernio");
  });
  it("el simulador es idempotente", async () => {
    const m = new MockMessaging();
    await m.send({ to: "+573001234567", text: "a", idempotencyKey: "k" });
    await m.send({ to: "+573001234567", text: "a", idempotencyKey: "k" });
    expect(m.sent).toHaveLength(1);
  });
  it("las plantillas hablan de tú y llevan el monto en COP", () => {
    const t = render("llega_hoy", {
      nombre: "Valentina Ospina",
      tienda: "Café de Origen",
      guia: "123",
      monto: 136000,
    });
    expect(t).toContain("Hola Valentina");
    expect(t).toContain("$ 136.000");
  });
});
