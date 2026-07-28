import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/inventory - List inventory with stock levels
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // GET /api/inventory/alerts - Get low stock alerts
    if (action === 'alerts') {
      const alerts = await db.inventory.findMany({
        where: {
          quantity: {
            lte: db.inventory.fields.product.reorderPoint,
          },
        },
        include: {
          product: true,
        },
        orderBy: { quantity: 'asc' },
      })

      // Re-query with proper filter since Prisma doesn't support that syntax directly
      const allInventory = await db.inventory.findMany({
        include: {
          product: true,
        },
      })

      const lowStockAlerts = allInventory.filter(
        (inv) => inv.quantity <= inv.product.reorderPoint
      )

      return NextResponse.json(lowStockAlerts)
    }

    // Regular inventory list — include products WITHOUT inventory records (qty=0)
    const inventory = await db.inventory.findMany({
      include: {
        product: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Also find products that have NO inventory record yet
    const productsWithInventory = new Set(inventory.map(i => i.productId))
    const productsWithoutInventory = await db.product.findMany({
      where: { id: { notIn: Array.from(productsWithInventory) } },
    })

    // Merge: products without inventory show qty=0
    const merged = [
      ...inventory,
      ...productsWithoutInventory.map(p => ({
        id: `no-inv-${p.id}`,
        productId: p.id,
        quantity: 0,
        lastCounted: null,
        product: p,
      })),
    ]

    return NextResponse.json(merged)
  } catch (error) {
    console.error('Error fetching inventory:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    )
  }
}

// PUT /api/inventory - Update stock level (adjustment with reason)
export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (
      role !== 'PHARMACIST' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'TECHNICIAN'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // POST /api/inventory/receive mapped to PUT for stock receive
    if (action === 'receive') {
      const body = await request.json()
      const { items } = body

      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { error: 'Items array is required' },
          { status: 400 }
        )
      }

      const results = []

      for (const item of items) {
        const existing = await db.inventory.findUnique({
          where: { productId: item.productId },
        })

        if (existing) {
          const updated = await db.inventory.update({
            where: { productId: item.productId },
            data: {
              quantity: existing.quantity + item.quantity,
              lastCounted: new Date(),
            },
            include: { product: true },
          })
          results.push(updated)
        } else {
          const created = await db.inventory.create({
            data: {
              productId: item.productId,
              quantity: item.quantity,
              lastCounted: new Date(),
            },
            include: { product: true },
          })
          results.push(created)
        }
      }

      return NextResponse.json({
        message: 'Stock received successfully',
        updatedItems: results,
      })
    }

    // Regular stock adjustment
    const body = await request.json()
    const { productId, quantity, adjustment, reason } = body

    if (!productId || adjustment === undefined || !reason) {
      return NextResponse.json(
        { error: 'productId, adjustment, and reason are required' },
        { status: 400 }
      )
    }

    const existing = await db.inventory.findUnique({
      where: { productId },
      include: { product: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Inventory record not found for this product' },
        { status: 404 }
      )
    }

    const newQuantity = existing.quantity + adjustment

    if (newQuantity < 0) {
      return NextResponse.json(
        { error: 'Insufficient stock for this adjustment' },
        { status: 400 }
      )
    }

    const updated = await db.inventory.update({
      where: { productId },
      data: {
        quantity: newQuantity,
        lastCounted: new Date(),
      },
      include: { product: true },
    })

    return NextResponse.json({
      message: `Stock adjusted: ${adjustment > 0 ? '+' : ''}${adjustment} (${reason})`,
      inventory: updated,
    })
  } catch (error) {
    console.error('Error updating inventory:', error)
    return NextResponse.json(
      { error: 'Failed to update inventory' },
      { status: 500 }
    )
  }
}

// POST /api/inventory/receive - Receive new stock shipment
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (
      role !== 'PHARMACIST' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'TECHNICIAN'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Items array is required' },
        { status: 400 }
      )
    }

    const results = []

    for (const item of items) {
      if (!item.productId || !item.quantity) {
        continue
      }

      const existing = await db.inventory.findUnique({
        where: { productId: item.productId },
      })

      if (existing) {
        const updated = await db.inventory.update({
          where: { productId: item.productId },
          data: {
            quantity: existing.quantity + item.quantity,
            lastCounted: new Date(),
          },
          include: { product: true },
        })
        results.push(updated)
      } else {
        const created = await db.inventory.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            lastCounted: new Date(),
          },
          include: { product: true },
        })
        results.push(created)
      }
    }

    return NextResponse.json({
      message: 'Stock received successfully',
      receivedItems: results,
      count: results.length,
    })
  } catch (error) {
    console.error('Error receiving stock:', error)
    return NextResponse.json(
      { error: 'Failed to receive stock' },
      { status: 500 }
    )
  }
}
