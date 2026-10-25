// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Context, Hono } from "hono";
import { aiEnabled, aiUsage, askClaude } from "./ai.ts";
import { storeOf } from "./auth.ts";
import type { Runtime } from "./runtime.ts";

const DAY = 86_400_000;

type Db = Runtime["db"];
export type Kpi = { label: string; value: string; hint?: string };
export type Link = { label: string; view: string };
export type AssistantReply = {
  answer: string;
  kpis?: Kpi[];
  links?: Link[];
  sources: string[];
  suggestions: string[];
  mode: "datos" | "claude";
};

const cop = (n: number): string => `$ ${Math.round(n).toLocaleString("es-CO").replace(/,/g, ".")}`;
const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)} %` : "N/A");
const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Todo lo que el agente sabe de la tienda, calculado de la base de datos (nada inventado). */
export async function snapshot(db: Db, storeId: string) {
  const now = Date.now();
  const [orders, shipments, approvals, campaigns, customers, audits, products, audiences, convs] =
    await Promise.all([
      db.prisma.order.findMany({
        where: { storeId, createdAt: { gte: new Date(now - 90 * DAY) } },
        include: {
          shipments: { include: { events: { orderBy: { at: "desc" }, take: 1 } } },
          customer: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.prisma.shipment.findMany({ where: { order: { storeId } } }),
      db.prisma.approval.findMany({ where: { storeId, status: "pending" } }),
      db.prisma.campaignDraft.findMany({ where: { storeId } }),
      db.prisma.customer.findMany({
        where: { storeId },
        include: { orders: { select: { createdAt: true, total: true, status: true } } },
      }),
      db.prisma.storeAudit.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.prisma.product.findMany({ where: { storeId } }),
      db.prisma.audience.findMany({ where: { storeId } }),
      db.prisma.conversation.count({ where: { storeId } }),
    ]);
  return {
    now,
    orders,
    shipments,
    approvals,
    campaigns,
    customers,
    audits,
    products,
    audiences,
    convs,
  };
}
type Snap = Awaited<ReturnType<typeof snapshot>>;

const live = (o: Snap["orders"][number]): boolean => o.status !== "cancelled";
const sales = (s: Snap, days: number) => {
  const from = s.now - days * DAY;
  const os = s.orders.filter((o) => live(o) && o.createdAt.getTime() >= from);
  const revenue = os.reduce((a, o) => a + o.total, 0);
  return { orders: os.length, revenue, ticket: os.length ? revenue / os.length : 0 };
};

function periodOf(q: string): { days: number; label: string } {
  if (/\bhoy\b/.test(q)) return { days: 1, label: "hoy" };
  if (/(7 dias|semana)/.test(q)) return { days: 7, label: "los últimos 7 días" };
  if (/(30 dias|mes)/.test(q)) return { days: 30, label: "los últimos 30 días" };
  return { days: 90, label: "los últimos 90 días" };
}

const SUGGEST = [
  "¿Cuánto vendí esta semana?",
  "¿Qué pedidos tienen novedad?",
  "¿Qué anuncio funciona y cuál no?",
  "¿Qué debo arreglar primero en mi tienda?",
  "¿Qué clientes puedo reactivar?",
  "Resumen de hoy",
];

/** Responde con reglas sobre los datos reales. Con ANTHROPIC_API_KEY, `askClaude` redacta la respuesta libre con el mismo contexto. */
export function answer(s: Snap, question: string): AssistantReply {
  const q = norm(question);
  const reply = (r: Partial<AssistantReply> & { answer: string }): AssistantReply => ({
    sources: [],
    suggestions: SUGGEST.filter((x) => norm(x) !== q).slice(0, 3),
    mode: "datos",
    ...r,
  });

  // Un pedido concreto: "dónde está el #1186"
  const num = q.match(/#?\b(\d{3,6})\b/);
  if (num && /(pedido|donde|guia|rastre|estado|#)/.test(q)) {
    const o = s.orders.find((x) => x.number.replace("#", "") === num[1]);
    if (o) {
      const sh = o.shipments[0];
      const last = sh?.events[0];
      return reply({
        answer: [
          `**Pedido ${o.number}** de ${o.customer?.name ?? "cliente"} por ${cop(o.total)} (${o.payment === "cod" ? "contraentrega" : "pagado"}).`,
          sh
            ? `• Va con ${sh.carrier} (guía ${sh.trackingNumber}), estado: ${sh.status}.`
            : `• Todavía no tiene guía (estado: ${o.status}).`,
          last ? `• Último movimiento: ${last.description}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        links: [{ label: "Abrir pedido", view: "pedidos" }],
        sources: ["pedidos", "guías"],
      });
    }
    return reply({
      answer: `No encuentro el pedido ${num[1]} en tus últimos 90 días.`,
      sources: ["pedidos"],
    });
  }

  if (/(resumen|que paso|que esta pasando|como vamos|como voy)/.test(q)) {
    const w = sales(s, 7);
    const prev = sales(s, 14).revenue - w.revenue;
    const inc = s.shipments.filter((x) => x.status === "incident").length;
    const roasLoss = s.campaigns.filter((c) => roas(s, c) !== null && (roas(s, c) as number) < 1);
    return reply({
      answer: [
        `**Esta semana** vendiste ${cop(w.revenue)} en ${w.orders} pedidos${prev > 0 ? ` (${w.revenue >= prev ? "+" : "−"}${Math.abs(Math.round(((w.revenue - prev) / prev) * 100))} % frente a la semana anterior)` : ""}.`,
        `• ${s.approvals.length} cosas esperan tu aprobación.`,
        `• ${inc} guías con novedad.`,
        roasLoss.length
          ? `• La campaña «${roasLoss[0]?.product}» gasta más de lo que vende: te recomiendo pausarla.`
          : "• Ninguna campaña pierde dinero.",
      ].join("\n"),
      kpis: [
        { label: "Ventas 7 días", value: cop(w.revenue) },
        { label: "Pedidos", value: String(w.orders) },
        { label: "Por aprobar", value: String(s.approvals.length) },
        { label: "Con novedad", value: String(inc) },
      ],
      links: [
        { label: "Ver aprobaciones", view: "aprobaciones" },
        { label: "Ver reportes", view: "reportes" },
      ],
      sources: ["pedidos", "guías", "aprobaciones", "campañas"],
    });
  }

  if (/(vend|venta|ingres|factur|ticket)/.test(q)) {
    const { days, label } = periodOf(q);
    const a = sales(s, days);
    const cod = s.orders.filter(
      (o) => live(o) && o.payment === "cod" && o.createdAt.getTime() >= s.now - days * DAY,
    );
    return reply({
      answer: `En ${label} vendiste **${cop(a.revenue)}** en ${a.orders} pedidos, con un ticket promedio de ${cop(a.ticket)}. ${cod.length ? `${pct(cod.length, a.orders)} fue contraentrega.` : ""}`,
      kpis: [
        { label: "Ventas", value: cop(a.revenue) },
        { label: "Pedidos", value: String(a.orders) },
        { label: "Ticket promedio", value: cop(a.ticket) },
      ],
      links: [{ label: "Abrir reportes", view: "reportes" }],
      sources: ["pedidos"],
    });
  }

  if (/(novedad|incidente|problema|retras|devol)/.test(q)) {
    const bad = s.orders.filter((o) =>
      o.shipments.some(
        (x) => x.status === "incident" || x.status === "returning" || x.status === "returned",
      ),
    );
    return reply({
      answer: bad.length
        ? [
            `Tienes **${bad.length}** pedidos con problemas de entrega:`,
            ...bad
              .slice(0, 5)
              .map(
                (o) =>
                  `• ${o.number} · ${o.customer?.name ?? "cliente"} · ${o.shipments[0]?.carrier} (${o.shipments[0]?.status})`,
              ),
          ].join("\n")
        : "No hay guías con novedad ahora mismo. Todo avanza sin problemas.",
      links: bad.length ? [{ label: "Ver envíos", view: "envios" }] : [],
      sources: ["guías", "tracking"],
    });
  }

  if (/(aprob|pendiente|espera|atencion)/.test(q)) {
    return reply({
      answer: s.approvals.length
        ? [
            `Hay **${s.approvals.length}** cosas esperando tu decisión:`,
            ...s.approvals.slice(0, 5).map((a) => `• ${a.title}`),
          ].join("\n")
        : "No tienes nada pendiente: todo lo que podía resolver ya lo resolví.",
      links: [{ label: "Ir a Aprobaciones", view: "aprobaciones" }],
      sources: ["aprobaciones"],
    });
  }

  if (/(anuncio|campan|roas|publicidad|meta|tiktok|google ads|ads)/.test(q)) {
    const rows = s.campaigns
      .map((c) => ({ c, r: roas(s, c) }))
      .filter((x): x is { c: Snap["campaigns"][number]; r: number } => x.r !== null)
      .sort((a, b) => b.r - a.r);
    if (!rows.length)
      return reply({
        answer:
          "Aún no tengo campañas con gasto conocido, así que no puedo calcular el ROAS (prefiero decirte N/A que inventarlo).",
        links: [{ label: "Crear una campaña", view: "marketing" }],
        sources: ["campañas"],
      });
    const best = rows[0];
    const worst = rows.at(-1);
    return reply({
      answer: [
        `La que mejor rinde es **${best?.c.product}** (${best?.c.platform}) con ROAS ${best?.r.toFixed(1)}×.`,
        worst && worst.r < 1
          ? `⚠ **${worst.c.product}** (${worst.c.platform}) gasta más de lo que vende: ROAS ${worst.r.toFixed(1)}×. No la apagué: es tu decisión.`
          : "Ninguna campaña pierde dinero.",
        `Las campañas siempre nacen en pausa; activar es tuyo.`,
      ].join("\n"),
      kpis: rows
        .slice(0, 3)
        .map((x) => ({ label: x.c.product, value: `${x.r.toFixed(1)}×`, hint: x.c.platform })),
      links: [
        { label: "Ver campañas", view: "marketing" },
        { label: "Qué anuncio trajo qué venta", view: "reportes" },
      ],
      sources: ["campañas", "pedidos (utm)"],
    });
  }

  if (/(seo|tienda|google|visibilidad|auditor|diseno|conversion|arreglar)/.test(q)) {
    const a = s.audits[0];
    if (!a)
      return reply({
        answer: "Todavía no he auditado tu tienda. Puedo hacerlo en un minuto.",
        links: [{ label: "Auditar mi tienda", view: "tienda" }],
        sources: ["auditorías"],
      });
    const fixes = ((a.payload as { quickWins?: string[] })?.quickWins ?? []).slice(0, 3);
    return reply({
      answer: [
        `Tu última auditoría (${a.kind}) dio **${a.score ?? "N/A"} sobre 100**, medido en ${a.evaluated} de ${a.total} checks.`,
        ...fixes.map((f) => `• ${f}`),
      ].join("\n"),
      links: [{ label: "Ver auditoría completa", view: "tienda" }],
      sources: ["auditorías"],
    });
  }

  if (/(cliente|recompra|reactiv|inactiv|vip|segmento)/.test(q)) {
    const buyers = s.customers.filter((c) => c.orders.some((o) => o.status !== "cancelled"));
    const repeat = buyers.filter(
      (c) => c.orders.filter((o) => o.status !== "cancelled").length > 1,
    );
    const idle = buyers.filter((c) => {
      const last = Math.max(...c.orders.map((o) => o.createdAt.getTime()));
      return s.now - last > 60 * DAY && c.whatsappConsent && !c.optOutAt;
    });
    return reply({
      answer: [
        `Tienes **${s.customers.length}** clientes; ${repeat.length} ya recompraron.`,
        `• ${idle.length} llevan más de 60 días sin comprar y aceptaron WhatsApp: puedo escribirles (con tu aprobación).`,
      ].join("\n"),
      kpis: [
        { label: "Clientes", value: String(s.customers.length) },
        { label: "Recompraron", value: String(repeat.length) },
        { label: "Reactivables", value: String(idle.length) },
      ],
      links: [{ label: "Ir a Clientes", view: "clientes" }],
      sources: ["clientes", "pedidos"],
    });
  }

  if (/(transportadora|envio|flete|coordinadora|servientrega|interrapidisimo|envia)/.test(q)) {
    const by = new Map<string, { n: number; ok: number; cost: number }>();
    for (const x of s.shipments) {
      const a = by.get(x.carrier) ?? { n: 0, ok: 0, cost: 0 };
      a.n++;
      a.cost += x.total;
      if (x.status === "delivered") a.ok++;
      by.set(x.carrier, a);
    }
    const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
    return reply({
      answer: rows.length
        ? [
            `Enviaste **${s.shipments.length}** paquetes. Por transportadora:`,
            ...rows
              .slice(0, 5)
              .map(
                ([k, a]) =>
                  `• ${k}: ${a.n} envíos, ${pct(a.ok, a.n)} entregados, flete promedio ${cop(a.cost / a.n)}`,
              ),
          ].join("\n")
        : "Aún no hay envíos.",
      links: [{ label: "Ver envíos", view: "envios" }],
      sources: ["guías"],
    });
  }

  if (/(contraentrega|cobrar|recaudo|cod)/.test(q)) {
    const open = s.orders.filter(
      (o) => live(o) && o.payment === "cod" && !o.shipments.some((x) => x.status === "delivered"),
    );
    return reply({
      answer: `Hay **${cop(open.reduce((a, o) => a + o.total, 0))}** por cobrar en ${open.length} pedidos de contraentrega que aún no se entregan.`,
      links: [{ label: "Ver pedidos", view: "pedidos" }],
      sources: ["pedidos"],
    });
  }

  if (/(producto|catalogo|margen|empujar|vende mas|mas vendido)/.test(q)) {
    const by = new Map<string, number>();
    for (const o of s.orders.filter(live))
      for (const l of (o.lines as Array<{
        title?: string;
        quantity?: number;
        unitPrice?: number;
      }>) ?? [])
        by.set(l.title ?? "?", (by.get(l.title ?? "?") ?? 0) + (l.quantity ?? 1));
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return reply({
      answer: top.length
        ? [`Lo que más se vende (90 días):`, ...top.map(([k, n]) => `• ${k}: ${n} unidades`)].join(
            "\n",
          )
        : "Aún no hay ventas para decirte qué empujar.",
      links: [{ label: "Qué empujar", view: "marketing" }],
      sources: ["pedidos", "catálogo"],
    });
  }

  return reply({
    answer:
      "Puedo contarte cómo van tus **ventas**, tus **envíos y novedades**, tus **anuncios** (qué trajo qué venta), tu **tienda y SEO**, tus **clientes** y lo que espera tu **aprobación**. También busco un pedido por su número (por ejemplo «¿dónde está el #1186?»).",
    suggestions: SUGGEST.slice(0, 4),
  });
}

