import { NextRequest, NextResponse } from 'next/server'
import { ALL_PERMISSION_KEYS, ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'
import { hashPassword, verifyPassword, signToken, checkRateLimit, getRetryAfter } from '@/lib/security'

/**
 * Login route — uses raw libsql SQL to bypass Prisma entirely.
 *
 * Security: bcrypt password hashing, JWT issuance, rate limiting,
 * automatic rehash of legacy plaintext passwords.
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

    // Rate limiting: 10 attempts per 15 minutes per email
    const rlKey = `login:${email}`
    if (!checkRateLimit(rlKey, 10, 15 * 60 * 1000)) {
      const retryAfter = getRetryAfter(rlKey)
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    // Dynamically import @libsql/client (only available when TURSO_DATABASE_URL is set)
    const { createClient } = await import('@libsql/client')

    const tursoUrl = process.env.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_API_TOKEN

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
      const storedPw = row.password as string

      // Verify password (supports legacy plaintext → bcrypt migration)
      const { valid, needsRehash } = await verifyPassword(password, storedPw)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      // Auto-rehash legacy plaintext passwords to bcrypt
      if (needsRehash) {
        const hashed = await hashPassword(password)
        await turso.execute({
          sql: `UPDATE "User" SET "password" = ? WHERE id = ?`,
          args: [hashed, row.id as string],
        })
      }

      // Update last login
      await turso.execute({
        sql: `UPDATE "User" SET "lastLogin" = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [row.id as string],
      })

      // Resolve permissions
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

      // Issue JWT
      const token = await signToken({
        userId: row.id as string,
        email: row.email as string,
        role: userRole,
        permissions,
      })

      const roleLabel = ROLE_METADATA[userRole]?.label || userRole

      return NextResponse.json({
        token,
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
      if (!user || !user.active) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const { valid, needsRehash } = await verifyPassword(password, user.password)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      // Auto-rehash
      if (needsRehash) {
        const hashed = await hashPassword(password)
        await db.user.update({ where: { id: user.id }, data: { password: hashed } })
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

      const token = await signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions,
      })

      const roleLabel = ROLE_METADATA[user.role]?.label || user.role

      return NextResponse.json({
        token,
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
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Internal server error', debug: msg },
      { status: 500 }
    )
  }
}
