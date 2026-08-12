import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert libsql flat rows → array of Record<string, any> keyed by column name */
function toObjs(result: { columns: Array<string>; rows: Array<Array<unknown>> }) {
  const names = result.columns.map((c) => c)
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    names.forEach((n, i) => {
      obj[n] = row[i]
    })
    return obj
  })
}

/** SQLite stores booleans as 0/1 – convert back */
const bool = (v: unknown): boolean => v === 1 || v === true

// ---------- reusable Product column fragment (all aliased with p_ prefix) ----

const P_COLS = [
  'p.id as p_id', 'p.ndc as p_ndc', 'p.name as p_name', 'p.genericName as p_genericName',
  'p.manufacturer as p_manufacturer', 'p.manufacturerId as p_manufacturerId',
  'p.vendorId as p_vendorId', 'p.category as p_category', 'p.description as p_description',
  'p.dosageForm as p_dosageForm', 'p.strength as p_strength', 'p.unitOfMeasure as p_unitOfMeasure',
  'p.sellingUnit as p_sellingUnit', 'p.itemsPerUnit as p_itemsPerUnit',
  'p.requiresPrescription as p_requiresPrescription', 'p.status as p_status',
  'p.sellingPrice as p_sellingPrice', 'p.costPrice as p_costPrice',
  'p.reorderPoint as p_reorderPoint', 'p.reorderQty as p_reorderQty', 'p.maxStock as p_maxStock',
  'p.storageLocation as p_storageLocation', 'p.batchNumber as p_batchNumber',
  'p.expiryDate as p_expiryDate', 'p.controlledSubstance as p_controlledSubstance',
  'p.deaSchedule as p_deaSchedule', 'p.createdAt as p_createdAt', 'p.updatedAt as p_updatedAt',
].join(', ')

/** Build a Prisma-compatible Product object from a flat aliased row */
function mapProduct(r: Record<string, unknown>) {
  return {
    id: r.p_id, ndc: r.p_ndc, name: r.p_name, genericName: r.p_genericName,
    manufacturer: r.p_manufacturer, manufacturerId: r.p_manufacturerId, vendorId: r.p_vendorId,
    category: r.p_category, description: r.p_description, dosageForm: r.p_dosageForm,
    strength: r.p_strength, unitOfMeasure: r.p_unitOfMeasure,
    sellingUnit: (r.p_sellingUnit as string) || 'EA',
    itemsPerUnit: Number(r.p_itemsPerUnit) || 1,
    requiresPrescription: bool(r.p_requiresPrescription), status: r.p_status,
    sellingPrice: r.p_sellingPrice, costPrice: r.p_costPrice, reorderPoint: r.p_reorderPoint,
    reorderQty: r.p_reorderQty, maxStock: r.p_maxStock, storageLocation: r.p_storageLocation,
    batchNumber: r.p_batchNumber, expiryDate: r.p_expiryDate,
    controlledSubstance: bool(r.p_controlledSubstance), deaSchedule: r.p_deaSchedule,
    createdAt: r.p_createdAt, updatedAt: r.p_updatedAt,
    manufacturerRef: r.mfr_name ? { name: r.mfr_name } : null,
    vendor: r.vendor_name ? { name: r.vendor_name } : null,
  }
}

/** Build a Prisma-compatible Inventory row from a flat aliased row */
function mapInventoryRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    productId: r.productId,
    quantity: r.quantity as number,
    lastCounted: r.lastCounted as string | null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    product: mapProduct(r),
  }
}

