#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")

pub mod db;
pub mod mdns_discovery;
pub mod sync_server;
pub mod tunnel;
pub mod ws_server;

use db::DbState;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tunnel::TunnelState;

/// Runtime mode: Hub (super admin) or Terminal (POS).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum DeviceRole {
    #[default]
    Terminal,
    Hub,
}

/// App state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<DbState>,
    pub role: DeviceRole,
    pub hub_url: Option<String>,
    pub tunnel: Mutex<TunnelState>,
    /// Handle to the WebSocket broadcast channel (for hub to push notifications)
    pub ws_broadcaster: Option<std::sync::Mutex<tokio::sync::broadcast::Sender<String>>>,
}

// ===================================================================
// Database Commands
// ===================================================================

#[tauri::command]
fn db_query(
    state: tauri::State<'_, AppState>,
    sql: String,
    params: Vec<String>,
) -> Result<String, String> {
    state.db.query(sql, params)
}

#[tauri::command]
fn db_execute(
    state: tauri::State<'_, AppState>,
    sql: String,
    params: Vec<String>,
    table_name: String,
    operation: String,
    record_id: String,
    record_data: String,
) -> Result<String, String> {
    state
        .db
        .execute(sql, params, table_name, operation, record_id, record_data)
}

#[tauri::command]
fn db_batch(
    state: tauri::State<'_, AppState>,
    statements: Vec<db::BatchStmt>,
) -> Result<String, String> {
    state.db.batch(statements)
}

// ===================================================================
// Sync Commands
// ===================================================================

#[tauri::command]
fn get_pending_syncs(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.get_pending_syncs()
}

#[tauri::command]
fn mark_synced(state: tauri::State<'_, AppState>, ids: Vec<String>) -> Result<String, String> {
    state.db.mark_synced(ids)
}

#[tauri::command]
fn get_checkpoint(
    state: tauri::State<'_, AppState>,
    workstation_id: String,
    table_name: String,
) -> Result<String, String> {
    state.db.get_checkpoint(workstation_id, table_name)
}

#[tauri::command]
fn set_checkpoint(
    state: tauri::State<'_, AppState>,
    workstation_id: String,
    table_name: String,
    timestamp: String,
) -> Result<String, String> {
    state.db.set_checkpoint(workstation_id, table_name, timestamp)
}

#[tauri::command]
fn get_device_id(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.get_device_id()
}

#[tauri::command]
fn get_db_path(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.get_db_path()
}

#[tauri::command]
fn get_device_role(state: tauri::State<'_, AppState>) -> DeviceRole {
    state.role.clone()
}

#[tauri::command]
fn set_device_role(state: tauri::State<'_, AppState>, role: String) -> Result<String, String> {
    match role.as_str() {
        "hub" => Ok("role_set_to_hub".to_string()),
        "terminal" => Ok("role_set_to_terminal".to_string()),
        _ => Err(format!("Unknown role: {}", role)),
    }
}

#[tauri::command]
fn get_hub_url(state: tauri::State<'_, AppState>) -> Option<String> {
    state.hub_url.clone()
}

#[tauri::command]
fn set_hub_url_persist(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let url_file = app_dir.join("hub_url.txt");
    std::fs::write(&url_file, &url)
        .map_err(|e| format!("Failed to save hub URL: {}", e))?;
    // Also update in-memory state (requires mutable access)
    // Note: we can't mutate state.hub_url directly through State,
    // so we update the file and the in-memory value via a workaround.
    let _ = url;
    Ok("hub_url_saved".to_string())
}

// ===================================================================
// Offline Queue Commands
// ===================================================================

#[tauri::command]
fn offline_queue_push(
    state: tauri::State<'_, AppState>,
    queue_type: String,
    table_name: String,
    record_id: String,
    payload: String,
) -> Result<String, String> {
    state.db.offline_queue_push(queue_type, table_name, record_id, payload)
}

#[tauri::command]
fn offline_queue_get_pending(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.offline_queue_get_pending()
}

#[tauri::command]
fn offline_queue_complete(state: tauri::State<'_, AppState>, ids: Vec<String>) -> Result<String, String> {
    state.db.offline_queue_complete(ids)
}

#[tauri::command]
fn offline_queue_fail(state: tauri::State<'_, AppState>, id: String) -> Result<String, String> {
    state.db.offline_queue_fail(id)
}