function roas(s: Snap, c: Snap["campaigns"][number]): number | null {
  const m = (c.metrics ?? null) as { spend?: number } | null;
  const p = c.payload as { utmCampaign?: string };
  if (!m?.spend || !p.utmCampaign) return null;
  const rev = s.orders
    .filter(
      (o) => live(o) && ((o.utm ?? {}) as Record<string, string>).utm_campaign === p.utmCampaign,
    )
    .reduce((a, o) => a + o.total, 0);
  return rev / m.spend;
}

/** Contexto que ve Claude: cifras ya calculadas de la tienda (nada de contraseñas, teléfonos ni llaves). */
function contextOf(s: Snap, base: AssistantReply) {
  const live = s.orders.filter((o) => o.status !== "cancelled");
  const byProduct = new Map<string, number>();
  for (const o of live)
    for (const l of (o.lines as Array<{ title?: string; quantity?: number }>) ?? [])
      byProduct.set(l.title ?? "?", (byProduct.get(l.title ?? "?") ?? 0) + (l.quantity ?? 1));
  const byCarrier = new Map<string, { envios: number; entregados: number; novedades: number }>();
  for (const x of s.shipments) {
    const c = byCarrier.get(x.carrier) ?? { envios: 0, entregados: 0, novedades: 0 };
    c.envios++;
    if (x.status === "delivered") c.entregados++;
    if (x.status === "incident") c.novedades++;
    byCarrier.set(x.carrier, c);
  }
  const buyers = s.customers.filter((c) => c.orders.length);
  return {
    hoy: new Date(s.now).toISOString().slice(0, 10),
    ventas: { hoy: sales(s, 1), semana: sales(s, 7), mes: sales(s, 30), noventaDias: sales(s, 90) },
    pedidosPorEstado: Object.fromEntries(
      [...new Set(s.orders.map((o) => o.status))].map((k) => [
        k,
        s.orders.filter((o) => o.status === k).length,
      ]),
    ),
    contraentregaPorCobrar: live
      .filter((o) => o.payment === "cod" && !o.shipments.some((x) => x.status === "delivered"))
      .reduce((a, o) => a + o.total, 0),
    productosMasVendidos: [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    transportadoras: Object.fromEntries(byCarrier),
    aprobacionesPendientes: s.approvals.map((a) => a.title),
    ultimosPedidos: s.orders.slice(0, 8).map((o) => ({
      numero: o.number,
      total: o.total,
      pago: o.payment,
      estado: o.status,
      guia: o.shipments[0]?.status ?? null,
    })),
    campanas: s.campaigns.map((c) => ({
      producto: c.product,
      plataforma: c.platform,
      estado: c.status,
      roas: roas(s, c),
    })),
    auditorias: s.audits.slice(0, 3).map((a) => ({
      tipo: a.kind,
      puntaje: a.score,
      medidos: a.evaluated,
      total: a.total,
      arreglarPrimero: ((a.payload as { quickWins?: string[] })?.quickWins ?? []).slice(0, 3),
    })),
    clientes: { total: s.customers.length, conCompras: buyers.length },
    respuestaDeReglas: base.answer,
  };
}

const AGENT_SYSTEM =
  "Eres el agente de Traxo: el analista y operador del e-commerce colombiano de la persona que te escribe. " +
  "Responde en español, en primera persona, claro y breve (máximo ~120 palabras). Usa SOLO las cifras del contexto; si un dato falta, di N/A y nunca lo inventes. " +
  "Montos en pesos colombianos ($ 125.000). Compara, explica el porqué y cierra con UNA recomendación concreta cuando sirva. " +
  "No ejecutes ni prometas acciones: sugiérelas y recuerda que gastar, publicar o borrar lo aprueba la persona. " +
  "Formato: viñetas «• » si hace falta y **negritas** para cifras clave.";

/** Con ANTHROPIC_API_KEY, Claude redacta la respuesta con el mismo contexto y el hilo de la conversación. Sin cupo o si falla, queda la de reglas. */
async function withClaude(
  storeId: string,
  s: Snap,
  question: string,
  base: AssistantReply,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AssistantReply> {
  const text = await askClaude(storeId, {
    system: AGENT_SYSTEM,
    feature: "Asistente del panel",
    history,
    user: `Pregunta de la persona: ${question}\n\n<datos>\n${JSON.stringify(contextOf(s, base))}\n</datos>`,
    maxTokens: 500,
  });
  return text ? { ...base, answer: text, mode: "claude" } : base;
}

export function registerAssistantApi(app: Hono, rt: Runtime): void {
  const sid = (c: Context): string => storeOf(c, rt.storeId);
  app.get("/api/assistant/suggestions", (c) =>
    c.json({ suggestions: SUGGEST, llm: aiEnabled(), ai: aiUsage(sid(c)) }),
  );
  app.post("/api/assistant/ask", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      question?: string;
      history?: Array<{ role?: string; content?: string }>;
    };
    const question = (body.question ?? "").trim().slice(0, 500);
    if (!question) return c.json({ ok: false, message: "Escribe una pregunta." }, 400);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((h) => (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .slice(-6)
      .map((h) => ({
        role: h.role as "user" | "assistant",
        content: (h.content as string).slice(0, 800),
      }));
    const s = await snapshot(rt.db, sid(c));
    const base = answer(s, question);
    return c.json(await withClaude(sid(c), s, question, base, history));
  });
}
