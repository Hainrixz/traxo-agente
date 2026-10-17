import { formatCOP, type Quote } from "@traxo/core";
import { addTrackingEvents, getSettings, orderFromRow } from "@traxo/db";
import { findCity, normalizeStreet } from "@traxo/geo-co";
import { createAndNotify, draftFor, handleNewOrder, recordMessage } from "./agent.ts";
import { cancelOrder } from "./confirmation.ts";
import type { Runtime } from "./runtime.ts";

export type ApprovalResult = { ok: boolean; message: string };

/** Ejecuta lo que la persona aprobó. Cada rama escribe un evento en primera persona. */
export async function approve(rt: Runtime, id: string): Promise<ApprovalResult> {
  const a = await rt.db.prisma.approval.findUnique({ where: { id } });
  if (!a) return { ok: false, message: "No encuentro esa aprobación." };
  if (a.status !== "pending") return { ok: false, message: "Esa aprobación ya está resuelta." };
  const row = a.orderId ? await rt.db.prisma.order.findUnique({ where: { id: a.orderId } }) : null;
  const order = row ? orderFromRow(row) : undefined;
  const payload = a.payload as Record<string, string | undefined>;
  const done = async () =>
    rt.db.prisma.approval.update({
      where: { id },
      data: { status: "approved", resolvedAt: new Date() },
    });

  if (a.kind === "shipment" && order) {
    const settings = await getSettings(rt.db, order.storeId);
    const draft = draftFor(order, settings.originDane);
    const provider = rt.carriers.find((c) => c.id === payload.provider);
    if (!provider)
      return { ok: false, message: `La vía ${payload.provider} ya no está conectada.` };
    const quotes: Quote[] = await provider.quote(draft);
    const chosen = quotes.find((q) => q.carrier === payload.carrier);
    if (!chosen)
      return {
        ok: false,
        message: `${payload.carrier} ya no cotiza esta ruta. Rechaza y pídeme otra opción.`,
      };
    const out = await createAndNotify(rt, order, draft, chosen);
    await done();
    return {
      ok: true,
      message: out.status === "shipped" ? `Generé la guía ${out.trackingNumber}.` : "Listo.",
    };
  }

  if (a.kind === "new_address" && order && payload.trackingNumber) {
    const ship = await rt.db.prisma.shipment.findFirst({
      where: { trackingNumber: payload.trackingNumber },
    });
    const street = payload.street ?? order.address.street;
    const next = { ...order.address, street, dane: payload.dane ?? order.address.dane };
    await rt.db.prisma.order.update({ where: { id: order.id }, data: { address: next } });
    if (ship) {
      await addTrackingEvents(rt.db, ship.id, [
        {
          status: "in_transit",
          description: `Reprogramada a la nueva dirección: ${street}`,
          at: new Date().toISOString(),
        },
      ]);
      const text = `Confirmamos tu nueva dirección (${street}) y reprogramamos la entrega. ${order.payment === "cod" ? `Ten listos ${formatCOP(order.total)}.` : ""}`;
      const sent = await rt.messaging.send({
        to: order.address.phone,
        text,
        idempotencyKey: `${a.id}:ok`,
      });
      await recordMessage(rt.db, order, text, undefined, sent.simulated);
    }
    rt.bus.emit(
      "incident.resolved",
      `Actualicé la dirección de ${order.number} y reprogramé la entrega.`,
      { orderId: order.id },
    );
    await done();
    return { ok: true, message: "Dirección actualizada y entrega reprogramada." };
  }

  if (a.kind === "no_response" && order) {
    await rt.db.prisma.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    await done();
    const out = await handleNewOrder(rt, order, { skipConfirmation: true });
    return {
      ok: true,
      message:
        out.status === "shipped"
          ? `Lo envié sin confirmación: guía ${out.trackingNumber}.`
          : "Seguí con el envío.",
    };
  }

  if (a.kind === "return" && order && payload.trackingNumber) {
    const ship = await rt.db.prisma.shipment.findFirst({
      where: { trackingNumber: payload.trackingNumber },
    });
    if (ship)
      await addTrackingEvents(rt.db, ship.id, [
        {
          status: "returning",
          description: "Devolución aprobada por la tienda",
          at: new Date().toISOString(),
        },
      ]);
    rt.bus.emit(
      "incident.resolved",
      `Aprobaste la devolución de ${order.number}. La marqué en devolución.`,
      { orderId: order.id },
    );
    await done();
    return { ok: true, message: "Devolución registrada." };
  }

  await done();
  return { ok: true, message: "Marcada como resuelta." };
}

export async function reject(rt: Runtime, id: string): Promise<ApprovalResult> {
  const a = await rt.db.prisma.approval.findUnique({ where: { id } });
  if (!a || a.status !== "pending")
    return { ok: false, message: "No hay nada pendiente con ese id." };
  await rt.db.prisma.approval.update({
    where: { id },
    data: { status: "rejected", resolvedAt: new Date() },
  });
  if (a.kind === "no_response" && a.orderId) {
    const row = await rt.db.prisma.order.findUnique({ where: { id: a.orderId } });
    if (row) await cancelOrder(rt, orderFromRow(row), "no confirmó y decidiste no enviarlo");
    return { ok: true, message: "Pedido cancelado. No se generó ninguna guía." };
  }
  rt.bus.emit("approval.requested", `Rechazaste: ${a.title}. No hice nada.`, {
    orderId: a.orderId ?? undefined,
  });
  return { ok: true, message: "Rechazada. No se hizo nada." };
}

/** El dueño corrige la dirección de un pedido que quedó detenido y el agente retoma el flujo desde el inicio. */
export async function fixAddress(
  rt: Runtime,
  id: string,
  input: { street: string; city?: string },
): Promise<ApprovalResult> {
  const a = await rt.db.prisma.approval.findUnique({ where: { id } });
  if (!a?.orderId || a.status !== "pending" || a.kind !== "address")
    return { ok: false, message: "Esta aprobación no es de dirección." };
  const row = await rt.db.prisma.order.findUnique({ where: { id: a.orderId } });
  if (!row) return { ok: false, message: "No encuentro el pedido." };
  const order = orderFromRow(row);
  const city = findCity(input.city ?? order.address.city);
  if (!city)
    return {
      ok: false,
      message: `No reconozco el municipio "${input.city ?? order.address.city}". Escríbelo como aparece en el DANE.`,
    };
  const address = {
    ...order.address,
    street: normalizeStreet(input.street),
    city: city.name,
    dane: city.dane,
    department: city.department,
  };
  await rt.db.prisma.order.update({ where: { id: order.id }, data: { address } });
  await rt.db.prisma.approval.update({
    where: { id },
    data: { status: "approved", resolvedAt: new Date() },
  });
  rt.bus.emit("address.normalized", `Corregí la dirección de ${order.number}. Retomo el envío.`, {
    orderId: order.id,
  });
  const out = await handleNewOrder(rt, { ...order, address });
  return {
    ok: true,
    message:
      out.status === "shipped"
        ? `Listo: guía ${out.trackingNumber}.`
        : "Dirección corregida; el envío sigue su curso.",
  };
}
