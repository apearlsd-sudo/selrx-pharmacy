import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    const userRole = req.headers.get('x-user-role')

    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required: missing x-user-id header' },
        { status: 401 }
      )
    }

    // Verify the user exists before logging the audit event
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: `User not found: ${userId}` },
        { status: 401 }
      )
    }

    // Record the sign-out event in the audit log
    try {
      await db.auditLog.create({
        data: {
          userId,
          action: 'USER_SIGN_OUT',
          details: `Shift ended by ${user.name} (${user.email}) — role: ${userRole || user.role}`,
        },
      })
    } catch (logErr) {
      // Audit log failure should NOT block logout — log and continue
      console.error('Failed to write sign-out audit log:', logErr)
    }

    return NextResponse.json({
      success: true,
      message: `Goodbye, ${user.name}! Your shift has been ended.`,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error during logout' },
      { status: 500 }
    )
  }
}
