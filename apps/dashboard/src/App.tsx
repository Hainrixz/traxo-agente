import { useCallback, useEffect, useRef, useState } from "react";
import { get, post, useAgentFeed, useResource } from "./api.ts";
import { AuthScreen } from "./auth.tsx";
import { LoadingShell, Sheet } from "./components.tsx";
import { cop } from "./format.ts";
import { markTourDone, STEPS, Tour } from "./tour.tsx";
import type { Account, AuthInfo, OrderRow, State, StoreStatus } from "./types.ts";
import { Icon, Logo, ToneBadge } from "./ui.tsx";
import { Actividad, Aprobaciones, type Ctx, Inicio, OrderSheet, Pedidos } from "./views.tsx";
import { Agente } from "./views-agent.tsx";
import { Constructor } from "./views-builder.tsx";
import { Clientes, Marketing } from "./views-growth.tsx";
import { Mensajes } from "./views-messages.tsx";
import { Reportes } from "./views-reports.tsx";
import { Ajustes, Conexiones } from "./views-settings.tsx";
import { Envios } from "./views-ship.tsx";
import { TiendaSeo } from "./views-store.tsx";
import { UsoAgentico } from "./views-usage.tsx";

type Item = [id: string, label: string, icon: string];
const SECTIONS: Array<[string, Item[]]> = [
  [
    "Operación",
    [
      ["inicio", "Inicio", "home"],
      ["agente", "Agente", "spark"],
      ["pedidos", "Pedidos", "box"],
      ["envios", "Envíos", "truck"],
      ["aprobaciones", "Aprobaciones", "alert"],
      ["conversaciones", "Mensajes", "chat"],
    ],
  ],
  [
    "Crecimiento",
    [
      ["clientes", "Clientes", "users"],
      ["marketing", "Marketing", "megaphone"],
      ["tienda", "Tienda y SEO", "search"],
      ["reportes", "Reportes", "chart"],
      ["constructor", "Constructor", "layout"],
      ["uso", "Uso agéntico", "bolt"],
    ],
  ],
];
// Lo que se consulta de vez en cuando va plegado en «Más»; lo que se configura vive en el menú del perfil.
const EXTRAS: Item[] = [
  ["actividad", "Actividad del agente", "activity"],
  ["conexiones", "Conexiones", "plug"],
];
const SETTINGS: Item = ["ajustes", "Ajustes y límites", "settings"];
const ALL: Item[] = [...SECTIONS.flatMap(([, items]) => items), ...EXTRAS, SETTINGS];
const VIEWS = new Set(ALL.map(([id]) => id));
// En el teléfono caben cuatro pestañas y "Más": lo demás vive en la hoja.
const TABS: Item[] = [
  ["inicio", "Inicio", "home"],
  ["pedidos", "Pedidos", "box"],
  ["agente", "Agente", "spark"],
  ["conversaciones", "Mensajes", "chat"],
];
const MORE = ALL.filter(([id]) => !TABS.some(([t]) => t === id)).map(([id]) => id);

function useTheme(): [string, () => void] {
  const [t, setT] = useState<string>(() => {
    try {
      return localStorage.getItem("traxo-theme") ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }, [t]);
  const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  return [
    dark ? "dark" : "light",
    () => {
      const next = dark ? "light" : "dark";
      setT(next);
      try {
        localStorage.setItem("traxo-theme", next);
      } catch {
        /* sin almacenamiento */
      }
    },
  ];
}

const hashView = (): string => {
  const h = location.hash.slice(1);
  return VIEWS.has(h) ? h : "inicio";
};

export default function App() {
  const [info, setInfo] = useState<AuthInfo>();
  const [account, setAccount] = useState<Account | null>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    get<AuthInfo>("/api/auth/me")
      .then((i) => {
        setInfo(i);
        setAccount(i.account);
      })
      .catch(() => setInfo({ account: null, login: true, demo: true }));
    const out = () => setAccount(null);
    addEventListener("traxo:unauth", out);
    return () => removeEventListener("traxo:unauth", out);
  }, []);

  const [startTourOnEnter, setStartTourOnEnter] = useState(false);

  if (!info)
    return (
      <div className="auth-boot">
        <LoadingShell />
      </div>
    );
  if (info.login && !account) {
    return (
      <AuthScreen
        info={info}
        onAuthed={(a, fresh) => {
          setStartTourOnEnter(fresh || !a.tourDone);
          setAccount(a);
          if (fresh) location.hash = "inicio";
        }}
      />
    );
  }
  const acct: Account = account ?? {
    id: "local",
    email: "local",
    name: "Tú",
    role: "owner",
    storeId: "",
    tourDone: true,
  };
  return (
    <Shell
      account={acct}
      info={info}
      theme={theme}
      toggleTheme={toggleTheme}
      tourOnEnter={startTourOnEnter}
      onLogout={async () => {
        await post("/api/auth/logout");
        setAccount(null);
        setStartTourOnEnter(false);
      }}
      onSwitchAdmin={async () => {
        if (!info.demoAdmin) return;
        await post("/api/auth/logout");
        const r = await post<{ ok: boolean; account?: Account }>("/api/auth/login", info.demoAdmin);
        if (r.ok && r.account) {
          setStartTourOnEnter(false);
          setAccount(r.account);
          location.hash = "inicio";
        }
      }}
    />
  );
}

