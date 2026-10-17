import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("::ffff:127.") ||
    v6.startsWith("::ffff:10.") ||
    v6.startsWith("::ffff:192.168.")
  );
}

export class UnsafeUrlError extends Error {}

/** Solo http(s) a servidores públicos: una herramienta que "mira una URL" no puede servir para tocar la red interna. */
export async function assertPublicUrl(
  raw: string,
  resolve: (host: string) => Promise<string[]> = async (h) =>
    (await lookup(h, { all: true })).map((a) => a.address),
): Promise<URL> {
  let u: URL;
  try {
    // Sin esquema ("tienda.co") se asume https; con esquema se respeta para poder rechazar ftp:, file:, etc.
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new UnsafeUrlError("Esa dirección no es una URL válida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new UnsafeUrlError("Solo se pueden revisar páginas http o https.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal"))
    throw new UnsafeUrlError("No se pueden revisar direcciones internas.");
  const addrs = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addrs.length === 0) throw new UnsafeUrlError("No pude resolver ese dominio.");
  if (addrs.some(isPrivateAddress))
    throw new UnsafeUrlError("No se pueden revisar direcciones internas.");
  return u;
}

export type Fetched = { url: string; status: number; body: string; truncated: boolean };

/** GET con tope de tamaño, de tiempo y de redirecciones; cada salto se vuelve a validar. */
export async function safeGet(
  raw: string,
  opts: {
    fetch?: typeof fetch;
    resolve?: (h: string) => Promise<string[]>;
    maxBytes?: number;
    timeoutMs?: number;
  } = {},
): Promise<Fetched> {
  const f = opts.fetch ?? fetch;
  const max = opts.maxBytes ?? 1_500_000;
  let url = (await assertPublicUrl(raw, opts.resolve)).toString();
  for (let hop = 0; hop < 4; hop++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
    try {
      const res = await f(url, {
        redirect: "manual",
        signal: ctl.signal,
        headers: {
          "User-Agent": "TraxoAudit/0.1 (+https://github.com/Hainrixz/traxo-agente)",
          Accept: "text/html,*/*",
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = (
          await assertPublicUrl(
            new URL(res.headers.get("location") as string, url).toString(),
            opts.resolve,
          )
        ).toString();
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      const truncated = buf.length > max;
      return {
        url,
        status: res.status,
        body: new TextDecoder().decode(truncated ? buf.slice(0, max) : buf),
        truncated,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UnsafeUrlError("Demasiadas redirecciones.");
}
