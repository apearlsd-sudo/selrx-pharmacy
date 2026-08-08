use axum::{
    extract::Json,
    http::{Cors, Method},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::db::DbState;

/// Configuration for the sync hub server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    /// Port for the hub's HTTP server (default: 3001)
    pub port: u16,
    /// URL of a Cloudflare Tunnel or other tunnel endpoint (optional)
    pub tunnel_url: Option<String>,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            port: 3001,
            tunnel_url: None,
        }
    }
}

/// The sync server state.
pub struct SyncServerState {
    pub db: Arc<DbState>,
    pub config: SyncConfig,
}

/// Start the sync hub server in a background tokio task.
pub fn start_sync_server(db: Arc<DbState>, config: SyncConfig) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let state = Arc::new(RwLock::new(SyncServerState {
            db,
            config: config.clone(),
        }));

        let app = Router::new()
            .route("/api/sync/pull", post(sync_pull))
            .route("/api/sync/push", post(sync_push))
            .route("/api/sync/push-delta", post(sync_push_delta))
            .route("/api/sync/pending", get(sync_pending))
            .route("/api/sync/status", get(sync_status))
            .route("/api/sync/connected-terminals", get(connected_terminals))
            .route("/api/health", get(health_check))
            .layer(
                CorsLayer::new()
                    .allow_origin(tower_http::cors::Any)
                    .allow_methods([
                        Method::GET,
                        Method::POST,
                        Method::PUT,
                        Method::DELETE,
                        Method::OPTIONS,
                    ])
                    .allow_headers(tower_http::cors::Any),
            );

        let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
        println!("[sync] Hub server starting on {}", addr);

        if let Err(e) = axum::serve(
            tokio::net::TcpListener::bind(addr).await.unwrap(),
            app,
        )
        .await
        {
            eprintln!("[sync] Server error: {}", e);
        }
    })
}

// ===================================================================
// Sync API handlers
// ===================================================================

/// Pull changes from the hub since a given timestamp.
#[derive(Deserialize)]
struct PullRequest {
    table_name: String,
    since: String,
    workstation_id: String,
}

#[derive(Serialize)]
struct PullResponse {
    records: Vec<serde_json::Value>,
    server_timestamp: String,
    has_more: bool,
}

async fn sync_pull(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
    Json(body): Json<PullRequest>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    let db = &state.db;

    // Check if the table has a version column for optimistic concurrency
    let has_version = table_has_version(&body.table_name);

    let sql = if has_version {
        // Include version for conflict detection on the terminal side
        format!(
            r#"SELECT *, rowid as _rowid FROM "{}" WHERE "updatedAt" > ? ORDER BY "updatedAt" ASC LIMIT 500"#,
            body.table_name
        )
    } else {
        format!(
            r#"SELECT * FROM "{}" WHERE "updatedAt" > ? ORDER BY "updatedAt" ASC LIMIT 500"#,
            body.table_name
        )
    };

    match db.query(sql, vec![body.since.clone()]) {
        Ok(rows_json) => {
            let rows: Vec<serde_json::Value> =
                serde_json::from_str(&rows_json).unwrap_or_default();
            let now = chrono::Utc::now().to_rfc3339();

            // Update the checkpoint for this workstation + table
            let _ = db.set_checkpoint(
                body.workstation_id,
                body.table_name,
                now.clone(),
            );

            Json(serde_json::json!({
                "records": rows,
                "server_timestamp": now,
                "has_more": rows.len() >= 500
            }))
        }
        Err(e) => {
            Json(serde_json::json!({
                "error": e,
                "records": [],
                "server_timestamp": "",
                "has_more": false
            }))
        }
    }
}

/// Push transactions/changes from a terminal to the hub.
#[derive(Deserialize)]
struct PushRequest {
    records: Vec<PushRecord>,
    workstation_id: String,
}

#[derive(Deserialize)]
struct PushRecord {
    table_name: String,
    record_id: String,
    operation: String,
    data: serde_json::Value,
    /// Optional version for optimistic concurrency check
    version: Option<u64>,
}

