---
category: sources
created: '2026-06-11'
source_type: video
source_url: https://vm.tiktok.com/ZNRc8V8U4
status: unread
summary: Auditoría de caso de uso del video 'it's literally basically jarvis on your
  screen that can then use your...' por midirbot.
tags:
- project/antigravity
- type/video-audit
title: 'Auditoría: it''s literally basically jarvis on your screen that can then use
  your...'
updated: '2026-06-11'
---

Aquí está el reporte técnico solicitado:

---

## Reporte de Auditoría Técnica: 'Cliffy' (midirbot)

### 1. Transcripción Literal

00:00: Hey guys, look what I just found.
00:02: There's this new thing that just recently came out called Cliffy, and it lives in the top part of your actual computer screen.
00:08: And the craziest part is that if you want, you can give it permission to view your entire screen whenever you want.
00:13: Well, let's say I'm editing a video here and I don't understand what any of this stuff means here. Like what is color adjustment? What is studio sound? What does like all this stuff mean?
00:20: You can see this little green thing following me, right?
00:23: All I need to do to fix this is to do this.
00:24: Hey, I'm on my screen right now trying to edit this video. What in the world does any this stuff on the right mean? Like what is color adjustment and how do I use it correctly?
00:34: Let me look at what that right-side panel is showing and break it down. This color adjustments row takes the look of your video: brightness, warmth, and richness of color.
00:44: Neutral is a balanced natural look, a safe default to start from.
00:48: Warm pushes toward orange tones. Good for a...
00:50: It literally takes a screenshot in real time of your screen, researches whatever it is that you're doing, and then explains it to you. Then uses your screen to showcase exactly what it's talking about. It's amazing.
01:01: So, whatever it is that you're learning, if you have like a quick question during and you're like don't know how to figure something out, especially like I do with video editing. You just like ask Clicky and it'll just tell you what it is.

### 2. Semáforo de Utilidad

*   **Factibilidad Técnica:** ⭐⭐⭐⭐ (La capacidad de la IA para procesar información visual de la pantalla y responder contextualmente es una realidad emergente, pero la "omnipotencia" y fluidez mostradas son optimistas).
*   **Complejidad Oculta:** 🔴 (Alta - Implica captura de pantalla en tiempo real, OCR/visión robusta de UI arbitraria, comprensión contextual profunda, interacción vocal bidireccional, y superposiciones dinámicas, todo con baja latencia y alta precisión).
*   **Mantenibilidad:** 🔴 (Alta - La interfaz de usuario de las aplicaciones cambia constantemente, lo que requiere un reentrenamiento o adaptaciones continuas del modelo de visión. La comprensión de "lo que estás haciendo" es un problema de estado complejo y no solo visual).

### 3. Análisis Hype vs. Realidad

El video presenta una visión extremadamente optimista de un asistente de IA capaz de "ver" y "entender" cualquier cosa en la pantalla en tiempo real, investigar el contexto y luego "mostrar" interactivamente cómo usar los elementos de la UI.

**El Hype:**
*   "Literalmente, Jarvis en tu pantalla."
*   "Puede ver tu pantalla completa cuando quieras."
*   "Toma una captura de pantalla en tiempo real, investiga lo que sea que estés haciendo y te lo explica. Luego usa tu pantalla para mostrar exactamente de qué está hablando."
*   Implica una comprensión perfecta de la interfaz de usuario de cualquier aplicación y del contexto del usuario, con una latencia imperceptible para una interacción fluida.

