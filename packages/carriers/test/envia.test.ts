// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHmac } from "node:crypto";
import type { ShipmentDraft } from "@traxo/core";
import { describe, expect, it } from "vitest";
import {
  EnviaComProvider,
  mapEnviaStatus,
  parseDeliveryDays,
  verifyEnviaWebhook,
} from "../src/index.ts";

const draft: ShipmentDraft = {
  orderId: "ord_1",
  origin: { dane: "11001" },
  destination: {
    name: "Valentina",
    phone: "+573001234567",
    street: "Carrera 7 # 80-21",
    city: "Pereira",
    dane: "66001",
    department: "Risaralda",
  },
  weightGrams: 1500,
  declaredValue: 136000,
  codAmount: 136000,
  contents: "Café",
};
const origin = {
  name: "Café de Origen",
  phone: "+573000000000",
  street: "Calle 1 # 1-1",
  city: "Bogotá",
  dane: "11001",
};

function fakeEnvia(handler: (path: string, body: Record<string, unknown>) => unknown) {
  const calls: Array<{ url: string; auth: string | null; body: Record<string, unknown> }> = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, auth: new Headers(init.headers).get("authorization"), body });
    const out = handler(new URL(url).pathname, body);
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("EnviaComProvider (con fetch simulado)", () => {
  it("cotiza una transportadora por llamada, en sandbox y con Bearer, con recaudo", async () => {
    const { f, calls } = fakeEnvia((_p, body) => {
      const carrier = (body.shipment as { carrier: string }).carrier;
      if (carrier === "deprisa") return { meta: "error", error: { description: "Sin cobertura" } };
      return {
        meta: "rate",
        data: [
          {
            carrier,
            service: "standard",
            serviceDescription: "Estándar",
            deliveryEstimate: "2-3 días",
            totalPrice: 13200,
            cashOnDeliveryCommission: 3400,
          },
        ],
      };
    });
    const p = new EnviaComProvider({ token: "tok", origin, fetch: f });
    const quotes = await p.quote(draft);
    expect(calls).toHaveLength(5);
    expect(calls[0]?.url).toContain("https://api-test.envia.com/ship/rate/");
    expect(calls[0]?.auth).toBe("Bearer tok");
    expect((calls[0]?.body.additionalServices as Array<{ service: string }>)[0]?.service).toBe(
      "cash_on_delivery",
    );
    expect(quotes).toHaveLength(4); // deprisa falló y no tumbó a las demás
    expect(quotes[0]).toMatchObject({
      provider: "envia-com",
      freight: 13200,
      codCommission: 3400,
      businessDays: 3,
      supportsCod: true,
      simulated: true,
    });
  });

  it("marca sin contraentrega la ruta que no devuelve comisión", async () => {
    const { f } = fakeEnvia(() => ({
      data: [{ carrier: "tcc", service: "s", deliveryEstimate: "3 days", totalPrice: 15000 }],
    }));
    const quotes = await new EnviaComProvider({
      token: "t",
      origin,
      carriers: ["tcc"],
      fetch: f,
    }).quote(draft);
    expect(quotes[0]?.supportsCod).toBe(false);
  });

  it("puede poner el recaudo en el paquete (para probar el otro formato en sandbox)", async () => {
    const { f, calls } = fakeEnvia(() => ({ data: [] }));
    await new EnviaComProvider({
      token: "t",
      origin,
      carriers: ["coordinadora"],
      codPlacement: "package",
      fetch: f,
    }).quote(draft);
    const pkg = (calls[0]?.body.packages as Array<{ additionalServices?: unknown }>)[0];
    expect(pkg?.additionalServices).toBeDefined();
    expect(calls[0]?.body.additionalServices).toBeUndefined();
  });

  it("crea la guía y la puede cancelar", async () => {
    const { f, calls } = fakeEnvia((path) =>
      path === "/ship/generate/"
        ? {
            meta: "generate",
            data: [
              {
                carrier: "coordinadora",
                service: "standard",
                trackingNumber: "240045871236",
                label: "https://l/1.pdf",
                trackUrl: "https://t/1",
                totalPrice: 16600,
              },
            ],
          }
        : { data: {} },
    );
    const p = new EnviaComProvider({ token: "t", origin, fetch: f });
    const g = await p.createShipment(draft, {
      provider: "envia-com",
      carrier: "Coordinadora",
      service: "standard",
      freight: 13200,
      codCommission: 3400,
      supportsCod: true,
      businessDays: 3,
      currency: "COP",
      simulated: true,
    });
    expect(g).toMatchObject({
      trackingNumber: "240045871236",
      total: 16600,
      labelUrl: "https://l/1.pdf",
    });
    expect((calls[0]?.body.shipment as { carrier: string }).carrier).toBe("coordinadora");
    await p.cancel("240045871236");
    expect(calls[1]?.body).toEqual({ carrier: "coordinadora", trackingNumber: "240045871236" });
  });

  it("traduce errores: token inválido y meta:error con HTTP 200", async () => {
    const bad = (async () =>
      new Response("Authentication error.", { status: 401 })) as unknown as typeof fetch;
    await expect(
      new EnviaComProvider({ token: "x", origin, carriers: ["tcc"], fetch: bad }).quote(draft),
    ).rejects.toThrow("rechazó el token");
    const soft = (async () =>
      new Response(
        JSON.stringify({ meta: "error", error: { description: "Dirección inválida" } }),
        { status: 200 },
      )) as unknown as typeof fetch;
    await expect(
      new EnviaComProvider({ token: "x", origin, carriers: ["tcc"], fetch: soft }).createShipment(
        draft,
        {
          provider: "envia-com",
          carrier: "TCC",
          service: "s",
          freight: 1,
          codCommission: 0,
          supportsCod: false,
          businessDays: 1,
          currency: "COP",
          simulated: true,
        },
      ),
    ).rejects.toThrow("Dirección inválida");
  });

  it("rastrea y traduce el estado", async () => {
    const { f } = fakeEnvia(() => ({
      data: [
        {
          eventHistory: [
            { status: "Recogido", description: "Recogido en origen", date: "2026-10-16T10:00:00Z" },
            { status: "Novedad", description: "Cliente ausente", date: "2026-10-17T10:00:00Z" },
          ],
        },
      ],
    }));
    const ev = await new EnviaComProvider({ token: "t", origin, fetch: f }).track("1");
    expect(ev.map((e) => e.status)).toEqual(["picked_up", "incident"]);
  });
});