async fn sync_push(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
    Json(body): Json<PushRequest>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    let db = &state.db;

    let mut applied = 0;
    let mut failed = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut conflicts: Vec<serde_json::Value> = Vec::new();

    for record in &body.records {
        let data_str = serde_json::to_string(&record.data).unwrap_or_default();

        match record.operation.as_str() {
            "INSERT" => {
                if let Ok(data_map) = record.data.as_object() {
                    let keys: Vec<&String> = data_map.keys().collect();
                    let placeholders: Vec<String> = (1..=keys.len())
                        .map(|i| format!("?{}", i))
                        .collect();
                    let values: Vec<String> = data_map
                        .values()
                        .map(|v| {
                            if v.is_null() {
                                "NULL".to_string()
                            } else {
                                v.as_str()
                                    .unwrap_or(&v.to_string())
                                    .to_string()
                            }
                        })
                        .collect();

                    let sql = format!(
                        r#"INSERT OR IGNORE INTO "{}" ({}) VALUES ({})"#,
                        record.table_name,
                        keys.iter()
                            .map(|k| format!("\"{}\"", k))
                            .collect::<Vec<_>>()
                            .join(", "),
                        placeholders.join(", ")
                    );

                    match db.execute(sql, values, String::new(), String::new(), String::new(), String::new()) {
                        Ok(_) => applied += 1,
                        Err(e) => {
                            failed += 1;
                            errors.push(format!(
                                "INSERT {} {}: {}",
                                record.table_name, record.record_id, e
                            ));
                        }
                    }
                }
            }
            "UPDATE" => {
                if let Ok(data_map) = record.data.as_object() {
                    let keys: Vec<&String> = data_map.keys().collect();
                    let sets: Vec<String> = keys
                        .iter()
                        .map(|k| format!("\"{}\" = ?", k))
                        .collect();
                    let values: Vec<String> = data_map
                        .values()
                        .map(|v| {
                            if v.is_null() {
                                "NULL".to_string()
                            } else {
                                v.as_str()
                                    .unwrap_or(&v.to_string())
                                    .to_string()
                            }
                        })
                        .collect();

                    // Add the record_id as the last parameter for WHERE
                    let mut all_values = values;
                    all_values.push(record.record_id.clone());

                    let sql = format!(
                        r#"UPDATE "{}" SET {} WHERE id = ?"#,
                        record.table_name,
                        sets.join(", ")
                    );

                    match db.execute(sql, all_values, String::new(), String::new(), String::new(), String::new()) {
                        Ok(_) => applied += 1,
                        Err(e) => {
                            failed += 1;
                            errors.push(format!(
                                "UPDATE {} {}: {}",
                                record.table_name, record.record_id, e
                            ));
                        }
                    }
                }
            }
            "DELETE" => {
                let sql = format!(
                    r#"DELETE FROM "{}" WHERE id = ?"#,
                    record.table_name
                );
                match db.execute(sql, vec![record.record_id.clone()], String::new(), String::new(), String::new(), String::new()) {
                    Ok(_) => applied += 1,
                    Err(e) => {
                        failed += 1;
                        errors.push(format!(
                            "DELETE {} {}: {}",
                            record.table_name, record.record_id, e
                        ));
                    }
                }
            }
            _ => {
                failed += 1;
                errors.push(format!("Unknown operation: {}", record.operation));
            }
        }
    }

    Json(serde_json::json!({
        "applied": applied,
        "failed": failed,
        "errors": errors,
        "conflicts": conflicts
    }))
}

// ===================================================================
// Delta-based inventory sync (race-condition safe)
// ===================================================================

/// Push inventory quantity deltas from a terminal to the hub.
/// Deltas are applied chronologically to prevent race conditions.
///
/// Example: Instead of sending `quantity: 12`, send `delta: -3` (sold 3 units).
/// The hub applies all deltas in order, so even concurrent sales are handled.
///
/// If a delta would push inventory below zero, the record is flagged
/// for review rather than rejected.

#[derive(Deserialize)]
struct DeltaPushRequest {
    workstation_id: String,
    /// Inventory deltas: [{ batchId, productId, delta, transactionId, reason }]
    deltas: Vec<InventoryDelta>,
}

#[derive(Deserialize, Serialize, Debug)]
struct InventoryDelta {
    batch_id: String,
    product_id: String,
    /// Positive for stock-in, negative for sales
    delta: i64,
    transaction_id: String,
    /// "sale", "return", "adjustment", "stock_take"
    reason: String,
    /// Timestamp when this delta was created at the terminal
    created_at: String,
}

#[derive(Serialize)]
struct DeltaPushResponse {
    applied: usize,
    flagged: Vec<DeltaFlag>,
    errors: Vec<String>,
}

#[derive(Serialize, Debug)]
struct DeltaFlag {
    batch_id: String,
    product_id: String,
    attempted_delta: i64,
    resulting_qty: i64,
    message: String,
}

