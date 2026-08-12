import { NextResponse } from 'next/server'

// POST /api/notifications/dismiss
// Simple endpoint that returns success. The frontend tracks dismissed
// notifications locally via localStorage. This endpoint exists for
// future server-side persistence if needed.
export async function POST() {
  return NextResponse.json({ success: true })
}
