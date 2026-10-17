import { type DragEvent, useRef, useState } from "react";
import { del, post, useResource } from "./api.ts";
import { EmptyState, Sheet } from "./components.tsx";
import type { MediaAsset } from "./types.ts";
import { Banner, Button, CreativeArt, Icon, SampleTag } from "./ui.tsx";
import type { Ctx } from "./views.tsx";

export const ROLES: Array<[MediaAsset["role"] | "todos", string]> = [
  ["todos", "Todo"],
  ["ugc", "UGC"],
  ["producto", "Producto"],
  ["lifestyle", "Lifestyle"],
  ["referencia", "Referencias"],
];
const ROLE_LABEL: Record<string, string> = {
  ugc: "UGC",
  producto: "Producto",
  lifestyle: "Lifestyle",
  referencia: "Referencia",
};
const SOURCE_LABEL: Record<string, string> = {
  subido: "Subido",
  higgsfield: "Higgsfield",
  generado: "Generado",
};
const mb = (b: number | null): string =>
  b ? `${(b / 1_048_576).toFixed(b > 10_485_760 ? 0 : 1)} MB` : "";

/** Vista previa de un archivo: el real si existe, o una ilustración de ejemplo. */
export function MediaThumb({ a, big = false }: { a: MediaAsset; big?: boolean }) {
  if (a.url && a.kind === "image")
    return <img className="media-img" src={a.url} alt={a.title} loading="lazy" />;
  if (a.url && a.kind === "video")
    return (
      <video
        className="media-img"
        src={`${a.url}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        controls={big}
        aria-label={a.title}
      />
    );
  return (
    <CreativeArt
      seed={a.seed ?? a.id}
      label={a.title.split("·").pop()?.trim() ?? a.title}
      kind={a.kind}
    />
  );
}

type HfStatus = {
  simulated: boolean;
  connected: boolean;
  imported: number;
  available: number | null;
};

/** Productos distintos de la biblioteca (los creativos sin producto van aparte). */
const productsOf = (all: MediaAsset[]): string[] =>
  [...new Set(all.map((a) => a.product).filter((p): p is string => Boolean(p)))].sort();

function ProductSelect({
  value,
  onChange,
  products,
}: {
  value: string;
  onChange: (v: string) => void;
  products: string[];
}) {
  return (
    <select
      className="input sm"
      aria-label="Filtrar por producto"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="todos">Todos los productos</option>
      {products.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value="_sin">Sin producto</option>
    </select>
  );
}

export function Biblioteca({ ctx, onUse }: { ctx: Ctx; onUse: (a: MediaAsset) => void }) {
  const res = useResource<MediaAsset[]>("/api/media", ctx.tick);
  const all = res.data ?? [];
  const [role, setRole] = useState<MediaAsset["role"] | "todos">("todos");
  const [prod, setProd] = useState("todos");
  const hf = useResource<HfStatus>("/api/media/higgsfield", ctx.tick).data;
  const [uploadRole, setUploadRole] = useState<MediaAsset["role"]>("ugc");
  const [busy, setBusy] = useState<string>();
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<MediaAsset>();
  const [gen, setGen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const products = productsOf(all);
  const list = all.filter(
    (a) =>
      (role === "todos" || a.role === role) &&
      (prod === "todos" || (prod === "_sin" ? !a.product : a.product === prod)),
  );
  const sample = all.some((a) => a.sample);

  const upload = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      setBusy(f.name);
      const r = await fetch("/api/media/upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { "x-filename": encodeURIComponent(f.name), "x-role": uploadRole },
        body: f,
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!j.ok) ctx.toast(j.message ?? `No pude subir ${f.name}`);
    }
    setBusy(undefined);
    res.reload();
    ctx.toast("Listo: ya están en tu biblioteca");
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };
  const importHf = async () => {
    const r = await post<{ ok: boolean; message?: string; imported?: number; total?: number }>(
      "/api/media/import-higgsfield",
    );
    ctx.toast(
      r.ok
        ? r.imported
          ? `Traje ${r.imported} creativos de Higgsfield (conexión simulada)`
          : `Ya tienes los ${r.total} creativos de Higgsfield (conexión simulada)`
        : (r.message ?? "No se pudo"),
    );
    res.reload();
  };
  const remove = async (a: MediaAsset) => {
    await del(`/api/media/${a.id}`);
    setOpen(undefined);
    res.reload();
  };

  return (
    <section className="stack" data-tour="library">
      <div className="media-actions">
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <span className="avatar" aria-hidden="true">
            <Icon name="upload" size={18} />
          </span>
          <div style={{ minWidth: 0 }}>
            <strong>Sube tus videos UGC y fotos de producto</strong>
            <span className="caption" style={{ display: "block" }}>
              Arrástralos aquí o elígelos (jpg, png, mp4, mov · hasta 60 MB).
            </span>
          </div>
          <label className="field row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <span className="caption">Tipo</span>
            <select
              className="input"
              value={uploadRole}
              aria-label="Tipo de archivo"
              onChange={(e) => setUploadRole(e.target.value as MediaAsset["role"])}
            >
              <option value="ugc">UGC</option>
              <option value="producto">Producto</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="referencia">Referencia</option>
            </select>
          </label>
          <Button
            variant="primary"
            icon="upload"
            onClick={() => input.current?.click()}
            disabled={Boolean(busy)}
          >
            {busy ? "Subiendo…" : "Elegir archivos"}
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
            onChange={(e) => e.target.files && void upload(e.target.files)}
          />
        </div>
        <div className="media-side">
          <button type="button" className="agent-card" onClick={importHf}>
            <span className="avatar" aria-hidden="true">
              <Icon name="plug" size={18} />
            </span>
            <span>
              <strong>
                Traer de Higgsfield{" "}
                {hf?.simulated && <span className="badge tone-attention">Conexión simulada</span>}
              </strong>
              <span className="caption">
                {hf?.simulated
                  ? `Demo: no se llama a Higgsfield ni se gastan créditos. ${hf.available ? `${hf.imported} de ${hf.available} importados` : `${hf.imported} importados`}.`
                  : "Tus videos e imágenes ya generados (se conecta desde Claude)"}
              </span>
            </span>
          </button>
          <button type="button" className="agent-card" onClick={() => setGen(true)}>
            <span className="avatar" aria-hidden="true">
              <Icon name="spark" size={18} />
            </span>
            <span>
              <strong>Generar con Higgsfield</strong>
              <span className="caption">Foto o video de producto · con costo</span>
            </span>
          </button>
        </div>
      </div>

      <div className="row between">
        <div
          className="chips"
          role="tablist"
          aria-label="Tipo de creativo"
          style={{ maxWidth: 520 }}
        >
          {ROLES.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              className="chip"
              aria-selected={role === k}
              onClick={() => setRole(k)}
            >
              {label}
              <span className="n">
                {k === "todos" ? all.length : all.filter((a) => a.role === k).length}
              </span>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {products.length > 0 && (
            <ProductSelect value={prod} onChange={setProd} products={products} />
          )}
          {sample && <SampleTag />}
        </div>
      </div>

      {list.length === 0 ? (
        <section className="card">
          <EmptyState
            icon="megaphone"
            title={all.length ? "No hay nada de este tipo" : "Tu biblioteca está vacía"}
            text="Sube tus videos UGC y fotos de producto, o tráelos de Higgsfield: los uso para armar anuncios sin gastar créditos."
            action={
              <Button variant="agent" icon="upload" onClick={() => input.current?.click()}>
                Subir archivos
              </Button>
            }
          />
        </section>
      ) : (
        <div className="tiles media-grid">
          {list.map((a) => (
            <button key={a.id} type="button" className="tile" onClick={() => setOpen(a)}>
              <span className="media-frame">
                <MediaThumb a={a} />
                {a.kind === "video" && a.durationS && (
                  <span className="media-dur">{a.durationS} s</span>
                )}
              </span>
              <span className="media-title break">{a.title}</span>
              <span className="tile-meta">
                <span className={`badge tone-${a.role === "ugc" ? "agent" : "neutral"}`}>
                  {ROLE_LABEL[a.role]}
                </span>
                <span className="caption">{SOURCE_LABEL[a.source]}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <Sheet title={open.title} onClose={() => setOpen(undefined)}>
          <div className="stack tight">
            <div className="media-big">
              <MediaThumb a={open} big />
            </div>
            <dl className="media-facts">
              <div>
                <dt>Tipo</dt>
                <dd>{ROLE_LABEL[open.role]}</dd>
              </div>
              <div>
                <dt>Origen</dt>
                <dd>{SOURCE_LABEL[open.source]}</dd>
              </div>
              <div>
                <dt>Producto</dt>
                <dd>{open.product ?? "Sin asignar"}</dd>
              </div>
              {open.bytes ? (
                <div>
                  <dt>Tamaño</dt>
                  <dd>{mb(open.bytes)}</dd>
                </div>
              ) : null}
            </dl>
            {open.sample && (
              <p className="caption" style={{ margin: 0 }}>
                Es una ilustración de ejemplo: en tu cuenta aquí aparece el archivo real.
              </p>
            )}
            <div className="row">
              <Button
                variant="agent"
                icon="megaphone"
                onClick={() => {
                  const a = open;
                  setOpen(undefined);
                  onUse(a);
                }}
              >
                Usar en un anuncio
              </Button>
              <Button onClick={() => remove(open)}>Quitar de la biblioteca</Button>
            </div>
          </div>
        </Sheet>
      )}

      {gen && (
        <Sheet title="Generar con Higgsfield" onClose={() => setGen(false)}>
          <div className="stack tight">
            <Banner tone="attention">
              Generar cuesta créditos de tu cuenta de Higgsfield. Primero te digo el costo y no
              genero nada hasta que digas que sí.
            </Banner>
            <p style={{ margin: 0 }}>
              Se hace desde Claude, que ya está conectado a tu cuenta, con tus fotos y videos como
              referencia:
            </p>
            <ol className="why">
              <li>
                Pídele a Claude <code>/traxo:campana</code> y elige el producto.
              </li>
              <li>
                Traxo arma el prompt (foto de producto o video UGC) usando tu biblioteca como
                referencia.
              </li>
              <li>Claude cotiza en créditos (≈ 6 por imagen, ≈ 40 por video) y espera tu «sí».</li>
              <li>El resultado vuelve a esta biblioteca, listo para usar en un anuncio.</li>
            </ol>
            <Button onClick={() => setGen(false)}>Entendido</Button>
          </div>
        </Sheet>
      )}
      {all.length > 0 && !sample && (
        <Banner tone="neutral">
          Tus archivos viven en el servidor de Traxo; no se publican en ninguna plataforma hasta que
          armes un anuncio y lo apruebes.
        </Banner>
      )}
    </section>
  );
}

/** Elegir de la biblioteca los creativos de un anuncio (sin costo de créditos). */
export function MediaPicker({
  picked,
  onChange,
  tick,
}: {
  picked: string[];
  onChange: (ids: string[]) => void;
  tick: number;
}) {
  const all = (useResource<MediaAsset[]>("/api/media", tick).data ?? []).filter(
    (a) => a.role !== "referencia",
  );
  const [role, setRole] = useState<MediaAsset["role"] | "todos">("todos");
  const [prod, setProd] = useState("todos");
  if (all.length === 0)
    return (
      <p className="caption" style={{ margin: 0 }}>
        Tu biblioteca está vacía: sube tus videos UGC o fotos en la pestaña Biblioteca y los uso
        aquí sin gastar créditos.
      </p>
    );
  const toggle = (id: string) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const shown = all.filter(
    (a) =>
      (role === "todos" || a.role === role) &&
      (prod === "todos" || (prod === "_sin" ? !a.product : a.product === prod)),
  );
  const products = productsOf(all);
  return (
    <div className="stack tight">
      <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
        <div className="chips" role="tablist" aria-label="Tipo de creativo">
          {ROLES.filter(([k]) => k !== "referencia").map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              className="chip"
              aria-selected={role === k}
              onClick={() => setRole(k)}
            >
              {label}
              <span className="n">
                {k === "todos" ? all.length : all.filter((a) => a.role === k).length}
              </span>
            </button>
          ))}
        </div>
        {products.length > 0 && (
          <ProductSelect value={prod} onChange={setProd} products={products} />
        )}
      </div>
      {shown.length === 0 && <p className="caption">No hay creativos con ese filtro.</p>}
      <div className="pick-grid" role="group" aria-label="Creativos de tu biblioteca">
        {shown.map((a) => (
          <button
            key={a.id}
            type="button"
            className="pick"
            aria-pressed={picked.includes(a.id)}
            onClick={() => toggle(a.id)}
            title={a.title}
          >
            <span className="media-frame">
              <MediaThumb a={a} />
              {picked.includes(a.id) && (
                <span className="pick-ok">
                  <Icon name="check" size={14} />
                </span>
              )}
            </span>
            <span className="caption break">{a.title}</span>
            {a.product && <span className="caption pick-prod break">{a.product}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
