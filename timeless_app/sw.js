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
  '/manifest.json'
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
