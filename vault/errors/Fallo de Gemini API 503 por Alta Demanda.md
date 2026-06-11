---
title: "Fallo de Gemini API 503 por Alta Demanda"
category: "errors"
status: "resolved"
tags:
  - "project/antigravity"
  - "tech/fastapi"
  - "type/error"
  - "tag/api"
  - "tag/gemini"
  - "tag/retry"
summary: "Fallo 503 en la API de Gemini debido a picos de demanda del servidor de Google y su mitigación mediante reintentos."
created: "2026-06-11"
updated: "2026-06-11"
---

# Fallo de Gemini API 503 por Alta Demanda

## 🔴 El Problema
Al enviar un vídeo desde Telegram para su procesamiento, la ingesta asíncrona fallaba al comunicarse con la API de Gemini (modelo `gemini-2.5-flash`), resultando en el siguiente mensaje de error en los logs:
```text
Exception: Fallo en la llamada a la API de Gemini: {
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}
```

## 🔍 Causa Raíz
La API de Gemini en su capa gratuita o en periodos de alto tráfico puede experimentar saturación temporal, devolviendo un estado HTTP `503 Service Unavailable`. En la versión inicial, la llamada carecía de tolerancia a fallos, por lo que cualquier error HTTP abortaba la tarea de ingesta inmediatamente sin opción de recuperarse.

## 🚀 Solución Aplicada
Se implementó un bucle de reintentos asíncrono con **backoff exponencial** en la función `process_video_task` de [main.py](file:///c:/Users/Estudiante/Downloads/seond-brain/backend/main.py):
1. El cliente realiza hasta 5 intentos.
2. Si recibe códigos temporales como `503`, `429`, `500`, `502`, o `504`, notifica al usuario del estado del reintento por Telegram y espera de manera asíncrona (`asyncio.sleep`) duplicando el tiempo de espera en cada paso (`2s`, `4s`, `8s`, `16s`, `32s`).
3. Si la llamada es exitosa, sale del bucle. Si tras los 5 intentos sigue fallando, eleva una excepción definitiva.

## 💡 Lecciones Aprendidas
- Las llamadas a APIs externas de IA son inherentemente inestables en carga. Toda integración crítica debe incluir políticas de reintento automático (retry policies) y backoff para no comprometer la experiencia del usuario.
- Enviar notificaciones proactivas de progreso/espera en interfaces asíncronas como bots de chat reduce la fricción percibida.

---

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-11]]
- **MOC Temático**: [[FastAPI MOC]]
- **Notas Afines**: [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duracion]], [[SCoA API Integration and Free Tier]]
