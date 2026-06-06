---
category: errors
created: 2026-06-03
status: resolved
summary: 'Error: FastAPI StaticFiles Directorio No Encontrado Detalles del Error Síntoma:
  Al iniciar o importar la aplicación Fast...'
tags:
- type/error
- tech/fastapi
- tech/python
- tag/deployment
- tag/path
title: 'Error: FastAPI StaticFiles Directorio No Encontrado'
updated: 2026-06-03
---

# Error: FastAPI StaticFiles Directorio No Encontrado

## Detalles del Error
- **Síntoma**: Al iniciar o importar la aplicación FastAPI, el servidor se cae con el error: `RuntimeError: Directory 'frontend' does not exist`.
- **Causa**: Ocurre al utilizar una ruta relativa para el directorio de archivos estáticos en `StaticFiles(directory="frontend")` y ejecutar el comando del servidor (como `uvicorn`) desde un directorio de trabajo (CWD) diferente a donde se encuentra el archivo `main.py` de la aplicación.

## Código con Error
```python
# ❌ BUG: Si se ejecuta uvicorn fuera de la carpeta del backend, fallará
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
```

## Solución Aplicada
Usar la ruta absoluta construida dinámicamente basándose en la variable especial de Python `__file__`, la cual almacena la ubicación del módulo actual:

```python
# ✅ CORRECTO: Funciona sin importar el directorio de trabajo (CWD)
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Si 'frontend' está al mismo nivel que la carpeta 'backend' donde está main.py
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
```

## Prevención y Aprendizajes
- **Nunca asumir el directorio de trabajo actual (CWD)** en scripts que se desplegarán, ya que el proceso padre puede invocarlos desde cualquier lugar de la terminal.
- Construir siempre las rutas de recursos estáticos, bases de datos SQLite locales u otros archivos estáticos utilizando el prefijo absoluto dinámico de `__file__`.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[FastAPI MOC]]
- **Notas Afines**: [[Conexiones de Red Subestimadas en Estadísticas]], [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duración]]