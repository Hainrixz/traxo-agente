import { describe, expect, it } from "vitest";
import { CampaignDraftInputSchema, renderCampaignMarkdown, validateCopy } from "../src/index.ts";

const base = {
  platform: "meta" as const,
  productTitle: "Kit degustación x3",
  dailyBudget: 30000,
  audience: { cities: ["Bogotá"] },
  copy: {
    headlines: ["Tres orígenes, un solo kit"],
    primaryTexts: ["Prueba café de Huila, Nariño y Sierra Nevada."],
    descriptions: [],
  },
  creatives: [
    {
      kind: "image" as const,
      prompt: "Kit degustación de café sobre mesa de madera, luz de mañana",
    },
  ],
};

describe("campañas", () => {
  it("aplica valores por defecto y no admite estados activos", () => {
    const d = CampaignDraftInputSchema.parse(base);
    expect(d.objective).toBe("ventas");
    expect(d.audience.ageMin).toBe(22);
    expect("status" in d).toBe(false);
  });
  it("valida los límites de caracteres de cada plataforma", () => {
    const g = { ...base.copy, headlines: ["Uno", "Dos"] };
    expect(validateCopy("google", g).join(" ")).toContain("al menos 3 títulos");
    const largo = { ...base.copy, headlines: ["x".repeat(41)] };
    expect(validateCopy("meta", largo)[0]).toContain("41 caracteres");
    expect(validateCopy("meta", base.copy)).toEqual([]);
  });
  it("exporta Markdown que dice que no está activa", () => {
    const md = renderCampaignMarkdown({
      ...CampaignDraftInputSchema.parse(base),
      id: "cmp_1",
      status: "DRAFT",
      createdAt: "2026-10-16T10:00:00Z",
    });
    expect(md).toContain("borrador, no creada en la plataforma");
    expect(md).toContain("$ 30.000");
    expect(md).toContain("Prompt:");
  });
});
