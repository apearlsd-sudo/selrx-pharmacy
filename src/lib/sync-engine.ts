/**
 * src/lib/sync-engine.ts
 *
 * Client-side sync engine for Tauri desktop mode.
 * Handles pushing local changes to the hub and pulling hub changes.
 *
 * Features:
 * - Periodic HTTP sync (10s polling)
 * - WebSocket real-time sync (instant push notifications)
 * - Offline queue persistence (survives app restarts)
 * - Delta-based inventory sync (race-condition safe)
 * - mDNS auto-discovery for LAN hubs
 * - Online/offline event listeners for instant state transitions
 * - Fetch timeouts to prevent hanging on unreachable hub
 * - Exponential backoff on WebSocket reconnection
 *
 * This module is a NO-OP on web.
 */

import { isDesktop } from './platform'
import type { SyncLogEntry, PullResponse, PushResponse, OfflineQueueItem, DiscoveredHub, WsEvent } from './desktop/tauri-types'
import {
  getPendingSyncs,
  markSynced,
  getCheckpoint,
  setCheckpoint,
  getDeviceId,
  offlineQueuePush,
  offlineQueueGetPending,
  offlineQueueComplete,
  offlineQueueFail,
  offlineQueueStats,
  logHealthMetric,
  scanForHubs,
  getLocalIps,
  setHubUrl as persistHubUrl,
} from './desktop/tauri-bridge'

// ===================================================================
// Configuration
// ===================================================================

const SYNC_INTERVAL_MS = 10_000
const WS_BASE_RECONNECT_DELAY_MS = 3_000
const WS_MAX_RECONNECT_DELAY_MS = 60_000
const WS_PING_INTERVAL_MS = 30_000
const OFFLINE_QUEUE_DRAIN_INTERVAL_MS = 5_000
const FETCH_TIMEOUT_MS = 15_000
const MAX_PULL_RECURSION_DEPTH = 10
const MAX_CONFLICTS = 200

// Tables to sync (master data from hub → terminal)
const PULL_TABLES = [
  'Product', 'Inventory', 'Batch', 'Customer', 'Category',
  'Manufacturer', 'Vendor', 'DosageForm', 'User', 'SystemRole',
  'Workstation', 'Company',
]

// Tables that terminals push to the hub
const PUSH_TABLES = [
  'Transaction', 'TransactionItem', 'Return', 'Prescription',
  'AuditLog', 'ProductHistory', 'StockTake', 'StockTakeItem', 'HardwareLog',
]

// Tables that use delta-based sync (quantity changes)
const DELTA_TABLES = ['Inventory']

// Local queue for inventory deltas (in-memory, backed by OfflineQueue)
interface PendingDelta {
  batchId: string
  productId: string
  delta: number
  transactionId: string
  reason: string
  createdAt: string
}

let pendingDeltas: PendingDelta[] = []

// ===================================================================
// State
// ===================================================================

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline' | 'ws_connected' | 'discovering'

let syncState: SyncState = 'idle'
let hubUrl: string = ''
let syncSecret: string = ''
let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSyncAt: string | null = null
let pendingCount = 0
let errorCount = 0
let lastError: string | null = null
let deviceId: string = ''
let conflicts: SyncConflict[] = []

// WebSocket state
let wsConnection: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
let wsPingTimer: ReturnType<typeof setInterval> | null = null
let wsConnectedAt: string | null = null
let wsReconnectAttempt = 0

// Offline queue drain timer
let queueDrainTimer: ReturnType<typeof setInterval> | null = null

// Discovered hubs
let discoveredHubs: DiscoveredHub[] = []
let localIps: string[] = []

// Offline queue stats
let queueStats = { total: 0, pending: 0, in_progress: 0, failed: 0, completed: 0, oldest_pending: '', newest: '' }

// Listener callbacks
const listeners = new Set<(state: SyncState, info: SyncInfo) => void>()

// Track whether online/offline listeners are registered
let networkListenersRegistered = false

export interface SyncConflict {
  id: string
  tableName: string
  recordId: string
  operation: string
  localData: Record<string, unknown>
  hubData: Record<string, unknown>
  detectedAt: string
  resolved: boolean
  resolution?: 'keep_local' | 'keep_hub'
}

export interface SyncInfo {
  state: SyncState
  hubUrl: string
  deviceId: string
  lastSyncAt: string | null
  pendingCount: number
  errorCount: number
  lastError: string | null
  platform: string
  conflictCount: number
  wsConnected: boolean
  wsConnectedAt: string | null
  queueStats: typeof queueStats
  discoveredHubs: DiscoveredHub[]
  localIps: string[]
}

