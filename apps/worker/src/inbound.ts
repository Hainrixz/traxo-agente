import { formatCOP, type Order } from "@traxo/core";
import { createApproval, orderFromRow } from "@traxo/db";
import { findCity, normalizeStreet } from "@traxo/geo-co";
import type { InboundMessage } from "@traxo/messaging";
import { type AgentDeps, recordInbound, recordMessage, recordOutbound } from "./agent.ts";
import { askClaude } from "./ai.ts";
import { type ConfirmationIntent, handleConfirmationReply } from "./confirmation.ts";

/** Ley 1581: quien pide que no le escribamos más, no recibe más mensajes. */
const OPT_OUT =
  /^\s*(baja|stop|parar|desuscribir|no me escriban|no m[aá]s mensajes|no quiero m[aá]s mensajes)\b/i;
const YES = /^(s[ií]|dale|ok|listo|claro|de una|por favor|reprogram)/i;
// «No» a secas o rechazo claro. «No sé», «no estoy ahora» o «no puedo hoy» no son un rechazo: eso lo entiende la IA o una persona.
const NO =
  /^(no[.!,\s]*$|no\s+(lo\s+|la\s+)?(quiero|recibo|necesito|gracias)\b|cancel|ya no|devu[eé]lv)/i;

export type InboundResult = {
  handled: boolean;
  intent:
    | "reschedule"
    | "new_address"
    | "cancel"
    | "unknown"
    | "no_context"
    | "opt_out"
    | ConfirmationIntent;
};

/**
 * Atiende la respuesta del cliente a una novedad. Reglas simples y auditables (sin LLM):
 * sí → reprograma · dirección nueva → pide aprobación con la nueva dirección · no → pide aprobación de devolución.
 * Lo que no entiende se escala a una persona; nunca se inventa una respuesta.
 */
