import { useEffect, useState } from "react";
import { del, download, getText, post, useResource } from "./api.ts";
import { EmptyState } from "./components.tsx";
import { dateEs } from "./format.ts";
import type { SiteDesign, SiteProject, StoreStatus } from "./types.ts";
import { Banner, Button, Icon, Tabs, type Tone, ToneBadge } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

type Catalog = {
  styles: Array<{
    id: string;
    label: string;
    text: string;
    palette: SiteDesign["palette"];
    fonts: SiteDesign["fonts"];
  }>;
  sections: Array<{ id: string; label: string }>;
};

const PLATFORMS: Array<[string, string]> = [
  ["shopify", "Shopify"],
  ["tiendanube", "Tiendanube"],
  ["woocommerce", "WooCommerce"],
  ["otra", "Otra"],
];
const STATUS: Record<SiteProject["status"], { tone: Tone; label: string }> = {
  borrador: { tone: "neutral", label: "Borrador" },
  generado: { tone: "progress", label: "Tema descargado" },
  "en-github": { tone: "agent", label: "En GitHub" },
  subido: { tone: "success", label: "Subido a la tienda" },
};
const TOOLS = ["GitHub", "WebKit Builder", "UI/UX Pro Max", "Emil Kowalski"];

function Swatches({ p }: { p: SiteDesign["palette"] }) {
  return (
    <span className="swatches" aria-hidden="true">
      {[p.bg, p.surface, p.text, p.accent].map((c) => (
        <i key={c} style={{ background: c }} />
      ))}
    </span>
  );
}

