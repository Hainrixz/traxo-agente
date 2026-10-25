// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { describe, expect, it } from "vitest";
import { buildDemoOrder, MockCommerce } from "../src/index.ts";

describe("MockCommerce", () => {
  it("el pedido demo es reproducible con la misma semilla", () => {
    const a = buildDemoOrder({ seed: 42, createdAt: "2026-10-16T00:00:00Z" });
    const b = buildDemoOrder({ seed: 42, createdAt: "2026-10-16T00:00:00Z" });
    expect({ ...a, id: "x" }).toEqual({ ...b, id: "x" });
    expect(a.total).toBe(a.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  });
  it("escribe el fulfillment en la tienda", async () => {
    const shop = new MockCommerce();
    const o = shop.receive(buildDemoOrder({ seed: 1 }));
    await shop.addFulfillment(o.id, {
      carrier: "Coordinadora",
      trackingNumber: "123",
      url: "https://x",
    });
    expect(shop.fulfillments).toHaveLength(1);
    await expect(
      shop.addFulfillment("nope", { carrier: "x", trackingNumber: "1", url: "u" }),
    ).rejects.toThrow();
  });
});
