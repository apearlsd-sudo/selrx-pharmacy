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
          include: { product: { select: { id: true, name: true, ndc: true, category: true, unitOfMeasure: true, expiryDate: true, sellingPrice: true, costPrice: true, dosageForm: true, strength: true } } },
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
      // 1) Fetch all counted items with product details for reporting
      const countedItems = await db.stockTakeItem.findMany({
        where: { stockTakeId: id, countedQty: { not: null } },
        include: {
          product: {
            select: {
              id: true, name: true, ndc: true, category: true, unitOfMeasure: true,
              expiryDate: true, costPrice: true, sellingPrice: true, dosageForm: true,
              strength: true, reorderPoint: true, reorderQty: true,
              manufacturer: true, manufacturerRef: { select: { name: true } },
              vendor: { select: { name: true } },
            },
          },
        },
      })

      // 2) Update Inventory table: set quantity = countedQty
      let updatedInventoryCount = 0
      const now = new Date()
      for (const item of countedItems) {
        if (item.countedQty === null) continue
        const qty = Number(item.countedQty) || 0
        try {
          await db.inventory.upsert({
            where: { productId: item.productId },
            create: {
              productId: item.productId,
              quantity: qty,
              lastCounted: now,
            },
            update: {
              quantity: qty,
              lastCounted: now,
            },
          })
          updatedInventoryCount++
        } catch (invErr) {
          console.error(`[StockTake Complete] Failed to update inventory for product ${item.productId}:`, invErr)
        }
      }

      // 3) Mark stock take as COMPLETED
      const updated = await db.stockTake.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          notes: notes !== undefined ? notes : existing.notes,
        },
      })

      // 4) Generate report data: expired goods & stock variance
      const expiredGoods = countedItems
        .filter((item) => {
          const exp = item.product.expiryDate
          return exp && new Date(exp) < now
        })
        .map((item) => {
          const costPrice = Number(item.product.costPrice) || 0
          const qty = Number(item.countedQty) || 0
          return {
            productId: item.productId,
            productName: item.product.name,
            ndc: item.product.ndc,
            category: item.product.category,
            dosageForm: item.product.dosageForm,
            strength: item.product.strength,
            expiryDate: item.product.expiryDate,
            countedQty: qty,
            costPrice,
            totalCost: costPrice * qty,
          }
        })
        .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())

      const expiredTotalCost = expiredGoods.reduce((sum, g) => sum + g.totalCost, 0)

      // Variance items: where countedQty != systemQty (shortage or surplus)
      const varianceItems = countedItems
        .filter((item) => item.countedQty !== null && Number(item.countedQty) !== Number(item.systemQty))
        .map((item) => {
          const counted = Number(item.countedQty) || 0
          const system = Number(item.systemQty) || 0
          const variance = counted - system
          const costPrice = Number(item.product.costPrice) || 0
          return {
            productId: item.productId,
            productName: item.product.name,
            ndc: item.product.ndc,
            category: item.product.category,
            dosageForm: item.product.dosageForm,
            strength: item.product.strength,
            systemQty: system,
            countedQty: counted,
            variance,
            varianceType: variance < 0 ? 'SHORTAGE' : 'SURPLUS',
            unitCost: costPrice,
            totalCost: Math.abs(variance) * costPrice,
          }
        })
        .sort((a, b) => a.variance - b.variance) // shortages first

      const shortageItems = varianceItems.filter((v) => v.variance < 0)
      const surplusItems = varianceItems.filter((v) => v.variance > 0)
      const shortageTotalCost = shortageItems.reduce((sum, v) => sum + v.totalCost, 0)
      const surplusTotalCost = surplusItems.reduce((sum, v) => sum + v.totalCost, 0)

      const report = {
        generatedAt: now.toISOString(),
        stockTakeRef: updated.reference,
        stockTakeId: id,
        completedAt: updated.completedAt?.toISOString(),
        totalItemsChecked: countedItems.length,
        expiredGoods: {
          count: expiredGoods.length,
          totalCost: expiredTotalCost,
          items: expiredGoods,
        },
        stockVariance: {
          totalVarianceItems: varianceItems.length,
          shortageCount: shortageItems.length,
          shortageTotalCost,
          surplusCount: surplusItems.length,
          surplusTotalCost,
          items: varianceItems,
        },
      }

      console.log(`[StockTake Complete] id=${id} updated ${updatedInventoryCount} inventory records`)
      return NextResponse.json({
        ...updated,
        _meta: { inventoryUpdated: updatedInventoryCount, totalItems: countedItems.length },
        _report: report,
      })
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
        const countedQty = Number(item.countedQty)
        const systemQty = Number(item.systemQty)
        const variance = item.countedQty !== null ? countedQty - systemQty : null
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
