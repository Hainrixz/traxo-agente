---
name: pedidos
description: Ver pedidos, cotizar el envío, confirmar contraentregas de riesgo, generar o cancelar la guía y resolver lo que el agente dejó esperando aprobación. Úsala si dicen "qué pedidos hay", "envía este pedido", "cotiza", "genera la guía", "cancela la guía" o "qué tengo pendiente".
---

# Pedidos y guías

La guía **gasta saldo de envío**: nunca la generes sin un sí explícito en este turno.

## Flujo
1. `listar_aprobaciones` primero: lo pendiente va antes que lo nuevo (dirección incompleta, guía sobre el tope, cliente que no confirmó en 24 h, devolución, respuesta que no entendió).
2. `listar_pedidos` y `ver_pedido <#número>` para el detalle.
3. Para enviar: `cotizar_envio` (ranking y explicación en COP; no gasta nada) → si la persona dice sí, `crear_guia` con `confirm: true`. Dile la guía, la transportadora y si es **simulada**.
4. **Contraentrega de riesgo**: con `configurar_confirmacion` (`risky` o `all`) el agente le escribe al cliente por WhatsApp antes de generar la guía: confirma, paga ahora con descuento, cambia la dirección o cancela. Si no responde en 24 h te lo pasa a ti: aprobar lo envía igual, rechazar lo cancela.
5. Guías: `programar_recogida` (solo recién creadas) y `cancelar_guia` (solo si aún no fue recogida), ambas con confirmación.
6. `resolver_aprobacion` (`aprobar` pide `confirm`) y `corregir_direccion` con vía y número y la ciudad.
7. Ordena por dinero en juego: primero lo que se pierde hoy (novedades, recaudo por cobrar), después lo nuevo.

## Cómo hablar
Primera persona del agente al reportar («Generé la guía…»), montos `$ 125.000`, teléfonos `+57 300 123 4567`. Una dirección sin vía y número no se cotiza: pide la corrección.
