# Integraciones de envío (investigado el 16 oct 2026)

Estado en el código: **Envia.com tiene adapter real** (`packages/carriers/src/envia.ts`, probado con fetch simulado y listo para el sandbox). El resto corre como **simulador** (`MockCarrierProvider`) hasta tener documentación o contrato. Lo que no se pudo verificar está marcado como **SIN VERIFICAR**.

## Envia.com (agregador) — adapter real
- Hosts: sandbox `https://api-test.envia.com`, producción `https://api.envia.com`. Auth: `Authorization: Bearer <token>` (el token de sandbox no sirve en producción).
- Credenciales: crear cuenta en `accounts-sandbox.envia.com/signup` → `shipping-test.envia.com/settings/developers` → API Keys.
- Endpoints: `POST /ship/rate/` (una transportadora por llamada; Traxo las paraleliza), `/ship/generate/`, `/ship/generaltrack/`, `/ship/cancel/`, `/ship/pickup/`.
- Transportadoras de Colombia: Coordinadora, Servientrega, Interrapidísimo, TCC, Deprisa (además DHL, FedEx, 99minutos y otras). Envía (Colvanes) **no** aparece.
- Contraentrega: `additionalServices: [{ service: "cash_on_delivery", data: { amount } }]`; la cotización trae `cashOnDeliveryCommission`.
- Los errores pueden llegar con HTTP 200 y `meta: "error"`; el adapter lo traduce.
- **SIN VERIFICAR en sandbox:**
  1. Dónde va `cash_on_delivery` (envío vs. paquete): la doc se contradice. Se cambia con `codPlacement`.
  2. Si `totalPrice` incluye o no la comisión de recaudo (hoy se suman por separado).
  3. Códigos de estado y `postalCode` de Colombia (hoy se envían el código DIVIPOLA de 2 dígitos y el DANE). Consultar `GET /address-structure/CO` y `GET /state?country_code=CO` con el token.
  4. Cuerpo de `/ship/cancel/` (`carrier`+`trackingNumber` vs. `shipmentId`).
  5. Hash de la firma de webhooks (`v1=HMAC(ts.event.body)`): se asumió SHA-256 hex.
  6. Cuáles transportadoras ofrecen contraentrega en Colombia por esta vía.
- Los precios del sandbox son simulados por Envia.com; el dashboard lo dice.

## 99envios — sin adapter real
- Se anuncia con "API Rest", TCC, Coordinadora, Interrapidísimo, Servientrega y Envía, y contraentrega en más de 1.054 municipios con billetera del vendedor.
- **No hay documentación pública** (ni portal, ni Swagger, ni GitHub). Hay que pedirla a su soporte o al panel `99envios.co`.
- Mientras tanto corre el simulador con la misma forma que Envia.com. Es 99envios, no 99minutos (otra empresa).

## Transportadoras directas — sin adapter real (requieren contrato)
| Transportadora | Qué se encontró | Qué falta |
|---|---|---|
| Coordinadora | SOAP: AGS cotiza y rastrea (`Cotizador_cotizar`, `Seguimiento_detallado`), AGW genera guías (`Guias_generarGuia`), `Recogidas_programar`. DANE de 8 dígitos. Credenciales: API key, NIT, id de cliente, `div`/`cuenta`, usuario de guías. | WSDL de producción y el campo de recaudo al crear la guía. |
| Servientrega | SOAP con token de sesión (4 días): `liquidation`/`Cotizador/Tarifas`, `CargueMasivoExterno`/`GenerarGuia`, `EstadoGuia`, `AnularGuias`. Recaudo con `Num_Recaudo`. Usa su propio `idCiudad`. | Documentación oficial y el significado de los campos de recaudo. |
| Interrapidísimo | REST B2B (documento v3.0 privado, `x-app-signature` + bearer). Crear un "preenvío" genera la guía; validar el origen toma unos 2 días hábiles. | El documento oficial: rutas, recaudo, cancelación. |
| Envía (envia.co, Colvanes) | Sin documentación pública; solo un SDK comunitario (`liquidation`, guía con `dice_contener`, DANE de 5 dígitos). | Contrato y documentación. |

Alternativas con API pública y contraentrega que se podrían sumar: Skydropx Colombia, Mipaquete.

## Qué hace Traxo con esto
- `geo-co` guarda el DANE de 5 dígitos y lo convierte (`dane8` para Coordinadora). Falta el mapeo a `idCiudad` de Servientrega.
- El selector mezcla las cotizaciones de todas las vías; si una transportadora llega por dos, gana la más barata.
- El seguimiento sin credenciales enlaza a las páginas públicas de rastreo; no se hace scraping.
