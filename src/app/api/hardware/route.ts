import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

// Helper: map a raw Product row (with joined inventory) to a proper object
function rowToProduct(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    ndc: (row.ndc as string) || null,
    name: row.name as string,
    genericName: (row.genericName as string) || null,
    manufacturer: (row.manufacturer as string) || null,
    manufacturerId: (row.manufacturerId as string) || null,
    vendorId: (row.vendorId as string) || null,
    category: row.category as string,
    description: (row.description as string) || null,
    dosageForm: (row.dosageForm as string) || null,
    strength: (row.strength as string) || null,
    unitOfMeasure: row.unitOfMeasure as string,
    requiresPrescription: Number(row.requiresPrescription) === 1,
    status: row.status as string,
    sellingPrice: Number(row.sellingPrice),
    costPrice: row.costPrice != null ? Number(row.costPrice) : null,
    reorderPoint: Number(row.reorderPoint),
    reorderQty: Number(row.reorderQty),
    maxStock: row.maxStock != null ? Number(row.maxStock) : null,
    storageLocation: (row.storageLocation as string) || null,
    batchNumber: (row.batchNumber as string) || null,
    expiryDate: (row.expiryDate as string) || null,
    controlledSubstance: Number(row.controlledSubstance) === 1,
    deaSchedule: (row.deaSchedule as string) || null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    inventory: row.inv_id
      ? {
          id: row.inv_id as string,
          productId: row.inv_productId as string,
          quantity: Number(row.inv_quantity),
          lastCounted: (row.inv_lastCounted as string) || null,
          createdAt: row.inv_createdAt as string,
          updatedAt: row.inv_updatedAt as string,
        }
      : null,
  }
}

// Helper: map a raw HardwareLog row
function rowToHardwareLog(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    transactionId: (row.transactionId as string) || null,
    hardwareType: row.hardwareType as string,
    action: row.action as string,
    status: row.status as string,
    details: (row.details as string) || null,
    createdAt: row.createdAt as string,
  }
}

// GET /api/hardware - Get hardware status or barcode lookup
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // GET /api/hardware/status - Get hardware status (simulated)
    if (action === 'status' || !action) {
      const status = {
        receiptPrinter: {
          connected: true,
          name: 'POS-80MM Thermal Printer',
          status: 'ready',
          paperLevel: 'good',
        },
        barcodeScanner: {
          connected: true,
          name: 'Honeywell Voyager 1202g',
          status: 'ready',
        },
        cashDrawer: {
          connected: true,
          name: 'APG VB320 Cash Drawer',
          status: 'closed',
        },
        labelPrinter: {
          connected: false,
          name: 'Zebra ZD420',
          status: 'disconnected',
        },
        scale: {
          connected: true,
          name: 'Mettler Toledo BC-150',
          status: 'ready',
        },
        lastChecked: new Date().toISOString(),
      }

      return NextResponse.json(status)
    }

    // GET /api/hardware/barcode - Barcode lookup
    if (action === 'barcode') {
      const barcode = searchParams.get('barcode')
      if (!barcode) {
        return NextResponse.json(
          { error: 'Barcode parameter is required' },
          { status: 400 }
        )
      }

      if (isTurso()) {
        // --- Raw SQL path ---
        const result = await turso.execute({
          sql: `
            SELECT
              p.id, p.ndc, p.name, p."genericName", p.manufacturer, p."manufacturerId", p."vendorId",
              p.category, p.description, p."dosageForm", p.strength, p."unitOfMeasure",
              p."requiresPrescription", p.status, p."sellingPrice", p."costPrice",
              p."reorderPoint", p."reorderQty", p."maxStock", p."storageLocation",
              p."batchNumber", p."expiryDate", p."controlledSubstance", p."deaSchedule",
              p."createdAt", p."updatedAt",
              i.id AS "inv_id", i."productId" AS "inv_productId", i.quantity AS "inv_quantity",
              i."lastCounted" AS "inv_lastCounted", i."createdAt" AS "inv_createdAt", i."updatedAt" AS "inv_updatedAt"
            FROM "Product" p
            LEFT JOIN "Inventory" i ON p.id = i."productId"
            WHERE (p.barcode = ? OR p.ndc = ? OR p."batchNumber" = ?) AND p.status != 'DISCONTINUED'
            LIMIT 1
          `,
          args: [barcode, barcode, barcode],
        })

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'Product not found for this barcode' },
            { status: 404 }
          )
        }

        const product = rowToProduct(result.rows[0] as Record<string, unknown>)

        return NextResponse.json({
          product,
          stockLevel: product.inventory?.quantity || 0,
        })
      } else {
        // --- Prisma fallback ---
        const { db } = await import('@/lib/db')

        const product = await db.product.findFirst({
          where: {
            OR: [
              { ndc: barcode },
              { batchNumber: barcode },
            ],
            NOT: { status: 'DISCONTINUED' },
          },
          include: {
            inventory: true,
          },
        })

        if (!product) {
          return NextResponse.json(
            { error: 'Product not found for this barcode' },
            { status: 404 }
          )
        }

        return NextResponse.json({
          product,
          stockLevel: product.inventory?.quantity || 0,
        })
      }
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error with hardware request:', error)
    return NextResponse.json(
      { error: 'Hardware request failed' },
      { status: 500 }
    )
  }
}

