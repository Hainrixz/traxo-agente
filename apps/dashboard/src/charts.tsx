import { useEffect, useId, useMemo, useRef, useState } from "react";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const dayShort = (iso: string): string => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** Paso "redondo" del eje: con 4 intervalos, el techo es 4 × paso. Para conteos solo pasos enteros. */
function niceStep(max: number, integer: boolean): number {
  const raw = Math.max(max, 1) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const mult = integer ? [1, 2, 3, 4, 5, 6, 8, 10] : [1, 2, 2.5, 5, 10];
  const step = (mult.find((m) => m * p >= raw) ?? 10) * p;
  return integer ? Math.max(1, Math.round(step)) : step;
}

export type Point = { date: string; value: number };

/** Línea con área, ejes con etiquetas, tooltip por puntero y por teclado (flechas). Sin librerías. */
export function LineChart({
  data,
  format,
  label,
  height = 220,
  integer = false,
}: {
  data: Point[];
  format: (n: number) => string;
  label: string;
  height?: number;
  integer?: boolean;
}) {
  const [W, setW] = useState(640);
  const m = { l: 46, r: 12, t: 14, b: 28 };
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(
      ([e]) => e && setW(Math.max(280, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    setW(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  const gid = useId().replace(/:/g, "");
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const geom = useMemo(() => {
    const step = niceStep(Math.max(...data.map((d) => d.value), 1), integer);
    const max = step * 4;
    const iw = W - m.l - m.r;
    const ih = height - m.t - m.b;
    const x = (i: number) => m.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => m.t + ih - (v / max) * ih;
    const line = data
      .map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
      .join(" ");
    const area = data.length
      ? `${line} L${x(data.length - 1).toFixed(1)} ${m.t + ih} L${x(0).toFixed(1)} ${m.t + ih} Z`
      : "";
    return { max, step, x, y, line, area, ih, iw };
  }, [data, height, W, integer]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const peak = data.reduce(
    (b, d) => (d.value > b.value ? d : b),
    data[0] ?? { date: "", value: 0 },
  );
  const summary = `${label}: ${data.length} días, total ${format(total)}, máximo ${format(peak.value)} el ${dayShort(peak.date || "2026-01-01")}.`;

  const at = (clientX: number) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r || data.length === 0) return;
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - m.l) / geom.iw) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };
  const sel = hover === null ? null : data[hover];
  const ticks = [0, 1, 2, 3, 4].map((k) => k * geom.step);
  const xl =
    data.length > 1
      ? [
          0,
          Math.floor((data.length - 1) / 3),
          Math.floor(((data.length - 1) * 2) / 3),
          data.length - 1,
        ]
      : [0];

  return (
    <div className="chart" ref={box} style={{ position: "relative" }}>
      <svg
        ref={wrap}
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        role="img"
        aria-label={summary}
        tabIndex={0}
        onPointerMove={(e) => at(e.clientX)}
        onPointerDown={(e) => at(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
          if (e.key === "Escape") setHover(null);
        }}
        style={{ display: "block", touchAction: "pan-y", overflow: "visible" }}
      >
        <title>{summary}</title>
        <defs>
          <clipPath id={`${gid}c`}>
            <rect
              x={m.l}
              y={0}
              width={drawn ? geom.iw + m.r : 0}
              height={height}
              style={{ transition: "width 700ms var(--ease-out)" }}
            />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={m.l}
              x2={W - m.r}
              y1={geom.y(t)}
              y2={geom.y(t)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={m.l - 8}
              y={geom.y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--ink-muted)"
              className="num"
            >
              {format(t)}
            </text>
          </g>
        ))}
        {xl.map((i) => (
          <text
            key={i}
            x={geom.x(i)}
            y={height - 8}
            textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
            fontSize={11}
            fill="var(--ink-muted)"
          >
            {dayShort(data[i]?.date ?? "")}
          </text>
        ))}
        <g clipPath={`url(#${gid}c)`}>
          <path d={geom.area} fill="var(--chart-2-fill)" />
          <path
            d={geom.line}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>
        {sel && hover !== null && (
          <g>
            <line
              x1={geom.x(hover)}
              x2={geom.x(hover)}
              y1={m.t}
              y2={m.t + geom.ih}
              stroke="var(--line-control)"
              strokeDasharray="3 3"
            />
            <circle
              cx={geom.x(hover)}
              cy={geom.y(sel.value)}
              r={5}
              fill="var(--brand)"
              stroke="var(--chart-1)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {sel && hover !== null && (
        <div className="chart-tip" style={{ left: `${(geom.x(hover) / W) * 100}%` }} role="status">
          <strong className="num">{format(sel.value)}</strong>
          <span className="caption">{dayShort(sel.date)}</span>
        </div>
      )}
    </div>
  );
}

/** Barras horizontales con el valor escrito al lado (nunca solo con forma o color). */
export function HBars({
  rows,
  format,
}: {
  rows: Array<{ label: string; value: number; sub?: string; highlight?: boolean }>;
  format: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div className="hbars" role="list">
      {rows.map((r) => (
        <div key={r.label} className={`hrow ${r.highlight ? "hi" : ""}`} role="listitem">
          <div className="hl">
            <strong className="break">{r.label}</strong>
            {r.sub && <span className="caption">{r.sub}</span>}
          </div>
          <div className="htrack" aria-hidden="true">
            <div
              className="hfill"
              style={{ transform: `scaleX(${on ? Math.max(r.value / max, 0.02) : 0})` }}
            />
          </div>
          <div className="hv num">{format(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/** Medidor circular. El color acompaña al número, nunca lo reemplaza. Null = N/A. */
export function Ring({
  value,
  size = 132,
  caption,
}: {
  value: number | null;
  size?: number;
  caption?: string;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const tone =
    value === null
      ? "var(--line-strong)"
      : value >= 80
        ? "var(--success)"
        : value >= 60
          ? "var(--attention)"
          : "var(--critical)";
  const off = value === null ? c : c * (1 - (on ? value : 0) / 100);
  return (
    <div
      className="ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        value === null
          ? "Sin puntaje (N/A)"
          : `Puntaje ${value} de 100${caption ? `. ${caption}` : ""}`
      }
    >
      <svg viewBox="0 0 132 132" width={size} height={size} aria-hidden="true">
        <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="12" />
        <circle
          cx="66"
          cy="66"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 66 66)"
          style={{
            transition: "stroke-dashoffset 900ms var(--ease-out), stroke 300ms var(--ease-out)",
          }}
        />
      </svg>
      <div className="ring-c">
        <span className="v num">{value === null ? "N/A" : value}</span>
        {value !== null && <span className="caption">de 100</span>}
      </div>
    </div>
  );
}

/** Mini línea para tarjetas. */
export function Spark({
  values,
  width = 96,
  height = 28,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map(
    (v, i) =>
      `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / (max - min || 1)) * (height - 4)).toFixed(1)}`,
  );
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--chart-2)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