// ===================================================================
// Public API
// ===================================================================

/** Start the periodic sync loop. No-op on web. */
export async function startSync(url?: string): Promise<void> {
  if (!isDesktop()) return

  if (url) hubUrl = url

  if (!hubUrl) {
    try {
      const { getHubUrl } = await import('./desktop/tauri-bridge')
      const stored = await getHubUrl()
      if (stored) hubUrl = stored
    } catch { /* First run */ }
  }

  try { deviceId = await getDeviceId() } catch { deviceId = 'unknown' }

  // Load local IPs
  try { localIps = await getLocalIps() } catch { /* ignore */ }

  // Register online/offline event listeners (once)
  if (!networkListenersRegistered) {
    registerNetworkListeners()
    networkListenersRegistered = true
  }

  if (!hubUrl) {
    setSyncState('idle')
    console.warn('[sync] No hub URL configured. Sync is paused.')
    return
  }

  console.log(`[sync] Starting sync loop to ${hubUrl}`)

  // 1. Restore pending deltas from the persisted offline queue
  await restoreOfflineQueue()

  // 2. Run an immediate sync
  await runFullSync()

  // 3. Start periodic HTTP sync
  syncTimer = setInterval(() => runFullSync(), SYNC_INTERVAL_MS)

  // 4. Start WebSocket connection for real-time notifications
   wsReconnectAttempt = 0
  connectWebSocket()

  // 5. Start offline queue drain timer
  queueDrainTimer = setInterval(() => drainOfflineQueue(), OFFLINE_QUEUE_DRAIN_INTERVAL_MS)
}

/** Stop the sync loop and WebSocket. */
export function stopSync(): void {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null }
  if (queueDrainTimer) { clearInterval(queueDrainTimer); queueDrainTimer = null }
  disconnectWebSocket()
  setSyncState('idle')
}

/** Configure the hub URL (called from settings UI). Persists to disk. */
export async function setHubUrl(url: string, secret?: string): Promise<void> {
  hubUrl = url
  if (secret) syncSecret = secret

  // Persist so it survives app restarts
  try {
    await persistHubUrl(url)
  } catch {
    console.warn('[sync] Could not persist hub URL to disk')
  }

  if (syncTimer) {
    stopSync()
    await startSync(url)
  }
}

/** Get current sync info for UI display. */
export function getSyncInfo(): SyncInfo {
  return {
    state: syncState,
    hubUrl,
    deviceId,
    lastSyncAt,
    pendingCount,
    errorCount,
    lastError,
    platform: isDesktop() ? 'tauri' : 'web',
    conflictCount: conflicts.filter((c) => !c.resolved).length,
    wsConnected: wsConnection?.readyState === WebSocket.OPEN,
    wsConnectedAt: wsConnectedAt,
    queueStats: { ...queueStats },
    discoveredHubs: [...discoveredHubs],
    localIps: [...localIps],
  }
}

/** Get all sync conflicts (unresolved first, then resolved). */
export function getSyncConflicts(): SyncConflict[] {
  return [...conflicts].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
    return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  })
}

/** Resolve a conflict by choosing which version to keep. */
export async function resolveConflict(
  conflictId: string,
  resolution: 'keep_local' | 'keep_hub',
): Promise<void> {
  const conflict = conflicts.find((c) => c.id === conflictId)
  if (!conflict) return

  if (isDesktop()) {
    const { dbExecute } = await import('./desktop/tauri-bridge')
    const data = resolution === 'keep_hub' ? conflict.hubData : conflict.localData
    const keys = Object.keys(data).filter((k) => k !== 'id')
    const values = Object.values(data)
      .filter((_, i) => !['id'].includes(Object.keys(data)[i]))
      .map((v) => (v === null ? 'NULL' : String(v)))
    const sets = keys.map((k) => `"${k}" = ?`).join(', ')
    values.push(conflict.recordId)
    await dbExecute(`UPDATE "${conflict.tableName}" SET ${sets} WHERE id = ?`, values)
  }

  conflict.resolved = true
  conflict.resolution = resolution
  setSyncState(syncState)
}

/** Subscribe to sync state changes. */
export function onSyncStateChange(
  callback: (state: SyncState, info: SyncInfo) => void,
): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Trigger a one-time manual sync. */
export async function manualSync(): Promise<void> {
  if (!isDesktop()) return
  await runFullSync()
}