export async function handleInbound(
  deps: AgentDeps,
  msg: InboundMessage,
  storeId?: string,
): Promise<InboundResult> {
  const { db, bus } = deps;
  const customer = await db.prisma.customer.findFirst({
    where: { phone: msg.from, ...(storeId ? { storeId } : {}) },
  });
  if (!customer) return { handled: false, intent: "no_context" };
  const said = msg.text.trim();
  if (OPT_OUT.test(said)) {
    await db.prisma.customer.update({
      where: { id: customer.id },
      data: { whatsappConsent: false, optOutAt: new Date() },
    });
    await recordInbound(db, customer.storeId, customer.id, said, deps.messaging.name === "mock");
    const reply = "Listo, no te escribiremos más. Si cambias de idea, escríbenos cuando quieras.";
    const sent = await deps.messaging.send({
      to: msg.from,
      text: reply,
      idempotencyKey: `optout:${customer.id}:${Date.now()}`,
    });
    await recordOutbound(db, customer.storeId, customer.id, reply, sent.simulated);
    bus.emit(
      "message.sent",
      `${customer.name} pidió no recibir más mensajes. Lo respeté: quedó fuera de las campañas y de los avisos que no sean de su pedido.`,
      { data: { storeId: customer.storeId } },
    );
    return { handled: true, intent: "opt_out" };
  }
  const awaiting = await db.prisma.order.findFirst({
    where: { customerId: customer.id, status: "awaiting_confirmation" },
    orderBy: { createdAt: "desc" },
  });
  if (awaiting) {
    await recordInbound(db, awaiting.storeId, customer.id, said, deps.messaging.name === "mock");
    const awaited = orderFromRow(awaiting);
    bus.emit("message.sent", `${awaited.address.name} respondió: "${said}"`, {
      orderId: awaiting.id,
    });
    return { handled: true, intent: await handleConfirmationReply(deps, awaited, said) };
  }
  const shipment = await db.prisma.shipment.findFirst({
    where: { status: "incident", order: { customerId: customer.id } },
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });
  if (!shipment) return { handled: false, intent: "no_context" };

  const order: Order = orderFromRow(shipment.order);
  const ev = (
    kind: Parameters<typeof bus.emit>[0],
    summary: string,
    data?: Record<string, unknown>,
  ) => bus.emit(kind, summary, { orderId: order.id, data });
  const text = msg.text.trim();

  let conv = await db.prisma.conversation.findFirst({
    where: { storeId: order.storeId, customerId: customer.id },
  });
  if (!conv)
    conv = await db.prisma.conversation.create({
      data: { id: `conv_${Date.now()}`, storeId: order.storeId, customerId: customer.id },
    });
  await db.prisma.message.create({
    data: {
      id: `msg_${Date.now()}_in`,
      conversationId: conv.id,
      direction: "in",
      text,
      simulated: Boolean(msg.at) && deps.messaging.name === "mock",
    },
  });
  ev("message.sent", `${order.address.name} respondió: "${text}"`);

  const reply = async (body: string) => {
    const sent = await deps.messaging.send({
      to: msg.from,
      text: body,
      idempotencyKey: `${order.id}:reply:${Date.now()}`,
    });
    await recordMessage(db, order, body, undefined, sent.simulated);
  };

  const reschedule = async (): Promise<InboundResult> => {
    await db.prisma.trackingEventRow.create({
      data: {
        id: `trk_${Date.now()}`,
        shipmentId: shipment.id,
        status: "in_transit",
        description: "Reprogramada con el cliente para mañana",
        at: new Date(),
      },
    });
    await db.prisma.shipment.update({ where: { id: shipment.id }, data: { status: "in_transit" } });
    await reply(
      `Listo, reprogramé tu entrega para mañana. ${order.payment === "cod" ? `Ten listos ${formatCOP(order.total)}. ` : ""}Guía ${shipment.trackingNumber}.`,
    );
    ev(
      "incident.resolved",
      `Resolví la novedad de ${order.number}: ${order.address.name} confirmó y reprogramé la entrega para mañana.`,
    );
    return { handled: true, intent: "reschedule" };
  };
  if (YES.test(text)) return reschedule();

  if (NO.test(text)) {
    const id = await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "return",
      title: `${order.address.name} no quiere recibir ${order.number}`,
      detail: `Respondió "${text}" tras la novedad de la guía ${shipment.trackingNumber}. Decide si se devuelve o se intenta de nuevo.`,
      payload: { orderId: order.id, trackingNumber: shipment.trackingNumber },
    });
    await reply("Entendido, lo informo a la tienda para que te contacten. Gracias por avisar.");
    ev(
      "approval.requested",
      `${order.address.name} rechazó ${order.number}. Necesito que decidas si se devuelve.`,
      { approvalId: id },
    );
    return { handled: true, intent: "cancel" };
  }

  const digits = /\d/.test(text) && text.length > 8;
  if (digits) {
    const city = findCity(text) ?? findCity(order.address.city);
    const street = normalizeStreet(text);
    const id = await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "new_address",
      title: `Nueva dirección para ${order.number}`,
      detail: `El cliente propone: "${street}"${city ? ` (${city.name})` : ""}. Confírmala para reprogramar.`,
      payload: {
        orderId: order.id,
        trackingNumber: shipment.trackingNumber,
        street,
        dane: city?.dane,
      },
    });
    await reply("Gracias, anoté la nueva dirección. La tienda la confirma y reprogramamos.");
    ev(
      "approval.requested",
      `${order.address.name} dio otra dirección para ${order.number}: "${street}". La dejé lista para tu aprobación.`,
      { approvalId: id },
    );
    return { handled: true, intent: "new_address" };
  }

  // Las reglas no la entendieron: con IA se clasifica el texto libre. Solo se actúa si está muy segura y la acción es de bajo riesgo;
  // en cualquier otro caso se la pasa a una persona, con un borrador de respuesta (que no se envía solo).
  const ai = await classifyReply(order.storeId, text, order.number);
  if (ai?.intent === "reschedule" && ai.confidence >= 0.8) return reschedule();
  if (ai?.intent === "cancel" && ai.confidence >= 0.8) {
    const cid = await createApproval(db, {
      storeId: order.storeId,
      orderId: order.id,
      kind: "return",
      title: `${order.address.name} no quiere recibir ${order.number}`,
      detail: `Escribió "${text}" tras la novedad de la guía ${shipment.trackingNumber}. Decide si se devuelve o se intenta de nuevo.`,
      payload: { orderId: order.id, trackingNumber: shipment.trackingNumber },
    });
    await reply("Entendido, lo informo a la tienda para que te contacten. Gracias por avisar.");
    ev(
      "approval.requested",
      `${order.address.name} rechazó ${order.number}. Necesito que decidas si se devuelve.`,
      { approvalId: cid },
    );
    return { handled: true, intent: "cancel" };
  }
  const draft = ai?.draft ? ` Borrador sugerido (no enviado): "${ai.draft}"` : "";
  const id = await createApproval(db, {
    storeId: order.storeId,
    orderId: order.id,
    kind: "unknown_reply",
    title: `Respuesta que no entendí de ${order.address.name}`,
    detail: `Escribió: "${text}". Respóndele tú o dime cómo seguir.${draft}`,
    payload: { orderId: order.id },
  });
  ev(
    "approval.requested",
    `No entendí la respuesta de ${order.address.name} ("${text}"). Te la paso para que la atiendas.`,
    { approvalId: id },
  );
  return { handled: true, intent: "unknown" };
}

type Classified = {
  intent: "reschedule" | "cancel" | "question" | "other";
  confidence: number;
  draft?: string;
};

/** Clasifica con Claude lo que escribió el cliente. null si no hay IA, cupo o respuesta válida: entonces lo ve una persona. */
async function classifyReply(
  storeId: string,
  text: string,
  orderNumber: string,
): Promise<Classified | null> {
  const out = await askClaude(storeId, {
    feature: "Respuesta de cliente",
    system:
      "Clasificas la respuesta de un cliente colombiano a un aviso de novedad de entrega. " +
      'Responde SOLO un JSON: {"intent":"reschedule|cancel|question|other","confidence":0-1,"draft":"respuesta corta y amable en español, solo si intent es question"}. ' +
      "reschedule = acepta que se reintente la entrega; cancel = no quiere el pedido; question = pregunta algo; other = nada de lo anterior o ambiguo. " +
      "Ante la duda usa other con baja confianza.",
    user: `Pedido ${orderNumber}. Mensaje del cliente:\n<datos>${text.slice(0, 400)}</datos>`,
    maxTokens: 200,
  });
  if (!out) return null;
  try {
    const j = JSON.parse(
      out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1),
    ) as Partial<Classified>;
    if (!j.intent || !["reschedule", "cancel", "question", "other"].includes(j.intent)) return null;
    return {
      intent: j.intent,
      confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)),
      draft: typeof j.draft === "string" ? j.draft.slice(0, 280) : undefined,
    };
  } catch {
    return null;
  }
}
