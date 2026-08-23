/**
 * src/lib/offline-fetch.ts
 *
 * Drop-in replacement for `fetch()` that is offline-aware.
 * - GET requests: returns cached data from IndexedDB when offline
 * - POST/PUT/DELETE: queues the mutation in IndexedDB when offline
 * - Automatically caches successful GET responses for offline reads
 * - Syncs queued mutations when back online
 */

import { cacheGet, cacheSet, queueMutation, type QueuedMutation } from './offline-db'
import { processMutationQueue, onSyncStatus, getIsSyncing } from './offline-db'

// ── Config: which API paths to cache for offline reads ──
const CACHEABLE_GET_PATHS = [
  '/api/products',
  '/api/inventory',
  '/api/dashboard',
  '/api/customers',
  '/api/categories',
  '/api/manufacturers',
  '/api/vendors',
  '/api/transactions',
  '/api/shifts',
  '/api/company-setup',
  '/api/notifications',
  '/api/inventory/batches',
  '/api/controlled-substances',
]

function isCacheableGet(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin)
    return u.pathname === '/api/auth/session'
      ? false
      : CACHEABLE_GET_PATHS.some((p) => u.pathname.startsWith(p))
  } catch {
    return false
  }
}

// ── Enhanced fetch ──

export interface OfflineFetchResult {
  ok: boolean
  status: number
  data: any
  fromCache: boolean
  queued: boolean
}

/**
 * Offline-aware fetch.
 * For GETs: tries network, falls back to IndexedDB cache.
 * For mutations: tries network, queues in IndexedDB if offline.
 */
export async function offlineFetch(
  url: string,
  options: RequestInit = {},
): Promise<OfflineFetchResult> {
  const method = (options.method || 'GET').toUpperCase()
  const isOnline = navigator.onLine

  // ── GET requests ──
  if (method === 'GET' && isCacheableGet(url)) {
    if (isOnline) {
      try {
        const res = await fetch(url, options)
        if (res.ok) {
          const data = await res.json()
          // Cache for offline use
          await cacheSet(url, data)
          return { ok: true, status: res.status, data, fromCache: false, queued: false }
        }
        // Non-ok response (401, 500, etc): try cache as fallback
        const cached = await cacheGet(url)
        if (cached) {
          return { ok: true, status: 200, data: cached.body, fromCache: true, queued: false }
        }
        return { ok: false, status: res.status, data: null, fromCache: false, queued: false }
      } catch {
        // Network error — try cache
        const cached = await cacheGet(url)
        if (cached) {
          return { ok: true, status: 200, data: cached.body, fromCache: true, queued: false }
        }
        return { ok: false, status: 0, data: null, fromCache: false, queued: false }
      }
    } else {
      // Offline — serve from cache
      const cached = await cacheGet(url)
      if (cached) {
        return { ok: true, status: 200, data: cached.body, fromCache: true, queued: false }
      }
      return { ok: false, status: 0, data: null, fromCache: false, queued: false }
    }
  }

  // ── Mutation requests (POST / PUT / DELETE) ──
  if (!isOnline) {
    // Queue the mutation for later sync
    const headers: Record<string, string> = {}
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((v, k) => { headers[k] = v })
      } else if (Array.isArray(options.headers)) {
        (options.headers as Array<[string, string]>).forEach(([k, v]) => { headers[k] = v })
      } else {
        Object.assign(headers, options.headers)
      }
    }
    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    await queueMutation({
      url,
      method,
      headers,
      body: bodyStr,
      timestamp: Date.now(),
    })
    // Return a fake success response so the UI can proceed optimistically
    // The actual result will be applied when the mutation syncs
    return { ok: true, status: 202, data: { queued: true, message: 'Queued for sync' }, fromCache: false, queued: true }
  }

  // Online mutation — just pass through
  try {
    const res = await fetch(url, options)
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data, fromCache: false, queued: false }
  } catch {
    // Network dropped mid-request — queue it
    const headers: Record<string, string> = {}
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((v, k) => { headers[k] = v })
      } else if (Array.isArray(options.headers)) {
        (options.headers as Array<[string, string]>).forEach(([k, v]) => { headers[k] = v })
      } else {
        Object.assign(headers, options.headers)
      }
    }
    const bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    await queueMutation({
      url,
      method,
      headers,
      body: bodyStr,
      timestamp: Date.now(),
    })
    return { ok: true, status: 202, data: { queued: true, message: 'Queued for sync' }, fromCache: false, queued: true }
  }
}

// ── Pre-fetch critical data for offline use ──
export async function prefetchForOffline(token: string | null) {
  if (!token || !navigator.onLine) return

  const headers = { Authorization: `Bearer ${token}` }
  const endpoints = [
    '/api/products?limit=1000',
    '/api/inventory',
    '/api/customers?limit=500',
    '/api/categories',
    '/api/manufacturers',
    '/api/vendors',
  ]

  const results = await Promise.allSettled(
    endpoints.map(async (url) => {
      const res = await fetch(url, { headers })
      if (res.ok) {
        const data = await res.json()
        await cacheSet(url, data)
        return { url, data }
      }
    })
  )

  // Also cache in localStorage for backward compatibility with POS
  const productsResult = results.find((r) => r.status === 'fulfilled' && r.value?.url === '/api/products?limit=1000')
  if (productsResult && productsResult.status === 'fulfilled') {
    try {
      const products = productsResult.value.data?.products || productsResult.value.data || []
      localStorage.setItem('selrx_offline_inventory', JSON.stringify(products))
      localStorage.setItem('selrx_offline_inventory_at', String(Date.now()))
    } catch { /* localStorage full */ }
  }
}

export { getPendingMutationCount, processMutationQueue, onSyncStatus, getIsSyncing, cacheGet, cacheSet }
