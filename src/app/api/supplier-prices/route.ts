import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, safeArgs, tursoExecute } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// Self-healing: ensure tables exist in Turso
let ensured = false
async function ensureTables() {
  if (ensured || !isTurso()) return
  try {
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "SupplierPriceList" (
        id TEXT PRIMARY KEY,
        "vendorId" TEXT NOT NULL,
        "vendorName" TEXT NOT NULL,
        "validFrom" TEXT,
        "validTo" TEXT,
        notes TEXT,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE TABLE IF NOT EXISTS "SupplierPriceListItem" (
        id TEXT PRIMARY KEY,
        "priceListId" TEXT NOT NULL REFERENCES "SupplierPriceList"(id) ON DELETE CASCADE,
        "productName" TEXT NOT NULL,
        "productId" TEXT,
        "unitCost" REAL NOT NULL,
        "packSize" TEXT,
        "minOrderQty" INTEGER,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_spl_vendorId" ON "SupplierPriceList"("vendorId")`,
      args: [],
    })
    await turso.execute({
      sql: `CREATE INDEX IF NOT EXISTS "idx_spli_priceListId" ON "SupplierPriceListItem"("priceListId")`,
      args: [],
    })
    ensured = true
  } catch (err) {
    console.error('Failed to ensure SupplierPrice tables:', err)
  }
}

// GET /api/supplier-prices?vendorId=...
// GET /api/supplier-prices/compare?productId=...  (handled below)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Compare prices across vendors for a product
    if (searchParams.get('compare') === 'true' && searchParams.get('productId')) {
      return comparePrices(searchParams.get('productId')!)
    }

    const vendorId = searchParams.get('vendorId')

    if (isTurso()) {
      await ensureTables()

      const where = vendorId ? `WHERE spl."vendorId" = ?` : ''
      const args = vendorId ? [vendorId] : []

      const result = await turso.execute({
        sql: `
          SELECT spl.*,
            (SELECT COUNT(*) FROM "SupplierPriceListItem" spli WHERE spli."priceListId" = spl.id) as item_count
          FROM "SupplierPriceList" spl
          ${where}
          ORDER BY spl."createdAt" DESC
        `,
        args,
      })

      const lists = result.rows.map((row) => ({
        id: row.id as string,
        vendorId: row.vendorId as string,
        vendorName: row.vendorName as string,
        validFrom: row.validFrom as string | null,
        validTo: row.validTo as string | null,
        notes: row.notes as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        _count: { items: Number(row.item_count) },
      }))

      return NextResponse.json(lists)
    } else {
      // Prisma fallback
      const { db } = await import('@/lib/db')
      const where = vendorId ? { vendorId } : {}
      const lists = await db.supplierPriceList.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { items: true } } },
      })
      return NextResponse.json(lists)
    }
  } catch (error) {
    console.error('Error fetching supplier price lists:', error)
    return NextResponse.json({ error: 'Failed to fetch price lists' }, { status: 500 })
  }
}

// Compare prices across vendors for a product
async function comparePrices(productId: string) {
  if (isTurso()) {
    await ensureTables()
    const result = await turso.execute({
      sql: `
        SELECT spli.*, spl."vendorName", spl."validFrom", spl."validTo", spl.id as "listId"
        FROM "SupplierPriceListItem" spli
        JOIN "SupplierPriceList" spl ON spl.id = spli."priceListId"
        WHERE (spli."productId" = ? OR spli."productName" IN (
          SELECT name FROM "Product" WHERE id = ?
        ))
        ORDER BY spli."unitCost" ASC
      `,
      args: [productId, productId],
    })
    const items = result.rows.map((row) => ({
      id: row.id as string,
      productName: row.productName as string,
      productId: row.productId as string | null,
      unitCost: Number(row.unitCost),
      packSize: row.packSize as string | null,
      minOrderQty: row.minOrderQty ? Number(row.minOrderQty) : null,
      vendorName: row.vendorName as string,
      validFrom: row.validFrom as string | null,
      validTo: row.validTo as string | null,
      listId: row.listId as string,
    }))
    return NextResponse.json(items)
  } else {
    // Prisma fallback - look up product name first
    const { db } = await import('@/lib/db')
    const product = await db.product.findUnique({ where: { id: productId }, select: { name: true } })
    if (!product) return NextResponse.json([])

    const items = await db.supplierPriceListItem.findMany({
      where: {
        OR: [
          { productId },
          { productName: product.name },
        ],
      },
      include: {
        priceList: { select: { vendorName: true, validFrom: true, validTo: true } },
      },
      orderBy: { unitCost: 'asc' },
    })
    const mapped = items.map((item) => ({
      id: item.id,
      productName: item.productName,
      productId: item.productId,
      unitCost: item.unitCost,
      packSize: item.packSize,
      minOrderQty: item.minOrderQty,
      vendorName: item.priceList.vendorName,
      validFrom: item.priceList.validFrom,
      validTo: item.priceList.validTo,
      listId: item.priceListId,
    }))
    return NextResponse.json(mapped)
  }
}

