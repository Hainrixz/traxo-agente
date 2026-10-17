---
name: clientes
description: Seguimiento comercial de clientes por WhatsApp: segmentos (recompra, nuevos, inactivos), audiencias para anuncios, mensajes con consentimiento, baja y datos personales (Ley 1581). Úsala si dicen "escríbeles a mis clientes", "recupera ventas", "quién no ha vuelto", "borra a este cliente" o "audiencia para Meta".
---

# Seguimiento de clientes

**Consentimiento primero (Ley 1581).** Solo se le escribe a quien lo dio y no pidió la baja. «BAJA» lo saca de inmediato y para siempre de las campañas.

1. `segmentar_clientes` (con `segmento`) para elegir a quién. Di cuántos quedan **fuera** por no tener consentimiento.
2. Redacta el mensaje: corto, de tú, una sola invitación, sin urgencias falsas; se le añade «responde BAJA».
3. `mensaje_a_segmento` **sin confirm** muestra a cuántos llegaría. Enséñale a la persona el texto y el número y espera el sí.
4. Con el sí, `mensaje_a_segmento` con `confirm: true`. (Fuera de la ventana de 24 h WhatsApp real exige plantillas aprobadas: avisa si la conexión es real.)
5. Audiencias para anuncios: `crear_audiencia`. Subirlas a Meta se hace aparte (`/traxo:campana`), con teléfonos cifrados.
6. Respuestas: `listar_conversaciones`. Lo que no entiendas, a la persona; no inventes respuestas.
7. Datos personales: `exportar_datos_cliente` (derecho de acceso) y `borrar_datos_cliente` (**no se puede deshacer**: pide confirm). Los pedidos quedan sin datos personales.

Si WhatsApp está simulado (sin `ZERNIO_API_KEY`), dilo: nada salió de verdad.
