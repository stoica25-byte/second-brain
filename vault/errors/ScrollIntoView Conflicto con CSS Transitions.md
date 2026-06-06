---
category: errors
created: 2026-06-03
status: resolved
summary: 'Error: scrollIntoView Calcula Mal la Posición Durante CSS Transitions Error
  Details Al hacer clic en una conexión o nodo...'
tags:
- type/error
- tech/css
- tech/javascript
- tag/scroll
- tag/transitions
- tag/grid-layout
- tag/debug
title: 'Error: scrollIntoView Calcula Mal la Posición Durante CSS Transitions'
updated: 2026-06-03
---

# Error: scrollIntoView Calcula Mal la Posición Durante CSS Transitions

## Error Details
Al hacer clic en una conexión o nodo del grafo para navegar a una nota en la cronología, el scroll se detenía a mitad de la nota o al final, en vez de alinear el título al principio del viewport.

## Causa Raíz
La tarjeta de la cronología usa una animación CSS de expansión con `grid-template-rows`:

```css
.timeline-card-collapsible {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.timeline-card.expanded .timeline-card-collapsible {
    grid-template-rows: 1fr;
}
```

Cuando se llama a `scrollIntoView()` **durante** esa transición de 300ms, el navegador calcula la posición de destino con las alturas **intermedias** (la tarjeta aún se está expandiendo). Resultado: el scroll termina en una posición incorrecta porque la altura final de la tarjeta es mayor que la que tenía cuando se calculó el scroll.

## Síntomas
- Click en conexión → scroll va al **medio** de la nota
- A veces va al **final** de la nota
- El comportamiento es inconsistente (depende de la longitud del contenido y la velocidad de renderizado)

## Solución
### 1. Desactivar transiciones temporalmente
Agregar clase `no-transitions` al contenedor antes de expandir:

```css
.timeline-stream.no-transitions .timeline-card,
.timeline-stream.no-transitions .timeline-card-collapsible {
    transition: none !important;
    transform: none !important;
}
```

```javascript
timelineStream.classList.add("no-transitions");
activeCard.classList.add("selected", "expanded");
// Forzar reflow para que el navegador aplique las alturas finales
activeCard.offsetHeight;
```

### 2. Calcular scroll manualmente en vez de scrollIntoView
`scrollIntoView` a veces desplaza el contenedor equivocado (`body` en vez del panel). Calcular offset relativo al contenedor real:

```javascript
const relativeTop = activeCard.getBoundingClientRect().top 
    - timelineStream.getBoundingClientRect().top 
    + timelineStream.scrollTop;
const targetScroll = Math.max(0, relativeTop - 10);
timelineStream.scrollTo({ top: targetScroll, behavior: "smooth" });
```

### 3. Restaurar transiciones después
```javascript
setTimeout(() => {
    timelineStream.classList.remove("no-transitions");
}, 350);
```

## Lección Clave
> **Nunca llamar a `scrollIntoView` o calcular posiciones de scroll mientras hay transiciones CSS activas que afecten las dimensiones del elemento.** Desactivar las transiciones, forzar un reflow con `.offsetHeight`, calcular, y luego restaurar.

---
*Notas Relacionadas:*
- [[CSS Hidden Class Sin Efecto]]
- [[JavaScript Event Listener Patterns]]