// ===================================================================
// mDNS Discovery
// ===================================================================

/** Scan the LAN for SelRx hubs. */
export async function discoverHubs(timeoutSecs: number = 3): Promise<DiscoveredHub[]> {
  if (!isDesktop()) return []
  setSyncState('discovering')
  try {
    discoveredHubs = await scanForHubs(timeoutSecs)
    setSyncState('idle')
    return discoveredHubs
  } catch (err) {
    setSyncState('idle')
    console.error('[sync] Hub discovery failed:', err)
    return []
  }
}

/** Get cached discovered hubs. */
export function getDiscoveredHubs(): DiscoveredHub[] {
  return [...discoveredHubs]
}

// ===================================================================
// Offline Queue
// ===================================================================

/** Get offline queue statistics. */
export async function refreshQueueStats(): Promise<typeof queueStats> {
  if (!isDesktop()) return queueStats
  try {
    queueStats = await offlineQueueStats()
    setSyncState(syncState) // trigger UI update
  } catch { /* ignore */ }
  return queueStats
}

// ===================================================================
// Network Event Listeners (online/offline)
// ===================================================================

function registerNetworkListeners(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('online', () => {
    console.log('[sync] Network came online — triggering immediate sync')
    setSyncState('idle')
    // Immediately try to sync and drain queue
    runFullSync().catch((err) => console.error('[sync] Post-online sync failed:', err))
    drainOfflineQueue().catch(() => {})
    // Reset WS reconnect backoff since network is back
    wsReconnectAttempt = 0
    connectWebSocket()
  })

  window.addEventListener('offline', () => {
    console.log('[sync] Network went offline')
    setSyncState('offline')
    // Stop WebSocket — it will reconnect when back online
    disconnectWebSocket()
  })
}

// ===================================================================
// Internal Implementation
// ===================================================================

function setSyncState(newState: SyncState): void {
  syncState = newState
  const info = getSyncInfo()
  listeners.forEach((cb) => {
    try { cb(newState, info) } catch { /* ignore */ }
  })
}

/** Helper: fetch with timeout to prevent hanging on unreachable hub.
 *  Automatically includes SYNC_SECRET Authorization header. */
function syncFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (syncSecret && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${syncSecret}`)
  }
  return fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

async function runFullSync(): Promise<void> {
  if (!hubUrl || syncState === 'syncing') return

  if (!navigator.onLine) {
    setSyncState('offline')
    return
  }

  setSyncState('syncing')

  try {
    const syncStart = Date.now()

    // 1. Push inventory deltas first (race-condition safe)
    await pushDeltasToHub()

    // 2. Push local changes to hub
    await pushToHub()

    // 3. Pull hub changes (with recursion guard)
    await pullFromHub(0)

    const syncDuration = Date.now() - syncStart
    lastSyncAt = new Date().toISOString()
    errorCount = 0
    lastError = null

    // Log latency metric
    try {
      await logHealthMetric('sync_cycle', syncDuration, `full_sync_completed`)
    } catch { /* ignore */ }

    // If WebSocket is not connected, state goes back to idle
    // Type assertion: async code (WebSocket handlers) may have changed syncState
    if ((syncState as string) === 'syncing') {
      setSyncState(wsConnection?.readyState === WebSocket.OPEN ? 'ws_connected' : 'idle')
    }
  } catch (err) {
    errorCount++
    lastError = err instanceof Error ? err.message : String(err)
    if (wsConnection?.readyState !== WebSocket.OPEN) {
      setSyncState('error')
    }
    console.error('[sync] Sync failed:', lastError)
  }
}

// ---- PUSH: Send local changes to hub ----

async function pushToHub(): Promise<void> {
  const pending = await getPendingSyncs()
  pendingCount = pending.length

  if (pending.length === 0) return

  const toPush = pending.filter((e) => PUSH_TABLES.includes(e.table_name))
  if (toPush.length === 0) return

  const records = toPush.map((e) => ({
    table_name: e.table_name,
    record_id: e.record_id,
    operation: e.operation,
    data: JSON.parse(e.data),
  }))

  const res = await syncFetch(`${hubUrl}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, workstation_id: deviceId }),
  })

  if (!res.ok) {
    throw new Error(`Push failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const result: PushResponse = await res.json()

  if (result.applied > 0) {
    const appliedIds = toPush.slice(0, result.applied).map((e) => e.id)
    await markSynced(appliedIds)
  }

  if (result.failed > 0) {
    console.warn(`[sync] ${result.failed} push failures:`, result.errors)
  }

  // If push included data changes, notify via WS
  if (result.pushed_tables?.length && wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'pull_ack',
      data: { tables: result.pushed_tables },
    }))
  }
}

// ---- PULL: Get hub changes (with recursion guard) ----

async function pullFromHub(depth: number = 0): Promise<void> {
  for (const table of PULL_TABLES) {
    const since = await getCheckpoint(deviceId, table)

    const res = await syncFetch(`${hubUrl}/api/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_name: table,
        since: since || '1970-01-01T00:00:00Z',
        workstation_id: deviceId,
      }),
    })

    if (!res.ok) {
      console.warn(`[sync] Pull failed for ${table}: ${res.status}`)
      continue
    }

    const result: PullResponse = await res.json()

    if (result.records.length > 0) {
      await applyPulledRecords(table, result.records)
    }

    if (result.server_timestamp) {
      await setCheckpoint(deviceId, table, result.server_timestamp)
    }

    if (result.has_more && depth < MAX_PULL_RECURSION_DEPTH) {
      await pullFromHub(depth + 1)
      return
    } else if (result.has_more) {
    console.warn(`[sync] Pull recursion depth exceeded (${MAX_PULL_RECURSION_DEPTH}) for ${table}`)
    }
  }
}

