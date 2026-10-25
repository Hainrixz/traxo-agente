---
name: reportes
description: Reportes de ventas, de qué anuncio trajo qué venta (ROAS) y de logística por transportadora, con lo que no se puede saber marcado como N/A. Úsala si dicen "cómo voy", "qué anuncio funciona", "cuánto gasté en ads", "qué transportadora es mejor" o "dame el reporte".
---
<!-- Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors · tododeia.com · id er-ff6aa75d -->

# Reportes

1. `reporte_ventas` (pedidos, ventas, ticket, % contraentrega, % entregados, % devueltos).
2. `reporte_atribucion`: pedidos y ventas por canal y por campaña, con el gasto que reporta la plataforma.
3. `reporte_logistica`: por transportadora, entregados, novedades, devueltos, costo y días; y el recaudo cobrado y en ruta.

## Reglas
- **ROAS solo con gasto conocido** (ventas ÷ gasto). Sin gasto es `N/A`: nunca estimes.
- Cada afirmación lleva su número: «TikTok · suscripción: ROAS 0,8× — gasta $ 485.000 y trae $ 388.000».
- Con pocos envíos (< 10) por transportadora, di que el dato es poco confiable.
- «Recaudado» son entregas con contraentrega; cuándo consigna cada transportadora depende de su contrato y no se conoce desde aquí: dilo.
- Si los datos son de ejemplo, dilo al principio.

## Qué entregar
Primero lo que cuesta dinero: campañas con ROAS < 1, transportadoras con muchas novedades o devoluciones, recaudo en ruta. Después lo que va bien. Termina con **una** acción: por ejemplo, pausar (la persona, en la plataforma) la campaña que pierde plata. Tú no activas ni apagas anuncios.
