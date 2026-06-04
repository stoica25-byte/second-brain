---
title: "Evitar Solapamiento de Teclado y Barras de Navegación en Iframes Móviles"
category: skills
status: active
tags:
  - css
  - mobile
  - responsiveness
  - safe-area
  - iframe
created: 2026-06-04
updated: 2026-06-04
---

# Evitar Solapamiento de Teclado y Barras de Navegación en Iframes Móviles

## Resumen
Al incrustar aplicaciones interactivas complejas (como editores de código Monaco o chats de agentes) dentro de un `iframe` en un dashboard móvil, los elementos del fondo de la aplicación incrustada (cajas de texto, botones de envío) suelen quedar ocultos bajo el teclado virtual o la barra de navegación del navegador (Safari/Chrome en iOS). Reducir la altura porcentual del iframe crea un colchón de seguridad fiable.

## El Problema del 100% de Altura
Usar `height: 100%` en un iframe móvil asume el contenedor completo, pero no tiene en cuenta:
1. El home indicator de iOS.
2. El teclado virtual activo que desplaza el scroll.
3. La barra de navegación inferior fija del dashboard principal.

Dado que la aplicación externa corre en su propio documento, el usuario no puede hacer scroll hacia abajo en el documento principal para empujar la caja de entrada hacia arriba.

## Patrón de Colchón Seguro
En lugar de añadir relleno (`padding`) al contenedor externo del iframe (lo que no siempre escala la altura del iframe interno de forma uniforme), se debe redefinir la altura del propio `iframe` en las directivas `@media` móviles:

```css
@media (max-width: 768px) {
  /* Panel contenedor */
  #panel-contenedor-ide {
    padding: 0 !important;
    padding-bottom: 0 !important; /* Limpiar paddings */
    height: 100% !important;
  }

  /* El iframe se reduce para crear un espacio libre inferior y evitar el teclado y nav bar */
  #panel-contenedor-ide iframe {
    height: calc(100% - 90px) !important;
  }
}
```

## Beneficios
1. **Pulsación Cómoda**: La entrada de texto ("Ask anything...", chat) del editor incrustado queda exactamente `50px` por encima de la barra de navegación del móvil, evitando pulsaciones accidentales en los botones del dashboard.
2. **Previene el Teclado Bloqueante**: Al abrirse el teclado, el navegador redistribuye el espacio de ese `50px` de colchón y deja el input de texto en la zona de enfoque activa sin ocultarse.
