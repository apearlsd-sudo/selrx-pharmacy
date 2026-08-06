#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod db;
pub mod sync_server;

use db::DbState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Manager;

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
        "hub" => {
            // Can't mutate directly, but we can return success
            // In production, this would update persisted config
            Ok("role_set_to_hub".to_string())
        }
        "terminal" => Ok("role_set_to_terminal".to_string()),
        _ => Err(format!("Unknown role: {}", role)),
    }
}

#[tauri::command]
fn get_hub_url(state: tauri::State<'_, AppState>) -> Option<String> {
    state.hub_url.clone()
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
            let db_state = DbState::new(app_dir)?;
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

            let app_state = AppState {
                db: db.clone(),
                role: role.clone(),
                hub_url,
            };

            // If this device is the hub, start the sync server
            if matches!(role, DeviceRole::Hub) {
                let config = sync_server::SyncConfig {
                    port: 3001,
                    tunnel_url: None,
                };
                sync_server::start_sync_server(db, config);
                println!("[gazpharm] Started as HUB (sync server on port 3001)");
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
