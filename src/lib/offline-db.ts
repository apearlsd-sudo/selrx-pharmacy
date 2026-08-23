/**
 * src/lib/offline-db.ts
 *
 * IndexedDB wrapper for offline data caching and mutation queuing.
 * - Stores API GET responses in IndexedDB for offline reads
 * - Queues failed POST/PUT/DELETE mutations for later sync
 * - Provides sync status tracking
 */

const DB_NAME = 'selrx_offline'
const DB_VERSION = 1

// ── Database Schema ──
// apiCache:  key=url, value={body, headers, timestamp}
// mutations: key=auto-increment, value={url, method, headers, body, timestamp, retries}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('apiCache')) {
        db.createObjectStore('apiCache', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('mutations')) {
        const store = db.createObjectStore('mutations', { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── API Cache ──

export interface CachedResponse {
  url: string
  body: any
  timestamp: number
}

export async function cacheGet(url: string): Promise<CachedResponse | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('apiCache', 'readonly')
      const store = tx.objectStore('apiCache')
      const req = store.get(url)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function cacheSet(url: string, body: any): Promise<void> {
  try {
    const db = await openDB()
    const entry: CachedResponse = { url, body, timestamp: Date.now() }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('apiCache', 'readwrite')
      tx.objectStore('apiCache').put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* indexedDB unavailable */ }
}

/** Clear all cached API responses */
export async function cacheClear(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('apiCache', 'readwrite')
      tx.objectStore('apiCache').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

/** Cache multiple entries at once (for bulk pre-fetch) */
export async function cacheSetMany(entries: Array<{ url: string; body: any }>): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('apiCache', 'readwrite')
      const store = tx.objectStore('apiCache')
      for (const e of entries) {
        store.put({ url: e.url, body: e.body, timestamp: Date.now() })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

// ── Mutation Queue ──

export interface QueuedMutation {
  id?: number
  url: string
  method: string
  headers: Record<string, string>
  body: string
  timestamp: number
  retries: number
  maxRetries: number
}

export async function queueMutation(mutation: Omit<QueuedMutation, 'id' | 'retries'>): Promise<number | null> {
  try {
    const db = await openDB()
    const entry: QueuedMutation = { ...mutation, retries: 0, maxRetries: 5 }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mutations', 'readwrite')
      const req = tx.objectStore('mutations').add(entry)
      req.onsuccess = () => resolve(req.result as number)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('mutations', 'readonly')
      const req = tx.objectStore('mutations').getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function removeMutation(id: number): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('mutations', 'readwrite')
      tx.objectStore('mutations').delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

export async function getPendingMutationCount(): Promise<number> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction('mutations', 'readonly')
      const req = tx.objectStore('mutations').count()
      req.onsuccess = () => resolve(req.result as number)
      req.onerror = () => resolve(0)
    })
  } catch {
    return 0
  }
}

/** Clear all queued mutations */
export async function clearMutations(): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('mutations', 'readwrite')
      tx.objectStore('mutations').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch { /* ignore */ }
}

// ── Sync Engine ──

let isSyncing = false
let syncListeners: Array<(status: 'syncing' | 'done' | 'error') => void> = []

export function onSyncStatus(cb: (status: 'syncing' | 'done' | 'error') => void) {
  syncListeners.push(cb)
  return () => { syncListeners = syncListeners.filter((l) => l !== cb) }
}

function notifySync(status: 'syncing' | 'done' | 'error') {
  syncListeners.forEach((cb) => cb(status))
}

export function getIsSyncing() { return isSyncing }

/**
 * Process all queued mutations in order.
 * Returns { synced, failed }.
 */
export async function processMutationQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 }
  isSyncing = true
  notifySync('syncing')

  let synced = 0
  let failed = 0

  try {
    const mutations = await getAllMutations()
    for (const mut of mutations) {
      try {
        const res = await fetch(mut.url, {
          method: mut.method,
          headers: mut.headers,
          body: mut.body || undefined,
        })
        if (res.ok || res.status === 409) {
          // 409 = conflict (e.g. duplicate), consider it handled
          await removeMutation(mut.id!)
          synced++
        } else {
          const updated = { ...mut, retries: mut.retries + 1 }
          if (updated.retries >= updated.maxRetries) {
            await removeMutation(mut.id!)
            failed++
          } else {
            // Update retry count
            const db = await openDB()
            await new Promise<void>((resolve) => {
              const tx = db.transaction('mutations', 'readwrite')
              tx.objectStore('mutations').put(updated)
              tx.oncomplete = () => resolve()
              tx.onerror = () => resolve()
            })
          }
        }
      } catch {
        const updated = { ...mut, retries: mut.retries + 1 }
        if (updated.retries >= updated.maxRetries) {
          await removeMutation(mut.id!)
          failed++
        } else {
          const db = await openDB()
          await new Promise<void>((resolve) => {
            const tx = db.transaction('mutations', 'readwrite')
            tx.objectStore('mutations').put(updated)
            tx.oncomplete = () => resolve()
            tx.onerror = () => resolve()
          })
        }
      }
    }
    notifySync('done')
  } catch {
    notifySync('error')
  } finally {
    isSyncing = false
  }
  return { synced, failed }
}
