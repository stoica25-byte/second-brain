---
category: errors
created: 2026-06-04
status: resolved
summary: 'Error: Python List Type Annotation NameError Detalles del Error Síntoma:
  Al ejecutar o importar un script de Python, fal...'
tags:
- type/error
- tag/type/error
- tag/tag/type/error
- tech/python
- tag/tag/tag/typing
- tag/tag/tag/type-annotations
- tag/tag/tag/import
title: 'Error: Python List Type Annotation NameError'
updated: 2026-06-04
---

# Error: Python List Type Annotation NameError

## Detalles del Error
- **Síntoma**: Al ejecutar o importar un script de Python, falla inmediatamente con: `NameError: name 'List' is not defined`.
- **Causa**: Ocurre cuando se utilizan anotaciones de tipo genéricas como `List[dict]` o `List[str]` en firmas de funciones, pero no se ha importado el tipo `List` desde el módulo de soporte de tipado estándar `typing`.

## Código con Error
```python
# ❌ BUG: Produce NameError porque List no está importado ni definido
from typing import AsyncGenerator, Any

def get_semantic_links(api_key: str, proposal: str, notes_list: List[dict]) -> List[str]:
    pass
```

## Solución Aplicada
Importar explícitamente `List` (junto con otros genéricos como `Dict`, `Tuple`, etc.) del módulo `typing` de Python:

```python
# ✅ CORRECTO: Funciona correctamente al incluir el import de List
from typing import AsyncGenerator, Any, List

def get_semantic_links(api_key: str, proposal: str, notes_list: List[dict]) -> List[str]:
    pass
```

> [!NOTE]
> En Python 3.9 y versiones posteriores, se pueden usar los tipos estándar en minúscula directamente para anotaciones de tipo (ej: `list[dict]` o `dict[str, str]`) sin necesidad de importar desde `typing`. Sin embargo, para mantener compatibilidad con versiones anteriores de Python o entornos heredados, importar desde `typing` sigue siendo la práctica recomendada si se usan genéricos capitalizados.

## Prevención y Aprendizajes
- Validar siempre los scripts ejecutando pruebas de importación rápidas (`python -c "import modulo"`) después de añadir anotaciones de tipos.
- Configurar linters y herramientas de análisis estático (como `mypy`, `flake8` o `pylint`) en el entorno de desarrollo para atrapar automáticamente problemas de tipado y nombres ausentes.