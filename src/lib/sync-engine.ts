/**
 * src/lib/sync-engine.ts
 *
 * Client-side sync engine for Tauri desktop mode.
 * Handles pushing local changes to the hub and pulling hub changes.
 *
 * This module is a NO-OP on web — all sync functions return immediately.
 */

import { isDesktop } from './platform'
import type { SyncLogEntry, PullResponse, PushResponse } from './desktop/tauri-types'
import {
  getPendingSyncs,
  markSynced,
  getCheckpoint,
  setCheckpoint,
  getDeviceId,
} from './desktop/tauri-bridge'

// ===================================================================
// Configuration
// ===================================================================

const SYNC_INTERVAL_MS = 10_000 // 10 seconds
const PULL_BATCH_SIZE = 500

// Tables to sync (master data from hub → terminal)
const PULL_TABLES = [
  'Product',
  'Inventory',
  'Batch',
  'Customer',
  'Category',
  'Manufacturer',
  'Vendor',
  'DosageForm',
  'User',
  'SystemRole',
  'Workstation',
  'Company',
]

// Tables that terminals push to the hub
const PUSH_TABLES = [
  'Transaction',
  'TransactionItem',
  'Return',
  'Prescription',
  'AuditLog',
  'ProductHistory',
  'StockTake',
  'StockTakeItem',
  'HardwareLog',
]

// Tables that use delta-based sync (quantity changes)
const DELTA_TABLES = ['Inventory']

// Local queue for inventory deltas (before push)
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

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline'

let syncState: SyncState = 'idle'
let hubUrl: string = ''
let syncTimer: ReturnType<typeof setInterval> | null = null
let lastSyncAt: string | null = null
let pendingCount = 0
let errorCount = 0
let lastError: string | null = null
let deviceId: string = ''
let conflicts: SyncConflict[] = []

// Listener callbacks
const listeners = new Set<(state: SyncState, info: SyncInfo) => void>()

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
}

// ===================================================================
// Public API
// ===================================================================

/** Start the periodic sync loop. No-op on web. */
export async function startSync(url?: string): Promise<void> {
  if (!isDesktop()) return

  if (url) hubUrl = url

  // Load persisted hub URL from Tauri if not provided
  if (!hubUrl) {
    try {
      const { getHubUrl } = await import('./desktop/tauri-bridge')
      const stored = await getHubUrl()
      if (stored) hubUrl = stored
    } catch {
      // First run — no URL stored yet
    }
  }

  // Get device ID
  try {
    deviceId = await getDeviceId()
  } catch {
    deviceId = 'unknown'
  }

  if (!hubUrl) {
    setSyncState('idle')
    console.warn('[sync] No hub URL configured. Sync is paused.')
    return
  }

  console.log(`[sync] Starting sync loop to ${hubUrl}`)

  // Run an immediate sync
  await runFullSync()

  // Then run periodically
  syncTimer = setInterval(() => runFullSync(), SYNC_INTERVAL_MS)
}

/** Stop the sync loop. */
export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
  setSyncState('idle')
}

