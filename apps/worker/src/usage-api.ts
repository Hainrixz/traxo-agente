// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Db } from "@traxo/db";
import type { Context, Hono } from "hono";
import { aiUsage } from "./ai.ts";
import { storeOf } from "./auth.ts";
import type { Runtime } from "./runtime.ts";
import { pricing } from "./usage.ts";

/**
 * Minutos de trabajo manual que ahorra cada acción automática. Son ESTIMADOS y se muestran como tales:
 * sirven para dimensionar el ahorro, no para facturar. Se ajustan con TRAXO_HOUR_COP (valor de la hora).
 */
export const MINUTES_SAVED: Record<string, { label: string; minutes: number }> = {
  "order.received": { label: "Pedidos recibidos y validados", minutes: 1 },
  "quotes.received": { label: "Cotizaciones comparadas entre transportadoras", minutes: 6 },
  "shipment.created": { label: "Guías generadas", minutes: 5 },
  "fulfillment.written": { label: "Guías escritas en la tienda", minutes: 2 },
  "message.sent": { label: "Mensajes enviados a clientes", minutes: 2 },
  "tracking.updated": { label: "Estados de envío seguidos", minutes: 1.5 },
  "incident.resolved": { label: "Novedades resueltas", minutes: 10 },
  "confirmation.requested": { label: "Confirmaciones de contraentrega", minutes: 3 },
  "payment.link": { label: "Links de pago creados", minutes: 3 },
  "marketing.draft": { label: "Borradores de campaña", minutes: 20 },
  "audit.done": { label: "Auditorías de tienda", minutes: 25 },
};
/** Lo que pasa a una persona: cuenta contra el porcentaje de automatización. */
const HUMAN_KINDS = new Set(["approval.requested"]);

const dayKey = (d: Date): string =>
  new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
const round = (n: number, k = 2): number => Math.round(n * 10 ** k) / 10 ** k;

