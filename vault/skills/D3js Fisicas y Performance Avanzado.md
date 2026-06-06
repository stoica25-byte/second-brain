---
title: "D3JS Físicas y Performance Avanzado"
category: "skills"
status: "active"
tags:
  - "project/second-brain"
  - "tech/d3js"
  - "type/pattern"
summary: "Técnicas avanzadas de optimización física, colisiones orientadas a etiquetas de texto, encuadre matemático adaptativo y aceleración por GPU para grafos de D3.js."
created: "2026-06-07"
updated: "2026-06-07"
---

# D3JS Físicas y Performance Avanzado

## 💡 Concepto & Patrón
En grafos de red interactivos que crecen en densidad (ej. más de 60 nodos y 280 conexiones), las fuerzas físicas estándar de D3.js (`d3.forceSimulation`) provocan apelotonamiento y solapamiento de textos alrededor de los nodos principales (hubs/MOCs). Este patrón detalla las optimizaciones avanzadas para estabilizar y renderizar redes densas de manera fluida y legible:

### 1. Física de Enlace No Lineal
- **Distancia Adaptativa**: Aumentar la distancia de reposo a $160\text{px}$ cuando el enlace conecta con un nodo MOC para crear un "halo" despejado, y usar $70\text{px}$ de base.
- **Rigidez Decreciente**: La fuerza de tracción del enlace se calcula inversamente proporcional al grado de conexión del nodo para evitar que los hubs concentren y succionen la red:
  $$s(u,v) = \frac{1}{\min(deg(u), deg(v))^{0.8}}$$

### 2. Colisión Orientada a Textos
Para evitar el solapamiento de las etiquetas horizontales, se define un buffer o radio de colisión asimétrico según el rol visual del nodo:
- MOCs: $R_{\text{visual}} + 35\text{px}$
- Diarios: $R_{\text{visual}} + 22\text{px}$
- Notas normales: $R_{\text{visual}} + 14\text{px}$

### 3. Aceleración por GPU en Hover Focus
En lugar de animar opacidades en múltiples elementos SVG mediante transiciones D3 en JavaScript (que degrada la CPU), se definen clases CSS optimizadas utilizando aceleración por hardware (`will-change: opacity, transform`). La CPU solo inyecta/remueve la clase:
```css
.graph-node-group, line {
    transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: opacity, transform;
}
.graph-node-group.is-muted, line.is-muted {
    opacity: 0.12 !important;
}
```

### 4. Cold Start y Auto-Fit
- **Pre-calentamiento**: Ejecutar $120$ ticks síncronos en frío (`simulation.tick()`) antes de renderizar para estabilizar por completo las coordenadas e iniciar el grafo en reposo.
- **Bounding-Box Auto-Fit**: Calcular los extremos espaciales del grafo y posicionar la cámara del zoom dinámicamente con un $20\%$ de margen para centrar el mapa al cargar.

### 5. Opacidad y Enfriamiento Acelerado (Antilag)
- **Atenuación de Text Clutter por Rol**: Configurar en CSS la opacidad por defecto de los textos SVG: Notas ordinarias a `0.15`, Diarios a `0.6` y MOCs a `0.95`. Al hacer hover, elevar a `1.0` el texto del nodo activo y sus adyacentes (`.is-highlighted`), atenuando el resto a `0.02` (`.is-muted`).
- **Enfriamiento Físico Rápido**: Ajustar `.alphaDecay(0.08)` y `.velocityDecay(0.35)` para enfriar y pausar la simulación de D3 casi inmediatamente después de cualquier interacción (arrastre/zoom), liberando la CPU del ticker.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-07]]
- **MOC Temático**: [[D3JS MOC]]
- **Notas Afines**: [[D3js Force Graph Implementacion]], [[Force Directed Graph Parameter Tuning]]
