import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, generateId, safeArgs } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Loyalty Tier Rules ──────────────────────────────────────────────
const LOYALTY_TIERS = [
  { name: 'BRONZE', minPoints: 0, maxPoints: 499, bonusPercent: 0 },
  { name: 'SILVER', minPoints: 500, maxPoints: 1499, bonusPercent: 2 },
  { name: 'GOLD', minPoints: 1500, maxPoints: 4999, bonusPercent: 5 },
  { name: 'PLATINUM', minPoints: 5000, maxPoints: Infinity, bonusPercent: 10 },
]

function getTier(points: number) {
  return LOYALTY_TIERS.find(t => points >= t.minPoints && points <= t.maxPoints) || LOYALTY_TIERS[0]
}

// ── Ensure LoyaltyTransaction table exists (Turso path, idempotent) ──
let tableEnsured = false
async function ensureTable() {
  if (tableEnsured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
        id              TEXT PRIMARY KEY,
        "customerId"    TEXT NOT NULL,
        "transactionId" TEXT,
        points          INTEGER NOT NULL,
        action          TEXT NOT NULL DEFAULT 'EARNED',
        description     TEXT,
        "balanceAfter"  INTEGER NOT NULL DEFAULT 0,
        "createdBy"     TEXT,
        "createdAt"     TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_customerId" ON "LoyaltyTransaction"("customerId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_transactionId" ON "LoyaltyTransaction"("transactionId")`,
      args: [],
    })
    tableEnsured = true
    console.log('[loyalty] LoyaltyTransaction table ensured')
  } catch (err) {
    console.error('[loyalty] Failed to ensure table:', err)
  }
}

// ── Helpers ──

function mapRow(row: any) {
  return {
    id: row.id,
    customerId: row.customerId,
    transactionId: row.transactionId || null,
    points: Number(row.points),
    action: row.action,
    description: row.description || null,
    balanceAfter: Number(row.balanceAfter ?? 0),
    createdBy: row.createdBy || null,
    createdAt: row.createdAt,
  }
}

async function getCurrentPoints(customerId: string): Promise<number> {
  if (isTurso()) {
    const result = await tursoExecute({
      sql: `SELECT COALESCE(SUM(points), 0) as total FROM "LoyaltyTransaction" WHERE "customerId" = ?`,
      args: [customerId],
    })
    return Number(result.rows[0]?.total ?? 0)
  } else {
    const { db } = await import('@/lib/db')
    const agg = await db.loyaltyTransaction.aggregate({
      where: { customerId },
      _sum: { points: true },
    })
    return Number(agg._sum.points ?? 0)
  }
}

async function updateCustomerTier(customerId: string, points: number) {
  const tier = getTier(points)
  const now = new Date().toISOString()
  if (isTurso()) {
    await tursoExecute({
      sql: `UPDATE "Customer" SET "loyaltyPoints" = ?, "loyaltyTier" = ?, "updatedAt" = ? WHERE id = ?`,
      args: [points, tier.name, now, customerId],
    })
  } else {
    const { db } = await import('@/lib/db')
    await db.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: points, loyaltyTier: tier.name },
    })
  }
}

// ── GET /api/loyalty ──
// ?customerId=... → loyalty transactions + current points and tier