export async function buildUsage(db: Db, storeId: string, daysBack: number, now = new Date()) {
  const days = Math.min(Math.max(Math.round(daysBack) || 30, 1), 90);
  const since = new Date(now.getTime() - days * 86_400_000);
  const p = pricing();
  const cop = (usd: number): number => Math.round(usd * p.copPerUsd);

  const [runs, msgs, use, media, orders, approvals] = await Promise.all([
    db.prisma.agentRun.findMany({
      where: { storeId, at: { gte: since } },
      select: { kind: true, at: true },
    }),
    db.prisma.message.findMany({
      where: { direction: "out", at: { gte: since }, conversation: { storeId } },
      select: { at: true, simulated: true, conversation: { select: { channel: true } } },
    }),
    db.prisma.usageEvent.findMany({ where: { storeId, at: { gte: since } } }),
    db.prisma.mediaAsset.findMany({
      where: { storeId, createdAt: { gte: since }, source: { in: ["higgsfield", "generado"] } },
      select: { kind: true, source: true, createdAt: true },
    }),
    db.prisma.order.count({ where: { storeId, createdAt: { gte: since } } }),
    db.prisma.approval.count({ where: { storeId, createdAt: { gte: since } } }),
  ]);

  // Serie diaria con todos los días (también los vacíos) para que la gráfica no salte.
  const series = new Map<string, { ai: number; actions: number; messages: number; cost: number }>();
  for (let i = days - 1; i >= 0; i--)
    series.set(dayKey(new Date(now.getTime() - i * 86_400_000)), {
      ai: 0,
      actions: 0,
      messages: 0,
      cost: 0,
    });
  const bump = (
    d: Date,
    f: (s: { ai: number; actions: number; messages: number; cost: number }) => void,
  ) => {
    const s = series.get(dayKey(d));
    if (s) f(s);
  };

  // --- IA ---
  const ia = use.filter((u) => u.kind === "ia");
  const byFeature = new Map<string, { calls: number; tokens: number; usd: number }>();
  for (const u of ia) {
    const f = byFeature.get(u.feature) ?? { calls: 0, tokens: 0, usd: 0 };
    f.calls++;
    f.tokens += u.tokensIn + u.tokensOut;
    f.usd += u.costUsd;
    byFeature.set(u.feature, f);
    bump(u.at, (s) => {
      s.ai++;
      s.cost += u.costUsd;
    });
  }
  const iaUsd = ia.reduce((a, u) => a + u.costUsd, 0);

  // --- Créativos (Higgsfield): conteo real de la biblioteca + créditos anotados ---
  const credUse = use.filter((u) => u.kind !== "ia");
  const credits = credUse.reduce((a, u) => a + u.credits, 0);
  const creditsUsd = credUse.reduce((a, u) => a + u.costUsd, 0);
  for (const u of credUse) bump(u.at, (s) => (s.cost += u.costUsd));
  const mediaBy = {
    imagenes: media.filter((m) => m.kind === "image").length,
    videos: media.filter((m) => m.kind === "video").length,
  };

  // --- Mensajes del agente por canal ---
  const channels = new Map<string, { sent: number; simulated: number }>();
  for (const m of msgs) {
    const ch = m.conversation.channel;
    const c = channels.get(ch) ?? { sent: 0, simulated: 0 };
    c.sent++;
    if (m.simulated) c.simulated++;
    channels.set(ch, c);
    bump(m.at, (s) => s.messages++);
  }

  // --- Acciones del agente ---
  const actions = new Map<string, number>();
  let human = 0;
  for (const r of runs) {
    if (HUMAN_KINDS.has(r.kind)) human++;
    if (!MINUTES_SAVED[r.kind]) continue;
    actions.set(r.kind, (actions.get(r.kind) ?? 0) + 1);
    bump(r.at, (s) => s.actions++);
  }
  const autoTotal = [...actions.values()].reduce((a, n) => a + n, 0);
  const minutes = [...actions].reduce((a, [k, n]) => a + n * (MINUTES_SAVED[k]?.minutes ?? 0), 0);
  const hours = minutes / 60;
  const hourCop =
    Number(process.env.TRAXO_HOUR_COP) > 0 ? Number(process.env.TRAXO_HOUR_COP) : 10_000;
  const savedCop = Math.round(hours * hourCop);

  const totalUsd = iaUsd + creditsUsd;
  const totalCop = cop(totalUsd);
  const aiCalls = ia.length;
  const budgetUsd =
    Number(process.env.TRAXO_AI_BUDGET_USD_MONTH) > 0
      ? Number(process.env.TRAXO_AI_BUDGET_USD_MONTH)
      : null;

  const topFeature = [...byFeature].sort((a, b) => b[1].usd - a[1].usd)[0];
  const tips: string[] = [];
  if (!aiCalls && !credits)
    tips.push(
      "Todavía no gastaste nada en IA ni en créditos: todo lo que hizo el agente fue con reglas.",
    );
  if (topFeature && totalUsd > 0 && topFeature[1].usd / iaUsd > 0.6 && ia.length > 5)
    tips.push(
      `«${topFeature[0]}» concentra el ${Math.round((topFeature[1].usd / iaUsd) * 100)} % del gasto en IA. Si quieres bajarlo, ahí está el mayor ahorro.`,
    );
  if (budgetUsd && totalUsd > budgetUsd * 0.8)
    tips.push("Vas por encima del 80 % del presupuesto mensual de IA que definiste.");

  return {
    days,
    since: since.toISOString(),
    estimated: true,
    cost: {
      totalCop,
      aiCop: cop(iaUsd),
      creditsCop: cop(creditsUsd),
      perOrderCop: orders > 0 ? Math.round(totalCop / orders) : null,
      budgetCop: budgetUsd ? cop(budgetUsd) : null,
      budgetUsedPct: budgetUsd ? round((totalUsd / budgetUsd) * 100, 0) : null,
    },
    value: {
      automatedActions: autoTotal,
      hoursSaved: round(hours, 1),
      savedCop,
      /** Cuántos pesos de trabajo se ahorran por cada peso gastado; null si no hubo gasto. */
      returnPerPeso: totalCop > 0 ? round(savedCop / totalCop, 1) : null,
      automationPct:
        autoTotal + human > 0 ? Math.round((autoTotal / (autoTotal + human)) * 100) : null,
      humanSteps: human,
      approvals,
      /** Qué parte de las decisiones se resolvió con reglas, sin gastar IA. */
      withoutAiPct:
        autoTotal + aiCalls > 0 ? Math.round((autoTotal / (autoTotal + aiCalls)) * 100) : null,
    },
    ai: {
      calls: aiCalls,
      tokensIn: ia.reduce((a, u) => a + u.tokensIn, 0),
      tokensOut: ia.reduce((a, u) => a + u.tokensOut, 0),
      byFeature: [...byFeature]
        .map(([feature, v]) => ({ feature, calls: v.calls, tokens: v.tokens, cop: cop(v.usd) }))
        .sort((a, b) => b.calls - a.calls),
      today: aiUsage(storeId),
    },
    messages: {
      total: msgs.length,
      simulated: msgs.filter((m) => m.simulated).length,
      byChannel: [...channels]
        .map(([channel, v]) => ({ channel, ...v }))
        .sort((a, b) => b.sent - a.sent),
    },
    creatives: { ...mediaBy, credits, cop: cop(creditsUsd) },
    actions: [...actions]
      .map(([kind, count]) => ({
        kind,
        label: MINUTES_SAVED[kind]?.label ?? kind,
        count,
        minutes: round(count * (MINUTES_SAVED[kind]?.minutes ?? 0), 0),
      }))
      .sort((a, b) => b.minutes - a.minutes),
    assumptions: {
      hourCop,
      minutesPerAction: Object.fromEntries(
        Object.entries(MINUTES_SAVED).map(([k, v]) => [k, v.minutes]),
      ),
      pricing: p,
    },
    series: [...series].map(([date, s]) => ({
      date,
      ai: s.ai,
      actions: s.actions,
      messages: s.messages,
      costCop: cop(s.cost),
    })),
    tips,
    orders,
  };
}

export type UsageReport = Awaited<ReturnType<typeof buildUsage>>;

export function registerUsageApi(app: Hono, rt: Runtime): void {
  const sid = (c: Context): string => storeOf(c, rt.storeId);
  app.get("/api/usage", async (c) =>
    c.json(await buildUsage(rt.db, sid(c), Number(c.req.query("days") ?? 30))),
  );
}
