// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { cityByDane } from "@traxo/geo-co";

export type Zone = "urbano" | "regional" | "nacional" | "lejano";

const COSTA = new Set([
  "Atlántico",
  "Bolívar",
  "Magdalena",
  "La Guajira",
  "Cesar",
  "Córdoba",
  "Sucre",
]);
const LEJANO = new Set(["Caquetá", "Chocó", "Casanare", "Nariño"]);

/** Zona de la ruta: define precio base y días. Aproximación para el simulador, no una tarifa real. */
export function zoneFor(originDane: string, destDane: string): Zone {
  if (originDane === destDane) return "urbano";
  const o = cityByDane(originDane);
  const d = cityByDane(destDane);
  if (!d) return "nacional";
  if (o && o.department === d.department) return "regional";
  if (LEJANO.has(d.department) || COSTA.has(d.department)) return "lejano";
  return "nacional";
}

export const BASE_FREIGHT: Record<Zone, number> = {
  urbano: 7500,
  regional: 9800,
  nacional: 12800,
  lejano: 16500,
};
export const BASE_DAYS: Record<Zone, number> = { urbano: 1, regional: 2, nacional: 3, lejano: 5 };

/** Flete por peso: cada kg adicional (sobre el primero) suma un porcentaje del base. */
export function weightFactor(grams: number): number {
  const kg = Math.max(1, Math.ceil(grams / 1000));
  return 1 + (kg - 1) * 0.28;
}
