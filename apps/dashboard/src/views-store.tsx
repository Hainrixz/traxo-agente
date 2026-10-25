// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { useEffect, useRef, useState } from "react";
import { post, useResource } from "./api.ts";
import { Ring } from "./charts.tsx";
import { EmptyState } from "./components.tsx";
import { dateEs } from "./format.ts";
import type { AuditReport, AuditsResp, Check } from "./types.ts";
import { Banner, Button, Icon, SampleTag, Tabs, type Tone, ToneBadge } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const STATUS: Record<Check["status"], { tone: Tone; label: string }> = {
  pass: { tone: "success", label: "Bien" },
  warn: { tone: "attention", label: "Mejorar" },
  fail: { tone: "critical", label: "Falla" },
  na: { tone: "neutral", label: "N/A" },
};
const IMPACT: Record<Check["impact"], string> = {
  alto: "Impacto alto",
  medio: "Impacto medio",
  bajo: "Impacto bajo",
};
const STEPS: Record<"seo" | "diseno", string[]> = {
  seo: [
    "Leyendo el HTML de la tienda…",
    "Revisando títulos y descripciones…",
    "Buscando datos estructurados (JSON-LD)…",
    "Comprobando robots.txt y sitemap…",
    "Calculando el puntaje…",
  ],
  diseno: [
    "Leyendo la estructura de la página…",
    "Buscando el botón de compra y las señales de confianza…",
    "Revisando imágenes y peso…",
    "Comprobando WhatsApp y precios en COP…",
    "Calculando el puntaje…",
  ],
};

