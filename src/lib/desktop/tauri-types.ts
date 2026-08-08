/**
 * src/lib/desktop/tauri-types.ts
 *
 * Type definitions for Tauri IPC commands.
 * These mirror the #[tauri::command] functions in src-tauri/src/lib.rs.
 * We define our own invoke wrapper instead of importing @tauri-apps/api
 * to keep the web bundle clean — the import is dynamically loaded only on desktop.
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
  failed: number
  errors: string[]
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

export interface SystemStatus {
  device_id: string
  db_path: string
  app_dir: string
  role: 'hub' | 'terminal'
  hub_url: string | null
  sync_port: number
  pending_syncs: number
  tunnel: TunnelStatus
}