function Shell({
  account,
  info,
  theme,
  toggleTheme,
  tourOnEnter,
  onLogout,
  onSwitchAdmin,
}: {
  account: Account;
  info: AuthInfo;
  theme: string;
  toggleTheme: () => void;
  tourOnEnter: boolean;
  onLogout: () => void;
  onSwitchAdmin: () => void;
}) {
  const [view, setView] = useState(hashView);
  const feed = useAgentFeed();
  const [bump, setBump] = useState(0);
  const tick = feed.tick + bump;
  const [toast, setToast] = useState<{ m: string; show: boolean }>();
  const [more, setMore] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [sel, setSel] = useState<string>();
  const [tourOpen, setTourOpen] = useState(false);
  const state = useResource<State>("/api/state", tick).data;
  const orders = useResource<OrderRow[]>("/api/orders", tick).data ?? [];
  const store = useResource<StoreStatus>("/api/store/status", tick).data;
  const main = useRef<HTMLElement>(null);

  const go = useCallback((v: string) => {
    setView(v);
    setMore(false);
    setSel(undefined);
    location.hash = v;
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);
  const timers = useRef<number[]>([]);
  const notify = useCallback((m: string) => {
    for (const t of timers.current) clearTimeout(t);
    setToast({ m, show: false });
    timers.current = [
      window.setTimeout(() => setToast({ m, show: true }), 20),
      window.setTimeout(() => setToast({ m, show: false }), 4200),
      window.setTimeout(() => setToast(undefined), 4600),
    ];
  }, []);
  useEffect(() => {
    const h = () => setView(hashView());
    addEventListener("hashchange", h);
    return () => removeEventListener("hashchange", h);
  }, []);

  // El recorrido arranca solo en una cuenta nueva (con la tienda cargada).
  useEffect(() => {
    if (!tourOnEnter || !state) return;
    const t = setTimeout(() => setTourOpen(true), 700);
    return () => clearTimeout(t);
  }, [tourOnEnter, Boolean(state)]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const last = feed.events.at(-1);
  const working = Boolean(last && now - new Date(last.at).getTime() < 4000);
  const tags = new Map(orders.map((o) => [o.id, o.number]));
  const ctx: Ctx = {
    tick,
    events: feed.events,
    fresh: feed.fresh,
    toast: notify,
    go,
    tags,
    working,
    refresh: () => setBump((b) => b + 1),
    account,
    settings: state?.settings,
    startTour: () => {
      setMore(false);
      setTourOpen(true);
    },
  };
  const pend = state?.kpis.pendingApprovals ?? 0;
  const moreActive = MORE.includes(view);
  const sheetOrder = orders.find((o) => o.id === sel);
  const initials = account.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navBtn = ([id, label, icon]: Item) => (
    <button
      key={id}
      type="button"
      className="nav"
      title={label}
      aria-current={view === id ? "page" : undefined}
      onClick={() => go(id)}
      data-tour={`nav-${id}`}
    >
      <Icon name={icon} />
      <span className="lbl">{label}</span>
      {id === "aprobaciones" && pend > 0 && <span className="count">{pend}</span>}
    </button>
  );

  return (
    <div className="app">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>

      <nav className="sidebar" aria-label="Principal">
        <div className="logo">
          <Logo size={30} />
          <span className="lbl">traxo</span>
          <span
            className={`livedot ${feed.live ? "on" : ""}`}
            role="img"
            aria-label={feed.live ? "En vivo" : "Reconectando"}
            title={feed.live ? "En vivo" : "Reconectando"}
          />
        </div>
        {SECTIONS.map(([sec, items]) => (
          <div key={sec} className="navsec" role="group" aria-label={sec}>
            <div className="navsec-t">{sec}</div>
            {items.map(navBtn)}
          </div>
        ))}
        <div className="navsec" role="group" aria-label="Más">
          <button
            type="button"
            className="navsec-t navsec-toggle"
            aria-expanded={extrasOpen || EXTRAS.some(([id]) => id === view)}
            onClick={() => setExtrasOpen((o) => !o)}
          >
            Más
            <Icon
              name={extrasOpen || EXTRAS.some(([id]) => id === view) ? "chevron" : "chevdown"}
              size={14}
            />
          </button>
          {(extrasOpen || EXTRAS.some(([id]) => id === view)) && EXTRAS.map(navBtn)}
        </div>
        <div className="spacer" />
        <ProfileMenu
          account={account}
          info={info}
          settings={state?.settings}
          theme={theme}
          toggleTheme={toggleTheme}
          view={view}
          go={go}
          startTour={ctx.startTour}
          demo={Boolean(state?.demo)}
          onLogout={onLogout}
          initials={initials}
        />
      </nav>

      <div style={{ minWidth: 0 }}>
        <header className="mtop">
          <div className="logo">
            <Logo size={26} />
            traxo
          </div>
          <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
            <ToneBadge tone={feed.live ? "success" : "neutral"}>
              {feed.live ? "En vivo" : "Sin conexión"}
            </ToneBadge>
            <button
              type="button"
              className="btn ghost"
              style={{ minWidth: 44, padding: 0 }}
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
            </button>
          </div>
        </header>

        <main id="contenido" className="main" ref={main} tabIndex={-1} style={{ outline: "none" }}>
          {!state ? (
            <LoadingShell />
          ) : (
            <>
              {view === "inicio" && (
                <Inicio
                  ctx={ctx}
                  orders={orders}
                  state={state}
                  imported={Boolean(store?.imported)}
                  openOrder={(id) => {
                    go("pedidos");
                    setSel(id);
                  }}
                />
              )}
              {view === "actividad" && <Actividad ctx={ctx} />}
              {view === "pedidos" && (
                <Pedidos ctx={ctx} orders={orders} sel={sel} setSel={setSel} />
              )}
              {view === "envios" && <Envios ctx={ctx} />}
              {view === "aprobaciones" && <Aprobaciones ctx={ctx} />}
              {view === "conversaciones" && <Mensajes ctx={ctx} />}
              {view === "agente" && <Agente ctx={ctx} />}
              {view === "clientes" && <Clientes ctx={ctx} />}
              {view === "marketing" && <Marketing ctx={ctx} />}
              {view === "tienda" && <TiendaSeo ctx={ctx} />}
              {view === "reportes" && <Reportes ctx={ctx} />}
              {view === "uso" && <UsoAgentico ctx={ctx} />}
              {view === "constructor" && <Constructor ctx={ctx} />}
              {view === "conexiones" && <Conexiones ctx={ctx} state={state} />}
              {view === "ajustes" && <Ajustes ctx={ctx} />}
            </>
          )}
        </main>
      </div>

      <nav className="tabbar" aria-label="Principal">
        {TABS.map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            className="tab"
            aria-current={view === id ? "page" : undefined}
            onClick={() => go(id)}
          >
            <Icon name={icon} size={22} />
            {label}
            {id === "aprobaciones" && pend > 0 && <span className="count">{pend}</span>}
          </button>
        ))}
        <button
          type="button"
          className="tab"
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          onClick={() => setMore(true)}
          data-tour="tab-mas"
        >
          <Icon name="more" size={22} />
          Más
          {pend > 0 && <span className="count">{pend}</span>}
        </button>
      </nav>

      {more && (
        <Sheet title="Más" onClose={() => setMore(false)}>
          <div className="stack tight">
            {ALL.filter(([id]) => MORE.includes(id)).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                className="convitem"
                onClick={() => go(id)}
                aria-current={view === id}
              >
                <span className="avatar" aria-hidden="true">
                  <Icon name={icon} size={18} />
                </span>
                <strong>{label}</strong>
                {id === "aprobaciones" && pend > 0 && <span className="count static">{pend}</span>}
              </button>
            ))}
            <div className="who" style={{ margin: "12px 12px 0" }}>
              <span className="avatar sm" aria-hidden="true">
                {initials}
              </span>
              <span className="who-t">
                <strong className="break">{account.name}</strong>
                <span className="caption">
                  {state?.demo
                    ? account.role === "admin"
                      ? "Admin de ejemplo"
                      : "Cuenta de prueba"
                    : "Administrador"}
                </span>
              </span>
            </div>
            <div className="row" style={{ margin: "8px 12px 0" }}>
              {state?.demo && (
                <button type="button" className="btn sm" onClick={ctx.startTour}>
                  Ver recorrido
                </button>
              )}
              {info.login && (
                <button type="button" className="btn sm" onClick={onLogout}>
                  Cerrar sesión
                </button>
              )}
            </div>
            <p className="caption" style={{ margin: "8px 12px 0" }}>
              {state
                ? `Autonomía ${state.settings.autonomy}: ${state.settings.autonomy === 1 ? `guías automáticas hasta ${cop(state.settings.maxAutoShipmentCost)}` : "todo con tu aprobación"}.`
                : ""}
            </p>
          </div>
        </Sheet>
      )}

      {view !== "pedidos" && sheetOrder && (
        <OrderSheet ctx={ctx} order={sheetOrder} onClose={() => setSel(undefined)} />
      )}

      {tourOpen && state && (
        <Tour
          ctx={{ account, imported: Boolean(store?.imported) }}
          steps={STEPS}
          go={go}
          onClose={(finished) => {
            setTourOpen(false);
            void markTourDone();
            if (finished)
              notify("Cuando quieras, vuelve a verlo en Ajustes → Ver el recorrido guiado.");
          }}
          onAdmin={() => {
            setTourOpen(false);
            void markTourDone();
            onSwitchAdmin();
          }}
        />
      )}

      <div className={`toast ${toast?.show ? "show" : ""}`} role="status" aria-live="polite">
        {toast?.m}
      </div>
    </div>
  );
}

