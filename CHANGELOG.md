# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto aún es pre-1.0: pueden cambiar cosas entre versiones.

## [Sin publicar]

## [0.1.0] · 2026-10
Primera versión para la comunidad.

### Agregado
- Agente de logística: validación de dirección (DANE), selección de transportadora con explicación, confirmación de contraentrega con prepago, guías, tracking y novedades.
- Panel en español: Inicio, Agente, Pedidos, Envíos, Aprobaciones, Mensajes (WhatsApp, Instagram y Messenger), Clientes, Marketing, Tienda y SEO, Reportes, **Uso agéntico** y **Constructor** de tienda (tema de Shopify).
- Plugin de Claude Code con 12 skills, 4 agentes y 41 herramientas MCP; asistente `/traxo:instalar`.
- Instalación local (PGlite) o en Railway (Postgres); `pnpm configurar`, `pnpm doctor` y `pnpm railway:vars` sin imprimir secretos.
- IA opcional con tu llave de Claude (solo en el servidor) y frenos de gasto.
- Seguridad: cabeceras, límites por IP, `/mcp` con token, webhooks firmados, aislamiento por tienda.
