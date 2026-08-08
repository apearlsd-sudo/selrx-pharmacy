/**
 * src/lib/desktop/tauri-bridge.ts
 *
 * Lazy-loaded Tauri API bridge. On the web, this module never imports
 * @tauri-apps/api (keeping the web bundle clean). On desktop, it
 * dynamically imports the Tauri invoke function and caches it.
 */

import type {
  TauriInvoke,
  BatchStmt,
  SyncLogEntry,
  OfflineQueueItem,
  OfflineQueueStats,
  HealthMetric,
  HealthSummaryEntry,
  DiscoveredHub,
  TunnelStatus,
  SystemStatus,
  HealthDashboard,
} from './tauri-types'

let _invoke: TauriInvoke | null = null
let _loadPromise: Promise<TauriInvoke> | null = null

async function loadInvoke(): Promise<TauriInvoke> {
  if (_invoke) return _invoke
  if (_loadPromise) return _loadPromise

  _loadPromise = import('@tauri-apps/api/core')
    .then((mod) => {
      _invoke = mod.invoke as TauriInvoke
      return _invoke!
    })
    .catch(() => {
      throw new Error(
        '[Tauri Bridge] @tauri-apps/api is only available in the Tauri desktop app. '
        + 'Call isDesktop() before using any bridge function.'
      )
    })

  return _loadPromise
}

// ===================================================================
// Database Commands
// ===================================================================

export async function dbQuery(sql: string, params: string[] = []): Promise<Record<string, unknown>[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('db_query', { sql, params })
  return JSON.parse(result)
}

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
    sql, params, tableName, operation, recordId, recordData,
  })
  return JSON.parse(result)
}

export async function dbBatch(statements: BatchStmt[]): Promise<{ affected: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('db_batch', { statements })
  return JSON.parse(result)
}

// ===================================================================
// Sync Commands
// ===================================================================

export async function getPendingSyncs(): Promise<SyncLogEntry[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_pending_syncs')
  return JSON.parse(result)
}

export async function markSynced(ids: string[]): Promise<{ marked: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('mark_synced', { ids })
  return JSON.parse(result)
}

export async function getCheckpoint(workstationId: string, tableName: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_checkpoint', { workstationId, tableName })
}

export async function setCheckpoint(workstationId: string, tableName: string, timestamp: string): Promise<void> {
  const invoke = await loadInvoke()
  await invoke('set_checkpoint', { workstationId, tableName, timestamp })
}

export async function getDeviceId(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_device_id')
}

export async function getDbPath(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_db_path')
}

export async function getDeviceRole(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('get_device_role')
}

export async function setDeviceRole(role: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('set_device_role', { role })
}

export async function getHubUrl(): Promise<string | null> {
  const invoke = await loadInvoke()
  return invoke<string | null>('get_hub_url')
}

export async function setHubUrl(url: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('set_hub_url_persist', { url })
}

// ===================================================================
// Offline Queue Commands
// ===================================================================

export async function offlineQueuePush(
  queueType: string,
  tableName: string,
  recordId: string,
  payload: string,
): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('offline_queue_push', {
    queueType, tableName, recordId, payload,
  })
}

export async function offlineQueueGetPending(): Promise<OfflineQueueItem[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('offline_queue_get_pending')
  return JSON.parse(result)
}

export async function offlineQueueComplete(ids: string[]): Promise<{ completed: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('offline_queue_complete', { ids })
  return JSON.parse(result)
}

export async function offlineQueueFail(id: string): Promise<{ attempt: number; delay_secs: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('offline_queue_fail', { id })
  return JSON.parse(result)
}

export async function offlineQueueStats(): Promise<OfflineQueueStats> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('offline_queue_stats')
  return JSON.parse(result)
}

export async function offlineQueuePurge(): Promise<{ purged: number }> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('offline_queue_purge')
  return JSON.parse(result)
}

// ===================================================================
// Sync Health Commands
// ===================================================================

export async function logHealthMetric(
  metricType: string,
  value: number,
  details: string,
): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('log_health_metric', { metricType, value, details })
}

export async function getHealthMetrics(
  metricType?: string,
  limit?: number,
): Promise<HealthMetric[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_health_metrics', { metricType: metricType ?? null, limit: limit ?? 100 })
  return JSON.parse(result)
}

export async function getHealthSummary(): Promise<HealthSummaryEntry[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_health_summary')
  return JSON.parse(result)
}

// ===================================================================
// mDNS Discovery Commands
// ===================================================================

export async function scanForHubs(timeoutSecs?: number): Promise<DiscoveredHub[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('scan_for_hubs', { timeoutSecs: timeoutSecs ?? 3 })
  return JSON.parse(result)
}

export async function getLocalIps(): Promise<string[]> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_local_ips')
  return JSON.parse(result)
}

// ===================================================================
// Tunnel Commands (Cloudflare Tunnel)
// ===================================================================

export async function startTunnel(token: string, localPort?: number): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('start_tunnel', { token, localPort })
}

export async function stopTunnel(): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('stop_tunnel')
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_tunnel_status')
  return JSON.parse(result)
}

export async function setTunnelUrl(url: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('set_tunnel_url', { url })
}

export async function saveTunnelToken(token: string): Promise<string> {
  const invoke = await loadInvoke()
  return invoke<string>('save_tunnel_token', { token })
}

export async function loadTunnelToken(): Promise<string | null> {
  const invoke = await loadInvoke()
  return invoke<string | null>('load_tunnel_token')
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const invoke = await loadInvoke()
  const result = await invoke<string>('get_system_status')
  return JSON.parse(result)
}

// ===================================================================
// Fetch Health Dashboard from hub (via HTTP)
// ===================================================================

export async function fetchHealthDashboard(hubUrl: string): Promise<HealthDashboard> {
  const res = await fetch(`${hubUrl}/api/sync/health-dashboard`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Health dashboard: ${res.status}`)
  return res.json()
}