// ---------------------------------------------------------------------------
// GET /api/inventory
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // ---- Low-stock alerts ----
    if (action === 'alerts') {
      if (isTurso()) {
        const result = await turso.execute({
          sql: `SELECT i.id, i.productId, i.quantity, i.lastCounted, i.createdAt, i.updatedAt,
                       ${P_COLS}
                FROM Inventory i
                LEFT JOIN Product p ON i.productId = p.id
                WHERE i.quantity <= p.reorderPoint
                ORDER BY i.quantity ASC`,
          args: [],
        })
        return NextResponse.json(toObjs(result).map(mapInventoryRow))
      }

      // Prisma fallback
      const { db } = await import('@/lib/db')
      const allInventory = await db.inventory.findMany({ include: { product: true } })
      const lowStockAlerts = allInventory.filter(
        (inv) => inv.quantity <= inv.product.reorderPoint,
      )
      return NextResponse.json(lowStockAlerts)
    }

    // ---- Full inventory list (including products without inventory) ----
    if (isTurso()) {
      // ── AUTO-EXPIRY: Zero out any batches that reached expiry today ──
      // This runs on every inventory load so expired stock is removed immediately
      // without requiring user approval.
      const expiredBatches = await turso.execute({
        sql: `SELECT b.id, b."productId", b."batchNumber", b.quantity, b."costPrice",
                    p.name as productName, p."sellingPrice"
             FROM "Batch" b
             INNER JOIN "Product" p ON p.id = b."productId"
             WHERE b."expiryDate" IS NOT NULL
               AND date(b."expiryDate") <= date('now')
               AND b.quantity > 0`,
        args: [],
      })

      if (expiredBatches.rows.length > 0) {
        const now = new Date().toISOString()
        const affectedProductIds = new Set<string>()

        for (const row of toObjs(expiredBatches)) {
          const batchId = row.id as string
          const productId = row.productId as string
          const prevQty = Number(row.quantity) || 0
          affectedProductIds.add(productId)

          // Zero the expired batch
          await turso.execute({
            sql: 'UPDATE "Batch" SET quantity = 0, "updatedAt" = ? WHERE id = ?',
            args: [now, batchId],
          })

          // Log in product history
          writeProductHistory({
            productId,
            action: 'EXPIRED',
            changedFields: ['batchQuantity', 'status'],
            previousValues: { batchQuantity: prevQty, batchNumber: row.batchNumber, status: 'ACTIVE' },
            newValues: { batchQuantity: 0, status: 'EXPIRED' },
            userId: 'system-auto-expiry',
          })
        }

        // Recalculate inventory totals & re-sync expiry for affected products
        for (const pid of affectedProductIds) {
          const sumResult = await turso.execute({
            sql: `SELECT COALESCE(SUM(quantity), 0) as total FROM "Batch" WHERE "productId" = ?`,
            args: [pid],
          })
          const totalBatchQty = Number(sumResult.rows[0][0]) || 0

          await turso.execute({
            sql: 'UPDATE Inventory SET quantity = ?, "updatedAt" = ? WHERE "productId" = ?',
            args: [totalBatchQty, now, pid],
          })

          // Re-sync Product.expiryDate to nearest active batch
          await turso.execute({
            sql: `UPDATE "Product" SET "expiryDate" = (
                    SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
                  ), "updatedAt" = ?
                  WHERE id = ?`,
            args: [pid, now, pid],
          })

          // Mark product as EXPIRED only if ALL stock is gone
          if (totalBatchQty === 0) {
            await turso.execute({
              sql: `UPDATE "Product" SET status = 'EXPIRED', "expiredAt" = ?, "updatedAt" = ? WHERE id = ? AND status != 'DISCONTINUED'`,
              args: [now, now, pid],
            })
          }
        }
      }

      // 1. Inventory rows with product, manufacturer, vendor
      const invResult = await turso.execute({
        sql: `SELECT i.id, i.productId, i.quantity, i.lastCounted, i.createdAt, i.updatedAt,
                      ${P_COLS},
                      m.name as mfr_name, v.name as vendor_name
               FROM Inventory i
               LEFT JOIN Product p ON i.productId = p.id
               LEFT JOIN Manufacturer m ON p.manufacturerId = m.id
               LEFT JOIN Vendor v ON p.vendorId = v.id
               ORDER BY i.updatedAt DESC`,
        args: [],
      })
      const inventoryRows = toObjs(invResult).map(mapInventoryRow)

      // Batch-level expiry summary for each product (avoids product-level false expired)
      const batchSummaryResult = await turso.execute({
        sql: `SELECT b."productId",
                     COUNT(*) as totalBatches,
                     SUM(CASE WHEN date(b."expiryDate") <= date('now') THEN 1 ELSE 0 END) as expiredBatches,
                     SUM(CASE WHEN date(b."expiryDate") > date('now') THEN 1 ELSE 0 END) as activeBatches,
                     MIN(CASE WHEN date(b."expiryDate") > date('now') THEN b."expiryDate" ELSE NULL END) as nearestActiveExpiry,
                     MIN(CASE WHEN date(b."expiryDate") <= date('now') THEN b."expiryDate" ELSE NULL END) as nearestExpiredDate,
                     SUM(CASE WHEN date(b."expiryDate") > date('now') AND date(b."expiryDate") <= date('now', '+30 days') THEN 1 ELSE 0 END) as nearExpiryBatches
              FROM "Batch" b
              WHERE b.quantity > 0 AND b."expiryDate" IS NOT NULL
              GROUP BY b."productId"`,
        args: [],
      })
      const batchSummaryMap = new Map<string, Record<string, unknown>>() 
      for (const r of toObjs(batchSummaryResult)) {
        batchSummaryMap.set(r.productId as string, r)
      }

      // Attach batch summary to each inventory row
      const inventory = inventoryRows.map((row) => {
        const bs = batchSummaryMap.get(row.productId)
        const summary = bs ? {
          hasBatches: true,
          totalBatches: Number(bs.totalBatches) || 0,
          expiredBatches: Number(bs.expiredBatches) || 0,
          activeBatches: Number(bs.activeBatches) || 0,
          allBatchesExpired: (Number(bs.activeBatches) || 0) === 0,
          hasExpiredBatches: (Number(bs.expiredBatches) || 0) > 0,
          nearExpiryBatches: Number(bs.nearExpiryBatches) || 0,
          nearestActiveExpiry: bs.nearestActiveExpiry as string | null,
          nearestExpiredDate: bs.nearestExpiredDate as string | null,
        } : { hasBatches: false, totalBatches: 0, expiredBatches: 0, activeBatches: 0, allBatchesExpired: false, hasExpiredBatches: false, nearExpiryBatches: 0, nearestActiveExpiry: null, nearestExpiredDate: null }
        return { ...row, batchExpirySummary: summary }
      })

      // 2. Products WITHOUT an inventory record (qty=0 virtual)
      const noInvResult = await turso.execute({
        sql: `SELECT ${P_COLS}, m.name as mfr_name, v.name as vendor_name
               FROM Product p
               LEFT JOIN Manufacturer m ON p.manufacturerId = m.id
               LEFT JOIN Vendor v ON p.vendorId = v.id
               LEFT JOIN Inventory inv ON p.id = inv.productId
               WHERE inv.id IS NULL`,
        args: [],
      })

      const noInvProducts = toObjs(noInvResult).map((r) => ({
        id: `no-inv-${r.p_id}`,
        productId: r.p_id,
        quantity: 0,
        lastCounted: null,
        createdAt: r.p_createdAt,
        updatedAt: r.p_updatedAt,
        product: mapProduct(r),
      }))

      return NextResponse.json([...inventory, ...noInvProducts])
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
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

    // Batch-level expiry for Prisma fallback
    const allBatchRecords = await db.batch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { not: null } },
      select: { productId: true, expiryDate: true },
    })
    const batchGrouped = new Map<string, { total: number; expired: number; active: number; nearExpiry: number; nearestActive: string | null; nearestExpired: string | null }>()
    const now = new Date()
    const thirtyDays = 30 * 86400000
    for (const b of allBatchRecords) {
      const pid = b.productId
      if (!batchGrouped.has(pid)) batchGrouped.set(pid, { total: 0, expired: 0, active: 0, nearExpiry: 0, nearestActive: null, nearestExpired: null })
      const g = batchGrouped.get(pid)!
      g.total++
      const expDate = new Date(b.expiryDate!)
      if (expDate <= now) {
        g.expired++
        if (!g.nearestExpired || expDate < new Date(g.nearestExpired)) g.nearestExpired = b.expiryDate
      } else {
        g.active++
        if (!g.nearestActive || expDate < new Date(g.nearestActive)) g.nearestActive = b.expiryDate
        if (expDate.getTime() - now.getTime() <= thirtyDays) g.nearExpiry++
      }
    }

    const productsWithInventory = new Set(inventory.map((i) => i.productId))
    const productsWithoutInventory = await db.product.findMany({
      where: { id: { notIn: Array.from(productsWithInventory) } },
      include: {
        manufacturerRef: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    })

    const attachSummary = (row: any) => {
      const g = batchGrouped.get(row.productId)
      row.batchExpirySummary = g ? {
        hasBatches: true,
        totalBatches: g.total,
        expiredBatches: g.expired,
        activeBatches: g.active,
        allBatchesExpired: g.active === 0,
        hasExpiredBatches: g.expired > 0,
        nearExpiryBatches: g.nearExpiry,
        nearestActiveExpiry: g.nearestActive,
        nearestExpiredDate: g.nearestExpired,
      } : { hasBatches: false, totalBatches: 0, expiredBatches: 0, activeBatches: 0, allBatchesExpired: false, hasExpiredBatches: false, nearExpiryBatches: 0, nearestActiveExpiry: null, nearestExpiredDate: null }
      return row
    }

    const merged = [
      ...inventory.map(attachSummary),
      ...productsWithoutInventory.map((p) => attachSummary({
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
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch inventory', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/inventory  –  stock adjustment / receive
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    const allowedRoles = ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CLERK', 'MANAGER', 'ADMIN']
    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // ---- Re-sync all Product.expiryDate from active batches (PUT ?action=resync-expiry) ----
    if (action === 'resync-expiry') {
      if (!isTurso()) {
        return NextResponse.json({ error: 'Requires cloud database' }, { status: 400 })
      }
      const now = new Date().toISOString()
      await turso.execute({
        sql: `UPDATE "Product" SET "expiryDate" = (
                SELECT MIN(b."expiryDate") FROM "Batch" b
                WHERE b."productId" = "Product".id AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
              ), "updatedAt" = ?
              WHERE id IN (SELECT DISTINCT "productId" FROM "Batch" WHERE quantity > 0 AND "expiryDate" IS NOT NULL)`,
        args: [now],
      })
      // Also clear expiryDate for products whose ALL batches are expired or have no expiry
      await turso.execute({
        sql: `UPDATE "Product" SET "expiryDate" = NULL, "updatedAt" = ?
              WHERE id IN (
                SELECT DISTINCT "productId" FROM "Batch" WHERE quantity > 0 AND "expiryDate" IS NOT NULL
              ) AND "expiryDate" IS NOT NULL
              AND id NOT IN (
                SELECT DISTINCT "productId" FROM "Batch"
                WHERE quantity > 0 AND "expiryDate" IS NOT NULL AND date("expiryDate") > date('now')
              )`,
        args: [now],
      })
      return NextResponse.json({ message: 'All product expiry dates re-synced to active batches' })
    }

    // ---- Stock receive (PUT ?action=receive) ----
    if (action === 'receive') {
      const body = await request.json()
      const { items } = body

      if (!items || !Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
      }

      if (isTurso()) {
        const now = new Date().toISOString()
        const userId = request.headers.get('x-user-id') || ''

        for (const item of items) {
          // Read current inventory (read-modify-write)
          const existing = await turso.execute({
            sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
            args: [item.productId],
          })

          if (existing.rows.length > 0) {
            const currentQty = existing.rows[0][0] as number
            await turso.execute({
              sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
              args: [currentQty + item.quantity, now, now, item.productId],
            })
          } else {
            await turso.execute({
              sql: 'INSERT INTO Inventory (id, productId, quantity, lastCounted, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
              args: [generateId(), item.productId, item.quantity, now, now, now],
            })
          }

          // Create a Batch record for this received stock (batch-aware tracking)
          const batchId = generateId()
          const autoBN = item.batchNumber || generateBatchNo()
          await turso.execute({
            sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              batchId, item.productId, autoBN, item.expiryDate || null,
              item.quantity, item.costPrice || null, now, userId, now, now,
            ],
          })

          // Re-sync Product.expiryDate from batch data
          await turso.execute({
            sql: `UPDATE "Product" SET "expiryDate" = (
                    SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
                  ), "updatedAt" = ?
                  WHERE id = ?`,
            args: [item.productId, now, item.productId],
          })
        }

        // Fetch updated records with product details
        const pIds = items.map((i: { productId: string }) => i.productId)
        const placeholders = pIds.map(() => '?').join(', ')
        const result = await turso.execute({
          sql: `SELECT i.id, i.productId, i.quantity, i.lastCounted, i.createdAt, i.updatedAt,
                       ${P_COLS}, m.name as mfr_name, v.name as vendor_name
                FROM Inventory i
                LEFT JOIN Product p ON i.productId = p.id
                LEFT JOIN Manufacturer m ON p.manufacturerId = m.id
                LEFT JOIN Vendor v ON p.vendorId = v.id
                WHERE i.productId IN (${placeholders})`,
          args: pIds,
        })

        const { ipAddress, userAgent } = getRequestContext(request)
        writeAuditLog({ userId, action: 'STOCK_RECEIVED', category: 'inventory', details: { itemCount: items.length }, ipAddress, userAgent })
        return NextResponse.json({
          message: 'Stock received successfully',
          updatedItems: toObjs(result).map(mapInventoryRow),
        })
      }

      // Prisma fallback
      const { db } = await import('@/lib/db')
      const results = []
      for (const item of items) {
        const existing = await db.inventory.findUnique({ where: { productId: item.productId } })
        if (existing) {
          const updated = await db.inventory.update({
            where: { productId: item.productId },
            data: { quantity: existing.quantity + item.quantity, lastCounted: new Date() },
            include: { product: true },
          })
          results.push(updated)
        } else {
          const created = await db.inventory.create({
            data: { productId: item.productId, quantity: item.quantity, lastCounted: new Date() },
            include: { product: true },
          })
          results.push(created)
        }
      }
      const { userId: aUid, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid, action: 'STOCK_RECEIVED', category: 'inventory', details: { itemCount: items.length }, ipAddress, userAgent })
      return NextResponse.json({ message: 'Stock received successfully', updatedItems: results })
    }

    // ---- Regular stock adjustment ----
    const body = await request.json()
    const {
      productId, quantity, adjustment, reason,
      costPrice, sellingPrice, setQuantity, adjustmentType,
      expiryDate, batchNumber,
    } = body

    if (!productId || !reason) {
      return NextResponse.json({ error: 'productId and reason are required' }, { status: 400 })
    }

    if (isTurso()) {
      const now = new Date().toISOString()
      const userId = request.headers.get('x-user-id') || ''

      // Read existing inventory
      const existing = await turso.execute({
        sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
        args: [productId],
      })
      const currentQty = existing.rows.length > 0 ? (existing.rows[0][0] as number) : 0

      // Determine new quantity
      let newQuantity: number
      if (adjustmentType === 'SET' || setQuantity !== undefined) {
        newQuantity = setQuantity !== undefined ? setQuantity : (adjustment || 0)
      } else if (adjustment !== undefined) {
        newQuantity = currentQty + adjustment
      } else {
        newQuantity = currentQty
      }

      if (newQuantity < 0) {
        return NextResponse.json(
          { error: 'Insufficient stock for this adjustment' },
          { status: 400 },
        )
      }

      // Write (update or insert) inventory total
      if (existing.rows.length > 0) {
        await turso.execute({
          sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
          args: [newQuantity, now, now, productId],
        })
      } else {
        await turso.execute({
          sql: 'INSERT INTO Inventory (id, productId, quantity, lastCounted, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          args: [generateId(), productId, newQuantity, now, now, now],
        })
      }

      // Sync batch quantities to match the new inventory total.
      // This ensures the Stock Batches section reflects the adjustment.
      // Strategy: 
      //   REMOVE / SET-lower → reduce from FEFO (earliest-expiring) batches first
      //   ADD / SET-higher  → add to the most recently created active batch
      //   NO BATCHES EXIST  → create a new catch-all batch with the new quantity
      const qtyDiff = newQuantity - currentQty
      let batchSynced = false
      if (qtyDiff !== 0 && !(adjustmentType === 'ADD' && adjustment > 0 && expiryDate)) {
        // Don't double-sync when a new batch was already created above
        try {
          const activeBatches = await turso.execute({
            sql: `SELECT id, quantity, "expiryDate" FROM "Batch" WHERE "productId" = ? AND quantity > 0 ORDER BY COALESCE("expiryDate", '9999-12-31') ASC`,
            args: [productId],
          })
          const batches = toObjs(activeBatches)

          if (batches.length > 0) {
            if (qtyDiff < 0) {
              // REDUCE: FEFO — drain from earliest-expiring batches first
              let remaining = Math.abs(qtyDiff)
              for (const b of batches) {
                if (remaining <= 0) break
                const bQty = (b.quantity as number) || 0
                const reduce = Math.min(remaining, bQty)
                if (reduce > 0) {
                  await turso.execute({
                    sql: `UPDATE "Batch" SET quantity = ?, "updatedAt" = ? WHERE id = ?`,
                    args: [bQty - reduce, now, b.id],
                  })
                  remaining -= reduce
                  batchSynced = true
                }
              }
            } else {
              // INCREASE: add to the most recently created active batch (last in FEFO order)
              const targetBatch = batches[batches.length - 1]
              await turso.execute({
                sql: `UPDATE "Batch" SET quantity = ?, "updatedAt" = ? WHERE id = ?`,
                args: [((targetBatch.quantity as number) || 0) + qtyDiff, now, targetBatch.id],
              })
              batchSynced = true
            }
          } else if (newQuantity > 0) {
            // No existing batches — create a catch-all batch so the Stock Batches section
            // reflects the adjusted quantity. Uses any provided expiry/batch number.
            const batchId = generateId()
            const batchNo = batchNumber || generateBatchNo()
            const batchExpiry = expiryDate || null
            await turso.execute({
              sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [batchId, productId, batchNo, batchExpiry, newQuantity, costPrice || null, now, userId, now, now],
            })
            batchSynced = true
            console.log(`[Inventory PUT] Created catch-all batch for ${productId}: qty=${newQuantity}`)
          }
        } catch (e) {
          console.warn(`[Inventory PUT] Batch sync failed for ${productId}:`, e)
        }
      }

      // If ADD with an expiry date, create a new Batch record so the stock
      // carries its own expiry (batch-aware stock management)
      let batchCreated = false
      if (adjustmentType === 'ADD' && adjustment > 0 && expiryDate) {
        const batchId = generateId()
        const batchNo = batchNumber || generateBatchNo()
        await turso.execute({
          sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [batchId, productId, batchNo, expiryDate, adjustment, costPrice || null, now, userId, now, now],
        })
        batchCreated = true
      }
      // Expiry-only update: no quantity change but expiryDate provided.
      // Update the nearest active batch's expiry, or update Product.expiryDate if no batches.
      let expiryUpdated = false
      if (expiryDate && !(adjustmentType === 'ADD' && adjustment > 0)) {
        // Try to update the nearest active batch (prefer non-expired, then any with NULL expiry)
        const nearestBatch = await turso.execute({
          sql: `SELECT id FROM "Batch" WHERE "productId" = ? AND quantity > 0 AND date("expiryDate") > date('now') ORDER BY "expiryDate" ASC LIMIT 1`,
          args: [productId],
        })
        if (nearestBatch.rows.length > 0) {
          await turso.execute({
            sql: `UPDATE "Batch" SET "expiryDate" = ?, "updatedAt" = ? WHERE id = ?`,
            args: [expiryDate, now, nearestBatch.rows[0][0]],
          })
          expiryUpdated = true
        } else {
          // No non-expired active batches — try any active batch with NULL expiry
          const nullExpiryBatch = await turso.execute({
            sql: `SELECT id FROM "Batch" WHERE "productId" = ? AND quantity > 0 AND "expiryDate" IS NULL ORDER BY "createdAt" DESC LIMIT 1`,
            args: [productId],
          })
          if (nullExpiryBatch.rows.length > 0) {
            await turso.execute({
              sql: `UPDATE "Batch" SET "expiryDate" = ?, "updatedAt" = ? WHERE id = ?`,
              args: [expiryDate, now, nullExpiryBatch.rows[0][0]],
            })
            expiryUpdated = true
          }
        }
        // Also update Product.expiryDate so the UI reflects it immediately
        await turso.execute({
          sql: `UPDATE "Product" SET "expiryDate" = ?, "updatedAt" = ? WHERE id = ?`,
          args: [expiryDate, now, productId],
        })
        expiryUpdated = true
      }

      // Batch number update: if batchNumber provided without creating a new batch,
      // update the nearest active batch's batch number.
      let batchNoUpdated = false
      if (batchNumber && !batchCreated) {
        const targetBatch = await turso.execute({
          sql: `SELECT id FROM "Batch" WHERE "productId" = ? AND quantity > 0 ORDER BY "createdAt" DESC LIMIT 1`,
          args: [productId],
        })
        if (targetBatch.rows.length > 0) {
          await turso.execute({
            sql: `UPDATE "Batch" SET "batchNumber" = ?, "updatedAt" = ? WHERE id = ?`,
            args: [batchNumber, now, targetBatch.rows[0][0]],
          })
          batchNoUpdated = true
        }
      }

      // Update product prices (but NOT expiryDate — that's managed by batches)
      if (costPrice !== undefined || sellingPrice !== undefined) {
        const setClauses: string[] = []
        const setArgs: unknown[] = []
        if (costPrice !== undefined) {
          setClauses.push('costPrice = ?')
          setArgs.push(costPrice)
        }
        if (sellingPrice !== undefined) {
          setClauses.push('sellingPrice = ?')
          setArgs.push(sellingPrice)
        }
        setClauses.push('updatedAt = ?')
        setArgs.push(now)
        setArgs.push(productId)
        await turso.execute({
          sql: `UPDATE "Product" SET ${setClauses.join(', ')} WHERE id = ?`,
          args: setArgs,
        })
      }

      // If a batch was created, re-sync Product.expiryDate from batch data
      if (batchCreated) {
        await turso.execute({
          sql: `UPDATE "Product" SET "expiryDate" = (
                  SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
                ), "updatedAt" = ?
                WHERE id = ?`,
          args: [productId, now, productId],
        })
      }

      // Record inventory adjustment in product history
      const changedFields: string[] = []
      const previousValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}
      if (currentQty !== newQuantity) {
        changedFields.push('quantity')
        previousValues.quantity = currentQty
        newValues.quantity = newQuantity
      }
      if (costPrice !== undefined) {
        changedFields.push('costPrice')
        previousValues.costPrice = '—'
        newValues.costPrice = costPrice
      }
      if (sellingPrice !== undefined) {
        changedFields.push('sellingPrice')
        previousValues.sellingPrice = '—'
        newValues.sellingPrice = sellingPrice
      }
      if (batchCreated) {
        changedFields.push('batchReceived')
        previousValues.batchReceived = null
        newValues.batchReceived = { quantity: adjustment, expiryDate }
      }
      if (expiryUpdated && !batchCreated) {
        changedFields.push('expiryDate')
        previousValues.expiryDate = '—'
        newValues.expiryDate = expiryDate
      }
      if (batchNoUpdated) {
        changedFields.push('batchNumber')
        previousValues.batchNumber = '—'
        newValues.batchNumber = batchNumber
      }

      if (changedFields.length > 0) {
        writeProductHistory({
          productId,
          action: 'UPDATED',
          changedFields,
          previousValues,
          newValues,
          userId,
        })
      }

      // If batches were synced (including catch-all creation), re-sync Product.expiryDate
      if (batchSynced && !batchCreated) {
        await turso.execute({
          sql: `UPDATE "Product" SET "expiryDate" = (
                  SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
                ), "updatedAt" = ?
                WHERE id = ?`,
          args: [productId, now, productId],
        })
      }

      console.log(`[Inventory PUT] productId=${productId} mode=${adjustmentType || 'ADD'} newQty=${newQuantity}${batchCreated ? ' (batch created)' : ''}${batchSynced ? ' (batches synced)' : ''}${expiryUpdated && !batchCreated ? ' (expiry updated)' : ''}`)

      const { ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'INVENTORY_ADJUSTMENT', category: 'inventory', entity: 'Inventory', entityId: productId, details: { productId, newQuantity, reason }, ipAddress, userAgent })
      return NextResponse.json({
        success: true,
        newQuantity,
        productId,
        batchCreated,
        expiryUpdated,
        message: batchCreated
          ? `Added ${adjustment} units as new batch with expiry ${expiryDate} (${reason})`
          : expiryUpdated
          ? `Expiry date updated to ${expiryDate} (${reason})`
          : `Stock set to ${newQuantity} (${reason})`,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const existing = await db.inventory.findUnique({ where: { productId } })

    let newQuantity: number
    if (adjustmentType === 'SET' || setQuantity !== undefined) {
      newQuantity = setQuantity !== undefined ? setQuantity : (adjustment || 0)
    } else if (adjustment !== undefined) {
      newQuantity = (existing?.quantity || 0) + adjustment
    } else {
      newQuantity = existing?.quantity || 0
    }

    if (newQuantity < 0) {
      return NextResponse.json(
        { error: 'Insufficient stock for this adjustment' },
        { status: 400 },
      )
    }

    let productUpdate: Record<string, unknown> = {}
    if (costPrice !== undefined) productUpdate.costPrice = costPrice
    if (sellingPrice !== undefined) productUpdate.sellingPrice = sellingPrice
    // Note: expiryDate is NOT updated on Product directly — it's managed by batches
    // For ADD + expiryDate, the Turso path creates a Batch record instead

    const updated = existing
      ? await db.inventory.update({
          where: { productId },
          data: { quantity: newQuantity, lastCounted: new Date() },
          include: { product: true },
        })
      : await db.inventory.create({
          data: { productId, quantity: newQuantity, lastCounted: new Date() },
          include: { product: true },
        })

    if (Object.keys(productUpdate).length > 0) {
      await db.product.update({ where: { id: productId }, data: productUpdate })
    }

    console.log(`[Inventory PUT] productId=${productId} mode=${adjustmentType || 'ADD'} newQty=${updated.quantity}`)

    const { userId: aUid2, ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId: aUid2, action: 'INVENTORY_ADJUSTMENT', category: 'inventory', entity: 'Inventory', entityId: productId, details: { productId, newQuantity: updated.quantity, reason }, ipAddress, userAgent })
    return NextResponse.json({
      success: true,
      newQuantity: updated.quantity,
      productId,
      message: `Stock set to ${updated.quantity} (${reason})`,
      inventory: updated,
    })
  } catch (error) {
    console.error('Error updating inventory:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update inventory', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/inventory  –  receive new stock shipment
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    const allowedRoles = ['SUPER_ADMIN', 'PHARMACIST', 'TECHNICIAN', 'CLERK', 'MANAGER', 'ADMIN']
    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 })
    }

    if (isTurso()) {
      const now = new Date().toISOString()
      const userId = request.headers.get('x-user-id') || ''

      for (const item of items) {
        if (!item.productId || !item.quantity) continue

        // Read-modify-write inventory total
        const existing = await turso.execute({
          sql: 'SELECT quantity FROM Inventory WHERE productId = ?',
          args: [item.productId],
        })

        if (existing.rows.length > 0) {
          const currentQty = existing.rows[0][0] as number
          await turso.execute({
            sql: 'UPDATE Inventory SET quantity = ?, lastCounted = ?, updatedAt = ? WHERE productId = ?',
            args: [currentQty + item.quantity, now, now, item.productId],
          })
        } else {
          await turso.execute({
            sql: 'INSERT INTO Inventory (id, productId, quantity, lastCounted, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
            args: [generateId(), item.productId, item.quantity, now, now, now],
          })
        }

        // Create a Batch record for this received stock (batch-aware tracking)
        const batchId = generateId()
        const autoBN2 = item.batchNumber || generateBatchNo()
        await turso.execute({
          sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            batchId, item.productId, autoBN2, item.expiryDate || null,
            item.quantity, item.costPrice || null, now, userId, now, now,
          ],
        })

        // Re-sync Product.expiryDate from batch data (skip expired batches)
        await turso.execute({
          sql: `UPDATE "Product" SET "expiryDate" = (
                  SELECT MIN(b."expiryDate") FROM "Batch" b WHERE b."productId" = ? AND b."expiryDate" IS NOT NULL AND b.quantity > 0 AND date(b."expiryDate") > date('now')
                ), "updatedAt" = ?
                WHERE id = ?`,
          args: [item.productId, now, item.productId],
        })
      }

      // Fetch updated records
      const validItems = items.filter((i: { productId: string; quantity: number }) => i.productId && i.quantity)
      const pIds = validItems.map((i: { productId: string }) => i.productId)
      const placeholders = pIds.map(() => '?').join(', ')
      const result = await turso.execute({
        sql: `SELECT i.id, i.productId, i.quantity, i.lastCounted, i.createdAt, i.updatedAt,
                       ${P_COLS}, m.name as mfr_name, v.name as vendor_name
                FROM Inventory i
                LEFT JOIN Product p ON i.productId = p.id
                LEFT JOIN Manufacturer m ON p.manufacturerId = m.id
                LEFT JOIN Vendor v ON p.vendorId = v.id
                WHERE i.productId IN (${placeholders})`,
        args: pIds,
      })

      const results = toObjs(result).map(mapInventoryRow)

      const { userId: aUid3, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid3, action: 'INVENTORY_ADJUSTMENT', category: 'inventory', details: { itemCount: results.length }, ipAddress, userAgent })
      return NextResponse.json({
        message: 'Stock received successfully',
        receivedItems: results,
        count: results.length,
      })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const results = []

    for (const item of items) {
      if (!item.productId || !item.quantity) continue

      const existing = await db.inventory.findUnique({ where: { productId: item.productId } })
      if (existing) {
        const updated = await db.inventory.update({
          where: { productId: item.productId },
          data: { quantity: existing.quantity + item.quantity, lastCounted: new Date() },
          include: { product: true },
        })
        results.push(updated)
      } else {
        const created = await db.inventory.create({
          data: { productId: item.productId, quantity: item.quantity, lastCounted: new Date() },
          include: { product: true },
        })
        results.push(created)
      }
    }

    const { userId: aUid4, ipAddress, userAgent } = getRequestContext(request)
    writeAuditLog({ userId: aUid4, action: 'INVENTORY_ADJUSTMENT', category: 'inventory', details: { itemCount: results.length }, ipAddress, userAgent })
    return NextResponse.json({
      message: 'Stock received successfully',
      receivedItems: results,
      count: results.length,
    })
  } catch (error) {
    console.error('Error receiving stock:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to receive stock', detail: msg }, { status: 500 })
  }
}