**La Realidad Técnica:**
*   **Visión por Computadora y LLM-V:** Es cierto que los modelos de visión de lenguaje grande (LLM-V) como GPT-4V o Gemini son capaces de analizar imágenes (capturas de pantalla) y describir elementos de la UI, así como responder preguntas sobre ellas. Esta es la base de la funcionalidad mostrada.
*   **"Tiempo Real" y Latencia:** La promesa de "tiempo real" es el primer punto de fricción. Enviar una captura de pantalla a un LLM-V en la nube, procesarla y recibir una respuesta textual (que luego debe convertirse a voz y potencialmente generar una superposición visual) introduce una latencia que, aunque mejorando, rara vez es instantánea para interacciones complejas. Para una interacción fluida como la mostrada, se requeriría una infraestructura extremadamente rápida o un procesamiento local significativo y optimizado.
*   **Comprensión Contextual Profunda:** El modelo puede describir lo que ve, pero "investigar lo que sea que estés haciendo" implica un nivel de entendimiento del flujo de trabajo, la historia de la interacción del usuario y la intención que va más allá de una simple captura de pantalla. Esto requeriría una integración mucho más profunda con el sistema operativo y las aplicaciones, o una memoria conversacional muy robusta.
*   **"Usar tu pantalla para mostrar":** El video muestra un cursor verde resaltando elementos. Esto es más factible como una superposición visual o una guía, donde la IA identifica la región de interés y el software cliente dibuja un resaltado. No implica que la IA esté realmente controlando el cursor o interactuando programáticamente con la UI, lo cual es una complejidad de nivel superior (automatización robótica de procesos o control de UI programático) que no se demuestra.
*   **Generalización de UI:** Reconocer y explicar elementos de UI en un editor de video genérico es un desafío. Las UIs varían enormemente, y los modelos necesitan ser robustos para manejar esta diversidad sin entrenamiento específico para cada aplicación.

En resumen, la capacidad de describir y explicar elementos de UI basada en capturas de pantalla es real. La parte del "tiempo real", la comprensión profunda del contexto y la interactividad de "mostrar" son los puntos más exagerados y requerirían soluciones técnicas mucho más complejas de lo que sugiere una simple integración de IA.

### 4. Puntos Críticos de Falla

1.  **Latencia de Procesamiento de Visión y Generación de Lenguaje:** La función principal depende de enviar una captura de pantalla (potencialmente pesada) a un modelo de IA en la nube, esperar el procesamiento de visión para identificar y contextualizar los elementos, y luego obtener una respuesta de texto generada por el LLM. Este ciclo de ida y vuelta a la API introduce una latencia inherente. Para una experiencia "en tiempo real" donde la IA responde a preguntas complejas de la UI al instante, esta latencia se convertirá en un cuello de botella frustrante, especialmente durante momentos de alta demanda de la API o con modelos más grandes y precisos.
2.  **Robustez y Ambigüedad del Reconocimiento de UI y Semántica:** Aunque los modelos de visión son potentes, tienen dificultades para interpretar el *significado funcional* de elementos de UI en aplicaciones arbitrarias o con diseños no estándar. Si el modelo no ha sido entrenado específicamente en un editor de video o una aplicación en particular, podría malinterpretar botones, sliders o paneles. Los cambios menores en la UI de una aplicación (como una actualización de software) podrían "romper" la capacidad del modelo para identificar correctamente los elementos o su propósito, lo que llevaría a explicaciones incorrectas o inútiles.
3.  **Gestión de Contexto y Alcance del "Research":** La afirmación de que la IA "investiga lo que sea que estés haciendo" y "lo explica" es muy amplia. La IA tiene una visión limitada a la captura de pantalla actual. No tiene acceso inherente al historial de acciones del usuario, a los archivos abiertos en otras pestañas o ventanas, o a la intención general del usuario sin una integración profunda con el sistema operativo y un contexto conversacional persistente. Si el usuario hace una pregunta que requiere información fuera de la captura de pantalla inmediata, la IA no podrá "investigar" ni responder adecuadamente, limitando gravemente su utilidad en flujos de trabajo complejos.

### 5. Estructura de Costes Ocultos

La ejecución de este tipo de aplicación implica varios costes recurrentes, principalmente el acceso a APIs de modelos de lenguaje grande (LLM) y visión (LLM-V):

*   **API de Visión por Computadora (e.g., GPT-4V, Gemini Vision):** El coste más significativo. Cada vez que el usuario hace una pregunta basada en la pantalla, se envía una captura de pantalla (una imagen, que puede ser grande) y un prompt de texto a la API. El procesamiento de imágenes en LLM-V es más costoso que el texto puro.
    *   **Estimación:** Una captura de pantalla de 1080p podría equivaler a ~$0.005 a $0.02 por llamada para un modelo como GPT-4V (dependiendo de la resolución y tokens del prompt). Si un usuario realiza 50 interacciones visuales al día, esto sería $0.25 - $1.00 por día.
    *   **Coste Mensual por Usuario (API LLM-V): $7.50 - $30.00** (conservador, puede ser mucho más alto con uso intensivo o resoluciones 4K).
