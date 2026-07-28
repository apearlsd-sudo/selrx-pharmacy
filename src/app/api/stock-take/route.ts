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
              strength: true, reorderPoint: true, reorderQty: true,
              manufacturer: true, manufacturerRef: { select: { name: true } },
              vendor: { select: { name: true } },
            },
          },
          stockTake: { select: { reference: true, completedAt: true, startedAt: true, notes: true, countedByUser: { select: { name: true, email: true } } } },
        },
      })

      const stockTake = await db.stockTake.findUnique({ where: { id: stockTakeId } })
      if (!stockTake) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }

      const helper = (item: typeof countedItems[number]) => {
        const mfgName = item.product.manufacturerRef?.name || item.product.manufacturer || null
        const vendorName = item.product.vendor?.name || null
        const costPrice = Number(item.product.costPrice) || 0
        const sellingPrice = Number(item.product.sellingPrice) || 0
        return { mfgName, vendorName, costPrice, sellingPrice }
      }

      // Expired goods
      const expiredGoods = countedItems
        .filter((item) => { const exp = item.product.expiryDate; return exp && new Date(exp) < now })
        .map((item) => {
          const { mfgName, vendorName, costPrice, sellingPrice } = helper(item)
          const qty = Number(item.countedQty) || 0
          return {
            productId: item.productId, productName: item.product.name, ndc: item.product.ndc,
            category: item.product.category, dosageForm: item.product.dosageForm, strength: item.product.strength,
            expiryDate: item.product.expiryDate, countedQty: qty,
            costPrice, sellingPrice,
            totalCost: costPrice * qty,
            potentialRevenue: sellingPrice * qty,
            manufacturer: mfgName, vendor: vendorName,
            daysSinceExpiry: item.product.expiryDate ? Math.floor((now.getTime() - new Date(item.product.expiryDate!).getTime()) / 86400000) : 0,
          }
        })
        .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())

      const expiredTotalCost = expiredGoods.reduce((s, g) => s + g.totalCost, 0)
      const expiredTotalRevenue = expiredGoods.reduce((s, g) => s + g.potentialRevenue, 0)

      // Near-expiry goods (within 90 days)
      const ninetyDays = 90 * 86400000
      const nearExpiryGoods = countedItems
        .filter((item) => {
          const exp = item.product.expiryDate
          if (!exp) return false
          const expTime = new Date(exp).getTime()
          return expTime >= now.getTime() && expTime <= now.getTime() + ninetyDays
        })
        .map((item) => {
          const { mfgName, vendorName, costPrice, sellingPrice } = helper(item)
          const qty = Number(item.countedQty) || 0
          return {
            productId: item.productId, productName: item.product.name, ndc: item.product.ndc,
            category: item.product.category, dosageForm: item.product.dosageForm, strength: item.product.strength,
            expiryDate: item.product.expiryDate, countedQty: qty,
            costPrice, sellingPrice,
            totalCost: costPrice * qty,
            potentialRevenue: sellingPrice * qty,
            manufacturer: mfgName, vendor: vendorName,
            daysToExpiry: item.product.expiryDate ? Math.ceil((new Date(item.product.expiryDate!).getTime() - now.getTime()) / 86400000) : 0,
          }
        })
        .sort((a, b) => a.daysToExpiry - b.daysToExpiry)

      const nearExpiryTotalCost = nearExpiryGoods.reduce((s, g) => s + g.totalCost, 0)
      const nearExpiryTotalRevenue = nearExpiryGoods.reduce((s, g) => s + g.potentialRevenue, 0)

      // Variance items
      const varianceItems = countedItems
        .filter((item) => item.countedQty !== null && Number(item.countedQty) !== Number(item.systemQty))
        .map((item) => {
          const counted = Number(item.countedQty) || 0
          const system = Number(item.systemQty) || 0
          const variance = counted - system
          const { mfgName, vendorName, costPrice } = helper(item)
          const variancePercent = system > 0 ? Math.round((variance / system) * 10000) / 100 : 0
          return {
            productId: item.productId, productName: item.product.name, ndc: item.product.ndc,
            category: item.product.category, dosageForm: item.product.dosageForm, strength: item.product.strength,
            systemQty: system, countedQty: counted, variance,
            varianceType: variance < 0 ? 'SHORTAGE' : 'SURPLUS' as const,
            variancePercent, unitCost: costPrice,
            totalCost: Math.abs(variance) * costPrice,
            manufacturer: mfgName, vendor: vendorName,
          }
        })
        .sort((a, b) => a.variance - b.variance)

      const shortageItems = varianceItems.filter((v) => v.variance < 0)
      const surplusItems = varianceItems.filter((v) => v.variance > 0)
      const shortageTotalCost = shortageItems.reduce((s, v) => s + v.totalCost, 0)
      const surplusTotalCost = surplusItems.reduce((s, v) => s + v.totalCost, 0)

      // Reorder alerts
      const reorderAlerts = countedItems
        .filter((item) => item.countedQty !== null && Number(item.countedQty) < (Number(item.product.reorderPoint) || 10))
        .map((item) => {
          const { mfgName, vendorName, costPrice } = helper(item)
          const qty = Number(item.countedQty) || 0
          const reorderPoint = Number(item.product.reorderPoint) || 10
          const reorderQty = Number(item.product.reorderQty) || 50
          const deficit = reorderPoint - qty
          return {
            productId: item.productId, productName: item.product.name, ndc: item.product.ndc,
            category: item.product.category, countedQty: qty,
            reorderPoint, reorderQty,
            deficit, unitCost: costPrice,
            reorderCost: deficit * costPrice,
            manufacturer: mfgName, vendor: vendorName,
          }
        })
        .sort((a, b) => b.deficit - a.deficit)

      const reorderTotalCost = reorderAlerts.reduce((s, r) => s + r.reorderCost, 0)

      // Inventory valuation
      const totalCostValue = countedItems.reduce((s, item) => s + (Number(item.product.costPrice) || 0) * (Number(item.countedQty) || 0), 0)
      const totalRetailValue = countedItems.reduce((s, item) => s + (Number(item.product.sellingPrice) || 0) * (Number(item.countedQty) || 0), 0)
      const potentialProfit = totalRetailValue - totalCostValue
      const profitMargin = totalCostValue > 0 ? (potentialProfit / totalCostValue) * 100 : 0
      const itemsMatched = countedItems.filter((item) => Number(item.countedQty) === Number(item.systemQty)).length
      const itemsWithZeroCount = countedItems.filter((item) => Number(item.countedQty) === 0).length

      return NextResponse.json({
        generatedAt: now.toISOString(),
        stockTakeRef: stockTake.reference,
        stockTakeId: stockTake.id,
        completedAt: stockTake.completedAt?.toISOString(),
        countedBy: countedItems[0]?.stockTake?.countedByUser?.name || null,
        startedAt: stockTake.startedAt?.toISOString() || null,
        notes: stockTake.notes,
        totalItemsChecked: countedItems.length,
        itemsWithZeroCount,
        itemsMatched,
        inventoryValuation: { totalItems: countedItems.length, totalCostValue, totalRetailValue, potentialProfit, profitMargin },
        expiredGoods: { count: expiredGoods.length, totalCost: expiredTotalCost, totalPotentialRevenue: expiredTotalRevenue, items: expiredGoods },
        nearExpiryGoods: { count: nearExpiryGoods.length, totalCost: nearExpiryTotalCost, totalPotentialRevenue: nearExpiryTotalRevenue, items: nearExpiryGoods },
        stockVariance: { totalVarianceItems: varianceItems.length, shortageCount: shortageItems.length, shortageTotalCost, surplusCount: surplusItems.length, surplusTotalCost, netVarianceCost: shortageTotalCost - surplusTotalCost, items: varianceItems },
        reorderAlerts: { count: reorderAlerts.length, totalReorderCost: reorderTotalCost, items: reorderAlerts },
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
