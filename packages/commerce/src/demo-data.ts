// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { type Customer, newId, type Order, type Product } from "@traxo/core";
import { cityByDane, findCity } from "@traxo/geo-co";

export const DEMO_STORE = {
  id: "store_demo",
  name: "Café de Origen",
  url: "cafe-de-origen.myshopify.com",
  vertical: "Café de especialidad",
  originDane: "11001",
};

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "prod_huila",
    externalId: "9001",
    title: "Café Huila 340 g (grano)",
    price: 38000,
    cost: 19000,
    weightGrams: 380,
    description: "Notas a panela y cítricos.",
  },
  {
    id: "prod_nariño",
    externalId: "9002",
    title: "Café Nariño 340 g (molido)",
    price: 42000,
    cost: 21000,
    weightGrams: 380,
    description: "Floral, acidez brillante.",
  },
  {
    id: "prod_sierra",
    externalId: "9003",
    title: "Café Sierra Nevada 340 g",
    price: 45000,
    cost: 22500,
    weightGrams: 380,
    description: "Chocolate y frutos secos.",
  },
  {
    id: "prod_kit",
    externalId: "9004",
    title: "Kit degustación x3",
    price: 98000,
    cost: 52000,
    weightGrams: 1200,
    description: "Tres orígenes, 150 g c/u.",
  },
  {
    id: "prod_prensa",
    externalId: "9005",
    title: "Prensa francesa 600 ml",
    price: 89000,
    cost: 41000,
    weightGrams: 900,
  },
  {
    id: "prod_suscripcion",
    externalId: "9006",
    title: "Suscripción mensual 2 bolsas",
    price: 79000,
    cost: 40000,
    weightGrams: 800,
  },
];

const FIRST = [
  "Camila",
  "Andrés",
  "Valentina",
  "Juan",
  "Laura",
  "Santiago",
  "Daniela",
  "Felipe",
  "Mariana",
  "Sebastián",
  "Natalia",
  "Carlos",
];
const LAST = [
  "Ramírez",
  "Gómez",
  "Rodríguez",
  "Martínez",
  "López",
  "Hernández",
  "Vargas",
  "Castro",
  "Ospina",
  "Mejía",
  "Torres",
  "Zapata",
];
const STREETS = [
  "Calle 45 # 12-30",
  "Carrera 7 # 80-21 apto 402",
  "Avenida 6N # 25-10",
  "Carrera 43A # 1 Sur-50",
  "Calle 72 # 10-34",
  "Transversal 5 # 20-15 casa 3",
  "Carrera 15 # 100-25",
  "Calle 10 # 4-45",
];
const DESTINATIONS = [
  "66001",
  "76001",
  "08001",
  "05001",
  "13001",
  "68001",
  "47001",
  "54001",
  "11001",
  "17001",
  "73001",
  "63001",
];

/** PRNG determinista para que la demo sea reproducible. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T;

export function demoCustomers(): Customer[] {
  const r = rng(7);
  return Array.from({ length: 12 }, (_, i) => {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    const dane = pick(r, DESTINATIONS);
    return {
      id: `cust_demo_${i + 1}`,
      externalId: String(7000 + i),
      name,
      phone: `+573${String(100000000 + Math.floor(r() * 99999999)).slice(0, 9)}`,
      email: `${name.split(" ")[0]?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}${i}@correo.co`,
      city: cityByDane(dane)?.name,
      whatsappConsent: r() > 0.25,
    };
  });
}

export type DemoOrderOptions = {
  seed?: number;
  dane?: string;
  payment?: "cod" | "prepaid";
  number?: number;
  createdAt?: string;
};

/** Genera un pedido de la tienda demo. Con la misma `seed` sale el mismo pedido. */
export function buildDemoOrder(opts: DemoOrderOptions = {}): Order {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const r = rng(seed);
  const dane = opts.dane ?? pick(r, DESTINATIONS);
  const city = cityByDane(dane) ?? findCity("Bogotá");
  if (!city) throw new Error("ciudad demo no encontrada");
  const nLines = 1 + Math.floor(r() * 2);
  const lines = Array.from({ length: nLines }, () => {
    const p = pick(r, DEMO_PRODUCTS);
    return {
      productId: p.id,
      title: p.title,
      quantity: 1 + Math.floor(r() * 2),
      unitPrice: p.price,
      weightGrams: p.weightGrams,
    };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
  const number = opts.number ?? 1000 + Math.floor(r() * 9000);
  return {
    id: newId("ord"),
    externalId: `ext_${seed}`,
    number: `#${number}`,
    storeId: DEMO_STORE.id,
    email: `${name.split(" ")[0]?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}@correo.co`,
    address: {
      name,
      phone: `+573${String(100000000 + Math.floor(r() * 899999999)).slice(0, 9)}`,
      street: pick(r, STREETS),
      city: city.name,
      dane: city.dane,
      department: city.department,
    },
    lines,
    subtotal,
    shippingCharged: 0,
    total: subtotal,
    payment: opts.payment ?? (r() < 0.7 ? "cod" : "prepaid"),
    utm: {
      utm_source: pick(r, ["instagram", "facebook", "tiktok", "directo"]),
      utm_campaign: "lanzamiento-origen",
    },
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
}

export function demoHistory(): Order[] {
  return Array.from({ length: 10 }, (_, i) =>
    buildDemoOrder({
      seed: 100 + i,
      number: 1001 + i,
      createdAt: new Date(Date.UTC(2026, 9, 1 + i, 15, 0)).toISOString(),
    }),
  );
}
