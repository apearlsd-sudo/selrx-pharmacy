import { NextRequest, NextResponse } from 'next/server'
import { isTurso, tursoExecute } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// Loyalty tier thresholds
const TIERS = [
  { name: 'BRONZE', minPoints: 0, discountPercent: 0 },
  { name: 'SILVER', minPoints: 500, discountPercent: 2 },
  { name: 'GOLD', minPoints: 2000, discountPercent: 5 },
  { name: 'PLATINUM', minPoints: 5000, discountPercent: 10 },
]

function getTier(points: number) {
  let tier = TIERS[0]
  for (const t of TIERS) {
    if (points >= t.minPoints) tier = t
  }
  return tier
}

function getNextTierInfo(points: number) {
  const nextTier = TIERS.find(t => t.minPoints > points) || null
  return {
    nextTier,
    pointsToNextTier: nextTier ? nextTier.minPoints - points : 0,
  }
}

// POST /api/customers/[id]/loyalty — adjust points (add or redeem)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = request.headers.get('x-user-id')
    if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { action, amount, reason } = body // action: 'add' | 'redeem'

    if (!action || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid action (add/redeem) and positive amount required' }, { status: 400 })
    }
    if (action === 'redeem' && amount > 100000) {
      return NextResponse.json({ error: 'Cannot redeem more than 100,000 points at once' }, { status: 400 })
    }

    if (isTurso()) {
      const result = await tursoExecute({
        sql: 'SELECT "loyaltyPoints", "loyaltyTier" FROM Customer WHERE id = ?',
        args: [id],
      })
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }

      const currentPoints = Number(result.rows[0][0]) || 0
      let newPoints: number
      if (action === 'add') {
        newPoints = currentPoints + amount
      } else {
        if (amount > currentPoints) {
          return NextResponse.json({ error: `Insufficient points. Customer has ${currentPoints}` }, { status: 400 })
        }
        newPoints = currentPoints - amount
      }

      const newTier = getTier(newPoints)
      const now = new Date().toISOString()
      await tursoExecute({
        sql: 'UPDATE Customer SET "loyaltyPoints" = ?, "loyaltyTier" = ?, "updatedAt" = ? WHERE id = ?',
        args: [newPoints, newTier.name, now, id],
      })

      const { ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({
        userId,
        action: action === 'add' ? 'LOYALTY_POINTS_ADDED' : 'LOYALTY_POINTS_REDEEMED',
        category: 'customer',
        entity: 'Customer',
        entityId: id,
        details: { previousPoints: currentPoints, newPoints, amount, reason: reason || null, newTier: newTier.name },
        ipAddress,
        userAgent,
      })

      return NextResponse.json({
        loyaltyPoints: newPoints,
        loyaltyTier: newTier.name,
        tierDiscount: newTier.discountPercent,
        previousPoints: currentPoints,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const currentPoints = customer.loyaltyPoints || 0
    let newPoints: number
    if (action === 'add') {
      newPoints = currentPoints + amount
    } else {
      if (amount > currentPoints) {
        return NextResponse.json({ error: `Insufficient points. Customer has ${currentPoints}` }, { status: 400 })
      }
      newPoints = currentPoints - amount
    }

    const newTier = getTier(newPoints)
    await db.customer.update({
      where: { id },
      data: { loyaltyPoints: newPoints, loyaltyTier: newTier.name },
    })

    const { ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId,
      action: action === 'add' ? 'LOYALTY_POINTS_ADDED' : 'LOYALTY_POINTS_REDEEMED',
      category: 'customer',
      entity: 'Customer',
      entityId: id,
      details: { previousPoints: currentPoints, newPoints, amount, reason: reason || null, newTier: newTier.name },
      ipAddress,
      userAgent,
    })

    return NextResponse.json({
      loyaltyPoints: newPoints,
      loyaltyTier: newTier.name,
      tierDiscount: newTier.discountPercent,
      previousPoints: currentPoints,
    })
  } catch (error) {
    console.error('Error adjusting loyalty points:', error)
    return NextResponse.json({ error: 'Failed to adjust loyalty points' }, { status: 500 })
  }
}

// GET /api/customers/[id]/loyalty — get loyalty info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    if (isTurso()) {
      const result = await tursoExecute({
        sql: 'SELECT "loyaltyPoints", "loyaltyTier" FROM Customer WHERE id = ?',
        args: [id],
      })
      if (result.rows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

      const points = Number(result.rows[0][0]) || 0
      const tier = getTier(points)
      const { nextTier, pointsToNextTier } = getNextTierInfo(points)

      return NextResponse.json({
        loyaltyPoints: points,
        loyaltyTier: tier.name,
        tierDiscount: tier.discountPercent,
        nextTier,
        pointsToNextTier,
      })
    }

    const { db } = await import('@/lib/db')
    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const points = customer.loyaltyPoints || 0
    const tier = getTier(points)
    const { nextTier, pointsToNextTier } = getNextTierInfo(points)

    return NextResponse.json({
      loyaltyPoints: points,
      loyaltyTier: tier.name,
      tierDiscount: tier.discountPercent,
      nextTier,
      pointsToNextTier,
    })
  } catch (error) {
    console.error('Error fetching loyalty info:', error)
    return NextResponse.json({ error: 'Failed to fetch loyalty info' }, { status: 500 })
  }
}
