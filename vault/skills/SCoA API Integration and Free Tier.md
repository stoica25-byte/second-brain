---
category: skills
created: '2026-06-03'
status: active
summary: Detalle técnico de cómo el motor de debates SCoA realiza llamadas gratuitas
  a Gemini y OpenRouter con búsqueda en Google.
tags:
- type/skill
- project/scoa
- tag/api
- tag/gemini
- tag/openrouter
- tag/tutorial
title: 'SCoA: Integración de API y Capa Gratuita'
updated: '2026-06-03'
---

# SCoA: Integración de API y Capa Gratuita

Esta guía técnica complementa el [[Agent Debate Protocol]] y explica los mecanismos que permiten al motor del **Tribunal Supremo de Agentes (SCoA)** realizar deliberaciones complejas y búsquedas web en tiempo real sin incurrir en costes de facturación.

---

## 1. Google AI Studio (Gemini API)

El motor principal utiliza la API de Gemini a través de claves de desarrollador estándar obtenidas en **Google AI Studio** (`ai.google.dev`).

### Capa Gratuita (Free Tier)
Google ofrece acceso gratuito para pruebas y desarrollo bajo las siguientes condiciones:
* **Sin método de pago obligatorio**: No requiere asociar una tarjeta de crédito o cuenta bancaria para generar la API Key básica.
* **Cuotas Generosas**: Para el modelo rápido por defecto (`gemini-2.0-flash`), la cuota gratuita permite hasta:
  * **15 Peticiones por Minuto (RPM)**.
  * **1,500 Peticiones por Día (RPD)**.
* **Uso de Datos**: En la capa gratuita, Google puede utilizar los prompts de manera anonimizada para mejorar sus modelos. Si se requiere máxima privacidad empresarial, se puede activar la facturación (Pay-as-you-go), donde el coste es por millón de tokens consumidos y los datos no se utilizan para entrenamiento.

---

## 2. Google Search Grounding (Búsqueda en Internet)

Durante la **Fase 3: Analistas**, el motor activa la búsqueda en internet en tiempo real para contrastar benchmarks y documentación.

### Cómo Funciona técnicamente
En `backend/debate_engine.py`, cuando la fase es `analistas`, inyectamos la herramienta de búsqueda en el payload enviado a la API de Gemini:
```json
{
  "contents": [{"parts": [{"text": "...user prompt..."}]}],
  "systemInstruction": {"parts": [{"text": "...system instruction..."}]},
  "generationConfig": {"temperature": 0.2},
  "tools": [{"google_search": {}}]
}
```
* **Cero Coste en Desarrollo**: Google incluye la herramienta `google_search` dentro de la cuota gratuita del desarrollador. El modelo decide autónomamente qué buscar en Google, lee los resultados en caliente, redacta el análisis en español y provee citas/enlaces reales a internet.

---

## 3. Cadena de Respaldo (Fallback Chain)

Para evitar bloqueos por límites de cuota (errores `HTTP 429: Resource Exhausted`), implementamos un sistema de reintentos secuenciales en el backend.

El motor recorre el array `MODEL_FALLBACK_CHAIN` en orden de prioridad:
1. `gemini-2.0-flash` (Modelo por defecto, el más rápido y moderno)
2. `gemini-2.0-flash-lite` (Versión optimizada y más ligera)
3. `gemini-1.5-flash-latest` (Versión estable previa)
4. `gemini-1.5-flash-8b` (Modelo ultraligero y de baja latencia)

Si una llamada a la API devuelve un código de error de cuota agotada, el motor atrapa el error y vuelve a intentar el mismo prompt con el siguiente modelo de la cadena de forma transparente para el usuario.

---

## 4. OpenRouter Free Tier

Si la variable `OPENROUTER_API_KEY` está configurada y no hay clave de Gemini disponible, el motor delega la deliberación a OpenRouter.

* **Modelos `openrouter/free`**: OpenRouter ofrece enrutamiento gratuito a modelos abiertos (como *Llama 3*, *Mistral*, *Gemma* o *Phi*) alojados por patrocinadores de la comunidad.
* **Límites**: Están sujetos a límites de velocidad globales y latencia variable, pero permiten ejecutar el motor SCoA de manera totalmente gratuita y en modo local/remoto sin depender de Google.

---

## Véase también
* [[Welcome Hub]]
* [[Agent Debate Protocol]]

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-03]]
- **MOC Temático**: [[SCoA MOC]]
- **Notas Afines**: [[SCoA: Diseño Visual e Interacciones]], [[SCoA: Diagnósticos y Telemetría HUD]]