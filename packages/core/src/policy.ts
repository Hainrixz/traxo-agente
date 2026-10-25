// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { Autonomy, Quote, StoreSettings } from "./domain.ts";
import { formatCOP } from "./money.ts";

export type PolicyDecision = { allowed: boolean; reason: string };

export function quoteTotal(q: Pick<Quote, "freight" | "codCommission">): number {
  return q.freight + q.codCommission;
}

/** ¿Puede el agente generar la guía solo, sin pedir aprobación? */
export function canAutoCreateShipment(
  settings: Pick<StoreSettings, "autonomy" | "maxAutoShipmentCost">,
  chosen: Pick<Quote, "freight" | "codCommission">,
): PolicyDecision {
  if (settings.autonomy === 0) {
    return { allowed: false, reason: "Autonomía 0: toda guía necesita tu aprobación." };
  }
  const total = quoteTotal(chosen);
  if (total > settings.maxAutoShipmentCost) {
    return {
      allowed: false,
      reason: `La guía cuesta ${formatCOP(total)}, más que tu tope automático de ${formatCOP(settings.maxAutoShipmentCost)}.`,
    };
  }
  return { allowed: true, reason: "Dentro de tu tope automático." };
}

/** Gastar en anuncios o créditos de Higgsfield siempre pide aprobación, en cualquier autonomía. */
export function canSpendOnMarketing(_autonomy: Autonomy): PolicyDecision {
  return {
    allowed: false,
    reason: "El gasto en anuncios y en créditos siempre pide tu aprobación.",
  };
}

/** Las campañas nacen SIEMPRE en pausa. */
export const CAMPAIGN_INITIAL_STATUS = "PAUSED" as const;
