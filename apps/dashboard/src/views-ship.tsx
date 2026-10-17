import { useState } from "react";
import { get, post, useResource } from "./api.ts";
import { HBars } from "./charts.tsx";
import { EmptyState, Sheet } from "./components.tsx";
import { cop, dateEs, days, timeEs, viaShort } from "./format.ts";
import type { Logistics, ShipDetail, ShipRow } from "./types.ts";
import { Banner, Button, Icon, ShipmentTimeline, StatusBadge, Tabs } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const GROUPS: Array<[string, string, string[]]> = [
  ["all", "Todas", []],
  [
    "camino",
    "En camino",
    ["created", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery"],
  ],
  ["novedad", "Con novedad", ["incident"]],
  ["entregadas", "Entregadas", ["delivered"]],
  ["devueltas", "Devueltas", ["returning", "returned"]],
  ["canceladas", "Canceladas", ["cancelled"]],
];

export function Envios({ ctx }: { ctx: Ctx }) {
  const ships = useResource<ShipRow[]>("/api/shipments", ctx.tick).data ?? [];
  const logi = useResource<Logistics>("/api/reports/logistics", ctx.tick).data;
  const [group, setGroup] = useState("all");
  const [sel, setSel] = useState<string>();
  const ids = GROUPS.find((g) => g[0] === group)?.[2] ?? [];
  const rows = (ids.length ? ships.filter((s) => ids.includes(s.status)) : ships).slice(0, 60);
  const count = (g: string[]) =>
    g.length ? ships.filter((s) => g.includes(s.status)).length : ships.length;

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Envíos</h1>
          <p className="lead">
            Cada guía que generé, a qué transportadora la mandé y por qué vía. Las simuladas se
            marcan.
          </p>
        </div>
      </div>

      <Tabs
        label="Estado de los envíos"
        value={group}
        onChange={setGroup}
        items={GROUPS.map(([id, label, g]) => [id, `${label} · ${count(g)}`])}
      />

      <section className="card compact only-wide scroll-x">
        <table className="table">
          <caption className="sr-only">Guías generadas</caption>
          <thead>
            <tr>
              <th scope="col">Guía</th>
              <th scope="col">Pedido</th>
              <th scope="col">Destino</th>
              <th scope="col">Transportadora</th>
              <th scope="col">Estado</th>
              <th scope="col" className="right">
                Costo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                className="click"
                tabIndex={0}
                onClick={() => setSel(s.trackingNumber)}
                onKeyDown={(e) => e.key === "Enter" && setSel(s.trackingNumber)}
              >
                <td className="mono">{s.trackingNumber}</td>
                <td>
                  <span className="mono">{s.order.number}</span>{" "}
                  <span className="muted">· {s.order.name}</span>
                </td>
                <td>{s.order.city}</td>
                <td>
                  {s.carrier} <span className="caption">· {viaShort(s.provider)}</span>
                </td>
                <td>
                  <StatusBadge status={s.status} />
                </td>
                <td className="right nowrap num">{cop(s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="only-narrow">
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            className="ocard"
            onClick={() => setSel(s.trackingNumber)}
          >
            <span className="l1">
              <span className="mono">{s.trackingNumber}</span>
              <StatusBadge status={s.status} />
            </span>
            <span>
              <span className="name">{s.order.name}</span>
              <br />
              <span className="caption">
                {s.order.number} · {s.order.city} · {s.carrier}
              </span>
            </span>
            <span className="l3">
              <span className="caption">{viaShort(s.provider)}</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {cop(s.total)}
              </span>
            </span>
          </button>
        ))}
      </div>
      {rows.length === 0 && (
        <section className="card">
          <EmptyState
            icon="truck"
            title="No hay envíos en este filtro"
            text="Cuando llegue un pedido genero la guía y aparece aquí."
          />
        </section>
      )}

      {logi && logi.carriers.length > 0 && (
        <section className="card" aria-labelledby="cmp-h">
          <h2 id="cmp-h">Cómo le ha ido a cada transportadora</h2>
          <p className="muted" style={{ margin: "4px 0 16px" }}>
            Con tus propios envíos. Con pocas guías el dato todavía no es confiable, y lo digo.
          </p>
          <div className="cmp">
            {logi.carriers.map((c) => (
              <article key={c.carrier} className="cmp-card">
                <div className="row between">
                  <h3>{c.carrier}</h3>
                  <span className="caption num">
                    {c.shipments} {c.shipments === 1 ? "envío" : "envíos"}
                  </span>
                </div>
                <HBars
                  format={(n) => `${n} %`}
                  rows={[
                    { label: "Entregados", value: c.deliveredPct, highlight: true },
                    { label: "Con novedad", value: c.incidentPct },
                    { label: "Devueltos", value: c.returnedPct },
                  ]}
                />
                <div className="cmp-foot">
                  <span>
                    <span className="caption">Costo promedio</span>
                    <br />
                    <strong className="num">{cop(c.avgCost)}</strong>
                  </span>
                  <span>
                    <span className="caption">Días promedio</span>
                    <br />
                    <strong className="num">
                      {c.avgDays === null ? "N/A" : c.avgDays.toLocaleString("es-CO")}
                    </strong>
                  </span>
                </div>
                {c.shipments < 10 && (
                  <p className="caption" style={{ margin: 0 }}>
                    Solo {c.shipments} envíos: dato poco confiable.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
      {sel && <ShipSheet ctx={ctx} tracking={sel} onClose={() => setSel(undefined)} />}
    </div>
  );
}

function ShipSheet({
  ctx,
  tracking,
  onClose,
}: {
  ctx: Ctx;
  tracking: string;
  onClose: () => void;
}) {
  const { data, reload } = useResource<ShipDetail>(`/api/shipments/${tracking}`, ctx.tick);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const act = async (path: string, ok: string) => {
    setBusy(true);
    const r = await post<{ ok: boolean; message?: string }>(path);
    setBusy(false);
    setConfirmCancel(false);
    ctx.toast(r.ok ? ok : (r.message ?? "No se pudo"));
    reload();
    ctx.refresh();
  };
  const s = data;
  return (
    <Sheet title={`Guía ${tracking}`} onClose={onClose}>
      {!s ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          <div className="card compact stack tight">
            <div className="row between">
              <strong>{s.carrier}</strong>
              <StatusBadge status={s.status} />
            </div>
            <div className="muted break">
              Pedido {s.order.number} · {s.order.address.name} · {s.order.address.city}
            </div>
            {s.simulated && (
              <Banner tone="neutral">
                Guía <strong>simulada</strong>: no mueve ningún paquete y la etiqueta no es un
                archivo real.
              </Banner>
            )}
          </div>
          <section className="card compact">
            <h3 style={{ marginBottom: 12 }}>Recorrido</h3>
            <ShipmentTimeline events={s.events} />
          </section>
          <div className="row">
            {s.status === "created" && (
              <Button
                sm
                icon="clock"
                disabled={busy}
                onClick={() =>
                  act(`/api/shipments/${tracking}/pickup`, "Programé la recogida (simulada)")
                }
              >
                Programar recogida
              </Button>
            )}
            {["created", "pickup_scheduled"].includes(s.status) && !confirmCancel && (
              <Button sm icon="x" disabled={busy} onClick={() => setConfirmCancel(true)}>
                Cancelar guía
              </Button>
            )}
            {confirmCancel && (
              <>
                <span className="caption">¿Seguro? El pedido quedará sin guía.</span>
                <Button
                  sm
                  variant="primary"
                  disabled={busy}
                  onClick={() => act(`/api/shipments/${tracking}/cancel`, "Guía cancelada")}
                >
                  Sí, cancelar
                </Button>
                <Button sm variant="ghost" onClick={() => setConfirmCancel(false)}>
                  No
                </Button>
              </>
            )}
          </div>
          <p className="caption" style={{ margin: 0 }}>
            Creada y rastreada por Traxo.{" "}
            {s.events.length > 0
              ? `Último evento: ${dateEs(s.events.at(-1)?.at ?? "")} ${timeEs(s.events.at(-1)?.at ?? "")}.`
              : ""}{" "}
            {days(0) && ""}
          </p>
        </>
      )}
    </Sheet>
  );
}

void get;
void Icon;
