const CACHE_NAME = 'timeless-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/reader.html',
  '/agent.html',
  '/architecture.html',
  '/assets/css/reader.css',
  '/assets/css/agent.css',
  '/assets/css/index.css',
  '/assets/js/index.js',
  '/assets/js/reader.js',
  '/assets/js/agent.js',
  '/assets/js/crypto_utils.js',
  '/prompts.js',
  '/agent_service.js',
  '/firebase_config.js',
  '/assets/cover.png',
  '/assets/cover_arquitecto.png',
  '/assets/cover_contemplacion.png',
  '/assets/cover_memoria.png',
  '/assets/cover_umbral.png',
  '/manifest.json',
  '/fallback_catalog.json',
  '/kids_fallback_catalog.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(asset => {
          return cache.add(asset).catch(err => {
            console.warn(`  ⚠ [Service Worker] No se pudo cachear ${asset}:`, err.message);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // No interceptar peticiones impositivas, bancarias o de autenticación de Firebase
  if (url.pathname.startsWith('/api/') || url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network First para archivos HTML base
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((networkResponse) => {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Cache First para archivos estáticos del mismo origen
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn("  ⚠ Offline request fallido para:", e.request.url, err);
      });
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-telemetry') {
    event.waitUntil(flushOfflineTelemetryQueue());
  }
});

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('timeless_offline_db', 2);
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getCachedToken() {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains('offline_keys')) return null;
    const keyData = await new Promise((resolve, reject) => {
      const tx = db.transaction('offline_keys', 'readonly');
      const req = tx.objectStore('offline_keys').get('_user_token');
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(req.error);
    });
    if (keyData && Date.now() < keyData.expiresAt) {
      return keyData.license;
    }
  } catch(e) {
    console.warn("  ⚠ [SW Sync] Error leyendo token caché:", e.message);
  }
  return null;
}

async function flushOfflineTelemetryQueue() {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains('telemetry_queue')) return;

    const events = await new Promise((resolve, reject) => {
      const tx = db.transaction('telemetry_queue', 'readonly');
      const store = tx.objectStore('telemetry_queue');
      const req = store.getAll();
      tx.oncomplete = () => resolve(req.result || []);
      tx.onerror = (e) => reject(e.target.error);
    });

    if (!events || events.length === 0) return;

    console.log(`  ✦ [SW Sync] Detectado evento de sincronización. Procesando ${events.length} logs offline...`);
    const token = await getCachedToken();
    if (!token) {
      console.warn("  ⚠ [SW Sync] Sincronización cancelada: No se encontró un token JWT válido en IndexedDB.");
      return;
    }

    const res = await fetch('/api/telemetry/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ events })
    });

    if (res.ok) {
      const clearTx = db.transaction('telemetry_queue', 'readwrite');
      clearTx.objectStore('telemetry_queue').clear();
      console.log("  ✦ [SW Sync] Sincronización en segundo plano completada con éxito.");
    } else {
      console.warn("  ⚠ [SW Sync] Falló el flush de telemetría en SW:", res.statusText);
    }
  } catch (err) {
    console.warn("  ⚠ [SW Sync] Fallo al procesar sincronización en segundo plano:", err.message);
  }
}

