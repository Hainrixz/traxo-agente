import { describe, expect, it } from "vitest";
import { canAutoCreateShipment, formatCOP, quoteTotal } from "../src/index.ts";

describe("formatCOP", () => {
  it("usa punto de miles y sin decimales", () => {
    expect(formatCOP(125000)).toBe("$ 125.000");
    expect(formatCOP(4820000)).toBe("$ 4.820.000");
    expect(formatCOP(0)).toBe("$ 0");
  });
});

describe("canAutoCreateShipment", () => {
  const q = { freight: 12000, codCommission: 3000 };
  it("autonomía 0 siempre pide aprobación", () => {
    expect(canAutoCreateShipment({ autonomy: 0, maxAutoShipmentCost: 60000 }, q).allowed).toBe(
      false,
    );
  });
  it("autonomía 1 dentro del tope es automática", () => {
    expect(quoteTotal(q)).toBe(15000);
    expect(canAutoCreateShipment({ autonomy: 1, maxAutoShipmentCost: 60000 }, q).allowed).toBe(
      true,
    );
  });
  it("autonomía 1 sobre el tope pide aprobación y dice por qué", () => {
    const d = canAutoCreateShipment({ autonomy: 1, maxAutoShipmentCost: 10000 }, q);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("$ 15.000");
  });
});
