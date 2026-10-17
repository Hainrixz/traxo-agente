---
name: constructor
description: Diseña la tienda e-commerce de la persona (tema de Shopify u otra plataforma) con su catálogo real, la refina con herramientas de diseño, la sube a GitHub privado y a Shopify sin publicar. Úsala cuando pida "diseña mi tienda", "crea el tema", "constructor" o "page builder".
---

# Constructor de tienda

Reglas: nunca publiques el tema en la tienda (solo sin publicar); GitHub siempre privado; no inventes reseñas, cifras ni promesas; las llaves nunca pasan por el chat.

1. **Contexto.** Llama `traxo_estado` y `listar_disenos`. Si no hay tienda conectada, sigue con el nombre y productos que haya y dilo.
2. **Brief.** Pregunta solo lo que falta: estilo (calido, limpio, audaz, premium), tono, plataforma, WhatsApp y si ofrece contraentrega.
3. **Base.** `disenar_tienda` crea el borrador (visible en Traxo → Constructor). Luego `exportar_tema` (primero sin `confirm` para ver el borrador, después con `confirm: true`) a una carpeta nueva.
4. **Refinar (si están instaladas).** Usa `ui-ux-pro-max` para el sistema de diseño, `emil-design-eng` para el movimiento y los detalles, y el webkit/builder de diseño que tenga la persona. Si no están, el tema generado ya es completo y accesible. Reglas fijas: contraste 4,5:1, objetivos de 44 px, `prefers-reduced-motion`, solo `transform`/`opacity`.
5. **Revisar.** Corre `shopify theme check` si existe la CLI; si no, la revisión de `exportar_tema` ya valida JSON, secciones y etiquetas.
6. **GitHub.** Con `gh`: `git init`, commit y `gh repo create <nombre> --private --source . --push`. Anota con `actualizar_diseno` (`en-github`, enlace).
7. **Shopify.** Con CLI y sesión de la persona: `shopify theme push --unpublished`. Sin CLI: dile que comprima la carpeta y la suba en Tienda online → Temas → Subir zip. Anota `subido`.
8. **Cierre.** Explica cómo previsualizar y que publicarlo es decisión suya. Para otras plataformas solo hay sitio estático y diseño en JSON: dilo.
