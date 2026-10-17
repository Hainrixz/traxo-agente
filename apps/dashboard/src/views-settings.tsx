import { useEffect, useState } from "react";
import { post, useResource } from "./api.ts";
import { EmptyState } from "./components.tsx";
import { cop } from "./format.ts";
import type { Connection, Settings, State, StoreStatus, TemplateRow } from "./types.ts";
import { Banner, Button, ChannelMark, Icon, SampleTag, ToneBadge } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

const CITIES: Array<[string, string]> = [
  ["11001", "Bogotá"],
  ["05001", "Medellín"],
  ["76001", "Cali"],
  ["08001", "Barranquilla"],
  ["66001", "Pereira"],
  ["68001", "Bucaramanga"],
  ["13001", "Cartagena"],
];
const PROVIDERS: Array<[string, string]> = [
  ["", "Sin preferencia"],
  ["envia-com", "Envia.com"],
  ["99envios", "99envios"],
  ["coordinadora", "Coordinadora (directa)"],
  ["servientrega", "Servientrega (directa)"],
  ["interrapidisimo", "Interrapidísimo (directa)"],
  ["envia-co", "Envía (directa)"],
];

/* ============================== CONEXIONES ============================== */
const HUB: Array<[string, string, string]> = [
  ["whatsapp", "WhatsApp", "Confirmaciones y novedades"],
  ["instagram", "Instagram", "Mensajes directos"],
  ["messenger", "Messenger", "Páginas de Facebook"],
  ["facebook", "Facebook Ads", "Campañas en pausa"],
  ["google", "Google Ads", "Búsqueda y Shopping"],
  ["tiktok", "TikTok Ads", "Videos y UGC"],
  ["api", "Tu API o MCP", "Cualquier otra conexión"],
];

