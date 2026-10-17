# Mercados / Markets

> **ES** · [English below](#english)

Traxo nació para **Colombia** y hoy es el único mercado soportado de punta a punta. La meta es que cualquier país pueda sumarse **agregando un paquete**, sin reescribir el agente. Esta guía dice qué está acoplado hoy, cómo se va a aislar y cómo puedes ayudar.

## Qué es específico de Colombia hoy
| Pieza | Dónde vive hoy | Qué tendrá que ser configurable |
|---|---|---|
| Moneda | `currency: "COP"` en `packages/core/src/domain.ts`, `formatCOP` | Código ISO de moneda por tienda y formato con `Intl` |
| Direcciones | `AddressSchema` exige `dane` de 5 dígitos; `packages/geo-co` (ciudades, normalización) | Modelo de dirección por país (DANE, código postal, estado/provincia) |
| Teléfonos | `normalizePhone` a `+57…` | E.164 por país |
| Privacidad | Consentimiento y baja bajo la Ley 1581 | Módulos de consentimiento (GDPR, LGPD, CCPA, Ley 1581…) |
| Envíos | Envia.com (Coordinadora, Servientrega, Interrapidísimo, TCC) en `packages/carriers` | Transportadoras por mercado |
| Pagos | Wompi en `packages/payments` | Proveedores por mercado (Mercado Pago, Stripe…) |
| Contraentrega | Flujo central del pipeline | Opcional por mercado (en muchos países no existe) |
| Idioma | Panel, agente, plantillas y skills en español | Capa i18n (español e inglés primero) |

## Diseño propuesto: la interfaz `Market`
Cada mercado es un paquete (`packages/market-co`, `packages/market-mx`…) que exporta:

```ts
interface Market {
  code: "CO";                       // ISO 3166-1 alfa-2
  currency: "COP";                  // ISO 4217
  locale: "es-CO";
  addressSchema: ZodSchema;         // cómo es una dirección aquí
  normalizePhone(raw: string): string | undefined;   // → E.164
  findPlace(input: string): Place | undefined;       // ciudad / municipio
  privacy: { consentRequired: boolean; optOutKeyword: string; law: string };
  carriers(): CarrierProvider[];    // vías de envío disponibles
  payments(): PaymentsProvider[];   // pasarelas disponibles
  cashOnDelivery: boolean;
}
```

El runtime elige el mercado por tienda (`TRAXO_MARKET=CO` o el país de la tienda). Colombia se convierte en el primer paquete y la suite de pruebas actual es la red de seguridad de la migración.

## Cómo ayudar
1. **Revisa [`docs/ROADMAP.md`](ROADMAP.md)** y elige una fase.
2. **Un país nuevo:** abre un issue «Mercado: <país>» con las transportadoras, pasarelas, formato de dirección/teléfono y la ley de datos locales. Con eso armamos el paquete juntos.
3. **Traducciones:** cuando exista la capa i18n (fase 1), cada idioma es un archivo de textos.
4. Sigue las reglas de [`CONTRIBUTING.md`](../CONTRIBUTING.md): sin llaves ni datos reales, y lo que gasta o publica pide confirmación.

---

## English

Traxo started in **Colombia**, which is the only market supported end to end today. The goal is that any country can join **by adding a package**, without rewriting the agent. This guide lists what is coupled today, how it will be isolated and how you can help.

### What is Colombia-specific today
Currency (`COP` is hard-coded in the domain model and formatter), addresses (a 5-digit `dane` code is required; `packages/geo-co`), phones (`+57` normalization), privacy (Ley 1581 consent/opt-out), carriers (Envia.com: Coordinadora, Servientrega, Interrapidísimo, TCC), payments (Wompi), the cash-on-delivery flow (central to the pipeline), and language (panel, agent, templates and skills are in Spanish).

### Proposed design: a `Market` interface
Each market is a package (`packages/market-co`, `packages/market-mx`…) exporting its ISO country and currency, locale, address schema, phone normalizer, place lookup, privacy rules, carriers, payment providers and whether cash on delivery exists (see the TypeScript sketch above). The runtime selects the market per store. Colombia becomes the first package, and the current test suite is the safety net for the migration.

### How to help
1. Pick a phase in [`ROADMAP.md`](ROADMAP.md).
2. **New country:** open an issue titled "Market: <country>" with carriers, payment gateways, address and phone formats and the local data-protection law; we build the package together.
3. **Translations:** once the i18n layer exists (phase 1), each language is one strings file.
4. Follow [`CONTRIBUTING.md`](../CONTRIBUTING.md): no real keys or data; anything that spends or publishes needs confirmation.
