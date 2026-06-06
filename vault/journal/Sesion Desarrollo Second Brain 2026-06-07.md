---
title: "Sesión de Desarrollo - Second Brain 2026-06-07"
category: journal
status: active
tags:
  - journal
  - desarrollo
  - second-brain
  - bugs
  - deadlocks
created: 2026-06-07
updated: 2026-06-07
---
# Sesión de Desarrollo - Second Brain 2026-06-07

## Resumen de la Sesión
Resolución de un bug crítico de **deadlock** que provocaba la congelación del enlazado semántico (`⚡ OPTIMIZANDO...`) y bloqueaba todo el backend del Second Brain.

## Bugs Resueltos Hoy

### 🔴 Deadlock por Bloqueo de Lock en optimize_links_endpoint
- **Causa**:
  1. Ausencia de parámetro `timeout` en las llamadas TCP a las APIs de IA (Gemini/OpenRouter) dentro de `debate_engine.py`.
  2. Uso global de `async with write_lock:` envolviendo todo el endpoint `/api/notes/optimize-links` en `main.py`, manteniendo el lock ocupado durante los consumos externos de red bloqueados.
- **Fix**:
  1. Se agregó `timeout=15` a todas las peticiones `urllib.request.urlopen` en `debate_engine.py`.
  2. Se refactorizó la lógica en `main.py` para acotar `write_lock` únicamente a las transacciones atómicas de lectura/escritura de archivos markdown y de reconstrucción de índices.
- **Evidencia**: [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duracion]]

## Lo Que Funciona Ahora
- **Enlazado semántico en lote**: Funciona con fluidez y escribe en los archivos correspondientes en ~18 segundos para un lote de 2 notas.
- **Seguridad ante fallos de red**: Si la API de IA sufre un microcorte, la petición expira tras 15 segundos liberando todos los recursos sin bloquear el servidor.

## Notas Creadas Hoy
- [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duracion]]

## Conectado a
- [[Welcome Hub]]
- [[Deadlock por Bloqueo de Lock en Llamada API de Larga Duracion]]
- [[Sesion Desarrollo Second Brain 2026-06-06]]
