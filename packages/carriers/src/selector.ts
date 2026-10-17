import { formatCOP, type Quote, quoteTotal, type StoreSettings } from "@traxo/core";

const VIA: Record<string, string> = {
  "envia-com": "por Envia.com",
  "99envios": "por 99envios",
  coordinadora: "directo",
  interrapidisimo: "directo",
  servientrega: "directo",
  "envia-co": "directo",
};

/** Cómo se dice la vía en una frase: "por Envia.com" o "directo". */
export const viaLabel = (provider: string): string => VIA[provider] ?? `por ${provider}`;

export type Reliability = Record<string, number>;

/** Tasa histórica de entregas sin novedad por transportadora (0–1). Se alimenta de la BD; sin dato, 0,9. */
export const DEFAULT_RELIABILITY = 0.9;

export type ScoredQuote = Quote & { total: number; score: number };

export type Selection = {
  winner: ScoredQuote;
  ranking: ScoredQuote[];
  /** Frase en primera persona, lista para mostrar. */
  explanation: string;
};

export type SelectOptions = {
  codAmount: number;
  settings: Pick<StoreSettings, "weights" | "preferredProvider">;
  reliability?: Reliability;
};

/**
 * Elige la mejor cotización: descarta las que no cubren contraentrega cuando hay que cobrar,
 * puntúa costo total, días y confiabilidad, y si la misma transportadora llega por dos vías, queda la más barata.
 */
export function selectQuote(quotes: Quote[], opts: SelectOptions): Selection | undefined {
  const usable = quotes.filter((q) => opts.codAmount === 0 || q.supportsCod);
  if (usable.length === 0) return undefined;

  // Misma transportadora por varias vías → la más barata (en empate, la vía preferida de la tienda).
  const best = new Map<string, Quote>();
  for (const q of usable) {
    const prev = best.get(q.carrier);
    const better =
      !prev ||
      quoteTotal(q) < quoteTotal(prev) ||
      (quoteTotal(q) === quoteTotal(prev) && q.provider === opts.settings.preferredProvider);
    if (better) best.set(q.carrier, q);
  }
  const unique = [...best.values()];

  const totals = unique.map(quoteTotal);
  const minT = Math.min(...totals);
  const maxT = Math.max(...totals);
  const days = unique.map((q) => q.businessDays);
  const minD = Math.min(...days);
  const maxD = Math.max(...days);
  const norm = (v: number, lo: number, hi: number): number =>
    hi === lo ? 1 : 1 - (v - lo) / (hi - lo);
  const w = opts.settings.weights;

  const ranking: ScoredQuote[] = unique
    .map((q) => {
      const rel = opts.reliability?.[q.carrier] ?? DEFAULT_RELIABILITY;
      const total = quoteTotal(q);
      const score =
        w.cost * norm(total, minT, maxT) +
        w.speed * norm(q.businessDays, minD, maxD) +
        w.reliability * rel +
        (q.provider === opts.settings.preferredProvider ? 0.01 : 0);
      return { ...q, total, score: Math.round(score * 1000) / 1000 };
    })
    .sort((a, b) => b.score - a.score);

  const winner = ranking[0] as ScoredQuote;
  const second = ranking[1];
  let explanation = `Elegí ${winner.carrier} ${viaLabel(winner.provider)}: ${formatCOP(winner.total)} en ${winner.businessDays} ${winner.businessDays === 1 ? "día hábil" : "días hábiles"}.`;
  if (second) {
    const diff = second.total - winner.total;
    const dd = second.businessDays - winner.businessDays;
    const bits: string[] = [];
    if (diff > 0) bits.push(`${formatCOP(diff)} menos`);
    if (diff < 0) bits.push(`${formatCOP(-diff)} más`);
    if (dd > 0) bits.push(`${dd} ${dd === 1 ? "día" : "días"} más rápido`);
    if (dd < 0) bits.push(`${-dd} ${dd === -1 ? "día" : "días"} más lento`);
    if (bits.length) explanation += ` Frente a ${second.carrier}: ${bits.join(" y ")}.`;
  }
  if (opts.codAmount > 0)
    explanation += ` Incluye ${formatCOP(winner.codCommission)} de comisión de recaudo.`;
  return { winner, ranking, explanation };
}
