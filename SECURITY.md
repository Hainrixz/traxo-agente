# Política de seguridad

Traxo maneja pedidos, datos de clientes y llaves de terceros. Si encuentras una vulnerabilidad, **no abras un issue público**.

## Cómo reportarla
Usa **[Security → Report a vulnerability](../../security/advisories/new)** de este repositorio (aviso privado de GitHub). Incluye los pasos para reproducirla y el impacto. Respondemos lo antes posible y coordinamos la divulgación contigo.

## Qué cubre
- Fugas de llaves o datos (API, panel, `/mcp`, webhooks, logs).
- Saltarse la autenticación, el aislamiento entre tiendas o la firma de webhooks.
- SSRF, inyección y XSS (incluida la vista previa del Constructor).
- Instrucciones de terceros que logren que el agente actúe (inyección de prompts) o gaste sin confirmación.

## Lo que ya hace el proyecto
Cabeceras de seguridad; límite de peticiones por IP; cuerpo máximo de 1 MB; `/mcp` y la API protegidos con token; sesiones firmadas y aisladas por tienda; webhooks con firma y deduplicación; auditorías protegidas contra SSRF; la llave de Claude solo vive en el servidor; y los frenos de gasto de IA. El detalle está en el README.

## Tu parte al instalarlo
- Los secretos van en `.env` o en las variables de tu servidor, **nunca en el chat ni en el repo**.
- En producción define `TRAXO_ADMIN_EMAIL`, `TRAXO_ADMIN_PASSWORD`, `TRAXO_SESSION_SECRET` y `TRAXO_MCP_TOKEN` (el asistente `/traxo:instalar` los genera por ti).
- No actives `TRAXO_DEMO=1` en un servidor con datos reales: abre el registro y trae datos de ejemplo.
- Mantén las dependencias al día (Dependabot está activado).

## Versiones con soporte
Solo la última versión en `main`.
