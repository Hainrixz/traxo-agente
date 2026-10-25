// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { ReactNode } from "react";
import { cop, timeEs } from "./format.ts";

/* ---------- Iconos: trazo 1,75, 24×24, puntas redondeadas, currentColor. `spark` es solo del agente. ---------- */
const PATHS: Record<string, ReactNode> = {
  spark: (
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
  ),
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8z" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  box: <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9zM3 7.5L12 12l9-4.5M12 12v9" />,
  truck: <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8zM6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alert: <path d="M12 4l9 16H3L12 4zM12 10v4M12 17v.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chat: <path d="M4 5h16v11H9l-5 4V5z" />,
  megaphone: <path d="M3 10v4h4l8 4V6L7 10H3zM18 9a4 4 0 0 1 0 6" />,
  plug: <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4" />,
  clock: <path d="M12 7v5l3 2M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" />,
  coin: (
    <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zM14.5 9.5c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.4.7-2.4 1.8 0 2.4 5 1.1 5 3.7 0 1.1-1.1 1.9-2.6 1.9-1.2 0-2.2-.5-2.7-1.4M12 6.5v1.8M12 15.7v1.8" />
  ),
  circle: <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z" />,
  play: <path d="M7 5l12 7-12 7V5z" />,
  refresh: <path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  sun: (
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
  ),
  send: <path d="M4 12l16-8-6 16-3-7-7-1z" />,
  copy: <path d="M8 8h11v12H8zM5 16V4h11" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0" />,
  logout: <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  search: <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />,
  users: (
    <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
  ),
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  chevron: <path d="M7 14l5-5 5 5" />,
  chevdown: <path d="M7 10l5 5 5-5" />,
  back: <path d="M15 5l-7 7 7 7" />,
  map: (
    <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
  layout: <path d="M4 5h16v14H4zM4 10h16M10 10v9" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? PATHS.circle}
    </svg>
  );
}

/* ---------- Marca (aproximación hecha con formas simples; reemplazar por el archivo oficial) ---------- */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="10" y="10" width="40" height="9" fill="currentColor" />
      <rect x="25" y="19" width="10" height="20" fill="currentColor" />
      <circle cx="30" cy="48" r="7" fill="var(--brand)" />
    </svg>
  );
}

export function AgentMark({ working = false, size = 16 }: { working?: boolean; size?: number }) {
  return (
    <span className={`pulse ${working ? "on" : ""}`} style={{ color: "var(--agent-line)" }}>
      <Icon name="spark" size={size} />
    </span>
  );
}

/* ---------- Estados: siempre color + ícono + texto ---------- */
export type Tone = "neutral" | "progress" | "success" | "attention" | "critical" | "agent";
const TONE_ICON: Record<Tone, string> = {
  neutral: "circle",
  progress: "truck",
  success: "check",
  attention: "alert",
  critical: "x",
  agent: "spark",
};

export const STATUS: Record<string, { tone: Tone; label: string }> = {
  created: { tone: "neutral", label: "Guía creada" },
  pickup_scheduled: { tone: "progress", label: "Recogida programada" },
  picked_up: { tone: "progress", label: "Recogido" },
  in_transit: { tone: "progress", label: "En tránsito" },
  out_for_delivery: { tone: "progress", label: "En reparto" },
  delivered: { tone: "success", label: "Entregado" },
  incident: { tone: "attention", label: "Novedad" },
  returning: { tone: "critical", label: "En devolución" },
  returned: { tone: "critical", label: "Devuelto" },
  cancelled: { tone: "neutral", label: "Cancelado" },
  received: { tone: "neutral", label: "Recibido" },
  cancelled_order: { tone: "neutral", label: "Cancelado" },
  shipped: { tone: "progress", label: "Enviado" },
  pending: { tone: "attention", label: "Esperando tu aprobación" },
  approved: { tone: "success", label: "Aprobada" },
  rejected: { tone: "neutral", label: "Rechazada" },
  DRAFT: { tone: "neutral", label: "Borrador" },
  PAUSED: { tone: "progress", label: "En pausa" },
  ACTIVE: { tone: "success", label: "Activa (la activaste tú)" },
  SYNC_SIMULADO: { tone: "progress", label: "Lista para Meta (simulado)" },
  awaiting_confirmation: { tone: "attention", label: "Esperando confirmación" },
  confirmed: { tone: "progress", label: "Confirmado" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return (
    <span className={`badge tone-${s.tone}`}>
      <Icon name={TONE_ICON[s.tone]} size={14} />
      {s.label}
    </span>
  );
}

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`badge tone-${tone}`}>
      <Icon name={TONE_ICON[tone]} size={14} />
      {children}
    </span>
  );
}

