import { sampleAudit } from "@traxo/audit";
import { BASE_DAYS, BASE_FREIGHT, CARRIER_PROFILES, weightFactor, zoneFor } from "@traxo/carriers";
import { DEMO_PRODUCTS, DEMO_STORE, rng } from "@traxo/commerce";
import {
  type AgentEventKind,
  formatCOP,
  newId,
  type Order,
  StoreSettingsSchema,
  suggestCampaign,
} from "@traxo/core";
import { CITIES, cityByDane } from "@traxo/geo-co";
import type { Db } from "./client.ts";
import { orderStoreIndex } from "./repo.ts";
import { seedDemo } from "./seed.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;

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
  "Isabella",
  "Mateo",
  "Sofía",
  "Nicolás",
  "Paula",
  "David",
  "Carolina",
  "Julián",
  "Manuela",
  "Esteban",
  "Luisa",
  "Camilo",
  "Alejandra",
  "Tomás",
  "Juliana",
  "Diego",
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
  "Pérez",
  "Londoño",
  "Giraldo",
  "Restrepo",
  "Cardona",
  "Duque",
  "Arias",
  "Salazar",
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
  "Diagonal 23 # 15-08",
  "Carrera 30 # 45-12 torre 2",
];
// Más peso en las ciudades grandes, como en una tienda real.
const DESTS: Array<[string, number]> = [
  ["11001", 24],
  ["05001", 16],
  ["76001", 12],
  ["08001", 8],
  ["66001", 7],
  ["68001", 6],
  ["13001", 5],
  ["17001", 4],
  ["73001", 3],
  ["63001", 3],
  ["47001", 3],
  ["54001", 3],
  ["50001", 2],
  ["52001", 2],
  ["05266", 2],
];
const SOURCES: Array<[string, number]> = [
  ["instagram", 34],
  ["facebook", 22],
  ["tiktok", 14],
  ["google", 12],
  ["directo", 12],
  ["whatsapp", 6],
];
// Quién transporta y por qué vía: 2 agregadores + directas.
const ROUTES: Array<{ carrier: keyof typeof CARRIER_PROFILES; provider: string; w: number }> = [
  { carrier: "coordinadora", provider: "envia-com", w: 20 },
  { carrier: "coordinadora", provider: "coordinadora", w: 8 },
  { carrier: "servientrega", provider: "envia-com", w: 10 },
  { carrier: "servientrega", provider: "servientrega", w: 5 },
  { carrier: "interrapidisimo", provider: "envia-com", w: 14 },
  { carrier: "interrapidisimo", provider: "interrapidisimo", w: 8 },
  { carrier: "envia", provider: "99envios", w: 12 },
  { carrier: "envia", provider: "envia-co", w: 5 },
  { carrier: "tcc", provider: "99envios", w: 3 },
  { carrier: "deprisa", provider: "envia-com", w: 2 },
];

const pickW = <T>(r: () => number, xs: Array<[T, number]>): T => {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) if ((x -= w) <= 0) return v;
  return (xs.at(-1) as [T, number])[0];
};
const pick = <T>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)] as T;
const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

type CampaignSeed = {
  key: string;
  platform: "meta" | "google" | "tiktok";
  productId: string;
  status: "ACTIVE" | "PAUSED" | "DRAFT";
  spend: number;
  impressions: number;
  clicks: number;
  budget: number;
  utm: string;
  daysAgo: number;
  sources: string[];
};

export type RichSeedResult = {
  orders: number;
  customers: number;
  shipments: number;
  campaigns: number;
  events: number;
};

/** Sube cuando cambian los datos de ejemplo: las bases que ya existen (p. ej. en Railway) se vuelven a sembrar solas. */
export const RICH_VERSION = 5;

/**
 * Cuenta admin de la demo: 90 días de operación de "Café de Origen". TODO es de ejemplo y la interfaz lo dice.
 * Determinista (misma semilla → mismos datos) y relativo a `now`, para que los gráficos siempre terminen hoy.
 */