// POST /api/hardware - Log receipt print, cash drawer open, barcode scan
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const body = await request.json()

    if (!action) {
      return NextResponse.json(
        { error: 'Action parameter is required (receipt, drawer, barcode)' },
        { status: 400 }
      )
    }

    // POST /api/hardware/receipt - Log receipt print
    if (action === 'receipt') {
      const { transactionId, hardwareType, details } = body

      if (!transactionId) {
        return NextResponse.json(
          { error: 'transactionId is required' },
          { status: 400 }
        )
      }

      if (isTurso()) {
        // --- Raw SQL path ---
        const logId = generateId()
        const now = new Date().toISOString()

        await turso.execute({
          sql: `INSERT INTO "HardwareLog" ("id", "transactionId", "hardwareType", "action", "status", "details", "createdAt") VALUES (?, ?, ?, 'RECEIPT_PRINTED', 'success', ?, ?)`,
          args: [
            logId,
            transactionId,
            hardwareType || 'receipt_printer',
            details ? JSON.stringify(details) : null,
            now,
          ],
        })

        const logResult = await turso.execute({
          sql: `SELECT "id", "transactionId", "hardwareType", "action", "status", "details", "createdAt" FROM "HardwareLog" WHERE "id" = ?`,
          args: [logId],
        })

        return NextResponse.json({
          message: 'Receipt print logged successfully',
          hardwareLog: rowToHardwareLog(logResult.rows[0] as Record<string, unknown>),
        })
      } else {
        // --- Prisma fallback ---
        const { db } = await import('@/lib/db')

        const hardwareLog = await db.hardwareLog.create({
          data: {
            transactionId,
            hardwareType: hardwareType || 'receipt_printer',
            action: 'RECEIPT_PRINTED',
            status: 'success',
            details: details ? JSON.stringify(details) : null,
          },
        })

        return NextResponse.json({
          message: 'Receipt print logged successfully',
          hardwareLog,
        })
      }
    }

    // POST /api/hardware/drawer - Log cash drawer open
    if (action === 'drawer') {
      const { details } = body

      if (isTurso()) {
        // --- Raw SQL path ---
        const logId = generateId()
        const now = new Date().toISOString()

        await turso.execute({
          sql: `INSERT INTO "HardwareLog" ("id", "hardwareType", "action", "status", "details", "createdAt") VALUES (?, 'cash_drawer', 'CASH_DRAWER_OPENED', 'success', ?, ?)`,
          args: [
            logId,
            details ? JSON.stringify(details) : null,
            now,
          ],
        })

        const logResult = await turso.execute({
          sql: `SELECT "id", "transactionId", "hardwareType", "action", "status", "details", "createdAt" FROM "HardwareLog" WHERE "id" = ?`,
          args: [logId],
        })

        return NextResponse.json({
          message: 'Cash drawer open logged successfully',
          hardwareLog: rowToHardwareLog(logResult.rows[0] as Record<string, unknown>),
        })
      } else {
        // --- Prisma fallback ---
        const { db } = await import('@/lib/db')

        const hardwareLog = await db.hardwareLog.create({
          data: {
            hardwareType: 'cash_drawer',
            action: 'CASH_DRAWER_OPENED',
            status: 'success',
            details: details ? JSON.stringify(details) : null,
          },
        })

        return NextResponse.json({
          message: 'Cash drawer open logged successfully',
          hardwareLog,
        })
      }
    }

    // POST /api/hardware/barcode - Log barcode scan and lookup product
    if (action === 'barcode') {
      const { barcode } = body

      if (!barcode) {
        return NextResponse.json(
          { error: 'Barcode is required' },
          { status: 400 }
        )
      }

      if (isTurso()) {
        // --- Raw SQL path ---

        // Log the scan first
        const logId = generateId()
        const now = new Date().toISOString()

        await turso.execute({
          sql: `INSERT INTO "HardwareLog" ("id", "hardwareType", "action", "status", "details", "createdAt") VALUES (?, 'barcode_scanner', 'BARCODE_SCANNED', 'success', ?, ?)`,
          args: [
            logId,
            JSON.stringify({ barcode }),
            now,
          ],
        })

        // Look up product: ndc = ? OR batchNumber = ? OR name LIKE ?
        const result = await turso.execute({
          sql: `
            SELECT
              p.id, p.ndc, p.name, p."genericName", p.manufacturer, p."manufacturerId", p."vendorId",
              p.category, p.description, p."dosageForm", p.strength, p."unitOfMeasure",
              p."requiresPrescription", p.status, p."sellingPrice", p."costPrice",
              p."reorderPoint", p."reorderQty", p."maxStock", p."storageLocation",
              p."batchNumber", p."expiryDate", p."controlledSubstance", p."deaSchedule",
              p."createdAt", p."updatedAt",
              i.id AS "inv_id", i."productId" AS "inv_productId", i.quantity AS "inv_quantity",
              i."lastCounted" AS "inv_lastCounted", i."createdAt" AS "inv_createdAt", i."updatedAt" AS "inv_updatedAt"
            FROM "Product" p
            LEFT JOIN "Inventory" i ON p.id = i."productId"
            WHERE (p.barcode = ? OR p.ndc = ? OR p."batchNumber" = ? OR p.name LIKE '%' || ? || '%') AND p.status != 'DISCONTINUED'
            LIMIT 1
          `,
          args: [barcode, barcode, barcode, barcode],
        })

        if (result.rows.length === 0) {
          return NextResponse.json(
            { error: 'Product not found for this barcode' },
            { status: 404 }
          )
        }

        const product = rowToProduct(result.rows[0] as Record<string, unknown>)

        return NextResponse.json({
          product,
          stockLevel: product.inventory?.quantity || 0,
        })
      } else {
        // --- Prisma fallback ---
        const { db } = await import('@/lib/db')

        // Log the scan
        await db.hardwareLog.create({
          data: {
            hardwareType: 'barcode_scanner',
            action: 'BARCODE_SCANNED',
            status: 'success',
            details: JSON.stringify({ barcode }),
          },
        })

        // Look up product
        const product = await db.product.findFirst({
          where: {
            OR: [
              { barcode },
              { ndc: barcode },
              { batchNumber: barcode },
              { name: { contains: barcode } },
            ],
            NOT: { status: 'DISCONTINUED' },
          },
          include: {
            inventory: true,
          },
        })

        if (!product) {
          return NextResponse.json(
            { error: 'Product not found for this barcode' },
            { status: 404 }
          )
        }

        return NextResponse.json({
          product,
          stockLevel: product.inventory?.quantity || 0,
        })
      }
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: receipt, drawer, or barcode' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error with hardware POST:', error)
    return NextResponse.json(
      { error: 'Hardware request failed' },
      { status: 500 }
    )
  }
}
