/**
 * src/lib/desktop/tauri-bridge.ts
 *
 * Lazy-loaded Tauri API bridge. On the web, this module never imports
 * @tauri-apps/api (keeping the web bundle clean). On desktop, it
 * dynamically imports the Tauri invoke function and caches it.
 */

import type { TauriInvoke, BatchStmt, SyncLogEntry, PullResponse, PushResponse, SyncStatus } from './tauri-types'

let _invoke: TauriInvoke | null = null
let _loadPromise: Promise<TauriInvoke> | null = null

/**
 * Lazily load the Tauri `invoke` function.
 * Only called when isDesktop() is true.
 */
async function loadInvoke(): Promise<TauriInvoke> {
  if (_invoke) return _invoke
  if (_loadPromise) return _loadPromise

  _loadPromise = import('@tauri-apps/api/core').then((mod) => {
    _invoke = mod.invoke as TauriInvoke
    return _invoke!
  })

  return _loadPromise
}

// ===================================================================
// Database Commands
// ===================================================================

/** Execute a SELECT query on local SQLite. Returns JSON array of objects. */
export async function dbQuery(sql: string, params: string[] = []): Promise<Record<string, unknown>[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('db_query', { sql, params })
  return JSON.parse(result)
}

/** Execute INSERT/UPDATE/DELETE on local SQLite. Returns { affected: number }. */
export async function dbExecute(
  sql: string,
  params: string[] = [],
  tableName: string = '',
  operation: string = '',
  recordId: string = '',
  recordData: string = '{}',
): Promise<{ affected: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('db_execute', {
    sql,
    params,
    tableName,
    operation,
    recordId,
    recordData,
  })
  return JSON.parse(result)
}

/** Execute multiple statements in a single transaction. */
export async function dbBatch(statements: BatchStmt[]): Promise<{ affected: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('db_batch', { statements })
  return JSON.parse(result)
}

// ===================================================================
// Sync Commands
// ===================================================================

/** Get all unsynced SyncLog entries. */
export async function getPendingSyncs(): Promise<SyncLogEntry[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_pending_syncs')
  return JSON.parse(result)
}

/** Mark sync entries as uploaded to hub. */
export async function markSynced(ids: string[]): Promise<{ marked: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('mark_synced', { ids })
  return JSON.parse(result)
}

/** Get the last sync checkpoint for a table. */
export async function getCheckpoint(workstationId: string, tableName: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_checkpoint', { workstationId, tableName })
}

/** Update a sync checkpoint. */
export async function setCheckpoint(workstationId: string, tableName: string, timestamp: string): Promise<void> {
  const invoke = await loadInvoke()
  await invoke('set_checkpoint', { workstationId, tableName, timestamp })
}

/** Get the unique device ID. */
export async function getDeviceId(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_device_id')
}

/** Get the local database file path. */
export async function getDbPath(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_db_path')
}

/** Get the current device role (Terminal or Hub). */
export async function getDeviceRole(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_device_role')
}

/** Set the device role. */
export async function setDeviceRole(role: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('set_device_role', { role })
}

/** Get the configured hub URL (for terminals). */
export async function getHubUrl(): Promise<string | null> {
  const invoke = await loadInvoke()
  return invoke<string | null>('get_hub_url')
}
