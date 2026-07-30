import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

// GET /api/stock-take/[id] — get single stock take with items
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (isTurso()) {
      const stResult = await turso.execute({
        sql: `
          SELECT st."id", st."reference", st."status", st."notes", st."countedBy", st."startedAt", st."completedAt", st."createdAt", st."updatedAt",
            u."name" AS "countedByName", u."email" AS "countedByEmail"
          FROM "StockTake" st
          LEFT JOIN "User" u ON st."countedBy" = u."id"
          WHERE st."id" = ?
        `,
        args: [id],
      })

      if (stResult.rows.length === 0) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }

      const row = stResult.rows[0]!

      // Fetch items for this stock take
      const itemsResult = await turso.execute({
        sql: `
          SELECT sti."id", sti."stockTakeId", sti."productId", sti."systemQty", sti."countedQty", sti."variance", sti."notes" AS "stiNotes", sti."createdAt",
            p."id" AS "pId", p."name" AS "pName", p."ndc", p."category", p."unitOfMeasure", p."expiryDate", p."sellingPrice", p."costPrice", p."dosageForm", p."strength"
          FROM "StockTakeItem" sti
          LEFT JOIN "Product" p ON sti."productId" = p."id"
          WHERE sti."stockTakeId" = ?
          ORDER BY sti."createdAt" ASC
        `,
        args: [id],
      })

      const items = itemsResult.rows.map((r) => ({
        id: r.id as string,
        stockTakeId: r.stockTakeId as string,
        productId: r.productId as string,
        systemQty: r.systemQty as number | null,
        countedQty: r.countedQty as number | null,
        variance: r.variance as number | null,
        notes: r.stiNotes as string | null,
        createdAt: r.createdAt as string | null,
        product: r.pId ? {
          id: r.pId as string,
          name: r.pName as string | null,
          ndc: r.ndc as string | null,
          category: r.category as string | null,
          unitOfMeasure: r.unitOfMeasure as string | null,
          expiryDate: r.expiryDate as string | null,
          sellingPrice: r.sellingPrice as number | null,
          costPrice: r.costPrice as number | null,
          dosageForm: r.dosageForm as string | null,
          strength: r.strength as string | null,
        } : null,
      }))

      const stockTake = {
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
        items,
      }

      return NextResponse.json(stockTake)
    } else {
      const { db } = await import('@/lib/db')
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
    }
  } catch (error) {
    console.error('Error fetching stock take:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch stock take', detail: msg }, { status: 500 })
  }
}

