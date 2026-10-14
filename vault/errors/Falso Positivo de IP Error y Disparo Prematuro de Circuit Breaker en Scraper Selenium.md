---
title: "Falso Positivo de IP Error y Disparo Prematuro de Circuit Breaker en Scraper Selenium"
category: "errors"
status: "resolved"
tags:
  - "project/script-alcampo"
  - "tech/selenium"
  - "tech/python"
  - "tech/colab"
  - "type/error"
summary: "Cuentas sin redirección post-login en Salesforce eran clasificadas como ip_error en lugar de account_error, acumulando fallos y disparando el Circuit Breaker innecesariamente."
created: "2026-10-14"
updated: "2026-10-14"
---

# Falso Positivo de IP Error y Disparo Prematuro de Circuit Breaker en Scraper Selenium

Enlace al diario: [[Sesion Desarrollo Second Brain 2026-10-14]]

## Causa Raiz
Al autenticar cuentas en el portal de Salesforce de Alcampo (`ar-customerdiamond-es.my.site.com`), si las credenciales fallaban de forma no modal o la cuenta quedaba estancada en la pantalla de autorización sin completar el flujo OAuth hacia `compraonline.alcampo.es`, el temporizador de sondeo de 22 segundos expiraba y el scraper etiquetaba el resultado por defecto como `Error: Bloqueo/Timeout`.
El método `CircuitBreaker.classify_error` detectaba la subcadena `bloqueo/timeout` y lo catalogaba erróneamente como `ip_error` (error de IP/servidor/bloqueo de red), activando reintentos inmediatos en cola. Al fallar apenas dos cuentas consecutivas con 2 reintentos cada una (4 fallos en total), se alcanzaba el umbral estricto `max_consecutive_failures=4`, provocando que el interruptor de seguridad detuviera el scraper por completo pese a que la IP de la máquina tenía acceso limpio y 141 cuentas previas estaban 100% validadas.

## Solucion
1. **Diferenciación estricta de dominios de error**: Si el navegador finaliza el sondeo de login y la URL actual continúa en Salesforce (`my.site.com`, `authorization` o `login`), clasificar el resultado como `account_error` (`Error: Credenciales no redirigidas o no válidas`) o `needs_attention` (para 2FA / reseteo), reservando `ip_error` exclusivamente para respuestas HTTP 403/429/5xx, firmas explícitas de Cloudflare/WAF o fallos de conexión DNS/red antes de cargar el formulario.
2. **Elevación de umbrales del Circuit Breaker**: Ajustar `max_consecutive_failures=8` y `min_processed_threshold=10` en `CircuitBreaker` para evitar detenciones intempestivas ante variaciones puntuales en cuentas individuales.
3. **Reseteo de estado al iniciar sesión y auto-actualización**: En Google Colab, ejecutar `importlib.reload(engine)` y resetear `circuit_breaker.triggered = False` al iniciar la celda de ejecución, además de incorporar `git pull` automático para garantizar la ejecución del código más reciente.
