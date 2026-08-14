const CACHE_NAME = 'selrx-v2';

// Core assets to pre-cache on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/logo.svg',
];

// Install: pre-cache core assets + dynamically cache all _next/static resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache core assets
      await cache.addAll(PRECACHE_ASSETS);

      // Dynamically discover and cache all _next/static build assets
      // by fetching the page and parsing out JS/CSS references
      try {
        const pageRes = await fetch('/');
        if (pageRes.ok) {
          const html = await pageRes.text();
          // Extract _next/static URLs from the HTML
          const regex = /"(\/_next\/static\/[^"]+\.(?:js|css))"/g;
          const staticUrls: string[] = [];
          let match;
          while ((match = regex.exec(html)) !== null) {
            if (!staticUrls.includes(match[1])) staticUrls.push(match[1]);
          }
          // Also try common Next.js static paths
          staticUrls.push('/_next/static/chunks/webpack.js');
          staticUrls.push('/_next/static/chunks/main.js');
          staticUrls.push('/_next/static/chunks/pages/_app.js');

          // Cache all discovered static assets (ignore failures for non-critical ones)
          const results = await Promise.allSettled(
            staticUrls.map((url) => cache.add(url).catch(() => null))
          );
          // Also cache any static assets that were linked in the HTML
          // by fetching all _next/static/* from the cache or network
        }
      } catch (e) {
        // Network unavailable during install — that's fine,
        // we'll cache on fetch instead
      }
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET responses for offline fallback
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Next.js static assets (_next/static/*): stale-while-revalidate
  // Serve from cache immediately, update cache in background
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          // Always fetch in background to update cache
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached); // If network fails, return cached

          // Return cached immediately, or wait for network if no cache
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // HTML pages and everything else: network first, cache fallback
  if (request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // All other static assets: cache first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
