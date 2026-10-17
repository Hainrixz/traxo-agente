---
name: tienda
description: Audita la tienda (SEO, visibilidad en IA, diseño y conversión) y dice qué arreglar primero, con el puntaje sobre los checks que sí se pudieron medir. Úsala si dicen "audita mi tienda", "cómo está mi SEO", "por qué no vendo", "revisa mi página" o "qué le falta a mi tienda".
---

# Auditoría de tienda (SEO y diseño)

Dos informes: **SEO y visibilidad en IA** (cómo te encuentra Google y los asistentes de IA) y **diseño y conversión** (qué ve un cliente en el teléfono). La auditoría **propone**; no edita el theme ni nada de la tienda.

## Reglas
- El puntaje se calcula **solo sobre los checks que se pudieron medir**. Di siempre «66 sobre 15 de 16 checks» y nombra lo que quedó en **N/A** (p. ej. Core Web Vitals: necesita medir en un navegador real). Un puntaje honesto con N/A vale más que uno inflado.
- Cada hallazgo lleva el dato que lo disparó («72 caracteres», «9 de 24 imágenes con alt»). Sin dato, no hay hallazgo.
- Ordena por impacto: primero lo que afecta cómo te encuentran o cuánto convierte; después lo cosmético.
- Si el informe es de **ejemplo**, dilo en la primera línea.

## Flujo
1. Si hay una URL pública de la tienda, úsala; si no, el informe de ejemplo sirve para mostrar el formato. Pide la URL **una sola vez**.
2. `auditar_tienda` con `tipo: "seo"` y luego `tipo: "diseno"`. Auditar una URL real exige `TRAXO_AUDIT_LIVE=1` en el servidor (lee solo páginas públicas, nunca direcciones internas).
3. Entrega: puntaje y checks evaluados, **«Empieza por aquí»** (4 acciones) y las fallas con su evidencia.
4. Para ir más hondo, si tienes instalado el plugin de Claude SEO: `/claude-seo-ai:audit` sobre la URL y el agente `claude-seo-ai:schema-generator` para **proponer** el JSON-LD de producto (precio en COP, disponibilidad). Preséntalo como diff para que la persona lo aplique.
5. Cierra con la primera acción concreta y cuánto tardaría.

No prometas posiciones en Google ni aumentos de ventas.
