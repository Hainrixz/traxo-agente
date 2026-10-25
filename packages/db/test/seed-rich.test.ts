// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { afterAll, describe, expect, it } from "vitest";
import { type Db, openDb, seedRich } from "../src/index.ts";

let db: Db;
afterAll(async () => db?.close());

describe("datos de ejemplo ricos (cuenta admin)", () => {
  it("genera 90 días de operación coherente, marcada como ejemplo", async () => {
    db = await openDb({ dataDir: "memory://" });
    const t0 = Date.now();
    const r = await seedRich(db, { now: new Date("2026-10-16T15:00:00Z") });
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(r.orders).toBeGreaterThan(100);
    expect(r.customers).toBe(150);
    expect(await db.prisma.order.count()).toBe(r.orders);
    expect((await db.prisma.store.findFirstOrThrow()).profile).toMatchObject({
      rich: true,
      sample: true,
    });
  });

  it("cada guía tiene eventos, número único y estado coherente con su historia", async () => {
    const ships = await db.prisma.shipment.findMany({ include: { events: true } });
    expect(new Set(ships.map((s) => s.trackingNumber)).size).toBe(ships.length);
    for (const s of ships) {
      expect(s.events.length, s.trackingNumber).toBeGreaterThan(0);
      expect(s.simulated).toBe(true);
      if (s.status === "delivered") expect(s.deliveredAt, s.trackingNumber).not.toBeNull();
      else expect(s.deliveredAt).toBeNull();
    }
    const statuses = new Set(ships.map((s) => s.status));
    for (const st of [
      "delivered",
      "in_transit",
      "incident",
      "returned",
      "out_for_delivery",
      "cancelled",
      "created",
    ])
      expect(statuses.has(st), st).toBe(true);
  });

  it("todo pedido enviado tiene exactamente una cotización elegida; los detenidos no tienen guía", async () => {
    const shipped = await db.prisma.order.findMany({
      where: { shipments: { some: {} } },
      include: { quotes: true },
    });
    for (const o of shipped) expect(o.quotes.filter((q) => q.chosen).length, o.number).toBe(1);
    const awaiting = await db.prisma.order.findFirstOrThrow({
      where: { status: "awaiting_confirmation" },
      include: { shipments: true },
    });
    expect(awaiting.shipments).toHaveLength(0);
    expect(awaiting.confirmAt).not.toBeNull();
  });

  it("deja una de cada aprobación pendiente para mostrar y una historia resuelta", async () => {
    const pending = await db.prisma.approval.findMany({ where: { status: "pending" } });
    expect(pending.map((a) => a.kind).sort()).toEqual([
      "address",
      "new_address",
      "no_response",
      "shipment",
    ]);
    expect(
      await db.prisma.approval.count({ where: { status: { not: "pending" } } }),
    ).toBeGreaterThanOrEqual(5);
  });

  it("las campañas son de ejemplo, nunca nacen activas por Traxo y cada utm se usa en pedidos", async () => {
    const camps = await db.prisma.campaignDraft.findMany();
    expect(camps).toHaveLength(7);
    expect(camps.every((c) => c.sample)).toBe(true);
    expect(camps.filter((c) => c.status === "DRAFT").every((c) => c.metrics === null)).toBe(true);
    const orders = await db.prisma.order.findMany({ select: { utm: true } });
    const used = new Set(
      orders.map((o) => (o.utm as Record<string, string> | null)?.utm_campaign).filter(Boolean),
    );
    expect(used.size).toBeGreaterThanOrEqual(3);
    for (const u of used)
      expect(
        camps.some((c) => (c.payload as { utmCampaign?: string }).utmCampaign === u),
        String(u),
      ).toBe(true);
  });

  it("incluye chats con novedades, una baja de mensajes, audiencias y dos auditorías de SEO para comparar", async () => {
    expect(await db.prisma.message.count({ where: { direction: "in" } })).toBeGreaterThan(5);
    expect(
      await db.prisma.customer.count({ where: { optOutAt: { not: null } } }),
    ).toBeGreaterThanOrEqual(1);
    expect(await db.prisma.audience.count()).toBe(3);
    const seo = await db.prisma.storeAudit.findMany({
      where: { kind: "seo" },
      orderBy: { createdAt: "asc" },
    });
    expect(seo).toHaveLength(2);
    expect(seo[1]?.score ?? 0).toBeGreaterThan(seo[0]?.score ?? 100);
    expect(await db.prisma.storeAudit.count({ where: { kind: "diseno" } })).toBe(1);
  });

  it("se puede volver a sembrar sobre una base que ya tiene pedidos, cotizaciones y guías", async () => {
    const again = await openDb({ dataDir: "memory://" });
    const now = new Date("2026-10-16T15:00:00Z");
    const first = await seedRich(again, { now });
    const order = await again.prisma.order.findFirstOrThrow();
    await again.prisma.carrierQuote.create({
      data: {
        id: "q-regresion",
        orderId: order.id,
        provider: "envia-com",
        carrier: "coordinadora",
        service: "terrestre",
        freight: 10000,
        supportsCod: true,
        businessDays: 2,
      },
    });
    const second = await seedRich(again, { now });
    expect(second.orders).toBe(first.orders);
    expect(await again.prisma.order.count()).toBe(first.orders);
    await again.close();
  });

  it("es determinista: la misma fecha produce los mismos pedidos", async () => {
    const other = await openDb({ dataDir: "memory://" });
    await seedRich(other, { now: new Date("2026-10-16T15:00:00Z") });
    const a = (
      await db.prisma.order.findMany({
        select: { number: true, total: true },
        orderBy: { number: "asc" },
      })
    )
      .map((o) => `${o.number}:${o.total}`)
      .join();
    const b = (
      await other.prisma.order.findMany({
        select: { number: true, total: true },
        orderBy: { number: "asc" },
      })
    )
      .map((o) => `${o.number}:${o.total}`)
      .join();
    expect(a).toBe(b);
    await other.close();
  });
});

describe("campañas: las métricas cuentan una historia coherente con los pedidos", () => {
  it("el ROAS sale de las ventas atribuidas y exactamente una campaña pierde plata", async () => {
    const camps = await db.prisma.campaignDraft.findMany({
      where: { metrics: { not: undefined } },
    });
    const orders = await db.prisma.order.findMany({
      where: { status: { not: "cancelled" } },
      select: { total: true, utm: true },
    });
    const roas = camps
      .filter((c) => c.metrics)
      .map((c) => {
        const utm = (c.payload as { utmCampaign: string }).utmCampaign;
        const rev = orders
          .filter((o) => (o.utm as Record<string, string>)?.utm_campaign === utm)
          .reduce((s, o) => s + o.total, 0);
        return { key: c.id, roas: rev / ((c.metrics as { spend: number }).spend || 1) };
      });
    expect(roas.length).toBe(5);
    expect(roas.filter((r) => r.roas < 1).map((r) => r.key)).toEqual(["cmp_rich_susc-tiktok"]);
    for (const r of roas.filter((x) => x.key !== "cmp_rich_susc-tiktok"))
      expect(r.roas, r.key).toBeGreaterThan(2);
  });
});
