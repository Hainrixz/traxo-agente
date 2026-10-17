---
name: campana
description: Arma una campaña de anuncios (brief, copy, creativos y borrador en pausa) para Meta, Google o TikTok a partir de un producto real de la tienda, con costo de créditos antes de generar. Úsala si dicen "arma la campaña", "hazme los anuncios", "genera las imágenes del anuncio" o "lanza una campaña".
---

# Campaña de anuncios (borrador y en pausa)

**Reglas duras**
- Una campaña **nace en pausa**; activarla es de la persona, en la plataforma. Google Ads no admite nacer pausada: se crea, **se pausa en el mismo turno** y se comprueba el estado que devolvió la pausa; si no se confirma, se avisa en rojo con el id.
- **Higgsfield gasta créditos**: genera solo si lo pidieron en este turno, di antes **qué** y **cuánto cuesta** y espera el sí. **Una sola generación por petición.**
- Crear o editar algo en una cuenta real necesita un sí explícito en este turno.
- Sin datos de rendimiento no estimes ventas ni ROAS: `N/A`.
- Los videos y fotos del usuario (rostros incluidos) son suyos: no los publiques ni los uses fuera de su cuenta de anuncios sin que lo pida.

## Flujo
1. **Producto y datos**: `listar_productos` (ventas, margen: N/A si falta el costo) y `segmentar_clientes`. Pide de una vez lo que falte: objetivo, presupuesto diario, ciudades.
1b. **Biblioteca de creativos** (antes de generar nada): `listar_biblioteca`. Si el usuario ya tiene videos UGC y fotos de producto, **úsalos**: no cuestan créditos y sirven de referencia de estilo, personas y ambiente para cualquier generación. Si no tiene, sugiérele subirlos en Marketing → Biblioteca.
2. **Propuesta base**: `sugerir_campana` (copy dentro de los límites de la plataforma, público, prompts de creativos, costo estimado en créditos, `utm_campaign`).
3. **Afínalo con las herramientas de marketing que tengas** (opcional, y siempre sin salirte de los límites de caracteres):
   - estrategia y mensajes: agente `claude-ads:creative-strategist`;
   - copy final: agente `claude-ads:copy-writer` (valida los caracteres);
   - creativos: el conector de Higgsfield (p. ej. `higgsfield-estudio:producto` o `ugc`). **Cotiza primero** (balance y costo) y pide confirmación. Usa lo de la biblioteca como referencia. Lo que se genere, vuelve a la biblioteca con `agregar_a_biblioteca` (enlace https del resultado).
4. **Borrador**: `crear_borrador_campana` (valida límites y queda como borrador local; guarda el `utmCampaign`, que luego permite saber qué pedidos trajo).
5. **Crearla en la plataforma (solo con sí explícito)**:
   - **Meta**: con el conector de Meta Ads (`ads_create_campaign`, `ads_create_ad_set`, `ads_create_creative`, `ads_create_ad`), siempre con estado **PAUSED**; lee el estado con `ads_get_ad_entities`.
   - **Google**: API de Google Ads (el MCP oficial es de solo lectura): crear → pausar en el mismo turno → verificar.
   - **TikTok**: queda como borrador exportable (`exportar_borrador`) salvo que haya conector verificado.
   Después, `registrar_campana_creada` con `pausa_verificada: true` **solo si verificaste la pausa**; si no, avisa que hay que pausarla a mano.
6. **Audiencias**: `crear_audiencia` (solo clientes con consentimiento). Subirla a Meta es otro sí: teléfonos cifrados con SHA-256, nunca en claro.
7. Cierra con qué quedó listo, qué falta aprobar y dónde.

Después de que corra, `reporte_atribucion` dice qué pedidos trajo.
