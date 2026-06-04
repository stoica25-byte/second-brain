---
title: "SPA Router Not Found behind Subpath Proxy"
category: errors
status: resolved
tags:
  - react-router
  - proxy
  - location-faking
  - wmi
  - javascript
created: 2026-06-04
updated: 2026-06-04
---

# SPA Router Not Found behind Subpath Proxy

## Detalles del Error
- **Síntoma**: Al servir una SPA (Single Page Application) basada en React Router o enrutador similar detrás de un subpath de proxy (ej. `/api/antigravity/proxy/`), la aplicación se carga pero muestra una pantalla de "Not Found" propia del router de la SPA.
- **Causa**: El enrutador de la SPA lee `window.location.pathname`, que devuelve la URL del navegador `/api/antigravity/proxy/`. Al no tener esta ruta definida en la configuración de la SPA, el router renderiza el componente "Not Found" por defecto.
- **Limitación**: Intentar sobreescribir `window.location` o `window.location.pathname` directamente en la instancia de `window.location` falla en la mayoría de navegadores modernos porque son de solo lectura y no configurables.

## Solución Aplicada
Implementar una solución de doble capa para garantizar el correcto enmascaramiento de la ruta:

1. **Parche en Prototipo (`Location.prototype.pathname`)**:
   Modificar las propiedades en el prototipo del objeto `Location` (obtenido mediante `Object.getPrototypeOf(window.location)`), usando el método `toString` nativo para parsear la URL completa sin caer en recursión de getters:

```javascript
(function() {
    var prefix = '/api/antigravity/proxy';
    try {
        var proto = Object.getPrototypeOf(window.location) || window.Location.prototype;
        var originalToString = proto.toString;
        
        Object.defineProperty(proto, 'pathname', {
            get: function() {
                var fullUrl = originalToString.call(this);
                var urlObj = new URL(fullUrl);
                var val = urlObj.pathname;
                if (val.indexOf(prefix) === 0) {
                    var subPath = val.substring(prefix.length);
                    return subPath === '' ? '/' : subPath;
                }
                return val;
            },
            configurable: true
        });
        
        // Registrar window.__fakePathname para interceptaciones léxicas
        Object.defineProperty(window, '__fakePathname', {
            get: function() {
                var val = window.location.pathname;
                return val; // Invocará al getter del prototipo modificado
            },
            configurable: true
        });
    } catch(e) {
        console.error('Failed to patch Location.prototype.pathname:', e);
    }
})();
```

2. **Reemplazo Léxico Seguro en el JS Bundle (`main.js`)**:
   Reemplazar dinámicamente referencias directas a `window.location.pathname` y `location.pathname` por la propiedad global enmascarada `window.__fakePathname` al vuelo en el proxy de FastAPI.

   > [!WARNING]
   > Usar `.replace("location.pathname", ...)` reemplaza de forma destructiva las referencias a objetos internos de routers como `b.location.pathname` o `c.location.pathname` convirtiéndolas en `b.window.__fakePathname`, lo que resulta en un error: `TypeError: Cannot read properties of undefined (reading '__fakePathname')`.

   Para solucionarlo, se deben usar expresiones regulares con lookbehind negativo para reemplazar únicamente cuando se trate de la variable global (no precedida por un punto ni caracteres alfanuméricos):

```python
# Rewrite location.pathname/window.location.pathname references safely using regex lookbehinds
js_content = re.sub(r'(?<![a-zA-Z0-9_])window\.location\.pathname', 'window.__fakePathname', js_content)
js_content = re.sub(r'(?<![a-zA-Z0-9_\.])location\.pathname', 'window.__fakePathname', js_content)
```

## Prevención y Aprendizajes
- **Uso de Regex con Lookbehinds para Variables Globales**: Al interceptar variables de entorno o globales del navegador en un bundle ofuscado (como `location` o `window`), no utilices reemplazos simples de cadenas. Usa expresiones regulares `(?<![a-zA-Z0-9_\.])` para asegurarte de no alterar propiedades de objetos locales homónimos.
- **Uso de Target Global Resiliente**: Al inyectar getters en contextos que podrían compartirse con Web Workers o similares, expón la propiedad en el objeto global correspondiente (`window`, `self`, o `globalThis`) de manera dinámica.
- **Parche de Location y History API**: Fakar el prototipo de `Location` junto con las funciones `pushState`/`replaceState` es el estándar de oro para dar soporte a SPAs con enrutado por subrutas en proxies inversos.
