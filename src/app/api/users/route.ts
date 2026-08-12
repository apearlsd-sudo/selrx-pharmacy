import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { ROLE_METADATA, DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions'
import { hashPassword, verifyToken } from '@/lib/security'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Schema introspection ─────────────────────────────────────────────────
// On Vercel/Turso the User table may have been created from an older schema
// that lacks department, shift, hireDate columns.  Instead of requiring
// ALTER TABLE (which can fail in subtle ways), we dynamically build SQL
// that only references columns that actually exist.

let _cachedColumns: Set<string> | null = null

async function getUserColumns(): Promise<Set<string>> {
  if (_cachedColumns) return _cachedColumns
  if (!isTurso()) {
    // Local Prisma path — assume all columns exist
    _cachedColumns = new Set([
      'id','email','password','name','role','phone','licenseNumber',
      'permissions','department','shift','hireDate','active',
      'lastLogin','createdAt','updatedAt',
    ])
    return _cachedColumns
  }
  const info = await turso.execute({ sql: `PRAGMA table_info("User")`, args: [] })
  const detected = new Set(info.rows.map(r => (r.name as string).toLowerCase()))
  if (detected.size === 0) {
    console.error('[getUserColumns] PRAGMA table_info("User") returned 0 rows — table may not exist')
  }
  _cachedColumns = detected
  return _cachedColumns
}

/** Return a comma-separated, quoted list of columns that exist from the given set */
async function existingCols(want: string[]): Promise<string> {
  const cols = await getUserColumns()
  return want.filter(c => cols.has(c.toLowerCase())).map(c => `"${c}"`).join(', ')
}

// All columns we'd like to SELECT (in order)
const FULL_COL_LIST = [
  'id','email','name','role','phone','licenseNumber',
  'permissions','department','shift','hireDate','active',
  'lastLogin','createdAt','updatedAt',
]

// Helper: convert SQLite row (with 0/1 booleans) to a proper JS object
function rowToUser(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    role: row.role as string,
    phone: (row.phone as string) || null,
    licenseNumber: (row.licenseNumber as string) || null,
    permissions: (row.permissions as string) || null,
    department: (row.department as string) || null,
    shift: (row.shift as string) || null,
    hireDate: (row.hireDate as string) || null,
    active: row.active === 1 || row.active === true,
    lastLogin: (row.lastLogin as string) || null,
    createdAt: (row.createdAt as string) || null,
    updatedAt: (row.updatedAt as string) || null,
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// ── SystemRole FK helper ──────────────────────────────────────────────────
// User.role has a FK → SystemRole.name.  Roles defined in ROLE_METADATA may
// not have a corresponding SystemRole row in Turso (seed data gap).  This
// helper auto-creates the row so the FK constraint is satisfied.

let _ensuredRoles = new Set<string>()

async function ensureSystemRole(roleName: string): Promise<void> {
  if (_ensuredRoles.has(roleName)) return
  const meta = ROLE_METADATA[roleName]
  if (!meta) return // unknown role — let the FK error surface naturally
  try {
    // Check if the role already exists
    const existing = await turso.execute({
      sql: `SELECT "id" FROM "SystemRole" WHERE "name" = ?`,
      args: [roleName],
    })
    if (existing.rows.length > 0) {
      _ensuredRoles.add(roleName)
      return
    }
    // Auto-create from ROLE_METADATA + DEFAULT_ROLE_PERMISSIONS
    const perms = DEFAULT_ROLE_PERMISSIONS[roleName] || []
    const now = new Date().toISOString()
    await turso.execute({
      sql: `INSERT OR IGNORE INTO "SystemRole" ("id","name","label","description","permissions","color","isSystem","isActive","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [generateId(), roleName, meta.label, meta.description || null, JSON.stringify(perms), meta.color, 1, 1, now, now],
    })
    _ensuredRoles.add(roleName)
    console.log(`[ensureSystemRole] Auto-created SystemRole "${roleName}"`)
  } catch (e) {
    console.warn(`[ensureSystemRole] Could not auto-create role "${roleName}":`, e)
  }
}

// GET /api/users - List all users (admin only)
export async function GET(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN' && role !== 'PHARMACIST') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // GET /api/users?action=roles - List available roles for dropdown
    if (action === 'roles') {
      const roles = Object.entries(ROLE_METADATA).map(([name, meta]) => ({
        name,
        label: meta.label,
        color: meta.color,
        isSystem: true,
      }))
      return NextResponse.json(roles)
    }

    // GET /api/users/profile - Get own profile
    if (action === 'profile') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json(
          { error: 'User ID required' },
          { status: 400 }
        )
      }

      if (isTurso()) {
        const cols = await existingCols(['id','email','name','role','phone','licenseNumber','permissions','active','lastLogin','createdAt','updatedAt'])
        const result = await turso.execute({
          sql: `SELECT ${cols} FROM "User" WHERE "id" = ?`,
          args: [userId],
        })
        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }
        return NextResponse.json(rowToUser(result.rows[0] as Record<string, unknown>))
      } else {
        const { db } = await import('@/lib/db')
        const user = await db.user.findUnique({
          where: { id: userId },
          select: {
            id: true, email: true, name: true, role: true, phone: true,
            licenseNumber: true, permissions: true, active: true,
            lastLogin: true, createdAt: true, updatedAt: true,
          },
        })
        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }
        return NextResponse.json(user)
      }
    }

    // GET /api/users - List all users
    if (isTurso()) {
      const cols = await existingCols(FULL_COL_LIST)
      const result = await turso.execute({
        sql: `SELECT ${cols} FROM "User" ORDER BY "createdAt" DESC`,
        args: [],
      })
      const users = result.rows.map((row) => rowToUser(row as Record<string, unknown>))
      return NextResponse.json(users)
    } else {
      const { db } = await import('@/lib/db')
      const users = await db.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, role: true, phone: true,
          licenseNumber: true, permissions: true, department: true,
          shift: true, hireDate: true, active: true, lastLogin: true,
          createdAt: true, updatedAt: true,
        },
      })
      return NextResponse.json(users)
    }
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users', detail: errMsg(error) },
      { status: 500 }
    )
  }
}

// POST /api/users - Create user (SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can create users' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, name, userRole, phone, licenseNumber, permissions, department, shift, hireDate } = body

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'username/email, password, and name are required' },
        { status: 400 }
      )
    }

    // Validate username/email: allow alphanumeric, dots, hyphens, underscores, and @ for emails
    const usernameRegex = /^[a-zA-Z0-9._@-]+$/
    if (!usernameRegex.test(email)) {
      return NextResponse.json(
        { error: 'Username can only contain letters, numbers, dots, hyphens, and underscores' },
        { status: 400 }
      )
    }

    // Hash password with bcrypt
    const hashedPassword = await hashPassword(password)

    if (isTurso()) {
      // Check for duplicate email/username
      const existing = await turso.execute({
        sql: `SELECT "id" FROM "User" WHERE "email" = ?`,
        args: [email],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'A user with this username or email already exists' },
          { status: 409 }
        )
      }

      const resolvedRole = userRole || 'CLERK'

      // Ensure the role exists in SystemRole (FK: User.role → SystemRole.name)
      await ensureSystemRole(resolvedRole)

      const id = generateId()
      const now = new Date().toISOString()

      // Build INSERT dynamically based on columns that actually exist
      const allCols = await getUserColumns()
      if (allCols.size === 0) {
        return NextResponse.json(
          { error: 'User table schema could not be detected', detail: 'PRAGMA table_info("User") returned 0 columns' },
          { status: 500 }
        )
      }
      const insertCols: string[] = []
      const insertArgs: unknown[] = []
      const placeholders: string[] = []

      const colEntries: Array<[string, unknown]> = [
        ['id', id],
        ['email', email],
        ['password', hashedPassword],
        ['name', name],
        ['role', resolvedRole],
        ['phone', phone || null],
        ['licenseNumber', licenseNumber || null],
        ['permissions', permissions ? JSON.stringify(permissions) : null],
        ['department', department || null],
        ['shift', shift || null],
        ['hireDate', hireDate || null],
        ['active', 1],
        ['createdAt', now],
        ['updatedAt', now],
      ]

      for (const [col, val] of colEntries) {
        if (allCols.has(col.toLowerCase())) {
          insertCols.push(`"${col}"`)
          insertArgs.push(val)
          placeholders.push('?')
        }
      }

      await turso.execute({
        sql: `INSERT INTO "User" (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`,
        args: insertArgs,
      })

      // Fetch the created user to return it
      const selectCols = await existingCols(['id','email','name','role','phone','licenseNumber','permissions','department','shift','hireDate','active','createdAt'])
      const result = await turso.execute({
        sql: `SELECT ${selectCols} FROM "User" WHERE "id" = ?`,
        args: [id],
      })

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid, action: 'USER_CREATED', category: 'user', entity: 'User', entityId: id, details: { email, name, role: resolvedRole }, ipAddress, userAgent })
      return NextResponse.json(rowToUser(result.rows[0] as Record<string, unknown>), { status: 201 })
    } else {
      const { db } = await import('@/lib/db')

      // Check for duplicate email/username
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json(
          { error: 'A user with this username or email already exists' },
          { status: 409 }
        )
      }

      const user = await db.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role: userRole || 'CLERK',
          phone,
          licenseNumber,
          permissions: permissions ? JSON.stringify(permissions) : null,
          department: department || null,
          shift: shift || null,
          hireDate: hireDate || null,
          active: true,
        },
        select: {
          id: true, email: true, name: true, role: true, phone: true,
          licenseNumber: true, permissions: true, department: true,
          shift: true, hireDate: true, active: true, createdAt: true,
        },
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid2, action: 'USER_CREATED', category: 'user', entity: 'User', entityId: user.id, details: { email, name, role: user.role }, ipAddress, userAgent })
      return NextResponse.json(user, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user', detail: errMsg(error) },
      { status: 500 }
    )
  }
}

// PUT /api/users - Update user (role/status or own profile)
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const targetUserId = searchParams.get('id')

    // PUT /api/users/profile - Update own profile
    if (action === 'profile') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json(
          { error: 'User ID required' },
          { status: 400 }
        )
      }

      const body = await request.json()
      const { name, phone, licenseNumber } = body

      if (isTurso()) {
        const allCols = await getUserColumns()
        const setClauses: string[] = []
        const args: unknown[] = []
        if (name !== undefined && allCols.has('name')) {
          setClauses.push(`"name" = ?`)
          args.push(name)
        }
        if (phone !== undefined && allCols.has('phone')) {
          setClauses.push(`"phone" = ?`)
          args.push(phone)
        }
        if (licenseNumber !== undefined && allCols.has('licensenumber')) {
          setClauses.push(`"licenseNumber" = ?`)
          args.push(licenseNumber)
        }
        // Always update updatedAt
        if (allCols.has('updatedat')) {
          setClauses.push(`"updatedAt" = ?`)
          args.push(new Date().toISOString())
        }

        if (setClauses.length === 0) {
          return NextResponse.json(
            { error: 'No fields to update' },
            { status: 400 }
          )
        }

        args.push(userId)

        await turso.execute({
          sql: `UPDATE "User" SET ${setClauses.join(', ')} WHERE "id" = ?`,
          args,
        })

        const selCols = await existingCols(['id','email','name','role','phone','licenseNumber','active','createdAt','updatedAt'])
        const result = await turso.execute({
          sql: `SELECT ${selCols} FROM "User" WHERE "id" = ?`,
          args: [userId],
        })

        return NextResponse.json(rowToUser(result.rows[0] as Record<string, unknown>))
      } else {
        const { db } = await import('@/lib/db')

        const user = await db.user.update({
          where: { id: userId },
          data: {
            name: name !== undefined ? name : undefined,
            phone: phone !== undefined ? phone : undefined,
            licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
          },
          select: {
            id: true, email: true, name: true, role: true, phone: true,
            licenseNumber: true, active: true, createdAt: true, updatedAt: true,
          },
        })

        return NextResponse.json(user)
      }
    }

    // PUT /api/users/[id] - Update user role/status (admin only)
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      )
    }

    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can update user roles' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { userRole, active, permissions, phone, licenseNumber, department, shift } = body

    if (isTurso()) {
      const existing = await turso.execute({
        sql: `SELECT "id", "name" FROM "User" WHERE "id" = ?`,
        args: [targetUserId],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const allCols = await getUserColumns()
      const setClauses: string[] = []
      const args: unknown[] = []
      if (userRole !== undefined) {
        // Ensure target role exists in SystemRole (FK constraint)
        await ensureSystemRole(userRole)
        setClauses.push(`"role" = ?`)
        args.push(userRole)
      }
      if (active !== undefined) {
        setClauses.push(`"active" = ?`)
        args.push(active ? 1 : 0)
      }
      if (permissions !== undefined && allCols.has('permissions')) {
        setClauses.push(`"permissions" = ?`)
        args.push(JSON.stringify(permissions))
      }
      if (phone !== undefined && allCols.has('phone')) {
        setClauses.push(`"phone" = ?`)
        args.push(phone)
      }
      if (licenseNumber !== undefined && allCols.has('licensenumber')) {
        setClauses.push(`"licenseNumber" = ?`)
        args.push(licenseNumber)
      }
      if (department !== undefined && allCols.has('department')) {
        setClauses.push(`"department" = ?`)
        args.push(department)
      }
      if (shift !== undefined && allCols.has('shift')) {
        setClauses.push(`"shift" = ?`)
        args.push(shift)
      }
      // Always update updatedAt
      if (allCols.has('updatedat')) {
        setClauses.push(`"updatedAt" = ?`)
        args.push(new Date().toISOString())
      }

      args.push(targetUserId)

      await turso.execute({
        sql: `UPDATE "User" SET ${setClauses.join(', ')} WHERE "id" = ?`,
        args,
      })

      const selCols = await existingCols(FULL_COL_LIST)
      const result = await turso.execute({
        sql: `SELECT ${selCols} FROM "User" WHERE "id" = ?`,
        args: [targetUserId],
      })

      const { userId: aUid3, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid3, action: 'USER_UPDATED', category: 'user', entity: 'User', entityId: targetUserId, details: { userRole, active }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(rowToUser(result.rows[0] as Record<string, unknown>))
    } else {
      const { db } = await import('@/lib/db')

      const existing = await db.user.findUnique({ where: { id: targetUserId } })
      if (!existing) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const user = await db.user.update({
        where: { id: targetUserId },
        data: {
          role: userRole !== undefined ? userRole : undefined,
          active: active !== undefined ? active : undefined,
          permissions: permissions !== undefined ? JSON.stringify(permissions) : undefined,
          phone: phone !== undefined ? phone : undefined,
          licenseNumber: licenseNumber !== undefined ? licenseNumber : undefined,
          department: department !== undefined ? department : undefined,
          shift: shift !== undefined ? shift : undefined,
        },
        select: {
          id: true, email: true, name: true, role: true, phone: true,
          licenseNumber: true, permissions: true, department: true,
          shift: true, hireDate: true, active: true, createdAt: true, updatedAt: true,
        },
      })

      const { userId: aUid4, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid4, action: 'USER_UPDATED', category: 'user', entity: 'User', entityId: user.id, details: { userRole, active }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(user)
    }
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user', detail: errMsg(error) },
      { status: 500 }
    )
  }
}

// DELETE /api/users?id=<userId> - Delete user (SUPER_ADMIN only)
export async function DELETE(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only SUPER_ADMIN can delete users' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('id')
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      )
    }

    // Prevent self-deletion
    const callerId = request.headers.get('x-user-id')
    if (callerId === targetUserId) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      const existing = await turso.execute({
        sql: `SELECT "id", "name" FROM "User" WHERE "id" = ?`,
        args: [targetUserId],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const existingName = existing.rows[0].name as string

      await turso.execute({
        sql: `DELETE FROM "User" WHERE "id" = ?`,
        args: [targetUserId],
      })

      return NextResponse.json({ success: true, message: `User "${existingName}" deleted` })
    } else {
      const { db } = await import('@/lib/db')

      const existing = await db.user.findUnique({ where: { id: targetUserId } })
      if (!existing) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      await db.user.delete({ where: { id: targetUserId } })

      return NextResponse.json({ success: true, message: `User "${existing.name}" deleted` })
    }
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json(
      { error: 'Failed to delete user', detail: errMsg(error) },
      { status: 500 }
    )
  }
}
