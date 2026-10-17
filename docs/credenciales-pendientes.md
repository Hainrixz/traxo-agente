# Credenciales y verificaciones pendientes

Traxo corre completo sin nada de esto, con adapters simulados. Esto es lo que falta para pasar cada pieza a real. Las llaves solo van en `.env` o en las variables de Railway; nunca en el chat.

## Tienda (elige una)
| Qué | Variables | Qué verificar al conectarla |
|---|---|---|
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_API_VERSION` | Crear una app personalizada con permisos de pedidos, productos, clientes y fulfillment. Webhook `orders/create` → `<URL>/webhooks/commerce/shopify`. Confirmar la versión de API estable (2026-07 por defecto; ver si 2026-10 ya lo es) y que `fulfillmentCreate` acepte el `trackingInfo`. |
| Tiendanube | `TIENDANUBE_STORE_ID`, `TIENDANUBE_ACCESS_TOKEN`, `TIENDANUBE_APP_SECRET` | La documentación se contradice en el header de auth (`Authentication: bearer` vs `Authorization: Bearer`; se mandan ambos) y en la codificación de la firma (se aceptan hex y base64). Confirmar con una tienda de pruebas. |
| WooCommerce | `WOOCOMMERCE_URL`, `WOOCOMMERCE_KEY`, `WOOCOMMERCE_SECRET`, `WOOCOMMERCE_WEBHOOK_SECRET` | Tienda con HTTPS. Woo no tiene tracking nativo: se escribe como nota y metadatos. |

## Envíos
| Qué | Variables | Qué falta |
|---|---|---|
| Envia.com (adapter real) | `ENVIA_TOKEN`, `ENVIA_ENV=sandbox`, `ORIGIN_*` | Token de sandbox. Verificar con él: dónde va `cash_on_delivery` (`codPlacement`), si `totalPrice` incluye la comisión de recaudo, los códigos de estado y postales de Colombia (`GET /address-structure/CO`), el cuerpo de `/ship/cancel/` y el hash de la firma de webhooks. Detalle en `docs/integraciones/envios.md`. |
| 99envios | — | Pedir la documentación de su API a su soporte. Sin ella no se puede escribir el adapter. |
| Coordinadora, Servientrega, Interrapidísimo, Envía | — | Contrato comercial y documentación oficial; hoy corren simuladas. |

## Mensajería
| Qué | Variables | Qué verificar |
|---|---|---|
| Zernio (WhatsApp) | `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_PROFILE_ID` | Rutas exactas de envío, forma del *button reply*, si recibir mensajes pide plan de pago, y plantillas de utilidad aprobadas por Meta (`pedido_en_camino`, `llega_hoy`, `novedad_entrega`, `confirmar_contraentrega`). |

## Anuncios y creativos (desde Claude, no desde variables)
- Meta Ads: conector de Meta en tu cuenta de Claude. Las campañas se crean en pausa y se verifica.
- Google Ads: el MCP oficial es solo lectura; crear campañas exige la API directa. Hoy es borrador exportable.
- TikTok: hay un MCP oficial, con endpoint sin verificar. Hoy es borrador exportable.
- Higgsfield: conector en tu cuenta; cada generación cuesta créditos y se confirma antes.

## Para una tienda real
- `TRAXO_API_TOKEN`: protege `/api`. El dashboard lo toma de `?token=…`.
- `TRAXO_MCP_TOKEN`: protege `/mcp`.
- `ANTHROPIC_API_KEY`: opcional; hoy las respuestas del cliente se atienden con reglas simples y lo que no se entiende se escala a una persona.

## Pendiente de diseño
- Logo oficial de Traxo: el dashboard usa una aproximación con formas simples.
- Componentes del sistema de diseño: se reescribieron desde `tokens.json` y el README; conviene reemplazarlos por el bundle oficial.
- Ciudades: `geo-co` incluye 44 municipios principales; falta el DIVIPOLA completo y el mapeo a `idCiudad` de Servientrega.

## Variables nuevas (cuentas, pagos y webhooks)
| Variable | Para qué | Estado |
|---|---|---|
| `TRAXO_SESSION_SECRET` | Firma de sesiones del panel (nube: fijo) | Definir en Railway |
| `TRAXO_ADMIN_EMAIL` / `TRAXO_ADMIN_PASSWORD` | Cuenta que entra con una tienda real | Pendiente |
| `TRAXO_MODE=live` | Fuerza modo real (sin datos de ejemplo) | Opcional |
| `WOMPI_PRIVATE_KEY`, `WOMPI_ENV`, `WOMPI_EVENTS_SECRET` | Links de pago (prepago de contraentrega) | Pendiente |
| `ENVIA_WEBHOOK_SECRET` | Firma del webhook de tracking de Envia.com | Pendiente |
| `ORIGIN_*` | Dirección de origen de los envíos | Pendiente |
| `TRAXO_AUDIT_LIVE=1` | Auditar URLs públicas reales | Opcional |

## Agente del panel y biblioteca
| Variable | Para qué | Estado |
|---|---|---|
| `ANTHROPIC_API_KEY` / `TRAXO_AGENT_MODEL` | El agente del panel responde en lenguaje libre (sin ella responde con reglas sobre tus datos) | Opcional |
| `TRAXO_MEDIA_DIR` | Carpeta de los videos y fotos de la biblioteca (en Railway, un volumen) | Opcional |
| Higgsfield | Traer y generar creativos: se hace desde Claude con el conector, no con llaves en Traxo | Conectar en Claude |