/** Perfil abajo a la izquierda: de aquí se llega a todo lo configurable (ajustes, límites, conexiones) y a la cuenta. */
function ProfileMenu({
  account,
  info,
  settings,
  theme,
  toggleTheme,
  view,
  go,
  startTour,
  demo,
  onLogout,
  initials,
}: {
  account: Account;
  info: AuthInfo;
  settings?: State["settings"];
  theme: string;
  toggleTheme: () => void;
  view: string;
  go: (v: string) => void;
  startTour: () => void;
  demo: boolean;
  onLogout: () => void;
  initials: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    // La barra lateral recorta lo que se sale de ella: el menú se coloca con position: fixed junto al botón.
    const r = box.current?.getBoundingClientRect();
    if (r)
      setPos(
        r.width < 120
          ? { left: r.right + 12, bottom: Math.max(12, innerHeight - r.bottom) }
          : { left: r.left, width: Math.max(r.width, 264), bottom: innerHeight - r.top + 8 },
      );
    first.current?.focus();
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (box.current?.querySelector(".profile-btn") as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const role = demo
    ? account.role === "admin"
      ? "Admin de ejemplo"
      : "Cuenta de prueba"
    : "Administrador";
  return (
    <div className="profile" ref={box}>
      {open && (
        <div
          className="profile-menu"
          role="menu"
          aria-label="Cuenta y configuración"
          style={pos}
          data-tour="profile-menu"
        >
          <div className="pm-head">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="pm-who">
              <strong className="break">{account.name}</strong>
              <span className="caption break">{account.email}</span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="pm-limits"
            ref={first}
            onClick={pick(() => go("ajustes"))}
          >
            <span className="row between" style={{ flexWrap: "nowrap" }}>
              <span className="row" style={{ gap: 6 }}>
                <Icon name="spark" size={14} />
                <strong>Autonomía {settings?.autonomy ?? "—"}</strong>
              </span>
              <span className="caption">Ajustar</span>
            </span>
            <span className="caption">
              {settings
                ? settings.autonomy === 1
                  ? `Guías automáticas hasta ${cop(settings.maxAutoShipmentCost)}`
                  : "Todo con tu aprobación"
                : ""}
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="pm-item"
            aria-current={view === "ajustes" ? "page" : undefined}
            onClick={pick(() => go("ajustes"))}
          >
            <Icon name="settings" size={18} />
            Ajustes y límites
          </button>
          <button
            type="button"
            role="menuitem"
            className="pm-item"
            aria-current={view === "conexiones" ? "page" : undefined}
            onClick={pick(() => go("conexiones"))}
          >
            <Icon name="plug" size={18} />
            Conexiones
          </button>
          <div className="pm-sep" role="separator" />
          <button type="button" role="menuitem" className="pm-item" onClick={toggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            {theme === "dark" ? "Tema claro" : "Tema oscuro"}
          </button>
          {demo && (
            <button type="button" role="menuitem" className="pm-item" onClick={pick(startTour)}>
              <Icon name="play" size={18} />
              Ver el recorrido guiado
            </button>
          )}
          {info.login && (
            <button type="button" role="menuitem" className="pm-item" onClick={pick(onLogout)}>
              <Icon name="logout" size={18} />
              Cerrar sesión
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="profile-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-tour="profile"
      >
        <span className="avatar sm" aria-hidden="true">
          {initials}
        </span>
        <span className="who-t">
          <strong className="break">{account.name}</strong>
          <span className="caption">{role}</span>
        </span>
        <Icon name="chevron" size={16} />
      </button>
    </div>
  );
}
