import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stock-take/[id] — get single stock take with items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const stockTake = await db.stockTake.findUnique({
      where: { id },
      include: {
        countedByUser: { select: { name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, ndc: true, category: true, unitOfMeasure: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!stockTake) {
      return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
    }
    return NextResponse.json(stockTake)
  } catch (error) {
    console.error('Error fetching stock take:', error)
    return NextResponse.json({ error: 'Failed to fetch stock take' }, { status: 500 })
  }
}

// PUT /api/stock-take/[id] — update stock take (add items, complete, cancel)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, items, notes } = body

    const existing = await db.stockTake.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
    }

    if (action === 'complete') {
      // Set variances and complete the stock take
      const updated = await db.stockTake.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          notes: notes !== undefined ? notes : existing.notes,
        },
      })
      return NextResponse.json(updated)
    }

    if (action === 'cancel') {
      const updated = await db.stockTake.update({
        where: { id },
        data: { status: 'CANCELLED' },
      })
      return NextResponse.json(updated)
    }

    if (action === 'update-item' && items) {
      // Upsert each item's countedQty and variance
      for (const item of items) {
        const variance = item.countedQty !== null ? item.countedQty - item.systemQty : null
        await db.stockTakeItem.upsert({
          where: {
            stockTakeId_productId: { stockTakeId: id, productId: item.productId },
          },
          create: {
            stockTakeId: id,
            productId: item.productId,
            systemQty: item.systemQty,
            countedQty: item.countedQty,
            variance,
            notes: item.notes || null,
          },
          update: {
            countedQty: item.countedQty,
            variance,
            notes: item.notes || null,
          },
        })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error updating stock take:', error)
    return NextResponse.json({ error: 'Failed to update stock take' }, { status: 500 })
  }
}

// DELETE /api/stock-take/[id] — delete a stock take and its items
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await db.stockTake.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
    }
    // Delete items first (Prisma relation), then the stock take
    await db.stockTakeItem.deleteMany({ where: { stockTakeId: id } })
    await db.stockTake.delete({ where: { id } })
    return NextResponse.json({ success: true, message: 'Stock take deleted' })
  } catch (error) {
    console.error('Error deleting stock take:', error)
    return NextResponse.json({ error: 'Failed to delete stock take' }, { status: 500 })
  }
}