async function applyPulledRecords(
  tableName: string,
  records: Record<string, unknown>[],
): Promise<void> {
  const { dbExecute, dbQuery } = await import('./desktop/tauri-bridge')

  for (const record of records) {
    const id = record.id as string
    if (!id) continue

    const keys = Object.keys(record)
    const values = Object.values(record).map((v) => (v === null ? 'NULL' : String(v)))
    const sets = keys.filter((k) => k !== 'id').map((k) => `"${k}" = ?`).join(', ')
    const setValues = values.filter((_, i) => keys[i] !== 'id')

    const updateSql = `UPDATE "${tableName}" SET ${sets} WHERE id = ?`
    setValues.push(id as string)

    try {
      const result = await dbExecute(updateSql, setValues)
      if (result.affected === 0) {
        const placeholders = keys.map(() => '?').join(', ')
        const colNames = keys.map((k) => `"${k}"`).join(', ')
        const insertSql = `INSERT OR IGNORE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`
        await dbExecute(insertSql, values, tableName, 'INSERT', id, JSON.stringify(record))
      }
    } catch (err) {
      console.error(`[sync] Failed to apply ${tableName} ${id}:`, err)
      try {
        const existing = await dbQuery(`SELECT * FROM "${tableName}" WHERE id = ?`, [id])
        if (existing.length > 0) {
          // Cap conflict list to prevent unbounded memory growth
          if (conflicts.length >= MAX_CONFLICTS) {
            conflicts = conflicts.filter((c) => !c.resolved).slice(-MAX_CONFLICTS / 2)
          }
          const newConflict: SyncConflict = {
            id: crypto.randomUUID(),
            tableName,
            recordId: id,
            operation: 'UPDATE',
            localData: existing[0],
            hubData: record,
            detectedAt: new Date().toISOString(),
            resolved: false,
          }
          conflicts.push(newConflict)
          console.warn(`[sync] Conflict detected: ${tableName} ${id}`)
        }
      } catch { /* can't read local */ }
    }
  }
}

// ===================================================================
// Delta-based Inventory Sync
// ===================================================================

/** Queue an inventory delta for sync. Persists to OfflineQueue. */
export function queueInventoryDelta(
  batchId: string,
  productId: string,
  delta: number,
  transactionId: string,
  reason: string = 'sale',
): void {
  if (!isDesktop()) return

  const deltaItem: PendingDelta = {
    batchId, productId, delta, transactionId, reason,
    createdAt: new Date().toISOString(),
  }

  pendingDeltas.push(deltaItem)

  // Persist to offline queue (survives app restarts)
  offlineQueuePush('delta', 'Inventory', batchId, JSON.stringify(deltaItem)).catch((err) => {
    console.error('[sync] Failed to persist delta to offline queue:', err)
  })

  // Keep the in-memory queue bounded
  if (pendingDeltas.length > 1000) {
    console.warn('[sync] Delta queue exceeded 1000, dropping oldest')
    pendingDeltas = pendingDeltas.slice(-500)
  }
}