export function Conexiones({ ctx, state }: { ctx: Ctx; state: State }) {
  const st = useResource<StoreStatus>("/api/store/status", ctx.tick);
  const [busy, setBusy] = useState(false);
  const groups: Array<[string, string]> = [
    ["tienda", "Tienda"],
    ["envios", "Plataformas y transportadoras"],
    ["mensajeria", "Mensajería"],
    ["anuncios", "Anuncios"],
  ];
  const s = st.data;
  const zernioLive = state.connections.some((c: Connection) => c.name.includes("Zernio") && c.live);
  const connect = async () => {
    setBusy(true);
    const r = await post<{ ok: boolean; products: number; customers: number; orders: number }>(
      "/api/store/import",
    );
    setBusy(false);
    ctx.toast(
      r.ok
        ? `Importé ${r.products} productos, ${r.customers} clientes y ${r.orders} pedidos`
        : "No pude importar la tienda",
    );
    st.reload();
    ctx.refresh();
  };
  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Conexiones</h1>
          <p className="lead">
            Qué es real y qué es simulado. Las llaves se ponen en <span className="mono">.env</span>{" "}
            o en las variables de tu servidor; Traxo nunca las muestra.
          </p>
        </div>
      </div>

      <section className="card" aria-labelledby="store-h" data-tour="store-card">
        <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="store-h">Tu tienda</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {s?.imported
                ? `Conectada · ${s.products} productos, ${s.customers} clientes, ${s.orders} pedidos.`
                : "Todavía no hay datos. Conecta tu tienda y la importo: catálogo, clientes y pedidos."}
            </p>
          </div>
          <ToneBadge tone={s?.imported ? "success" : "attention"}>
            {s?.imported ? "Importada" : "Sin conectar"}
          </ToneBadge>
        </div>
        <div className="plat">
          {(state.demo
            ? [
                ["Tienda de ejemplo", true],
                ["Shopify", false],
                ["Tiendanube", false],
                ["WooCommerce", false],
              ]
            : [
                ["Shopify", s?.platform === "shopify"],
                ["Tiendanube", s?.platform === "tiendanube"],
                ["WooCommerce", s?.platform === "woocommerce"],
              ]
          ).map(([name, on]) => (
            <div key={String(name)} className={`plat-i ${on ? "on" : ""}`}>
              <Icon name={on ? "check" : "plug"} size={16} />
              <span>{String(name)}</span>
              {!on && <span className="caption">con .env</span>}
            </div>
          ))}
        </div>
        {state.demo || s?.connected ? (
          <div className="row" style={{ marginTop: 14 }}>
            <Button
              variant="agent"
              icon="plug"
              onClick={connect}
              disabled={busy}
              data-tour="import"
            >
              {busy
                ? "Importando…"
                : s?.imported
                  ? "Volver a importar"
                  : state.demo
                    ? "Conectar e importar la tienda de ejemplo"
                    : "Importar mi tienda"}
            </Button>
            <span className="caption">
              Trae catálogo, clientes y pedidos. Repetirlo no duplica nada.
            </span>
          </div>
        ) : (
          <Banner tone="attention">
            Todavía no hay una tienda conectada. Corre <span className="mono">/traxo:instalar</span>{" "}
            en Claude Code, o define <span className="mono">SHOPIFY_*</span>,{" "}
            <span className="mono">TIENDANUBE_*</span> o <span className="mono">WOOCOMMERCE_*</span>{" "}
            en tu <span className="mono">.env</span> y reinicia.
          </Banner>
        )}
      </section>

      <section className="card" aria-labelledby="zernio-h" data-tour="zernio">
        <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="zernio-h">Zernio: un solo conector para todo</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Con una llave de Zernio conecto WhatsApp, Instagram, Messenger y tus cuentas de
              anuncios. Todo lo que llega o sale pasa por aquí.
            </p>
          </div>
          <ToneBadge tone={zernioLive ? "success" : "neutral"}>
            {zernioLive ? "Conectado" : "Simulado"}
          </ToneBadge>
        </div>
        <div className="hub" role="list">
          {HUB.map(([id, name, note]) => (
            <div key={id} className="hub-i" role="listitem">
              <span className={`chbadge hub-mark ch-${id}`} aria-hidden="true">
                {["whatsapp", "instagram", "messenger"].includes(id) ? (
                  <ChannelMark channel={id} size={16} />
                ) : (
                  <Icon name={id === "api" ? "plug" : "megaphone"} size={16} />
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <strong>{name}</strong>
                <span className="caption" style={{ display: "block" }}>
                  {note}
                </span>
              </span>
            </div>
          ))}
        </div>
        <ol className="why" style={{ marginTop: 14 }}>
          <li>
            Crea tu cuenta en Zernio y conecta tus páginas (WhatsApp, Instagram, Facebook,
            anuncios).
          </li>
          <li>
            Pon <span className="mono">ZERNIO_API_KEY</span> y{" "}
            <span className="mono">ZERNIO_WEBHOOK_SECRET</span> en tu{" "}
            <span className="mono">.env</span> o en las variables de Railway.
          </li>
          <li>
            Apunta el webhook de Zernio a <span className="mono">/webhooks/messaging</span>. Los
            mensajes aparecen en Mensajes y el agente los atiende.
          </li>
        </ol>
        <p className="caption" style={{ margin: "10px 0 0" }}>
          ¿Otra plataforma? Zernio expone una API, y Traxo también es un servidor MCP: Claude puede
          usar cualquier otro conector (Meta, Google Ads, TikTok) junto a Traxo.
        </p>
      </section>

      {groups.map(([kind, title]) => (
        <section key={kind} className="stack tight" aria-label={title}>
          <h3 className="label" style={{ fontFamily: "var(--font-sans)" }}>
            {title}
          </h3>
          {state.connections
            .filter((c: Connection) => c.kind === kind)
            .map((c) => (
              <div
                key={c.name}
                className="card compact row between"
                style={{ flexWrap: "nowrap", alignItems: "flex-start" }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong className="break">{c.name}</strong>
                  <div className="caption break">{c.note}</div>
                </div>
                <ToneBadge tone={c.live ? "success" : "neutral"}>
                  {c.live ? "Conectada" : "Simulada"}
                </ToneBadge>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}

/* ============================== AJUSTES ============================== */
function Radio<T extends string | number>({
  name,
  value,
  onChange,
  options,
  tour,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string, string]>;
  tour?: string;
}) {
  return (
    <div className="radios" role="radiogroup" aria-label={name}>
      {options.map(([v, label, d]) => (
        <label
          key={String(v)}
          className={`radio ${value === v ? "on" : ""}`}
          data-tour={tour ? `${tour}-${String(v)}` : undefined}
        >
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          <span>
            <strong>{label}</strong>
            <span className="caption">{d}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function Ajustes({ ctx }: { ctx: Ctx }) {
  const state = useResource<State>("/api/state", ctx.tick).data;
  const tpl = useResource<TemplateRow[]>("/api/templates", 0).data ?? [];
  const [f, setF] = useState<Settings>();
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (state && !f) setF(state.settings);
  }, [state, f]);
  if (!f || !state) return <div className="skel" style={{ height: 320 }} aria-hidden="true" />;
  const dirty = JSON.stringify(f) !== JSON.stringify(state.settings);
  const sum = f.weights.cost + f.weights.speed + f.weights.reliability || 1;
  const w = (k: "cost" | "speed" | "reliability", v: number) =>
    setF({ ...f, weights: { ...f.weights, [k]: v } });
  const save = async () => {
    setSaving(true);
    const norm = {
      cost: f.weights.cost / sum,
      speed: f.weights.speed / sum,
      reliability: f.weights.reliability / sum,
    };
    const r = await post<Settings & { ok?: boolean }>("/api/settings", {
      ...f,
      weights: norm,
      preferredProvider: f.preferredProvider || undefined,
    });
    setSaving(false);
    ctx.toast(r && "autonomy" in r ? "Guardé tus ajustes" : "No pude guardar los ajustes");
    ctx.refresh();
    setF(undefined);
  };
  const reset = async () => {
    const r = await post<{ ok: boolean; message: string }>("/api/demo/reset");
    setConfirmReset(false);
    ctx.toast(r.message);
    ctx.refresh();
    setF(undefined);
  };
  const acct = ctx.account;

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Ajustes</h1>
          <p className="lead">
            Cuánta libertad tiene el agente, cuándo confirma con el cliente y cómo elige
            transportadora.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={save}
          disabled={!dirty || saving}
          data-tour="save-settings"
        >
          {saving ? "Guardando…" : dirty ? "Guardar cambios" : "Sin cambios"}
        </Button>
      </div>

      <div className="two eq">
        <section className="card stack" aria-labelledby="au-h">
          <div>
            <h2 id="au-h">Autonomía</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Gastar en anuncios o créditos siempre pide tu aprobación, en cualquier nivel.
            </p>
          </div>
          <Radio
            name="Autonomía"
            value={f.autonomy}
            onChange={(v) => setF({ ...f, autonomy: v as 0 | 1 })}
            options={[
              [
                1,
                "Nivel 1 · Automático",
                "Genero guías, hago seguimiento y aviso al cliente dentro de tu tope.",
              ],
              [
                0,
                "Nivel 0 · Todo con tu aprobación",
                "Preparo todo, incluida la guía, y tú apruebas con un clic.",
              ],
            ]}
          />
          <label className="field">
            <span>Tope por guía sin pedirte permiso</span>
            <input
              className="input"
              type="number"
              min={5000}
              step={5000}
              value={f.maxAutoShipmentCost}
              onChange={(e) =>
                setF({ ...f, maxAutoShipmentCost: Math.max(5000, Number(e.target.value)) })
              }
              disabled={f.autonomy === 0}
            />
            <span className="caption">
              Hoy: {cop(f.maxAutoShipmentCost)}. Sobre ese valor te pido aprobación.
            </span>
          </label>
        </section>

        <section className="card stack" aria-labelledby="cod-h">
          <div>
            <h2 id="cod-h">Confirmar la contraentrega</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Antes de gastar en una guía, le escribo al cliente por WhatsApp para que confirme (o
              pague ahora con descuento).
            </p>
          </div>
          <Radio
            name="Confirmación"
            tour="cod"
            value={f.confirmCod}
            onChange={(v) => setF({ ...f, confirmCod: v as Settings["confirmCod"] })}
            options={[
              ["off", "Nunca", "Genero la guía sin preguntar."],
              ["risky", "Solo si hay riesgo", "Pregunto cuando el puntaje de riesgo es alto."],
              ["all", "Siempre", "Pregunto en toda contraentrega."],
            ]}
          />
          {f.confirmCod === "risky" && (
            <label className="field">
              <span>Pregunto desde un riesgo de {f.riskThreshold}/100</span>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={f.riskThreshold}
                onChange={(e) => setF({ ...f, riskThreshold: Number(e.target.value) })}
              />
              <span className="caption">
                Cliente nuevo + valor alto + dirección vaga suben el riesgo; un cliente que siempre
                recibe lo baja.
              </span>
            </label>
          )}
          <label className="field">
            <span>Descuento por pagar ahora: {f.prepaidDiscountPct} %</span>
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={f.prepaidDiscountPct}
              onChange={(e) => setF({ ...f, prepaidDiscountPct: Number(e.target.value) })}
            />
            <span className="caption">
              Con un pedido prepagado no hay recaudo en riesgo ni comisión de contraentrega.
            </span>
          </label>
        </section>
      </div>

      <section className="card stack" aria-labelledby="car-h">
        <div>
          <h2 id="car-h">Cómo elijo transportadora</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Puntúo cada opción con estos pesos (se normalizan solos) y te explico la decisión.
          </p>
        </div>
        <div className="grid-three">
          {(
            [
              ["cost", "Costo total"],
              ["speed", "Velocidad"],
              ["reliability", "Confiabilidad"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="field">
              <span>
                {label}: {Math.round((f.weights[k] / sum) * 100)} %
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(f.weights[k] * 100)}
                onChange={(e) => w(k, Number(e.target.value) / 100)}
              />
            </label>
          ))}
        </div>
        <div className="grid-three">
          <label className="field">
            <span>Plataforma preferida</span>
            <select
              className="input"
              value={f.preferredProvider ?? ""}
              onChange={(e) => setF({ ...f, preferredProvider: e.target.value || undefined })}
            >
              {PROVIDERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <span className="caption">Gana en empates.</span>
          </label>
          <label className="field">
            <span>Despachas desde</span>
            <select
              className="input"
              value={f.originDane}
              onChange={(e) => setF({ ...f, originDane: e.target.value })}
            >
              {CITIES.map(([d, c]) => (
                <option key={d} value={d}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card stack" aria-labelledby="tp-h">
        <div>
          <h2 id="tp-h">Mensajes que le mando al cliente</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Textos cortos, de tú. Con WhatsApp real, los que abren conversación deben estar
            aprobados por Meta como plantillas de utilidad.
          </p>
        </div>
        <div className="tpls">
          {tpl.map((t) => (
            <div key={t.name} className="tpl">
              <span className="caption mono">{t.name}</span>
              <div className="bubble out" style={{ maxWidth: "100%" }}>
                {t.text}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="two eq">
        <section className="card stack" aria-labelledby="pv-h">
          <h2 id="pv-h">Datos y privacidad (Ley 1581)</h2>
          <ul className="why">
            <li>Solo escribo a clientes con consentimiento; «BAJA» los saca de inmediato.</li>
            <li>En Clientes puedes exportar o borrar los datos personales de cada persona.</li>
            <li>
              Las audiencias de anuncios envían teléfonos cifrados (SHA-256), solo de quienes
              consintieron.
            </li>
            <li>Las llaves nunca se muestran ni salen de tu servidor.</li>
          </ul>
        </section>
        <section className="card stack" aria-labelledby="ac-h">
          <div className="row between">
            <h2 id="ac-h">Tu cuenta</h2>
            <ToneBadge tone={acct.role === "admin" ? "agent" : "neutral"}>
              {state.demo
                ? acct.role === "admin"
                  ? "Admin de ejemplo"
                  : "Cuenta de prueba"
                : "Administrador"}
            </ToneBadge>
          </div>
          <div>
            <strong>{acct.name}</strong>
            <div className="muted break">{acct.email}</div>
          </div>
          {state.demo && <SampleTag />}
          {state.demo && (
            <div className="row">
              <Button icon="play" onClick={ctx.startTour} data-tour="start-tour">
                Ver el recorrido guiado
              </Button>
              {!confirmReset ? (
                <Button onClick={() => setConfirmReset(true)}>Reiniciar datos de ejemplo</Button>
              ) : (
                <>
                  <span className="caption">
                    {acct.role === "admin"
                      ? "Restauro los 90 días de ejemplo."
                      : "Dejo tu espacio vacío otra vez."}
                  </span>
                  <Button variant="primary" onClick={reset}>
                    Sí, reiniciar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                    No
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      {!state && <EmptyState title="Cargando" />}
      <Banner tone="neutral">Los cambios se aplican a los pedidos que lleguen desde ahora.</Banner>
    </div>
  );
}