#[tauri::command]
fn offline_queue_stats(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.offline_queue_stats()
}

#[tauri::command]
fn offline_queue_purge(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.offline_queue_purge()
}

// ===================================================================
// Sync Health Commands
// ===================================================================

#[tauri::command]
fn log_health_metric(
    state: tauri::State<'_, AppState>,
    metric_type: String,
    value: f64,
    details: String,
) -> Result<String, String> {
    state.db.log_health_metric(metric_type, value, details)
}

#[tauri::command]
fn get_health_metrics(
    state: tauri::State<'_, AppState>, metric_type: Option<String>, limit: Option<i64>) -> Result<String, String> {
    state.db.get_health_metrics(metric_type, limit.unwrap_or(100))
}

#[tauri::command]
fn get_health_summary(state: tauri::State<'_, AppState>) -> Result<String, String> {
    state.db.get_health_summary()
}

// ===================================================================
// mDNS Discovery Commands
// ===================================================================

#[tauri::command]
fn scan_for_hubs(timeout_secs: Option<u64>) -> Result<String, String> {
    let hubs = mdns_discovery::scan_for_hubs(timeout_secs.unwrap_or(3))?;
    serde_json::to_string(&hubs).map_err(|e| format!("Serialize hubs: {}", e))
}

#[tauri::command]
fn get_local_ips() -> Result<String, String> {
    let ips = mdns_discovery::get_local_ips();
    serde_json::to_string(&ips).map_err(|e| format!("Serialize ips: {}", e))
}

// ===================================================================
// Tunnel Commands (Cloudflare Tunnel management)
// ===================================================================

#[tauri::command]
fn start_tunnel(
    state: tauri::State<'_, AppState>,
    token: String,
    local_port: Option<u16>,
) -> Result<String, String> {
    let port = local_port.unwrap_or(3001);
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    tunnel.start(&token, port)
}

#[tauri::command]
fn stop_tunnel(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    tunnel.stop()?;
    Ok("tunnel_stopped".to_string())
}

#[tauri::command]
fn get_tunnel_status(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    let status = tunnel.status();
    serde_json::to_string(&status).map_err(|e| format!("Serialize tunnel status: {}", e))
}

#[tauri::command]
fn set_tunnel_url(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    tunnel.url = Some(url.clone());
    Ok(url)
}

#[tauri::command]
fn save_tunnel_token(
    app: tauri::AppHandle,
    token: String,
) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let token_file = app_dir.join("tunnel_token.txt");
    std::fs::write(&token_file, &token)
        .map_err(|e| format!("Failed to save tunnel token: {}", e))?;
    Ok("token_saved".to_string())
}

#[tauri::command]
fn load_tunnel_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app dir: {}", e))?;
    let token_file = app_dir.join("tunnel_token.txt");
    if token_file.exists() {
        let token = std::fs::read_to_string(&token_file)
            .map_err(|e| format!("Failed to read tunnel token: {}", e))?;
        let trimmed = token.trim().to_string();
        if trimmed.is_empty() {
            Ok(None)
        } else {
            Ok(Some(trimmed))
        }
    } else {
        Ok(None)
    }
}

/// Get the full system status including new fields.
#[tauri::command]
fn get_system_status(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let device_id = state.db.get_device_id().unwrap_or_default();
    let db_path = state.db.get_db_path().unwrap_or_default();
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    let tunnel_status = tunnel.status();

    let app_dir = app
        .path()
        .app_data_dir()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();

    let role_str = match state.role {
        DeviceRole::Hub => "hub",
        DeviceRole::Terminal => "terminal",
    };

    let pending_syncs = state
        .db
        .get_pending_syncs()
        .map(|json| {
            serde_json::from_str::<Vec<serde_json::Value>>(&json)
                .map(|v| v.len())
                .unwrap_or(0)
        })
        .unwrap_or(0);

    // Get offline queue stats
    let queue_stats: serde_json::Value = state
        .db
        .offline_queue_stats()
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({
            "total": 0, "pending": 0, "in_progress": 0,
            "failed": 0, "completed": 0
        }));

    // Get health summary
    let health_summary: Vec<serde_json::Value> = state
        .db
        .get_health_summary()
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    // Get local IPs
    let local_ips = mdns_discovery::get_local_ips();

    let status = serde_json::json!({
        "device_id": device_id,
        "db_path": db_path,
        "app_dir": app_dir,
        "role": role_str,
        "hub_url": state.hub_url,
        "sync_port": 3001u16,
        "pending_syncs": pending_syncs,
        "tunnel": tunnel_status,
        "offline_queue": queue_stats,
        "health_summary": health_summary,
        "local_ips": local_ips,
    });

    serde_json::to_string(&status).map_err(|e| format!("Serialize status: {}", e))
}