*   **API de Procesamiento de Lenguaje Natural (LLM):** Para generar respuestas, explicaciones y gestionar la conversación. Aunque más baratas que la visión, también suman.
    *   **Estimación:** $0.001 - $0.01 por respuesta (entrada y salida de tokens). 50 interacciones al día serían $0.05 - $0.50 por día.
    *   **Coste Mensual por Usuario (API LLM): $1.50 - $15.00.**
*   **API de Voz a Texto (STT) y Texto a Voz (TTS):** Si la interacción es completamente por voz, se necesitan estas APIs.
    *   **Estimación:** El coste suele ser por segundo de audio procesado. Para 50 interacciones de 15 segundos cada una, serían unos 12.5 minutos de audio/voz al día. $0.006/minuto para STT y $0.015/1000 caracteres para TTS.
    *   **Coste Mensual por Usuario (API STT/TTS): $1.00 - $5.00.**
*   **Infraestructura de Backend:** Si la aplicación requiere un backend para gestionar usuarios, historial, o lógica compleja, habría costes de servidor (AWS, GCP, Azure).
    *   **Estimación:** Varía enormemente, pero para una base de usuarios considerable, podría ser desde **$100 - $miles/mes**.
*   **Costes de Desarrollo y Mantenimiento:** El coste de mantener actualizada la aplicación, lidiar con cambios de API, mejoras de modelos y adaptaciones a nuevas UIs. Este es el coste oculto más grande para la empresa que ofrece el servicio.

**Coste Mensual Total Estimado por Usuario (APIs): Aproximadamente $10 - $50+ al mes**, excluyendo la suscripción del software en sí y los costes de infraestructura compartida. Para un modelo de negocio SaaS, esto significa que el precio de venta al público debe ser significativamente más alto para cubrir estos costes y generar beneficio.

### 6. Diagrama de Bloques Mermaid

```mermaid
graph TD
    A[Usuario] --> B(Aplicación "Cliffy" en macOS)

    B -- Captura de Pantalla + Consulta Vocal/Texto --> C{Módulo de Recolección de Entrada}
    C -- Captura de Pantalla --> D[Módulo de Procesamiento Local de UI (Cursor Verde)]
    C -- Audio de Voz --> E[API de Voz a Texto (STT)]
    C -- Texto de Consulta --> F[API de LLM/Visión (Nube)]

    D -- Resaltado Visual --> B
    E --> F
    F -- Respuesta de Texto --> G[Módulo de Procesamiento de Salida]
    G -- Texto a Voz (TTS) --> H[API de Texto a Voz (TTS)]
    G -- Superposición Visual --> B

    H --> B
    B -- Respuesta Audio/Visual --> A
```

### 7. El Pozo Útil

El concepto de un "agente en pantalla" que combina la visión por computadora con la comprensión del lenguaje natural para ofrecer asistencia contextual es un patrón de ingeniería extremadamente potente y un área de investigación activa en IA. Lo rescatable y útil es:

1.  **Asistencia Contextualizada mediante Visión de UI:** La idea de que una IA pueda "ver" y describir elementos de la interfaz de usuario de una aplicación en tiempo real es una aplicación directa de los modelos LLM-V. Esto tiene un enorme potencial para tutoriales interactivos, soporte técnico automatizado, onboarding de software y herramientas de accesibilidad. En lugar de buscar manuales o videos, el usuario puede preguntar directamente sobre lo que ve.
2.  **Uso de Superposiciones Visuales para Guía:** La técnica de usar un "cursor verde" o resaltados para señalar elementos específicos de la UI en respuesta a una pregunta de la IA es una forma muy efectiva de mejorar la experiencia del usuario y hacer que las explicaciones sean más concretas. Este patrón de "show, don't just tell" es valioso en el diseño de interacciones de IA.
3.  **Reducción de la Fricción en el Aprendizaje de Software:** Para tareas complejas como la edición de video (o cualquier software profesional), donde hay una curva de aprendizaje pronunciada y muchas funciones no son inmediatamente obvias, una herramienta así podría democratizar el acceso y acelerar el aprendizaje, eliminando la necesidad de cambiar de contexto para buscar ayuda externa.

Aunque la implementación "en tiempo real" y "omnisciente" es un desafío, el patrón de usar IA para observar la pantalla y proporcionar asistencia guiada es una dirección clave para el futuro de la interacción humano-computadora.

---