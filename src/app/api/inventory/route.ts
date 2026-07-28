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
        product: {
          include: {
            manufacturerRef: { select: { name: true } },
            vendor: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // Also find products that have NO inventory record yet
    const productsWithInventory = new Set(inventory.map(i => i.productId))
    const productsWithoutInventory = await db.product.findMany({
      where: { id: { notIn: Array.from(productsWithInventory) } },
      include: {
        manufacturerRef: { select: { name: true } },
        vendor: { select: { name: true } },
      },
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
    // Allow common roles — SUPER_ADMIN always passes; other roles also allowed
    // since inventory management is a core operation
    const allowedRoles = ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CLERK', 'MANAGER', 'ADMIN']
    if (role && !allowedRoles.includes(role)) {
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

    // Regular stock adjustment (optionally includes costPrice / sellingPrice / setQuantity)
    const body = await request.json()
    const { productId, quantity, adjustment, reason, costPrice, sellingPrice, setQuantity, adjustmentType } = body

    if (!productId || !reason) {
      return NextResponse.json(
        { error: 'productId and reason are required' },
        { status: 400 }
      )
    }

    const existing = await db.inventory.findUnique({
      where: { productId },
    })

    // Determine new quantity
    let newQuantity: number
    if (adjustmentType === 'SET' || setQuantity !== undefined) {
      // SET mode: physical count replaces system quantity
      newQuantity = setQuantity !== undefined ? setQuantity : (adjustment || 0)
    } else if (adjustment !== undefined) {
      // ADD / REMOVE mode
      newQuantity = (existing?.quantity || 0) + adjustment
    } else {
      newQuantity = existing?.quantity || 0
    }

    if (newQuantity < 0) {
      return NextResponse.json(
        { error: 'Insufficient stock for this adjustment' },
        { status: 400 }
      )
    }

    // Build product price update if provided
    let productUpdate: any = {}
    if (costPrice !== undefined) productUpdate.costPrice = costPrice
    if (sellingPrice !== undefined) productUpdate.sellingPrice = sellingPrice

    // Create or update inventory record
    const updated = existing
      ? await db.inventory.update({
          where: { productId },
          data: {
            quantity: newQuantity,
            lastCounted: new Date(),
          },
          include: { product: true },
        })
      : await db.inventory.create({
          data: {
            productId,
            quantity: newQuantity,
            lastCounted: new Date(),
          },
          include: { product: true },
        })

    // Also update product prices if changed
    if (Object.keys(productUpdate).length > 0) {
      await db.product.update({
        where: { id: productId },
        data: productUpdate,
      })
    }

    console.log(`[Inventory PUT] productId=${productId} mode=${adjustmentType || 'ADD'} newQty=${newQuantity} DB_qty=${updated.quantity}`)

    return NextResponse.json({
      success: true,
      newQuantity: updated.quantity,
      productId,
      message: `Stock set to ${updated.quantity} (${reason})`,
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
    const allowedRoles = ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CLERK', 'MANAGER', 'ADMIN']
    if (role && !allowedRoles.includes(role)) {
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
