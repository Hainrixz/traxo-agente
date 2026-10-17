# Roadmap

> **ES** · English below. Estado: pre-1.0. Las fases son un plan, no una promesa de fechas; se avanza por mercado y por contribuciones.

## Fase 0 · Posicionamiento (hecha)
README principal en inglés y `README.es.md`; hero y About en ambos idiomas; sección de mercados soportados; esta hoja de ruta y [`mercados.md`](mercados.md).

## Fase 1 · Idiomas
- Capa de textos (i18n) con **español** e **inglés**, idioma por navegador o `TRAXO_LOCALE`.
- Alcance: panel, respuestas del agente, plantillas de mensajes al cliente, mensajes del asistente `/traxo:instalar` y de `pnpm doctor`.
- Nombres de herramientas MCP y skills: alias en inglés manteniendo los actuales.
- *Hecho cuando:* una instalación en inglés se usa de punta a punta sin texto en español, y hay una guía para sumar un idioma.

## Fase 2 · Mercados como paquetes
- Interfaz `Market` (ver [`mercados.md`](mercados.md)); Colombia pasa a `packages/market-co`.
- Moneda por tienda (ISO 4217) y formato con `Intl`; teléfonos E.164 por país; dirección por país.
- Migración de datos con `patches.sql` idempotente y pruebas de regresión con la suite actual.
- *Hecho cuando:* Colombia funciona igual que hoy sobre la interfaz nueva y un mercado de prueba (simulado) se agrega sin tocar el núcleo.

## Fase 3 · Segundo mercado y pagos
- **México** como candidato natural (mismo idioma; Envia.com ya envía allá): paquete `market-mx`, pagos (Mercado Pago o Stripe) y consentimiento local.
- Contraentrega opcional por mercado.
- *Hecho cuando:* una tienda mexicana de prueba completa pedido → guía → seguimiento con adaptadores simulados y, con credenciales, reales.

## Fase 4 · Más allá de Latinoamérica
- Agregadores globales de envío (Shippo, EasyPost) y Stripe; módulos de privacidad GDPR/CCPA/LGPD.
- Se prioriza según lo que pida la comunidad: abre un issue «Mercado: <país>».

## Siempre
Instalación guiada que funcione desde cero (CI lo comprueba), sin llaves en el repo, y lo que gasta o publica pide confirmación.

---

## English
**Phase 0 · Positioning (done).** English-first README plus `README.es.md`, bilingual hero/About, supported-markets section, this roadmap and [`mercados.md`](mercados.md).
**Phase 1 · Languages.** An i18n layer with Spanish and English (browser language or `TRAXO_LOCALE`) covering the panel, agent replies, customer message templates and the wizard/doctor output; English aliases for MCP tool and skill names. *Done when* an English install works end to end with no Spanish text and there is a guide to add a language.
**Phase 2 · Markets as packages.** A `Market` interface; Colombia moves to `packages/market-co`; per-store ISO currency with `Intl` formatting, per-country E.164 phones and addresses; idempotent data migration and regression tests. *Done when* Colombia behaves exactly as today on the new interface and a test market can be added without touching the core.
**Phase 3 · Second market and payments.** Mexico as the natural candidate (same language; Envia.com already ships there): `market-mx`, Mercado Pago or Stripe, local consent; cash on delivery optional per market.
**Phase 4 · Beyond Latin America.** Global carrier aggregators (Shippo, EasyPost), Stripe, GDPR/CCPA/LGPD privacy modules, prioritized by community demand. Open an issue "Market: <country>".
**Always.** A guided install that works from scratch (CI checks it), no keys in the repo, and anything that spends or publishes asks first.
