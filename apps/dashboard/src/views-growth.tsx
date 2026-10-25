// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { useEffect, useMemo, useState } from "react";
import { del, get, post, useResource } from "./api.ts";
import { HBars } from "./charts.tsx";
import { EmptyState, Sheet } from "./components.tsx";
import { cop, copShort, dateEs, phoneEs, plural } from "./format.ts";
import type {
  Attribution,
  AudienceRow,
  CampaignFull,
  CustomersResp,
  MediaAsset,
  Product,
  Suggestion,
} from "./types.ts";
import {
  Banner,
  Button,
  CreativeArt,
  Icon,
  PLATFORM,
  PlatformBadge,
  SampleTag,
  StatusBadge,
  Tabs,
  ToneBadge,
} from "./ui.tsx";
import type { Ctx } from "./views.tsx";
import { Biblioteca, MediaPicker, MediaThumb } from "./views-media.tsx";

const LIMITS = {
  meta: { h: 40, t: 125, d: 30 },
  google: { h: 30, t: 90, d: 90 },
  tiktok: { h: 40, t: 100, d: 100 },
} as const;

/* ============================== CLIENTES ============================== */
const SEG: Array<[string, string, string]> = [
  ["recompra", "Recompran", "Ya compraron 2 veces o más"],
  ["nuevo", "Nuevos", "Primera compra en 30 días"],
  ["inactivo", "Inactivos", "Sin comprar hace más de 60 días"],
  ["sin_consentimiento", "Sin consentimiento", "No se les escribe por WhatsApp"],
];
const COPY: Record<string, string> = {
  recompra:
    "Hola, gracias por volver a pedir a Café de Origen. Esta semana tienes envío prioritario en tu próximo pedido. ¿Te lo preparo?",
  nuevo:
    "Hola, ¿cómo te fue con tu primer café de Café de Origen? Si quieres repetir, te guardo el mismo pedido.",
  inactivo:
    "Hola, hace rato no pasas por Café de Origen. Llegó cosecha nueva y te dejo el pedido listo con contraentrega. ¿Lo quieres?",
};