describe("utilidades de Envia.com", () => {
  it("mapea estados en español e inglés", () => {
    expect(mapEnviaStatus("Entregado al cliente")).toBe("delivered");
    expect(mapEnviaStatus("Out for delivery")).toBe("out_for_delivery");
    expect(mapEnviaStatus("En tránsito a Pereira")).toBe("in_transit");
    expect(mapEnviaStatus("Devolución al remitente")).toBe("returning");
  });
  it("interpreta el estimado de entrega", () => {
    expect(parseDeliveryDays("2-3 días")).toBe(3);
    expect(parseDeliveryDays("Next day")).toBe(1);
    expect(parseDeliveryDays(undefined)).toBe(3);
  });
  it("verifica la firma v1 del webhook (SHA-256 hex, supuesto sin verificar)", () => {
    const body = JSON.stringify({ data: { tracking_number: "1" } });
    const ts = "1760000000000";
    const sig = `v1=${createHmac("sha256", "s3").update(`${ts}.tracking.simple.${body}`).digest("hex")}`;
    const h = {
      "X-Webhook-Signature": sig,
      "X-Webhook-Timestamp": ts,
      "X-Webhook-Event": "tracking.simple",
    };
    expect(verifyEnviaWebhook(h, body, "s3")).toBe(true);
    expect(verifyEnviaWebhook(h, `${body} `, "s3")).toBe(false);
    expect(verifyEnviaWebhook({}, body, "s3")).toBe(false);
  });
});
