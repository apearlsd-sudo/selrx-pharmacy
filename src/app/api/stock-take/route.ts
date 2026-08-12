import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateStockTakeRef } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/stock-take — list stock takes or generate report for a completed stock take
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const stockTakeId = searchParams.get('id')

    // GET /api/stock-take?action=report&id=xxx — generate report for completed stock take
    if (action === 'report' && stockTakeId) {
      const now = new Date()

      if (isTurso()) {
        // Verify stock take exists
        const stResult = await turso.execute({
          sql: `SELECT "id", "reference", "completedAt", "startedAt", "notes", "countedBy", "status", "createdAt", "updatedAt" FROM "StockTake" WHERE "id" = ?`,
          args: [stockTakeId],
        })
        if (stResult.rows.length === 0) {
          return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
        }
        const stockTakeRow = stResult.rows[0]!

        // Fetch counted items with product, manufacturer, vendor, and stock take user info
        const itemsResult = await turso.execute({
          sql: `
            SELECT
              sti."id" AS "stiId", sti."stockTakeId", sti."productId", sti."systemQty", sti."countedQty", sti."variance", sti."notes" AS "stiNotes", sti."createdAt" AS "stiCreatedAt",
              p."id" AS "pId", p."name" AS "pName", p."ndc", p."category", p."unitOfMeasure", p."expiryDate", p."costPrice", p."sellingPrice", p."dosageForm", p."strength", p."reorderPoint", p."reorderQty", p."manufacturer",
              mrf."name" AS "mrfName",
              v."name" AS "vName",
              st."reference" AS "stRef", st."completedAt" AS "stCompletedAt", st."startedAt" AS "stStartedAt", st."notes" AS "stNotes",
              u."name" AS "uName", u."email" AS "uEmail"
            FROM "StockTakeItem" sti
            LEFT JOIN "Product" p ON sti."productId" = p."id"
            LEFT JOIN "Manufacturer" mrf ON p."manufacturerId" = mrf."id"
            LEFT JOIN "Vendor" v ON p."vendorId" = v."id"
            LEFT JOIN "StockTake" st ON sti."stockTakeId" = st."id"
            LEFT JOIN "User" u ON st."countedBy" = u."id"
            WHERE sti."stockTakeId" = ? AND sti."countedQty" IS NOT NULL
          `,
          args: [stockTakeId],
        })

        const countedItems = itemsResult.rows.map((row) => ({
          id: row.stiId as string,
          stockTakeId: row.stockTakeId as string,
          productId: row.productId as string,
          systemQty: row.systemQty as number | null,
          countedQty: row.countedQty as number | null,
          variance: row.variance as number | null,
          product: {
            id: row.pId as string,
            name: row.pName as string | null,
            ndc: row.ndc as string | null,
            category: row.category as string | null,
            unitOfMeasure: row.unitOfMeasure as string | null,
            expiryDate: row.expiryDate as string | null,
            costPrice: row.costPrice as number | null,
            sellingPrice: row.sellingPrice as number | null,
            dosageForm: row.dosageForm as string | null,
            strength: row.strength as string | null,
            reorderPoint: row.reorderPoint as number | null,
            reorderQty: row.reorderQty as number | null,
            manufacturer: row.manufacturer as string | null,
            manufacturerRef: row.mrfName ? { name: row.mrfName as string } : null,
            vendor: row.vName ? { name: row.vName as string } : null,
          },
          stockTake: {
            reference: row.stRef as string | null,
            completedAt: row.stCompletedAt as string | null,
            startedAt: row.stStartedAt as string | null,
            notes: row.stNotes as string | null,
            countedByUser: row.uName ? { name: row.uName as string, email: row.uEmail as string | null } : null,
          },
        }))

        return NextResponse.json(buildReport(countedItems, now, stockTakeRow))
      } else {
        const { db } = await import('@/lib/db')

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

        return NextResponse.json(buildReport(countedItems as any, now, stockTake))
      }
    }

    // GET /api/stock-take — list all stock takes with items and products
    if (isTurso()) {
      // Fetch all stock takes
      const stResult = await turso.execute({
        sql: `
          SELECT st."id", st."reference", st."status", st."notes", st."countedBy", st."startedAt", st."completedAt", st."createdAt", st."updatedAt",
            u."name" AS "countedByName", u."email" AS "countedByEmail"
          FROM "StockTake" st
          LEFT JOIN "User" u ON st."countedBy" = u."id"
          ORDER BY st."createdAt" DESC
        `,
        args: [],
      })

      const stockTakeIds = stResult.rows.map((r) => r.id as string)

      // Fetch all items for these stock takes
      let itemsMap: Record<string, any[]> = {}
      if (stockTakeIds.length > 0) {
        const placeholders = stockTakeIds.map(() => '?').join(',')
        const itemsResult = await turso.execute({
          sql: `
            SELECT sti."id", sti."stockTakeId", sti."productId", sti."systemQty", sti."countedQty", sti."variance", sti."notes", sti."createdAt",
              p."id" AS "pId", p."name" AS "pName", p."ndc", p."category", p."unitOfMeasure"
            FROM "StockTakeItem" sti
            LEFT JOIN "Product" p ON sti."productId" = p."id"
            WHERE sti."stockTakeId" IN (${placeholders})
            ORDER BY sti."createdAt" ASC
          `,
          args: stockTakeIds,
        })

        for (const row of itemsResult.rows) {
          const sid = row.stockTakeId as string
          if (!itemsMap[sid]) itemsMap[sid] = []
          itemsMap[sid].push({
            id: row.id as string,
            stockTakeId: sid,
            productId: row.productId as string,
            systemQty: row.systemQty as number | null,
            countedQty: row.countedQty as number | null,
            variance: row.variance as number | null,
            notes: row.notes as string | null,
            createdAt: row.createdAt as string | null,
            product: row.pId ? {
              id: row.pId as string,
              name: row.pName as string | null,
              ndc: row.ndc as string | null,
              category: row.category as string | null,
              unitOfMeasure: row.unitOfMeasure as string | null,
            } : null,
          })
        }
      }

      const stockTakes = stResult.rows.map((row) => ({
        id: row.id as string,
        reference: row.reference as string | null,
        status: row.status as string,
        notes: row.notes as string | null,
        countedBy: row.countedBy as string | null,
        startedAt: row.startedAt as string | null,
        completedAt: row.completedAt as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string | null,
        countedByUser: row.countedByName ? { name: row.countedByName as string, email: row.countedByEmail as string | null } : null,
        items: itemsMap[row.id as string] || [],
      }))

      return NextResponse.json(stockTakes)
    } else {
      const { db } = await import('@/lib/db')
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
    }
  } catch (error) {
    console.error('Error fetching stock takes:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch stock takes', detail: msg }, { status: 500 })
  }
}