export async function GET(request: NextRequest) {
  try {
    if (isTurso()) await ensureTable()

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customerId')

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    // Get current points
    const currentPoints = await getCurrentPoints(customerId)
    const tier = getTier(currentPoints)

    // Get recent transactions
    let transactions: any[] = []
    if (isTurso()) {
      const result = await tursoExecute({
        sql: `SELECT * FROM "LoyaltyTransaction" WHERE "customerId" = ? ORDER BY "createdAt" DESC LIMIT 50`,
        args: [customerId],
      })
      transactions = result.rows.map(mapRow)
    } else {
      const { db } = await import('@/lib/db')
      const entries = await db.loyaltyTransaction.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      transactions = entries.map(e => ({
        id: e.id,
        customerId: e.customerId,
        transactionId: e.transactionId,
        points: e.points,
        action: e.action,
        description: e.description,
        balanceAfter: e.balanceAfter,
        createdBy: e.createdBy,
        createdAt: e.createdAt.toISOString(),
      }))
    }

    // Calculate next tier info
    const nextTier = LOYALTY_TIERS.find(t => t.minPoints > currentPoints) || null
    const pointsToNextTier = nextTier ? nextTier.minPoints - currentPoints : 0

    return NextResponse.json({
      points: currentPoints,
      tier: tier.name,
      bonusPercent: tier.bonusPercent,
      nextTier: nextTier ? { name: nextTier.name, minPoints: nextTier.minPoints } : null,
      pointsToNextTier,
      transactions,
    })
  } catch (error) {
    console.error('Error fetching loyalty data:', error)
    return NextResponse.json({ error: 'Failed to fetch loyalty data' }, { status: 500 })
  }
}

// ── POST /api/loyalty ──
// Body: { customerId, points (positive=add, negative=deduct), action: 'ADJUSTED'|'EARNED'|'REDEEMED', description, transactionId? }

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { customerId, points, action, description, transactionId } = body

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (points === undefined || points === null || isNaN(Number(points)) || Number(points) === 0) {
      return NextResponse.json({ error: 'points is required and must be non-zero' }, { status: 400 })
    }

    if (isTurso()) await ensureTable()

    const userId = request.headers.get('x-user-id') || null
    const numericPoints = Math.round(Number(points))
    const actionType = action || 'ADJUSTED'

    // Calculate current balance
    const currentPoints = await getCurrentPoints(customerId)
    const newPoints = currentPoints + numericPoints

    // Prevent negative balance (except for EARNED/ADJUSTED with positive points)
    if (newPoints < 0) {
      return NextResponse.json({
        error: 'Insufficient points',
        details: { currentPoints, attempted: numericPoints },
      }, { status: 400 })
    }

    const id = generateId()
    const now = new Date().toISOString()

    try {
      if (isTurso()) {
        await tursoExecute({
          sql: `INSERT INTO "LoyaltyTransaction" (id, "customerId", "transactionId", points, action, description, "balanceAfter", "createdBy", "createdAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: safeArgs([id, customerId, transactionId || null, numericPoints, actionType, description || null, newPoints, userId, now]),
        })
      } else {
        const { db } = await import('@/lib/db')
        await db.loyaltyTransaction.create({
          data: {
            id,
            customerId,
            transactionId: transactionId || null,
            points: numericPoints,
            action: actionType,
            description: description || null,
            balanceAfter: newPoints,
            createdBy: userId,
          },
        })
      }
    } catch (err) {
      console.error('Error inserting loyalty transaction:', err)
      return NextResponse.json({ error: 'Failed to create loyalty transaction' }, { status: 500 })
    }

    // Update customer tier on Customer table
    await updateCustomerTier(customerId, newPoints).catch(() => {})

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId: userId || undefined,
      action: `LOYALTY_POINTS_${actionType}`,
      category: 'customer',
      entity: 'LoyaltyTransaction',
      entityId: id,
      details: { customerId, points: numericPoints, balanceAfter: newPoints, action: actionType },
      ipAddress,
      userAgent,
    }).catch(() => {})

    const tier = getTier(newPoints)
    return NextResponse.json({
      id,
      customerId,
      transactionId: transactionId || null,
      points: numericPoints,
      action: actionType,
      description: description || null,
      balanceAfter: newPoints,
      currentPoints,
      newTier: tier.name,
      bonusPercent: tier.bonusPercent,
      createdBy: userId,
      createdAt: now,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating loyalty transaction:', error)
    return NextResponse.json({ error: 'Failed to create loyalty transaction' }, { status: 500 })
  }
}
