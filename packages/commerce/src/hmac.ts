import { createHmac, timingSafeEqual } from "node:crypto";

export function hmac(secret: string, body: string, encoding: "hex" | "base64"): string {
  return createHmac("sha256", secret).update(body, "utf8").digest(encoding);
}

/** Comparación en tiempo constante. Devuelve false si las longitudes difieren. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Headers de Node llegan en minúsculas; este helper evita sorpresas. */
export function header(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v;
  return undefined;
}
