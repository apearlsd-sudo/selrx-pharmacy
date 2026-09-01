//! src-tauri/src/ws_server.rs
//!
//! WebSocket server for real-time sync between hub and terminals.
//! Runs alongside the HTTP sync server on the same port.
//!
//! When a terminal connects via WebSocket:
//! - It receives push notifications immediately (no 10s polling delay)
//! - The hub broadcasts changes to all connected terminals
//! - Heartbeat messages keep the connection alive
//! - Automatic reconnection is handled on the client side

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use crate::db::DbState;

/// Maximum number of WS clients that can be connected simultaneously
const MAX_CLIENTS: usize = 50;

/// WebSocket event types sent between hub and terminals
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsEvent {
    /// Hub notifies terminal that new data is available for a table
    #[serde(rename = "data_available")]
    DataAvailable {
        tables: Vec<String>,
        server_timestamp: String,
    },

    /// Terminal acknowledges it will pull the data
    #[serde(rename = "pull_ack")]
    PullAck {
        tables: Vec<String>,
    },

    /// A delta was applied on a terminal and needs broadcasting
    #[serde(rename = "delta_broadcast")]
    DeltaBroadcast {
        product_id: String,
        batch_id: String,
        delta: i64,
        workstation_id: String,
        reason: String,
    },

    /// Hub broadcasts an inventory update to all other terminals
    #[serde(rename = "inventory_update")]
    InventoryUpdate {
        product_id: String,
        batch_id: String,
        new_quantity: i64,
        source_workstation: String,
    },

    /// Connection acknowledgment with server info
    #[serde(rename = "welcome")]
    Welcome {
        device_id: String,
        connected_clients: usize,
        server_time: String,
    },

    /// Terminal sends a ping to keep the connection alive
    #[serde(rename = "ping")]
    Ping,

    /// Server responds to a ping
    #[serde(rename = "pong")]
    Pong,

    /// Terminal identifies itself
    #[serde(rename = "identify")]
    Identify {
        workstation_id: String,
    },

    /// A new terminal connected (broadcast to others)
    #[serde(rename = "terminal_connected")]
    TerminalConnected {
        workstation_id: String,
        total_clients: usize,
    },

    /// A terminal disconnected
    #[serde(rename = "terminal_disconnected")]
    TerminalDisconnected {
        workstation_id: String,
        total_clients: usize,
    },

    /// Sync health metric from a terminal
    #[serde(rename = "health_report")]
    HealthReport {
        workstation_id: String,
        latency_ms: f64,
        pending_count: usize,
        queue_size: usize,
    },
}

/// Connected client info
#[derive(Debug, Clone)]
struct WsClient {
    workstation_id: String,
    #[allow(dead_code)]
    connected_at: std::time::Instant,
}

/// Shared state for the WebSocket server
pub struct WsState {
    pub db: Arc<DbState>,
    /// Broadcast channel for sending events to all connected terminals
    pub tx: broadcast::Sender<String>,
    /// Connected clients
    pub clients: RwLock<std::collections::HashMap<String, WsClient>>,
}

/// Add the WebSocket route to the existing router
pub fn ws_routes(state: Arc<WsState>) -> Router {
    Router::new().route("/ws/sync", get(ws_handler))
}

/// Create the WebSocket state
pub fn new_ws_state(db: Arc<DbState>) -> Arc<WsState> {
    let (tx, _) = broadcast::channel::<String>(256);
    Arc::new(WsState {
        db,
        tx,
        clients: RwLock::new(std::collections::HashMap::new()),
    })
}

/// Get a broadcast sender (for the hub to push events)
pub fn get_broadcaster(state: &Arc<WsState>) -> broadcast::Sender<String> {
    state.tx.clone()
}

/// Verify sync secret from the WebSocket upgrade request.
/// Reads the Authorization header or a `token` query param.
fn verify_ws_auth(req: &axum::http::request::Parts) -> bool {
    let expected = match std::env::var("SYNC_SECRET") {
        Ok(s) if !s.is_empty() => s,
        _ => return true, // No secret configured — allow all (matches HTTP behavior)
    };
    // Try Authorization header first
    if let Some(auth) = req.headers.get("authorization").and_then(|v| v.to_str().ok()) {
        return auth == format!("Bearer {}", expected);
    }
    // Fallback: token query parameter (for WebSocket clients that can't set headers)
    if let Some(query) = req.uri.query() {
        for pair in query.split('&') {
            if let Some(token) = pair.strip_prefix("token=") {
                return token == expected;
            }
        }
    }
    false
}

/// WebSocket upgrade handler — requires authentication
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<WsState>>,
    req: axum::http::Request<axum::body::Body>,
) -> Response {
    if !verify_ws_auth(&req.into_parts().0) {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            serde_json::json!({"error": "Unauthorized"}).to_string(),
        );
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
        .into_response()
}

