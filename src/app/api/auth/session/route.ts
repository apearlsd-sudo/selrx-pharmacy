import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ALL_PERMISSION_KEYS } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { systemRole: true },
    })

    if (!user || !user.active) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    // Resolve permissions with same priority as login
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

    if (permissions.length === 0 && user.systemRole) {
      try {
        const rolePerms = JSON.parse(user.systemRole.permissions)
        if (Array.isArray(rolePerms)) {
          permissions = rolePerms
        }
      } catch {
        permissions = []
      }
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: user.systemRole?.label || user.role,
        permissions,
      },
    })
  } catch (error) {
    console.error('Session validation error:', error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
