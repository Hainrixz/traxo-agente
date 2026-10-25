---
name: envios
description: Explica y ajusta cómo Traxo elige transportadora (costo, velocidad, confiabilidad, contraentrega) y cuánta autonomía tiene. Úsala si dicen "por qué eligió esa transportadora", "quiero lo más barato", "que las guías salgan solas" o "pon un tope".
---
<!-- Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors · tododeia.com · id er-ff6aa75d -->

# Envíos y autonomía

## Cómo elige Traxo
- Cotiza en **todas** las vías conectadas a la vez (agregadores y transportadoras directas) y mezcla las cotizaciones.
- En contraentrega descarta a quien no cobra el recaudo.
- Puntúa costo total (flete + comisión de recaudo), días hábiles y confiabilidad histórica (entregas sin novedad). Pesos por defecto: costo 0,55, velocidad 0,30, confiabilidad 0,15.
- Si la misma transportadora llega por dos vías, queda la más barata.
- Siempre explica la decisión con números: "Elegí X: $ 9.800 menos que Y y 1 día más rápido".

## Autonomía (`configurar_autonomia`, con `confirm`)
- **0**: todo con aprobación.
- **1**: guías, tracking y avisos al cliente automáticos, **dentro de un tope por guía**. Sobre el tope pide aprobación. Los anuncios y los créditos de Higgsfield piden aprobación siempre.

## Qué decir con honestidad
- Hoy solo Envia.com tiene integración real (sandbox: tarifas simuladas por ellos). 99envios y las transportadoras directas corren simuladas. No presentes un precio simulado como real.
- La confiabilidad con pocos envíos es solo un prior de 0,9; dilo si la persona basa una decisión en eso.
