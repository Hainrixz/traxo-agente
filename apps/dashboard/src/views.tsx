// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { useEffect, useRef, useState } from "react";
import { get, post, useResource } from "./api.ts";
import { EmptyState, OrderJourney, Pipeline, QuoteBars, Sheet } from "./components.tsx";
import { cop, copShort, dateEs, phoneEs, plural, timeEs } from "./format.ts";
import type {
  Account,
  Approval,
  Campaign,
  Connection,
  Conversation,
  DemoOutcome,
  OrderRow,
  Product,
  State,
} from "./types.ts";
import {
  AgentActivityEntry,
  type AgentEv,
  Banner,
  Button,
  Icon,
  KpiCard,
  Money,
  PaymentBadge,
  ShipmentTimeline,
  StatusBadge,
  ToneBadge,
} from "./ui.tsx";

export type Ctx = {
  tick: number;
  events: AgentEv[];
  fresh: Set<string>;
  toast: (m: string) => void;
  go: (v: string) => void;
  tags: Map<string, string>;
  working: boolean;
  /** Vuelve a pedir lo que muestra el panel (después de cambiar algo). */
  refresh: () => void;
  account: Account;
  settings?: { confirmCod: "off" | "risky" | "all" };
  /** Arranca el recorrido guiado. */
  startTour: () => void;
};

const CITIES: Array<[string, string]> = [
  ["66001", "Pereira"],
  ["76001", "Cali"],
  ["05001", "Medellín"],
  ["11001", "Bogotá"],
  ["08001", "Barranquilla"],
  ["68001", "Bucaramanga"],
  ["13001", "Cartagena"],
];

const outcomeText = (r: DemoOutcome): string =>
  r.outcome.status === "shipped"
    ? `Pedido ${r.number}: guía ${r.outcome.trackingNumber} con ${r.outcome.carrier}`
    : r.outcome.status === "needs_address"
      ? `Pedido ${r.number}: necesito que confirmes la dirección`
      : r.outcome.status === "needs_approval"
        ? `Pedido ${r.number}: dejé la guía lista para tu aprobación`
        : `Pedido ${r.number}: ninguna transportadora llega ahí`;

