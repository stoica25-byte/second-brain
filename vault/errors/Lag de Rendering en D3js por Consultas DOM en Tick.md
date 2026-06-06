---
title: "Lag de Rendering en D3js por Consultas DOM en Tick"
category: "errors"
status: "resolved"
tags:
  - "project/second-brain"
  - "tech/d3js"
  - "type/error"
summary: "Resolución del lag masivo en el grafo interactivo causado por realizar consultas querySelector/d3.select a cientos de elementos del DOM dentro de la función tick de la simulación de D3."
created: "2026-06-07"
updated: "2026-06-07"
---

# Lag de Rendering en D3js por Consultas DOM en Tick

## ❌ Descripción del Bug
El mapa global interactivo presentaba un **lag severo** (tasa de refresco extremadamente baja) al arrastrar o interactuar con el grafo de notas. Este retardo se incrementaba drásticamente a medida que la red crecía en número de aristas (281 conexiones activas).

## 🔍 Causa Raíz
Dentro del callback de animación de D3.js (`simulation.on("tick", ...)`), el cual se ejecuta aproximadamente 60 veces por segundo, se había implementado un bucle iterativo sobre todos los enlaces (`link.each`):
```javascript
// CÓDIGO CON BUG (Se ejecutaba en cada frame por cada link)
link.each(function(d) {
    d3.select(`#grad-${d.source.category}-${d.target.category}`)
        .attr("x1", d.source.x)
        .attr("y1", d.source.y)
        .attr("x2", d.target.x)
        .attr("y2", d.target.y);
});
```
Esto causaba:
1. **Lecturas/Escrituras repetitivas al DOM**: Con 281 enlaces, el navegador realizaba 281 búsquedas `d3.select` y modificaciones de atributos por cada frame del tick.
2. **Repaint redundante**: Modificar repetidamente las coordenadas absolutas (`userSpaceOnUse`) de los mismos 10 o 15 gradientes comunes del SVG forzaba a la GPU a reconstruir las texturas de relleno en cada frame.

## 🛠️ Solución Aplicada
1. **Gradientes en objectBoundingBox**: Modificamos los `<linearGradient>` en [app.js](file:///c:/Users/Estudiante/Downloads/seond-brain/frontend/app.js) para usar la escala nativa del objeto (`x1="0%", y1="0%", x2="100%", y2="0%"`). Esto alinea el gradiente a lo largo del link de forma nativa en la GPU sin intervención del código JavaScript.
2. **Eliminación del Ticker DOM**: Removemos completamente el bucle `.each` del callback de `tick`, reduciendo las operaciones de JS por frame al mínimo absoluto (actualizar solo las coordenadas $x_1, y_1, x_2, y_2$ de las líneas del SVG).
3. **Física Ajustada**: Redujimos las iteraciones de la fuerza de colisión de `2` a `1` para descargar al motor de física de D3.

Tras la corrección, la renderización y las transiciones del grafo se ejecutan a **60fps** estables y fluidos.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-07]]
- **MOC Temático**: [[D3JS MOC]]
- **Notas Afines**: [[D3js Fisicas y Performance Avanzado]], [[Error: Event Listeners Duplicados en D3 Graph]]
