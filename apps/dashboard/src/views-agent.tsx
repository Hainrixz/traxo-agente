import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { get, post } from "./api.ts";
import { AgentMark, Button, Icon, ToneBadge } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

type Reply = {
  answer: string;
  kpis?: Array<{ label: string; value: string; hint?: string }>;
  links?: Array<{ label: string; view: string }>;
  sources: string[];
  suggestions: string[];
  mode: "datos" | "claude";
};
type Turn = { id: number; role: "user" | "agent"; text: string; reply?: Reply };

/** **negritas** y viñetas «• » del agente, sin HTML de por medio. */
function Rich({ text }: { text: string }): ReactNode {
  return text.split("\n").map((line, i) => {
    const parts = line
      .split(/(\*\*[^*]+\*\*)/g)
      .map((p, j) =>
        p.startsWith("**") ? (
          <strong key={`${i}-${j}`}>{p.slice(2, -2)}</strong>
        ) : (
          <Fragment key={`${i}-${j}`}>{p}</Fragment>
        ),
      );
    return (
      <p key={`${i}-${line.slice(0, 12)}`} className={line.startsWith("•") ? "ag-li" : undefined}>
        {parts}
      </p>
    );
  });
}

const STARTERS: Array<[string, string, string]> = [
  ["Resumen de hoy", "Cómo vamos esta semana y qué espera tu atención", "home"],
  ["¿Qué anuncio funciona y cuál no?", "ROAS real de cada campaña", "megaphone"],
  ["¿Qué pedidos tienen novedad?", "Guías con problemas de entrega", "alert"],
  ["¿Qué debo arreglar primero en mi tienda?", "Lo más importante de tu SEO", "search"],
  ["¿Qué clientes puedo reactivar?", "Recompra con consentimiento", "users"],
  ["¿Cuánto tengo por cobrar en contraentrega?", "Recaudo pendiente", "coin"],
];

export function Agente({ ctx }: { ctx: Ctx }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const n = useRef(0);
  useEffect(() => {
    get<{ llm: boolean }>("/api/assistant/suggestions")
      .then((r) => setLlm(r.llm))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const el = end.current?.parentElement;
    if (el && turns.length > 0) el.scrollTop = el.scrollHeight;
  }, [turns.length, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setTurns((t) => [...t, { id: ++n.current, role: "user", text: question }]);
    setBusy(true);
    try {
      const [r] = await Promise.all([
        post<Reply>("/api/assistant/ask", {
          question,
          history: turns.slice(-6).map((t) => ({
            role: t.role === "user" ? "user" : "assistant",
            content: t.text,
          })),
        }),
        new Promise((ok) => setTimeout(ok, 550)),
      ]);
      setTurns((t) => [...t, { id: ++n.current, role: "agent", text: r.answer, reply: r }]);
    } catch {
      setTurns((t) => [
        ...t,
        {
          id: ++n.current,
          role: "agent",
          text: "No pude consultar tus datos ahora. Intenta de nuevo en un momento.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };
  const last = turns.findLast((t) => t.role === "agent")?.reply;

  return (
    <div className="agentview" data-tour="agent">
      <header className="agent-head">
        <span className="agent-badge" aria-hidden="true">
          <AgentMark working={busy} size={22} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>Agente</h1>
          <p className="muted" style={{ margin: 0 }}>
            Pregúntame lo que quieras de tu negocio. Respondo con tus datos reales: pedidos, envíos,
            anuncios, clientes y tienda.
          </p>
        </div>
        <ToneBadge tone={llm ? "agent" : "neutral"}>
          {llm ? "Con Claude" : "Con tus datos"}
        </ToneBadge>
      </header>

      <div
        className="agent-body"
        role="log"
        aria-live="polite"
        aria-label="Conversación con el agente"
      >
        {turns.length === 0 && (
          <div className="agent-start">
            <div className="agent-hello">
              <AgentMark size={20} />
              <div>
                <strong>Hola, soy tu agente.</strong>
                <p>
                  Veo todo lo que pasa en tu tienda y lo puedo resumir cuando quieras. No toco
                  dinero ni cuentas sin tu aprobación.
                </p>
              </div>
            </div>
            <div className="agent-cards" data-tour="agent-starters">
              {STARTERS.map(([q, d, icon]) => (
                <button key={q} type="button" className="agent-card" onClick={() => ask(q)}>
                  <span className="avatar" aria-hidden="true">
                    <Icon name={icon} size={18} />
                  </span>
                  <span>
                    <strong>{q}</strong>
                    <span className="caption">{d}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="ag-msg user">
              {t.text}
            </div>
          ) : (
            <div key={t.id} className="ag-msg agent-m">
              <span className="ag-av" aria-hidden="true">
                <AgentMark size={16} />
              </span>
              <div className="ag-card">
                <Rich text={t.text} />
                {t.reply?.kpis && t.reply.kpis.length > 0 && (
                  <div className="ag-kpis">
                    {t.reply.kpis.map((k) => (
                      <div key={k.label} className="ag-kpi">
                        <span className="caption">{k.label}</span>
                        <strong className="num">{k.value}</strong>
                        {k.hint && <span className="caption">{k.hint}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {t.reply?.links && t.reply.links.length > 0 && (
                  <div className="row">
                    {t.reply.links.map((l) => (
                      <Button key={l.view} sm onClick={() => ctx.go(l.view)}>
                        {l.label}
                      </Button>
                    ))}
                  </div>
                )}
                {t.reply && t.reply.sources.length > 0 && (
                  <span className="caption ag-src">Fuentes: {t.reply.sources.join(" · ")}</span>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="ag-msg agent-m">
            <span className="ag-av" aria-hidden="true">
              <AgentMark working size={16} />
            </span>
            <div
              className="ag-card typing"
              role="status"
              aria-label="El agente está consultando tus datos"
            >
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {last && last.suggestions.length > 0 && !busy && (
        <div className="ag-follow" aria-label="Preguntas sugeridas">
          {last.suggestions.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => ask(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="agent-compose"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input
          className="input"
          placeholder="Pregunta algo sobre tu negocio…"
          aria-label="Pregunta para el agente"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button variant="primary" icon="send" type="submit" disabled={!text.trim() || busy}>
          Preguntar
        </Button>
      </form>
    </div>
  );
}
