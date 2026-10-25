// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { ShipmentDraft } from "@traxo/core";
import { describe, expect, it } from "vitest";
import { MockCarrierProvider, mockProviders, selectQuote, zoneFor } from "../src/index.ts";

const draft = (dane: string, cod = 0, grams = 800): ShipmentDraft => ({
  orderId: "ord_1",
  origin: { dane: "11001" },
  destination: {
    name: "A",
    phone: "+573001234567",
    street: "Calle 1 # 2-3",
    city: "X",
    dane,
    department: "Y",
  },
  weightGrams: grams,
  declaredValue: 90000,
  codAmount: cod,
  contents: "Café",
});
const settings = {
  weights: { cost: 0.55, speed: 0.3, reliability: 0.15 },
  preferredProvider: "envia-com",
};

async function allQuotes(d: ShipmentDraft) {
  return (await Promise.all(mockProviders().map((p) => p.quote(d)))).flat();
}

describe("zonas", () => {
  it("clasifica la ruta", () => {
    expect(zoneFor("11001", "11001")).toBe("urbano");
    expect(zoneFor("05001", "05266")).toBe("regional");
    expect(zoneFor("11001", "66001")).toBe("nacional");
    expect(zoneFor("11001", "08001")).toBe("lejano");
  });
});

describe("cotizador simulado", () => {
  it("cotiza por todas las vías y la ruta lejana cuesta más y tarda más", async () => {
    const near = await allQuotes(draft("11001"));
    const far = await allQuotes(draft("08001"));
    expect(near).toHaveLength(14);
    expect(Math.min(...far.map((q) => q.freight))).toBeGreaterThan(
      Math.min(...near.map((q) => q.freight)),
    );
    expect(Math.min(...far.map((q) => q.businessDays))).toBeGreaterThan(
      Math.min(...near.map((q) => q.businessDays)),
    );
    expect(near.every((q) => q.simulated)).toBe(true);
  });
  it("no cotiza destinos sin código DANE", async () => {
    expect(await allQuotes(draft("00000"))).toHaveLength(0);
  });
  it("cobra comisión de recaudo solo cuando hay contraentrega", async () => {
    const withCod = await allQuotes(draft("66001", 120000));
    const without = await allQuotes(draft("66001", 0));
    expect(withCod.filter((q) => q.supportsCod).every((q) => q.codCommission >= 2800)).toBe(true);
    expect(without.every((q) => q.codCommission === 0)).toBe(true);
  });
});

describe("selector", () => {
  it("en contraentrega descarta transportadoras que no cobran", async () => {
    const quotes = await allQuotes(draft("66001", 120000));
    const sel = selectQuote(quotes, { codAmount: 120000, settings });
    expect(sel).toBeDefined();
    expect(sel?.ranking.every((q) => q.supportsCod)).toBe(true);
    expect(sel?.ranking.some((q) => q.carrier === "TCC")).toBe(false);
  });
  it("si una transportadora llega por dos vías, queda la más barata", async () => {
    const quotes = await allQuotes(draft("76001", 90000));
    const sel = selectQuote(quotes, { codAmount: 90000, settings });
    const carriers = sel?.ranking.map((q) => q.carrier) ?? [];
    expect(new Set(carriers).size).toBe(carriers.length);
    const coordinadoras = quotes.filter((q) => q.carrier === "Coordinadora");
    const cheapest = Math.min(...coordinadoras.map((q) => q.freight + q.codCommission));
    expect(sel?.ranking.find((q) => q.carrier === "Coordinadora")?.total).toBe(cheapest);
  });
  it("pesos de costo puro eligen la más barata; pesos de velocidad, la más rápida", async () => {
    const quotes = await allQuotes(draft("66001", 90000));
    const cheap = selectQuote(quotes, {
      codAmount: 90000,
      settings: { ...settings, weights: { cost: 1, speed: 0, reliability: 0 } },
    });
    const fast = selectQuote(quotes, {
      codAmount: 90000,
      settings: { ...settings, weights: { cost: 0, speed: 1, reliability: 0 } },
    });
    const minTotal = Math.min(...(cheap?.ranking.map((q) => q.total) ?? []));
    expect(cheap?.winner.total).toBe(minTotal);
    const minDays = Math.min(...(fast?.ranking.map((q) => q.businessDays) ?? []));
    expect(fast?.winner.businessDays).toBe(minDays);
  });
  it("la confiabilidad histórica puede desempatar", async () => {
    const quotes = await allQuotes(draft("66001", 90000));
    const base = selectQuote(quotes, { codAmount: 90000, settings });
    const loser = base?.ranking[1]?.carrier ?? "";
    const boosted = selectQuote(quotes, {
      codAmount: 90000,
      settings: { ...settings, weights: { cost: 0.1, speed: 0.1, reliability: 0.8 } },
      reliability: {
        [loser]: 1,
        ...Object.fromEntries(
          (base?.ranking ?? []).filter((q) => q.carrier !== loser).map((q) => [q.carrier, 0.2]),
        ),
      },
    });
    expect(boosted?.winner.carrier).toBe(loser);
  });
  it("explica la decisión en español con montos COP", async () => {
    const quotes = await allQuotes(draft("66001", 90000));
    const sel = selectQuote(quotes, { codAmount: 90000, settings });
    expect(sel?.explanation).toMatch(
      /^Elegí .* (por .*|directo): \$ [\d.]+ en \d+ d[ií]as? h[aá]biles?\./,
    );
    expect(sel?.explanation).toContain("comisión de recaudo");
  });
  it("devuelve undefined si nadie cubre", () => {
    expect(selectQuote([], { codAmount: 0, settings })).toBeUndefined();
  });
});

describe("ciclo de la guía simulada", () => {
  it("crea, avanza, reporta novedad y cancela", async () => {
    const p = new MockCarrierProvider({ id: "t", label: "T", carriers: ["coordinadora"] });
    const [q] = await p.quote(draft("66001", 90000));
    if (!q) throw new Error("sin cotización");
    const g = await p.createShipment(draft("66001", 90000), q);
    expect(g.trackingNumber).toMatch(/^\d{12}$/);
    expect(g.simulated).toBe(true);
    expect((await p.track(g.trackingNumber)).at(-1)?.status).toBe("created");
    p.advance(g.trackingNumber);
    p.advance(g.trackingNumber);
    expect((await p.track(g.trackingNumber)).at(-1)?.status).toBe("in_transit");
    p.advance(g.trackingNumber, { incident: true });
    expect((await p.track(g.trackingNumber)).at(-1)?.status).toBe("incident");
    await p.cancel(g.trackingNumber);
  });
});
