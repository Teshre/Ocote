# Assets del README

Esta carpeta contiene las imágenes que usa el README.

## Archivos actuales
- `ocote-icon.png` — ícono maestro (1024px, encuadre macOS)
- `ocote-icon-200.png` — ícono para el header del README (200px)

## Pendiente: GIF de demo

El README tiene un placeholder para un GIF de demostración (la línea comentada
`<!-- <img src="docs/assets/demo.gif" ...> -->` cerca del encabezado).

### Cómo grabarlo
1. Abre Ocote en un tamaño de ventana cómodo (no maximizado — un GIF muy ancho pesa mucho).
2. Graba una secuencia corta (~8-12 s) que muestre lo que hace único a Ocote:
   - Escribir un comando y ver el **autocompletado contextual**.
   - Ejecutar un comando reconocido → aparece el **tooltip educativo**.
   - Cambiar de **tema** o de **preset de prompt** en Settings.
   - Navegar con el **explorador** y ver la sincronización.
3. Herramientas de captura recomendadas en macOS:
   - **Kap** (gratis, exporta GIF/MP4 optimizado) — https://getkap.co
   - **Gifox** o **CleanShot X** (de pago).
4. Optimiza el peso: idealmente **< 5 MB**. Si pesa más, baja FPS a 15 o reduce el ancho.
5. Guarda el archivo como `docs/assets/demo.gif`.
6. En `README.md` y `README.es.md`, descomenta la línea del `<img>` y borra el `<!-- TODO -->`.

### Sugerencia
GitHub también acepta `.mp4`/`.webm` arrastrándolos directamente al editar el README
en la web (los sube a su CDN). Un MP4 se ve mejor y pesa menos que un GIF, pero un GIF
se reproduce automáticamente sin clic. Para un README, el GIF autoreproducible suele ganar.
