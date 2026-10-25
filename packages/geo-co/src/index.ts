// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { CITIES, type City } from "./cities.ts";

export { CITIES, type City };

const strip = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const BY_NAME = new Map(CITIES.map((c) => [strip(c.name), c]));
const BY_DANE = new Map(CITIES.map((c) => [c.dane, c]));

export function findCity(input: string): City | undefined {
  const key = strip(input);
  const exact = BY_NAME.get(key);
  if (exact) return exact;
  // "Pereira, Risaralda", "Cali - Valle"
  for (const [name, city] of BY_NAME) {
    if (key.startsWith(`${name} `) || key.endsWith(` ${name}`)) return city;
  }
  return undefined;
}

export const cityByDane = (dane: string): City | undefined => BY_DANE.get(dane);

/** Coordinadora usa DANE de 8 dígitos: municipio + "000". */
export const dane8 = (dane5: string): string => `${dane5}000`;

/** Teléfono colombiano → E.164 (+57XXXXXXXXXX). Devuelve undefined si no parece válido. */
export function normalizePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  let national = digits;
  if (digits.startsWith("57") && digits.length === 12) national = digits.slice(2);
  else if (digits.startsWith("0057") && digits.length === 14) national = digits.slice(4);
  if (!/^3\d{9}$/.test(national) && !/^60\d{8}$/.test(national)) return undefined;
  return `+57${national}`;
}

export function formatPhone(e164: string): string {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bcra\.?\b|\bkr\.?\b|\bcarrera\b/gi, "Carrera"],
  [/\bcl\.?\b|\bcalle\b/gi, "Calle"],
  [/\bav\.?\b|\bavenida\b/gi, "Avenida"],
  [/\bdg\.?\b|\bdiagonal\b/gi, "Diagonal"],
  [/\btv\.?\b|\btransversal\b/gi, "Transversal"],
];

export function normalizeStreet(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  for (const [re, to] of ABBREVIATIONS) s = s.replace(re, to);
  return s
    .replace(/\s*#\s*/g, " # ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una dirección colombiana útil trae vía + número (Calle 10 # 5-20). Marca las que faltan datos. */
export function addressLooksComplete(street: string): boolean {
  return (
    /\d/.test(street) &&
    /(calle|carrera|avenida|diagonal|transversal|cl|cra|kr|av|mz|manzana|vereda|finca)/i.test(
      street,
    )
  );
}
