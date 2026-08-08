/**
 * GET /api/sync/status
 *
 * Returns the sync server status. Used by terminals to verify
 * that the hub is reachable and get connection info.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    note: 'For full status, access port 3001 via tunnel or LAN',
  })
}
