import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ALL_PERMISSION_KEYS, ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    // Simple query — no SystemRole include to avoid query failures
    const user = await db.user.findUnique({
      where: { id: userId },
    })

    if (!user || !user.active) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    // Resolve permissions — same logic as login route
    let permissions: string[] = []

    if (user.role === 'SUPER_ADMIN') {
      permissions = [...ALL_PERMISSION_KEYS]
    } else if (user.permissions) {
      try {
        const parsed = JSON.parse(user.permissions)
        if (Array.isArray(parsed) && parsed.length > 0) {
          permissions = parsed
        }
      } catch {
        permissions = []
      }
    }

    // Fallback: use in-code default permissions for the role
    if (permissions.length === 0) {
      permissions = DEFAULT_ROLE_PERMISSIONS[user.role] ?? []
    }

    const roleLabel = ROLE_METADATA[user.role]?.label || user.role

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel,
        permissions,
      },
    })
  } catch (error) {
    console.error('Session validation error:', error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
