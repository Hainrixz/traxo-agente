import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "./api.ts";
import type { Account } from "./types.ts";
import { Icon } from "./ui.tsx";

type Action = { kind: "click" } | { kind: "none" };
export type TourStep = {
  id: string;
  title: string;
  text: string;
  /** Vista a la que hay que ir antes de buscar el elemento. */
  route?: string;
  /** Selector del elemento a mostrar (data-tour). Sin selector, el paso es una tarjeta centrada. */
  target?: string;
  action?: Action;
  /** Espera tras la acción, para que se vea el resultado (ms). */
  settle?: number;
  /** Se salta si devuelve true (p. ej. la tienda ya está importada). */
  skipIf?: (ctx: TourCtx) => boolean;
};
export type TourCtx = { account: Account; imported: boolean };

const reduced = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Primer elemento visible que coincide: así un selector con coma sirve para escritorio y teléfono a la vez. */
const pick = (sel: string): Element | null =>
  [...document.querySelectorAll(sel)].find(
    (e) => (e as HTMLElement).getBoundingClientRect().width > 0,
  ) ?? null;

/** El contenedor que de verdad se desplaza (una hoja lateral o inferior tiene el suyo); si no hay, la ventana. */
const scrollerOf = (el: Element): HTMLElement | Window => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight + 4) return p;
  }
  return window;
};

/** Hueco visible en el teléfono entre la barra superior y la tarjeta del recorrido (que va sobre las pestañas). */
const freeArea = (cardH: number): { top: number; bottom: number } => {
  const px = (v: string) =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)) || 0;
  const header =
    (document.querySelector(".mtop") as HTMLElement | null)?.getBoundingClientRect().bottom ?? 56;
  const tab = px("--tab-h") || 64;
  const bottom = window.innerHeight - tab - 12 - cardH - 12 - 8;
  return { top: header + 12, bottom: Math.max(bottom, header + 80) };
};