// Shared report builder — works with both raw-SQL rows and Prisma objects
function buildReport(countedItems: any[], now: Date, stockTake: any) {
  const helper = (item: any) => {
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

  // Normalize stockTake for response (raw SQL row vs Prisma model)
  const stRef = typeof stockTake.reference === 'string' ? stockTake.reference : stockTake.reference || null
  const stCompletedAt = stockTake.completedAt instanceof Date ? stockTake.completedAt.toISOString() : stockTake.completedAt ? String(stockTake.completedAt) : null
  const stStartedAt = stockTake.startedAt instanceof Date ? stockTake.startedAt.toISOString() : stockTake.startedAt ? String(stockTake.startedAt) : null

  return {
    generatedAt: now.toISOString(),
    stockTakeRef: stRef,
    stockTakeId: stockTake.id,
    completedAt: stCompletedAt,
    countedBy: countedItems[0]?.stockTake?.countedByUser?.name || null,
    startedAt: stStartedAt,
    notes: stockTake.notes,
    totalItemsChecked: countedItems.length,
    itemsWithZeroCount,
    itemsMatched,
    inventoryValuation: { totalItems: countedItems.length, totalCostValue, totalRetailValue, potentialProfit, profitMargin },
    expiredGoods: { count: expiredGoods.length, totalCost: expiredTotalCost, totalPotentialRevenue: expiredTotalRevenue, items: expiredGoods },
    nearExpiryGoods: { count: nearExpiryGoods.length, totalCost: nearExpiryTotalCost, totalPotentialRevenue: nearExpiryTotalRevenue, items: nearExpiryGoods },
    stockVariance: { totalVarianceItems: varianceItems.length, shortageCount: shortageItems.length, shortageTotalCost, surplusCount: surplusItems.length, surplusTotalCost, netVarianceCost: shortageTotalCost - surplusTotalCost, items: varianceItems },
    reorderAlerts: { count: reorderAlerts.length, totalReorderCost: reorderTotalCost, items: reorderAlerts },
  }
}

// POST /api/stock-take — create a new stock take
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { notes, countedBy } = body

    if (isTurso()) {
      // Find the max numeric suffix from existing references
      const allRefs = await turso.execute({
        sql: `SELECT "reference" FROM "StockTake" ORDER BY "createdAt" DESC`,
        args: [],
      })

      let maxNum = 0
      for (const row of allRefs.rows) {
        const ref = row.reference as string | null
        const match = ref?.match(/ST-(\d+)/)
        if (match) {
          const num = Number(match[1])
          if (num > maxNum) maxNum = num
        }
      }
      const ref = `ST-${String(maxNum + 1).padStart(4, '0')}`

      const id = generateId()
      const now = new Date().toISOString()

      console.log(`[StockTake Create] ref=${ref} notes=${notes || 'none'}`)

      await turso.execute({
        sql: `INSERT INTO "StockTake" ("id", "reference", "status", "notes", "countedBy", "startedAt", "createdAt", "updatedAt") VALUES (?, ?, 'IN_PROGRESS', ?, ?, ?, ?, ?)`,
        args: [id, ref, notes || null, countedBy || null, now, now, now],
      })

      const stockTake = { id, reference: ref, status: 'IN_PROGRESS', notes: notes || null, countedBy: countedBy || null, startedAt: now, createdAt: now, updatedAt: now }
      console.log(`[StockTake Create] success id=${id}`)
      const { userId, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId, action: 'STOCK_TAKE_CREATED', category: 'stocktake', entity: 'StockTake', entityId: id, details: { reference: ref }, ipAddress, userAgent })
      return NextResponse.json(stockTake, { status: 201 })
    } else {
      const { db } = await import('@/lib/db')

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
      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId: aUid2, action: 'STOCK_TAKE_CREATED', category: 'stocktake', entity: 'StockTake', entityId: stockTake.id, details: { reference: ref }, ipAddress, userAgent }).catch(() => {})
      return NextResponse.json(stockTake, { status: 201 })
    }
  } catch (error) {
    console.error('[StockTake Create] error:', error)
    return NextResponse.json({ error: 'Failed to create stock take', details: String(error) }, { status: 500 })
  }
}