// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { describe, expect, it } from "vitest";
import { shopifyOrder } from "../src/fixtures.ts";
import {
  hmac,
  isCodOrder,
  orderFromShopify,
  ShopifyCommerce,
  TiendanubeCommerce,
  WooCommerce,
} from "../src/index.ts";

describe("Shopify", () => {
  const shop = new ShopifyCommerce({
    storeId: "s1",
    domain: "x.myshopify.com",
    adminToken: "t",
    webhookSecret: "secreto",
  });

  it("verifica la firma base64 sobre el cuerpo crudo", () => {
    const raw = JSON.stringify(shopifyOrder);
    const good = hmac("secreto", raw, "base64");
    expect(shop.verifyWebhook({ "X-Shopify-Hmac-Sha256": good }, raw)).toBe(true);
    expect(shop.verifyWebhook({ "x-shopify-hmac-sha256": good }, `${raw} `)).toBe(false);
    expect(shop.verifyWebhook({}, raw)).toBe(false);
  });

  it("normaliza el pedido: DANE, teléfono E.164, contraentrega y UTM", () => {
    const o = orderFromShopify(shopifyOrder, "s1");
    expect(o?.address.dane).toBe("66001");
    expect(o?.address.phone).toBe("+573001234567");
    expect(o?.address.street).toBe("Carrera 7 # 80-21 apto 402");
    expect(o?.payment).toBe("cod");
    expect(o?.total).toBe(136000);
    expect(o?.utm?.utm_source).toBe("instagram");
    expect(o?.lines[0]?.weightGrams).toBe(380);
  });

  it("detecta contraentrega por pasarela o etiqueta", () => {
    expect(isCodOrder({ tags: "COD, vip" })).toBe(true);
    expect(isCodOrder({ payment_gateway_names: ["Wompi"] })).toBe(false);
  });

  it("ignora temas que no son orders/create", () => {
    expect(
      shop.normalizeOrderWebhook({ "x-shopify-topic": "orders/paid" }, shopifyOrder),
    ).toBeUndefined();
  });

  it("crea el fulfillment con tracking vía GraphQL", async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      const data = body.query.includes("fulfillmentCreate")
        ? { fulfillmentCreate: { userErrors: [] } }
        : {
            order: {
              fulfillmentOrders: {
                nodes: [{ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN" }],
              },
            },
          };
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as unknown as typeof fetch;
    const s = new ShopifyCommerce({
      storeId: "s1",
      domain: "x.myshopify.com",
      adminToken: "t",
      webhookSecret: "x",
      fetch: fakeFetch,
    });
    await s.addFulfillment("820982911946154508", {
      carrier: "Coordinadora",
      trackingNumber: "240045871236",
      url: "https://t.co/1",
    });
    const mutation = calls[1];
    expect(mutation?.variables.f).toMatchObject({
      trackingInfo: { number: "240045871236", company: "Coordinadora" },
      lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1" }],
    });
  });

  it("falla con un mensaje claro si Shopify rechaza el envío", async () => {
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const data = body.query.includes("fulfillmentCreate")
        ? { fulfillmentCreate: { userErrors: [{ message: "ya despachado" }] } }
        : { order: { fulfillmentOrders: { nodes: [{ id: "g1", status: "OPEN" }] } } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as unknown as typeof fetch;
    const s = new ShopifyCommerce({
      storeId: "s1",
      domain: "d",
      adminToken: "t",
      webhookSecret: "x",
      fetch: fakeFetch,
    });
    await expect(
      s.addFulfillment("1", { carrier: "c", trackingNumber: "1", url: "u" }),
    ).rejects.toThrow("ya despachado");
  });
});

describe("Tiendanube", () => {
  const tn = new TiendanubeCommerce({
    storeId: "s2",
    tnStoreId: "123",
    accessToken: "t",
    appSecret: "app-secret",
  });
  const order = {
    id: 5521,
    number: 88,
    contact_email: "juan@correo.co",
    total: "89000",
    gateway: "cash_on_delivery",
    shipping_address: {
      name: "Juan Gómez",
      address: "Calle 10",
      number: "# 4-45",
      city: "Cali",
      province: "Valle del Cauca",
      phone: "3112223344",
    },
    products: [
      { product_id: 1, name: "Prensa francesa", quantity: 1, price: "89000", weight: "0.9" },
    ],
  };

  it("acepta la firma en hex o base64", () => {
    const raw = JSON.stringify(order);
    expect(
      tn.verifyWebhook({ "x-linkedstore-hmac-sha256": hmac("app-secret", raw, "hex") }, raw),
    ).toBe(true);
    expect(
      tn.verifyWebhook({ "x-linkedstore-hmac-sha256": hmac("app-secret", raw, "base64") }, raw),
    ).toBe(true);
    expect(tn.verifyWebhook({ "x-linkedstore-hmac-sha256": "mala" }, raw)).toBe(false);
  });

  it("normaliza el pedido con peso en kg → gramos", () => {
    const o = tn.normalizeOrderWebhook({}, order);
    expect(o?.address.dane).toBe("76001");
    expect(o?.payment).toBe("cod");
    expect(o?.lines[0]?.weightGrams).toBe(900);
  });

  it("manda User-Agent y el token en ambos headers", async () => {
    let seen: Headers | undefined;
    const fakeFetch = (async (_u: string, init: RequestInit) => {
      seen = new Headers(init.headers);
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const c = new TiendanubeCommerce({
      storeId: "s2",
      tnStoreId: "123",
      accessToken: "tok",
      appSecret: "x",
      fetch: fakeFetch,
    });
    await c.listOrders();
    expect(seen?.get("user-agent")).toContain("Traxo");
    expect(seen?.get("authentication")).toBe("bearer tok");
    expect(seen?.get("authorization")).toBe("Bearer tok");
  });
});

describe("WooCommerce", () => {
  const woo = new WooCommerce({
    storeId: "s3",
    url: "https://tienda.co",
    consumerKey: "ck",
    consumerSecret: "cs",
    webhookSecret: "wh",
  });
  const order = {
    id: 77,
    number: "77",
    payment_method: "cod",
    total: "45000",
    date_created_gmt: "2026-10-16T19:00:00",
    shipping: {
      first_name: "Laura",
      last_name: "Vargas",
      address_1: "Av 6N # 25-10",
      city: "Medellín",
      state: "Antioquia",
      phone: "+57 320 555 1212",
    },
    line_items: [{ product_id: 3, name: "Café Sierra Nevada", quantity: 1, price: 45000 }],
  };
  it("verifica la firma base64 y el tema", () => {
    const raw = JSON.stringify(order);
    expect(woo.verifyWebhook({ "x-wc-webhook-signature": hmac("wh", raw, "base64") }, raw)).toBe(
      true,
    );
    expect(
      woo.normalizeOrderWebhook({ "x-wc-webhook-topic": "order.updated" }, order),
    ).toBeUndefined();
    const o = woo.normalizeOrderWebhook({ "x-wc-webhook-topic": "order.created" }, order);
    expect(o?.address.dane).toBe("05001");
    expect(o?.payment).toBe("cod");
    expect(o?.address.phone).toBe("+573205551212");
  });
});
