import { useEffect, useMemo, useRef, useState } from "react";
import { post, useResource } from "./api.ts";
import { EmptyState } from "./components.tsx";
import { cop, phoneEs } from "./format.ts";
import type { Channel, Conversation } from "./types.ts";
import { Button, CHANNELS, ChannelMark, Icon, StatusBadge, ToneBadge } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const FILTERS: Array<["todos" | Channel, string]> = [
  ["todos", "Todos"],
  ["whatsapp", "WhatsApp"],
  ["instagram", "Instagram"],
  ["messenger", "Messenger"],
];

const slug = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");

/** El "dónde lo encuentras" de cada canal: teléfono en WhatsApp, @usuario en Instagram, nombre en Messenger. */
const handle = (c: Conversation): string =>
  c.channel === "instagram"
    ? `@${slug(c.customer.name)}`
    : c.channel === "messenger"
      ? "Messenger"
      : phoneEs(c.customer.phone);

const short = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  const y = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const dayLabel = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoy";
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return "Ayer";
  const t = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const clock = (iso: string): string =>
  new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });

function Avatar({ c, size = 40 }: { c: Conversation; size?: number }) {
  return (
    <span className="avatar chav" style={{ width: size, height: size }} aria-hidden="true">
      {c.customer.name.slice(0, 1)}
      <span className={`chbadge ch-${c.channel}`}>
        <ChannelMark channel={c.channel} size={11} />
      </span>
    </span>
  );
}

