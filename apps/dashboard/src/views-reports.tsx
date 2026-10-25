// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { useState } from "react";
import { useResource } from "./api.ts";
import { HBars, LineChart, Spark } from "./charts.tsx";
import { EmptyState } from "./components.tsx";
import { cop, copShort } from "./format.ts";
import type { Attribution, Logistics, Overview, StoreStatus } from "./types.ts";
import { PlatformBadge, SampleTag, StatusBadge, Tabs } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const pct = (n: number | null) => (n === null ? "N/A" : `${n} %`);

export function Reportes({ ctx }: { ctx: Ctx }) {
  const [days, setDays] = useState("90");
  const [metric, setMetric] = useState<"orders" | "revenue">("orders");
  const ov = useResource<Overview>(`/api/reports/overview?days=${days}`, ctx.tick).data;
  const att = useResource<Attribution>("/api/reports/attribution", ctx.tick).data;
  const logi = useResource<Logistics>("/api/reports/logistics", ctx.tick).data;
  const store = useResource<StoreStatus>("/api/store/status", ctx.tick).data;
  const t = ov?.totals;
  const sample = Boolean(store?.profile?.sample);

  if (ov && t && t.orders === 0 && (att?.sources.length ?? 0) === 0) {
    return (
      <div className="stack">
        <div className="topbar">
          <div>
            <h1>Reportes</h1>
          </div>
        </div>
        <section className="card">
          <EmptyState
            icon="activity"
            title="Aún no hay datos para reportar"
            text="Cuando entren pedidos te muestro ventas, qué anuncio trajo cada venta y cómo le va a cada transportadora."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Reportes</h1>
          <p className="lead">
            Lo que pasó con tus ventas, tus anuncios y tus envíos. Calculado con tus pedidos; lo que
            no se puede saber dice N/A.
          </p>
        </div>
        {sample && <SampleTag />}
      </div>

      <div className="grid-stats six">
        <div className="kpi">
          <span className="label">Pedidos</span>
          <span className="value num">{t?.orders ?? "—"}</span>
          <span className="caption">últimos {days} días</span>
        </div>
        <div className="kpi">
          <span className="label">Ventas</span>
          <span className="value num">{t ? copShort(t.revenue) : "—"}</span>
          <span className="caption">sin cancelados</span>
        </div>
        <div className="kpi">
          <span className="label">Ticket promedio</span>
          <span className="value num">{t?.avgTicket == null ? "N/A" : copShort(t.avgTicket)}</span>
        </div>
        <div className="kpi">
          <span className="label">Contraentrega</span>
          <span className="value num">{pct(t?.codShare ?? null)}</span>
          <span className="caption">de los pedidos</span>
        </div>
        <div className="kpi">
          <span className="label">Entregados</span>
          <span className="value num">{pct(t?.deliveredPct ?? null)}</span>
          <span className="caption">de lo enviado</span>
        </div>
        <div className="kpi">
          <span className="label">Devueltos</span>
          <span className="value num">{pct(t?.returnedPct ?? null)}</span>
          <span className="caption">{t?.cancelled ?? 0} cancelados</span>
        </div>
      </div>

      <section className="card" aria-labelledby="ts-h" data-tour="chart">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 id="ts-h">{metric === "orders" ? "Pedidos por día" : "Ventas por día"}</h2>
          <div className="row">
            <Tabs
              label="Qué mostrar"
              value={metric}
              onChange={(v) => setMetric(v as "orders" | "revenue")}
              items={[
                ["orders", "Pedidos"],
                ["revenue", "Ventas"],
              ]}
            />
            <Tabs
              label="Periodo"
              value={days}
              onChange={setDays}
              items={[
                ["30", "30 días"],
                ["60", "60 días"],
                ["90", "90 días"],
              ]}
            />
          </div>
        </div>
        {ov ? (
          <LineChart
            integer={metric === "orders"}
            label={metric === "orders" ? "Pedidos por día" : "Ventas por día"}
            data={ov.series.map((s) => ({
              date: s.date,
              value: metric === "orders" ? s.orders : s.revenue,
            }))}
            format={
              metric === "orders"
                ? (n) => String(Math.round(n))
                : (n) => (n === 0 ? "$ 0" : copShort(n))
            }
          />
        ) : (
          <div className="skel" style={{ height: 220 }} />
        )}
      </section>

      <div className="two eq">
        <section className="card" aria-labelledby="src-h">
          <h2 id="src-h">De dónde vienen los pedidos</h2>
          <p className="caption" style={{ margin: "4px 0 12px" }}>
            Por el utm_source del enlace. «Directo» es lo que llegó sin utm.
          </p>
          {att && (
            <HBars
              format={copShort}
              rows={att.sources.map((s, i) => ({
                label: s.source,
                value: s.revenue,
                sub: `${s.orders} pedidos · entregados ${pct(s.deliveredPct)}`,
                highlight: i === 0,
              }))}
            />
          )}
        </section>
        <section className="card" aria-labelledby="car-h">
          <h2 id="car-h">Recaudo de contraentrega</h2>
          <p className="caption" style={{ margin: "4px 0 12px" }}>
            Dinero que cobran las transportadoras por ti.
          </p>
          <div className="grid-two">
            <div className="kpi">
              <span className="label">Cobrado en entregas</span>
              <span className="value num">{copShort(logi?.cod.collected ?? 0)}</span>
            </div>
            <div className="kpi">
              <span className="label">En ruta por cobrar</span>
              <span className="value num">{copShort(logi?.cod.inTransit ?? 0)}</span>
            </div>
          </div>
          {logi && (
            <p className="caption" style={{ margin: "12px 0 0" }}>
              {logi.note}
            </p>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="roas-h">
        <h2 id="roas-h">Qué anuncio trajo qué venta</h2>
        <p className="caption" style={{ margin: "4px 0 12px" }}>
          Une el gasto que reporta la plataforma con los pedidos que traen ese utm_campaign. Sin
          gasto conocido, el ROAS es N/A.
        </p>
        <div className="only-wide scroll-x">
          <table className="table">
            <caption className="sr-only">Campañas con pedidos y ROAS</caption>
            <thead>
              <tr>
                <th scope="col">Campaña</th>
                <th scope="col">Plataforma</th>
                <th scope="col">Estado</th>
                <th scope="col" className="right">
                  Pedidos
                </th>
                <th scope="col" className="right">
                  Ventas
                </th>
                <th scope="col" className="right">
                  Gasto
                </th>
                <th scope="col" className="right">
                  ROAS
                </th>
              </tr>
            </thead>
            <tbody>
              {(att?.campaigns ?? []).map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.product}</td>
                  <td>
                    <PlatformBadge p={c.platform} />
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="right num">{c.orders}</td>
                  <td className="right num nowrap">{cop(c.revenue)}</td>
                  <td className="right num nowrap">{c.spend == null ? "N/A" : cop(c.spend)}</td>
                  <td
                    className="right num"
                    style={
                      c.roas != null && c.roas < 1
                        ? { color: "var(--critical)", fontWeight: 700 }
                        : { fontWeight: 700 }
                    }
                  >
                    {c.roas == null ? "N/A" : `${String(c.roas).replace(".", ",")}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="only-narrow">
          {(att?.campaigns ?? []).map((c) => (
            <div key={c.id} className="ocard" style={{ cursor: "default" }}>
              <span className="l1">
                <span className="name">{c.product}</span>
                <StatusBadge status={c.status} />
              </span>
              <span className="caption">
                {c.orders} pedidos · {cop(c.revenue)} · gasto{" "}
                {c.spend == null ? "N/A" : cop(c.spend)}
              </span>
              <span className="l3">
                <PlatformBadge p={c.platform} />
                <strong
                  className="num"
                  style={c.roas != null && c.roas < 1 ? { color: "var(--critical)" } : undefined}
                >
                  ROAS {c.roas == null ? "N/A" : `${String(c.roas).replace(".", ",")}×`}
                </strong>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="lg-h">
        <h2 id="lg-h">Logística por transportadora</h2>
        <div className="only-wide scroll-x" style={{ marginTop: 12 }}>
          <table className="table">
            <caption className="sr-only">Desempeño por transportadora</caption>
            <thead>
              <tr>
                <th scope="col">Transportadora</th>
                <th scope="col" className="right">
                  Envíos
                </th>
                <th scope="col" className="right">
                  Entregados
                </th>
                <th scope="col" className="right">
                  Novedades
                </th>
                <th scope="col" className="right">
                  Devueltos
                </th>
                <th scope="col" className="right">
                  Costo prom.
                </th>
                <th scope="col" className="right">
                  Días prom.
                </th>
              </tr>
            </thead>
            <tbody>
              {(logi?.carriers ?? []).map((c) => (
                <tr key={c.carrier}>
                  <td style={{ fontWeight: 600 }}>{c.carrier}</td>
                  <td className="right num">{c.shipments}</td>
                  <td className="right num">{c.deliveredPct} %</td>
                  <td className="right num">{c.incidentPct} %</td>
                  <td className="right num">{c.returnedPct} %</td>
                  <td className="right num nowrap">{cop(c.avgCost)}</td>
                  <td className="right num">{c.avgDays ?? "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="only-narrow" style={{ marginTop: 12 }}>
          {(logi?.carriers ?? []).map((c) => (
            <div key={c.carrier} className="ocard" style={{ cursor: "default" }}>
              <span className="l1">
                <span className="name">{c.carrier}</span>
                <span className="caption">{c.shipments} envíos</span>
              </span>
              <span className="caption">
                Entregados {c.deliveredPct} % · novedades {c.incidentPct} % · devueltos{" "}
                {c.returnedPct} %
              </span>
              <span className="l3">
                <span className="caption">{c.avgDays ?? "N/A"} días</span>
                <strong className="num">{cop(c.avgCost)}</strong>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

void Spark;