type Response = axum::response::Response<axum::body::Body>;

/// Handle an individual WebSocket connection
async fn handle_socket(socket: WebSocket, state: Arc<WsState>) {
    let (mut sender, mut receiver) = socket.split();
    let (notify_tx, mut notify_rx) = tokio::sync::mpsc::channel::<String>(32);

    // Check if we're at max capacity
    {
        let clients = state.clients.read().await;
        if clients.len() >= MAX_CLIENTS {
            let _ = sender
                .send(Message::Text(
                    serde_json::to_string(&WsEvent::DataAvailable {
                        tables: vec![],
                        server_timestamp: String::new(),
                    })
                    .unwrap_or_else(|_| r#"{"type":"error","data":"max_clients_reached"}"#.to_string()),
                ))
                .await;
            let _ = sender.close().await;
            return;
        }
    }

    // Spawn a task to forward broadcast messages to this client
    let mut rx = state.tx.subscribe();
    let forward_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if notify_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Get device ID for welcome message
    let device_id = state.db.get_device_id().unwrap_or_default();
    let client_count = state.clients.read().await.len();
    let welcome = WsEvent::Welcome {
        device_id,
        connected_clients: client_count,
        server_time: chrono::Utc::now().to_rfc3339(),
    };
    let _ = sender
        .send(Message::Text(
            serde_json::to_string(&welcome).unwrap_or_default(),
        ))
        .await;

    let mut my_workstation_id = String::new();

    // Main message loop
    loop {
        tokio::select! {
            // Incoming message from client
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(event) = serde_json::from_str::<WsEvent>(&text) {
                            match event {
                                WsEvent::Identify { workstation_id } => {
                                    my_workstation_id = workstation_id.clone();
                                    let client = WsClient {
                                        workstation_id: workstation_id.clone(),
                                        connected_at: std::time::Instant::now(),
                                    };
                                    state.clients.write().await.insert(workstation_id.clone(), client);

                                    let total = state.clients.read().await.len();
                                    let _ = state.tx.send(serde_json::to_string(&WsEvent::TerminalConnected {
                                        workstation_id,
                                        total_clients: total,
                                    }).unwrap_or_default());
                                }

                                WsEvent::DeltaBroadcast {
                                    product_id,
                                    batch_id,
                                    delta,
                                    workstation_id,
                                    reason,
                                } => {
                                    // Broadcast inventory change to all OTHER terminals
                                    let _ = state.tx.send(serde_json::to_string(&WsEvent::InventoryUpdate {
                                        product_id,
                                        batch_id,
                                        new_quantity: 0, // terminals will pull the actual value
                                        source_workstation: workstation_id,
                                    }).unwrap_or_default());

                                    let _ = state.db.log_health_metric(
                                        "delta_received".to_string(),
                                        delta as f64,
                                        format!("{}:{}:{}", reason, product_id, batch_id),
                                    );
                                }

                                WsEvent::HealthReport { workstation_id, latency_ms, pending_count, queue_size } => {
                                    let _ = state.db.log_health_metric(
                                        format!("latency_{}", workstation_id),
                                        latency_ms,
                                        format!("pending={}, queue={}", pending_count, queue_size),
                                    );
                                }

                                WsEvent::Ping => {
                                    let _ = sender.send(Message::Text(
                                        serde_json::to_string(&WsEvent::Pong).unwrap_or_default(),
                                    )).await;
                                }

                                _ => { /* ignore other events from terminals */ }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }

            // Outgoing broadcast message
            msg = notify_rx.recv() => {
                match msg {
                    Some(text) => {
                        if sender.send(Message::Text(text)).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
        }
    }

    // Cleanup on disconnect
    if !my_workstation_id.is_empty() {
        state.clients.write().await.remove(&my_workstation_id);
        let total = state.clients.read().await.len();
        let _ = state.tx.send(
            serde_json::to_string(&WsEvent::TerminalDisconnected {
                workstation_id: my_workstation_id,
                total_clients: total,
            })
            .unwrap_or_default(),
        );
    }

    forward_task.abort();
}

/// Broadcast to all connected terminals that data has changed
/// Call this from the HTTP sync handlers after applying changes
pub fn broadcast_data_available(
    tx: &broadcast::Sender<String>,
    tables: Vec<String>,
) {
    let event = WsEvent::DataAvailable {
        tables,
        server_timestamp: chrono::Utc::now().to_rfc3339(),
    };
    let _ = tx.send(serde_json::to_string(&event).unwrap_or_default());
}

/// Get the count of connected WebSocket clients
pub async fn connected_ws_count(state: &Arc<WsState>) -> usize {
    state.clients.read().await.len()
}

/// Get connected terminal IDs
pub async fn connected_ws_terminals(state: &Arc<WsState>) -> Vec<String> {
    state
        .clients
        .read()
        .await
        .keys()
        .cloned()
        .collect()
}
