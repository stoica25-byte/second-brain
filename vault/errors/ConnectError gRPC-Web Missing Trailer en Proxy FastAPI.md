---
title: "ConnectError gRPC-Web Missing Trailer en Proxy FastAPI"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "tech/grpc"
  - "type/error"
summary: "Error de 'missing trailer' en clientes gRPC-Web por el buffering del stream proxy (requests iter_content con chunk_size) y la falta de cabeceras de trailers en CORS."
created: "2026-06-10"
updated: "2026-06-10"
---

# ConnectError gRPC-Web Missing Trailer en Proxy FastAPI

## El Error

Los clientes gRPC-Web o Connect-RPC lanzan de forma repetida el siguiente error en la consola de herramientas de desarrollo de Chrome:
```
stream error: ConnectError: [unknown] missing trailer
    at qA (main.js?v=1781101474:4400:408)
```
Esto provoca que las subscripciones a streams (ej. `AppStateStream`, `ProjectUpdatesStream`) se desconecten constantemente y reintenten la conexión cada segundo, impidiendo que el cliente reciba actualizaciones en tiempo real y saturando el log de la consola.

## Causas

1. **Buffering del Proxy Síncrono (`requests.iter_content`)**:
   El proxy utilizaba la librería síncrona `requests.request(..., stream=True)` y leía la respuesta con un tamaño de chunk fijo de 4096 bytes (`res.iter_content(chunk_size=4096)`). Dado que los eventos gRPC-Web son pequeños (10–100 bytes) y se envían de forma esporádica, se quedaban atrapados en el buffer de la librería. Al expirar el timeout de lectura, la conexión se cerraba abruptamente sin enviar la estructura de cierre/trailer de gRPC, provocando el error en el cliente.
   
2. **Ausencia de Cabeceras CORS Expuestas**:
   Aunque el servidor gRPC retorne los metadatos de status en las cabeceras/trailers HTTP, las políticas del navegador bloquean el acceso a cabeceras no estándar (como `grpc-status`, `grpc-message` y `grpc-status-details-bin`) si no están explícitamente listadas en la cabecera `Access-Control-Expose-Headers`.

## Solución

1. **Streaming Asíncrono sin Buffering (`httpx`)**:
   Refactorizar el proxy para que sea asíncrono y use `httpx.AsyncClient(timeout=None)`. Al consumir el stream con `res.aiter_bytes()`, los chunks se transmiten al cliente de manera inmediata según llegan al socket, evitando retardos o bloqueos por buffer.

2. **Exposición de Trailers gRPC**:
   Agregar explícitamente la cabecera `Access-Control-Expose-Headers` en la respuesta del proxy para permitir que el cliente Javascript de gRPC-Web lea el resultado final del stream:
   ```python
   res_headers["Access-Control-Expose-Headers"] = "grpc-status, grpc-message, grpc-status-details-bin"
   ```

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-10]]
- **Patrones Relacionados**: [[Proxy de Streaming SSE Asincrono con Keep-Alive]]
