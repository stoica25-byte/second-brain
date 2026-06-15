---
title: " iOS Safari Input Zoom Prevention\
category: \skills\
status: \resolved\
tags:
 - \project/antigravity\
 - \tech/css\
 - \type/pattern\
summary: \Patron para prevenir el zoom automatico no deseado de iOS Safari al enfocar inputs en moviles.\
created: \2026-06-16\
updated: \2026-06-16\
---

# iOS Safari Input Zoom Prevention

## Causa Raiz
En dispositivos moviles (especialmente iOS Safari), el navegador aplica un zoom automatico molesto en cualquier campo de texto (input, extarea, select, [contenteditable]) cuando recibe el foco y se despliega el teclado virtual, si el tamaño de fuente (ont-size) es inferior a 16px. Esto suele descolocar los layouts y distorsionar los iconos de la interfaz.

## Solucion y Patron
Para evitar este comportamiento sin deshabilitar por completo el pellizco de zoom necesario para accesibilidad, se deben seguir dos pasos combinados:

### 1. Forzar un tamaño de fuente de 16px en pantallas moviles (CSS)
Añadir una media query que aplique una fuente de al menos 16px a todos los elementos interactivos de entrada en resoluciones moviles:

`css
@media screen and (max-width: 768px) {
 input, select, textarea, [contenteditable] {
 font-size: 16px !important;
 }
}
``n
### 2. Meta viewport en HTML
Asegurar que el meta viewport del documento host limite el factor de escala inicial:

`html
<meta name=\viewport\ content=\width=device-width initial-scale=1.0 maximum-scale=1.0 user-scalable=no\>
``n
### 3. Touch Action (Opcional)
Para evitar el zoom por doble toque, forzar el uso del comportamiento estandar de paneo y pellizco:

`css
* {
 touch-action: manipulation;
}
`