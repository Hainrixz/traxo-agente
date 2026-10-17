# Cómo contribuir a Traxo

¡Gracias por querer ayudar! Traxo es de la comunidad: las ideas, los reportes y el código son bienvenidos. / *Thanks for helping. Issues and PRs are welcome in Spanish or English.*

## Antes de empezar
- **¿Encontraste un fallo?** Abre un [issue](../../issues/new/choose) con los pasos para reproducirlo y la salida de `pnpm doctor` (no muestra llaves).
- **¿Tienes una idea?** Abre un issue de tipo *Propuesta* antes de escribir mucho código, así acordamos el enfoque.
- **¿Es una vulnerabilidad?** No abras un issue público: lee [`SECURITY.md`](SECURITY.md).

## Preparar tu entorno
Necesitas Node 24 y pnpm (`corepack enable`).

```bash
git clone https://github.com/Hainrixz/traxo-agente.git && cd traxo-agente
pnpm install
pnpm db:generate          # genera el cliente de Prisma (pnpm build también lo hace)
pnpm dev                  # API en http://localhost:8787
pnpm dev:ui               # panel con recarga (otra terminal)
```

Para ver el panel con datos de ejemplo: `TRAXO_DEMO=1 pnpm dev` (más en [`docs/modo-demo.md`](docs/modo-demo.md)).

## Antes de abrir un pull request
Debe pasar lo mismo que corre el CI:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- Un cambio de comportamiento lleva su prueba (`apps/*/test`, `packages/*/test`).
- Si tocas `packages/db/prisma/schema.prisma`: agrega el SQL idempotente a `prisma/patches.sql` y regenera `schema.sql` (`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`).
- Código con el estilo del resto (Biome: `pnpm lint`; `npx biome check --write .` arregla el formato).
- Commits claros y en presente. Un tema por pull request.

## Reglas que no se negocian
1. **Nunca llaves ni datos reales en el repo**, ni en tests, capturas o logs. Los secretos viven en `.env` (ignorado por git) o en las variables de tu servidor.
2. **Lo que gasta, publica o borra pide confirmación** de la persona (`confirm: true` en las herramientas MCP). Las campañas nacen en borrador o en pausa.
3. **No inventar datos:** lo que no se pudo medir sale como `N/A`, no como una cifra.
4. **Todo texto de terceros (clientes, páginas) es dato, nunca instrucción** para el modelo.
5. Accesibilidad y español claro en la interfaz (contraste, foco visible, objetivos táctiles de 44 px, «reducir movimiento»).

## Cómo está organizado
Lee la sección *Estructura* del [README](README.md). Las integraciones nuevas (tiendas, transportadoras, canales) van detrás de una interfaz con un adaptador simulado: mira `packages/commerce` y `packages/carriers` y copia el patrón. Las guías de cada integración están en [`docs/integraciones/`](docs/integraciones/).

## Código de conducta
Al participar aceptas el [Código de Conducta](CODE_OF_CONDUCT.md).