// PUT /api/stock-take/[id] — update stock take (add items, complete, cancel)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, items, notes } = body

    if (isTurso()) {
      // Check stock take exists
      const existingResult = await turso.execute({
        sql: `SELECT "id", "reference", "status", "notes", "completedAt", "updatedAt" FROM "StockTake" WHERE "id" = ?`,
        args: [id],
      })
      if (existingResult.rows.length === 0) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }
      const existing = existingResult.rows[0]!

      if (action === 'complete') {
        // 1) Fetch all counted items with product details
        const countedResult = await turso.execute({
          sql: `
            SELECT
              sti."id" AS "stiId", sti."stockTakeId", sti."productId", sti."systemQty", sti."countedQty", sti."variance",
              p."id" AS "pId", p."name" AS "pName", p."ndc", p."category", p."unitOfMeasure",
              p."expiryDate", p."costPrice", p."sellingPrice", p."dosageForm", p."strength",
              p."reorderPoint", p."reorderQty", p."manufacturer",
              mrf."name" AS "mrfName",
              v."name" AS "vName"
            FROM "StockTakeItem" sti
            LEFT JOIN "Product" p ON sti."productId" = p."id"
            LEFT JOIN "Manufacturer" mrf ON p."manufacturerRefId" = mrf."id"
            LEFT JOIN "Vendor" v ON p."vendorId" = v."id"
            WHERE sti."stockTakeId" = ? AND sti."countedQty" IS NOT NULL
          `,
          args: [id],
        })

        const countedItems = countedResult.rows.map((row) => ({
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
        }))

        // 2) Update Inventory table: set quantity = countedQty
        let updatedInventoryCount = 0
        const now = new Date().toISOString()
        for (const item of countedItems) {
          if (item.countedQty === null) continue
          const qty = Number(item.countedQty) || 0
          try {
            // Check if inventory row exists
            const invCheck = await turso.execute({
              sql: `SELECT "id" FROM "Inventory" WHERE "productId" = ?`,
              args: [item.productId],
            })
            if (invCheck.rows.length > 0) {
              await turso.execute({
                sql: `UPDATE "Inventory" SET "quantity" = ?, "lastCounted" = ?, "updatedAt" = ? WHERE "productId" = ?`,
                args: [qty, now, now, item.productId],
              })
            } else {
              const invId = generateId()
              await turso.execute({
                sql: `INSERT INTO "Inventory" ("id", "productId", "quantity", "lastCounted", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?)`,
                args: [invId, item.productId, qty, now, now, now],
              })
            }
            updatedInventoryCount++
          } catch (invErr) {
            console.error(`[StockTake Complete] Failed to update inventory for product ${item.productId}:`, invErr)
          }
        }

        // 3) Mark stock take as COMPLETED
        const updatedNotes = notes !== undefined ? notes : (existing.notes as string | null)
        await turso.execute({
          sql: `UPDATE "StockTake" SET "status" = 'COMPLETED', "completedAt" = ?, "notes" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [now, updatedNotes, now, id],
        })

        // 4) Generate report data
        const report = buildCompletionReport(countedItems, now, existing.reference as string, id)

        console.log(`[StockTake Complete] id=${id} updated ${updatedInventoryCount} inventory records`)

        const updated = {
          id,
          reference: existing.reference,
          status: 'COMPLETED',
          notes: updatedNotes,
          completedAt: now,
          updatedAt: now,
        }

        return NextResponse.json({
          ...updated,
          _meta: { inventoryUpdated: updatedInventoryCount, totalItems: countedItems.length },
          _report: report,
        })
      }

      if (action === 'cancel') {
        const now = new Date().toISOString()
        await turso.execute({
          sql: `UPDATE "StockTake" SET "status" = 'CANCELLED', "updatedAt" = ? WHERE "id" = ?`,
          args: [now, id],
        })
        return NextResponse.json({
          id,
          reference: existing.reference,
          status: 'CANCELLED',
          notes: existing.notes,
          updatedAt: now,
        })
      }

      if (action === 'update-item' && items) {
        // Upsert each item's countedQty and variance
        for (const item of items) {
          const countedQty = Number(item.countedQty)
          const systemQty = Number(item.systemQty)
          const variance = item.countedQty !== null ? countedQty - systemQty : null
          const now = new Date().toISOString()

          // Check if item exists
          const existingItem = await turso.execute({
            sql: `SELECT "id" FROM "StockTakeItem" WHERE "stockTakeId" = ? AND "productId" = ?`,
            args: [id, item.productId],
          })

          if (existingItem.rows.length > 0) {
            await turso.execute({
              sql: `UPDATE "StockTakeItem" SET "countedQty" = ?, "variance" = ?, "notes" = ?, "updatedAt" = ? WHERE "stockTakeId" = ? AND "productId" = ?`,
              args: [item.countedQty, variance, item.notes || null, now, id, item.productId],
            })
          } else {
            const stiId = generateId()
            await turso.execute({
              sql: `INSERT INTO "StockTakeItem" ("id", "stockTakeId", "productId", "systemQty", "countedQty", "variance", "notes", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [stiId, id, item.productId, item.systemQty, item.countedQty, variance, item.notes || null, now, now],
            })
          }
        }

        return NextResponse.json({ success: true })
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } else {
      const { db } = await import('@/lib/db')

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
    }
  } catch (error) {
    console.error('Error updating stock take:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update stock take', detail: msg }, { status: 500 })
  }
}

// DELETE /api/stock-take/[id] — delete a stock take and its items
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (isTurso()) {
      // Check stock take exists
      const existing = await turso.execute({
        sql: `SELECT "id" FROM "StockTake" WHERE "id" = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }

      // Delete items first, then the stock take
      await turso.execute({
        sql: `DELETE FROM "StockTakeItem" WHERE "stockTakeId" = ?`,
        args: [id],
      })
      await turso.execute({
        sql: `DELETE FROM "StockTake" WHERE "id" = ?`,
        args: [id],
      })

      return NextResponse.json({ success: true, message: 'Stock take deleted' })
    } else {
      const { db } = await import('@/lib/db')
      const existing = await db.stockTake.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Stock take not found' }, { status: 404 })
      }
      // Delete items first (Prisma relation), then the stock take
      await db.stockTakeItem.deleteMany({ where: { stockTakeId: id } })
      await db.stockTake.delete({ where: { id } })
      return NextResponse.json({ success: true, message: 'Stock take deleted' })
    }
  } catch (error) {
    console.error('Error deleting stock take:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to delete stock take', detail: msg }, { status: 500 })
  }
}

// Shared completion report builder for Turso path
function buildCompletionReport(countedItems: any[], now: string, reference: string, stockTakeId: string) {
  const expiredGoods = countedItems
    .filter((item) => {
      const exp = item.product.expiryDate
      return exp && new Date(exp) < new Date(now)
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
    .sort((a, b) => a.variance - b.variance)

  const shortageItems = varianceItems.filter((v) => v.variance < 0)
  const surplusItems = varianceItems.filter((v) => v.variance > 0)
  const shortageTotalCost = shortageItems.reduce((sum, v) => sum + v.totalCost, 0)
  const surplusTotalCost = surplusItems.reduce((sum, v) => sum + v.totalCost, 0)

  return {
    generatedAt: now,
    stockTakeRef: reference,
    stockTakeId,
    completedAt: now,
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
}