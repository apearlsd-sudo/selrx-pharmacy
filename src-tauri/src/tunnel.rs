//! src-tauri/src/tunnel.rs
//!
//! Cloudflare Tunnel management for SelRx desktop.
//! Manages the `cloudflared` process lifecycle — start, stop, status detection.
//!
//! The tunnel allows remote branches to connect to this hub without
//! port forwarding, static IPs, or VPN.

use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// persisted tunnel configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TunnelConfig {
    /// Cloudflare Tunnel token (from `cloudflared tunnel create`)
    pub token: String,
    /// Detected public URL assigned by Cloudflare
    pub url: Option<String>,
    /// Whether the tunnel should auto-start with the app
    pub auto_start: bool,
}

/// Runtime tunnel state
pub struct TunnelState {
    /// The cloudflared child process (if running)
    process: Option<Child>,
    /// The detected public URL
    pub url: Option<String>,
    /// When the tunnel was started
    started_at: Option<Instant>,
    /// Config directory for cloudflared
    config_dir: String,
}

impl TunnelState {
    pub fn new(config_dir: String) -> Self {
        Self {
            process: None,
            url: None,
            started_at: None,
            config_dir,
        }
    }

    /// Check if the tunnel process is still alive
    pub fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.process {
            // try_wait returns Ok(None) if still running
            match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    // Process exited
                    self.process = None;
                    self.url = None;
                    self.started_at = None;
                    false
                }
                Err(_) => false,
            }
        } else {
            false
        }
    }

    /// Start the cloudflared tunnel process
    pub fn start(&mut self, token: &str, local_port: u16) -> Result<String, String> {
        if self.is_running() {
            return Err("Tunnel is already running".to_string());
        }

        if token.is_empty() {
            return Err("Tunnel token is required".to_string());
        }

        // Locate cloudflared binary
        // Priority: bundled binary > system PATH
        let cloudflared_path = Self::find_cloudflared()?;

        println!(
            "[tunnel] Starting cloudflared from: {}",
            cloudflared_path
        );

        // Build the command
        let local_url = format!("http://localhost:{}", local_port);

        let child = Command::new(&cloudflared_path)
            .arg("tunnel")
            .arg("--no-autoupdate")
            .arg("run")
            .arg(&token)
            .env("TUNNEL_NO_AUTO_UPDATE", "true")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start cloudflared: {}", e))?;

        self.process = Some(child);
        self.started_at = Some(Instant::now());
        self.url = None;

        // Wait up to 15 seconds for the tunnel URL to appear in stderr
        let url = self.wait_for_tunnel_url(Duration::from_secs(15));

        match url {
            Some(detected_url) => {
                self.url = Some(detected_url.clone());
                println!("[tunnel] Tunnel established at: {}", detected_url);
                Ok(detected_url)
            }
            None => {
                // Tunnel started but URL not yet detected — it may still be connecting
                println!("[tunnel] Process started, URL not yet detected. Will retry detection.");
                Ok("connecting...".to_string())
            }
        }
    }

    /// Stop the cloudflared tunnel process
    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.process.take() {
            // Try graceful shutdown first
            #[cfg(unix)]
            {
                use std::os::unix::process::ExitStatusExt;
                let _ = child.kill();
            }
            #[cfg(windows)]
            {
                let _ = child.kill();
            }

            let _ = child.wait();
            println!("[tunnel] Tunnel stopped");
        }

        self.url = None;
        self.started_at = None;
        Ok(())
    }

    /// Get the current tunnel status
    pub fn status(&mut self) -> TunnelStatus {
        let running = self.is_running();
        TunnelStatus {
            running,
            url: self.url.clone(),
            uptime_secs: self
                .started_at
                .map(|t| t.elapsed().as_secs())
                .unwrap_or(0),
            cloudflared_installed: Self::find_cloudflared().is_ok(),
        }
    }

    /// Try to detect the tunnel URL from cloudflared's output.
    /// cloudflared prints something like:
    ///   2024-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+
    ///   2024-01-01T00:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
    ///   2024-01-01T00:00:00Z INF |  https://abc-xyz.trycloudflare.com                                                       |
    fn wait_for_tunnel_url(&mut self, timeout: Duration) -> Option<String> {
        let start = Instant::now();

        // We need to read from stderr, but since we already spawned the process
        // we can't easily read from it without blocking.
        // Instead, we'll use a heuristic: try to detect the URL from the
        // cloudflared API or by checking common output patterns.
        //
        // For robustness, we also provide a manual URL setting option.

        // Try to read the first few lines of stderr with a non-blocking approach
        if let Some(ref child) = self.process {
            if let Some(stderr) = child.stderr.as_mut() {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();

                while start.elapsed() < timeout {
                    match lines.next() {
                        Some(Ok(line)) => {
                            if let Some(url) = Self::extract_url_from_line(&line) {
                                return Some(url);
                            }
                        }
                        Some(Err(_)) => return None,
                        None => {
                            // No more output yet, sleep and retry
                            std::thread::sleep(Duration::from_millis(500));
                        }
                    }
                }
            }
        }

        None
    }

    /// Extract a cloudflare tunnel URL from a log line
    fn extract_url_from_line(line: &str) -> Option<String> {
        // Pattern: https://something.trycloudflare.com or https://something.cfargotunnel.com
        let url_patterns = [
            "trycloudflare.com",
            "cfargotunnel.com",
        ];

        for pattern in &url_patterns {
            if let Some(idx) = line.find("https://") {
                let substring = &line[idx..];
                if substring.contains(pattern) {
                    // Extract the URL (up to whitespace or end of line)
                    let url_end = substring
                        .find(|c: char| c.is_whitespace())
                        .unwrap_or(substring.len());
                    let url = substring[..url_end].trim_end_matches('|').trim();
                    if url.starts_with("https://") && url.len() > 10 {
                        return Some(url.to_string());
                    }
                }
            }
        }
        None
    }

    /// Find the cloudflared binary
    fn find_cloudflared() -> Result<String, String> {
        // 1. Check if bundled alongside the app
        let bundled = Self::get_exe_dir()
            .map(|dir| {
                let path = dir.join("cloudflared");
                if path.exists() {
                    Some(path.to_string_lossy().to_string())
                } else {
                    // Windows needs .exe
                    let path_win = dir.join("cloudflared.exe");
                    if path_win.exists() {
                        Some(path_win.to_string_lossy().to_string())
                    } else {
                        None
                    }
                }
            })
            .flatten();

        if let Some(path) = bundled {
            return Ok(path);
        }

        // 2. Try system PATH
        let output = Command::new("cloudflared")
            .arg("--version")
            .output();

        match output {
            Ok(o) if o.status.success() => Ok("cloudflared".to_string()),
            _ => Err(
                "cloudflared not found. Download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
                    .to_string(),
            ),
        }
    }

    /// Get the directory containing the running executable
    fn get_exe_dir() -> Option<std::path::PathBuf> {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
    }
}

/// Serializable tunnel status for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelStatus {
    pub running: bool,
    pub url: Option<String>,
    pub uptime_secs: u64,
    pub cloudflared_installed: bool,
}
