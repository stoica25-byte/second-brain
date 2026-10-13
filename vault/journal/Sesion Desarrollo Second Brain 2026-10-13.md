---
title: "Sesión Desarrollo Second Brain 2026-10-13"
category: "journal"
status: "active"
tags:
  - "project/script-alcampo"
  - "tech/selenium"
  - "tech/colab"
  - "tech/firebase"
  - "type/journal"
summary: "Adaptación del scraper Alcampo para ejecución serverless puntual en Google Colab con cola dinámica Firebase, canario IP y persistencia en Google Drive."
created: "2026-10-13"
updated: "2026-10-13"
---

# Sesión Desarrollo Second Brain 2026-10-13

- **Adaptación a Google Colab (plan gratuito)**: Creados `colab/alcampo_colab.ipynb` y `colab/alcampo_colab.py` estructurados en 7 celdas idempotentes (instalación Chrome/ChromeDriver sincronizados, configuración con modos nueva/continuar, lectura de secretos enmascarada, validación estricta de 512 cuentas, canario de IP pública, ejecución multihilo con 2 hilos óptimos y guardarraíl de 11h, persistencia directa en Drive cada 10 cuentas y resumen con reporte a Telegram). Ver [[Ejecucion Serverless de Selenium en Google Colab con Cola Firebase]] y [[Optimizacion Anti-Ban y Cola Dinamica en Selenium GitHub Actions]].
- **Aislamiento de GitHub Actions y Hardening de Chrome**: Eliminado el disparador programado (`schedule`) de `.github/workflows/alcampo_2pass_matrix.yml` para evitar concurrencia con la cola de Colab, añadido bloqueo de fuentes web en opciones de Chrome (`profile.managed_default_content_settings.fonts: 2`) y generalizada la limpieza de procesos huérfanos (`cleanup_orphan_chrome`) para entornos Linux.