export async function seedRich(
  db: Db,
  opts: { now?: Date; storeId?: string } = {},
): Promise<RichSeedResult> {
  const now = opts.now ?? new Date();
  const storeId = opts.storeId ?? DEMO_STORE.id;
  const base = await seedDemo(db);
  void base;
  // seedDemo trae 10 pedidos fijos de octubre; en la versión rica los reemplazamos por la historia completa.
  // Hijos primero: en una base que ya tenía datos, las llaves foráneas impiden borrar el pedido o el cliente.
  const p = db.prisma;
  await p.trackingEventRow.deleteMany({ where: { shipment: { order: { storeId } } } });
  await p.shipment.deleteMany({ where: { order: { storeId } } });
  await p.carrierQuote.deleteMany({ where: { order: { storeId } } });
  await p.message.deleteMany({ where: { conversation: { storeId } } });
  await p.conversation.deleteMany({ where: { storeId } });
  await p.agentRun.deleteMany({ where: { storeId } });
  await p.approval.deleteMany({ where: { storeId } });
  await p.campaignDraft.deleteMany({ where: { storeId } });
  await p.audience.deleteMany({ where: { storeId } });
  await p.mediaAsset.deleteMany({ where: { storeId } });
  await p.usageEvent.deleteMany({ where: { storeId } });
  await p.storeAudit.deleteMany({ where: { storeId } });
  await p.order.deleteMany({ where: { storeId } });
  await p.customer.deleteMany({ where: { storeId } });
  await db.prisma.store.update({
    where: { id: storeId },
    data: {
      settings: StoreSettingsSchema.parse({
        autonomy: 1,
        maxAutoShipmentCost: 60000,
        preferredProvider: "envia-com",
        confirmCod: "risky",
        riskThreshold: 40,
        prepaidDiscountPct: 5,
      }),
      profile: {
        rich: true,
        richVersion: RICH_VERSION,
        sample: true,
        vertical: DEMO_STORE.vertical,
        shipsWith: "Envia.com",
        codShare: 0.66,
      },
    },
  });

  const r = rng(2026);
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);

  // ---------- Clientes ----------
  const customers = Array.from({ length: 150 }, (_, i) => {
    const name = `${pick(r, FIRST)} ${pick(r, LAST)}`;
    const dane = pickW(r, DESTS);
    return {
      id: `cust_rich_${i + 1}`,
      name,
      dane,
      city: cityByDane(dane)?.name ?? "Bogotá",
      phone: `+573${String(10 + Math.floor(r() * 40)).padStart(2, "0")}${String(1_000_000 + Math.floor(r() * 8_999_999))}`,
      consent: r() < 0.72,
      optOut: i % 31 === 7,
    };
  });
  for (const c of customers) {
    c.consent = c.optOut ? false : c.consent;
  }

  // ---------- Campañas de ejemplo (antes que los pedidos, para poder atribuirlos) ----------
  const prod = (id: string) =>
    DEMO_PRODUCTS.find((p) => p.id === id) ?? (DEMO_PRODUCTS[0] as (typeof DEMO_PRODUCTS)[number]);
  const camps: CampaignSeed[] = [
    {
      key: "kit-meta",
      platform: "meta",
      productId: "prod_kit",
      status: "ACTIVE",
      spend: 842_000,
      impressions: 186_400,
      clicks: 4_310,
      budget: 40_000,
      utm: "kit-degustacion-meta-2609",
      daysAgo: 52,
      sources: ["instagram", "facebook"],
    },
    {
      key: "huila-meta",
      platform: "meta",
      productId: "prod_huila",
      status: "ACTIVE",
      spend: 516_000,
      impressions: 121_900,
      clicks: 2_660,
      budget: 30_000,
      utm: "cafe-huila-meta-2609",
      daysAgo: 38,
      sources: ["instagram", "facebook"],
    },
    {
      key: "susc-tiktok",
      platform: "tiktok",
      productId: "prod_suscripcion",
      status: "ACTIVE",
      spend: 388_000,
      impressions: 412_000,
      clicks: 5_240,
      budget: 25_000,
      utm: "suscripcion-tiktok-2610",
      daysAgo: 21,
      sources: ["tiktok"],
    },
    {
      key: "narino-google",
      platform: "google",
      productId: "prod_nariño",
      status: "PAUSED",
      spend: 294_000,
      impressions: 48_700,
      clicks: 1_980,
      budget: 20_000,
      utm: "cafe-narino-google-2609",
      daysAgo: 44,
      sources: ["google"],
    },
    {
      key: "prensa-meta",
      platform: "meta",
      productId: "prod_prensa",
      status: "PAUSED",
      spend: 171_000,
      impressions: 59_300,
      clicks: 880,
      budget: 25_000,
      utm: "prensa-francesa-meta-2610",
      daysAgo: 17,
      sources: ["instagram"],
    },
    {
      key: "sierra-google",
      platform: "google",
      productId: "prod_sierra",
      status: "DRAFT",
      spend: 0,
      impressions: 0,
      clicks: 0,
      budget: 25_000,
      utm: "cafe-sierra-nevada-google-2610",
      daysAgo: 4,
      sources: ["google"],
    },
    {
      key: "kit-tiktok",
      platform: "tiktok",
      productId: "prod_kit",
      status: "DRAFT",
      spend: 0,
      impressions: 0,
      clicks: 0,
      budget: 30_000,
      utm: "kit-degustacion-tiktok-2610",
      daysAgo: 2,
      sources: ["tiktok"],
    },
  ];
  const campBySource = (src: string, ageDays: number) =>
    camps.filter((c) => c.sources.includes(src) && c.status !== "DRAFT" && ageDays <= c.daysAgo);

  // ---------- Pedidos ----------
  const volumeAt = (daysAgo: number) =>
    (0.55 + 0.9 * (1 - daysAgo / 90)) *
    (new Date(now.getTime() - daysAgo * DAY).getDay() % 6 === 0 ? 1.35 : 1);
  type O = {
    id: string;
    ext: string;
    number: string;
    customerIdx: number;
    createdAt: Date;
    payment: "cod" | "prepaid";
    lines: Order["lines"];
    total: number;
    address: Order["address"];
    utm: Record<string, string>;
    age: number;
  };
  const orders: O[] = [];
  let seq = 1001;
  for (let d = 89; d >= 0; d--) {
    const n = Math.max(0, Math.round(volumeAt(d) * 1.9 + (r() - 0.45) * 1.6));
    for (let k = 0; k < n; k++) {
      const ci = Math.floor(r() * customers.length);
      const cu = customers[ci] as (typeof customers)[number];
      const nLines = 1 + (r() < 0.35 ? 1 : 0) + (r() < 0.1 ? 1 : 0);
      const lines = Array.from({ length: nLines }, () => {
        const p = pick(r, DEMO_PRODUCTS);
        return {
          productId: p.id,
          title: p.title,
          quantity: 1 + (r() < 0.25 ? 1 : 0),
          unitPrice: p.price,
          weightGrams: p.weightGrams,
        };
      });
      const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      const src = pickW(r, SOURCES);
      const cs = campBySource(src, d);
      const utm: Record<string, string> = { utm_source: src };
      if (cs.length && r() < 0.78) {
        const c = pick(r, cs);
        utm.utm_campaign = c.utm;
        utm.utm_medium = c.platform === "google" ? "cpc" : "paid_social";
      } else if (src !== "directo") utm.utm_medium = src === "whatsapp" ? "chat" : "organic";
      const created = new Date(now.getTime() - d * DAY - Math.floor(r() * 10 * HOUR) - 2 * HOUR);
      const id = `ord_rich_${seq}`;
      orders.push({
        id,
        ext: `ext_rich_${seq}`,
        number: `#${seq}`,
        customerIdx: ci,
        createdAt: created,
        payment: r() < 0.66 ? "cod" : "prepaid",
        lines,
        total,
        age: d,
        address: {
          name: cu.name,
          phone: cu.phone,
          street: pick(r, STREETS),
          city: cu.city,
          dane: cu.dane,
          department: cityByDane(cu.dane)?.department ?? "",
        },
        utm,
      });
      seq++;
    }
  }

  // ---------- Estados y envíos ----------
  const store = {
    orders: [] as object[],
    quotes: [] as object[],
    ships: [] as object[],
    tracks: [] as object[],
    runs: [] as object[],
    convs: new Map<string, string>(),
    messages: [] as object[],
    approvals: [] as object[],
  };
  const days = (n: number) => n * DAY;
  const ev = (kind: AgentEventKind, summary: string, when: Date, orderId?: string) =>
    store.runs.push({
      id: `run_${store.runs.length}_${when.getTime().toString(36)}`,
      storeId,
      orderId: orderId ?? null,
      kind,
      summary,
      at: when,
    });
  const conv = (idx: number) => {
    const cu = customers[idx] as (typeof customers)[number];
    if (!store.convs.has(cu.id)) store.convs.set(cu.id, `conv_rich_${cu.id}`);
    return store.convs.get(cu.id) as string;
  };
  const msg = (idx: number, dir: "in" | "out", text: string, when: Date, template?: string) =>
    store.messages.push({
      id: `msg_rich_${store.messages.length}`,
      conversationId: conv(idx),
      direction: dir,
      text,
      template: template ?? null,
      simulated: true,
      // Nada de mensajes del futuro: lo que caería después de ahora (pedidos recientes) se acomoda justo antes, en orden.
      at: new Date(
        Math.min(when.getTime(), now.getTime() - 600_000) + store.messages.length * 1000,
      ),
    });
  const customersWithAnyMsg = new Set<number>();

  const lastN = orders.length;
  const finalIdx = {
    awaitingConfirm: lastN - 1,
    needAddress: lastN - 2,
    overCap: lastN - 3,
    incidentOpen: lastN - 4,
    outForDelivery: lastN - 5,
    newAddress: lastN - 6,
    created: lastN - 7,
    delivered2: lastN - 8,
  };
  const specials = new Map(Object.entries(finalIdx).map(([k, v]) => [v, k]));

  orders.forEach((o, i) => {
    const cu = customers[o.customerIdx] as (typeof customers)[number];
    const special = specials.get(i);
    const zone = zoneFor("11001", o.address.dane);
    const weight = o.lines.reduce((s, l) => s + l.weightGrams * l.quantity, 0);
    const route = pickW(
      r,
      ROUTES.map((x): [(typeof ROUTES)[number], number] => [x, x.w]),
    );
    const prof = CARRIER_PROFILES[route.carrier] as (typeof CARRIER_PROFILES)[string];
    const markup = route.provider === "envia-com" ? 0.04 : route.provider === "99envios" ? 0.03 : 0;
    const freight =
      Math.round((BASE_FREIGHT[zone] * weightFactor(weight) * prof.price * (1 + markup)) / 100) *
      100;
    const cod =
      o.payment === "cod"
        ? Math.max(prof.codMin, Math.round((o.total * prof.codRate) / 100) * 100)
        : 0;
    const days_ = BASE_DAYS[zone] + prof.extraDays;
    // Resultado según la edad del pedido.
    const roll = r();
    let outcome:
      | "delivered"
      | "delivered_after_incident"
      | "returned"
      | "cancelled"
      | "in_transit"
      | "out_for_delivery"
      | "incident"
      | "created"
      | "received";
    if (special)
      outcome = (
        {
          awaitingConfirm: "received",
          needAddress: "received",
          overCap: "received",
          incidentOpen: "incident",
          outForDelivery: "out_for_delivery",
          newAddress: "incident",
          created: "created",
          delivered2: "delivered",
        } as const
      )[special as keyof typeof finalIdx];
    else if (o.age > days_ + 4)
      outcome =
        roll < 0.74
          ? "delivered"
          : roll < 0.84
            ? "delivered_after_incident"
            : roll < 0.93
              ? "returned"
              : "cancelled";
    else if (o.age > days_)
      outcome = roll < 0.7 ? "delivered" : roll < 0.8 ? "incident" : "in_transit";
    else if (o.age >= 1)
      outcome =
        roll < 0.5
          ? "in_transit"
          : roll < 0.7
            ? "out_for_delivery"
            : roll < 0.85
              ? "created"
              : "incident";
    else outcome = roll < 0.5 ? "created" : "in_transit";

    const status =
      special === "awaitingConfirm"
        ? "awaiting_confirmation"
        : outcome === "cancelled"
          ? "cancelled"
          : outcome === "received"
            ? "received"
            : outcome === "delivered" || outcome === "delivered_after_incident"
              ? "delivered"
              : outcome === "returned"
                ? "delivered"
                : "shipped";
    let address = o.address;
    if (special === "needAddress") address = { ...address, street: "por el parque, casa azul" };
    const total = special === "overCap" ? 560_000 : o.total;
    store.orders.push({
      id: o.id,
      storeId,
      customerId: cu.id,
      externalId: o.ext,
      number: o.number,
      address,
      lines: o.lines,
      subtotal: total,
      shippingCharged: 0,
      total,
      payment: special === "awaitingConfirm" || special === "overCap" ? "cod" : o.payment,
      utm: o.utm,
      status,
      confirmAt: special === "awaitingConfirm" ? at(25 * HOUR) : null,
      createdAt: special
        ? at(special === "awaitingConfirm" ? 26 * HOUR : (Number(i % 5) + 2) * HOUR)
        : o.createdAt,
    });
    orderStoreIndex.set(o.id, storeId);
    const t0 = special
      ? at(special === "awaitingConfirm" ? 26 * HOUR : (Number(i % 5) + 2) * HOUR).getTime()
      : o.createdAt.getTime();

    // Narrativa del agente solo para lo reciente (el feed muestra lo último).
    const recent = o.age <= 6 || Boolean(special);
    if (recent)
      ev(
        "order.received",
        `Me llegó el pedido ${o.number} de ${address.name} (${address.city}).`,
        new Date(t0 + 30_000),
        o.id,
      );

    if (outcome === "received") {
      if (special === "needAddress") {
        ev(
          "approval.requested",
          `La dirección "por el parque, casa azul" parece incompleta en el pedido ${o.number}. Necesito que confirmes la dirección con ${address.name}.`,
          new Date(t0 + 45_000),
          o.id,
        );
        store.approvals.push({
          id: `apr_rich_addr`,
          storeId,
          orderId: o.id,
          kind: "address",
          title: `Dirección por confirmar en ${o.number}`,
          detail: `La dirección "por el parque, casa azul" parece incompleta. Necesito que se la confirmes al cliente antes de generar la guía.`,
          payload: { orderId: o.id },
          status: "pending",
          createdAt: new Date(t0 + 45_000),
        });
      } else if (special === "overCap") {
        const alt = ["interrapidisimo", "coordinadora", "servientrega", "envia"] as const;
        alt.forEach((k, j) =>
          store.quotes.push({
            id: `qt_rich_cap_${j}`,
            orderId: o.id,
            provider: j === 3 ? "99envios" : "envia-com",
            carrier: CARRIER_PROFILES[k]?.carrier ?? k,
            service: "Estándar",
            freight: 61_000 + j * 4_200,
            codCommission: 14_000,
            supportsCod: true,
            businessDays: 3 + (j % 2),
            simulated: true,
            chosen: j === 0,
            score: 0.7 - j * 0.08,
            createdAt: new Date(t0 + 60_000),
          }),
        );
        ev(
          "quotes.received",
          `Recibí 14 cotizaciones; 4 transportadoras distintas pueden llevarlo.`,
          new Date(t0 + 50_000),
          o.id,
        );
        ev(
          "carrier.selected",
          `Elegí Interrapidísimo directo: $ 75.000 en 3 días hábiles. Frente a Coordinadora: $ 4.200 menos. Incluye $ 14.000 de comisión de recaudo.`,
          new Date(t0 + 55_000),
          o.id,
        );
        ev(
          "approval.requested",
          `Dejé lista la guía de ${o.number} con Interrapidísimo ($ 75.000). La guía cuesta $ 75.000, más que tu tope automático de $ 60.000.`,
          new Date(t0 + 60_000),
          o.id,
        );
        store.approvals.push({
          id: "apr_rich_cap",
          storeId,
          orderId: o.id,
          kind: "shipment",
          title: `Aprobar guía de ${o.number} con Interrapidísimo`,
          detail:
            "Elegí Interrapidísimo directo: $ 75.000 en 3 días hábiles. La guía cuesta $ 75.000, más que tu tope automático de $ 60.000.",
          payload: { orderId: o.id, provider: "interrapidisimo", carrier: "Interrapidísimo" },
          status: "pending",
          createdAt: new Date(t0 + 60_000),
        });
      } else if (special === "awaitingConfirm") {
        ev(
          "confirmation.requested",
          `El pedido ${o.number} tiene riesgo alto (62/100): Cliente nuevo, sin historial. Antes de gastar en una guía, le pedí a ${address.name} que confirme por WhatsApp. (mensaje simulado)`,
          new Date(t0 + 40_000),
          o.id,
        );
        msg(
          o.customerIdx,
          "out",
          `Hola ${address.name.split(" ")[0]}, recibimos tu pedido en Café de Origen. Pagas ${formatCOP(total)} al recibir. ¿Confirmas tu dirección y que estarás para recibirlo? Si prefieres pagar ahora tienes 5 % de descuento: ${formatCOP(Math.round((total * 0.95) / 100) * 100)}.`,
          new Date(t0 + 41_000),
          "confirmar_contraentrega",
        );
        customersWithAnyMsg.add(o.customerIdx);
        store.approvals.push({
          id: "apr_rich_noresp",
          storeId,
          orderId: o.id,
          kind: "no_response",
          title: `${address.name} no confirmó ${o.number}`,
          detail:
            "Pasaron más de 24 h sin respuesta. Puedes enviarlo igual (aprobar) o cancelarlo (rechazar).",
          payload: { orderId: o.id },
          status: "pending",
          createdAt: at(HOUR),
        });
        ev(
          "approval.requested",
          `${address.name} no respondió la confirmación de ${o.number} en 24 h. Te dejo decidir: enviarlo igual o cancelarlo.`,
          at(HOUR),
          o.id,
        );
      }
      return;
    }

    // Cotizaciones (las 4 mejores vías) y guía.
    const rivals = (["coordinadora", "interrapidisimo", "servientrega", "envia"] as const)
      .filter((k) => k !== route.carrier)
      .slice(0, 3);
    const quoteRows = [route.carrier, ...rivals].map((k, j) => {
      const p = CARRIER_PROFILES[k] as (typeof CARRIER_PROFILES)[string];
      const f = j === 0 ? freight : Math.round((freight * (1.02 + j * 0.05)) / 100) * 100;
      return {
        id: `qt_rich_${i}_${j}`,
        orderId: o.id,
        provider: j === 0 ? route.provider : "envia-com",
        carrier: p.carrier,
        service: p.service,
        freight: f,
        codCommission: p.supportsCod ? cod : 0,
        supportsCod: p.supportsCod,
        businessDays: days_ + (j === 0 ? 0 : j % 2),
        simulated: true,
        chosen: j === 0,
        score: Math.round((0.78 - j * 0.07) * 1000) / 1000,
        createdAt: new Date(t0 + 60_000),
      };
    });
    store.quotes.push(...quoteRows);
    const tn = `${240_000_000_000 + 1_000_000 + i * 7_919}`;
    const shipId = `shp_rich_${i}`;
    if (outcome === "cancelled") {
      store.ships.push({
        id: shipId,
        orderId: o.id,
        provider: route.provider,
        carrier: prof.carrier,
        service: prof.service,
        trackingNumber: tn,
        labelUrl: `https://traxo.invalid/etiquetas/${tn}.pdf`,
        trackUrl: `https://traxo.invalid/rastreo/${tn}`,
        total: freight + cod,
        status: "cancelled",
        simulated: true,
        createdAt: new Date(t0 + 120_000),
        deliveredAt: null,
      });
      store.tracks.push(
        {
          id: `trk_${i}_0`,
          shipmentId: shipId,
          status: "created",
          description: "Guía generada",
          location: null,
          at: new Date(t0 + 120_000),
        },
        {
          id: `trk_${i}_1`,
          shipmentId: shipId,
          status: "cancelled",
          description: "Guía cancelada por la tienda",
          location: null,
          at: new Date(t0 + 6 * HOUR),
        },
      );
      return;
    }
    const tl: Array<[string, string, number]> = [["created", "Guía generada", 0.1]];
    const hrs = (h: number) => h * HOUR;
    const D = days_ * 24;
    const after = outcome === "created" ? 0 : 1;
    if (after) tl.push(["picked_up", "Recogido en origen", 6]);
    if (
      [
        "in_transit",
        "out_for_delivery",
        "delivered",
        "delivered_after_incident",
        "returned",
        "incident",
      ].includes(outcome)
    )
      tl.push(["in_transit", "En tránsito", 20]);
    if (outcome === "out_for_delivery" || outcome === "delivered")
      tl.push(["out_for_delivery", "En reparto", Math.max(30, D - 6)]);
    if (outcome === "delivered") tl.push(["delivered", "Entregado", D + 1]);
    if (
      outcome === "incident" ||
      outcome === "delivered_after_incident" ||
      outcome === "returned"
    ) {
      tl.push(["incident", "Novedad: el cliente no estaba en la dirección", Math.max(32, D - 4)]);
      if (outcome === "delivered_after_incident") {
        tl.push(
          ["in_transit", "Reprogramada con el cliente para mañana", Math.max(36, D - 1)],
          ["delivered", "Entregado", D + 18],
        );
      }
      if (outcome === "returned")
        tl.push(
          ["returning", "En devolución", D + 12],
          ["returned", "Devuelto a la tienda", D + 60],
        );
    }
    const lastStatus = tl.at(-1)?.[0] ?? "created";
    const finalTime = t0 + hrs(tl.at(-1)?.[2] ?? 0);
    const shipStatus = outcome === "delivered_after_incident" ? "delivered" : lastStatus;
    store.ships.push({
      id: shipId,
      orderId: o.id,
      provider: route.provider,
      carrier: prof.carrier,
      service: prof.service,
      trackingNumber: tn,
      labelUrl: `https://traxo.invalid/etiquetas/${tn}.pdf`,
      trackUrl: `https://traxo.invalid/rastreo/${tn}`,
      total: freight + cod,
      status: shipStatus,
      simulated: true,
      createdAt: new Date(t0 + 120_000),
      deliveredAt: shipStatus === "delivered" ? new Date(finalTime) : null,
    });
    tl.forEach(([st, desc, h], j) =>
      store.tracks.push({
        id: `trk_${i}_${j}`,
        shipmentId: shipId,
        status: st,
        description: desc,
        location: null,
        at: new Date(t0 + hrs(h)),
      }),
    );

    if (recent) {
      ev(
        "address.normalized",
        `Normalicé la dirección de ${o.number}: ${address.street}, ${address.city}.`,
        new Date(t0 + 35_000),
        o.id,
      );
      ev(
        "quotes.received",
        `Recibí 14 cotizaciones; 4 transportadoras distintas pueden llevarlo.`,
        new Date(t0 + 50_000),
        o.id,
      );
      ev(
        "carrier.selected",
        `Elegí ${prof.carrier} ${route.provider === "envia-com" ? "por Envia.com" : route.provider === "99envios" ? "por 99envios" : "directo"}: ${formatCOP(freight + cod)} en ${days_} días hábiles.${cod ? ` Incluye ${formatCOP(cod)} de comisión de recaudo.` : ""}`,
        new Date(t0 + 55_000),
        o.id,
      );
      ev(
        "shipment.created",
        `Generé la guía ${tn} con ${prof.carrier} (${formatCOP(freight + cod)}). Es una guía simulada.`,
        new Date(t0 + 120_000),
        o.id,
      );
      ev(
        "fulfillment.written",
        "Escribí la guía y el tracking en la tienda (shopify).",
        new Date(t0 + 125_000),
        o.id,
      );
      msg(
        o.customerIdx,
        "out",
        `Hola ${address.name.split(" ")[0]}, tu pedido de Café de Origen ya va en camino con ${prof.carrier}. Guía ${tn}. Llega en ${days_} días hábiles. Rastréalo aquí: https://traxo.invalid/rastreo/${tn}`,
        new Date(t0 + 130_000),
        "pedido_en_camino",
      );
      ev(
        "message.sent",
        `Le avisé a ${address.name} por WhatsApp que su pedido va en camino. (mensaje simulado)`,
        new Date(t0 + 131_000),
        o.id,
      );
      customersWithAnyMsg.add(o.customerIdx);
      if (outcome === "out_for_delivery") {
        ev(
          "tracking.updated",
          `Guía ${tn} (${prof.carrier}): En reparto.`,
          new Date(finalTime),
          o.id,
        );
        msg(
          o.customerIdx,
          "out",
          `Hola ${address.name.split(" ")[0]}, tu pedido llega hoy. ${o.payment === "cod" ? `Ten listos ${formatCOP(total)} para pagar al recibir. ` : ""}Guía ${tn}.`,
          new Date(finalTime + 60_000),
          "llega_hoy",
        );
      }
      if (outcome === "delivered")
        ev(
          "tracking.updated",
          `Entregué ${o.number} a ${address.name}${o.payment === "cod" ? ` y se recaudaron ${formatCOP(total)}` : ""}.`,
          new Date(finalTime),
          o.id,
        );
    }
    if (outcome === "incident" || special === "incidentOpen" || special === "newAddress") {
      const when = new Date(t0 + hrs(Math.max(32, D - 4)));
      if (recent)
        ev(
          "incident.detected",
          `Novedad en la guía ${tn}: Novedad: el cliente no estaba en la dirección. Contacto al cliente para reprogramar.`,
          when,
          o.id,
        );
      msg(
        o.customerIdx,
        "out",
        `Hola ${address.name.split(" ")[0]}, la transportadora no pudo entregar tu pedido (guía ${tn}). ¿Quieres que lo reprogramemos para mañana? Responde SÍ o dime otra dirección.`,
        new Date(when.getTime() + 60_000),
        "novedad_entrega",
      );
      customersWithAnyMsg.add(o.customerIdx);
      if (special === "newAddress") {
        msg(
          o.customerIdx,
          "in",
          "Mejor a la Carrera 15 # 100-25 en Bogotá, apto 301",
          new Date(when.getTime() + 20 * 60_000),
        );
        msg(
          o.customerIdx,
          "out",
          "Gracias, anoté la nueva dirección. La tienda la confirma y reprogramamos.",
          new Date(when.getTime() + 21 * 60_000),
        );
        store.approvals.push({
          id: "apr_rich_newaddr",
          storeId,
          orderId: o.id,
          kind: "new_address",
          title: `Nueva dirección para ${o.number}`,
          detail: `El cliente propone: "Carrera 15 # 100-25 apto 301" (Bogotá). Confírmala para reprogramar.`,
          payload: {
            orderId: o.id,
            trackingNumber: tn,
            street: "Carrera 15 # 100-25 apto 301",
            dane: "11001",
          },
          status: "pending",
          createdAt: new Date(when.getTime() + 22 * 60_000),
        });
        ev(
          "approval.requested",
          `${address.name} dio otra dirección para ${o.number}: "Carrera 15 # 100-25 apto 301". La dejé lista para tu aprobación.`,
          new Date(when.getTime() + 22 * 60_000),
          o.id,
        );
      }
    }
    if (outcome === "delivered_after_incident") {
      const when = new Date(t0 + hrs(Math.max(32, D - 4)));
      msg(
        o.customerIdx,
        "out",
        `Hola ${address.name.split(" ")[0]}, la transportadora no pudo entregar tu pedido. ¿Quieres que lo reprogramemos para mañana?`,
        new Date(when.getTime() + 60_000),
        "novedad_entrega",
      );
      msg(o.customerIdx, "in", "Sí, mañana estoy", new Date(when.getTime() + 15 * 60_000));
      msg(
        o.customerIdx,
        "out",
        `Listo, reprogramé tu entrega para mañana.${o.payment === "cod" ? ` Ten listos ${formatCOP(total)}.` : ""}`,
        new Date(when.getTime() + 16 * 60_000),
      );
      customersWithAnyMsg.add(o.customerIdx);
      if (recent)
        ev(
          "incident.resolved",
          `Resolví la novedad de ${o.number}: ${address.name} confirmó y reprogramé la entrega para mañana.`,
          new Date(when.getTime() + 16 * 60_000),
          o.id,
        );
    }
  });

  // Respuesta a una baja: un cliente que pidió no recibir mensajes.
  const opt = customers.findIndex((c) => c.optOut);
  if (opt >= 0) {
    msg(opt, "in", "BAJA", at(9 * DAY));
    msg(
      opt,
      "out",
      "Listo, no te escribiremos más. Si cambias de idea, escríbenos cuando quieras.",
      at(9 * DAY - 60_000),
    );
    customersWithAnyMsg.add(opt);
  }

  // Aprobaciones ya resueltas (historia).
  const past: Array<[string, string, string, number, "approved" | "rejected"]> = [
    [
      "shipment",
      "Aprobar guía de #1043 con Servientrega",
      "La guía cuesta $ 68.400, más que tu tope automático.",
      11,
      "approved",
    ],
    [
      "address",
      "Dirección por confirmar en #1051",
      "La dirección parece incompleta.",
      14,
      "approved",
    ],
    [
      "return",
      "Una clienta no quiere recibir #1066",
      "Respondió «no lo quiero» tras la novedad.",
      19,
      "approved",
    ],
    [
      "no_response",
      "Un cliente no confirmó #1072",
      "Pasaron más de 24 h sin respuesta.",
      23,
      "rejected",
    ],
    ["unknown_reply", "Respuesta que no entendí", "Escribió: «mmm quien eres».", 27, "approved"],
    ["shipment", "Aprobar guía de #1090 con TCC", "La guía cuesta $ 82.000.", 31, "rejected"],
  ];
  past.forEach(([kind, title, detail, d, st], j) =>
    store.approvals.push({
      id: `apr_past_${j}`,
      storeId,
      orderId: null,
      kind,
      title,
      detail,
      payload: {},
      status: st,
      createdAt: at(d * DAY),
      resolvedAt: at(d * DAY - 2 * HOUR),
    }),
  );

  // ---------- Historial de eventos que no son de un pedido ----------
  ev(
    "store.imported",
    "Importé tu tienda: 6 productos, 64 clientes y 143 pedidos. Ya puedo trabajar con tus datos.",
    at(90 * DAY),
  );
  ev(
    "audit.done",
    "Auditoría de SEO lista (informe de ejemplo): 62 sobre 15 checks evaluados de 16. Lo primero: Meta descripción: Escribe 70–160 caracteres que inviten a hacer clic.",
    at(30 * DAY),
  );
  ev(
    "audit.done",
    "Auditoría de SEO lista (informe de ejemplo): 71 sobre 15 checks evaluados de 16. Lo primero: Schema de producto (JSON-LD): Añade Product con offers (precio, moneda COP, disponibilidad).",
    at(2 * DAY),
  );
  ev(
    "audit.done",
    "Auditoría de diseño lista (informe de ejemplo): 78 sobre 10 checks evaluados de 12. Lo primero: Contacto por WhatsApp: Añade un botón de WhatsApp: es el canal de soporte que más se usa.",
    at(2 * DAY - 5 * 60_000),
  );
  for (const c of camps)
    ev(
      "marketing.draft",
      c.status === "DRAFT"
        ? `Dejé listo el borrador de campaña de ${prod(c.productId).title} para ${c.platform}. No gasté nada y no está creada en la plataforma.`
        : `La campaña de ${prod(c.productId).title} en ${c.platform} sigue ${c.status === "ACTIVE" ? "activa (la activaste tú)" : "en pausa"}. Leí sus métricas de ejemplo.`,
      at(c.daysAgo * DAY),
    );

  // ---------- Escritura en lote ----------
  const chunk = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>, size = 400) => {
    for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  };
  await db.prisma.customer.createMany({
    data: customers.map((c) => ({
      id: c.id,
      storeId,
      name: c.name,
      phone: c.phone,
      email: `${strip(c.name.split(" ")[0] ?? "cliente")}${c.id.slice(-2)}@correo.co`,
      city: c.city,
      whatsappConsent: c.consent,
      optOutAt: c.optOut ? at(9 * DAY) : null,
      createdAt: at(95 * DAY),
    })),
  });
  await chunk(store.orders as Array<Record<string, never>>, (c) =>
    db.prisma.order.createMany({ data: c as never }),
  );
  await chunk(store.quotes as never[], (c) =>
    db.prisma.carrierQuote.createMany({ data: c as never }),
  );
  await chunk(store.ships as never[], (c) => db.prisma.shipment.createMany({ data: c as never }));
  await chunk(store.tracks as never[], (c) =>
    db.prisma.trackingEventRow.createMany({ data: c as never }),
  );
  // Mayoría por WhatsApp; algunas conversaciones entran por Instagram y Messenger (todo llega por el mismo conector, Zernio).
  const convRows = [...store.convs.entries()].map(([customerId, id], n) => ({
    id,
    storeId,
    customerId,
    channel: n % 7 === 2 || n % 7 === 5 ? "instagram" : n % 7 === 4 ? "messenger" : "whatsapp",
    createdAt: at(60 * DAY),
  }));
  await db.prisma.conversation.createMany({ data: convRows });
  await chunk(store.messages as never[], (c) => db.prisma.message.createMany({ data: c as never }));
  await chunk(store.approvals as never[], (c) =>
    db.prisma.approval.createMany({ data: c as never }),
  );
  await chunk(store.runs as never[], (c) => db.prisma.agentRun.createMany({ data: c as never }));

  // Uso de IA y créditos de ejemplo: pocas llamadas por día y casi todo resuelto con reglas (así se ve el panel de uso agéntico).
  const FEATURES = [
    { name: "Asistente del panel", inTok: 1500, outTok: 330 },
    { name: "Respuesta de cliente", inTok: 420, outTok: 110 },
    { name: "Copy de anuncios", inTok: 900, outTok: 520 },
  ];
  const usage: Array<Record<string, unknown>> = [];
  for (let d = 59; d >= 0; d--) {
    const calls = 1 + ((d * 7 + 3) % 5);
    for (let i = 0; i < calls; i++) {
      const f = FEATURES[(d + i * 2) % 3] as (typeof FEATURES)[number];
      const jitter = 0.8 + (((d * 13 + i * 5) % 9) / 9) * 0.5;
      const tokensIn = Math.round(f.inTok * jitter);
      const tokensOut = Math.round(f.outTok * jitter);
      usage.push({
        id: `use_rich_${d}_${i}`,
        storeId,
        kind: "ia",
        feature: f.name,
        tokensIn,
        tokensOut,
        credits: 0,
        costUsd: (tokensIn * 3 + tokensOut * 15) / 1_000_000,
        at: at(d * DAY + (i + 1) * 2.1 * 3_600_000),
      });
    }
    if (d % 11 === 4)
      usage.push({
        id: `use_rich_cr_${d}`,
        storeId,
        kind: d % 22 === 4 ? "video" : "imagen",
        feature: d % 22 === 4 ? "Higgsfield · video UGC" : "Higgsfield · foto de producto",
        tokensIn: 0,
        tokensOut: 0,
        credits: d % 22 === 4 ? 40 : 6,
        costUsd: (d % 22 === 4 ? 40 : 6) * 0.05,
        at: at(d * DAY + 5 * 3_600_000),
      });
  }
  await db.prisma.usageEvent.createMany({ data: usage as never });

  // ---------- Campañas con métricas de ejemplo (el gasto sale de la plataforma, no de Traxo) ----------
  // El gasto sale de la plataforma, no de Traxo: lo fijamos para que el ROAS (ventas ÷ gasto) cuente una historia coherente
  // con los pedidos que de verdad traen esos utm. La de TikTok pierde plata a propósito.
  const TARGET_ROAS: Record<string, number> = {
    "kit-meta": 4.6,
    "huila-meta": 4.1,
    "narino-google": 3.4,
    "prensa-meta": 2.6,
    "susc-tiktok": 0.8,
  };
  const CPC = { meta: 190, google: 148, tiktok: 74 } as const;
  const CTR = { meta: 0.021, google: 0.04, tiktok: 0.013 } as const;
  const okStatus = new Map(
    (store.orders as Array<{ id: string; status: string }>).map((o) => [o.id, o.status]),
  );
  for (const c of camps) {
    if (c.status === "DRAFT") continue;
    const rev = orders
      .filter((o) => o.utm.utm_campaign === c.utm && okStatus.get(o.id) !== "cancelled")
      .reduce((sum, o) => sum + o.total, 0);
    c.spend = rev > 0 ? Math.round(rev / (TARGET_ROAS[c.key] ?? 3) / 1000) * 1000 : 150_000;
    c.clicks = Math.max(1, Math.round(c.spend / CPC[c.platform]));
    c.impressions = Math.round(c.clicks / CTR[c.platform]);
  }
  for (const c of camps) {
    const p = prod(c.productId);
    const sug = suggestCampaign(
      {
        platform: c.platform,
        objective: "ventas",
        productTitle: p.title,
        price: p.price,
        marginPct: p.cost ? Math.round(((p.price - p.cost) / p.price) * 100) : null,
        unitsSold: 40,
        topCities: ["Bogotá", "Medellín", "Cali"],
        storeName: "Café de Origen",
        dailyBudget: c.budget,
      },
      new Date(now.getTime() - c.daysAgo * DAY),
    );
    const metrics =
      c.status === "DRAFT"
        ? null
        : {
            spend: c.spend,
            impressions: c.impressions,
            clicks: c.clicks,
            ctr: Math.round((c.clicks / c.impressions) * 1000) / 10,
            cpc: Math.round(c.spend / c.clicks),
            since: at(c.daysAgo * DAY).toISOString(),
          };
    await db.prisma.campaignDraft.create({
      data: {
        id: `cmp_rich_${c.key}`,
        storeId,
        platform: c.platform,
        product: p.title,
        status: c.status,
        externalId:
          c.status === "DRAFT"
            ? null
            : `sim_${c.platform}_${(1_000_000 + camps.indexOf(c) * 137_913).toString()}`,
        sample: true,
        metrics: metrics ?? undefined,
        payload: {
          platform: c.platform,
          productId: p.id,
          productTitle: p.title,
          objective: "ventas",
          dailyBudget: c.budget,
          audience: {
            ...sug.audience,
            customerSegment: c.key === "susc-tiktok" ? "recompra" : undefined,
          },
          copy: sug.copy,
          creatives: sug.creatives.map((x, j) => ({
            ...x,
            generated: c.status !== "DRAFT" || j < 2,
            seed: `${c.key}-${j}`,
            mock: true,
          })),
          utmCampaign: c.utm,
        },
        createdAt: at(c.daysAgo * DAY),
      },
    });
  }

  // ---------- Audiencias ----------
  // Tamaños reales: mismas reglas de segmento que usa la API (consentimiento + sin baja).
  const seg = (name: "recompra" | "nuevo" | "inactivo") =>
    customers.filter((c, idx) => {
      if (!c.consent) return false;
      const mine = orders.filter(
        (o) =>
          o.customerIdx === idx &&
          (store.orders as Array<{ id: string; status: string }>).some(
            (x) => x.id === o.id && x.status !== "cancelled",
          ),
      );
      if (mine.length === 0) return false;
      const last = Math.max(...mine.map((o) => o.createdAt.getTime()));
      return name === "recompra"
        ? mine.length >= 2
        : name === "nuevo"
          ? mine.length === 1 && now.getTime() - last < 30 * DAY
          : now.getTime() - last > 60 * DAY;
    }).length;
  // Biblioteca de creativos de ejemplo: ilustraciones, no archivos reales (los de verdad se suben o se traen de Higgsfield).
  const lib: Array<[string, string, string, string, string, number | null]> = [
    [
      "video",
      "UGC · Valentina prueba el Kit degustación",
      "ugc",
      "higgsfield",
      "Kit degustación x3",
      28,
    ],
    ["video", "UGC · Unboxing del pedido (15 s)", "ugc", "subido", "Kit degustación x3", 15],
    [
      "video",
      "UGC · Cómo preparo mi café en casa",
      "ugc",
      "higgsfield",
      "Café Huila 340 g (grano)",
      22,
    ],
    [
      "video",
      "Reel · del grano a la taza",
      "lifestyle",
      "generado",
      "Café Nariño 340 g (molido)",
      12,
    ],
    [
      "image",
      "Foto de producto · Café Huila",
      "producto",
      "subido",
      "Café Huila 340 g (grano)",
      null,
    ],
    [
      "image",
      "Foto de producto · Kit degustación",
      "producto",
      "generado",
      "Kit degustación x3",
      null,
    ],
    [
      "image",
      "Lifestyle · mañana en la cocina",
      "lifestyle",
      "subido",
      "Café Nariño 340 g (molido)",
      null,
    ],
    ["image", "Referencia · anuncio que rinde en tu categoría", "referencia", "subido", "", null],
  ];
  await db.prisma.mediaAsset.createMany({
    data: lib.map(([kind, title, role, source, product, durationS], n) => ({
      id: `media_rich_${n + 1}`,
      storeId,
      kind,
      title,
      source,
      role,
      product: product || null,
      seed: `lib-${n}`,
      durationS,
      sample: true,
      createdAt: at((n + 1) * 2 * DAY),
    })),
  });
  await db.prisma.audience.createMany({
    data: [
      {
        id: "aud_rich_1",
        storeId,
        name: "Clientes que recompran",
        segment: "recompra",
        size: seg("recompra"),
        status: "SYNC_SIMULADO",
        createdAt: at(26 * DAY),
      },
      {
        id: "aud_rich_2",
        storeId,
        name: "Clientes inactivos (60+ días)",
        segment: "inactivo",
        size: seg("inactivo"),
        status: "DRAFT",
        createdAt: at(6 * DAY),
      },
      {
        id: "aud_rich_3",
        storeId,
        name: "Clientes nuevos (30 días)",
        segment: "nuevo",
        size: seg("nuevo"),
        status: "DRAFT",
        createdAt: at(3 * DAY),
      },
    ],
  });

  // ---------- Auditorías: la anterior (peor) y la actual ----------
  const seoNow = sampleAudit("seo", "https://cafedeorigen.example", at(2 * DAY));
  const seoOld = sampleAudit("seo", "https://cafedeorigen.example", at(30 * DAY));
  for (const c of seoOld.checks) if (["canonical", "og", "llms"].includes(c.id)) c.status = "fail";
  const { scoreChecks, quickWinsOf } = await import("@traxo/audit");
  Object.assign(seoOld, scoreChecks(seoOld.checks), { quickWins: quickWinsOf(seoOld.checks) });
  const dis = sampleAudit("diseno", "https://cafedeorigen.example", at(2 * DAY));
  for (const [kind, rep, when] of [
    ["seo", seoOld, 30],
    ["seo", seoNow, 2],
    ["diseno", dis, 2],
  ] as const) {
    await db.prisma.storeAudit.create({
      data: {
        id: newId("aud"),
        storeId,
        kind,
        source: "sample",
        score: rep.score,
        evaluated: rep.evaluated,
        total: rep.total,
        url: rep.url,
        payload: rep as unknown as object,
        createdAt: at(when * DAY),
      },
    });
  }

  void CITIES;
  return {
    orders: orders.length,
    customers: customers.length,
    shipments: store.ships.length,
    campaigns: camps.length,
    events: store.runs.length,
  };
}