export const PaymentBadge = ({ payment }: { payment: string }) =>
  payment === "cod" ? (
    <span className="cod">
      <Icon name="coin" size={14} />
      Contraentrega
    </span>
  ) : (
    <span className="badge tone-neutral">Prepagado</span>
  );

/** Recaudo (peso 700), flete (500, con camión) y costo (rojo con signo −) se distinguen por etiqueta, peso e ícono. */
export function Money({
  value,
  kind = "recaudo",
}: {
  value: number;
  kind?: "recaudo" | "flete" | "costo";
}) {
  if (kind === "flete")
    return (
      <span
        className="num muted"
        style={{ fontWeight: 500, display: "inline-flex", gap: 4, alignItems: "center" }}
      >
        <Icon name="truck" size={14} />
        Flete {cop(value)}
      </span>
    );
  if (kind === "costo")
    return (
      <span className="num" style={{ color: "var(--critical)", fontWeight: 600 }}>
        Costo {cop(-Math.abs(value))}
      </span>
    );
  return (
    <span className="num" style={{ fontWeight: 700 }}>
      {cop(value)}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  hero,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hero?: boolean;
  hint?: string;
}) {
  return (
    <div className={`kpi ${hero ? "hero" : ""}`}>
      <span className="label">{label}</span>
      <span className="value num">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
      {hint && <span className="caption">{hint}</span>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`banner tone-${tone}`} role="status">
      <Icon name={TONE_ICON[tone]} />
      <div>{children}</div>
    </div>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "agent" | "ghost" | "";
  sm?: boolean;
  disabled?: boolean;
  icon?: string;
  title?: string;
  type?: "button" | "submit";
  "data-tour"?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type={props.type ?? "button"}
      className={`btn ${props.variant ?? ""} ${props.sm ? "sm" : ""}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      data-tour={props["data-tour"]}
      aria-label={props["aria-label"]}
    >
      {props.icon && <Icon name={props.icon} size={16} />}
      {props.children}
    </button>
  );
}

/* ---------- Actividad del agente ---------- */
export type AgentEv = { id: string; at: string; kind: string; summary: string; orderId?: string };

const KIND_ICON: Record<string, string> = {
  "order.received": "box",
  "address.normalized": "check",
  "quotes.requested": "refresh",
  "quotes.received": "truck",
  "carrier.selected": "spark",
  "approval.requested": "alert",
  "shipment.created": "truck",
  "fulfillment.written": "check",
  "message.sent": "chat",
  "tracking.updated": "truck",
  "incident.detected": "alert",
  "incident.resolved": "check",
  "marketing.draft": "megaphone",
  error: "x",
};

export function AgentActivityEntry({
  e,
  fresh,
  tag,
}: {
  e: AgentEv;
  fresh?: boolean;
  tag?: string;
}) {
  const cls =
    e.kind === "error"
      ? "err"
      : e.kind === "approval.requested" || e.kind === "incident.detected"
        ? "ask"
        : "";
  return (
    <div className={`entry ${cls} ${fresh ? "enter" : ""}`}>
      <span className="dot">
        <Icon name={KIND_ICON[e.kind] ?? "spark"} size={15} />
      </span>
      <span className="txt">
        {tag && <span className="tag">{tag}</span>}
        {e.summary}
      </span>
      <span className="caption num">{timeEs(e.at)}</span>
    </div>
  );
}

/* ---------- Timeline de guía ---------- */
export type TrackEv = { id: string; status: string; description: string; at: string };
export function ShipmentTimeline({ events }: { events: TrackEv[] }) {
  return (
    <div className="timeline">
      {events.map((e) => {
        const s = STATUS[e.status] ?? { tone: "neutral" as Tone, label: e.status };
        return (
          <div className="tl" key={e.id}>
            <span className={`pt tone-${s.tone}`}>
              <Icon name={TONE_ICON[s.tone]} size={12} />
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>{e.description}</div>
              <div className="caption num">{timeEs(e.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pestañas accesibles (flechas izquierda/derecha). */
export function Tabs({
  items,
  value,
  onChange,
  label,
}: {
  items: Array<[string, string]>;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    const to = items[(next + items.length) % items.length];
    if (to) {
      onChange(to[0]);
      (
        e.currentTarget.parentElement?.children[(next + items.length) % items.length] as
          | HTMLElement
          | undefined
      )?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map(([id, text], i) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={value === id}
          tabIndex={value === id ? 0 : -1}
          className="tabs-btn"
          onClick={() => onChange(id)}
          onKeyDown={(e) => move(e, i)}
          data-tour={`tab-${id}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

const PALETTES: Array<[string, string, string]> = [
  ["#FFC805", "#141414", "#FFF7DC"],
  ["#2B2B29", "#FFC805", "#F4F3EF"],
  ["#B04A12", "#FFDE6B", "#FFF7DC"],
  ["#1E7A45", "#FFEDB0", "#F4F3EF"],
  ["#3D3D3A", "#F59A5E", "#FFF7DC"],
];

/** Arte de ejemplo determinista para los creativos simulados (no es una imagen generada). */
export function CreativeArt({
  seed,
  label,
  kind,
}: {
  seed: string;
  label: string;
  kind: "image" | "video";
}) {
  let h = 0;
  for (const ch of seed) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  const [a, b, c] = PALETTES[Math.abs(h) % PALETTES.length] as [string, string, string];
  const cx = 120 + (Math.abs(h >> 3) % 160);
  const id = `g${Math.abs(h)}`;
  return (
    <svg
      viewBox="0 0 400 400"
      className="art"
      role="img"
      aria-label={`Creativo de ejemplo: ${label}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill={`url(#${id})`} />
      <circle cx={cx} cy="170" r="92" fill={c} fillOpacity=".92" />
      <ellipse cx={cx} cy="170" rx="38" ry="62" fill={a} transform={`rotate(24 ${cx} 170)`} />
      <path
        d={`M${cx - 6} 112 C ${cx + 10} 150, ${cx - 14} 190, ${cx + 6} 230`}
        stroke={b}
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
      />
      <rect y="292" width="400" height="108" fill="#000" fillOpacity=".34" />
      <text
        x="24"
        y="338"
        fill="#fff"
        fontSize="26"
        fontWeight="800"
        fontFamily="Archivo, sans-serif"
      >
        {label.length > 24 ? `${label.slice(0, 23)}…` : label}
      </text>
      <text
        x="24"
        y="368"
        fill="#fff"
        fillOpacity=".85"
        fontSize="16"
        fontFamily="Geist, sans-serif"
      >
        Pide y paga al recibir
      </text>
      {kind === "video" && (
        <g>
          <circle cx="344" cy="56" r="26" fill="#000" fillOpacity=".5" />
          <path d="M336 44 L360 56 L336 68 Z" fill="#fff" />
        </g>
      )}
    </svg>
  );
}

export const PLATFORM: Record<string, string> = {
  meta: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
};
export const PlatformBadge = ({ p }: { p: string }) => (
  <span className="badge tone-neutral">{PLATFORM[p] ?? p}</span>
);

/** Etiqueta para todo lo que no sale de una tienda real. */
export const SampleTag = () => (
  <span className="badge tone-agent" title="Datos de ejemplo de la demo">
    Datos de ejemplo
  </span>
);

/** Canales de mensajería: todos llegan por Zernio (WhatsApp, Instagram y Messenger). */
export const CHANNELS = {
  whatsapp: { label: "WhatsApp", short: "WA" },
  instagram: { label: "Instagram", short: "IG" },
  messenger: { label: "Messenger", short: "MS" },
} as const;

/** Marca pequeña de cada canal (trazos propios, no los logos oficiales). */
export function ChannelMark({ channel, size = 16 }: { channel: string; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  if (channel === "instagram")
    return (
      <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.6" />
        <circle cx="17" cy="7" r=".6" fill="currentColor" />
      </svg>
    );
  if (channel === "messenger")
    return (
      <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.8 0 2.4 1.1 4.5 2.9 5.9V21l3-1.7c.8.2 1.7.4 2.6.4 4.7 0 8.5-3.4 8.5-7.8S16.7 3.5 12 3.5z" />
        <path
          d="M7.5 13.6l3.3-3.5 2.4 2 3.3-2.5-3.4 3.6-2.4-2-3.2 2.4z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
  return (
    <svg
      {...p}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20l1.3-4.2A8.2 8.2 0 1 1 8.4 18.8L4 20z" />
      <path
        d="M9.2 9.2c.2 2.4 2.4 4.6 5 5.2l1-1.2-1.7-.9-.8.6c-.8-.3-1.5-1-1.9-1.9l.6-.8-.8-1.7-1.4.7z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
