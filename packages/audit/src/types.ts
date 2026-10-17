export type AuditKind = "seo" | "diseno";
export type CheckStatus = "pass" | "warn" | "fail" | "na";
export type Impact = "alto" | "medio" | "bajo";

export type Check = {
  id: string;
  group: string;
  title: string;
  status: CheckStatus;
  impact: Impact;
  /** El dato concreto que disparó el resultado. Sin dato = "na". */
  evidence: string;
  /** Qué hacer, en una frase. */
  fix?: string;
};

export type AuditReport = {
  kind: AuditKind;
  /** "sample" = informe de ejemplo para la demo; "live" = se midió sobre una URL real. */
  source: "sample" | "live";
  url: string;
  generatedAt: string;
  /** Puntaje 0–100 calculado SOLO sobre los checks evaluados (los N/A no cuentan). Null si no se evaluó ninguno. */
  score: number | null;
  evaluated: number;
  total: number;
  checks: Check[];
  quickWins: string[];
  notes: string[];
};

const W: Record<Impact, number> = { alto: 3, medio: 2, bajo: 1 };
const V: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, na: 0 };

/** Un score honesto: los N/A se excluyen del total posible (no penalizan ni regalan) y se dice sobre cuántos checks se calculó. */
export function scoreChecks(checks: Check[]): {
  score: number | null;
  evaluated: number;
  total: number;
} {
  const ev = checks.filter((c) => c.status !== "na");
  const max = ev.reduce((s, c) => s + W[c.impact], 0);
  const got = ev.reduce((s, c) => s + W[c.impact] * V[c.status], 0);
  return {
    score: max === 0 ? null : Math.round((got / max) * 100),
    evaluated: ev.length,
    total: checks.length,
  };
}

const ORDER: Record<Impact, number> = { alto: 0, medio: 1, bajo: 2 };

/** Lo que hay que arreglar primero: fallos antes que avisos y, dentro de cada uno, lo de mayor impacto. */
export function quickWinsOf(checks: Check[], n = 4): string[] {
  return checks
    .filter((c) => (c.status === "fail" || c.status === "warn") && c.fix)
    .sort(
      (a, b) =>
        Number(b.status === "fail") - Number(a.status === "fail") ||
        ORDER[a.impact] - ORDER[b.impact],
    )
    .slice(0, n)
    .map((c) => `${c.title}: ${c.fix}`);
}

export function buildReport(
  kind: AuditKind,
  source: AuditReport["source"],
  url: string,
  checks: Check[],
  notes: string[] = [],
  at = new Date(),
): AuditReport {
  return {
    kind,
    source,
    url,
    generatedAt: at.toISOString(),
    ...scoreChecks(checks),
    checks,
    quickWins: quickWinsOf(checks),
    notes,
  };
}