/** Constructor de tienda: diseña el tema, míralo, descárgalo y llévalo a tu tienda sin publicar nada solo. */
export function Constructor({ ctx }: { ctx: Ctx }) {
  const list = useResource<SiteProject[]>("/api/builder", ctx.tick);
  const cat = useResource<Catalog>("/api/builder/catalog", 0).data;
  const store = useResource<StoreStatus>("/api/store/status", ctx.tick).data;
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rows = list.data ?? [];
  const current = rows.find((r) => r.id === sel) ?? null;
  const showCreate = creating || (list.data && rows.length === 0);

  const head = (
    <div className="topbar">
      <div>
        <h1>Constructor de tienda</h1>
        <p className="lead">
          Diseña una tienda lista para vender con tu catálogo real. Te entrego un tema completo para
          Shopify (o un sitio para otras plataformas); nada se publica solo.
        </p>
      </div>
      {!showCreate && (
        <Button variant="primary" icon="layout" onClick={() => setCreating(true)}>
          Nuevo diseño
        </Button>
      )}
    </div>
  );

  return (
    <div className="stack">
      {head}
      {store && !store.connected && !store.demo && (
        <Banner tone="agent">
          Aún no conectaste tu tienda: diseñaré con el nombre y los productos que tengas. Conéctala
          en Conexiones para usar tu catálogo real.
        </Banner>
      )}
      {showCreate && cat && (
        <Nuevo
          cat={cat}
          platform={store?.platform}
          onCancel={rows.length ? () => setCreating(false) : undefined}
          onDone={(id) => {
            setCreating(false);
            setSel(id);
            list.reload();
            ctx.toast("Diseño creado. Míralo a la derecha.");
          }}
        />
      )}
      {!showCreate && rows.length > 0 && (
        <div className="builder-list" role="list">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              role="listitem"
              className="seg"
              aria-pressed={r.id === (current?.id ?? rows[0]?.id)}
              onClick={() => setSel(r.id)}
            >
              <span className="row between">
                <strong className="break">{r.name}</strong>
                <ToneBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</ToneBadge>
              </span>
              <span className="row" style={{ gap: 8 }}>
                <Swatches p={r.design.palette} />
                <span className="caption">
                  {r.platform} · {dateEs(r.updatedAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!showCreate && cat && (current ?? rows[0]) && (
        <Detalle
          key={(current ?? rows[0])?.id}
          project={(current ?? rows[0]) as SiteProject}
          cat={cat}
          ctx={ctx}
          onChanged={list.reload}
          onDeleted={() => {
            setSel(null);
            list.reload();
          }}
        />
      )}
      {!list.data && !list.error && <div className="skel" style={{ height: 240 }} />}
      {list.error && (
        <section className="card">
          <EmptyState
            icon="alert"
            title="No pude cargar los diseños"
            text="Intenta de nuevo en un momento."
          />
        </section>
      )}
    </div>
  );
}

function Nuevo({
  cat,
  platform,
  onDone,
  onCancel,
}: {
  cat: Catalog;
  platform?: string;
  onDone: (id: string) => void;
  onCancel?: () => void;
}) {
  const [style, setStyle] = useState("limpio");
  const [tone, setTone] = useState("cercano");
  const [plat, setPlat] = useState(
    PLATFORMS.some(([id]) => id === platform) ? (platform as string) : "shopify",
  );
  const [sections, setSections] = useState<string[]>(cat.sections.map((s) => s.id));
  const [cod, setCod] = useState(true);
  const [wa, setWa] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await post<{ ok: boolean; message?: string; project?: SiteProject }>(
        "/api/builder",
        {
          style,
          tone,
          platform: plat,
          sections,
          cod,
          whatsapp: wa.replace(/\D/g, "") || undefined,
        },
      );
      if (r.ok && r.project) onDone(r.project.id);
      else setErr(r.message ?? "No pude crear el diseño.");
    } catch {
      setErr("No pude crear el diseño. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="nb-h">
      <h2 id="nb-h">Nuevo diseño</h2>
      <fieldset className="plain">
        <legend className="label">1 · Estilo</legend>
        <div className="seg-grid style-grid">
          {cat.styles.map((s) => (
            <button
              key={s.id}
              type="button"
              className="seg"
              aria-pressed={style === s.id}
              onClick={() => setStyle(s.id)}
            >
              <Swatches p={s.palette} />
              <strong>{s.label}</strong>
              <span className="caption">{s.text}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="two eq">
        <div className="field">
          <span id="tn">2 · Tono de los textos</span>
          <Tabs
            label="Tono"
            value={tone}
            onChange={setTone}
            items={[
              ["cercano", "Cercano"],
              ["profesional", "Profesional"],
              ["divertido", "Divertido"],
            ]}
          />
        </div>
        <label className="field">
          <span>3 · ¿Dónde está tu tienda?</span>
          <select className="input" value={plat} onChange={(e) => setPlat(e.target.value)}>
            {PLATFORMS.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
          <span className="caption">
            {plat === "shopify"
              ? "Genero un tema completo para subir a Shopify."
              : "Genero un sitio estático y el diseño en JSON (el tema automático es solo para Shopify)."}
          </span>
        </label>
      </div>
      <fieldset className="plain">
        <legend className="label">4 · Secciones de la portada</legend>
        <div className="checks">
          {cat.sections.map((s) => (
            <label key={s.id} className="chk">
              <input
                type="checkbox"
                checked={sections.includes(s.id)}
                onChange={(e) =>
                  setSections((cur) =>
                    e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id),
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two eq">
        <label className="chk">
          <input type="checkbox" checked={cod} onChange={(e) => setCod(e.target.checked)} />
          Ofrezco pago contraentrega
        </label>
        <label className="field">
          <span>WhatsApp (opcional)</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder="573001112233"
            value={wa}
            onChange={(e) => setWa(e.target.value)}
          />
        </label>
      </div>
      {err && <Banner tone="critical">{err}</Banner>}
      <div className="row" style={{ gap: 12 }}>
        <Button
          variant="primary"
          icon="spark"
          onClick={go}
          disabled={busy || sections.length === 0}
        >
          {busy ? "Diseñando…" : "Diseñar mi tienda"}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
      </div>
      <p className="caption">
        Uso tus productos reales. Las reseñas no se inventan: quedan vacías para que pegues las de
        tus clientes. Si tienes la IA activada, Claude pule los textos.
      </p>
    </section>
  );
}

function Detalle({
  project,
  cat,
  ctx,
  onChanged,
  onDeleted,
}: {
  project: SiteProject;
  cat: Catalog;
  ctx: Ctx;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const d = project.design;
  const [html, setHtml] = useState<string>();
  const [device, setDevice] = useState("pc");
  const [form, setForm] = useState({
    headline: d.copy.headline,
    sub: d.copy.sub,
    cta: d.copy.cta,
    story: d.copy.story,
    tagline: d.tagline,
    whatsapp: d.contact.whatsapp ?? "",
    style: d.style,
    sections: d.sections as string[],
    cod: d.cod,
  });
  const [github, setGithub] = useState(project.githubUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dirty =
    form.headline !== d.copy.headline ||
    form.sub !== d.copy.sub ||
    form.cta !== d.copy.cta ||
    form.story !== d.copy.story ||
    form.tagline !== d.tagline ||
    form.whatsapp !== (d.contact.whatsapp ?? "") ||
    form.style !== d.style ||
    form.cod !== d.cod ||
    form.sections.join() !== d.sections.join();

  useEffect(() => {
    let off = false;
    getText(`/api/builder/${project.id}/preview`)
      .then((t) => !off && setHtml(t))
      .catch(() => !off && setHtml(undefined));
    return () => {
      off = true;
    };
  }, [project.id, project.updatedAt]);

  const save = async (patch: Record<string, unknown>, ok = "Guardado.") => {
    setBusy(true);
    setErr("");
    try {
      const r = await post<{ ok: boolean; message?: string }>(`/api/builder/${project.id}`, patch);
      if (r.ok) {
        ctx.toast(ok);
        onChanged();
      } else setErr(r.message ?? "No pude guardar.");
    } catch (e) {
      setErr(
        (e as Error).message.includes("400")
          ? "Revisa los datos: algo no es válido."
          : "No pude guardar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveDesign = () => {
    const st = cat.styles.find((s) => s.id === form.style);
    const order = cat.sections.map((s) => s.id).filter((id) => form.sections.includes(id));
    void save({
      design: {
        tagline: form.tagline,
        style: form.style,
        ...(form.style !== d.style && st ? { palette: st.palette, fonts: st.fonts } : {}),
        sections: order,
        cod: form.cod,
        contact: { whatsapp: form.whatsapp.replace(/\D/g, "") || undefined },
        copy: { headline: form.headline, sub: form.sub, cta: form.cta, story: form.story },
      },
    });
  };

  const isShopify = project.platform === "shopify";
  const getZip = async () => {
    try {
      await download(`/api/builder/${project.id}/theme.zip`, "tienda.zip");
      onChanged();
    } catch {
      ctx.toast("No pude descargar el archivo.");
    }
  };

  return (
    <div className="builder-grid">
      <section className="card preview-card" aria-labelledby="pv-h">
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 id="pv-h">Vista previa</h2>
          <Tabs
            label="Dispositivo"
            value={device}
            onChange={setDevice}
            items={[
              ["pc", "Computador"],
              ["phone", "Celular"],
            ]}
          />
        </div>
        <div className={`preview-stage ${device}`}>
          {html ? (
            <iframe
              title={`Vista previa de ${d.brand}`}
              className="preview-frame"
              sandbox=""
              srcDoc={html}
            />
          ) : (
            <div className="skel" style={{ height: 520 }} />
          )}
        </div>
        <p className="caption" style={{ marginTop: 8 }}>
          Así se ve la portada. En {isShopify ? "Shopify" : "tu plataforma"} verás tus productos y
          fotos reales.
        </p>
      </section>

      <div className="stack">
        <section className="card stack" aria-labelledby="pb-h">
          <div className="row between">
            <h2 id="pb-h">Llevarlo a tu tienda</h2>
            <ToneBadge tone={STATUS[project.status].tone}>{STATUS[project.status].label}</ToneBadge>
          </div>
          <ol className="steps">
            <li>
              <strong>Descarga {isShopify ? "el tema" : "el sitio"}.</strong>
              <span className="caption">
                {isShopify
                  ? "En Shopify: Tienda online → Temas → Agregar tema → Subir archivo zip. Queda sin publicar."
                  : "Incluye la portada en HTML y el diseño en JSON para llevarlo a tu plantilla."}
              </span>
              <Button variant="primary" icon="upload" sm onClick={getZip}>
                Descargar .zip
              </Button>
            </li>
            <li>
              <strong>Pule el diseño con Claude (opcional).</strong>
              <span className="caption">
                Pídele <code>/traxo:constructor</code> en Claude Code: refina el tema, lo sube a un
                repositorio privado de GitHub y a Shopify sin publicar.
              </span>
              <span className="chips-static">
                {TOOLS.map((t) => (
                  <span key={t} className="tool">
                    {t}
                  </span>
                ))}
              </span>
            </li>
            <li>
              <strong>Revísalo y publícalo tú.</strong>
              <span className="caption">Traxo nunca publica el tema por ti.</span>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <label className="sr-only" htmlFor="gh">
                  Enlace del repositorio en GitHub
                </label>
                <input
                  id="gh"
                  className="input"
                  placeholder="https://github.com/tu-usuario/tu-tienda"
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <Button
                  sm
                  disabled={busy || !github}
                  onClick={() =>
                    save({ githubUrl: github, status: "en-github" }, "Anotado: está en GitHub.")
                  }
                >
                  Guardar enlace
                </Button>
                <Button
                  sm
                  disabled={busy || project.status === "subido"}
                  onClick={() => save({ status: "subido" }, "Anotado: ya está en tu tienda.")}
                >
                  Ya lo subí
                </Button>
              </div>
            </li>
          </ol>
        </section>

        <section className="card stack" aria-labelledby="ed-h">
          <h2 id="ed-h">Textos y estilo</h2>
          <label className="field">
            <span>Título de la portada</span>
            <input
              className="input"
              maxLength={90}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Frase corta de la marca</span>
            <input
              className="input"
              maxLength={120}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Descripción</span>
            <textarea
              className="input"
              rows={2}
              maxLength={220}
              value={form.sub}
              onChange={(e) => setForm({ ...form, sub: e.target.value })}
              style={{ padding: 12 }}
            />
          </label>
          <label className="field">
            <span>Texto del botón</span>
            <input
              className="input"
              maxLength={28}
              value={form.cta}
              onChange={(e) => setForm({ ...form, cta: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Historia de la marca</span>
            <textarea
              className="input"
              rows={3}
              maxLength={600}
              value={form.story}
              placeholder="Cuenta quién está detrás y por qué lo haces. Solo escribe lo que es cierto."
              onChange={(e) => setForm({ ...form, story: e.target.value })}
              style={{ padding: 12 }}
            />
          </label>
          <fieldset className="plain">
            <legend className="label">Estilo</legend>
            <div className="seg-grid style-grid">
              {cat.styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="seg"
                  aria-pressed={form.style === s.id}
                  onClick={() => setForm({ ...form, style: s.id })}
                >
                  <Swatches p={s.palette} />
                  <strong>{s.label}</strong>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="plain">
            <legend className="label">Secciones</legend>
            <div className="checks">
              {cat.sections.map((s) => (
                <label key={s.id} className="chk">
                  <input
                    type="checkbox"
                    checked={form.sections.includes(s.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        sections: e.target.checked
                          ? [...form.sections, s.id]
                          : form.sections.filter((x) => x !== s.id),
                      })
                    }
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="two eq">
            <label className="chk">
              <input
                type="checkbox"
                checked={form.cod}
                onChange={(e) => setForm({ ...form, cod: e.target.checked })}
              />
              Pago contraentrega
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="573001112233"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </label>
          </div>
          {err && <Banner tone="critical">{err}</Banner>}
          <div className="row between">
            <Button
              variant="primary"
              icon="check"
              disabled={busy || !dirty || form.sections.length === 0}
              onClick={saveDesign}
            >
              Guardar cambios
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!confirm("¿Borrar este diseño? No afecta lo que ya subiste a tu tienda."))
                  return;
                await del(`/api/builder/${project.id}`);
                onDeleted();
              }}
            >
              <Icon name="x" size={14} /> Borrar
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
