---
name: marketing
description: Estrategia de marketing a partir del catálogo real y del negocio: qué productos empujar, mensajes y ángulos, con datos de ventas y márgenes. Úsala si dicen "qué anuncio hago", "qué vendo más", "plan de marketing" o "a quién le vendo".
---

# Marketing desde los datos de la tienda

Parte de datos reales, nunca de supuestos.

1. `listar_productos`: ventas, ingresos y margen. **El margen es N/A si no hay costo cargado**; pídelo en vez de inventarlo.
2. `segmentar_clientes`: recompra, nuevos, inactivos. Las campañas de reactivación van a inactivos con consentimiento.
3. Lee `negocio.md` (qué vende, a quién, ticket, % contraentrega). Si no existe, corre `/traxo:start`.
4. Propón **2 o 3 ángulos** (producto + público + promesa). Para cada uno: la evidencia con el número que la sostiene ("Kit degustación: 38 % de los ingresos, margen 47 %"), el riesgo y qué medirías.
5. Prioriza por dinero: primero el producto con más ingreso y margen sano; después los que tienen margen pero poca venta.
6. Si la persona elige un ángulo, pasa a `/traxo:campana`.

## Si tienes estas herramientas, úsalas (opcionales)
- Skills de Claude Ads / Claude SEO para la estrategia y la auditoría de la tienda.
- Copy: escribe el texto en español de Colombia, sin palabras prohibidas por la marca si hay `marca.json`.

No prometas resultados ni inventes cifras de rendimiento: sin datos de campañas, di "N/A".
