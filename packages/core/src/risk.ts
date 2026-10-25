// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Order } from "./domain.ts";
import { addressLooksCompleteHint } from "./risk-hints.ts";

export type RiskLevel = "bajo" | "medio" | "alto";
export type RiskResult = { score: number; level: RiskLevel; reasons: string[] };

export type RiskContext = {
  /** Pedidos anteriores del mismo cliente (entregados, devueltos, cancelados). */
  history?: { delivered: number; returned: number; cancelled: number };
  /** Si es un municipio lejano (Costa, Amazonía…). */
  farCity?: boolean;
};

/**
 * Puntaje de riesgo de una contraentrega (0–100), por reglas auditables. No es un modelo: cada punto tiene su razón.
 * Se usa para decidir si hay que confirmar con el cliente antes de gastar en una guía.
 */
export function riskScore(
  order: Pick<Order, "payment" | "total" | "address" | "lines">,
  ctx: RiskContext = {},
): RiskResult {
  if (order.payment !== "cod")
    return { score: 0, level: "bajo", reasons: ["Pedido prepagado: no hay recaudo en riesgo."] };
  let score = 10;
  const reasons: string[] = ["Contraentrega: el cobro depende de que el cliente reciba."];
  const h = ctx.history;
  if (!h || h.delivered + h.returned + h.cancelled === 0) {
    score += 15;
    reasons.push("Cliente nuevo, sin historial.");
  } else {
    if (h.returned + h.cancelled > 0) {
      score += Math.min(40, 25 * (h.returned + h.cancelled));
      reasons.push(
        `${h.returned + h.cancelled} ${h.returned + h.cancelled === 1 ? "pedido devuelto o cancelado antes" : "pedidos devueltos o cancelados antes"}.`,
      );
    }
    if (h.delivered >= 2 && h.returned + h.cancelled === 0) {
      score -= 10;
      reasons.push("Cliente recurrente que siempre recibió.");
    }
  }
  if (order.total >= 250000) {
    score += 25;
    reasons.push("Valor alto a recaudar (desde $ 250.000).");
  } else if (order.total >= 150000) {
    score += 12;
    reasons.push("Valor medio-alto a recaudar (desde $ 150.000).");
  }
  if (!addressLooksCompleteHint(order.address.street)) {
    score += 25;
    reasons.push("La dirección no trae vía y número claros.");
  }
  if (ctx.farCity) {
    score += 10;
    reasons.push("Municipio lejano: más días y más novedades.");
  }
  if (order.lines.reduce((s, l) => s + l.quantity, 0) >= 4) {
    score += 8;
    reasons.push("Muchas unidades en un solo pedido.");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, level: score >= 55 ? "alto" : score >= 30 ? "medio" : "bajo", reasons };
}
