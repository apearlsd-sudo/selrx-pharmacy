import { NextRequest, NextResponse } from 'next/server'
import { ALL_PERMISSION_KEYS, ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'

/**
 * Login route — uses raw libsql SQL to bypass Prisma entirely.
 *
 * Prisma + LibSQL adapter was causing unhandled runtime errors on Vercel
 * (likely schema validation or adapter initialization failure).
 * Raw SQL via @libsql/client is the most reliable path for auth.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Dynamically import @libsql/client (only available when TURSO_DATABASE_URL is set)
    const { createClient } = await import('@libsql/client')

    const tursoUrl = process.env.TURSO_DATABASE_URL
    const authToken = process.env.DATABASE_AUTH_TOKEN

    if (tursoUrl) {
      // ── REMOTE: Turso cloud via libsql ──
      const turso = createClient({ url: tursoUrl, authToken: authToken || undefined })

      const result = await turso.execute({
        sql: `SELECT id, email, name, password, role, permissions, active FROM "User" WHERE email = ? AND active = 1 LIMIT 1`,
        args: [email],
      })

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const row = result.rows[0]
      if (row.password !== password) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      // Update last login
      await turso.execute({
        sql: `UPDATE "User" SET "lastLogin" = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [row.id as string],
      })

      const userRole = row.role as string
      const userPerms = row.permissions as string | null

      // Resolve permissions
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
      // ── LOCAL: Fallback to Prisma with local SQLite ──
      const { db } = await import('@/lib/db')

      const user = await db.user.findUnique({ where: { email } })
      if (!user || user.password !== password || !user.active) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      await db.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      })

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
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