/** Push inventory deltas to the hub (race-condition safe). */
async function pushDeltasToHub(): Promise<void> {
  if (pendingDeltas.length === 0) return

  const deltasToSend = [...pendingDeltas]
  pendingDeltas = []

  try {
    const res = await syncFetch(`${hubUrl}/api/sync/push-delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workstation_id: deviceId, deltas: deltasToSend }),
    })

    if (!res.ok) {
      // Restore deltas to the front of the queue
      pendingDeltas = [...deltasToSend, ...pendingDeltas]
      throw new Error(`Delta push failed: ${res.status} ${await res.text().catch(() => '')}`)
    }

    const result = await res.json()

    if (result.flagged?.length > 0) {
      console.warn(`[sync] ${result.flagged.length} inventory flags:`, result.flagged)
    }

    if (result.errors?.length > 0) {
      console.warn(`[sync] ${result.errors.length} delta errors:`, result.errors)
    }

    console.log(`[sync] Pushed ${result.applied} inventory deltas`)

    // Broadcast delta via WebSocket if connected
    if (wsConnection?.readyState === WebSocket.OPEN) {
      for (const d of deltasToSend) {
        wsConnection.send(JSON.stringify({
          type: 'delta_broadcast',
          data: {
            product_id: d.productId,
            batch_id: d.batchId,
            delta: d.delta,
            workstation_id: deviceId,
            reason: d.reason,
          },
        }))
      }
    }
  } catch (err) {
    // If it was a timeout/abort, deltas are already restored above
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Delta push timed out after ${FETCH_TIMEOUT_MS}ms`)
    }
    throw err
  }
}

/** Get the count of pending inventory deltas. */
export function getPendingDeltaCount(): number {
  return pendingDeltas.length
}

// ===================================================================
// Offline Queue Persistence
// ===================================================================

/** Restore pending deltas from the SQLite offline queue on startup. */
async function restoreOfflineQueue(): Promise<void> {
  try {
    const items = await offlineQueueGetPending()
    const restoredDeltaIds = new Set<string>()
    let restored = 0
    for (const item of items) {
      if (item.type === 'delta') {
        try {
          const delta = JSON.parse(item.payload) as PendingDelta
          pendingDeltas.push(delta)
          restoredDeltaIds.add(item.id)
          restored++
        } catch { /* skip malformed */ }
      }
    }
    if (restored > 0) {
      console.log(`[sync] Restored ${restored} pending deltas from offline queue`)
    }

    // Mark restored delta items as completed in the queue since they're
    // now in the in-memory pendingDeltas array. This prevents duplicate
    // processing by drainOfflineQueue.
    if (restoredDeltaIds.size > 0) {
      await offlineQueueComplete([...restoredDeltaIds])
    }

    // Refresh queue stats
    await refreshQueueStats()
  } catch (err) {
    console.error('[sync] Failed to restore offline queue:', err)
  }
}

/** Drain the offline queue — retry pending items. */
async function drainOfflineQueue(): Promise<void> {
  if (!hubUrl || !navigator.onLine) return

  try {
    const items = await offlineQueueGetPending()
    if (items.length === 0) {
      await refreshQueueStats()
      return
    }

    const completedIds: string[] = []
    for (const item of items) {
      try {
        if (item.type === 'delta') {
          const delta = JSON.parse(item.payload)
          const res = await syncFetch(`${hubUrl}/api/sync/push-delta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workstation_id: deviceId, deltas: [delta] }),
          })
          if (res.ok) {
            completedIds.push(item.id)
          } else {
            await offlineQueueFail(item.id)
          }
        } else if (item.type === 'push_record') {
          const record = JSON.parse(item.payload)
          const res = await syncFetch(`${hubUrl}/api/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: [record], workstation_id: deviceId }),
          })
          if (res.ok) {
            completedIds.push(item.id)
          } else {
            await offlineQueueFail(item.id)
          }
        }
      } catch {
        await offlineQueueFail(item.id)
      }
    }

    if (completedIds.length > 0) {
      await offlineQueueComplete(completedIds)
      console.log(`[sync] Drained ${completedIds.length} items from offline queue`)
    }

    await refreshQueueStats()
  } catch (err) {
    console.error('[sync] Offline queue drain error:', err)
  }
}

// ===================================================================
// WebSocket Real-time Sync (with exponential backoff)
// ===================================================================

/** Calculate reconnect delay with exponential backoff. */
function getWsReconnectDelay(): number {
  const delay = Math.min(
    WS_BASE_RECONNECT_DELAY_MS * Math.pow(2, wsReconnectAttempt),
    WS_MAX_RECONNECT_DELAY_MS,
  )
  return delay
}

