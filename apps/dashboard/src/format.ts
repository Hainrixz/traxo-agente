/** Formatos del sistema: `$ 125.000`, `16 oct 2026`, `9:42 a. m.`, `+57 300 123 4567`. */
export const cop = (n: number): string =>
  `${n < 0 ? "−" : ""}$ ${Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

export const copShort = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  return cop(n);
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const dateEs = (iso: string | Date): string => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const timeEs = (iso: string | Date): string => {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "a. m." : "p. m."}`;
};
export const phoneEs = (e164: string): string => {
  const m = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+57 ${m[1]} ${m[2]} ${m[3]}` : e164;
};
export const days = (n: number): string => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;

export const score = (n: number | null): string =>
  n == null ? "—" : n.toFixed(2).replace(".", ",");
export const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

const VIA: Record<string, string> = {
  "envia-com": "Envia.com",
  "99envios": "99envios",
  coordinadora: "Coordinadora (directa)",
  interrapidisimo: "Interrapidísimo (directa)",
  servientrega: "Servientrega (directa)",
  "envia-co": "Envía (directa)",
};
export const viaLabel = (provider: string): string => VIA[provider] ?? provider;

/** Para listas donde ya se ve la transportadora: «Envia.com», «99envios» o «directa». */
export const viaShort = (provider: string): string =>
  provider === "envia-com" ? "Envia.com" : provider === "99envios" ? "99envios" : "directa";
