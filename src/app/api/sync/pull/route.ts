/**
 * POST /api/sync/pull
 *
 * Sends changed records from the hub to a requesting terminal.
 * This route is used when the app runs as a Hub accessible via Cloudflare Tunnel.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { table_name, since, workstation_id } = body as {
      table_name: string
      since: string
      workstation_id: string
    }

    if (!table_name || !since || !workstation_id) {
      return NextResponse.json(
        { error: 'table_name, since, and workstation_id are required' },
        { status: 400 }
      )
    }

    // In desktop/Tauri mode, the sync server (Rust/axum on port 3001) handles this.
    // This Next.js route serves as the public-facing endpoint when accessed via
    // Cloudflare Tunnel. The tunnel routes to port 3001, so this route is a
    // fallback for web-mode or when the tunnel points to the Next.js server.
    //
    // For a proper setup, the Cloudflare Tunnel should point to port 3001
    // (the Tauri sync server), not port 1420 (the Next.js frontend).

    return NextResponse.json({
      records: [],
      server_timestamp: new Date().toISOString(),
      has_more: false,
      note: 'Configure Cloudflare Tunnel to point to port 3001 for sync operations',
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Pull failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