export function Mensajes({ ctx }: { ctx: Ctx }) {
  const { data } = useResource<Conversation[]>("/api/conversations", ctx.tick);
  const [open, setOpen] = useState<string>();
  const [filter, setFilter] = useState<"todos" | Channel>("todos");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const narrow = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;
  const all = data ?? [];
  const counts = useMemo(() => {
    const m: Record<string, number> = { todos: all.length };
    for (const c of all) m[c.channel] = (m[c.channel] ?? 0) + 1;
    return m;
  }, [all]);
  const list = all.filter(
    (c) =>
      (filter === "todos" || c.channel === filter) &&
      (!q.trim() ||
        `${c.customer.name} ${handle(c)}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  const conv = all.find((c) => c.id === (open ?? (narrow ? undefined : list[0]?.id)));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setText(""), [conv?.id]);
  useEffect(() => {
    const el = end.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv?.messages.length, conv?.id]);

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

  const inbox = (
    <section
      className="msg-list"
      aria-label="Bandeja de mensajes"
      style={conv && narrow ? { display: "none" } : undefined}
    >
      <div className="msg-list-head">
        <h1>Mensajes</h1>
        <label className="msg-search">
          <Icon name="search" size={16} />
          <input
            className="input"
            placeholder="Buscar contacto"
            aria-label="Buscar contacto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="chips" role="tablist" aria-label="Canal">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              className="chip"
              aria-selected={filter === k}
              aria-label={k === "todos" ? undefined : `${label} ${counts[k] ?? 0}`}
              title={label}
              onClick={() => setFilter(k)}
            >
              {k === "todos" ? "Todos" : <ChannelMark channel={k} size={15} />}
              <span className="n">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="msg-items">
        {list.map((c) => {
          const last = c.messages.at(-1);
          const waiting = last?.direction === "in";
          return (
            <button
              key={c.id}
              type="button"
              className="msg-item"
              aria-current={c.id === conv?.id}
              onClick={() => setOpen(c.id)}
            >
              <Avatar c={c} />
              <span className="msg-main">
                <span className="msg-top">
                  <strong className="break">{c.customer.name}</strong>
                  <span className="caption">{last ? short(last.at) : ""}</span>
                </span>
                <span className="msg-prev">
                  {last
                    ? `${last.direction === "out" ? "Traxo: " : ""}${last.text}`
                    : "Sin mensajes"}
                </span>
              </span>
              {waiting && (
                <span className="dot-new" role="img" aria-label="El cliente escribió último" />
              )}
            </button>
          );
        })}
        {list.length === 0 && (
          <EmptyState
            icon="chat"
            title={all.length ? "Nadie coincide" : "Aún no hay conversaciones"}
            text={
              all.length
                ? "Prueba con otro canal o con otro nombre."
                : "Aparecen cuando le aviso a un cliente que su pedido va en camino."
            }
          />
        )}
      </div>
      <p className="caption msg-foot">
        <Icon name="plug" size={14} /> WhatsApp, Instagram y Messenger llegan por un solo conector:
        Zernio.
      </p>
    </section>
  );

  const days = conv
    ? conv.messages.reduce<Array<{ label: string; items: Conversation["messages"] }>>((acc, m) => {
        const label = dayLabel(m.at);
        const g = acc.at(-1);
        if (g && g.label === label) g.items.push(m);
        else acc.push({ label, items: [m] });
        return acc;
      }, [])
    : [];

  const thread = conv && (
    <section className="msg-thread" aria-label={`Chat con ${conv.customer.name}`}>
      <header className="msg-head">
        {narrow && (
          <Button
            variant="ghost"
            icon="back"
            aria-label="Volver a los mensajes"
            onClick={() => setOpen(undefined)}
          >
            {""}
          </Button>
        )}
        <Avatar c={conv} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="break">{conv.customer.name}</h2>
          <span className="caption row" style={{ gap: 6 }}>
            <span className={`chtag ch-${conv.channel}`}>
              <ChannelMark channel={conv.channel} size={12} /> {CHANNELS[conv.channel].label}
            </span>
            <span className="mono">{handle(conv)}</span>
          </span>
        </div>
        <span className="msg-agent">
          <ToneBadge tone="agent">Lo atiende Traxo</ToneBadge>
        </span>
      </header>
      <div className="msg-body" role="log" aria-live="polite">
        {days.map((g) => (
          <div key={g.label} className="msg-day">
            <span className="msg-daychip">{g.label}</span>
            {g.items.map((m, i) => (
              <div
                key={m.id}
                className={`bubble ${m.direction}${g.items[i - 1]?.direction === m.direction ? " cont" : ""}`}
              >
                {m.text}
                <div className="meta">
                  {m.direction === "out" ? "Traxo" : conv.customer.name.split(" ")[0]} ·{" "}
                  {clock(m.at)}
                  {m.template ? " · plantilla" : ""}
                  {m.simulated ? " · simulado" : ""}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div ref={end} />
      </div>
      <footer className="msg-compose">
        <input
          className="input"
          placeholder="Escribe como el cliente…"
          aria-label="Responder como el cliente"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && reply()}
        />
        <Button variant="primary" icon="send" onClick={reply} disabled={!text.trim()}>
          Enviar
        </Button>
      </footer>
      <p className="caption msg-hint">
        Prueba con «Sí, mañana estoy», «No lo quiero» o una dirección nueva. En la demo nada sale de
        verdad.
      </p>
    </section>
  );

  const info = conv && (
    <aside className="msg-info" aria-label="Contacto">
      <Avatar c={conv} size={56} />
      <h3 className="break">{conv.customer.name}</h3>
      <span className="caption mono">{handle(conv)}</span>
      <dl>
        <div>
          <dt>Ciudad</dt>
          <dd>{conv.customer.city ?? "N/A"}</dd>
        </div>
        <div>
          <dt>Consentimiento</dt>
          <dd>
            {conv.customer.optOutAt
              ? "Pidió no recibir más (BAJA)"
              : conv.customer.whatsappConsent
                ? "Aceptó mensajes"
                : "Sin consentimiento"}
          </dd>
        </div>
      </dl>
      <h4 className="label">Últimos pedidos</h4>
      <ul className="msg-orders">
        {conv.customer.orders.map((o) => (
          <li key={o.number}>
            <span className="mono">{o.number}</span>
            <span className="num">{cop(o.total)}</span>
            <StatusBadge status={o.status} />
          </li>
        ))}
        {conv.customer.orders.length === 0 && <li className="caption">Todavía sin pedidos.</li>}
      </ul>
    </aside>
  );

  return (
    <div className="msgs" data-tour="inbox">
      {inbox}
      {thread ??
        (!narrow && (
          <section className="msg-thread empty">
            <EmptyState
              icon="chat"
              title="Elige una conversación"
              text="Aquí ves lo que le escribí a cada cliente."
            />
          </section>
        ))}
      {!narrow && info}
    </div>
  );
}
