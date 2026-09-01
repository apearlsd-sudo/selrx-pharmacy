/**
 * src/lib/desktop/tauri-types.ts
 *
 * Type definitions for Tauri IPC commands.
 * These mirror the #[tauri::command] functions in src-tauri/src/lib.rs.
 */

export interface TauriInvoke {
  <T>(cmd: string, args?: Record<string, unknown>): Promise<T>
}

export interface BatchStmt {
  sql: string
  params: string[]
}

export interface SyncLogEntry {
  id: string
  table_name: string
  record_id: string
  operation: string
  data: string
  created_at: string
  synced: number
}

export interface PullResponse {
  records: Record<string, unknown>[]
  server_timestamp: string
  has_more: boolean
}

export interface PushResponse {
  applied: number
  applied_ids?: string[]
  failed: number
  errors: string[]
  pushed_tables?: string[]
}

export interface SyncStatus {
  status: string
  port: number
  device_id: string
  db_path: string
  tunnel_url: string | null
  role: 'hub' | 'terminal'
}

export interface DeviceRole {
  Terminal: 'Terminal'
  Hub: 'Hub'
}

// ===================================================================
// Tunnel types (Cloudflare Tunnel)
// ===================================================================

export interface TunnelStatus {
  running: boolean
  url: string | null
  uptime_secs: number
  cloudflared_installed: boolean
}

// ===================================================================
// Offline Queue types
// ===================================================================

export interface OfflineQueueItem {
  id: string
  type: 'delta' | 'push_record' | 'push_batch'
  tableName: string
  recordId: string
  payload: string
  attemptCount: number
  maxAttempts: number
  lastAttemptAt: string | null
  nextAttemptAt: string
  createdAt: string
  status: 'pending' | 'in_progress' | 'failed' | 'completed'
}

export interface OfflineQueueStats {
  total: number
  pending: number
  in_progress: number
  failed: number
  completed: number
  oldest_pending: string
  newest: string
}

// ===================================================================
// Sync Health types
// ===================================================================

export interface HealthMetric {
  id: string
  metricType: string
  value: number
  details: string
  createdAt: string
}

export interface HealthSummaryEntry {
  metricType: string
  count: number
  avg_value: number
  min_value: number
  max_value: number
  last_recorded: string
}

// ===================================================================
// mDNS Discovery types
// ===================================================================

export interface DiscoveredHub {
  ip: string
  port: number
  url: string
  device_id: string
  discovery_method: string
  discovered_at: string
}

// ===================================================================
// WebSocket event types
// ===================================================================

export type WsEventType =
  | 'data_available'
  | 'pull_ack'
  | 'delta_broadcast'
  | 'inventory_update'
  | 'welcome'
  | 'ping'
  | 'pong'
  | 'identify'
  | 'terminal_connected'
  | 'terminal_disconnected'
  | 'health_report'

export interface WsEvent {
  type: WsEventType
  data?: Record<string, unknown>
}

// ===================================================================
// System Status (enhanced)
// ===================================================================

export interface SystemStatus {
  device_id: string
  db_path: string
  app_dir: string
  role: 'hub' | 'terminal'
  hub_url: string | null
  sync_port: number
  pending_syncs: number
  tunnel: TunnelStatus
  offline_queue: OfflineQueueStats
  health_summary: HealthSummaryEntry[]
  local_ips: string[]
}

// ===================================================================
// Health Dashboard types
// ===================================================================

export interface HealthDashboard {
  hub_device_id: string
  uptime_secs: number
  connected_terminals: number
  terminals: Array<{
    workstation_id: string
    first_seen: string
    last_sync: string
    tables_synced: number
  }>
  terminal_latency: Record<string, number>
  health_summary: HealthSummaryEntry[]
  recent_metrics: HealthMetric[]
  offline_queue: OfflineQueueStats
  pending_syncs: number
  recent_deltas: HealthMetric[]
  server_time: string
}