# Tiendas, mensajería y anuncios (investigado el 16 oct 2026)

## Adapters de tienda (en el código, probados con fixtures)
- **Shopify** — GraphQL Admin con versión fijada (`SHOPIFY_API_VERSION`, por defecto 2026-07: verificar si 2026-10 ya es estable). `fulfillmentCreate` con `trackingInfo`. Webhook `orders/create`, firma `X-Shopify-Hmac-Sha256` (base64 del cuerpo crudo). La contraentrega se detecta por pasarela (`Cash on Delivery`) o etiqueta `COD`.
- **Tiendanube** — `api.tiendanube.com/2025-03/{store_id}`, token OAuth que no expira, `User-Agent` obligatorio, 2 req/s. **SIN VERIFICAR:** el nombre del header de autenticación (`Authentication: bearer` o `Authorization: Bearer`; se mandan los dos) y la codificación de la firma `x-linkedstore-hmac-sha256` (se aceptan hex y base64). El webhook solo trae `{store_id, event, id}`: hay que pedir el pedido con `getOrder`.
- **WooCommerce** — `/wp-json/wc/v3`, Basic con consumer key/secret sobre HTTPS, firma `X-WC-Webhook-Signature` (base64). No tiene tracking nativo: se escribe como nota al cliente y metadatos.

## Mensajería (Zernio)
- `https://zernio.com/api/v1`, `Authorization: Bearer sk_…`. Webhooks `message.received|sent|failed` y `conversation.started`, firma `X-Zernio-Signature` (HMAC-SHA256 hex), dedupe por `X-Zernio-Event-Id`, responder 2xx en 5 s.
- **SIN VERIFICAR:** la ruta exacta de envío (`POST /inbox/conversations/{id}/messages`), la forma del *button reply* y si recibir mensajes exige un plan de pago. Mientras tanto corre `MockMessaging`.
- WhatsApp fuera de la ventana de 24 h solo admite plantillas aprobadas.

## Anuncios
- **Meta:** el conector de Meta Ads de Claude permite crear campañas; Traxo las deja siempre en pausa.
- **Google Ads:** el MCP oficial (`googleads/google-ads-mcp`) es de solo lectura. Crear campañas exige la API directa; en esta versión queda como borrador exportable.
- **TikTok:** existe un MCP oficial de TikTok for Business, pero su endpoint no está verificado. Borrador exportable.
- **Higgsfield:** gasta créditos. Una generación por petición, con costo dicho antes y confirmación en el mismo turno.
