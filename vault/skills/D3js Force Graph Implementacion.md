---
category: skills
created: 2026-06-03
status: active
summary: D3.js Force Graph Implementación de Mapa de Conocimiento Qué Es D3.js ()
  permite crear grafos de nodos y enlaces con fís...
tags:
- type/skill
- tech/d3js
- tech/javascript
- tag/grafos
- tag/visualizacion
- tag/frontend
title: D3.js Force Graph - Implementación de Mapa de Conocimiento
updated: 2026-06-03
---

# D3.js Force Graph - Implementación de Mapa de Conocimiento

## Qué Es
D3.js (`d3.forceSimulation`) permite crear grafos de nodos y enlaces con física simulada. Los nodos se repelen entre sí y los enlaces actúan como resortes, resultando en un layout orgánico y legible.

## Implementación Base

```javascript
function initGlobalGraph() {
    const canvasEl = document.getElementById("graph-canvas");
    const width = canvasEl.clientWidth || 600;
    const height = canvasEl.clientHeight || 400;

    // SVG contenedor con viewBox para responsividad
    const svg = d3.select(canvasEl)
        .append("svg")
        .attr("width", "100%")
        .attr("height", height)
        .attr("viewBox", `0 0 ${width} ${height}`);

    // Grupo principal para zoom/pan
    const g = svg.append("g");
    
    // Zoom y pan
    svg.call(d3.zoom()
        .scaleExtent([0.1, 8])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // Simulación de fuerzas
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.path).distance(80))
        .force("charge", d3.forceManyBody().strength(-120))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(20));

    // Renderizado con tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x}, ${d.y})`);
    });
}
```

## Dos Tipos de Grafo en el Proyecto

### 1. Global Graph (Mapa Global)
- Todos los nodos del vault con zoom/pan
- Filtros por categoría
- Lazy-initialized al primer click del tab
- Inicialización: `initGlobalGraph()`

### 2. Connection Radar (Ego-Graph Local)
- Solo el vecindario local de la nota activa (1-2 hops)
- Máximo 15 nodos para no saturar
- Se re-renderiza cada vez que se abre una nota
- Inicialización: `drawConnectionRadar(notePath)`

## Patrón Crítico: ID de Nodos

D3's `forceLink` resuelve los links usando el campo `.id()` configurado. Después de la simulación, `link.source` y `link.target` pasan de ser strings a ser **objetos nodo**.

```javascript
// Siempre extraer el ID de forma defensiva:
const getLinkId = (node) => {
    if (!node) return null;
    if (typeof node === 'object') return node.path || node.id || null;
    return node; // ya es string
};
```

## Drag & Drop

```javascript
node.call(d3.drag()
    .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
    })
    .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null; // liberar nodo
    })
);
```

## Gotchas Importantes
- D3 **muta** los objetos de nodos y links pasados a la simulación (añade x, y, vx, vy). Siempre pasar **copias** (`{...node}`) para no corromper `graphData`
- `canvasEl.clientWidth` puede ser 0 si el elemento está oculto → usar fallback
- Los filtros de categoría deben registrarse con `{ once: false }` y guard `data-listenerBound`

## 🔗 Conexiones
- [[Event Listeners Duplicados D3 Graph]]
- [[Connection Radar - Implementación]]
- [[Second Brain Console - Arquitectura]]