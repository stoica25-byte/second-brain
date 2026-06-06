---
category: skills
created: 2026-06-04
status: active
summary: Cola de Sincronización Fuera de Línea con LocalStorage Resumen Cuando se
  diseñan aplicaciones web de captura rápida (com...
tags:
- type/skill
- tech/javascript
- tag/frontend
- tag/offline
- tag/resilience
- tag/localstorage
title: Cola de Sincronización Fuera de Línea con LocalStorage
updated: 2026-06-04
---

# Cola de Sincronización Fuera de Línea con LocalStorage

## Resumen
Cuando se diseñan aplicaciones web de captura rápida (como toma de notas, logs o encuestas) destinadas a usarse en movilidad, es probable experimentar desconexiones temporales. Implementar una cola local resiliente con `localStorage` que sincronice de forma diferida los datos al recuperar la conexión asegura que el usuario no pierda información ni reciba alertas frustrantes de error.

## Patrón de Encolado y Fallback
Al enviar un formulario o petición, si la petición de red falla o devuelve un estado 503 (Servicio no disponible), interceptamos el error y encolamos el payload:

```javascript
async function submitData(payload) {
  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (res.status === 503 || !res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }
    
    // Éxito
    showNotification("Guardado con éxito");
  } catch (error) {
    console.warn("Fallo de conexión, guardando en cola offline:", error);
    enqueueOfflineItem(payload);
    showNotification("Guardado localmente (Offline)", "warning");
  }
}
```

## Gestión de la Cola Local
El almacenamiento local se gestiona serializando y deserializando arrays en formato JSON:

```javascript
const QUEUE_KEY = "offline_sync_queue";

function enqueueOfflineItem(item) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    data: item,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  updateQueueBadge();
}

async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (queue.length === 0) return;
  
  console.log(`Intentando sincronizar ${queue.length} elementos pendientes...`);
  
  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.data)
      });
      if (!res.ok) {
        throw new Error("Envío fallido");
      }
    } catch (e) {
      console.error(`Fallo al sincronizar elemento ${item.id}, reteniendo en cola.`, e);
      remaining.push(item);
    }
  }
  
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  updateQueueBadge();
}
```

## Activación Automática por Estado
La sincronización debe lanzarse periódicamente cuando se detecta el estado `ONLINE`:

```javascript
// Listener nativo del navegador
window.addEventListener("online", () => {
  console.log("Conexión restablecida, iniciando sync...");
  syncOfflineQueue();
});

// O mediante un polling recurrente de salud de conexión
async function checkHealth() {
  const isOnline = await checkServerConnection();
  if (isOnline) {
    await syncOfflineQueue();
  }
}
```

## 🔗 Conexiones
- **Diario de Desarrollo**: [[Sesion Desarrollo Second Brain 2026-06-04]]
- **MOC Temático**: [[Welcome Hub]]
- **Notas Afines**: [[Error: Browser Cache Impide Cargar JS Actualizado]], [[Discrepancia en IDs de Checkboxes de Personalización del HUD]]