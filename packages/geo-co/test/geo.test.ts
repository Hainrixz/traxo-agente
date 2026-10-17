import { describe, expect, it } from "vitest";
import {
  addressLooksComplete,
  dane8,
  findCity,
  normalizePhone,
  normalizeStreet,
} from "../src/index.ts";

describe("geo-co", () => {
  it("encuentra ciudades sin importar tildes ni departamento", () => {
    expect(findCity("pereira")?.dane).toBe("66001");
    expect(findCity("Bogota")?.dane).toBe("11001");
    expect(findCity("Cali - Valle")?.dane).toBe("76001");
    expect(findCity("Ciudad Inventada")).toBeUndefined();
  });
  it("convierte DANE de 5 a 8 dígitos", () => {
    expect(dane8("05001")).toBe("05001000");
  });
  it("normaliza teléfonos colombianos a E.164", () => {
    expect(normalizePhone("300 123 4567")).toBe("+573001234567");
    expect(normalizePhone("+57 300-123-4567")).toBe("+573001234567");
    expect(normalizePhone("12345")).toBeUndefined();
  });
  it("normaliza abreviaturas de vía", () => {
    expect(normalizeStreet("cra 7 #80-21")).toBe("Carrera 7 # 80-21");
  });
  it("detecta direcciones incompletas", () => {
    expect(addressLooksComplete("Calle 10 # 4-45")).toBe(true);
    expect(addressLooksComplete("por el parque")).toBe(false);
  });
});
