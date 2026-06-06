---
category: errors
created: 2026-06-03
status: resolved
summary: 'Error: Browser Cache Impide Cargar JS Actualizado Error Details Después
  de actualizar con correcciones críticas, el usua...'
tags:
- type/error
- tag/type/error
- tag/tag/type/error
- tag/tag/tag/cache
- tech/javascript
- tag/tag/tag/browser
- tag/tag/tag/debug
- tag/tag/tag/deployment
title: 'Error: Browser Cache Impide Cargar JS Actualizado'
updated: 2026-06-03
---

# Error: Browser Cache Impide Cargar JS Actualizado

## Error Details
Después de actualizar `app.js` con correcciones críticas, el usuario reporta que "sigue sin funcionar". El navegador sigue ejecutando la versión anterior del script porque lo tiene cacheado.

## Causa Raíz
Los navegadores (especialmente Chrome/Edge) cachean agresivamente archivos estáticos servidos por servidores de desarrollo como Uvicorn. Aunque el archivo en disco ha cambiado, el navegador usa la copia local sin hacer una nueva petición al servidor.

Incluso `Ctrl + R` (recarga normal) puede no ser suficiente — el navegador a veces valida el cache con un `304 Not Modified` si las cabeceras `ETag` o `Last-Modified` coinciden.

## Síntomas
- Se hacen cambios en `app.js` → se reinicia el servidor
- El usuario recarga la página → **ejecuta el código viejo**
- Los console.log o comportamientos nuevos **no aparecen**
- El desarrollador cree que el bug persiste cuando en realidad ya está corregido

## Solución

### Cache-Buster con Query String
Añadir un parámetro de versión al `<script src>` en `index.html`:

```html
<!-- Antes (cacheado) -->
<script src="app.js"></script>

<!-- Después (fuerza recarga) -->
<script src="app.js?v=15"></script>
```

Cada vez que se haga un cambio importante en `app.js`, incrementar el número de versión (`v=14` → `v=15` → `v=16`...).

### Recarga Forzada del Usuario
Instruir al usuario a usar **`Ctrl + F5`** (Hard Reload) que ignora completamente el cache del navegador.

### Alternativa: Cabeceras No-Cache en Desarrollo
En FastAPI/Uvicorn, se pueden agregar cabeceras para deshabilitar cache en desarrollo:

```python
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.endswith(('.js', '.css')):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response
```

## Lección Clave
> **Siempre usar cache-busting (`?v=N`) en archivos JS/CSS servidos estáticamente.** No asumir que el navegador recargará automáticamente archivos actualizados. Al depurar, lo primero que hay que descartar es que el navegador esté ejecutando código antiguo.

---
*Notas Relacionadas:*
- [[FastAPI Endpoints - Patrones]]