// POST /api/supplier-prices - Create a price list with items
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { vendorId, vendorName, validFrom, validTo, notes, items } = body

    if (!vendorId || !vendorName || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'vendorId, vendorName, and items array are required' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      await ensureTables()
      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `INSERT INTO "SupplierPriceList" (id, "vendorId", "vendorName", "validFrom", "validTo", notes, "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, vendorId, vendorName, validFrom || null, validTo || null, notes || null, now, now],
      })

      // Insert items using batch
      const itemStmts = items.map((item: any) => ({
        sql: `INSERT INTO "SupplierPriceListItem" (id, "priceListId", "productName", "productId", "unitCost", "packSize", "minOrderQty", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          generateId(),
          id,
          item.productName,
          item.productId || null,
          item.unitCost,
          item.packSize || null,
          item.minOrderQty ? Number(item.minOrderQty) : null,
          now,
        ],
      }))

      if (itemStmts.length > 0) {
        await turso.batch(itemStmts)
      }

      const { userId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({
        userId, action: 'PRICE_LIST_CREATED', category: 'catalog',
        entity: 'SupplierPriceList', entityId: id,
        details: { vendorName, itemCount: items.length }, ipAddress, userAgent,
      }).catch(() => {})

      return NextResponse.json({ id, vendorId, vendorName, validFrom, validTo, notes, itemCount: items.length, createdAt: now }, { status: 201 })
    } else {
      // Prisma fallback
      const { db } = await import('@/lib/db')
      const list = await db.supplierPriceList.create({
        data: {
          vendorId,
          vendorName,
          validFrom: validFrom || null,
          validTo: validTo || null,
          notes: notes || null,
          items: {
            create: items.map((item: any) => ({
              productName: item.productName,
              productId: item.productId || null,
              unitCost: item.unitCost,
              packSize: item.packSize || null,
              minOrderQty: item.minOrderQty ? Number(item.minOrderQty) : null,
            })),
          },
        },
        include: { _count: { select: { items: true } } },
      })

      const { userId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({
        userId, action: 'PRICE_LIST_CREATED', category: 'catalog',
        entity: 'SupplierPriceList', entityId: list.id,
        details: { vendorName, itemCount: items.length }, ipAddress, userAgent,
      }).catch(() => {})

      return NextResponse.json(list, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating supplier price list:', error)
    return NextResponse.json({ error: 'Failed to create price list' }, { status: 500 })
  }
}

// DELETE /api/supplier-prices?priceListId=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const priceListId = searchParams.get('priceListId')
    if (!priceListId) {
      return NextResponse.json({ error: 'priceListId is required' }, { status: 400 })
    }

    if (isTurso()) {
      await ensureTables()
      // Delete items first (SQLite may not enforce CASCADE in all configs)
      await turso.execute({
        sql: `DELETE FROM "SupplierPriceListItem" WHERE "priceListId" = ?`,
        args: [priceListId],
      })
      await turso.execute({
        sql: `DELETE FROM "SupplierPriceList" WHERE id = ?`,
        args: [priceListId],
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.supplierPriceListItem.deleteMany({ where: { priceListId } })
      await db.supplierPriceList.delete({ where: { id: priceListId } })
    }

    const { userId, ipAddress, userAgent } = getRequestContext(req)
    await writeAuditLog({
      userId, action: 'PRICE_LIST_DELETED', category: 'catalog',
      entity: 'SupplierPriceList', entityId: priceListId,
      details: {}, ipAddress, userAgent,
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting supplier price list:', error)
    return NextResponse.json({ error: 'Failed to delete price list' }, { status: 500 })
  }
}

// GET /api/supplier-prices/[priceListId]/items - Get items for a price list
// This is handled by a separate dynamic route if needed, but we can also
// support it via query param: GET /api/supplier-prices?listId=...&items=true
// We'll add this in the GET handler
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const listId = searchParams.get('listId')
    if (!listId || searchParams.get('items') !== 'true') {
      return NextResponse.json({ error: 'Only supports ?listId=...&items=true' }, { status: 400 })
    }

    if (isTurso()) {
      await ensureTables()
      const result = await turso.execute({
        sql: `SELECT * FROM "SupplierPriceListItem" WHERE "priceListId" = ? ORDER BY "productName" ASC`,
        args: [listId],
      })
      const items = result.rows.map((row) => ({
        id: row.id as string,
        productName: row.productName as string,
        productId: row.productId as string | null,
        unitCost: Number(row.unitCost),
        packSize: row.packSize as string | null,
        minOrderQty: row.minOrderQty ? Number(row.minOrderQty) : null,
        createdAt: row.createdAt as string,
      }))
      return NextResponse.json(items)
    } else {
      const { db } = await import('@/lib/db')
      const items = await db.supplierPriceListItem.findMany({
        where: { priceListId: listId },
        orderBy: { productName: 'asc' },
      })
      return NextResponse.json(items)
    }
  } catch (error) {
    console.error('Error fetching price list items:', error)
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }
}
