import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { cop, days, viaLabel } from "./format.ts";
import type { OrderRow } from "./types.ts";
import { AgentMark, Button, Icon } from "./ui.tsx";

const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isNarrow = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;

/* ---------- Hoja: lateral en escritorio, inferior arrastrable en móvil ---------- */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const el = useRef<HTMLElement>(null);
  const drag = useRef<{ y0: number; t0: number; dy: number } | null>(null);
  const opener = useRef<Element | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(onClose, reducedMotion() ? 0 : 340);
  }, [onClose]);

  useEffect(() => {
    opener.current = document.activeElement;
    const raf = requestAnimationFrame(() => setOpen(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !el.current) return;
      const f = [
        ...el.current.querySelectorAll<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        ),
      ].filter((n) => !n.hasAttribute("disabled"));
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [close]);

  // Arrastre 1:1 con el dedo; al soltar decide por velocidad (no solo por distancia) y continúa desde donde quedó.
  const down = (e: React.PointerEvent) => {
    if (!isNarrow() || !el.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
    el.current.classList.add("dragging");
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    const raw = e.clientY - d.y0;
    // Hacia arriba hay fricción progresiva (rubber-band), hacia abajo sigue al dedo.
    d.dy = raw > 0 ? raw : raw / (1 + Math.abs(raw) / 60);
    el.current.style.transform = `translateY(${Math.max(d.dy, -24)}px)`;
  };
  const up = () => {
    const d = drag.current;
    if (!d || !el.current) return;
    drag.current = null;
    const elapsed = Math.max(performance.now() - d.t0, 1);
    const velocity = d.dy / elapsed;
    const dismiss = d.dy > el.current.offsetHeight / 3 || (velocity > 0.11 && d.dy > 24);
    el.current.classList.remove("dragging");
    el.current.style.transform = "";
    if (dismiss) close();
  };

  return (
    <>
      <div className={`scrim ${open ? "open" : ""}`} onClick={close} aria-hidden="true" />
      <aside
        ref={el}
        className={`sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div
          className="grab"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div
          className="head"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <h2 className="break">{title}</h2>
          <Button variant="ghost" sm onClick={close} icon="x">
            Cerrar
          </Button>
        </div>
        <div className="body">{children}</div>
      </aside>
    </>
  );
}

/* ---------- Estados vacío y de carga ---------- */
export function EmptyState({
  icon = "spark",
  title,
  text,
  action,
}: {
  icon?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="ic">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {text && <span style={{ maxWidth: "42ch" }}>{text}</span>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="skel" style={{ height: h }} aria-hidden="true" />;
}

export function LoadingShell() {
  return (
    <div className="stack" role="status" aria-label="Cargando">
      <Skeleton h={64} />
      <Skeleton h={150} />
      <Skeleton h={220} />
    </div>
  );
}

/* ---------- Dónde está cada pedido ---------- */
export function Pipeline({
  orders,
  pending,
  working,
}: {
  orders: OrderRow[];
  pending: number;
  working: boolean;
}) {
  const ships = orders.flatMap((o) => o.shipments);
  const n = (st: string[]) => ships.filter((s) => st.includes(s.status)).length;
  const stages = [
    { key: "rev", t: "Por revisar", n: pending, warn: pending > 0, icon: "alert" },
    { key: "gui", t: "Con guía", n: n(["created", "pickup_scheduled"]), icon: "box" },
    {
      key: "cam",
      t: "En camino",
      n: n(["picked_up", "in_transit", "out_for_delivery"]),
      icon: "truck",
    },
    {
      key: "nov",
      t: "Novedad",
      n: n(["incident", "returning"]),
      warn: n(["incident", "returning"]) > 0,
      icon: "alert",
    },
    { key: "ent", t: "Entregado", n: n(["delivered"]), icon: "check" },
  ];
  return (
    <section className="card" aria-labelledby="pipe-h">
      <div className="row between" style={{ marginBottom: 16 }}>
        <h2 id="pipe-h">Dónde está cada pedido</h2>
        <span className="row" style={{ gap: 6 }}>
          <AgentMark working={working} />
          <span className="caption">{working ? "Trabajando…" : "Al día"}</span>
        </span>
      </div>
      <ol className="pipe" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {stages.map((s) => (
          <li key={s.key} className={`st ${s.warn ? "warn" : s.n > 0 ? "on" : ""}`}>
            <span className="dot">
              <Icon name={s.icon} size={16} />
            </span>
            <span className="n num">{s.n}</span>
            <span className="t">{s.t}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Recorrido de un pedido (en el detalle) ---------- */
export function OrderJourney({ order }: { order: OrderRow }) {
  const s = order.shipments[0];
  const chosen = order.quotes.find((q) => q.chosen);
  const hasQuotes = order.quotes.length > 0;
  const status = s?.status;
  const steps: Array<{ t: string; d?: string; st: "done" | "now" | "todo" | "bad" }> = [
    {
      t: "Pedido recibido",
      d: `${order.address.city} · ${order.payment === "cod" ? "contraentrega" : "prepagado"}`,
      st: "done",
    },
    {
      t: "Dirección validada",
      st: hasQuotes || s ? "done" : "bad",
      d: hasQuotes || s ? undefined : "Falta confirmar la dirección",
    },
    {
      t: "Transportadora elegida",
      d: chosen ? `${chosen.carrier} · ${cop(chosen.freight + chosen.codCommission)}` : undefined,
      st: chosen || s ? "done" : "todo",
    },
    { t: "Guía generada", d: s ? s.trackingNumber : undefined, st: s ? "done" : "todo" },
    {
      t:
        status === "incident"
          ? "Novedad en la entrega"
          : status === "delivered"
            ? "Entregado"
            : "En camino",
      d: status === "incident" ? "Esperando al cliente" : undefined,
      st: !s ? "todo" : status === "delivered" ? "done" : status === "incident" ? "bad" : "now",
    },
  ];
  return (
    <ol className="journey" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((x) => (
        <li key={x.t} className={`jstep ${x.st}`}>
          <span className="pt">
            <Icon
              name={
                x.st === "done"
                  ? "check"
                  : x.st === "bad"
                    ? "alert"
                    : x.st === "now"
                      ? "truck"
                      : "circle"
              }
              size={14}
            />
          </span>
          <div>
            <div className="tt">{x.t}</div>
            {x.d && <div className="caption break">{x.d}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Cotizaciones en barras ---------- */
export function QuoteBars({ quotes }: { quotes: OrderRow["quotes"] }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  const rows = [...quotes].sort(
    (a, b) =>
      Number(b.chosen) - Number(a.chosen) ||
      a.freight + a.codCommission - (b.freight + b.codCommission),
  );
  const max = Math.max(...rows.map((q) => q.freight + q.codCommission), 1);
  return (
    <div className="qbars" role="list">
      {rows.map((q) => {
        const total = q.freight + q.codCommission;
        return (
          <div key={q.id} className={`qrow ${q.chosen ? "win" : ""}`} role="listitem">
            <div className="who">
              <strong>
                {q.chosen && (
                  <span title="Elegida por el agente" style={{ marginRight: 4 }}>
                    <Icon name="spark" size={14} />
                  </span>
                )}
                {q.carrier}
              </strong>
              <span className="caption">
                {viaLabel(q.provider)}
                {q.simulated ? " · simulada" : ""} · {days(q.businessDays)}
              </span>
            </div>
            <div className="track" aria-hidden="true">
              <div
                className="fill"
                style={{
                  width: "100%",
                  transform: `scaleX(${on ? Math.max(total / max, 0.12) : 0})`,
                }}
              />
            </div>
            <div className="price num">{cop(total)}</div>
          </div>
        );
      })}
      <p className="caption" style={{ margin: "4px 0 0" }}>
        El total incluye la comisión de recaudo cuando es contraentrega.
      </p>
    </div>
  );
}
