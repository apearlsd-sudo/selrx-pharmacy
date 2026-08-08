//! src-tauri/src/mdns_discovery.rs
//!
//! mDNS (Bonjour/Avahi) auto-discovery for finding SelRx hubs on the LAN.
//!
//! How it works:
//! 1. The hub broadcasts itself via mDNS (_selrx-sync._tcp.local.)
//! 2. Terminals scan for this service type to discover hub addresses
//! 3. No manual URL entry needed for LAN setups
//!
//! Implementation uses UDP sockets directly on port 5353 to avoid
//! heavy dependencies. On Windows, it falls back to a simple
//! broadcast ping approach.

use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::time::Duration;

/// A discovered hub on the LAN
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredHub {
    /// The hub's IP address (e.g., "192.168.1.100")
    pub ip: String,
    /// The hub's sync port (default: 3001)
    pub port: u16,
    /// The full URL to connect to (e.g., "http://192.168.1.100:3001")
    pub url: String,
    /// The hub's device ID (if available)
    pub device_id: String,
    /// Signal strength / discovery method
    pub discovery_method: String,
    /// When this hub was discovered
    pub discovered_at: String,
}

/// mDNS service type for SelRx sync hubs
const MDNS_SERVICE_TYPE: &str = "_selrx-sync._tcp.local.";

/// Port used for mDNS discovery broadcast
const DISCOVERY_PORT: u16 = 35353;

/// Discovery packet magic bytes to identify SelRx broadcasts
const DISCOVERY_MAGIC: &[u8] = b"SELRX_HUB_DISCOVERY";

/// Start an mDNS/broadcast beacon that announces this hub on the LAN.
/// This runs in a background thread and periodically broadcasts.
pub fn start_discovery_beacon(device_id: String, port: u16) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        // Build the beacon payload
        let payload = format!(
            "SELRX_HUB_DISCOVERY|{}|{}|{}",
            device_id,
            port,
            chrono::Utc::now().to_rfc3339()
        );
        let payload_bytes = payload.as_bytes();

        // Try to create a broadcast socket
        let socket = match UdpSocket::bind("0.0.0.0:0") {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[mdns] Failed to create broadcast socket: {}", e);
                return;
            }
        };

        if let Err(e) = socket.set_broadcast(true) {
            eprintln!("[mdns] Cannot enable broadcast: {}", e);
            return;
        }

        let broadcast_addr: SocketAddrV4 =
            SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT);

        println!("[mdns] Discovery beacon started (broadcasting on port {})", DISCOVERY_PORT);

        // Broadcast every 5 seconds
        loop {
            if let Err(e) = socket.send_to(payload_bytes, broadcast_addr) {
                eprintln!("[mdns] Broadcast error: {}", e);
            }

            std::thread::sleep(Duration::from_secs(5));
        }
    })
}

/// Scan the LAN for SelRx hubs by listening for discovery broadcasts.
/// Returns a list of discovered hubs within the timeout period.
pub fn scan_for_hubs(timeout_secs: u64) -> Result<Vec<DiscoveredHub>, String> {
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", DISCOVERY_PORT))
        .map_err(|e| format!("Cannot bind discovery port {}: {}", DISCOVERY_PORT, e))?;

    socket
        .set_read_timeout(Some(Duration::from_secs(timeout_secs)))
        .map_err(|e| format!("Cannot set read timeout: {}", e))?;

    let mut discovered: Vec<DiscoveredHub> = Vec::new();
    let start = std::time::Instant::now();
    let mut buf = [0u8; 1024];

    // Also send a proactive scan broadcast to wake up hubs
    if let Ok(bcast_socket) = UdpSocket::bind("0.0.0.0:0") {
        let _ = bcast_socket.set_broadcast(true);
        let scan_payload = b"SELRX_HUB_SCAN";
        let _ = bcast_socket.send_to(
            scan_payload,
            SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT),
        );
        drop(bcast_socket);
    }

    while start.elapsed().as_secs() < timeout_secs {
        match socket.recv_from(&mut buf) {
            Ok((len, src_addr)) => {
                let data = String::from_utf8_lossy(&buf[..len]);

                // Check if this is a SelRx discovery beacon
                if data.starts_with("SELRX_HUB_DISCOVERY|") {
                    let parts: Vec<&str> = data.split('|').collect();
                    if parts.len() >= 3 {
                        let hub_device_id = parts[1].to_string();
                        let hub_port: u16 = parts[2].parse().unwrap_or(3001);
                        let hub_ip = src_addr.ip().to_string();

                        // Skip if we already found this hub
                        if discovered.iter().any(|h| h.device_id == hub_device_id) {
                            continue;
                        }

                        discovered.push(DiscoveredHub {
                            ip: hub_ip.clone(),
                            port: hub_port,
                            url: format!("http://{}:{}", hub_ip, hub_port),
                            device_id: hub_device_id,
                            discovery_method: "broadcast".to_string(),
                            discovered_at: chrono::Utc::now().to_rfc3339(),
                        });

                        println!("[mdns] Discovered hub at {}:{} ({})", hub_ip, hub_port, hub_device_id);
                    }
                }
            }
            Err(e) => {
                // Timeout is expected — means scan period is over
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut
                {
                    break;
                }
            }
        }
    }

    Ok(discovered)
}

/// Verify a discovered hub is actually reachable by hitting its health endpoint.
pub async fn verify_hub(url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    match client
        .get(format!("{}/api/health", url.trim_end_matches('/')))
        .send()
        .await
    {
        Ok(res) => Ok(res.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Get the local IP addresses of this machine (for display).
pub fn get_local_ips() -> Vec<String> {
    let mut ips = Vec::new();

    // Try to get local IP by connecting to a public address
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        // Connect to a public DNS server (no actual data sent)
        if socket
            .connect("8.8.8.8:80")
            .is_ok()
        {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                // Only include private/LAN IPs
                if ip.starts_with("192.168.")
                    || ip.starts_with("10.")
                    || ip.starts_with("172.")
                {
                    ips.push(ip);
                }
            }
        }
    }

    ips
}
