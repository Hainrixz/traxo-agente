import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEv } from "./ui.tsx";

/** El token del panel viaja en la URL una vez (?token=…) y luego se guarda solo en esta pestaña. */
function token(): string {
  try {
    const fromUrl = new URLSearchParams(location.search).get("token");
    if (fromUrl) sessionStorage.setItem("traxo-token", fromUrl);
    return sessionStorage.getItem("traxo-token") ?? "";
  } catch {
    return "";
  }
}
const auth = (): Record<string, string> => (token() ? { Authorization: `Bearer ${token()}` } : {});

/** Cuando la sesión caduca o se cierra en otra pestaña, el panel vuelve a la pantalla de acceso. */
const unauth = (): void => {
  window.dispatchEvent(new Event("traxo:unauth"));
};

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: auth(), credentials: "same-origin" });
  if (r.status === 401 && !path.startsWith("/api/auth/")) unauth();
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

export async function post<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth() },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (r.status === 401 && !path.startsWith("/api/auth/")) unauth();
  return r.json() as Promise<T>;
}

export async function del<T = unknown>(path: string): Promise<T> {
  const r = await fetch(path, { method: "DELETE", headers: auth(), credentials: "same-origin" });
  if (r.status === 401) unauth();
  return r.json() as Promise<T>;
}

/** Eventos del agente en vivo: carga el historial y se suscribe por SSE. Cada evento nuevo avisa a las vistas para refrescarse. */
export function useAgentFeed(enabled = true): {
  events: AgentEv[];
  tick: number;
  live: boolean;
  fresh: Set<string>;
} {
  const [events, setEvents] = useState<AgentEv[]>([]);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    seen.current = new Set();
    setEvents([]);
    setFresh(new Set());
    let es: EventSource | undefined;
    let closed = false;
    get<AgentEv[]>("/api/events")
      .then((h) => {
        for (const e of h) seen.current.add(e.id);
        setEvents(h);
      })
      .catch(() => {});
    const open = () => {
      es = new EventSource(
        token() ? `/api/stream?token=${encodeURIComponent(token())}` : "/api/stream",
      );
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("agent", (m) => {
        const e = JSON.parse((m as MessageEvent).data) as AgentEv;
        if (seen.current.has(e.id)) return;
        seen.current.add(e.id);
        setEvents((prev) => [...prev, e].slice(-300));
        setFresh((f) => new Set(f).add(e.id));
        setTick((t) => t + 1);
      });
      es.onerror = () => {
        setLive(false);
        es?.close();
        if (!closed) setTimeout(open, 2000);
      };
    };
    open();
    return () => {
      closed = true;
      es?.close();
    };
  }, [enabled]);
  return { events, tick, live, fresh };
}

/** Pide un recurso y lo vuelve a pedir cuando cambia `tick` (llega un evento del agente). */
export function useResource<T>(
  path: string | null,
  tick: number,
): { data: T | undefined; reload: () => void; error?: string; loading: boolean } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(Boolean(path));
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let off = false;
    get<T>(path)
      .then((d) => {
        if (off) return;
        setData(d);
        setError(undefined);
        setLoading(false);
      })
      .catch((e) => {
        if (off) return;
        setError((e as Error).message);
        setLoading(false);
      });
    return () => {
      off = true;
    };
  }, [path, tick, n]);
  return { data, reload: useCallback(() => setN((x) => x + 1), []), error, loading };
}
