---
category: errors
created: 2026-06-04
status: resolved
summary: JS Proxy Illegal Invocation y Pérdida de Prototipos de Constructores Detalles
  del Error Al virtualizar o enmascarar obje...
tags:
- type/error
- tech/javascript
- tag/proxy
- tag/illegal-invocation
- tag/prototypes
- tag/location-faking
title: JS Proxy Illegal Invocation y Pérdida de Prototipos de Constructores
updated: 2026-06-04
---

# JS Proxy Illegal Invocation y Pérdida de Prototipos de Constructores

## Detalles del Error
Al virtualizar o enmascarar objetos globales del navegador (`window`, `location`, `document`) mediante `new Proxy(...)` para dar soporte a subrutas detrás de un proxy inverso, se introdujeron dos fallos críticos en la SPA:

1. **TypeError: Illegal invocation**:
   - **Causa**: Ocurre al evaluar propiedades nativas (como `location.search` o getters de URL) usando `Reflect.get(target, prop, receiver)`. Pasar el argumento `receiver` (que referencia al Proxy) hace que el navegador intente ejecutar el getter sobre el Proxy en lugar del objeto nativo, lanzando una excepción de invocación ilegal.
   - **Solución**: Omitir el argumento `receiver` en `Reflect.get` y `Reflect.set` cuando se trata de proxies de objetos del sistema (host objects).

2. **TypeError: Cannot read properties of undefined (reading 'toString') en TypeError.prototype**:
   - **Causa**: En el proxy de `window`, se interceptaban todas las funciones y se les aplicaba `.bind(target)` (`value.bind(window)`) para evitar errores de invocación ilegal al llamar métodos globales (como `fetch` o `setTimeout`). Sin embargo, los constructores y clases nativos (como `TypeError`, `Object`, `Map`, `Promise`, etc.) también son de tipo `'function'`. Al aplicar `.bind()`, JavaScript genera una función ligada que carece de la propiedad `.prototype` (es `undefined`), lo que rompe la herencia de clases de las librerías cargadas en el bundle de la SPA.
   - **Solución**: Filtrar los constructores y clases nativos. Las funciones nativas que requieren enlace de contexto (como `fetch`, `setTimeout`, etc.) no tienen propiedad `prototype` (es `undefined`), mientras que los constructores y clases sí. Evaluando `typeof value === 'function' && !value.prototype` logramos enlazar únicamente los métodos y mantener los prototipos de los constructores intactos.

## Patrón de Proxy Robusto para Window/Location

```javascript
// Proxy de Location
window.__fakeLocation = new Proxy(window.location, {
    get: function(target, prop) {
        if (prop === 'pathname') {
            // Lógica de enmascaramiento
            return '/';
        }
        var value = Reflect.get(target, prop);
        if (typeof value === 'function' && !value.prototype) {
            return value.bind(target);
        }
        return value;
    },
    set: function(target, prop, value) {
        return Reflect.set(target, prop, value);
    }
});

// Proxy de Window
window.__fakeWindow = new Proxy(window, {
    get: function(target, prop) {
        if (prop === 'location') {
            return window.__fakeLocation;
        }
        if (prop === 'window' || prop === 'globalThis' || prop === 'self') {
            return window.__fakeWindow;
        }
        var value = Reflect.get(target, prop);
        if (typeof value === 'function' && !value.prototype) {
            return value.bind(target);
        }
        return value;
    },
    set: function(target, prop, value) {
        return Reflect.set(target, prop, value);
    }
});
```

## Prevención
- **No pases `receiver` en proxies de Host Objects**: Evita pasar el tercer argumento a `Reflect.get`/`Reflect.set` si estás interceptando objetos nativos del navegador.
- **Valida `.prototype` antes de enlazar contextualmente**: No apliques `.bind()` a funciones que actúen como constructores o clases, ya que destruirá su propiedad `prototype`.

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Error: Browser Cache Impide Cargar JS Actualizado]], [[Discrepancia en IDs de Checkboxes de Personalización del HUD]]