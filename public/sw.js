const CACHE_NAME = 'selrx-v3';
const DB_NAME = 'selrx_sw_cache';
const DB_VERSION = 1;

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/logo.svg',
];

// ── IndexedDB for API response caching ──
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('responses')) {
        db.createObjectStore('responses', { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains('mutations')) {
        db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Cacheable GET API paths
const CACHEABLE = [
  '/api/products', '/api/inventory', '/api/dashboard',
  '/api/customers', '/api/categories', '/api/manufacturers',
  '/api/vendors', '/api/transactions', '/api/shifts',
  '/api/company-setup', '/api/notifications',
  '/api/inventory/batches', '/api/controlled-substances',
];

function isCacheableGet(url) {
  try {
    const u = new URL(url);
    return u.pathname !== '/api/auth/session' &&
           CACHEABLE.some(p => u.pathname.startsWith(p));
  } catch { return false; }
}

// ── Install ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(PRECACHE_ASSETS);
      // Dynamically discover _next/static resources
      try {
        const pageRes = await fetch('/');
        if (pageRes.ok) {
          const html = await pageRes.text();
          const regex = /"(\/_next\/static\/[^"']+\.(?:js|css))"/g;
          const urls = [];
          let match;
          while ((match = regex.exec(html)) !== null) {
            if (!urls.includes(match[1])) urls.push(match[1]);
          }
          await Promise.allSettled(urls.map(u => cache.add(u).catch(() => null)));
        }
      } catch { /* offline during install */ }
    })
  );
  self.skipWaiting();
});

// ── Activate ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-http and cross-origin
  if (!url.protocol.startsWith('http')) return;
  if (url.origin !== self.location.origin) return;

  // ── API GET: network-first, cache fallback, store in IDB ──
  if (url.pathname.startsWith('/api/') && request.method === 'GET' && isCacheableGet(url.href)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            // Cache in Cache API (for fast SW-level serving)
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
            // Also store in IndexedDB for the app to read directly
            try {
              const body = await response.clone().json();
              const db = await openDB();
              const tx = db.transaction('responses', 'readwrite');
              tx.objectStore('responses').put({ url: url.href, body, timestamp: Date.now() });
            } catch { /* non-JSON response, skip IDB */ }
          }
          return response;
        })
        .catch(async () => {
          // Offline: try IndexedDB first (richer data), then Cache API
          try {
            const db = await openDB();
            const tx = db.transaction('responses', 'readonly');
            const store = tx.objectStore('responses');
            const req = store.get(url.href);
            return new Promise((resolve) => {
              req.onsuccess = () => {
                if (req.result) {
                  const json = JSON.stringify(req.result.body);
                  resolve(new Response(json, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'idb' },
                  }));
                } else {
                  // Fallback to Cache API
                  caches.match(request).then(cached => {
                    resolve(cached || new Response(JSON.stringify({ error: 'offline', cached: false }), {
                      status: 503,
                      headers: { 'Content-Type': 'application/json' },
                    }));
                  });
                }
              };
              req.onerror = () => {
                caches.match(request).then(cached => {
                  resolve(cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503 }));
                });
              };
            });
          } catch {
            return caches.match(request).then(cached =>
              cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503 })
            );
          }
        })
    );
    return;
  }

  // ── API mutations (POST/PUT/DELETE): network-first, queue if offline ──
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(async () => {
          // Offline: queue mutation in IndexedDB
          try {
            const headers = {};
            request.headers.forEach((v, k) => { headers[k] = v; });
            const body = await request.text();
            const db = await openDB();
            const tx = db.transaction('mutations', 'readwrite');
            tx.objectStore('mutations').add({
              url: url.href,
              method: request.method,
              headers,
              body,
              timestamp: Date.now(),
              retries: 0,
            });
            // Notify clients that a mutation was queued
            self.clients.matchAll().then(clients => {
              clients.forEach(c => c.postMessage({ type: 'MUTATION_QUEUED' }));
            });
            return new Response(JSON.stringify({ queued: true, message: 'Queued for sync' }), {
              status: 202,
              headers: { 'Content-Type': 'application/json', 'X-Queued': 'true' },
            });
          } catch {
            return new Response(JSON.stringify({ error: 'offline' }), { status: 503 });
          }
        })
    );
    return;
  }

  // ── Non-API GETs (auth/session etc): network-first, cache fallback ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then(c => c || new Response('{}', { status: 200 })))
    );
    return;
  }

  // ── Next.js static assets: stale-while-revalidate ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ── HTML pages: network-first, cache fallback ──
  if (request.mode === 'navigate' || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/').then(c => c || new Response('<h1>Offline</h1>', { status: 503 })))
    );
    return;
  }

  // ── Other static assets: cache-first ──
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});

// ── Sync mutations when client comes online ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_MUTATIONS') {
    syncMutations();
  }
});

async function syncMutations() {
  try {
    const db = await openDB();
    const tx = db.transaction('mutations', 'readonly');
    const store = tx.objectStore('mutations');
    const all = await new Promise(resolve => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    if (all.length === 0) return;

    // Notify clients we're syncing
    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SYNC_STARTED', count: all.length }));
    });

    let synced = 0, failed = 0;
    for (const mut of all) {
      try {
        const res = await fetch(mut.url, {
          method: mut.method,
          headers: mut.headers,
          body: mut.body || undefined,
        });
        if (res.ok || res.status === 409) {
          // Remove successful mutation
          const delTx = db.transaction('mutations', 'readwrite');
          delTx.objectStore('mutations').delete(mut.id);
          synced++;
        } else {
          const writeTx = db.transaction('mutations', 'readwrite');
          mut.retries = (mut.retries || 0) + 1;
          if (mut.retries >= 5) {
            writeTx.objectStore('mutations').delete(mut.id);
            failed++;
          } else {
            writeTx.objectStore('mutations').put(mut);
          }
        }
      } catch {
        const writeTx = db.transaction('mutations', 'readwrite');
        mut.retries = (mut.retries || 0) + 1;
        if (mut.retries >= 5) {
          writeTx.objectStore('mutations').delete(mut.id);
          failed++;
        } else {
          writeTx.objectStore('mutations').put(mut);
        }
      }
    }

    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SYNC_DONE', synced, failed }));
    });
  } catch (err) {
    self.clients.matchAll().then(clients => {
      clients.forEach(c => c.postMessage({ type: 'SYNC_ERROR', error: String(err) }));
    });
  }
}

// Auto-sync when connectivity changes
self.addEventListener('online', () => {
  syncMutations();
  // Also trigger a cache refresh for critical data
  self.clients.matchAll().then(clients => {
    clients.forEach(c => c.postMessage({ type: 'REFRESH_CACHE' }));
  });
});
