---
title: "Ajuste de Parámetros Físicos para Evitar el Apelotonamiento en Grafos 2D"
category: skills
status: active
tags:
  - javascript
  - physics-engine
  - graph
  - visualization
  - canvas
created: 2026-06-04
updated: 2026-06-04
---

# Ajuste de Parámetros Físicos para Evitar el Apelotonamiento en Grafos 2D

## Resumen
Al diseñar motores de simulación de grafos basados en fuerzas físicas en 2D (Fuerzas de Repulsión de Coulomb y Atracción de Resorte de Hooke), es común encontrarse con el problema de "apelotonamiento" (clumping). Esto ocurre cuando los nodos se agrupan firmemente en el centro del lienzo, volviendo la visualización ilegible. Ajustar el balance y la escala de las fuerzas resuelve este comportamiento.

## Síntoma de Desequilibrio Físico
El agrupamiento denso en el centro se produce cuando:
1. La fuerza repulsiva decae demasiado rápido (ej: proporcionalmente a $1/d^2$) y tiene un coeficiente muy bajo en distancias medias.
2. La fuerza atractiva (tensión de resorte) y la gravedad central vencen por completo a la repulsión.

### Ejemplo de Configuración Desequilibrada
```javascript
const force = 180.0 / (dist * dist); // Decae a casi 0 a 60px
const restLength = 100.0;
const springConstant = 0.035;       // Tensión demasiado rígida
const gravity = 0.008;              // Gravedad central excesiva
```

## Patrón de Equilibrio Espaciado
Para conseguir un diseño de grafo flotante, abierto y legible (similar al motor de Obsidian), se aplican las siguientes correcciones en el bucle de simulación:

1. **Multiplicar el Coeficiente de Repulsión**: Aumentar la constante repulsiva para empujar con fuerza a distancias cortas y medias.
2. **Suavizar la Tensión del Resorte**: Reducir el coeficiente de rigidez para permitir que la repulsión actúe libremente.
3. **Disminuir la Gravedad**: Reducir la atracción hacia el origen para expandir el lienzo.

### Configuración Equilibrada y Expandida
```javascript
// 1. Repulsión (Coulomb) incrementada (~33 veces más fuerte en el numerador)
const force = 6000.0 / (dist * dist); 
n1.vx -= (dx / dist) * force;
n1.vy -= (dy / dist) * force;

// 2. Atracción de Resorte (Hooke) más suave y larga
const restLength = 140.0;           // Distancia natural mayor
const springConstant = 0.015;       // Constante de resorte blanda

// 3. Gravedad Central suave
const gravity = 0.003;
node.vx -= (node.x / dist) * gravity * dist;
```

## Resultados
- Los nodos se distribuyen de forma orgánica manteniendo una distancia de equilibrio estable de entre 120 y 160 píxeles.
- Se previene el solapamiento visual de textos y conexiones.
- Mejora drásticamente la legibilidad tanto en pantallas grandes como en dispositivos móviles.