/** Connect to the hub's WebSocket endpoint for real-time sync notifications. */
function connectWebSocket(): void {
  if (!hubUrl) return

  // Convert http(s) to ws(s) and append auth token
  const wsUrl = hubUrl.replace(/^http/, 'ws') + '/ws/sync' + (syncSecret ? `?token=${encodeURIComponent(syncSecret)}` : '')

  console.log(`[sync] Connecting WebSocket to ${wsUrl} (attempt ${wsReconnectAttempt + 1})`)

  try {
    wsConnection = new WebSocket(wsUrl)

    wsConnection.onopen = () => {
      console.log('[sync] WebSocket connected')
      wsConnectedAt = new Date().toISOString()
      wsReconnectAttempt = 0 // Reset backoff on successful connect

      // Identify ourselves to the hub
      wsConnection!.send(JSON.stringify({
        type: 'identify',
        data: { workstation_id: deviceId },
      }))

      // Send periodic pings
      wsPingTimer = setInterval(() => {
        if (wsConnection?.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({ type: 'ping' }))
        }
      }, WS_PING_INTERVAL_MS)

      if (syncState !== 'syncing') {
        setSyncState('ws_connected')
      }
    }

    wsConnection.onmessage = (event) => {
      try {
        const wsEvent: WsEvent = JSON.parse(event.data)
        handleWsEvent(wsEvent)
      } catch {
        // Non-JSON message, ignore
      }
    }

    wsConnection.onclose = () => {
      console.log('[sync] WebSocket disconnected')
      wsConnectedAt = null
      if (wsPingTimer) { clearInterval(wsPingTimer); wsPingTimer = null }

      if (syncState === 'ws_connected') {
        setSyncState('idle')
      }

      // Auto-reconnect with exponential backoff
      if (hubUrl && navigator.onLine) {
        const delay = getWsReconnectDelay()
        wsReconnectAttempt++
        console.log(`[sync] WS reconnect in ${delay}ms (attempt ${wsReconnectAttempt})`)
        wsReconnectTimer = setTimeout(() => connectWebSocket(), delay)
      }
    }

    wsConnection.onerror = () => {
      console.warn('[sync] WebSocket error')
    }
  } catch (err) {
    console.error('[sync] WebSocket creation failed:', err)
    // Retry connection later with backoff
    const delay = getWsReconnectDelay()
    wsReconnectAttempt++
    wsReconnectTimer = setTimeout(() => connectWebSocket(), delay)
  }
}

/** Disconnect the WebSocket. */
function disconnectWebSocket(): void {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null }
  if (wsPingTimer) { clearInterval(wsPingTimer); wsPingTimer = null }
  if (wsConnection) {
    wsConnection.onclose = null // prevent auto-reconnect
    wsConnection.close()
    wsConnection = null
  }
  wsConnectedAt = null
}

/** Handle an incoming WebSocket event from the hub. */
function handleWsEvent(event: WsEvent): void {
  switch (event.type) {
    case 'welcome':
      console.log('[sync] WS welcome:', event.data)
      break

    case 'data_available': {
      // Hub has new data — trigger an immediate pull
      const tables = (event.data?.tables as string[]) || []
      console.log(`[sync] WS: Data available for ${tables.join(', ')} — pulling now`)
      if (hubUrl && navigator.onLine) {
        pullFromHub(0).catch((err) => console.error('[sync] WS-triggered pull failed:', err))
      }
      break
    }

    case 'inventory_update': {
      // Another terminal updated inventory — refresh our local view
      console.log('[sync] WS: Inventory update from', event.data?.source_workstation)
      if (hubUrl && navigator.onLine) {
        getCheckpoint(deviceId, 'Inventory').then((since) => {
          syncFetch(`${hubUrl}/api/sync/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table_name: 'Inventory',
              since: since || '1970-01-01T00:00:00Z',
              workstation_id: deviceId,
            }),
          }).then((res) => res.json()).then((result: PullResponse) => {
            if (result.records.length > 0) {
              applyPulledRecords('Inventory', result.records)
            }
            if (result.server_timestamp) {
              setCheckpoint(deviceId, 'Inventory', result.server_timestamp)
            }
          }).catch(() => { /* ignore */ })
        })
      }
      break
    }

    case 'terminal_connected':
      console.log('[sync] WS: Terminal connected:', event.data?.workstation_id)
      break

    case 'terminal_disconnected':
      console.log('[sync] WS: Terminal disconnected:', event.data?.workstation_id)
      break

    case 'pong':
      // Heartbeat response — connection is alive
      break

    default:
      break
  }
}
