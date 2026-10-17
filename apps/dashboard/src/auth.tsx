import { useState } from "react";
import { post } from "./api.ts";
import type { Account, AuthInfo } from "./types.ts";
import { Icon, Logo } from "./ui.tsx";

type Res = { ok: boolean; message?: string; account?: Account };

/** Líneas decorativas del panel de marca (sin librerías): se desplazan despacio y se detienen con reduced-motion. */
function Paths() {
  const paths = Array.from({ length: 14 }, (_, i) => {
    const y = 40 + i * 34;
    return `M-20 ${y} C 120 ${y - 70 - i * 3}, 260 ${y + 90 + i * 2}, 420 ${y - 20} S 640 ${y - 90}, 720 ${y + 30}`;
  });
  return (
    <svg
      className="auth-paths"
      viewBox="0 0 700 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.6 + i * 0.05}
          strokeOpacity={0.12 + i * 0.012}
          style={{ animationDelay: `${i * -1.3}s` }}
        />
      ))}
    </svg>
  );
}

const SAMPLE = {
  name: "Camila Torres",
  email: "camila@mitienda.co",
  storeName: "Mi Tienda de Prueba",
  password: "demo1234",
};

export function AuthScreen({
  info,
  onAuthed,
}: {
  info: AuthInfo;
  onAuthed: (a: Account, fresh: boolean) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ name: "", email: "", storeName: "", password: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const submit = async (kind: "login" | "signup", body: Record<string, string>, label: string) => {
    setBusy(label);
    setError(undefined);
    try {
      const r = await post<Res>(`/api/auth/${kind}`, body);
      if (r.ok && r.account) onAuthed(r.account, kind === "signup");
      else setError(r.message ?? "No se pudo entrar. Revisa los datos.");
    } catch {
      setError("No pude conectar con Traxo. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setBusy(undefined);
    }
  };
  const admin = info.demoAdmin;

  return (
    <div className="auth">
      <aside className="auth-brand">
        <Paths />
        <div className="auth-brand-in">
          <div className="logo auth-logo">
            <Logo size={34} />
            traxo
          </div>
          <div className="auth-copy">
            <h1>Tu tienda, en piloto automático</h1>
            <p>
              Traxo cotiza y elige transportadora, confirma las contraentregas por WhatsApp, sigue
              cada guía y te cuenta qué anuncio trajo cada venta.
            </p>
            <ul className="auth-points">
              <li>
                <Icon name="truck" size={18} /> Envíos que se eligen solos, con la razón a la vista
              </li>
              <li>
                <Icon name="chat" size={18} /> Novedades y clientes atendidos por WhatsApp
              </li>
              <li>
                <Icon name="megaphone" size={18} /> Campañas siempre en pausa hasta que tú digas
              </li>
            </ul>
          </div>
          <p className="auth-foot caption">
            Demo con datos de ejemplo. Nada se envía ni se cobra de verdad.
          </p>
        </div>
      </aside>

      <main className="auth-form" id="contenido">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className="auth-tab"
              onClick={() => {
                setMode("login");
                setError(undefined);
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className="auth-tab"
              onClick={() => {
                setMode("signup");
                setError(undefined);
              }}
            >
              Crear cuenta
            </button>
          </div>

          {mode === "login" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                submit("login", { email: f.email, password: f.password }, "login");
              }}
              noValidate
            >
              <div>
                <h2>Bienvenida de nuevo</h2>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  Entra a tu panel de Traxo.
                </p>
              </div>
              {admin && (
                <button
                  type="button"
                  className="auth-admin"
                  onClick={() =>
                    submit("login", { email: admin.email, password: admin.password }, "admin")
                  }
                  disabled={busy !== undefined}
                  data-tour="login-admin"
                >
                  <span className="ic">
                    <Icon name="spark" size={20} />
                  </span>
                  <span>
                    <strong>
                      {busy === "admin" ? "Entrando…" : "Entrar como admin de ejemplo"}
                    </strong>
                    <span className="d">
                      Café de Origen con 90 días de datos de ejemplo en todas las funciones
                    </span>
                  </span>
                  <Icon name="back" size={18} />
                </button>
              )}
              {admin && (
                <div className="auth-or">
                  <span>o con tu correo</span>
                </div>
              )}
              <label className="field">
                <span>Correo</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={f.email}
                  onChange={set("email")}
                  placeholder="tu@correo.co"
                />
              </label>
              <label className="field">
                <span>Contraseña</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={f.password}
                  onChange={set("password")}
                />
              </label>
              {error && (
                <div className="auth-error" role="alert">
                  <Icon name="alert" size={16} />
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn primary block"
                disabled={busy !== undefined || !f.email || !f.password}
              >
                {busy === "login" ? "Entrando…" : "Entrar"}
              </button>
              {admin && (
                <p className="caption" style={{ margin: 0 }}>
                  Admin de ejemplo: <span className="mono">{admin.email}</span> ·{" "}
                  <span className="mono">{admin.password}</span>
                </p>
              )}
            </form>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                submit("signup", f, "signup");
              }}
              noValidate
            >
              <div>
                <h2>Crea una cuenta de prueba</h2>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  Empiezas con una tienda vacía y un recorrido guiado que te muestra Traxo paso a
                  paso.
                </p>
              </div>
              <label className="field">
                <span>Tu nombre</span>
                <input
                  className="input"
                  autoComplete="name"
                  value={f.name}
                  onChange={set("name")}
                />
              </label>
              <label className="field">
                <span>Nombre de tu tienda</span>
                <input className="input" value={f.storeName} onChange={set("storeName")} />
              </label>
              <label className="field">
                <span>Correo</span>
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={f.email}
                  onChange={set("email")}
                />
              </label>
              <label className="field">
                <span>Contraseña</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={f.password}
                  onChange={set("password")}
                />
                <span className="caption">
                  Mínimo 6 caracteres. Es una demo: no uses una contraseña real.
                </span>
              </label>
              {error && (
                <div className="auth-error" role="alert">
                  <Icon name="alert" size={16} />
                  {error}
                </div>
              )}
              <div className="row">
                <button
                  type="submit"
                  className="btn agent"
                  style={{ flex: "1 1 220px" }}
                  disabled={
                    busy !== undefined || !f.name || !f.email || !f.storeName || !f.password
                  }
                  data-tour="signup-submit"
                >
                  {busy === "signup" ? "Creando…" : "Crear cuenta y empezar el recorrido"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setF({
                      ...SAMPLE,
                      email: `camila${Math.floor(Math.random() * 9000 + 1000)}@mitienda.co`,
                    })
                  }
                >
                  Autocompletar
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
