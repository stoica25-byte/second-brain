---
title: "Sesión Desarrollo Second Brain 2026-10-14"
category: "journal"
status: "active"
tags:
  - "project/script-alcampo"
  - "tech/selenium"
  - "tech/colab"
  - "tech/firebase"
  - "type/journal"
summary: "Resolución de falso positivo de IP error en login de Salesforce, ampliación de umbrales en CircuitBreaker y auto-sincronización git pull en Colab."
created: "2026-10-14"
updated: "2026-10-14"
---

# Sesión Desarrollo Second Brain 2026-10-14

- **Corrección de Clasificación de Errores y Circuit Breaker**: Resuelto falso positivo donde cuentas no redirigidas por Salesforce tras login eran tratadas como `ip_error`, acumulando 4 fallos con reintentos y disparando el interruptor; ahora se catalogan como `account_error` (`Error: Credenciales no redirigidas o no válidas`), el umbral se eleva a 8 fallos consecutivos y solo errores comprobados de Cloudflare/403/429 activan cuarentena. Ver [[Falso Positivo de IP Error y Disparo Prematuro de Circuit Breaker en Scraper Selenium]].
- **Hardening de Ejecución en Colab y Carga de Progreso**: Implementado `git pull` automático y recarga dinámica de módulos (`importlib.reload`) en la Celda 3 y 5 de `alcampo_colab.ipynb` para garantizar código fresco sin reiniciar entorno, junto con importación transparente de resultados existentes desde Firebase `/results.json` para persistir las 141 cuentas previamente completadas.
