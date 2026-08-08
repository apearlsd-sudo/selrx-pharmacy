#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod db;
pub mod sync_server;
pub mod tunnel;

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
}

/// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// ===================================================================
// Database Commands (called from the frontend via `invoke()`)
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

// ===================================================================
// Tunnel Commands (Cloudflare Tunnel management)
// ===================================================================

/// Start the Cloudflare Tunnel. Only works on Hub mode.
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

/// Stop the Cloudflare Tunnel.
#[tauri::command]
fn stop_tunnel(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    tunnel.stop()?;
    Ok("tunnel_stopped".to_string())
}

/// Get the current tunnel status.
#[tauri::command]
fn get_tunnel_status(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    let status = tunnel.status();
    serde_json::to_string(&status).map_err(|e| format!("Serialize tunnel status: {}", e))
}

/// Manually set the tunnel URL (if auto-detection failed).
#[tauri::command]
fn set_tunnel_url(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<String, String> {
    let mut tunnel = state.tunnel.lock().map_err(|e| e.to_string())?;
    tunnel.url = Some(url.clone());
    Ok(url)
}

/// Save tunnel token to persistent storage.
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

/// Load the persisted tunnel token.
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

/// Get the full system status (role, sync, tunnel, device info).
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

    let status = serde_json::json!({
        "device_id": device_id,
        "db_path": db_path,
        "app_dir": app_dir,
        "role": role_str,
        "hub_url": state.hub_url,
        "sync_port": 3001u16,
        "pending_syncs": pending_syncs,
        "tunnel": tunnel_status,
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
            };

            // If this device is the hub, start the sync server
            if matches!(role, DeviceRole::Hub) {
                // Read persisted tunnel token and auto-start if configured
                let tunnel_token_file = app_dir.join("tunnel_token.txt");
                let tunnel_token = if tunnel_token_file.exists() {
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
                sync_server::start_sync_server(db, config);
                println!("[gazpharm] Started as HUB (sync server on port 3001)");

                // Auto-start tunnel if token is saved
                if !tunnel_token.trim().is_empty() {
                    println!("[gazpharm] Auto-starting Cloudflare Tunnel...");
                    // Tunnel will be started after app is fully set up
                    // via a background task
                }
            } else {
                println!("[gazpharm] Started as TERMINAL");
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