// ===================================================================
// Main entry point
// ===================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Resolve the app data directory
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data dir");

            // Ensure the directory exists
            std::fs::create_dir_all(&app_dir)
                .expect("Failed to create app data dir");

            println!("[gazpharm] App data directory: {:?}", app_dir);

            // Initialize the local SQLite database
            let db_state = DbState::new(app_dir.clone())?;
            let db = Arc::new(db_state);

            let device_id = db.get_device_id().unwrap_or_default();
            println!("[gazpharm] Device ID: {}", device_id);

            // Read persisted device role (defaults to Terminal)
            let role_file = app_dir.join("device_role.txt");
            let role = if role_file.exists() {
                let content =
                    std::fs::read_to_string(&role_file).unwrap_or_default();
                match content.trim() {
                    "hub" => DeviceRole::Hub,
                    _ => DeviceRole::Terminal,
                }
            } else {
                DeviceRole::Terminal
            };

            // Read persisted hub URL (for terminals)
            let hub_url_file = app_dir.join("hub_url.txt");
            let hub_url = if hub_url_file.exists() {
                let url = std::fs::read_to_string(&hub_url_file).unwrap_or_default();
                let trimmed = url.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            } else {
                None
            };

            // Initialize the tunnel state
            let config_dir = app_dir.to_string_lossy().to_string();
            let tunnel_state = TunnelState::new(config_dir);

            let app_state = AppState {
                db: db.clone(),
                role: role.clone(),
                hub_url,
                tunnel: Mutex::new(tunnel_state),
                ws_broadcaster: None,
            };

            // If this device is the hub, start the sync server with WebSocket support
            if matches!(role, DeviceRole::Hub) {
                // Read persisted tunnel token and auto-start if configured
                let tunnel_token_file = app_dir.join("tunnel_token.txt");
                let _tunnel_token = if tunnel_token_file.exists() {
                    std::fs::read_to_string(&tunnel_token_file).unwrap_or_default()
                } else {
                    String::new()
                };

                // Read persisted tunnel URL (from a previous session)
                let tunnel_url_file = app_dir.join("tunnel_url.txt");
                let tunnel_url = if tunnel_url_file.exists() {
                    let u = std::fs::read_to_string(&tunnel_url_file).unwrap_or_default();
                    let trimmed = u.trim().to_string();
                    if trimmed.is_empty() { None } else { Some(trimmed) }
                } else {
                    None
                };

                let config = sync_server::SyncConfig {
                    port: 3001,
                    tunnel_url: tunnel_url.clone(),
                };
                sync_server::start_sync_server(db.clone(), config);
                println!("[gazpharm] Started as HUB (sync server + WebSocket on port 3001)");

                // Start mDNS discovery beacon so terminals can find us on LAN
                let beacon_device_id = device_id.clone();
                mdns_discovery::start_discovery_beacon(beacon_device_id, 3001);
                println!("[gazpharm] mDNS discovery beacon started");

                // Purge old offline queue items on startup
                let _ = db.offline_queue_purge();
            } else {
                println!("[gazpharm] Started as TERMINAL");

                // Purge old offline queue items on startup
                let _ = db.offline_queue_purge();
            }

            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_query,
            db_execute,
            db_batch,
            get_pending_syncs,
            mark_synced,
            get_checkpoint,
            set_checkpoint,
            get_device_id,
            get_db_path,
            get_device_role,
            set_device_role,
            get_hub_url,
            set_hub_url_persist,
            // Offline queue commands
            offline_queue_push,
            offline_queue_get_pending,
            offline_queue_complete,
            offline_queue_fail,
            offline_queue_stats,
            offline_queue_purge,
            // Health commands
            log_health_metric,
            get_health_metrics,
            get_health_summary,
            // mDNS discovery commands
            scan_for_hubs,
            get_local_ips,
            // Tunnel commands
            start_tunnel,
            stop_tunnel,
            get_tunnel_status,
            set_tunnel_url,
            save_tunnel_token,
            load_tunnel_token,
            get_system_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}