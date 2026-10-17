---
name: start
description: Empieza con Traxo: revisa qué está conectado, explica si corre local o en la nube, importa la tienda y entrevista al dueño una sola vez. Úsala si dicen "empezar con Traxo", "configurar Traxo", "qué puede hacer Traxo" o "conectar mi tienda".
---

# Empezar con Traxo

Traxo opera tu tienda en Colombia: cotiza y elige transportadora, confirma contraentregas por WhatsApp, genera la guía, hace tracking, atiende novedades y prepara marketing, auditoría y seguimiento de clientes. Tú supervisas; él trabaja.

## Reglas
1. Español de tú, directo; explica los términos de oficio la primera vez (guía, novedad, recaudo, contraentrega).
2. Nada que gaste dinero o toque una cuenta real sale sin un sí explícito en este turno.
3. Las llaves nunca se leen, imprimen ni piden en el chat: viven en `.env` o en las variables de Railway.
4. Si un dato no está en la fuente, es `N/A`.

## Pasos
0. Si Traxo todavía no está instalado o configurado (no hay `.env`, `pnpm doctor` marca ✗ o `traxo_estado` no responde), manda a la persona a **`/traxo:instalar`**: es el asistente de instalación. Esta skill es para después, ya con Traxo corriendo.
1. `traxo_estado`: tienda, pedidos, qué conexiones son **reales** y cuáles **simuladas** (una guía simulada no mueve ningún paquete).
2. Dile dónde corre: **local** (PGlite, sin Docker) o **nube** (worker en Railway con Postgres; define `TRAXO_URL` y `TRAXO_MCP_TOKEN`).
3. Si la tienda no está importada: `importar_tienda` (catálogo, clientes e historial).
4. Pide **de una vez** lo que falte (ver `/traxo:conectar` para las llaves): qué vendes y a quién, plataforma de envíos que usas y con qué transportadoras, % de contraentrega, ciudad de despacho, y si prefieres guías automáticas (autonomía 1) o con tu aprobación (0). Anota en `negocio.md`.
5. `configurar_autonomia` y `configurar_confirmacion` solo cuando lo pidan y con `confirm`.
6. Siguiente paso concreto: `/traxo:conectar`, `/traxo:pedidos`, `/traxo:tienda` o `/traxo:reportes`.
