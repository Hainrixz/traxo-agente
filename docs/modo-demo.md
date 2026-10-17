# Modo demo (opcional)

El **modo demo** arranca Traxo con una tienda de ejemplo («Café de Origen») y 90 días de operación simulada para que veas el panel lleno sin conectar nada. Es para probar y para presentaciones: **no lo uses con datos reales**.

```bash
TRAXO_DEMO=1 pnpm start      # http://localhost:8787
```

En modo demo: el registro está abierto, hay una cuenta de ejemplo (`admin@traxo.demo` / `traxo-demo`), un recorrido guiado, y todo es simulado (ningún WhatsApp ni guía sale de verdad). Una instalación normal **nunca** trae datos de ejemplo: arranca con tu tienda vacía y el registro cerrado.

## Biblioteca de creativos con tu propio material
Deja tus imágenes y videos en `demo-media/` con un `catalogo.json`:

```json
{ "archivos": [
  { "archivo": "imagenes/producto.jpg", "tipo": "imagen", "titulo": "Producto · fondo blanco",
    "rol": "producto", "producto": "Mi producto", "fuente": "subido" }
] }
```

`rol` = `ugc` | `producto` | `lifestyle` | `referencia`; `fuente` = `higgsfield` | `subido` | `generado`. Luego:

```bash
pnpm demo:media                                  # contra http://localhost:8787
pnpm demo:media https://tu-app.up.railway.app    # o contra tu servidor
```

Es idempotente (repetirlo no duplica), no llama a Higgsfield ni gasta créditos, y `demo-media/` está en `.gitignore`: no subas material de terceros al repositorio. En la demo la conexión con Higgsfield es **simulada** y se rotula así. En Railway monta un volumen en `/data` y define `TRAXO_MEDIA_DIR=/data/media` para que los archivos sobrevivan a los redeploys.

## Páginas construidas (Constructor)
La sección «Páginas construidas» muestra páginas ya hechas, con captura, herramientas, enlace y vista previa (con respaldo a la captura si el sitio no permite iframe). Solo la cuenta de ejemplo ve las de referencia; una cuenta nueva la ve vacía. Para sumar otra: deja sus capturas en `apps/dashboard/public/paginas/` y agrega un objeto a `BUILT_PAGES` en `apps/worker/src/built-pages.ts`.