export const STEPS: TourStep[] = [
  {
    id: "hola",
    title: "Te muestro Traxo en dos minutos",
    text: "Yo manejo el cursor y tú solo miras. Puedes pausar, avanzar o saltarte el recorrido cuando quieras. Todo lo que veas es simulado: no sale ningún mensaje ni se cobra nada.",
  },
  {
    id: "conectar",
    route: "conexiones",
    title: "Primero, conectar tu tienda",
    text: "Traxo se conecta a Shopify, Tiendanube o WooCommerce. Aquí usaremos la tienda de ejemplo.",
    target: '[data-tour="import"]',
    action: { kind: "click" },
    settle: 1800,
    skipIf: (c) => c.imported,
  },
  {
    id: "importada",
    route: "conexiones",
    title: "Importé tu catálogo, tus clientes y tu historial",
    text: "Con eso ya conozco tus productos, sus márgenes y a quién le has vendido. Es lo que alimenta el marketing y el seguimiento.",
    target: '[data-tour="store-card"]',
  },
  {
    id: "ajustes",
    route: "ajustes",
    title: "Tú decides cuánta libertad tengo",
    text: "Con la contraentrega de riesgo le escribo al cliente antes de gastar en una guía. Lo activo para que lo veas.",
    target: '[data-tour="cod-risky"]',
    action: { kind: "click" },
    settle: 700,
  },
  {
    id: "guardar",
    route: "ajustes",
    title: "Guardado",
    text: "Desde ahora confirmo por WhatsApp los pedidos riesgosos y genero solas las guías normales, dentro de tu tope.",
    target: '[data-tour="save-settings"]',
    action: { kind: "click" },
    settle: 900,
  },
  {
    id: "pedido",
    route: "inicio",
    title: "Llega un pedido",
    text: "Voy a simular uno a contraentrega. Mira el feed: valido la dirección, cotizo en todas las vías y elijo.",
    target: '[data-tour="guide-pedido"]',
    action: { kind: "click" },
    settle: 2600,
  },
  {
    id: "pipeline",
    route: "inicio",
    title: "Aquí ves dónde está cada pedido",
    text: "Cada pedido avanza de «por revisar» a «entregado». Lo que necesita tu atención se marca en naranja.",
    target: '[data-tour="pipeline"]',
  },
  {
    id: "ver",
    route: "inicio",
    title: "¿Por qué esa transportadora?",
    text: "Te enseño las cotizaciones: la barra más corta es el menor costo total, con comisión de recaudo incluida.",
    target: '[data-tour="guide-ver"]',
    action: { kind: "click" },
    settle: 1300,
  },
  {
    id: "cotizaciones",
    route: "pedidos",
    title: "Cada decisión, explicada",
    text: "Elijo por costo, velocidad y confiabilidad, y descarto a quien no cobra la contraentrega. Si cambias los pesos en Ajustes, cambia mi elección.",
    target: '[data-tour="quotes"]',
  },
  {
    id: "seguimiento",
    route: "pedidos",
    title: "Seguimiento paso a paso",
    text: "Cada pedido tiene su recorrido: recibido, dirección validada, cotizado, guía, en camino, entregado. Vigilo cada guía sola y registro cada movimiento de la transportadora.",
    target: '[data-tour="journey"]',
  },
  {
    id: "guia",
    route: "pedidos",
    title: "La guía y su línea de tiempo",
    text: "Aquí está el número de guía y cada evento que reporta la transportadora. El día de la entrega le aviso al cliente cuánto debe tener listo si paga contraentrega.",
    target: '[data-tour="tracking"]',
  },
  {
    id: "novedad",
    route: "inicio",
    title: "Algo sale mal en la entrega",
    text: "Simulo que el cliente no estaba. Yo le escribo para reprogramar sin que tú muevas un dedo.",
    target: '[data-tour="guide-novedad"]',
    action: { kind: "click" },
    settle: 1800,
  },
  {
    id: "responder",
    route: "inicio",
    title: "El cliente responde",
    text: "«Sí, mañana estoy» → reprogramo y cierro la novedad. Si responde algo que no entiendo, te lo paso a ti.",
    target: '[data-tour="guide-responder"]',
    action: { kind: "click" },
    settle: 2000,
  },
  {
    id: "riesgo",
    route: "inicio",
    title: "Ahora, una contraentrega riesgosa",
    text: "Cliente nuevo y $ 294.000 por cobrar. Antes de gastar en una guía, le escribo por WhatsApp para que confirme (o pague ahora con descuento).",
    target: '[data-tour="guide-riesgo"]',
    action: { kind: "click" },
    settle: 2400,
  },
  {
    id: "confirmar",
    route: "inicio",
    title: "El cliente confirma",
    text: "Responde «Confirmo» y recién ahí genero la guía. Si no responde en 24 horas, te lo paso a ti para decidir.",
    target: '[data-tour="guide-confirmar"]',
    action: { kind: "click" },
    settle: 2200,
  },
  {
    id: "mensajes",
    route: "conversaciones",
    title: "Todo lo que le escribo a tus clientes",
    text: "WhatsApp, Instagram y Messenger llegan a la misma bandeja, conectados por Zernio. Ves cada conversación, lo que dijo el cliente y lo que respondí.",
    target: '[data-tour="inbox"] .chips',
  },
  {
    id: "marketing",
    route: "marketing",
    title: "Marketing con tus datos reales",
    text: "Armo campañas a partir de lo que de verdad se vende y deja margen. Siempre nacen en pausa; activarlas es tuyo.",
    target: '[data-tour="tab-nueva"]',
    action: { kind: "click" },
    settle: 600,
  },
  {
    id: "sugerir",
    route: "marketing",
    title: "Te propongo la campaña",
    text: "Copy dentro de los límites de cada plataforma, público y creativos con su costo en créditos antes de generar nada.",
    target: '[data-tour="suggest"]',
    action: { kind: "click" },
    settle: 1500,
  },
  {
    id: "borrador",
    route: "marketing",
    title: "Guardo el borrador",
    text: "No gasté nada y no está creado en la plataforma. Cuando quieras lo creo en pausa y lo verificas tú.",
    target: '[data-tour="save-draft"]',
    action: { kind: "click" },
    settle: 1200,
  },
  {
    id: "seo",
    route: "tienda",
    title: "Reviso tu tienda como la vería Google",
    text: "Auditoría de SEO y de diseño: te digo cuántos checks pude medir y qué arreglar primero.",
    target: '[data-tour="run-audit-seo"]',
    action: { kind: "click" },
    settle: 3200,
  },
  {
    id: "biblioteca",
    route: "marketing",
    title: "Tus videos UGC y fotos de producto",
    text: "Los subes aquí o los traigo de Higgsfield, y los uso en tus anuncios sin gastar créditos. Si falta algo, te cotizo antes de generarlo.",
    target: '[data-tour="tab-biblioteca"]',
    action: { kind: "click" },
    settle: 900,
  },
  {
    id: "reportes",
    route: "reportes",
    title: "Qué anuncio trajo qué venta",
    text: "Uno el gasto de tus campañas con los pedidos de cada utm. Si no tengo el gasto, el ROAS dice N/A en vez de inventarlo.",
    target: '[data-tour="chart"]',
  },
  {
    id: "agente",
    route: "agente",
    title: "Pregúntale lo que quieras a tu agente",
    text: "Sabe todo lo que pasa en tu negocio: ventas, envíos, anuncios, clientes y tienda. Le preguntas y responde con tus datos, sin inventar nada.",
    target: '[data-tour="agent-starters"] .agent-card',
    action: { kind: "click" },
    settle: 2200,
  },
  {
    id: "perfil",
    route: "inicio",
    title: "Tu cuenta, ajustes y límites",
    text: "En tu perfil (abajo a la izquierda; en el teléfono, en «Más») están la autonomía, el tope por guía, las conexiones y el tema. Tú decides hasta dónde llego.",
    target: '[data-tour="profile"], [data-tour="tab-mas"]',
  },
  {
    id: "fin",
    title: "Eso es Traxo",
    text: "Con la cuenta admin ves todo esto con 90 días de datos de ejemplo: ventas, campañas con métricas, chats, auditorías y reportes.",
  },
];

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Recorrido guiado: un cursor falso viaja hasta cada elemento, hace clic de verdad y un foco resalta lo que importa.
 * Patrón de "product tour" de 21st.dev, con cursor animado. Respeta reduced-motion (sin viaje) y funciona en móvil.
 */
