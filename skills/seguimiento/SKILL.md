---
name: seguimiento
description: Tracking de guías y novedades: ver dónde va un paquete, qué hizo el agente, marcar una novedad y escribirle al cliente por WhatsApp. Úsala si dicen "dónde va el pedido", "hay novedades", "avísale al cliente" o "qué pasó con la guía".
---
<!-- Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors · tododeia.com · id er-ff6aa75d -->

# Seguimiento y novedades

Una **novedad** es cualquier cosa que impide la entrega (cliente ausente, dirección errada, rechazo).

1. `ver_actividad` para lo que hizo el agente; `rastrear_guia <guía>` para el estado y los eventos.
2. Novedades abiertas: lista las guías en `incident`. El agente ya le escribió al cliente; revisa `listar_conversaciones` para ver qué respondió.
3. Si el cliente dio otra dirección, el agente la dejó en aprobación (`listar_aprobaciones`, tipo `new_address`). Apruébala solo con un sí de la persona.
4. `marcar_novedad` registra una novedad a mano y hace que el agente contacte al cliente: **escribe a una persona**, así que va con borrador y `confirm`.
5. `enviar_whatsapp` para un mensaje libre: muestra el texto y espera el sí. Solo a clientes con consentimiento; tono corto, de tú, sin presión.
6. Si el mensaje del cliente no es claro, el agente lo escala. No inventes una respuesta por él.

Si WhatsApp está en modo simulado (sin `ZERNIO_API_KEY`), dilo: nada salió de verdad.
