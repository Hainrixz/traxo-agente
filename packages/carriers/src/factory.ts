import { EnviaComProvider } from "./envia.ts";
import { type MockCarrierProvider, mockProviders } from "./mock.ts";
import type { CarrierProvider } from "./types.ts";

type Env = Record<string, string | undefined>;

export type CarriersSetup = {
  providers: CarrierProvider[];
  /** Mensajes para mostrar en Conexiones (qué es real y qué es simulado). */
  notes: string[];
  /** Los simuladores, para poder avanzar guías en la demo. */
  mocks: MockCarrierProvider[];
};

/**
 * Arma las vías de envío: Envia.com real si hay token; el resto, simuladas.
 * No existe todavía un adapter real para 99envios (sin documentación pública) ni para las transportadoras directas (SOAP/contrato).
 */
export function carriersFromEnv(env: Env = process.env): CarriersSetup {
  const mocks = mockProviders();
  const notes: string[] = [];
  const providers: CarrierProvider[] = [];

  for (const m of mocks) {
    if (m.id === "envia-com" && env.ENVIA_TOKEN) {
      providers.push(
        new EnviaComProvider({
          token: env.ENVIA_TOKEN,
          env: env.ENVIA_ENV === "production" ? "production" : "sandbox",
          origin: {
            name: env.ORIGIN_NAME ?? "Tienda",
            phone: env.ORIGIN_PHONE ?? "+573000000000",
            street: env.ORIGIN_STREET ?? "Calle 1 # 1-1",
            city: env.ORIGIN_CITY ?? "Bogotá",
            dane: env.ORIGIN_DANE ?? "11001",
          },
        }),
      );
      notes.push(
        `Envia.com: real (${env.ENVIA_ENV === "production" ? "producción" : "sandbox, tarifas simuladas por Envia.com"}).`,
      );
    } else {
      providers.push(m);
      notes.push(`${m.label}: simulado.`);
    }
  }
  const pending: Array<[string, string]> = [
    ["NOVENTA_Y_NUEVE_ENVIOS_TOKEN", "99envios (sin documentación pública de su API)"],
    ["COORDINADORA_API_KEY", "Coordinadora (SOAP, requiere contrato)"],
    ["SERVIENTREGA_USER", "Servientrega (SOAP, requiere contrato)"],
    ["INTERRAPIDISIMO_TOKEN", "Interrapidísimo (documentación privada)"],
    ["ENVIA_CO_USER", "Envía (sin documentación pública)"],
  ];
  for (const [key, label] of pending) {
    if (env[key])
      notes.push(
        `Hay credenciales de ${label}, pero el adapter real aún no existe: se usa el simulador.`,
      );
  }
  return { providers, notes, mocks };
}
