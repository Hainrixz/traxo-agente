// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { describe, expect, it } from "vitest";
import { fit, riskScore, type SuggestInput, suggestCampaign, validateCopy } from "../src/index.ts";

const base: SuggestInput = {
  platform: "meta",
  objective: "ventas",
  productTitle: "Kit degustación x3",
  price: 98000,
  marginPct: 47,
  unitsSold: 31,
  topCities: ["Bogotá", "Medellín", "Pereira"],
  storeName: "Café de Origen",
  dailyBudget: 30000,
};

describe("sugerencia de campaña", () => {
  it("cumple los límites de caracteres de cada plataforma", () => {
    for (const platform of ["meta", "google", "tiktok"] as const) {
      const s = suggestCampaign({
        ...base,
        platform,
        productTitle: "Suscripción mensual muy larga con nombre exagerado 2 bolsas (grano)",
      });
      expect(validateCopy(platform, s.copy), platform).toEqual([]);
    }
  });
  it("no inventa margen: sin costo dice N/A", () => {
    expect(suggestCampaign({ ...base, marginPct: null }).rationale.join(" ")).toContain(
      "Margen N/A",
    );
    expect(suggestCampaign(base).rationale.join(" ")).toContain("47 %");
  });
  it("genera un utm_campaign estable y un costo de créditos marcado como estimado", () => {
    const s = suggestCampaign(base, new Date(2026, 9, 16));
    expect(s.utmCampaign).toBe("kit-degustacion-x3-meta-2610");
    expect(s.credits).toMatchObject({ estimated: true, total: 2 * 6 + 40 });
    expect(s.creatives.map((c) => c.kind)).toEqual(["image", "image", "video"]);
  });
  it("recorta sin dejar frases a medias", () => {
    expect(fit("uno dos tres cuatro cinco", 14)).toBe("uno dos tres…");
    expect(fit("corto", 14)).toBe("corto");
  });
});

describe("riesgo de contraentrega", () => {
  const order = {
    payment: "cod" as const,
    total: 80000,
    address: {
      name: "A",
      phone: "+573001234567",
      street: "Calle 10 # 4-45",
      city: "Cali",
      dane: "76001",
      department: "Valle",
    },
    lines: [{ productId: "p", title: "x", quantity: 1, unitPrice: 80000, weightGrams: 500 }],
  };
  it("prepagado no tiene riesgo", () => {
    expect(riskScore({ ...order, payment: "prepaid" }).score).toBe(0);
  });
  it("cliente nuevo con dirección vaga y valor alto sube a alto, con razones", () => {
    const r = riskScore(
      { ...order, total: 300000, address: { ...order.address, street: "por el parque" } },
      { farCity: true },
    );
    expect(r.level).toBe("alto");
    expect(r.reasons.join(" ")).toMatch(/nuevo|Valor alto|dirección/);
  });
  it("un cliente recurrente que siempre recibió baja el riesgo", () => {
    const nuevo = riskScore(order).score;
    const fiel = riskScore(order, { history: { delivered: 3, returned: 0, cancelled: 0 } }).score;
    expect(fiel).toBeLessThan(nuevo);
    expect(
      riskScore(order, { history: { delivered: 1, returned: 2, cancelled: 0 } }).score,
    ).toBeGreaterThan(nuevo);
  });
});
