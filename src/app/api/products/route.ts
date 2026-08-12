import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeProductHistory } from '@/lib/product-history'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/products - List all products with search, filter, pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (isTurso()) {
      // Raw SQL path
      const conditions: string[] = []
      const args: (string | number)[] = []

      if (search) {
        conditions.push(
          `(p.name LIKE '%' || ? || '%' OR p."genericName" LIKE '%' || ? || '%' OR p.manufacturer LIKE '%' || ? || '%' OR p.ndc LIKE '%' || ? || '%')`
        )
        args.push(search, search, search, search)
      }

      if (category) {
        conditions.push(`p.category = ?`)
        args.push(category)
      }

      if (status) {
        conditions.push(`p.status = ?`)
        args.push(status)
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const skip = (page - 1) * limit

      // Count query
      const countResult = await turso.execute({
        sql: `SELECT COUNT(*) as total FROM "Product" p ${whereClause}`,
        args: [...args],
      })
      const total = Number(countResult.rows[0].total)

      // Data query with JOINs for inventory, vendor, manufacturerRef
      const dataResult = await turso.execute({
        sql: `
          SELECT
            p.id, p.ndc, p.barcode, p.name, p."genericName", p.manufacturer, p."manufacturerId", p."vendorId",
            p.category, p.description, p."dosageForm", p.strength, p."unitOfMeasure", p."sellingUnit", p."itemsPerUnit",
            p."requiresPrescription", p.status, p."sellingPrice", p."costPrice",
            p."reorderPoint", p."reorderQty", p."maxStock", p."storageLocation",
            p."batchNumber", p."expiryDate", p."controlledSubstance", p."deaSchedule",
            p."createdAt", p."updatedAt",
            i.id AS "inv_id", i."productId" AS "inv_productId", i.quantity AS "inv_quantity",
            i."lastCounted" AS "inv_lastCounted", i."createdAt" AS "inv_createdAt", i."updatedAt" AS "inv_updatedAt",
            v.id AS "vendor_id", v.name AS "vendor_name",
            m.id AS "mfr_id", m.name AS "mfr_name"
          FROM "Product" p
          LEFT JOIN "Inventory" i ON p.id = i."productId"
          LEFT JOIN "Vendor" v ON p."vendorId" = v.id
          LEFT JOIN "Manufacturer" m ON p."manufacturerId" = m.id
          ${whereClause}
          ORDER BY p."createdAt" DESC
          LIMIT ? OFFSET ?
        `,
        args: [...args, limit, skip],
      })

      const rawProducts = dataResult.rows.map((row) => ({
        id: row.id as string,
        ndc: row.ndc as string | null,
        barcode: row.barcode as string | null,
        name: row.name as string,
        genericName: row.genericName as string | null,
        manufacturer: row.manufacturer as string | null,
        manufacturerId: row.manufacturerId as string | null,
        vendorId: row.vendorId as string | null,
        category: row.category as string,
        description: row.description as string | null,
        dosageForm: row.dosageForm as string | null,
        strength: row.strength as string | null,
        unitOfMeasure: row.unitOfMeasure as string,
        sellingUnit: (row.sellingUnit as string) || 'EA',
        itemsPerUnit: Number(row.itemsPerUnit) || 1,
        requiresPrescription: Number(row.requiresPrescription) === 1,
        status: row.status as string,
        sellingPrice: Number(row.sellingPrice),
        costPrice: row.costPrice != null ? Number(row.costPrice) : null,
        reorderPoint: Number(row.reorderPoint),
        reorderQty: Number(row.reorderQty),
        maxStock: row.maxStock != null ? Number(row.maxStock) : null,
        storageLocation: row.storageLocation as string | null,
        batchNumber: row.batchNumber as string | null,
        expiryDate: row.expiryDate as string | null,
        controlledSubstance: Number(row.controlledSubstance) === 1,
        deaSchedule: row.deaSchedule as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        inventory: row.inv_id
          ? [{
              id: row.inv_id as string,
              productId: row.inv_productId as string,
              quantity: Number(row.inv_quantity),
              lastCounted: row.inv_lastCounted as string | null,
              createdAt: row.inv_createdAt as string,
              updatedAt: row.inv_updatedAt as string,
            }]
          : [],
        vendor: row.vendor_id
          ? {
              id: row.vendor_id as string,
              name: row.vendor_name as string,
            }
          : null,
        manufacturerRef: row.mfr_id
          ? {
              id: row.mfr_id as string,
              name: row.mfr_name as string,
            }
          : null,
      }))

      // Batch-level expiry summary for products on this page
      const productIds = rawProducts.map((p) => p.id)
      let batchSummaryMap = new Map<string, Record<string, unknown>>() 
      if (productIds.length > 0) {
        const phPlaceholders = productIds.map(() => '?').join(', ')
        const batchSummaryResult = await turso.execute({
          sql: `SELECT b."productId",
                       COUNT(*) as totalBatches,
                       SUM(CASE WHEN date(b."expiryDate") <= date('now') THEN 1 ELSE 0 END) as expiredBatches,
                       SUM(CASE WHEN date(b."expiryDate") > date('now') THEN 1 ELSE 0 END) as activeBatches,
                       MIN(CASE WHEN date(b."expiryDate") > date('now') THEN b."expiryDate" ELSE NULL END) as nearestActiveExpiry,
                       MIN(CASE WHEN date(b."expiryDate") <= date('now') THEN b."expiryDate" ELSE NULL END) as nearestExpiredDate,
                       SUM(CASE WHEN date(b."expiryDate") > date('now') AND date(b."expiryDate") <= date('now', '+30 days') THEN 1 ELSE 0 END) as nearExpiryBatches
                FROM "Batch" b
                WHERE b.quantity > 0 AND b."expiryDate" IS NOT NULL AND b."productId" IN (${phPlaceholders})
                GROUP BY b."productId"`,
          args: productIds as (string | number)[],
        })
        for (const r of batchSummaryResult.rows) {
          const obj: Record<string, unknown> = {}
          batchSummaryResult.columns.forEach((c, i) => { obj[c.name] = r[i] })
          batchSummaryMap.set(obj.productId as string, obj)
        }
      }

      const defaultSummary = { hasBatches: false, totalBatches: 0, expiredBatches: 0, activeBatches: 0, allBatchesExpired: false, hasExpiredBatches: false, nearExpiryBatches: 0, nearestActiveExpiry: null, nearestExpiredDate: null }
      const products = rawProducts.map((p) => {
        const bs = batchSummaryMap.get(p.id)
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
        } : defaultSummary
        return { ...p, batchExpirySummary: summary }
      })

      return NextResponse.json({
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}

      if (search) {
        where.OR = [
          { name: { contains: search } },
          { genericName: { contains: search } },
          { manufacturer: { contains: search } },
          { ndc: { contains: search } },
        ]
      }

      if (category) {
        where.category = category
      }

      if (status) {
        where.status = status
      }

      const skip = (page - 1) * limit

      const [products, total] = await Promise.all([
        db.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            inventory: true,
            vendor: { select: { id: true, name: true } },
            manufacturerRef: { select: { id: true, name: true } },
          },
        }),
        db.product.count({ where }),
      ])

      return NextResponse.json({
        products,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    }
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

// POST /api/products - Create product (PHARMACIST, SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Auto-generate barcode if not provided
    if (!body.barcode) {
      const { ensureBarcode } = await import('@/lib/barcode')
      body.barcode = ensureBarcode(null, body.ndc)
    }

    if (isTurso()) {
      // Raw SQL path
      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `
          INSERT INTO "Product" (
            id, ndc, barcode, name, "genericName", manufacturer, "manufacturerId", "vendorId",
            category, description, "dosageForm", strength, "unitOfMeasure",
            "sellingUnit", "itemsPerUnit",
            "requiresPrescription", status, "sellingPrice", "costPrice",
            "reorderPoint", "reorderQty", "maxStock", "storageLocation",
            "batchNumber", "expiryDate", "controlledSubstance", "deaSchedule",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          id,
          body.ndc || null,
          body.barcode || null,
          body.name,
          body.genericName || null,
          body.manufacturer || null,
          body.manufacturerId || null,
          body.vendorId || null,
          body.category || 'OTC',
          body.description || null,
          body.dosageForm || null,
          body.strength || null,
          body.unitOfMeasure || 'EA',
          body.sellingUnit || 'EA',
          body.itemsPerUnit || 1,
          body.requiresPrescription ? 1 : 0,
          body.status || 'ACTIVE',
          body.sellingPrice,
          body.costPrice != null ? body.costPrice : null,
          body.reorderPoint || 10,
          body.reorderQty || 50,
          body.maxStock != null ? body.maxStock : null,
          body.storageLocation || null,
          body.batchNumber || null,
          body.expiryDate || null,
          body.controlledSubstance ? 1 : 0,
          body.deaSchedule || null,
          now,
          now,
        ],
      })

      // Create inventory record for the product
      const inventoryId = generateId()
      await turso.execute({
        sql: `
          INSERT INTO "Inventory" (id, "productId", quantity, "createdAt", "updatedAt")
          VALUES (?, ?, 0, ?, ?)
        `,
        args: [inventoryId, id, now, now],
      })

      // Fetch the created product with relations to return
      const result = await turso.execute({
        sql: `
          SELECT
            p.id, p.ndc, p.barcode, p.name, p."genericName", p.manufacturer, p."manufacturerId", p."vendorId",
            p.category, p.description, p."dosageForm", p.strength, p."unitOfMeasure", p."sellingUnit", p."itemsPerUnit",
            p."requiresPrescription", p.status, p."sellingPrice", p."costPrice",
            p."reorderPoint", p."reorderQty", p."maxStock", p."storageLocation",
            p."batchNumber", p."expiryDate", p."controlledSubstance", p."deaSchedule",
            p."createdAt", p."updatedAt",
            i.id AS "inv_id", i."productId" AS "inv_productId", i.quantity AS "inv_quantity",
            i."lastCounted" AS "inv_lastCounted", i."createdAt" AS "inv_createdAt", i."updatedAt" AS "inv_updatedAt",
            v.id AS "vendor_id", v.name AS "vendor_name",
            m.id AS "mfr_id", m.name AS "mfr_name"
          FROM "Product" p
          LEFT JOIN "Inventory" i ON p.id = i."productId"
          LEFT JOIN "Vendor" v ON p."vendorId" = v.id
          LEFT JOIN "Manufacturer" m ON p."manufacturerId" = m.id
          WHERE p.id = ?
        `,
        args: [id],
      })

      const row = result.rows[0]
      const product = {
        id: row.id as string,
        ndc: row.ndc as string | null,
        barcode: row.barcode as string | null,
        name: row.name as string,
        genericName: row.genericName as string | null,
        manufacturer: row.manufacturer as string | null,
        manufacturerId: row.manufacturerId as string | null,
        vendorId: row.vendorId as string | null,
        category: row.category as string,
        description: row.description as string | null,
        dosageForm: row.dosageForm as string | null,
        strength: row.strength as string | null,
        unitOfMeasure: row.unitOfMeasure as string,
        sellingUnit: (row.sellingUnit as string) || 'EA',
        itemsPerUnit: Number(row.itemsPerUnit) || 1,
        requiresPrescription: Number(row.requiresPrescription) === 1,
        status: row.status as string,
        sellingPrice: Number(row.sellingPrice),
        costPrice: row.costPrice != null ? Number(row.costPrice) : null,
        reorderPoint: Number(row.reorderPoint),
        reorderQty: Number(row.reorderQty),
        maxStock: row.maxStock != null ? Number(row.maxStock) : null,
        storageLocation: row.storageLocation as string | null,
        batchNumber: row.batchNumber as string | null,
        expiryDate: row.expiryDate as string | null,
        controlledSubstance: Number(row.controlledSubstance) === 1,
        deaSchedule: row.deaSchedule as string | null,
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string,
        inventory: row.inv_id
          ? [{
              id: row.inv_id as string,
              productId: row.inv_productId as string,
              quantity: Number(row.inv_quantity),
              lastCounted: row.inv_lastCounted as string | null,
              createdAt: row.inv_createdAt as string,
              updatedAt: row.inv_updatedAt as string,
            }]
          : [],
        vendor: row.vendor_id
          ? {
              id: row.vendor_id as string,
              name: row.vendor_name as string,
            }
          : null,
        manufacturerRef: row.mfr_id
          ? {
              id: row.mfr_id as string,
              name: row.mfr_name as string,
            }
          : null,
      }

      // Record creation in product history (fire-and-forget)
      const userId = request.headers.get('x-user-id') || ''
      writeProductHistory({
        productId: id,
        action: 'CREATED',
        newValues: { name: body.name, category: body.category || 'OTC', sellingPrice: body.sellingPrice },
        userId,
      })

      const { ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'PRODUCT_CREATED', category: 'product', entity: 'Product', entityId: id, details: { name: body.name }, ipAddress, userAgent })
      return NextResponse.json(product, { status: 201 })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const product = await db.product.create({
        data: {
          ndc: body.ndc,
          barcode: body.barcode,
          name: body.name,
          genericName: body.genericName,
          manufacturer: body.manufacturer || null,
          manufacturerId: body.manufacturerId || null,
          vendorId: body.vendorId || null,
          category: body.category || 'OTC',
          description: body.description,
          dosageForm: body.dosageForm,
          strength: body.strength,
          unitOfMeasure: body.unitOfMeasure || 'EA',
          sellingUnit: body.sellingUnit || 'EA',
          itemsPerUnit: body.itemsPerUnit || 1,
          requiresPrescription: body.requiresPrescription || false,
          status: body.status || 'ACTIVE',
          sellingPrice: body.sellingPrice,
          costPrice: body.costPrice,
          reorderPoint: body.reorderPoint || 10,
          reorderQty: body.reorderQty || 50,
          maxStock: body.maxStock,
          storageLocation: body.storageLocation,
          batchNumber: body.batchNumber,
          expiryDate: body.expiryDate,
          controlledSubstance: body.controlledSubstance || false,
          deaSchedule: body.deaSchedule,
        },
      })

      // Create inventory record for the product
      await db.inventory.create({
        data: {
          productId: product.id,
          quantity: 0,
        },
      })

      const userId = request.headers.get('x-user-id') || ''
      writeProductHistory({
        productId: product.id,
        action: 'CREATED',
        newValues: { name: body.name, category: body.category || 'OTC', sellingPrice: body.sellingPrice },
        userId,
      })

      const { ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId, action: 'PRODUCT_CREATED', category: 'product', entity: 'Product', entityId: product.id, details: { name: body.name }, ipAddress, userAgent })
      return NextResponse.json(product, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}