export function Clientes({ ctx }: { ctx: Ctx }) {
  const { data, reload } = useResource<CustomersResp>("/api/customers", ctx.tick);
  const auds = useResource<AudienceRow[]>("/api/audiences", ctx.tick);
  const [seg, setSeg] = useState<string>("inactivo");
  const [text, setText] = useState(COPY.inactivo ?? "");
  const [preview, setPreview] = useState<{ recipients: number; excluded: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [target, setTarget] = useState<{ id: string; name: string } | undefined>();
  const customers = (data?.customers ?? [])
    .filter((c) => seg === "all" || c.segments.includes(seg))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 25);
  const sendable = seg !== "sin_consentimiento";

  useEffect(() => {
    if (!sendable || text.trim().length < 10) {
      setPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      const r = await post<{ ok: boolean; recipients: number; excluded: number }>(
        "/api/broadcasts",
        { segment: seg, text },
      );
      if (r.ok) setPreview({ recipients: r.recipients, excluded: r.excluded });
    }, 300);
    return () => clearTimeout(t);
  }, [seg, text, sendable, ctx.tick]);

  const pick = (s: string) => {
    setSeg(s);
    setConfirm(false);
    if (COPY[s]) setText(COPY[s] as string);
  };
  const send = async () => {
    const r = await post<{ ok: boolean; sent?: number; message?: string; simulated?: boolean }>(
      "/api/broadcasts",
      { segment: seg, text, confirm: true },
    );
    setConfirm(false);
    ctx.toast(
      r.ok
        ? `Envié el mensaje a ${r.sent} clientes${r.simulated ? " (simulado: nada salió de verdad)" : ""}`
        : (r.message ?? "No se pudo enviar"),
    );
    ctx.refresh();
  };
  const makeAudience = async () => {
    const r = await post<{ ok: boolean; audience?: AudienceRow; message?: string }>(
      "/api/audiences",
      { segment: seg },
    );
    ctx.toast(
      r.ok
        ? `Audiencia creada: ${r.audience?.size} clientes con consentimiento`
        : (r.message ?? "No se pudo"),
    );
    auds.reload();
  };
  const exportOne = async (id: string, name: string) => {
    const r = await get<{ customer: unknown }>(`/api/customers/${id}/export`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
    );
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `cliente-${name.toLowerCase().replace(/\W+/g, "-")}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  const erase = async () => {
    if (!target) return;
    const r = await del<{ ok: boolean }>(`/api/customers/${target.id}`);
    ctx.toast(r.ok ? `Borré los datos personales de ${target.name}` : "No se pudo borrar");
    setTarget(undefined);
    reload();
    ctx.refresh();
  };

  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Clientes</h1>
          <p className="lead">
            La base que fui armando con tus pedidos. Solo les escribo a quienes dieron su
            consentimiento y respeto la baja.
          </p>
        </div>
      </div>

      <div className="seg-grid" role="group" aria-label="Segmentos">
        {SEG.map(([id, label, d]) => (
          <button
            key={id}
            type="button"
            className="seg"
            aria-pressed={seg === id}
            onClick={() => pick(id)}
            data-tour={`seg-${id}`}
          >
            <span className="label">{label}</span>
            <span className="v num">{data?.segments[id] ?? "—"}</span>
            <span className="caption">{d}</span>
          </button>
        ))}
      </div>

      <section className="card" aria-labelledby="cl-h">
        <div className="row between" style={{ marginBottom: 8 }}>
          <h2 id="cl-h">{SEG.find((s) => s[0] === seg)?.[1] ?? "Clientes"}</h2>
          <button type="button" className="btn ghost sm" onClick={() => pick("all")}>
            Ver todos
          </button>
        </div>
        <div className="only-wide scroll-x">
          <table className="table">
            <caption className="sr-only">Clientes</caption>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Ciudad</th>
                <th scope="col" className="right">
                  Pedidos
                </th>
                <th scope="col" className="right">
                  Gastado
                </th>
                <th scope="col">WhatsApp</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <br />
                    <span className="caption mono">{phoneEs(c.phone)}</span>
                  </td>
                  <td>{c.city ?? "—"}</td>
                  <td className="right num">{c.orders}</td>
                  <td className="right num nowrap">{cop(c.spent)}</td>
                  <td>
                    <ToneBadge
                      tone={c.optOut ? "critical" : c.whatsappConsent ? "success" : "neutral"}
                    >
                      {c.optOut
                        ? "Pidió la baja"
                        : c.whatsappConsent
                          ? "Con consentimiento"
                          : "Sin consentimiento"}
                    </ToneBadge>
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <Button
                        sm
                        variant="ghost"
                        onClick={() => exportOne(c.id, c.name)}
                        aria-label={`Exportar datos de ${c.name}`}
                      >
                        Exportar
                      </Button>
                      <Button
                        sm
                        variant="ghost"
                        onClick={() => setTarget({ id: c.id, name: c.name })}
                        aria-label={`Borrar datos de ${c.name}`}
                      >
                        Borrar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="only-narrow">
          {customers.map((c) => (
            <div key={c.id} className="ocard" style={{ cursor: "default" }}>
              <span className="l1">
                <span className="name">{c.name}</span>
                <ToneBadge tone={c.optOut ? "critical" : c.whatsappConsent ? "success" : "neutral"}>
                  {c.optOut ? "Baja" : c.whatsappConsent ? "Consiente" : "Sin consentimiento"}
                </ToneBadge>
              </span>
              <span className="caption">
                {c.city ?? "—"} · {c.orders} {plural(c.orders, "pedido", "pedidos")} ·{" "}
                {cop(c.spent)}
              </span>
              <span className="row">
                <Button sm onClick={() => exportOne(c.id, c.name)}>
                  Exportar
                </Button>
                <Button sm onClick={() => setTarget({ id: c.id, name: c.name })}>
                  Borrar datos
                </Button>
              </span>
            </div>
          ))}
        </div>
        {customers.length === 0 && (
          <EmptyState
            icon="user"
            title="Sin clientes en este segmento"
            text="Importa tu tienda o simula pedidos para que arme la base."
          />
        )}
      </section>

      <div className="two eq">
        <section className="card" aria-labelledby="msg-h">
          <h2 id="msg-h">Mensaje de recompra</h2>
          {!sendable ? (
            <p className="muted">
              A este segmento no se le escribe: no dieron consentimiento. Pídelo en el checkout o
              por su primer pedido.
            </p>
          ) : (
            <div className="stack tight">
              <label className="field">
                <span>Texto (WhatsApp)</span>
                <textarea
                  className="input"
                  rows={4}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setConfirm(false);
                  }}
                  style={{ padding: 10, minHeight: 96 }}
                />
              </label>
              <p className="caption" style={{ margin: 0 }}>
                Se añade «Para no recibir más mensajes responde BAJA».
              </p>
              {preview && (
                <div className="banner tone-neutral" role="status">
                  <Icon name="user" />
                  <div>
                    Llegaría a <strong>{preview.recipients}</strong>{" "}
                    {plural(preview.recipients, "cliente", "clientes")} con consentimiento.{" "}
                    <span className="muted">
                      {preview.excluded} excluidos (sin consentimiento o con baja).
                    </span>
                  </div>
                </div>
              )}
              {!confirm ? (
                <Button
                  variant="primary"
                  icon="send"
                  disabled={!preview || preview.recipients === 0 || text.trim().length < 10}
                  onClick={() => setConfirm(true)}
                >
                  Revisar y enviar
                </Button>
              ) : (
                <div className="row">
                  <span style={{ fontWeight: 600 }}>¿Enviar a {preview?.recipients} clientes?</span>
                  <Button variant="agent" onClick={send}>
                    Sí, enviar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="aud-h">
          <div className="row between">
            <h2 id="aud-h">Audiencias</h2>
            {sendable && (
              <Button sm icon="user" onClick={makeAudience}>
                Crear con «{SEG.find((s) => s[0] === seg)?.[1]}»
              </Button>
            )}
          </div>
          <p className="caption" style={{ margin: "4px 0 12px" }}>
            Para anuncios: solo clientes con consentimiento, y los teléfonos se envían cifrados
            (SHA-256).
          </p>
          {(auds.data ?? []).length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Todavía no hay audiencias.
            </p>
          ) : (
            (auds.data ?? []).map((a) => (
              <div
                key={a.id}
                className="row between"
                style={{
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                  flexWrap: "nowrap",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong className="break">{a.name}</strong>
                  <div className="caption">
                    {a.size} clientes · {dateEs(a.createdAt)}
                  </div>
                </div>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <StatusBadge status={a.status} />
                  {a.status === "DRAFT" && (
                    <Button
                      sm
                      onClick={async () => {
                        const r = await post<{ ok: boolean; message?: string }>(
                          `/api/audiences/${a.id}/sync`,
                        );
                        ctx.toast(
                          r.ok ? "Preparada para Meta (simulado)" : (r.message ?? "No se pudo"),
                        );
                        auds.reload();
                      }}
                    >
                      Preparar
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {target && (
        <Sheet title="Borrar datos personales" onClose={() => setTarget(undefined)}>
          <Banner tone="attention">
            Vas a borrar los datos personales de <strong>{target.name}</strong>: su nombre,
            teléfono, correo y sus conversaciones. Los pedidos se conservan sin datos personales
            para la contabilidad. No se puede deshacer.
          </Banner>
          <div className="row">
            <Button variant="primary" onClick={erase}>
              Sí, borrar
            </Button>
            <Button onClick={() => setTarget(undefined)}>Cancelar</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ============================== MARKETING ============================== */
export function Marketing({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState("campanas");
  const [asset, setAsset] = useState<MediaAsset>();
  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Marketing</h1>
          <p className="lead">
            Qué empujar, qué anuncios tengo, y cómo armar el siguiente. Las campañas nacen en pausa;
            activarlas es tuyo.
          </p>
        </div>
      </div>
      <Banner tone="neutral">
        Nada se publica ni se gasta sin tu sí. Los creativos con Higgsfield cuestan créditos:
        primero te digo cuántos. En la demo todo es simulado.
      </Banner>
      <Tabs
        label="Marketing"
        value={tab}
        onChange={setTab}
        items={[
          ["campanas", "Campañas"],
          ["creativos", "Creativos"],
          ["biblioteca", "Biblioteca"],
          ["nueva", "Nueva campaña"],
          ["productos", "Qué empujar"],
        ]}
      />
      {tab === "campanas" && <Campanas ctx={ctx} />}
      {tab === "creativos" && <Creativos ctx={ctx} />}
      {tab === "biblioteca" && (
        <Biblioteca
          ctx={ctx}
          onUse={(a) => {
            setAsset(a);
            setTab("nueva");
          }}
        />
      )}
      {tab === "nueva" && (
        <NuevaCampana ctx={ctx} asset={asset} onSaved={() => setTab("campanas")} />
      )}
      {tab === "productos" && <Productos ctx={ctx} />}
    </div>
  );
}

function Campanas({ ctx }: { ctx: Ctx }) {
  const camps = useResource<CampaignFull[]>("/api/campaigns", ctx.tick);
  const att = useResource<Attribution>("/api/reports/attribution", ctx.tick).data;
  const [md, setMd] = useState<{ title: string; text: string }>();
  const byId = new Map((att?.campaigns ?? []).map((c) => [c.id, c]));
  const list = camps.data ?? [];
  const known = list.filter((c) => c.metrics);
  const spend = known.reduce((s, c) => s + (c.metrics?.spend ?? 0), 0);
  const revenue = known.reduce((s, c) => s + (byId.get(c.id)?.revenue ?? 0), 0);
  const orders = known.reduce((s, c) => s + (byId.get(c.id)?.orders ?? 0), 0);
  const sample = list.some((c) => c.sample);

  const launch = async (id: string) => {
    const r = await post<{ ok: boolean; message?: string }>(`/api/campaigns/${id}/launch`);
    ctx.toast(r.ok ? "Creada en pausa y verificada (simulado)" : (r.message ?? "No se pudo"));
    camps.reload();
  };
  const gen = async (c: CampaignFull) => {
    const q = await post<{ quote?: boolean; credits: number; pending: number; message?: string }>(
      `/api/campaigns/${c.id}/creatives/generate`,
      {},
    );
    if (!q.quote || q.pending === 0) return ctx.toast("No hay creativos pendientes");
    if (
      !window.confirm(
        `Generar ${q.pending} creativos cuesta unos ${q.credits} créditos (estimado, simulado en la demo). ¿Confirmas?`,
      )
    )
      return;
    const r = await post<{ ok: boolean; message?: string }>(
      `/api/campaigns/${c.id}/creatives/generate`,
      { confirm: true },
    );
    ctx.toast(
      r.ok
        ? "Creativos generados (simulados: no se gastaron créditos)"
        : (r.message ?? "No se pudo"),
    );
    camps.reload();
  };

  return (
    <div className="stack">
      {list.length > 0 && (
        <div className="grid-stats">
          <div className="kpi">
            <span className="label">Gasto en anuncios</span>
            <span className="value num">{known.length ? copShort(spend) : "N/A"}</span>
            <span className="caption">
              {sample ? "datos de ejemplo" : "lo que reporta la plataforma"}
            </span>
          </div>
          <div className="kpi">
            <span className="label">Pedidos atribuidos</span>
            <span className="value num">{orders}</span>
            <span className="caption">por utm_campaign</span>
          </div>
          <div className="kpi">
            <span className="label">Ventas atribuidas</span>
            <span className="value num">{copShort(revenue)}</span>
            <span className="caption">pedidos con ese utm</span>
          </div>
          <div className="kpi">
            <span className="label">ROAS combinado</span>
            <span className="value num">
              {spend > 0 ? `${(revenue / spend).toFixed(1).replace(".", ",")}×` : "N/A"}
            </span>
            <span className="caption">{spend > 0 ? "ventas ÷ gasto" : "falta el gasto"}</span>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <section className="card">
          <EmptyState
            icon="megaphone"
            title="Todavía no hay campañas"
            text="Arma la primera con el asistente: te propongo el copy con los límites de cada plataforma."
          />
        </section>
      ) : (
        <div className="camps">
          {list.map((c) => {
            const a = byId.get(c.id);
            const pending = c.payload.creatives.filter((x) => !x.generated).length;
            const bad = a?.roas != null && a.roas < 1;
            return (
              <article
                key={c.id}
                className="card camp"
                aria-label={`Campaña ${c.product} en ${PLATFORM[c.platform]}`}
              >
                <div
                  className="row between"
                  style={{ flexWrap: "nowrap", alignItems: "flex-start" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6, marginBottom: 6 }}>
                      <PlatformBadge p={c.platform} />
                      {c.sample && <SampleTag />}
                    </div>
                    <h3 className="break">{c.product}</h3>
                    <span className="caption">
                      {cop(c.payload.dailyBudget)} al día · {dateEs(c.createdAt)}
                    </span>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                {c.metrics ? (
                  <dl className="metrics">
                    <div>
                      <dt>Impresiones</dt>
                      <dd className="num">{c.metrics.impressions.toLocaleString("es-CO")}</dd>
                    </div>
                    <div>
                      <dt>Clics</dt>
                      <dd className="num">{c.metrics.clicks.toLocaleString("es-CO")}</dd>
                    </div>
                    <div>
                      <dt>CTR</dt>
                      <dd className="num">{String(c.metrics.ctr).replace(".", ",")} %</dd>
                    </div>
                    <div>
                      <dt>Gasto</dt>
                      <dd className="num">{cop(c.metrics.spend)}</dd>
                    </div>
                    <div>
                      <dt>Pedidos</dt>
                      <dd className="num">{a?.orders ?? 0}</dd>
                    </div>
                    <div>
                      <dt>ROAS</dt>
                      <dd className="num" style={bad ? { color: "var(--critical)" } : undefined}>
                        {a?.roas == null ? "N/A" : `${String(a.roas).replace(".", ",")}×`}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Aún no corre: no hay métricas. Está{" "}
                    {c.status === "DRAFT" ? "solo como borrador en Traxo" : "creada en pausa"}.
                  </p>
                )}
                {bad && (
                  <div className="banner tone-attention" role="status">
                    <Icon name="alert" />
                    <div>
                      Gasta más de lo que vende (ROAS {String(a?.roas).replace(".", ",")}×).
                      Revísala o páusala en {PLATFORM[c.platform]}: yo no la apago sola.
                    </div>
                  </div>
                )}
                <div className="row">
                  <Button
                    sm
                    icon="copy"
                    onClick={async () =>
                      setMd({
                        title: c.product,
                        text: (await get<{ markdown: string }>(`/api/campaigns/${c.id}/markdown`))
                          .markdown,
                      })
                    }
                  >
                    Ver borrador
                  </Button>
                  {pending > 0 && (
                    <Button sm onClick={() => gen(c)}>
                      Generar creativos
                    </Button>
                  )}
                  {c.status === "DRAFT" && (
                    <Button sm variant="agent" onClick={() => launch(c.id)} data-tour="launch">
                      Crear en pausa (simulado)
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {md && (
        <Sheet title={`Borrador: ${md.title}`} onClose={() => setMd(undefined)}>
          <pre
            className="card compact mono"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              margin: 0,
              background: "var(--surface-sunken)",
            }}
          >
            {md.text}
          </pre>
        </Sheet>
      )}
    </div>
  );
}

function Creativos({ ctx }: { ctx: Ctx }) {
  const camps = useResource<CampaignFull[]>("/api/campaigns", ctx.tick).data ?? [];
  const lib = new Map(
    (useResource<MediaAsset[]>("/api/media", ctx.tick).data ?? []).map((a) => [a.id, a]),
  );
  const [open, setOpen] = useState<{
    prompt: string;
    label: string;
    kind: "image" | "video";
    generated: boolean;
  }>();
  const tiles = camps.flatMap((c) =>
    c.payload.creatives.map((x, i) => ({
      ...x,
      key: `${c.id}-${i}`,
      label: c.product,
      platform: c.platform,
    })),
  );
  if (tiles.length === 0)
    return (
      <section className="card">
        <EmptyState
          icon="megaphone"
          title="Aún no hay creativos"
          text="Se crean al armar una campaña: te propongo los prompts y el costo antes de generar nada."
        />
      </section>
    );
  return (
    <section className="stack">
      <p className="muted" style={{ margin: 0 }}>
        Los creativos de la demo son <strong>ilustraciones de ejemplo</strong>: no se generaron con
        Higgsfield ni costaron créditos.
      </p>
      <div className="tiles">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`tile ${t.generated ? "" : "pending"}`}
            onClick={() =>
              setOpen({
                prompt: t.prompt,
                label: t.label,
                kind: t.kind,
                generated: Boolean(t.generated),
              })
            }
          >
            {t.generated && t.assetId && lib.get(t.assetId) ? (
              <span className="media-frame">
                <MediaThumb a={lib.get(t.assetId) as MediaAsset} />
              </span>
            ) : t.generated ? (
              <CreativeArt seed={t.seed ?? t.key} label={t.label} kind={t.kind} />
            ) : (
              <div className="art ph">
                <Icon name={t.kind === "video" ? "play" : "megaphone"} size={28} />
                <span>Pendiente</span>
                <span className="caption">≈ {t.kind === "video" ? 40 : 6} créditos</span>
              </div>
            )}
            <span className="tile-meta">
              <PlatformBadge p={t.platform} />
              <span className="caption">{t.kind === "video" ? "Video" : "Imagen"}</span>
            </span>
          </button>
        ))}
      </div>
      {open && (
        <Sheet title={open.label} onClose={() => setOpen(undefined)}>
          {open.generated ? (
            <CreativeArt seed={open.prompt} label={open.label} kind={open.kind} />
          ) : (
            <Banner tone="neutral">
              Este creativo todavía no se genera. Generarlo cuesta unos{" "}
              {open.kind === "video" ? 40 : 6} créditos (estimado): te pido confirmación antes.
            </Banner>
          )}
          <div className="card compact">
            <div className="label" style={{ marginBottom: 6 }}>
              Prompt
            </div>
            <p style={{ margin: 0 }} className="break">
              {open.prompt}
            </p>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function NuevaCampana({
  ctx,
  asset,
  onSaved,
}: {
  ctx: Ctx;
  asset?: MediaAsset;
  onSaved: () => void;
}) {
  const products = useResource<Product[]>("/api/products", ctx.tick).data ?? [];
  const [f, setF] = useState({
    productId: "",
    platform: "meta",
    objective: "ventas",
    dailyBudget: 30000,
  });
  const [s, setS] = useState<Suggestion>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [picked, setPicked] = useState<string[]>(asset ? [asset.id] : []);
  const [only, setOnly] = useState(true);
  const lib = useResource<MediaAsset[]>("/api/media", ctx.tick).data ?? [];
  const aiOn = useResource<{ llm: boolean }>("/api/assistant/suggestions", 0).data?.llm ?? false;
  const [improving, setImproving] = useState(false);
  const L = LIMITS[(s?.platform ?? "meta") as keyof typeof LIMITS];
  const productId = f.productId || products[0]?.id || "";

  const suggest = async () => {
    setBusy(true);
    setErr(undefined);
    const r = await post<Suggestion & { message?: string }>("/api/campaigns/suggest", {
      ...f,
      productId,
    });
    setBusy(false);
    if (r.ok) setS(r);
    else setErr(r.message ?? "No pude proponer la campaña.");
  };
  const improve = async () => {
    if (!s) return;
    setImproving(true);
    const r = await post<{ ok: boolean; message?: string; copy?: Suggestion["copy"] }>(
      "/api/campaigns/improve-copy",
      { platform: s.platform, productTitle: s.productTitle, objective: s.objective, copy: s.copy },
    );
    setImproving(false);
    if (r.ok && r.copy) {
      setS({ ...s, copy: r.copy });
      ctx.toast("Reescribí el copy. Revísalo antes de guardar.");
    } else ctx.toast(r.message ?? "No pude mejorar el copy");
  };
  const edit = (k: "headlines" | "primaryTexts" | "descriptions", i: number, v: string) =>
    s && setS({ ...s, copy: { ...s.copy, [k]: s.copy[k].map((x, j) => (j === i ? v : x)) } });
  const over = useMemo(
    () =>
      s
        ? [
            ...s.copy.headlines.filter((h) => h.length > L.h),
            ...s.copy.primaryTexts.filter((t) => t.length > L.t),
            ...s.copy.descriptions.filter((d) => d.length > L.d),
          ].length
        : 0,
    [s, L],
  );

  // Los archivos elegidos de la biblioteca no cuestan créditos; si quedan, se puede omitir lo que faltaba por generar.
  const mine = picked
    .map((id) => lib.find((a) => a.id === id))
    .filter((a): a is MediaAsset => Boolean(a))
    .map((a) => ({
      kind: a.kind,
      prompt: `Usar «${a.title}» de la biblioteca`,
      assetId: a.id,
      generated: true,
      seed: a.seed ?? a.id,
    }));
  const finalCreatives = s ? (mine.length && only ? mine : [...mine, ...s.creatives]) : [];
  const credits = s
    ? finalCreatives
        .filter((c) => !c.assetId)
        .reduce((n, c) => n + (c.kind === "video" ? 40 : 6), 0)
    : 0;

  const save = async () => {
    if (!s) return;
    const r = await post<{ ok: boolean; message?: string }>("/api/campaigns", {
      platform: s.platform,
      productId: s.productId,
      productTitle: s.productTitle,
      objective: s.objective,
      dailyBudget: s.dailyBudget,
      audience: s.audience,
      copy: s.copy,
      creatives: finalCreatives,
      utmCampaign: s.utmCampaign,
    });
    if (r.ok) {
      ctx.toast("Guardé el borrador. No gasté nada y no está creado en la plataforma.");
      ctx.refresh();
      onSaved();
    } else setErr(r.message ?? "No se pudo guardar");
  };

  if (products.length === 0)
    return (
      <section className="card">
        <EmptyState
          icon="box"
          title="Primero necesito tu catálogo"
          text="Conecta e importa tu tienda en Conexiones y vuelvo con una propuesta por producto."
          action={
            <Button variant="agent" onClick={() => ctx.go("conexiones")}>
              Ir a Conexiones
            </Button>
          }
        />
      </section>
    );

  return (
    <div className="two">
      <section className="card" aria-labelledby="nc-h">
        <h2 id="nc-h">1. Qué quieres vender</h2>
        <div className="stack tight" style={{ marginTop: 12 }}>
          <label className="field">
            <span>Producto</span>
            <select
              className="input"
              value={productId}
              onChange={(e) => setF({ ...f, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.marginPct != null ? ` · margen ${p.marginPct} %` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Plataforma</span>
            <select
              className="input"
              value={f.platform}
              onChange={(e) => setF({ ...f, platform: e.target.value })}
            >
              <option value="meta">Meta (Facebook e Instagram)</option>
              <option value="google">Google Ads</option>
              <option value="tiktok">TikTok</option>
            </select>
          </label>
          <label className="field">
            <span>Objetivo</span>
            <select
              className="input"
              value={f.objective}
              onChange={(e) => setF({ ...f, objective: e.target.value })}
            >
              <option value="ventas">Ventas</option>
              <option value="mensajes">Mensajes por WhatsApp</option>
              <option value="trafico">Tráfico</option>
              <option value="reconocimiento">Reconocimiento</option>
            </select>
          </label>
          <label className="field">
            <span>Presupuesto diario (COP)</span>
            <input
              className="input"
              type="number"
              min={5000}
              step={5000}
              value={f.dailyBudget}
              onChange={(e) => setF({ ...f, dailyBudget: Number(e.target.value) })}
            />
          </label>
          <Button
            variant="agent"
            icon="spark"
            onClick={suggest}
            disabled={busy}
            data-tour="suggest"
          >
            {busy ? "Pensando…" : s ? "Proponer de nuevo" : "Proponerme la campaña"}
          </Button>
          {err && (
            <div className="auth-error" role="alert">
              <Icon name="alert" size={16} />
              {err}
            </div>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="pr-h">
        <h2 id="pr-h">2. Lo que propongo</h2>
        {!s ? (
          <EmptyState
            icon="spark"
            title="Aquí aparece la propuesta"
            text="Uso las ventas y el margen reales del producto, y respeto los límites de caracteres de la plataforma."
          />
        ) : (
          <div className="stack tight" style={{ marginTop: 12 }}>
            <ul className="why">
              {s.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            {aiOn && (
              <div className="row">
                <Button icon="spark" sm onClick={improve} disabled={improving}>
                  {improving ? "Escribiendo…" : "Mejorar el copy con IA"}
                </Button>
                <span className="caption">
                  Respeta los límites de {s.platform}; si no cumple, queda el tuyo.
                </span>
              </div>
            )}
            {(["headlines", "primaryTexts", "descriptions"] as const).map((k) => (
              <fieldset key={k} className="fs">
                <legend className="label">
                  {k === "headlines"
                    ? "Títulos"
                    : k === "primaryTexts"
                      ? "Textos principales"
                      : "Descripciones"}
                </legend>
                {s.copy[k].map((v, i) => {
                  const lim = k === "headlines" ? L.h : k === "primaryTexts" ? L.t : L.d;
                  return (
                    <div key={`${k}${i}`} className="cc">
                      <input
                        className="input"
                        value={v}
                        aria-label={`${k} ${i + 1}`}
                        onChange={(e) => edit(k, i, e.target.value)}
                      />
                      <span className={`cnt num ${v.length > lim ? "bad" : ""}`}>
                        {v.length}/{lim}
                      </span>
                    </div>
                  );
                })}
              </fieldset>
            ))}
            <div className="card compact">
              <div className="label">Público</div>
              <div>
                {s.audience.cities.join(", ") || "Todo el país"} · {s.audience.ageMin}–
                {s.audience.ageMax} años · {s.audience.interests.join(", ")}
              </div>
            </div>
            <div className="card compact">
              <div className="row between">
                <div className="label">Creativos ({finalCreatives.length})</div>
                <span className="caption num">
                  {credits === 0 ? "Sin costo de créditos" : `≈ ${credits} créditos (estimado)`}
                </span>
              </div>
              <p className="caption" style={{ margin: "4px 0 8px" }}>
                Elige de tu biblioteca (UGC, fotos de producto): no cuestan créditos.
              </p>
              <MediaPicker picked={picked} onChange={setPicked} tick={ctx.tick} />
              {mine.length > 0 && (
                <label className="row" style={{ gap: 8, margin: "10px 0 0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={only}
                    onChange={(e) => setOnly(e.target.checked)}
                  />
                  <span>No generar nada nuevo: usar solo mis archivos</span>
                </label>
              )}
              <ul className="why" style={{ marginTop: 10 }}>
                {finalCreatives.map((c) => (
                  <li key={c.prompt}>
                    <strong>{c.kind === "video" ? "Video" : "Imagen"}</strong>
                    {c.assetId ? " (tu biblioteca)" : " (por generar)"}: {c.prompt}
                  </li>
                ))}
              </ul>
              <p className="caption" style={{ margin: "8px 0 0" }}>
                No genero nada hasta que lo confirmes, y te digo el costo real antes.
              </p>
            </div>
            <div className="row">
              <Button variant="primary" onClick={save} disabled={over > 0} data-tour="save-draft">
                Guardar borrador
              </Button>
              {over > 0 && (
                <span className="caption" style={{ color: "var(--critical)" }}>
                  Hay {over} {plural(over, "texto que pasa", "textos que pasan")} del límite.
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Productos({ ctx }: { ctx: Ctx }) {
  const products = useResource<Product[]>("/api/products", ctx.tick).data ?? [];
  const margin = (p: Product) =>
    p.marginPct == null ? (
      <span className="muted" title="Falta cargar el costo">
        N/A
      </span>
    ) : (
      `${p.marginPct} %`
    );
  if (products.length === 0)
    return (
      <section className="card">
        <EmptyState
          icon="box"
          title="Sin catálogo todavía"
          text="Importa tu tienda en Conexiones."
          action={
            <Button variant="agent" onClick={() => ctx.go("conexiones")}>
              Ir a Conexiones
            </Button>
          }
        />
      </section>
    );
  const top = [...products].sort((a, b) => b.revenue - a.revenue);
  return (
    <section className="card compact stack">
      <div>
        <h2>Qué empujar</h2>
        <p className="caption" style={{ margin: "4px 0 0" }}>
          Con las ventas reales de la tienda. El margen es N/A si falta el costo.
        </p>
      </div>
      <HBars
        format={cop}
        rows={top.map((p, i) => ({
          label: p.title,
          value: p.revenue,
          sub: `${p.unitsSold} vendidos · margen ${p.marginPct == null ? "N/A" : `${p.marginPct} %`}`,
          highlight: i === 0,
        }))}
      />
      <div className="scroll-x only-wide">
        <table className="table">
          <caption className="sr-only">Productos con ventas y margen</caption>
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="right">
                Precio
              </th>
              <th scope="col" className="right">
                Vendidos
              </th>
              <th scope="col" className="right">
                Ingresos
              </th>
              <th scope="col" className="right">
                Margen
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.title}</td>
                <td className="right num">{cop(p.price)}</td>
                <td className="right num">{p.unitsSold}</td>
                <td className="right num">{cop(p.revenue)}</td>
                <td className="right num">{margin(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
