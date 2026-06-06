---
category: skills
created: '2026-06-03'
status: active
summary: Detalle técnico de la implementación del radar de conexiones local (Ego-Graph)
  utilizando D3.js para visualizar el contexto de una nota.
tags:
- type/skill
- tech/d3js
- tag/ego-graph
- tech/javascript
- tag/visualizacion
- tag/frontend
title: Connection Radar - Implementación
updated: '2026-06-03'
---

# Connection Radar - Implementación

El **Connection Radar** (o Ego-Graph) es un componente de visualización interactivo e inmediato diseñado en el panel derecho de la consola web. A diferencia del Mapa Global, el Radar se enfoca exclusivamente en las relaciones directas e indirectas de la **nota activa**.

## Arquitectura del Ego-Graph (1-2 Hops)

El Radar limita la visualización a una profundidad de **1 a 2 niveles de separación (hops)** respecto al nodo central:
1. **Nodo Central:** La nota activa abierta en el inspector.
2. **Primer Nivel (1-Hop):** Notas directamente enlazadas desde o hacia el nodo central.
3. **Segundo Nivel (2-Hop):** Notas conectadas a los vecinos del primer nivel (se cargan de forma dinámica si el vecindario no excede el límite de 12 nodos, para evitar sobrecarga visual).

## Implementación Técnica con D3.js

El grafo local se renderiza en un elemento SVG `#ego-graph-canvas`. Cada vez que se cambia de nota, el radar ejecuta los siguientes pasos:
1. **Limpieza y Filtrado:** Limpia el canvas y filtra `graphData.links` y `graphData.nodes` para aislar solo los elementos conectados en el vecindario del nodo seleccionado.
2. **Detección de Enlaces:** El helper `getLinkId` evalúa dinámicamente si los enlaces referencian rutas relativas o IDs.
3. **Física del Grafo:** Inicia una simulación de fuerzas D3 (`d3.forceSimulation`) ligera y rápida con valores de atracción ajustados al espacio reducido (180px de alto).

## Enlaces e Integraciones
- Se alimenta de los backlinks construidos en [[Second Brain Console - Arquitectura]]
- Utiliza la misma biblioteca descrita en [[D3js Force Graph Implementacion]]

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[D3JS MOC]]
- **Notas Afines**: [[Error: Event Listeners Duplicados en D3 Graph]], [[D3.js Force Graph - Implementación de Mapa de Conocimiento]]