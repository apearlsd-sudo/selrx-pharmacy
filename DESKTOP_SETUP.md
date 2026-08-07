# GazPharm POS — Desktop Setup Guide (Tauri)

This guide walks you through setting up the GazPharm POS as a Tauri desktop app
that works fully offline with local SQLite, and syncs with other devices over
the internet.

## Prerequisites

1. **Rust** — Install from [rustup.rs](https://rustup.rs/)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

2. **System Dependencies** — Tauri needs native libraries:

   **Ubuntu / Debian:**
   ```bash
   sudo apt update
   sudo apt install -y \
     libwebkit2gtk-4.1-dev \
     libappindicator3-dev \
     librsvg2-dev \
     patchelf
   ```

   **Windows:**
   - Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Win11)

   **macOS:**
   ```bash
   xcode-select --install
   ```

3. **Node.js** — You already have this (via bun)

4. **Tauri CLI:**
   ```bash
   cargo install tauri-cli --version ">=2"
   # or use npx: npx @tauri-apps/cli
   ```

5. **@tauri-apps/api** (frontend library):
   ```bash
   npm install @tauri-apps/api
   ```

## Quick Start

### Development Mode (Desktop)

```bash
# Terminal 1: Start the Next.js dev server on port 1420 (Tauri's dev port)
npm run dev:tauri

# Terminal 2: Start Tauri (opens a native window)
npm run tauri:dev
```

This opens a native desktop window with hot-reload. The app reads/writes to
a local SQLite file (`gazpharm.db`) stored in the OS app data directory.

### Production Build

```bash
# Build the static Next.js export + Tauri binary
npm run tauri:build
```

This produces installers in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` and `.exe` (NSIS)
- **macOS**: `.dmg`
- **Linux**: `.deb` and `.AppImage`

### Web Mode (Unchanged)

```bash
# Development
npm run dev        # localhost:3000, hits Turso cloud

# Production
npm run build      # deploys to Vercel as before
```

## Architecture

```
src-tauri/                    ← Rust backend (Tauri)
  src/
    main.rs                 ← Entry point
    lib.rs                  ← Tauri commands + setup
    db.rs                   ← Local SQLite (Rusqlite)
    sync_server.rs          ← Hub sync server (Axum)
  Cargo.toml                ← Rust dependencies
  tauri.conf.json           ← Tauri configuration
  capabilities/             ← Tauri v2 permissions

src/lib/
  platform.ts               ← Runtime detection (Tauri vs Web)
  db-adapter.ts             ← Universal fetch/query abstraction
  desktop/
    tauri-types.ts          ← Type definitions for IPC
    tauri-bridge.ts         ← Lazy-loaded Tauri invoke wrappers
  sync-engine.ts            ← Client-side sync (push/pull)

src/components/gazpharm/
  sync-status-indicator.tsx ← UI: sync state in header
```

## How It Works

### Web Mode (Vercel)
- `isDesktop()` returns `false`
- All API calls go through `fetch('/api/...')` → Turso cloud
- No Tauri code is loaded (dynamic imports)
- Everything works exactly as before

### Desktop Mode (Tauri)
- `isDesktop()` returns `true`
- Database operations use `adapterQuery()` / `adapterExecute()` → local SQLite via Tauri IPC
- The Rust backend creates `gazpharm.db` in the OS app data dir
- All writes automatically create SyncLog entries
- The sync engine pushes/pulls changes to/from the hub device

### Hub vs Terminal

**Hub** (Super Admin's computer):
- Runs the embedded Axum sync server on port 3001
- Other terminals connect to it for sync
- Uses Cloudflare Tunnel for internet accessibility
- Has the complete consolidated view of all data

**Terminal** (POS workstation):
- Connects to the hub's URL for sync
- Works fully offline between syncs
- Pushes transactions, pulls product/stock updates

## Sync Configuration

### Setting Up the Hub

1. On the super admin's computer, the app needs to be set as Hub mode.
   (This will be configurable in the Settings UI — for now, create a file
   called `device_role.txt` in the app data directory containing `hub`)

2. Start the desktop app. It will run the sync server on port 3001.

3. For internet accessibility, set up a Cloudflare Tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
   This gives you a public URL like `https://xyz.trycloudflare.com`

### Connecting Terminals

1. On each POS terminal, configure the hub URL (in Settings UI)
2. The sync engine will automatically:
   - Push new transactions every 30 seconds
   - Pull product/stock updates from the hub
   - Handle conflict resolution (hub wins for master data)

## Migration: Converting Existing API Calls

To make an existing component work on both web and desktop, replace:

```typescript
// Before (web only)
const res = await fetch('/api/products')
const data = await res.json()
```

With:

```typescript
// After (web + desktop)
import { adapterFetch } from '@/lib/db-adapter'
const res = await adapterFetch('/api/products')
const data = await res.json()
```

Or use the convenience helpers:

```typescript
import { apiGet, apiPost } from '@/lib/db-adapter'
const products = await apiGet('/api/products')
const newProduct = await apiPost('/api/products', { name: '...' })
```

## Troubleshooting

### `__TAURI_INTERNALS__ is not defined`
This means you're importing Tauri code on the web. Make sure you use:
- `isDesktop()` checks before calling Tauri functions
- `adapterFetch()` instead of raw `fetch()` for API calls

### `Port 1420 already in use`
Kill the process on port 1420 or use a different port in `tauri.conf.json`.

### `cargo build` fails

Make sure all system dependencies are installed (see Prerequisites).
On Linux, `libwebkit2gtk-4.1-dev` is the most common missing package.

### Sync not working

1. Check that the hub URL is correct and accessible
2. Verify the hub device is running and has started the sync server
3. Check the sync status indicator in the POS header
4. Look at the Tauri console output for sync error messages
