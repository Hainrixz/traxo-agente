// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
/** Cómo el servidor MCP habla con el worker de Traxo. Local (en proceso) o remoto (Railway). */
export interface TraxoClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string): Promise<T>;
}

export class TraxoApiError extends Error {}

/** Cliente HTTP: TRAXO_URL apunta al worker (http://localhost:8787 o la URL de Railway). */
export function httpClient(baseUrl: string, token?: string, f: typeof fetch = fetch): TraxoClient {
  const base = baseUrl.replace(/\/$/, "");
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    let res: Response;
    try {
      res = await f(`${base}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new TraxoApiError(
        `No pude conectar con Traxo en ${base}. Si es local, arráncalo con "pnpm dev"; si es la nube, revisa TRAXO_URL.`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok)
      throw new TraxoApiError(json.error ?? json.message ?? `Traxo respondió ${res.status}.`);
    return json;
  };
  return {
    get: (p) => call(p),
    post: (p, body) => call(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
    del: (p) => call(p, { method: "DELETE" }),
  };
}

/** Cliente en proceso: llama a la app Hono sin abrir un puerto. */
export function inProcessClient(app: {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
}): TraxoClient {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await app.request(path, init);
    const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!res.ok)
      throw new TraxoApiError(json.error ?? json.message ?? `Traxo respondió ${res.status}.`);
    return json;
  };
  return {
    get: (p) => call(p),
    post: (p, body) => call(p, { method: "POST", body: JSON.stringify(body ?? {}) }),
    del: (p) => call(p, { method: "DELETE" }),
  };
}
