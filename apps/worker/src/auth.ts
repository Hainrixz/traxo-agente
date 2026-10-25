// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  AccountError,
  type AccountView,
  accountById,
  DEMO_ADMIN,
  login,
  markTourDone,
  signup,
} from "@traxo/db";
import type { Context, Hono } from "hono";
import type { Runtime } from "./runtime.ts";

type Session = { a: string; s: string; r: "admin" | "owner"; exp: number };

/** Secreto por proceso: solo el propio servidor (p. ej. el endpoint /mcp) puede llamar a la API sin sesión. */
export const INTERNAL = randomBytes(24).toString("hex");
const COOKIE = "traxo_session";
const DAYS = 14;
const SECRET = process.env.TRAXO_SESSION_SECRET ?? randomBytes(32).toString("hex");

const b64 = (s: string): string => Buffer.from(s).toString("base64url");
const mac = (body: string, secret = SECRET): string =>
  createHmac("sha256", secret).update(body).digest("base64url");

export function signSession(s: Omit<Session, "exp">, secret = SECRET, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...s, exp: now + DAYS * 86_400_000 }));
  return `${body}.${mac(body, secret)}`;
}

export function readSession(
  token: string | undefined,
  secret = SECRET,
  now = Date.now(),
): Session | undefined {
  if (!token) return undefined;
  const [body, sig] = token.split(".");
  if (!body || !sig) return undefined;
  const good = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return undefined;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return s.exp > now ? s : undefined;
  } catch {
    return undefined;
  }
}

const cookieOf = (c: Context): string | undefined =>
  c.req
    .header("cookie")
    ?.split(/;\s*/)
    .map((p) => p.split("="))
    .find(([k]) => k === COOKIE)?.[1];

const setCookie = (c: Context, token: string, maxAge = DAYS * 86400): void => {
  const secure =
    (c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "")) === "https";
  c.header(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`,
  );
};

/** Tienda de la sesión actual (o la tienda por defecto si no hay sesión: tests, MCP en proceso). */
export const storeOf = (c: Context, fallback: string): string =>
  (c.get as (k: string) => string | undefined)("storeId") ?? fallback;
export const accountOf = (c: Context): AccountView | undefined =>
  (c.get as (k: string) => AccountView | undefined)("account");

// Límite simple por IP: la demo pública no debe poder inundarse de cuentas o intentos.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 600_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
/** IP del cliente. Detrás del proxy de Railway la última entrada de x-forwarded-for es la que añade el proxy; la primera la puede inventar quien llama. */
export const ipOf = (c: Context): string =>
  c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";

export type AuthOptions = {
  /** false = sin pantalla de acceso (uso personal local). Por defecto true. */
  login?: boolean;
  /** Si se define, también se acepta `Authorization: Bearer <token>` (MCP y scripts) y entra a la tienda por defecto. */
  apiToken?: string;
  /** Muestra las credenciales de ejemplo en la pantalla de acceso. */
  demo?: boolean;
};

/**
 * Sesiones por cookie firmada. Registra /api/auth/* y un middleware que exige sesión (o token) en el resto de /api/*.
 * Debe montarse ANTES de registerApi.
 */
export function mountAuth(app: Hono, rt: Runtime, opts: AuthOptions = {}): void {
  const needLogin = opts.login ?? true;
  const publicInfo = () => ({
    login: needLogin,
    demo: Boolean(opts.demo),
    ...(opts.demo ? { demoAdmin: { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password } } : {}),
  });

  const start = (c: Context, a: AccountView) => {
    setCookie(c, signSession({ a: a.id, s: a.storeId, r: a.role }));
    return c.json({ ok: true, account: a });
  };

  app.get("/api/auth/me", async (c) => {
    const s = readSession(cookieOf(c));
    const account = s ? await accountById(rt.db, s.a) : undefined;
    return c.json({ account: account ?? null, ...publicInfo() });
  });

  app.post("/api/auth/login", async (c) => {
    if (limited(`login:${ipOf(c)}`, 30))
      return c.json({ ok: false, message: "Demasiados intentos. Espera unos minutos." }, 429);
    const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
    const a = await login(rt.db, b.email ?? "", b.password ?? "");
    return a
      ? start(c, a)
      : c.json({ ok: false, message: "Correo o contraseña incorrectos." }, 401);
  });

  app.post("/api/auth/signup", async (c) => {
    // El registro libre solo existe en modo demo: una instalación normal tiene una sola cuenta, la tuya.
    if (!opts.demo) return c.json({ ok: false, message: "El registro está cerrado." }, 403);
    if (limited(`signup:${ipOf(c)}`, 10))
      return c.json(
        { ok: false, message: "Demasiados registros desde esta red. Usa la cuenta admin." },
        429,
      );
    const b = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      password?: string;
      storeName?: string;
    };
    try {
      return start(
        c,
        await signup(rt.db, {
          name: b.name ?? "",
          email: b.email ?? "",
          password: b.password ?? "",
          storeName: b.storeName ?? "",
        }),
      );
    } catch (e) {
      if (e instanceof AccountError) return c.json({ ok: false, message: e.message }, 400);
      throw e;
    }
  });

  app.post("/api/auth/logout", (c) => {
    setCookie(c, "", 0);
    return c.json({ ok: true });
  });

  app.post("/api/auth/tour-done", async (c) => {
    const s = readSession(cookieOf(c));
    if (s) await markTourDone(rt.db, s.a);
    return c.json({ ok: true });
  });

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();
    const s = readSession(cookieOf(c));
    if (s) {
      const account = await accountById(rt.db, s.a);
      if (account) {
        c.set("storeId" as never, account.storeId as never);
        c.set("account" as never, account as never);
        return next();
      }
    }
    if (c.req.header("x-traxo-internal") === INTERNAL) return next();
    const bearer =
      c.req.header("authorization")?.replace(/^Bearer /, "") ??
      new URL(c.req.url).searchParams.get("token");
    if (opts.apiToken && bearer === opts.apiToken) return next();
    if (!needLogin && !opts.apiToken) return next();
    return c.json({ error: "Inicia sesión para continuar." }, 401);
  });
}
