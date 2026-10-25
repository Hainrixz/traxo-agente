// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { randomUUID } from "node:crypto";
import type { Db } from "@traxo/db";

/**
 * Medición del uso agéntico. Lo que ya queda registrado (acciones del agente, mensajes, biblioteca) se lee directo;
 * aquí solo se anota lo que nadie guardaba: cada llamada a Claude y los créditos de imagen/video.
 */
export type UsageKind = "ia" | "imagen" | "video";

export type UsageInput = {
  kind: UsageKind;
  /** Para qué se usó, en una frase corta: «Asistente», «Respuesta a cliente», «Copy de anuncios»… */
  feature: string;
  tokensIn?: number;
  tokensOut?: number;
  credits?: number;
};

type Sink = (storeId: string, u: UsageInput) => void;
let sink: Sink | undefined;
export const setUsageSink = (s: Sink | undefined): void => {
  sink = s;
};
export const reportUsage = (storeId: string, u: UsageInput): void => sink?.(storeId, u);

const rate = (name: string, d: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
/** Precios por millón de tokens y dólar→peso: son estimados y se pueden ajustar con variables de entorno. */
export const pricing = () => ({
  usdPerMtokIn: rate("TRAXO_AI_USD_PER_MTOK_IN", 3),
  usdPerMtokOut: rate("TRAXO_AI_USD_PER_MTOK_OUT", 15),
  usdPerCredit: rate("TRAXO_USD_PER_CREDIT", 0.05),
  copPerUsd: rate("TRAXO_USD_COP", 4000),
});

export const costOf = (u: UsageInput): number => {
  const p = pricing();
  return (
    ((u.tokensIn ?? 0) * p.usdPerMtokIn + (u.tokensOut ?? 0) * p.usdPerMtokOut) / 1_000_000 +
    (u.credits ?? 0) * p.usdPerCredit
  );
};

/** Conecta la medición con la base de datos. Nunca rompe lo que se estaba haciendo. */
export function attachUsage(db: Db): void {
  setUsageSink((storeId, u) => {
    db.prisma.usageEvent
      .create({
        data: {
          id: `use_${randomUUID().slice(0, 12)}`,
          storeId,
          kind: u.kind,
          feature: u.feature.slice(0, 60),
          tokensIn: Math.max(0, Math.round(u.tokensIn ?? 0)),
          tokensOut: Math.max(0, Math.round(u.tokensOut ?? 0)),
          credits: Math.max(0, Math.round(u.credits ?? 0)),
          costUsd: costOf(u),
        },
      })
      .catch(() => {});
  });
}
