// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { useState } from "react";
import { useResource } from "./api.ts";
import { HBars, LineChart } from "./charts.tsx";
import { EmptyState } from "./components.tsx";
import { cop, copShort } from "./format.ts";
import type { StoreStatus, UsageReport } from "./types.ts";
import { Banner, CHANNELS, ChannelMark, SampleTag, Tabs } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const n = (v: number): string => v.toLocaleString("es-CO");
const pct = (v: number | null): string => (v === null ? "N/A" : `${v} %`);
const hours = (h: number): string =>
  h >= 10 ? `${Math.round(h)} h` : `${String(h).replace(".", ",")} h`;

/** Panel de uso agéntico: cuánto trabajó el agente, cuánto costó y cuánto trabajo manual se evitó. */
export function UsoAgentico({ ctx }: { ctx: Ctx }) {
  const [days, setDays] = useState("30");
  const u = useResource<UsageReport>(`/api/usage?days=${days}`, ctx.tick).data;
  const sample = Boolean(
    useResource<StoreStatus>("/api/store/status", ctx.tick).data?.profile?.sample,
  );
  const [metric, setMetric] = useState<"actions" | "cost" | "messages">("actions");

  const head = (
    <div className="topbar">
      <div>
        <h1>Uso agéntico</h1>
        <p className="lead">
          Todo lo que el agente hizo por ti, lo que costó y el trabajo manual que te evitó. Los
          costos y las horas son estimados: abajo ves los supuestos.
        </p>
      </div>
      {sample && <SampleTag />}
    </div>
  );

  if (u && u.value.automatedActions === 0 && u.ai.calls === 0 && u.messages.total === 0)
    return (
      <div className="stack">
        {head}
        <section className="card">
          <EmptyState
            icon="activity"
            title="Aún no hay uso para mostrar"
            text="Cuando entren pedidos y el agente cotice, genere guías, escriba por WhatsApp o use IA, lo verás aquí con su costo."
          />
        </section>
      </div>
    );

  const series = u?.series ?? [];
  const pointsOf = (f: (s: UsageReport["series"][number]) => number) =>
    series.map((s) => ({ date: s.date, value: f(s) }));

  return (
    <div className="stack">
      {head}

      <div className="grid-stats">
        <div className="kpi hero">
          <span className="label">Trabajo que no tuviste que hacer</span>
          <span className="value num">{u ? hours(u.value.hoursSaved) : "—"}</span>
          <span className="caption">
            {u
              ? `${n(u.value.automatedActions)} acciones automáticas · ${copShort(u.value.savedCop)} de tiempo`
              : ""}
          </span>
        </div>
        <div className="kpi">
          <span className="label">Gasto del agente</span>
          <span className="value num">{u ? copShort(u.cost.totalCop) : "—"}</span>
          <span className="caption">
            {u?.cost.perOrderCop == null
              ? "IA y créditos"
              : `${cop(u.cost.perOrderCop)} por pedido`}
          </span>
        </div>
        <div className="kpi">
          <span className="label">Retorno</span>
          <span className="value num">
            {u
              ? u.value.returnPerPeso === null
                ? "N/A"
                : `${String(u.value.returnPerPeso).replace(".", ",")}×`
              : "—"}
          </span>
          <span className="caption">
            {u?.value.returnPerPeso === null
              ? "sin gasto aún"
              : "pesos de tiempo por cada peso gastado"}
          </span>
        </div>
        <div className="kpi">
          <span className="label">Lo hizo solo</span>
          <span className="value num">{u ? pct(u.value.automationPct) : "—"}</span>
          <span className="caption">
            {u ? `${u.value.humanSteps} pasos pidieron tu aprobación` : ""}
          </span>
        </div>
      </div>

      {u?.cost.budgetUsedPct != null && (
        <Banner tone={u.cost.budgetUsedPct > 80 ? "attention" : "agent"}>
          Llevas el {u.cost.budgetUsedPct} % de tu presupuesto de IA ({copShort(u.cost.totalCop)} de{" "}
          {copShort(u.cost.budgetCop ?? 0)}).
        </Banner>
      )}
      {u?.tips.map((t) => (
        <Banner key={t} tone="agent">
          {t}
        </Banner>
      ))}

      <section className="card" aria-labelledby="us-h">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 id="us-h">
            {metric === "actions"
              ? "Acciones automáticas por día"
              : metric === "cost"
                ? "Gasto por día"
                : "Mensajes del agente por día"}
          </h2>
          <div className="row">
            <Tabs
              label="Qué mostrar"
              value={metric}
              onChange={(v) => setMetric(v as typeof metric)}
              items={[
                ["actions", "Acciones"],
                ["cost", "Gasto"],
                ["messages", "Mensajes"],
              ]}
            />
            <Tabs
              label="Periodo"
              value={days}
              onChange={setDays}
              items={[
                ["7", "7 días"],
                ["30", "30 días"],
                ["90", "90 días"],
              ]}
            />
          </div>
        </div>
        {u ? (
          <LineChart
            integer={metric !== "cost"}
            label={
              metric === "actions"
                ? "Acciones por día"
                : metric === "cost"
                  ? "Gasto por día"
                  : "Mensajes por día"
            }
            data={pointsOf((s) =>
              metric === "actions" ? s.actions : metric === "cost" ? s.costCop : s.messages,
            )}
            format={
              metric === "cost"
                ? (v) => (v === 0 ? "$ 0" : copShort(v))
                : (v) => String(Math.round(v))
            }
          />
        ) : (
          <div className="skel" style={{ height: 220 }} />
        )}
      </section>

      <div className="two eq">
        <section className="card" aria-labelledby="ia-h">
          <h2 id="ia-h">IA (Claude)</h2>
          {u && !u.ai.today.enabled && u.ai.calls === 0 && (
            <p className="caption" style={{ margin: "4px 0 12px" }}>
              La IA está apagada: el agente trabaja solo con reglas, sin gasto. Para activarla
              define <code>ANTHROPIC_API_KEY</code> en tu servidor.
            </p>
          )}
          {u && u.ai.calls === 0 ? (
            <p className="caption">Sin llamadas a Claude en este periodo.</p>
          ) : (
            u && (
              <>
                <p className="caption" style={{ margin: "4px 0 12px" }}>
                  {n(u.ai.calls)} llamadas · {n(u.ai.tokensIn + u.ai.tokensOut)} tokens ·{" "}
                  {pct(u.value.withoutAiPct)} de las decisiones se resolvieron con reglas, sin IA.
                </p>
                <HBars
                  format={(v) => `${n(v)} llamadas`}
                  rows={u.ai.byFeature.map((f, i) => ({
                    label: f.feature,
                    value: f.calls,
                    sub: `${copShort(f.cop)} · ${n(f.tokens)} tokens`,
                    highlight: i === 0,
                  }))}
                />
              </>
            )
          )}
          {u?.ai.today.enabled && (
            <p className="caption" style={{ marginTop: 12 }}>
              Hoy: {u.ai.today.usedToday} de {u.ai.today.perStoreDay} permitidas para esta tienda.
            </p>
          )}
        </section>

        <section className="card" aria-labelledby="ms-h">
          <h2 id="ms-h">Mensajes por canal</h2>
          <p className="caption" style={{ margin: "4px 0 12px" }}>
            Lo que el agente escribió a clientes
            {u && u.messages.simulated > 0 ? ` (${u.messages.simulated} fueron simulados)` : ""}.
          </p>
          {u && u.messages.byChannel.length === 0 ? (
            <p className="caption">Sin mensajes en este periodo.</p>
          ) : (
            <div className="stack tight">
              {u?.messages.byChannel.map((c) => (
                <div key={c.channel} className="row between">
                  <span className="row" style={{ gap: 8 }}>
                    <ChannelMark channel={c.channel} />
                    <strong>
                      {CHANNELS[c.channel as keyof typeof CHANNELS]?.label ?? c.channel}
                    </strong>
                  </span>
                  <span className="num">{n(c.sent)}</span>
                </div>
              ))}
            </div>
          )}
          <h3 style={{ marginTop: 20 }}>Creativos (Higgsfield)</h3>
          <p className="caption" style={{ margin: "4px 0 0" }}>
            {u
              ? u.creatives.imagenes + u.creatives.videos === 0
                ? "Sin creativos generados en este periodo."
                : `${u.creatives.imagenes} ${u.creatives.imagenes === 1 ? "imagen" : "imágenes"} y ${u.creatives.videos} ${u.creatives.videos === 1 ? "video" : "videos"}${u.creatives.credits ? ` · ${n(u.creatives.credits)} créditos (${copShort(u.creatives.cop)})` : ""}.`
              : ""}
          </p>
        </section>
      </div>

      <section className="card" aria-labelledby="ac-h">
        <h2 id="ac-h">Lo que el agente hizo solo</h2>
        <p className="caption" style={{ margin: "4px 0 12px" }}>
          Cada acción lleva el tiempo manual estimado que evita.
        </p>
        {u && (
          <HBars
            format={(v) =>
              v >= 60 ? hours(Math.round((v / 60) * 10) / 10) : `${Math.round(v)} min`
            }
            rows={u.actions.map((a, i) => ({
              label: a.label,
              value: a.minutes,
              sub: `${n(a.count)} ${a.count === 1 ? "vez" : "veces"}`,
              highlight: i === 0,
            }))}
          />
        )}
        <details style={{ marginTop: 16 }}>
          <summary>Supuestos del cálculo</summary>
          <p className="caption" style={{ marginTop: 8 }}>
            Son estimados, no una factura. La hora de trabajo se valora en{" "}
            {u ? cop(u.assumptions.hourCop) : "—"} (cámbialo con <code>TRAXO_HOUR_COP</code>). El
            costo de IA usa los precios por millón de tokens de{" "}
            <code>TRAXO_AI_USD_PER_MTOK_IN/OUT</code> y el dólar de <code>TRAXO_USD_COP</code>. Los
            créditos de Higgsfield solo cuentan si se anotan al agregarlos a la biblioteca.
          </p>
        </details>
      </section>
    </div>
  );
}
