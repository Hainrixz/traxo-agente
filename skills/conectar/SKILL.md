---
name: conectar
description: Guía para conectar la tienda (Shopify, Tiendanube, WooCommerce), la plataforma de envíos (Envia.com, 99envios) y WhatsApp (Zernio) sin pegar llaves en el chat. Úsala si dicen "conecta mi Shopify", "no ve mi tienda", "me da error" o "dónde pongo la API key".
---

# Conectar la tienda y los envíos

**Nunca pidas, leas ni repitas una llave.** Si la persona pega una en el chat, no la copies: dile que va en `.env` (o en las variables de Railway) y sigue. Tú solo puedes saber si una conexión está lista, con `traxo_estado`.

## Cómo se conecta cada cosa (todo en `.env`; la plantilla es `.env.example`)
- **Shopify**: crea una app personalizada en Ajustes → Apps → Desarrollar apps. Permisos mínimos: leer pedidos, productos y clientes, y gestionar envíos (fulfillment orders). Variables: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`. Webhook de `orders/create` apuntando a `<URL>/webhooks/commerce/shopify`.
- **Tiendanube**: app propia con OAuth. Variables `TIENDANUBE_STORE_ID`, `TIENDANUBE_ACCESS_TOKEN`, `TIENDANUBE_APP_SECRET`. Webhook `order/created` a `<URL>/webhooks/commerce/tiendanube`. Su webhook solo trae el id; Traxo pide el pedido completo.
- **WooCommerce**: claves REST (lectura/escritura) sobre HTTPS. Variables `WOOCOMMERCE_URL`, `WOOCOMMERCE_KEY`, `WOOCOMMERCE_SECRET`. Webhook `order.created` a `<URL>/webhooks/commerce/woocommerce`.
- **Envia.com**: token del panel de desarrolladores (sandbox primero). `ENVIA_TOKEN` y `ENVIA_ENV=sandbox`. Es la única plataforma de envíos con integración real hoy.
- **99envios, Coordinadora, Servientrega, Interrapidísimo, Envía**: todavía simuladas (sin documentación pública o con contrato). Dilo tal cual.
- **WhatsApp (Zernio)**: `ZERNIO_API_KEY`. Sin ella los mensajes son simulados.

## Pasos
1. `traxo_estado` para ver qué está conectado.
2. Explica solo lo que falta, de una vez, con la ruta exacta del panel.
3. Cuando la persona diga que ya puso las variables, pídele que reinicie Traxo y vuelve a llamar `traxo_estado`.
4. Si hay un error, explica en una frase qué pasó y el siguiente paso. No pegues el volcado crudo.
5. Importa y comprueba: `listar_pedidos` y `listar_productos` deben mostrar datos reales de la tienda.
