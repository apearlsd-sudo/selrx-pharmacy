import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stock-take — list stock takes or generate report for a completed stock take
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const stockTakeId = searchParams.get('id')

    // GET /api/stock-take?action=report&id=xxx — generate report for completed stock take
    if (action === 'report' && stockTakeId) {
      const now = new Date()
      const countedItems = await db.stockTakeItem.findMany({
        where: { stockTakeId, countedQty: { not: null } },
        include: {
          product: {
            select: {
              id: true, name: true, ndc: true, category: true, unitOfMeasure: true,
              expiryDate: true, costPrice: true, sellingPrice: true, dosageForm: true,
              strength: true, reorderPoint: true,
            },
          },
          stockTake: { select: { reference: true, completedAt: true, countedByUser: { select: { name: true, email: true } } } },
        },
      })

      const stockTake = await db.stockTake.findUnique({ where: { id: stockTakeId } })
      if (!stockTake) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }

      const expiredGoods = countedItems
        .filter((item) => {
          const exp = item.product.expiryDate
          return exp && new Date(exp) < now
        })
        .map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          ndc: item.product.ndc,
          category: item.product.category,
          dosageForm: item.product.dosageForm,
          strength: item.product.strength,
          expiryDate: item.product.expiryDate,
          countedQty: item.countedQty!,
          costPrice: item.product.costPrice || 0,
          totalCost: (item.product.costPrice || 0) * item.countedQty!,
        }))
        .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())

      const expiredTotalCost = expiredGoods.reduce((sum, g) => sum + g.totalCost, 0)

      const varianceItems = countedItems
        .filter((item) => item.countedQty !== null && item.countedQty !== item.systemQty)
        .map((item) => {
          const variance = item.countedQty! - item.systemQty
          const costPrice = item.product.costPrice || 0
          return {
            productId: item.productId,
            productName: item.product.name,
            ndc: item.product.ndc,
            category: item.product.category,
            dosageForm: item.product.dosageForm,
            strength: item.product.strength,
            systemQty: item.systemQty,
            countedQty: item.countedQty!,
            variance,
            varianceType: variance < 0 ? 'SHORTAGE' : 'SURPLUS',
            unitCost: costPrice,
            totalCost: Math.abs(variance) * costPrice,
          }
        })
        .sort((a, b) => a.variance - b.variance)

      const shortageItems = varianceItems.filter((v) => v.variance < 0)
      const surplusItems = varianceItems.filter((v) => v.variance > 0)
      const shortageTotalCost = shortageItems.reduce((sum, v) => sum + v.totalCost, 0)
      const surplusTotalCost = surplusItems.reduce((sum, v) => sum + v.totalCost, 0)

      return NextResponse.json({
        generatedAt: now.toISOString(),
        stockTakeRef: stockTake.reference,
        completedAt: stockTake.completedAt?.toISOString(),
        countedBy: countedItems[0]?.stockTake?.countedByUser?.name || null,
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
      })
    }

    const stockTakes = await db.stockTake.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        countedByUser: { select: { name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, ndc: true, category: true, unitOfMeasure: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    return NextResponse.json(stockTakes)
  } catch (error) {
    console.error('Error fetching stock takes:', error)
    return NextResponse.json({ error: 'Failed to fetch stock takes' }, { status: 500 })
  }
}

// POST /api/stock-take — create a new stock take
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { notes, countedBy } = body

    // Generate a unique reference: find the highest numeric suffix and increment
    const allTakes = await db.stockTake.findMany({
      select: { reference: true },
      orderBy: { createdAt: 'desc' },
    })

    let maxNum = 0
    for (const st of allTakes) {
      const match = st.reference?.match(/ST-(\d+)/)
      if (match) {
        const num = Number(match[1])
        if (num > maxNum) maxNum = num
      }
    }
    const ref = `ST-${String(maxNum + 1).padStart(4, '0')}`

    console.log(`[StockTake Create] ref=${ref} notes=${notes || 'none'}`)

    const stockTake = await db.stockTake.create({
      data: {
        reference: ref,
        status: 'IN_PROGRESS',
        notes: notes || null,
        countedBy: countedBy || null,
        startedAt: new Date(),
      },
    })

    console.log(`[StockTake Create] success id=${stockTake.id}`)
    return NextResponse.json(stockTake, { status: 201 })
  } catch (error) {
    console.error('[StockTake Create] error:', error)
    return NextResponse.json({ error: 'Failed to create stock take', details: String(error) }, { status: 500 })
  }
}