export function TiendaSeo({ ctx }: { ctx: Ctx }) {
  const { data, reload } = useResource<AuditsResp>("/api/audits", ctx.tick);
  const [kind, setKind] = useState<"seo" | "diseno">("seo");
  const [running, setRunning] = useState<"seo" | "diseno" | null>(null);
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState("all");
  const [url, setUrl] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);

  const run = async (k: "seo" | "diseno", withUrl?: string) => {
    setKind(k);
    setRunning(k);
    setStep(0);
    // La lectura es instantánea; el avance paso a paso es para que se entienda qué revisa.
    timer.current = window.setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS[k].length - 1)),
      420,
    );
    const [r] = await Promise.all([
      post<{ ok: boolean; message?: string }>("/api/audits/run", {
        kind: k,
        url: withUrl || undefined,
      }),
      new Promise((res) => setTimeout(res, 2100)),
    ]);
    clearInterval(timer.current);
    setRunning(null);
    ctx.toast(
      r.ok
        ? `Auditoría de ${k === "seo" ? "SEO" : "diseño"} lista`
        : (r.message ?? "No se pudo auditar"),
    );
    reload();
    ctx.refresh();
  };

  const rep = data?.[kind] ?? null;
  const prev = data?.history[kind].at(-2);
  const seo = data?.seo;
  const dis = data?.diseno;
  const checks = (rep?.checks ?? []).filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Tienda y SEO</h1>
          <p className="lead">
            Reviso tu tienda como la vería Google y como la vería un cliente en el teléfono. Si no
            puedo medir algo, lo digo (N/A) en vez de inventar.
          </p>
        </div>
      </div>

      {(seo?.source === "sample" || dis?.source === "sample") && (
        <Banner tone="neutral">
          Los informes de la demo son <strong>de ejemplo</strong>: no se midió una tienda real. Con
          tu tienda conectada, la auditoría lee su página pública.
        </Banner>
      )}

      <div className="two eq">
        {(["seo", "diseno"] as const).map((k) => {
          const r = data?.[k] ?? null;
          const last = data?.history[k].at(-2);
          return (
            <section
              key={k}
              className={`card audit ${kind === k ? "sel" : ""}`}
              aria-labelledby={`au-${k}`}
              data-tour={`audit-${k}`}
            >
              <div className="row between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                <div>
                  <h2 id={`au-${k}`}>
                    {k === "seo" ? "SEO y visibilidad en IA" : "Diseño y conversión"}
                  </h2>
                  {r && (
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      {r.source === "sample" && <SampleTag />}
                      <span className="caption">{dateEs(r.generatedAt)}</span>
                    </div>
                  )}
                </div>
              </div>
              {r ? (
                <div className="audit-body">
                  <Ring
                    value={r.score}
                    caption={`calculado sobre ${r.evaluated} de ${r.total} checks`}
                  />
                  <div className="stack tight" style={{ minWidth: 0 }}>
                    <p style={{ margin: 0 }}>
                      <strong className="num">{r.score ?? "N/A"}</strong> sobre 100, calculado sobre{" "}
                      <strong>{r.evaluated}</strong> de {r.total} checks.
                      {r.total - r.evaluated > 0 && (
                        <span className="muted">
                          {" "}
                          {r.total - r.evaluated} no se pudieron medir (N/A) y no cuentan.
                        </span>
                      )}
                    </p>
                    {last?.score != null && r.score != null && (
                      <ToneBadge tone={r.score >= last.score ? "success" : "critical"}>
                        {r.score >= last.score ? "+" : "−"}
                        {Math.abs(r.score - last.score)} puntos desde la última auditoría
                      </ToneBadge>
                    )}
                    <div className="row">
                      <Button sm variant={kind === k ? "primary" : ""} onClick={() => setKind(k)}>
                        Ver detalle
                      </Button>
                      <Button
                        sm
                        icon="refresh"
                        disabled={running !== null}
                        onClick={() => run(k)}
                        data-tour={`run-audit-${k}`}
                      >
                        Volver a auditar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="activity"
                  title="Todavía no he auditado"
                  text="Tarda unos segundos. Leo el HTML público; no cambio nada de tu tienda."
                  action={
                    <Button
                      variant="agent"
                      icon="play"
                      disabled={running !== null}
                      onClick={() => run(k)}
                      data-tour={`run-audit-${k}`}
                    >
                      Auditar {k === "seo" ? "SEO" : "diseño"}
                    </Button>
                  }
                />
              )}
            </section>
          );
        })}
      </div>

      {running && (
        <section className="card" aria-live="polite" aria-label="Auditoría en curso">
          <div className="row">
            <span className="pulse on" style={{ color: "var(--agent-line)" }}>
              <Icon name="spark" size={18} />
            </span>
            <strong>{STEPS[running][step]}</strong>
          </div>
          <div className="prog" aria-hidden="true">
            <div style={{ transform: `scaleX(${(step + 1) / STEPS[running].length})` }} />
          </div>
        </section>
      )}

      {rep && !running && (
        <>
          {rep.quickWins.length > 0 && (
            <section className="card proposal" aria-labelledby="qw-h">
              <div className="row">
                <Icon name="spark" size={18} />
                <h2 id="qw-h">Empieza por aquí</h2>
              </div>
              <ol className="why" style={{ listStyle: "decimal", paddingLeft: 22 }}>
                {rep.quickWins.map((q) => (
                  <li key={q} className="break">
                    {q}
                  </li>
                ))}
              </ol>
              <p className="caption" style={{ margin: 0 }}>
                Ordenados por impacto: primero lo que más afecta cómo te encuentran y cuánto
                convierte la tienda.
              </p>
            </section>
          )}
          <section className="card" aria-labelledby="det-h">
            <div className="row between" style={{ marginBottom: 12 }}>
              <h2 id="det-h">Detalle · {kind === "seo" ? "SEO" : "Diseño"}</h2>
              <Tabs
                label="Filtrar checks"
                value={filter}
                onChange={setFilter}
                items={[
                  ["all", "Todos"],
                  ["fail", "Fallas"],
                  ["warn", "Mejorar"],
                  ["pass", "Bien"],
                  ["na", "N/A"],
                ]}
              />
            </div>
            <ul className="checks">
              {checks.map((c) => (
                <li key={c.id} className="check">
                  <ToneBadge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</ToneBadge>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{c.title}</strong>
                      <span className="caption">
                        {c.group} · {IMPACT[c.impact]}
                      </span>
                    </div>
                    <div className="muted break">{c.evidence}</div>
                    {c.fix && c.status !== "pass" && c.status !== "na" && (
                      <div className="fix break">
                        <Icon name="check" size={14} /> {c.fix}
                      </div>
                    )}
                    {c.status === "na" && c.fix && <div className="caption break">{c.fix}</div>}
                  </div>
                </li>
              ))}
            </ul>
            {rep.notes.length > 0 && (
              <div className="caption" style={{ marginTop: 12 }}>
                {rep.notes.map((n) => (
                  <p key={n} style={{ margin: "2px 0" }}>
                    {n}
                  </p>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="card compact" aria-labelledby="url-h">
        <h3 id="url-h">Auditar otra dirección</h3>
        <p className="caption" style={{ margin: "4px 0 10px" }}>
          Para revisar la página pública de una tienda real. Solo leo páginas públicas (nunca
          direcciones internas) y solo si lo activaste con{" "}
          <span className="mono">TRAXO_AUDIT_LIVE=1</span>.
        </p>
        <form
          className="row"
          style={{ flexWrap: "nowrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) run(kind, url.trim());
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="https://mitienda.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Dirección de la tienda"
            inputMode="url"
          />
          <Button variant="primary" disabled={!url.trim() || running !== null}>
            Auditar
          </Button>
        </form>
      </section>
    </div>
  );
}

export type { AuditReport };
