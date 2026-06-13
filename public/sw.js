const CACHE_NAME = 'gq-rpg-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/privacy.html',
  '/icon.svg',
  '/manifest.json'
];

// Service Worker Install State: Cache basic app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching Core App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Service Worker Activation State: Cache invalidation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Evicting legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch events: Cache-first with network fallbacks for statics, direct pass-through for API calls
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // CRITICAL: Bypass caching completely for API routes (Gemini responses, identity auth, sheets sync)
  if (requestUrl.pathname.startsWith('/api') || event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Handle asset caching with Stale-While-Revalidate strategy
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to update cache for next load
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => { /* Ignore offline update failures */ });
          
        return cachedResponse;
      }

      // Fallback to live network
      return fetch(event.request).then((networkResponse) => {
        // Cache safe static requests dynamically
        if (
          networkResponse.status === 200 &&
          (requestUrl.origin === self.location.origin || requestUrl.host.includes('googleapis.com') || requestUrl.host.includes('gstatic.com'))
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});