export function Tour({
  ctx,
  steps,
  go,
  onClose,
  onAdmin,
}: {
  ctx: TourCtx;
  steps: TourStep[];
  go: (v: string) => void;
  onClose: (finished: boolean) => void;
  onAdmin: () => void;
}) {
  // La lista se fija al empezar: si cambiara a mitad (p. ej. al importar la tienda) los pasos saltarían o se repetirían.
  const [list] = useState(() => steps.filter((s) => !s.skipIf?.(ctx)));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cur, setCur] = useState<{ x: number; y: number; click: number }>({
    x: -40,
    y: -40,
    click: 0,
  });
  const [busy, setBusy] = useState(false);
  const token = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);
  const step = list[i];
  const last = i >= list.length - 1;

  const measure = useCallback((el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, []);

  const waitFor = useCallback(async (sel: string, t: number): Promise<Element | null> => {
    for (let n = 0; n < 40; n++) {
      if (t !== token.current) return null;
      const el = pick(sel);
      if (el) return el;
      await sleep(120);
    }
    return null;
  }, []);

  // Corre un paso: navega, busca el elemento, mueve el cursor, hace clic y espera a que se vea el resultado.
  useEffect(() => {
    if (!step) return;
    const t = ++token.current;
    setBusy(true);
    (async () => {
      // Solo se navega si hace falta: volver a la misma vista cerraría el pedido que el paso anterior abrió.
      if (step.route && location.hash.slice(1) !== step.route) go(step.route);
      if (!step.target) {
        setRect(null);
        setBusy(false);
        return;
      }
      await sleep(step.route ? 350 : 0);
      let el = await waitFor(step.target, t);
      // En el teléfono algunas vistas viven dentro de "Más"; basta con navegar por ruta.
      if (!el || t !== token.current) {
        setRect(null);
        setBusy(false);
        return;
      }
      // Se coloca el elemento a la vista: al centro en escritorio; en el teléfono, en el hueco libre sobre la tarjeta.
      // Se repite porque la página puede cambiar de alto mientras carga y mover el elemento.
      for (let n = 0; n < 5; n++) {
        const cur = pick(step.target) ?? el;
        const r0 = cur.getBoundingClientRect();
        const free = narrow()
          ? freeArea(cardRef.current?.offsetHeight ?? 220)
          : { top: 72, bottom: window.innerHeight - 72 };
        const want =
          r0.height > free.bottom - free.top
            ? free.top
            : (free.top + free.bottom) / 2 - r0.height / 2;
        const delta = r0.top - want;
        if (Math.abs(delta) < 6) break;
        scrollerOf(cur).scrollBy({ top: delta, behavior: "instant" });
        await sleep(110);
        if (t !== token.current) return;
      }
      el = pick(step.target) ?? el;
      const r = measure(el);
      setRect(r);
      const to = { x: r.x + Math.min(r.w * 0.6, r.w - 14), y: r.y + r.h * 0.55 };
      setCur((c) => ({ ...c, ...to }));
      if (step.action?.kind === "click") {
        await sleep(reduced() ? 250 : 950);
        if (t !== token.current) return;
        // Con red lenta la acción anterior puede seguir en curso y dejar el botón desactivado: se espera a que se libere.
        for (let n = 0; n < 100; n++) {
          const b = pick(step.target ?? "") as HTMLButtonElement | null;
          if (!b || !b.disabled) break;
          await sleep(120);
          if (t !== token.current) return;
        }
        el = pick(step.target) ?? el;
        setCur((c) => ({ ...c, click: c.click + 1 }));
        await sleep(160);
        if (t !== token.current) return;
        (el as HTMLElement).click();
        await sleep(step.settle ?? 800);
      }
      if (t === token.current) setBusy(false);
    })();
    return () => {
      token.current++;
    };
  }, [step, go, measure, waitFor]);

  // En el teléfono se deja espacio al final de la página para poder subir los elementos de abajo sobre la tarjeta.
  useEffect(() => {
    document.body.classList.add("touring");
    return () => document.body.classList.remove("touring");
  }, []);

  // Avance automático: tiempo de lectura proporcional al texto.
  useEffect(() => {
    if (!playing || busy || !step || last) return;
    const id = setTimeout(
      () => setI((n) => Math.min(n + 1, list.length - 1)),
      Math.max(2800, 1200 + step.text.length * 30),
    );
    return () => clearTimeout(id);
  }, [playing, busy, step, last, list.length]);

  // La página cambia de alto tras cada acción (llegan eventos, se cargan datos): el foco sigue al elemento.
  useEffect(() => {
    if (!step?.target) return;
    const id = setInterval(() => {
      const el = pick(step.target as string);
      if (!el) return;
      const r = measure(el);
      setRect((o) =>
        o && Math.abs(o.x - r.x) < 1 && Math.abs(o.y - r.y) < 1 && Math.abs(o.h - r.h) < 1 ? o : r,
      );
    }, 250);
    return () => clearInterval(id);
  }, [step, measure]);

  // Si cambia el tamaño, el foco sigue al elemento.
  useEffect(() => {
    const redo = () => {
      const el = step?.target ? pick(step.target) : null;
      if (!el) return;
      const r = measure(el);
      setRect(r);
      setCur((c) => ({ ...c, x: r.x + Math.min(r.w * 0.6, r.w - 14), y: r.y + r.h * 0.55 }));
    };
    addEventListener("resize", redo);
    addEventListener("scroll", redo, true);
    return () => {
      removeEventListener("resize", redo);
      removeEventListener("scroll", redo, true);
    };
  }, [step, measure]);

  useEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 2) setCardH(h);
  }, [i, rect, cardH]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, list.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
      if (e.key === " " && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [list.length, onClose]);

  if (!step) return null;
  const pad = 8;
  const full = rect
    ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 }
    : null;
  // En el teléfono la tarjeta va abajo: si el elemento es alto, el foco se recorta justo encima de ella.
  const cardTop = typeof window === "undefined" ? 9999 : freeArea(cardH).bottom + 8;
  const hole =
    full && narrow() && full.y + full.h > cardTop
      ? { ...full, h: Math.max(48, cardTop - full.y) }
      : full;
  // La tarjeta va donde quepa sin tapar lo que se resalta: debajo, encima, a la izquierda o a la derecha.
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const cw = Math.min(400, vw - 32);
  const ch = cardH;
  const clampX = (x: number) => Math.max(16, Math.min(x, vw - cw - 16));
  const clampY = (y: number) => Math.max(16, Math.min(y, vh - ch - 16));
  let cardStyle: React.CSSProperties = {};
  if (hole && !narrow()) {
    const gap = 16;
    if (hole.y + hole.h + gap + ch <= vh)
      cardStyle = { top: hole.y + hole.h + gap, left: clampX(hole.x) };
    else if (hole.y - gap - ch >= 0) cardStyle = { top: hole.y - gap - ch, left: clampX(hole.x) };
    else if (hole.x - gap - cw >= 0) cardStyle = { top: clampY(hole.y), left: hole.x - gap - cw };
    else if (hole.x + hole.w + gap + cw <= vw)
      cardStyle = { top: clampY(hole.y), left: hole.x + hole.w + gap };
    else cardStyle = { top: clampY(vh - ch - 16), left: clampX(hole.x) };
  }

  return (
    <div
      className="tour"
      role="dialog"
      aria-modal="false"
      aria-label="Recorrido guiado de Traxo"
      aria-describedby="tour-text"
    >
      <div
        className="tour-shade"
        aria-hidden="true"
        style={
          hole
            ? {
                clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${hole.y}px,${hole.x}px ${hole.y}px,${hole.x}px ${hole.y + hole.h}px,${hole.x + hole.w}px ${hole.y + hole.h}px,${hole.x + hole.w}px ${hole.y}px,0 ${hole.y}px)`,
              }
            : undefined
        }
      />
      {hole && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{
            transform: `translate(${hole.x}px, ${hole.y}px)`,
            width: hole.w,
            height: hole.h,
          }}
        />
      )}
      {step.action?.kind === "click" && hole && (
        <div
          className="tour-cursor"
          aria-hidden="true"
          style={{ transform: `translate(${cur.x}px, ${cur.y}px)` }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24">
            <path
              d="M5 3l14 8-6.2 1.6L9.8 19 5 3z"
              fill="#141414"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span key={cur.click} className={cur.click ? "tour-ripple" : ""} />
        </div>
      )}
      <div
        ref={cardRef}
        className={`tour-card ${hole && !narrow() ? "float" : "center"}`}
        style={cardStyle}
      >
        <div className="row between" style={{ flexWrap: "nowrap" }}>
          <span className="label">
            Paso {i + 1} de {list.length}
          </span>
          <button type="button" className="btn ghost sm" onClick={() => onClose(false)}>
            Saltar recorrido
          </button>
        </div>
        <h2>{step.title}</h2>
        <p id="tour-text" className="break">
          {step.text}
        </p>
        <div className="tour-dots" aria-hidden="true">
          {list.map((s, n) => (
            <span key={s.id} className={n === i ? "on" : n < i ? "done" : ""} />
          ))}
        </div>
        <div className="row between">
          <div className="row">
            <button
              type="button"
              className="btn sm"
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              aria-label="Paso anterior"
            >
              <Icon name="back" size={16} />
            </button>
            <button
              type="button"
              className="btn sm"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
            >
              {playing ? "Pausar" : "Reanudar"}
            </button>
          </div>
          {last ? (
            <div className="row">
              <button type="button" className="btn sm" onClick={() => onClose(true)}>
                Quedarme aquí
              </button>
              <button type="button" className="btn sm agent" onClick={onAdmin}>
                Entrar a la cuenta admin
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn sm primary"
              onClick={() => setI((n) => Math.min(n + 1, list.length - 1))}
            >
              Siguiente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Avisa al servidor que el recorrido ya se vio (para no repetirlo en cada entrada). */
export const markTourDone = () => post("/api/auth/tour-done").catch(() => undefined);
