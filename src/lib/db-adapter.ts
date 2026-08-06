/**
 * src/lib/db-adapter.ts
 *
 * The database abstraction layer.
 *
 * On WEB (Vercel / browser):  routes to your existing `/api/*` routes → Turso cloud
 * On DESKTOP (Tauri):         routes to local SQLite via Tauri IPC → Rusqlite
 *
 * Usage:
 *   import { adapterQuery, adapterExecute, adapterFetch } from '@/lib/db-adapter'
 *
 *   // Direct query (desktop only, web returns empty)
 *   const products = await adapterQuery('SELECT * FROM Product WHERE status = ?', ['ACTIVE'])
 *
 *   // Transparent fetch — works on both platforms
 *   const res = await adapterFetch('/api/products?status=ACTIVE', { headers })
 *   const products = await res.json()
 */

import { isDesktop } from './platform'
import { dbQuery, dbExecute } from './desktop/tauri-bridge'

// ===================================================================
// Direct Database Queries (Desktop Only)
// ===================================================================

/**
 * Execute a SELECT query.
 * - Desktop: runs against local SQLite
 * - Web: throws an error (web must use API routes)
 */
export async function adapterQuery(
  sql: string,
  params: (string | number | boolean | null)[] = []
): Promise<Record<string, unknown>[]> {
  if (!isDesktop()) {
    throw new Error(
      '[db-adapter] adapterQuery is only available in Tauri desktop mode. ' +
      'Use adapterFetch() for web compatibility.'
    )
  }

  const strParams = params.map((p) =>
    p === null ? 'NULL' : String(p)
  )
  return dbQuery(sql, strParams)
}

/**
 * Execute an INSERT, UPDATE, or DELETE.
 * - Desktop: runs against local SQLite + writes SyncLog
 * - Web: throws an error (web must use API routes)
 */
export async function adapterExecute(
  sql: string,
  params: (string | number | boolean | null)[] = [],
  options: {
    tableName?: string
    operation?: string
    recordId?: string
    recordData?: string
  } = {}
): Promise<{ affected: number }> {
  if (!isDesktop()) {
    throw new Error(
      '[db-adapter] adapterExecute is only available in Tauri desktop mode. ' +
      'Use adapterFetch() for web compatibility.'
    )
  }

  const strParams = params.map((p) =>
    p === null ? 'NULL' : String(p)
  )
  return dbExecute(
    sql,
    strParams,
    options.tableName || '',
    options.operation || '',
    options.recordId || '',
    options.recordData || '{}'
  )
}

// ===================================================================
// Universal Fetch Wrapper (Both Platforms)
// ===================================================================

/**
 * A drop-in replacement for `fetch()` that works on both web and desktop.
 *
 * - Web: calls `fetch()` normally (hits your API routes → Turso)
 * - Desktop: also calls `fetch()`, but since the app is loaded from
 *   `tauri://localhost` in Tauri, you must use the dev server URL
 *   (http://localhost:1420) for API calls in dev mode. In production,
 *   the desktop app has its own local API via the embedded sync server.
 */
export async function adapterFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  if (isDesktop()) {
    // In Tauri, the frontend is served from tauri://localhost
    // Relative fetch URLs won't work. We need to prepend the dev server URL.
    const baseUrl = __TAURI_DEV_URL__ || 'http://localhost:1420'
    const absoluteUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
    return fetch(absoluteUrl, init)
  }

  // Web: normal fetch
  return fetch(url, init)
}

// ===================================================================
// Convenience: API Call Helpers
// ===================================================================

/**
 * Make a GET request to the app's API.
 * Works on both web and desktop transparently.
 */
export async function apiGet(
  path: string,
  headers?: Record<string, string>
): Promise<unknown> {
  const res = await adapterFetch(path, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API GET ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Make a POST request to the app's API.
 * Works on both web and desktop transparently.
 */
export async function apiPost(
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<unknown> {
  const res = await adapterFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API POST ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Make a PUT request to the app's API.
 */
export async function apiPut(
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<unknown> {
  const res = await adapterFetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API PUT ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Make a DELETE request to the app's API.
 */
export async function apiDelete(
  path: string,
  headers?: Record<string, string>
): Promise<unknown> {
  const res = await adapterFetch(path, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API DELETE ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

// Declare the Tauri dev URL global injected by Tauri at build time
declare const __TAURI_DEV_URL__: string | undefined
