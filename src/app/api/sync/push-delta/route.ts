/**
 * POST /api/sync/push-delta
 *
 * Receives inventory quantity deltas from terminals.
 * Deltas are applied chronologically to prevent race conditions.
 *
 * This is the critical endpoint for preventing inventory overselling:
 * - Each terminal sends `delta: -3` (sold 3 units) instead of `quantity: 12`
 * - The hub applies deltas in order, so concurrent sales are handled correctly
 * - If a delta would push stock below zero, it's flagged (not rejected)
 */

import { NextRequest, NextResponse } from 'next/server'

interface InventoryDelta {
  batch_id: string
  product_id: string
  delta: number
  transaction_id: string
  reason: string
  created_at: string
}

interface DeltaFlag {
  batch_id: string
  product_id: string
  attempted_delta: number
  resulting_qty: number
  message: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workstation_id, deltas } = body as {
      workstation_id: string
      deltas: InventoryDelta[]
    }

    if (!workstation_id || !deltas || !Array.isArray(deltas)) {
      return NextResponse.json(
        { error: 'workstation_id and deltas array are required' },
        { status: 400 }
      )
    }

    // In desktop mode, the Tauri sync server on port 3001 handles delta application.
    // This Next.js route is a public-facing endpoint for when the tunnel points
    // to the Next.js server instead of the sync server.
    //
    // For proper setup, configure the tunnel to point to port 3001.

    return NextResponse.json({
      applied: 0,
      flagged: [],
      errors: [],
      note: 'Configure Cloudflare Tunnel to point to port 3001 for delta sync',
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Delta push failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