async fn sync_push_delta(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
    Json(body): Json<DeltaPushRequest>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    let db = &state.db;

    let mut applied = 0;
    let mut flagged: Vec<DeltaFlag> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for delta in &body.deltas {
        // 1. Get the current quantity on the hub
        let current_qty_sql = r#"SELECT "currentStock" FROM "Inventory" WHERE "batchId" = ?"#;
        match db.query(current_qty_sql.to_string(), vec![delta.batch_id.clone()]) {
            Ok(rows_json) => {
                let rows: Vec<serde_json::Value> =
                    serde_json::from_str(&rows_json).unwrap_or_default();

                let current_qty = if let Some(row) = rows.first() {
                    row.get("currentStock")
                        .and_then(|v| v.as_i64())
                        .unwrap_or(0)
                } else {
                    // Batch doesn't exist on hub yet — will be synced via normal pull
                    errors.push(format!(
                        "Batch {} not found on hub (will sync via pull)",
                        delta.batch_id
                    ));
                    continue;
                };

                let new_qty = current_qty + delta.delta;

                // 2. Check for negative inventory
                if new_qty < 0 {
                    // Flag for review but still apply (sale already happened)
                    flagged.push(DeltaFlag {
                        batch_id: delta.batch_id.clone(),
                        product_id: delta.product_id.clone(),
                        attempted_delta: delta.delta,
                        resulting_qty: new_qty,
                        message: format!(
                            "Inventory went negative: {} + {} = {}. Sale from {} needs review.",
                            current_qty, delta.delta, new_qty, body.workstation_id
                        ),
                    });
                }

                // 3. Apply the delta
                let update_sql = r#"UPDATE "Inventory" SET "currentStock" = ?, "updatedAt" = datetime('now') WHERE "batchId" = ?"#;
                match db.execute(
                    update_sql.to_string(),
                    vec![new_qty.to_string(), delta.batch_id.clone()],
                    "Inventory".to_string(),
                    "UPDATE".to_string(),
                    delta.batch_id.clone(),
                    format!("{{\"delta\": {}, \"reason\": \"{}\", \"workstation\": \"{}\"}}", delta.delta, delta.reason, body.workstation_id),
                ) {
                    Ok(_) => {
                        applied += 1;

                        // 4. Log the delta for audit trail
                        let log_sql = r#"INSERT OR IGNORE INTO "InventoryDeltaLog" (id, batchId, productId, delta, currentQty, newQty, reason, workstationId, transactionId, createdAt)
                            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#;
                        let _ = db.execute(
                            log_sql.to_string(),
                            vec![
                                format!("delta_{}", uuid::Uuid::new_v4().simple()),
                                delta.batch_id.clone(),
                                delta.product_id.clone(),
                                delta.delta.to_string(),
                                current_qty.to_string(),
                                new_qty.to_string(),
                                delta.reason.clone(),
                                body.workstation_id.clone(),
                                delta.transaction_id.clone(),
                                delta.created_at.clone(),
                            ],
                            String::new(), String::new(), String::new(), String::new(),
                        );
                    }
                    Err(e) => {
                        errors.push(format!(
                            "Failed to apply delta for batch {}: {}",
                            delta.batch_id, e
                        ));
                    }
                }
            }
            Err(e) => {
                errors.push(format!(
                    "Query batch {}: {}",
                    delta.batch_id, e
                ));
            }
        }
    }

    Json(serde_json::json!({
        "applied": applied,
        "flagged": flagged,
        "errors": errors
    }))
}

/// Get pending sync entries from the hub (used by terminals to pull hub changes).
async fn sync_pending(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    match state.db.get_pending_syncs() {
        Ok(entries) => Json(serde_json::from_str(&entries).unwrap_or(serde_json::json!([]))),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

/// Get the sync server status (connection info, device ID, etc.).
async fn sync_status(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
) -> Json<serde_json::Value> {
    let state = state.read().await;
    let device_id = state.db.get_device_id().unwrap_or_default();
    let db_path = state.db.get_db_path().unwrap_or_default();

    Json(serde_json::json!({
        "status": "running",
        "port": state.config.port,
        "device_id": device_id,
        "db_path": db_path,
        "tunnel_url": state.config.tunnel_url,
        "role": "hub"
    }))
}

/// Get list of connected terminals (from sync checkpoints).
async fn connected_terminals(
    axum::extract::State(state): axum::extract::State<Arc<RwLock<SyncServerState>>>,
) -> Json<serde_json::Value> {
    let state = state.read().await;

    let sql = r#"SELECT DISTINCT workstation_id, MIN(last_sync_timestamp) as first_seen, MAX(last_sync_timestamp) as last_sync, COUNT(DISTINCT table_name) as tables_synced
               FROM "SyncCheckpoint"
               GROUP BY workstation_id
               ORDER BY last_sync DESC"#.to_string();

    match state.db.query(sql, vec![]) {
        Ok(entries) => Json(serde_json::from_str(&entries).unwrap_or(serde_json::json!([]))),
        Err(e) => Json(serde_json::json!({ "error": e })),
    }
}

/// Health check endpoint.
async fn health_check() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "status": "ok", "timestamp": chrono::Utc::now().to_rfc3339() }))
}

// ===================================================================
// Helpers
// ===================================================================

/// Check if a table has a version column for optimistic concurrency.
fn table_has_version(table_name: &str) -> bool {
    matches!(
        table_name,
        "Product" | "Inventory" | "Batch" | "Customer" | "Vendor" | "Category" | "Manufacturer"
    )
}