/* ============================== DEMO GUIADA ============================== */
function DemoGuide({
  ctx,
  orders,
  openOrder,
}: {
  ctx: Ctx;
  orders: OrderRow[];
  openOrder: (id: string) => void;
}) {
  const [dane, setDane] = useState("66001");
  const [busy, setBusy] = useState<string>();
  const sim = orders.find(
    (o) => o.shipments[0]?.simulated && o.shipments[0]?.status !== "delivered",
  );
  const ship = sim?.shipments[0];
  const awaiting = orders.find((o) => o.status === "awaiting_confirmation");
  const confirmCod = ctx.settings?.confirmCod ?? "off";
  const has = (kind: string, text?: string) =>
    ctx.events.some((e) => e.kind === kind && (!text || e.summary.includes(text)));
  const statuses = new Set(orders.flatMap((o) => o.shipments.map((s) => s.status)));
  const [viewed, setViewed] = useState(false);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(undefined);
    }
  };
  const steps = [
    {
      k: "pedido",
      t: "Llega un pedido",
      d: "Contraentrega de $ 38.000, con el destino que elijas",
      done: orders.some((o) => o.shipments[0]?.simulated),
      label: "Simular pedido",
      run: () =>
        run("pedido", async () =>
          ctx.toast(
            outcomeText(await post<DemoOutcome>("/api/demo/order", { dane, scenario: "safe" })),
          ),
        ),
    },
    {
      k: "ver",
      t: "Mira cómo eligió",
      d: "Cotizó en 6 vías y explica su decisión",
      done: viewed,
      label: "Ver pedido",
      off: !sim,
      run: async () => {
        if (sim) {
          setViewed(true);
          openOrder(sim.id);
        }
      },
    },
    {
      k: "avanzar",
      t: "La guía avanza",
      d: "Hasta que sale a reparto, le avisa al cliente",
      done: ["out_for_delivery", "delivered"].some((s) => statuses.has(s)),
      label: "Avanzar guía",
      off: !ship || ship.status === "incident",
      run: () =>
        run("avanzar", async () => {
          if (!ship) return;
          await post("/api/demo/advance", { trackingNumber: ship.trackingNumber });
          ctx.toast("Avancé la guía un paso");
        }),
    },
    {
      k: "novedad",
      t: "Algo sale mal",
      d: "El cliente no estaba: el agente le escribe",
      done: has("incident.detected"),
      label: "Provocar novedad",
      off: !ship || ship.status === "incident" || ship.status === "delivered",
      run: () =>
        run("novedad", async () => {
          if (!ship) return;
          await post("/api/demo/advance", { trackingNumber: ship.trackingNumber, incident: true });
          ctx.toast("Provoqué una novedad: ya le escribí al cliente");
        }),
    },
    {
      k: "responder",
      t: "El cliente responde",
      d: "«Sí, mañana estoy» → reprograma solo",
      done: has("incident.resolved"),
      label: "Responder como cliente",
      off: !sim || ship?.status !== "incident",
      run: () =>
        run("responder", async () => {
          if (!sim) return;
          await post("/api/demo/reply", { phone: sim.address.phone, text: "Sí, mañana estoy" });
          ctx.toast("Atendí la respuesta del cliente");
        }),
    },
    {
      k: "riesgo",
      t: "Contraentrega de riesgo",
      d: "Cliente nuevo y $ 294.000 por cobrar: antes de la guía, confirma",
      done: has("confirmation.requested"),
      label: "Simular pedido riesgoso",
      run: () =>
        run("riesgo", async () => {
          if (confirmCod === "off") await post("/api/settings", { confirmCod: "risky" });
          const r = await post<DemoOutcome>("/api/demo/order", { dane, scenario: "risky" });
          ctx.toast(outcomeText(r));
          ctx.refresh();
        }),
    },
    {
      k: "confirmar",
      t: "El cliente confirma",
      d: "«Confirmo» → recién ahí genero la guía",
      done: has("confirmation.received"),
      label: "Responder «Confirmo»",
      off: !awaiting,
      run: () =>
        run("confirmar", async () => {
          if (!awaiting) return;
          await post("/api/demo/reply", { phone: awaiting.address.phone, text: "Confirmo" });
          ctx.toast("El cliente confirmó: genero la guía");
        }),
    },
    {
      k: "dir",
      t: "Dirección incompleta",
      d: "No cotiza: te pide confirmarla",
      done: has("approval.requested", "dirección"),
      label: "Probar",
      run: () =>
        run("dir", async () => {
          await post("/api/demo/order", { dane, badAddress: true });
          ctx.go("aprobaciones");
        }),
    },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="card" aria-labelledby="guide-h" style={{ gridArea: "guide" }}>
      <div className="row between" style={{ marginBottom: 4 }}>
        <h2 id="guide-h">Recorrido de la demo</h2>
        <span className="caption num">
          {steps.filter((s) => s.done).length}/{steps.length}
        </span>
      </div>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Sigue los pasos y mira al agente trabajar. Todo es simulado.
      </p>
      <label className="row" style={{ marginBottom: 12 }}>
        <span className="label">Destino</span>
        <select
          className="input"
          value={dane}
          onChange={(e) => setDane(e.target.value)}
          aria-label="Destino del pedido de ejemplo"
        >
          {CITIES.map(([d, c]) => (
            <option key={d} value={d}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <ol className="guide" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s.k} className={`gstep ${s.done ? "done" : i === next ? "next" : ""}`}>
            <span className="no" aria-hidden="true">
              {s.done ? <Icon name="check" size={16} /> : i + 1}
            </span>
            <div>
              <strong>{s.t}</strong>
              <span className="d">{s.d}</span>
            </div>
            <Button
              sm
              data-tour={`guide-${s.k}`}
              variant={i === next ? "agent" : ""}
              onClick={s.run}
              disabled={Boolean(s.off) || busy !== undefined}
              icon={i === next ? "play" : undefined}
            >
              {busy === s.k ? "Procesando…" : s.label}
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ============================== INICIO ============================== */
export function Inicio({
  ctx,
  orders,
  state,
  openOrder,
  imported,
}: {
  ctx: Ctx;
  orders: OrderRow[];
  state: State;
  openOrder: (id: string) => void;
  imported: boolean;
}) {
  const k = state.kpis;
  const live = orders.filter(
    (o) => o.payment === "cod" && o.status !== "delivered" && o.shipments.length > 0,
  );
  const porCobrar = live.reduce((s, o) => s + o.total, 0);
  const demo = Boolean(state.demo);
  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Hola. Esto es lo que va pasando</h1>
          <p className="lead">
            Llevo {k.orders} pedidos de {state.store.name}: {k.inTransit} en camino y {k.delivered}{" "}
            entregados.{" "}
            {k.pendingApprovals > 0
              ? `Hay ${k.pendingApprovals} ${plural(k.pendingApprovals, "cosa", "cosas")} esperando tu decisión. `
              : "No tengo nada esperando tu decisión. "}
            {k.incidents > 0
              ? `${k.incidents} ${plural(k.incidents, "guía tiene", "guías tienen")} novedad.`
              : "Ninguna guía tiene novedad."}
          </p>
        </div>
      </div>

      {demo && (
        <Banner tone="neutral">
          Estás en la <strong>demo</strong>: la tienda y los envíos son simulados. Ninguna guía
          mueve un paquete ni sale un WhatsApp real.
        </Banner>
      )}

      {!imported && (
        <section className="proposal" aria-labelledby="first-h">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="spark" size={18} />
            <h2 id="first-h">Empieza aquí: conecta tu tienda</h2>
          </div>
          <p style={{ margin: 0 }}>
            Importo tu catálogo, tus clientes y tu historial de pedidos. Con eso ya sé qué vendes, a
            quién y cuánto te deja cada producto.
          </p>
          <div className="row">
            <Button variant="agent" icon="plug" onClick={() => ctx.go("conexiones")}>
              Conectar mi tienda
            </Button>
            {demo && (
              <Button icon="play" onClick={ctx.startTour}>
                Ver el recorrido guiado
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="grid-kpi">
        <KpiCard
          hero
          label="Contraentrega por cobrar"
          value={copShort(porCobrar)}
          hint={`${live.length} ${plural(live.length, "pedido", "pedidos")} en camino con recaudo`}
        />
        <KpiCard
          label="En camino"
          value={k.inTransit}
          unit={plural(k.inTransit, "guía", "guías")}
        />
        <KpiCard
          label="Entregados"
          value={k.delivered}
          unit={plural(k.delivered, "guía", "guías")}
        />
        <KpiCard
          label="Con novedad"
          value={k.incidents}
          unit={plural(k.incidents, "guía", "guías")}
        />
        <KpiCard
          label="Fletes pagados"
          value={copShort(k.shippingSpend)}
          hint={k.simulatedShipments ? "incluye guías simuladas" : undefined}
        />
      </div>

      <div className="home">
        <div style={{ gridArea: "pipe" }} data-tour="pipeline">
          <Pipeline orders={orders} pending={k.pendingApprovals} working={ctx.working} />
        </div>
        {demo && <DemoGuide ctx={ctx} orders={orders} openOrder={openOrder} />}
        <section className="card" aria-labelledby="feed-h" style={{ gridArea: "feed" }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 id="feed-h">Lo que estoy haciendo</h2>
            <button type="button" className="btn ghost sm" onClick={() => ctx.go("actividad")}>
              Ver todo
            </button>
          </div>
          <div className="feed" role="log" aria-live="polite" aria-label="Actividad del agente">
            {ctx.events
              .slice(-6)
              .reverse()
              .map((e) => (
                <AgentActivityEntry
                  key={e.id}
                  e={e}
                  fresh={ctx.fresh.has(e.id)}
                  tag={e.orderId ? ctx.tags.get(e.orderId) : undefined}
                />
              ))}
            {ctx.events.length === 0 && (
              <EmptyState
                icon="spark"
                title="Todavía no he hecho nada"
                text={
                  demo
                    ? "Simula un pedido y mírame trabajar."
                    : "Cuando entre un pedido, aquí verás cada decisión que tomo."
                }
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================== ACTIVIDAD ============================== */
export function Actividad({ ctx }: { ctx: Ctx }) {
  return (
    <div className="stack">
      <h1>Actividad del agente</h1>
      <section className="card">
        <div className="feed" role="log" aria-live="polite" aria-label="Actividad del agente">
          {ctx.events
            .slice()
            .reverse()
            .map((e) => (
              <AgentActivityEntry
                key={e.id}
                e={e}
                fresh={ctx.fresh.has(e.id)}
                tag={e.orderId ? ctx.tags.get(e.orderId) : undefined}
              />
            ))}
          {ctx.events.length === 0 && (
            <EmptyState
              icon="activity"
              title="Sin actividad todavía"
              text="Cuando llegue un pedido verás aquí cada paso que doy."
            />
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================== PEDIDOS ============================== */
export function Pedidos({
  ctx,
  orders,
  sel,
  setSel,
}: {
  ctx: Ctx;
  orders: OrderRow[];
  sel?: string;
  setSel: (id?: string) => void;
}) {
  const order = orders.find((o) => o.id === sel);
  return (
    <div className="stack">
      <h1>Pedidos</h1>
      {orders.length === 0 ? (
        <section className="card">
          <EmptyState
            icon="box"
            title="No hay pedidos todavía"
            text="Cuando entre uno, lo cotizo, elijo transportadora y genero la guía."
            action={
              <Button variant="agent" icon="play" onClick={() => ctx.go("inicio")}>
                Probar la demo
              </Button>
            }
          />
        </section>
      ) : (
        <>
          <section className="card compact scroll-x only-wide">
            <table className="table">
              <caption className="sr-only">Pedidos recientes</caption>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Ciudad</th>
                  <th scope="col">Pago</th>
                  <th scope="col" className="right">
                    Total
                  </th>
                  <th scope="col">Guía</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const s = o.shipments[0];
                  return (
                    <tr
                      key={o.id}
                      className={`click ${sel === o.id ? "sel" : ""}`}
                      onClick={() => setSel(o.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSel(o.id)}
                      tabIndex={0}
                    >
                      <td className="mono">{o.number}</td>
                      <td>{o.address.name}</td>
                      <td>{o.address.city}</td>
                      <td>
                        <PaymentBadge payment={o.payment} />
                      </td>
                      <td className="right nowrap">
                        <Money value={o.total} />
                      </td>
                      <td className="mono">{s ? s.trackingNumber : "—"}</td>
                      <td>
                        <StatusBadge status={s?.status ?? o.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <div className="only-narrow">
            {orders.map((o) => {
              const s = o.shipments[0];
              return (
                <button key={o.id} type="button" className="ocard" onClick={() => setSel(o.id)}>
                  <span className="l1">
                    <span className="mono">{o.number}</span>
                    <StatusBadge status={s?.status ?? o.status} />
                  </span>
                  <span>
                    <span className="name">{o.address.name}</span>
                    <br />
                    <span className="caption">
                      {o.address.city}
                      {s ? ` · ${s.carrier}` : ""}
                    </span>
                  </span>
                  <span className="l3">
                    <PaymentBadge payment={o.payment} />
                    <Money value={o.total} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {order && <OrderSheet ctx={ctx} order={order} onClose={() => setSel(undefined)} />}
    </div>
  );
}

export function OrderSheet({
  ctx,
  order,
  onClose,
}: {
  ctx: Ctx;
  order: OrderRow;
  onClose: () => void;
}) {
  const s = order.shipments[0];
  const act = async (incident: boolean) => {
    if (!s) return;
    const r = await post<{ ok: boolean; message?: string }>("/api/demo/advance", {
      trackingNumber: s.trackingNumber,
      incident,
    });
    ctx.toast(
      r.ok
        ? incident
          ? "Provoqué una novedad: ya le escribí al cliente"
          : "Avancé la guía un paso"
        : (r.message ?? "No se pudo"),
    );
  };
  return (
    <Sheet title={`Pedido ${order.number}`} onClose={onClose}>
      <div className="card compact stack tight">
        <div className="row between">
          <strong className="break">{order.address.name}</strong>
          <PaymentBadge payment={order.payment} />
        </div>
        <div className="muted break">
          {order.address.street}, {order.address.city} ({order.address.department})
        </div>
        <div className="mono">{phoneEs(order.address.phone)}</div>
        <div className="caption">
          {dateEs(order.createdAt)} · {timeEs(order.createdAt)}
        </div>
        <hr style={{ border: 0, borderTop: "1px solid var(--line)", width: "100%", margin: 0 }} />
        {order.lines.map((l) => (
          <div
            key={l.title}
            className="row between"
            style={{ flexWrap: "nowrap", alignItems: "flex-start" }}
          >
            <span className="break">
              {l.quantity} x {l.title}
            </span>
            <span className="num nowrap">{cop(l.unitPrice * l.quantity)}</span>
          </div>
        ))}
        <div className="row between">
          <span className="label">{order.payment === "cod" ? "Recaudo" : "Total"}</span>
          <Money value={order.total} />
        </div>
      </div>

      <section aria-label="Recorrido del pedido" data-tour="journey">
        <h3 style={{ marginBottom: 12 }}>Recorrido</h3>
        <OrderJourney order={order} />
      </section>

      {order.quotes.length > 0 && (
        <section className="card compact" aria-label="Cotizaciones" data-tour="quotes">
          <h3 style={{ marginBottom: 12 }}>Cómo elegí la transportadora</h3>
          <QuoteBars quotes={order.quotes} />
        </section>
      )}

      {s ? (
        <section className="card compact" data-tour="tracking">
          <div className="row between" style={{ marginBottom: 12 }}>
            <div>
              <div className="label">Guía</div>
              <div className="mono">{s.trackingNumber}</div>
              <div className="caption">
                {s.carrier}
                {s.simulated ? " · simulada" : ""}
              </div>
            </div>
            <StatusBadge status={s.status} />
          </div>
          <ShipmentTimeline events={s.events} />
          {s.simulated && s.status !== "delivered" && (
            <div className="row" style={{ marginTop: 8 }}>
              <Button sm onClick={() => act(false)} icon="play">
                Avanzar guía
              </Button>
              <Button sm onClick={() => act(true)} icon="alert">
                Provocar novedad
              </Button>
            </div>
          )}
        </section>
      ) : (
        <Banner tone="attention">
          Este pedido todavía no tiene guía. Revisa si hay una aprobación pendiente.
        </Banner>
      )}
    </Sheet>
  );
}

/* ============================== APROBACIONES ============================== */
export function Aprobaciones({ ctx }: { ctx: Ctx }) {
  const { data, reload } = useResource<Approval[]>("/api/approvals", ctx.tick);
  const [street, setStreet] = useState<Record<string, string>>({});
  const pending = (data ?? []).filter((a) => a.status === "pending");
  const done = (data ?? []).filter((a) => a.status !== "pending").slice(0, 8);
  const run = async (path: string, body?: unknown) => {
    const r = await post<{ ok: boolean; message: string }>(path, body);
    ctx.toast(r.message);
    reload();
  };
  return (
    <div className="stack">
      <h1>Necesita tu atención</h1>
      {pending.length === 0 && (
        <section className="card">
          <EmptyState icon="check" title="Todo al día" text="No hay nada esperando tu decisión." />
        </section>
      )}
      {pending.map((a) => (
        <article key={a.id} className="proposal" aria-label={a.title}>
          <div className="row between">
            <div className="row" style={{ minWidth: 0 }}>
              <Icon name="spark" size={18} />
              <h3 className="break">{a.title}</h3>
            </div>
            <ToneBadge tone="attention">Esperando tu aprobación</ToneBadge>
          </div>
          <div className="break">{a.detail}</div>
          {a.kind === "address" ? (
            <div className="row">
              <input
                className="input"
                style={{ flex: "1 1 220px" }}
                placeholder="Dirección completa (vía y número)"
                aria-label="Dirección completa"
                value={street[a.id] ?? ""}
                onChange={(e) => setStreet({ ...street, [a.id]: e.target.value })}
              />
              <Button
                variant="primary"
                onClick={() => run(`/api/approvals/${a.id}/address`, { street: street[a.id] })}
                disabled={!street[a.id]}
              >
                Corregir y enviar
              </Button>
              <Button onClick={() => run(`/api/approvals/${a.id}/reject`)}>Descartar</Button>
            </div>
          ) : (
            <div className="row">
              <Button variant="primary" onClick={() => run(`/api/approvals/${a.id}/approve`)}>
                Aprobar
              </Button>
              <Button onClick={() => run(`/api/approvals/${a.id}/reject`)}>Rechazar</Button>
            </div>
          )}
        </article>
      ))}
      {done.length > 0 && (
        <section className="card">
          <div className="label" style={{ marginBottom: 8 }}>
            Resueltas
          </div>
          {done.map((a) => (
            <div
              key={a.id}
              className="row between"
              style={{ padding: "6px 0", flexWrap: "nowrap" }}
            >
              <span className="break">{a.title}</span>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/* ============================== CONVERSACIONES ============================== */
export function Conversaciones({ ctx }: { ctx: Ctx }) {
  const { data } = useResource<Conversation[]>("/api/conversations", ctx.tick);
  const [open, setOpen] = useState<string>();
  const [text, setText] = useState("");
  const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;
  const conv = (data ?? []).find((c) => c.id === (open ?? (narrow ? undefined : data?.[0]?.id)));
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setText("");
  }, [conv?.id]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [conv?.messages.length]);
  const reply = async () => {
    if (!conv || !text.trim()) return;
    const r = await post<{ result: { intent: string } }>("/api/demo/reply", {
      phone: conv.customer.phone,
      text,
    });
    setText("");
    ctx.toast(
      r.result.intent === "no_context"
        ? "Esa persona no tiene una novedad abierta: no hice nada"
        : "Atendí la respuesta del cliente",
    );
  };
  const list = (
    <section
      className="card compact"
      aria-label="Conversaciones"
      style={conv && narrow ? { display: "none" } : undefined}
    >
      {(data ?? []).map((c) => (
        <button
          key={c.id}
          type="button"
          className="convitem"
          aria-current={c.id === conv?.id}
          onClick={() => setOpen(c.id)}
        >
          <span className="avatar" aria-hidden="true">
            {c.customer.name.slice(0, 1)}
          </span>
          <span style={{ minWidth: 0 }}>
            <strong className="break">{c.customer.name}</strong>
            <br />
            <span className="caption">{phoneEs(c.customer.phone)}</span>
          </span>
        </button>
      ))}
      {(data ?? []).length === 0 && (
        <EmptyState
          icon="chat"
          title="Aún no hay conversaciones"
          text="Aparecen cuando le aviso a un cliente que su pedido va en camino."
        />
      )}
    </section>
  );
  return (
    <div className="stack">
      <h1>Conversaciones</h1>
      <div className="two">
        {list}
        {conv && (
          <section className="card" aria-label={`Chat con ${conv.customer.name}`}>
            <div className="stack tight">
              <div className="row between" style={{ flexWrap: "nowrap" }}>
                <div className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
                  {narrow && (
                    <Button variant="ghost" sm icon="back" onClick={() => setOpen(undefined)}>
                      Atrás
                    </Button>
                  )}
                  <h3 className="break">{conv.customer.name}</h3>
                </div>
                <span className="mono nowrap">{phoneEs(conv.customer.phone)}</span>
              </div>
              <div className="chat" role="log" aria-live="polite">
                {conv.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.direction}`}>
                    {m.text}
                    <div className="meta">
                      {m.direction === "out" ? "Traxo" : conv.customer.name} · {timeEs(m.at)}
                      {m.simulated ? " · simulado" : ""}
                    </div>
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  placeholder="Responder como el cliente (demo)…"
                  aria-label="Responder como el cliente"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && reply()}
                />
                <Button variant="primary" icon="send" onClick={reply} disabled={!text.trim()}>
                  Enviar
                </Button>
              </div>
              <p className="caption" style={{ margin: 0 }}>
                Prueba con «Sí, mañana estoy», «No lo quiero» o una dirección nueva.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