/** Configure the hub URL (called from settings UI). */
export function setHubUrl(url: string): void {
  hubUrl = url
  if (syncTimer) {
    stopSync()
    startSync(url)
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
  resolution: 'keep_local' | 'keep_hub'
): Promise<void> {
  const conflict = conflicts.find((c) => c.id === conflictId)
  if (!conflict) return

  if (isDesktop()) {
    const { dbExecute } = await import('./desktop/tauri-bridge')
    const data = resolution === 'keep_hub' ? conflict.hubData : conflict.localData
    const keys = Object.keys(data).filter((k) => k !== 'id')
    const values = Object.values(data).filter((_, i) => !['id'].includes(Object.keys(data)[i])).map((v) => (v === null ? 'NULL' : String(v)))
    const sets = keys.map((k) => `"${k}" = ?`).join(', ')
    values.push(conflict.recordId)
    await dbExecute(`UPDATE "${conflict.tableName}" SET ${sets} WHERE id = ?`, values)
  }

  conflict.resolved = true
  conflict.resolution = resolution
  setSyncState(syncState) // trigger UI update
}

/** Subscribe to sync state changes. */
export function onSyncStateChange(
  callback: (state: SyncState, info: SyncInfo) => void
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
// Internal Implementation
// ===================================================================

function setSyncState(newState: SyncState): void {
  syncState = newState
  const info = getSyncInfo()
  listeners.forEach((cb) => {
    try { cb(newState, info) } catch { /* ignore listener errors */ }
  })
}

async function runFullSync(): Promise<void> {
  if (!hubUrl || syncState === 'syncing') return

  // Check network connectivity
  if (!navigator.onLine) {
    setSyncState('offline')
    return
  }

  setSyncState('syncing')

  try {
    // 1. Push inventory deltas first (race-condition safe)
    await pushDeltasToHub()

    // 2. Push local changes to hub
    await pushToHub()

    // 3. Pull hub changes
    await pullFromHub()

    lastSyncAt = new Date().toISOString()
    errorCount = 0
    lastError = null
    setSyncState('idle')
  } catch (err) {
    errorCount++
    lastError = err instanceof Error ? err.message : String(err)
    setSyncState('error')
    console.error('[sync] Sync failed:', lastError)
  }
}

// ---- PUSH: Send local changes to hub ----

async function pushToHub(): Promise<void> {
  const pending = await getPendingSyncs()
  pendingCount = pending.length

  if (pending.length === 0) return

  // Filter to only push tables that terminals own
  const toPush = pending.filter((e) =>
    PUSH_TABLES.includes(e.table_name)
  )

  if (toPush.length === 0) return

  const records = toPush.map((e) => ({
    table_name: e.table_name,
    record_id: e.record_id,
    operation: e.operation,
    data: JSON.parse(e.data),
  }))

  const res = await fetch(`${hubUrl}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, workstation_id: deviceId }),
  })

  if (!res.ok) {
    throw new Error(`Push failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const result: PushResponse = await res.json()

  if (result.applied > 0) {
    // Mark the applied entries as synced
    const appliedIds = toPush
      .slice(0, result.applied)
      .map((e) => e.id)
    await markSynced(appliedIds)
  }

  if (result.failed > 0) {
    console.warn(`[sync] ${result.failed} push failures:`, result.errors)
  }
}

// ---- PULL: Get hub changes ----

async function pullFromHub(): Promise<void> {
  for (const table of PULL_TABLES) {
    const since = await getCheckpoint(deviceId, table)

    const url = `${hubUrl}/api/sync/pull`
    const res = await fetch(url, {
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
      // Apply records locally
      await applyPulledRecords(table, result.records)
    }

    if (result.server_timestamp) {
      await setCheckpoint(deviceId, table, result.server_timestamp)
    }

    if (result.has_more) {
      // Recursive pull for large changesets
      await pullFromHub()
      return
    }
  }
}

async function applyPulledRecords(
  tableName: string,
  records: Record<string, unknown>[]
): Promise<void> {
  const { dbExecute } = await import('./desktop/tauri-bridge')

  for (const record of records) {
    const id = record.id as string
    if (!id) continue

    const keys = Object.keys(record)
    const values = Object.values(record).map((v) =>
      v === null ? 'NULL' : String(v)
    )
    const sets = keys
      .filter((k) => k !== 'id')
      .map((k) => `"${k}" = ?`)
      .join(', ')
    const setValues = values.filter((_, i) => keys[i] !== 'id')

    // Try UPDATE first (record might already exist locally)
    const updateSql = `UPDATE "${tableName}" SET ${sets} WHERE id = ?`
    setValues.push(id as string)

    try {
      const result = await dbExecute(updateSql, setValues)
      if (result.affected === 0) {
        // Record doesn't exist — INSERT it
        const placeholders = keys.map(() => '?').join(', ')
        const colNames = keys.map((k) => `"${k}"`).join(', ')
        const insertSql = `INSERT OR IGNORE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`
        await dbExecute(insertSql, values, tableName, 'INSERT', id, JSON.stringify(record))
      } else if (result.affected > 0) {
        // Record was updated — check if there was a local modification
        // that could be a conflict (local changed data since last pull)
        const updatedAt = record.updatedAt as string | undefined
        if (updatedAt) {
          // Hub wins for master data — no conflict for pull
          // Conflicts are tracked for user awareness only on manual review
        }
      }
    } catch (err) {
      console.error(`[sync] Failed to apply ${tableName} ${id}:`, err)
      // Record as a conflict
      const { dbQuery } = await import('./desktop/tauri-bridge')
      try {
        const existing = await dbQuery(`SELECT * FROM "${tableName}" WHERE id = ?`, [id])
        if (existing.length > 0) {
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
      } catch {
 // Can't read local — just log the error
      }
    }
  }
}

// ===================================================================
// Delta-based Inventory Sync
// ===================================================================

/** Queue an inventory delta for sync. Call this when selling/restocking items. */
export function queueInventoryDelta(
  batchId: string,
  productId: string,
  delta: number,
  transactionId: string,
  reason: string = 'sale'
): void {
  if (!isDesktop()) return

  pendingDeltas.push({
    batchId,
    productId,
    delta,
    transactionId,
    reason,
    createdAt: new Date().toISOString(),
  })

  // Keep the queue from growing unbounded (max 1000 pending)
  if (pendingDeltas.length > 1000) {
    console.warn('[sync] Delta queue exceeded 1000, dropping oldest entries')
    pendingDeltas = pendingDeltas.slice(-500)
  }
}

/** Push inventory deltas to the hub (race-condition safe). */
async function pushDeltasToHub(): Promise<void> {
  if (pendingDeltas.length === 0) return

  const deltasToSend = [...pendingDeltas]
  pendingDeltas = []

  const res = await fetch(`${hubUrl}/api/sync/push-delta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workstation_id: deviceId,
      deltas: deltasToSend,
    }),
  })

  if (!res.ok) {
    // Re-queue the deltas on failure
    pendingDeltas = [...deltasToSend, ...pendingDeltas]
    throw new Error(`Delta push failed: ${res.status} ${await res.text().catch(() => '')}`)
  }

  const result = await res.json()

  if (result.flagged?.length > 0) {
    console.warn(`[sync] ${result.flagged.length} inventory flags:`, result.flagged)
    // Could show these in the UI as warnings
  }

  if (result.errors?.length > 0) {
    console.warn(`[sync] ${result.errors.length} delta errors:`, result.errors)
  }

  console.log(`[sync] Pushed ${result.applied} inventory deltas`)
}

/** Get the count of pending inventory deltas. */
export function getPendingDeltaCount(): number {
  return pendingDeltas.length
}