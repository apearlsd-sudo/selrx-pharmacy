import { NextRequest, NextResponse } from 'next/server'
import { ALL_PERMISSION_KEYS, ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'

/**
 * Session validation route — uses the middleware-injected x-user-id header.
 * No longer accepts userId from the request body (IDOR fix).
 */
export async function POST(req: NextRequest) {
  try {
    // Use the middleware-verified user ID, NOT client-supplied userId
    const userId = req.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json({ valid: false }, { status: 401 })
    }

    const tursoUrl = process.env.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_API_TOKEN

    if (tursoUrl) {
      // ── REMOTE: Turso via libsql ──
      const { createClient } = await import('@libsql/client')
      const turso = createClient({ url: tursoUrl, authToken: authToken || undefined })

      const result = await turso.execute({
        sql: `SELECT id, email, name, role, permissions, active FROM "User" WHERE id = ? AND active = 1 LIMIT 1`,
        args: [userId],
      })

      if (result.rows.length === 0) {
        return NextResponse.json({ valid: false }, { status: 401 })
      }

      const row = result.rows[0]
      const userRole = row.role as string
      const userPerms = row.permissions as string | null

      let permissions: string[] = []
      if (userRole === 'SUPER_ADMIN') {
        permissions = [...ALL_PERMISSION_KEYS]
      } else if (userPerms) {
        try {
          const parsed = JSON.parse(userPerms)
          if (Array.isArray(parsed) && parsed.length > 0) permissions = parsed
        } catch { permissions = [] }
      }
      if (permissions.length === 0) {
        permissions = DEFAULT_ROLE_PERMISSIONS[userRole] ?? []
      }

      const roleLabel = ROLE_METADATA[userRole]?.label || userRole

      return NextResponse.json({
        valid: true,
        user: {
          id: row.id as string,
          name: row.name as string,
          email: row.email as string,
          role: userRole,
          roleLabel,
          permissions,
        },
      })
    } else {
      // ── LOCAL: Fallback to Prisma ──
      const { db } = await import('@/lib/db')
      const user = await db.user.findUnique({ where: { id: userId } })

      if (!user || !user.active) {
        return NextResponse.json({ valid: false }, { status: 401 })
      }

      let permissions: string[] = []
      if (user.role === 'SUPER_ADMIN') {
        permissions = [...ALL_PERMISSION_KEYS]
      } else if (user.permissions) {
        try {
          const parsed = JSON.parse(user.permissions)
          if (Array.isArray(parsed) && parsed.length > 0) permissions = parsed
        } catch { permissions = [] }
      }
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
    }
  } catch (error) {
    console.error('Session validation error:', error)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
