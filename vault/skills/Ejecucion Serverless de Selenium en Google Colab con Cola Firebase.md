---
title: "Ejecución Serverless de Selenium en Google Colab con Cola Firebase"
category: "skills"
status: "draft"
tags:
  - "project/script-alcampo"
  - "tech/selenium"
  - "tech/colab"
  - "tech/firebase"
  - "type/pattern"
summary: "Patrón de ejecución serverless interactiva en Google Colab gratuito (2 vCPUs, 2 hilos) con auto-recuperación de cola dinámica en Firebase y persistencia en Google Drive."
created: "2026-10-13"
updated: "2026-10-13"
---

# Ejecución Serverless de Selenium en Google Colab con Cola Firebase

Documentado durante la [[Sesion Desarrollo Second Brain 2026-10-13]] y derivado de [[Optimizacion Anti-Ban y Cola Dinamica en Selenium GitHub Actions]] y [[Bloqueo de Submit por ENTER en Salesforce Visualforce Auth]].

## 1. Contexto y Objetivos de Arquitectura
La ejecución masiva de 512 cuentas en GitHub Actions consume minutos mensuales de CI y está sujeta a límites estrictos de concurrencia. La adaptación a Google Colab permite ejecutar el scraping de forma puntual, manual y 100% gratuita sin gastar hardware local ni minutos de Actions.
- **Entorno Free Tier**: Google Colab proporciona instancias de 2 vCPUs y ~12.7 GB de RAM en contenedores Ubuntu.
- **Sincronización de Versiones**: En Linux/Colab es mandatorio asegurar la paridad de versión mayor entre Google Chrome (`google-chrome-stable` vía `.deb`) y `chromedriver` mediante Selenium Manager o WebDriverManager para evitar fallos de inicialización.

## 2. Reutilización de Lógica y Anti-Ban en Datacenter
- **Canario de IP Pública**: Las IPs de centros de datos de Google Colab varían por sesión y pueden ser catalogadas por Cloudflare/WAF. El canario realiza una petición GET de bajo impacto a `/login`; si detecta HTTP 403, 429 o reto Cloudflare, la ejecución aborta antes de tocar la cola o consumir cuentas, indicando renovar la máquina mediante "Desconectar y eliminar entorno de ejecución".
- **Reutilización de WebDriver con Limpieza CDP**: 2 hilos paralelos (1 por vCPU) reutilizan una única sesión de Chrome aplicando `page_load_strategy = "eager"`, bloqueo de imágenes y fuentes web (`profile.managed_default_content_settings.fonts: 2`), y limpieza cross-domain vía CDP (`Network.clearBrowserCookies`, `localStorage.clear()`).
- **Autenticación Visualforce**: Envío del formulario mediante clic directo JS sobre `#btnSubmit_login` y redirección inmediata OAuth hacia `/settings/loyalty`.
- **Ritmo Adaptativo y Circuit Breaker**: Distingue fallos transitorios de red/IP (`ip_error`) de fallos irreversibles (`account_error` y `needs_attention`), aplicando backoff con jitter y cuarentena preventiva.

## 3. Cola Dinámica Firebase y Reanudación Bidireccional
- **Worker `COLAB_1`**: Asignación atómica de leases (75 s) con auto-recuperación de cuentas obsoletas (*work-stealing*).
- **Modo "nueva"**: Realiza una copia de seguridad timestamped de `/queue`, `/results` y `/progress` guardada directamente en Google Drive antes de purgar e inicializar la cola con las 512 cuentas.
- **Modo "continuar"**: Recupera cuentas en estado `in_progress` o leases caducados y las restablece a `pending`, respetando estrictamente las cuentas ya finalizadas con éxito en `/results`.
- **Guardarraíl Temporal (~11 h)**: Finalización limpia antes del corte de runtime de Colab (~12 h), liberando cuentas activas a la cola y persistiendo el Excel (`alcampo_saldos_final.xlsx`) y `results.json` en Google Drive.
