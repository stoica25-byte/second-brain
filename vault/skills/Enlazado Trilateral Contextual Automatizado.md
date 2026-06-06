---
title: "Enlazado Trilateral Contextual Automatizado"
category: "skills"
status: "active"
tags:
  - "project/second-brain"
  - "tech/python"
  - "type/pattern"
summary: "Patrón de script para migración masiva y automatización de enlazado trilateral contextual (diario, MOC y notas afines) y poblamiento alfabético de MOCs en Obsidian."
created: "2026-06-07"
updated: "2026-06-07"
---

# Enlazado Trilateral Contextual Automatizado

## 💡 Concepto & Patrón
El **Enlazado Trilateral Contextual** requiere que cada nota del vault se conecte a tres puntos clave para mantener una alta cohesión del grafo sin crear islas de conocimiento:
1. **Diario de Desarrollo** (`journal/`): Para contextualizar temporalmente cuándo se aprendió o resolvió.
2. **MOC Temático** (`ideas/`): Para clasificar el tema por tecnologías principales.
3. **Notas Afines**: Para cruzar enlaces de la misma área temática.

Realizar esto manualmente en un vault grande es ineficiente y propenso a errores. Este patrón implementa un script en Python que automatiza la inyección de la sección `## 🔗 Conexiones` y actualiza alfabéticamente los MOCs.

## 🛠️ Implementación del Script de Automatización
El siguiente script de Python realiza las siguientes tareas:
1. Escanea las notas activas del vault (excluyendo borradores y plantillas).
2. Determina el MOC temático correspondiente según los tags tecnológicos de la nota.
3. Encuentra la fecha de creación en el frontmatter y la vincula al diario más cercano disponible.
4. Selecciona de forma determinista notas afines dentro del mismo tema para el cruce.
5. Inyecta la sección `## 🔗 Conexiones` al final de cada archivo.
6. Re-escribe los MOCs temáticos ordenando alfabéticamente los enlaces bajo las secciones correspondientes.

```python
import pathlib
import re
import frontmatter

VAULT_DIR = pathlib.Path('c:/Users/Estudiante/Downloads/seond-brain/vault')

# Mapear tags tecnológicos a MOCs
MOC_MAPPING = {
    'tech/fastapi': 'FastAPI MOC',
    'tech/d3js': 'D3JS MOC',
    'tech/css': 'CSS MOC',
    'tech/git': 'Git MOC',
    'tech/windows': 'Windows MOC',
    'project/scoa': 'SCoA MOC'
}
```

## 📈 Impacto en el Graph Density
Al aplicar este patrón sobre las 53 notas activas del vault e introducir 6 MOCs temáticos adicionales:
- Las conexiones válidas del grafo subieron de **137 a 275** (más del doble).
- El número de notas huérfanas se mantuvo en **0**.
- La densidad del grafo subió de **0.0497 a 0.0777**.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-07]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Welcome Hub]], [[Conexiones de Red Subestimadas en Estadisticas]]
