import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { writeProductHistory } from '@/lib/product-history'

// GET /api/products/[id] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (isTurso()) {
      // Raw SQL path
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

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

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
          ? {
              id: row.inv_id as string,
              productId: row.inv_productId as string,
              quantity: Number(row.inv_quantity),
              lastCounted: row.inv_lastCounted as string | null,
              createdAt: row.inv_createdAt as string,
              updatedAt: row.inv_updatedAt as string,
            }
          : null,
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

      return NextResponse.json(product)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const product = await db.product.findUnique({
        where: { id },
        include: {
          inventory: true,
          vendor: { select: { id: true, name: true } },
          manufacturerRef: { select: { id: true, name: true } },
        },
      })

      if (!product) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(product)
    }
  } catch (error) {
    console.error('Error fetching product:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch product', detail: msg },
      { status: 500 }
    )
  }
}

// PUT /api/products/[id] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()

    if (isTurso()) {
      // Raw SQL path
      // Check if product exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Product" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      // Build dynamic UPDATE
      const updateFields: string[] = []
      const updateArgs: (string | number | null)[] = []

      if (body.ndc !== undefined) {
        updateFields.push(`ndc = ?`)
        updateArgs.push(body.ndc || null)
      }
      if (body.name !== undefined) {
        updateFields.push(`name = ?`)
        updateArgs.push(body.name)
      }
      if (body.genericName !== undefined) {
        updateFields.push(`"genericName" = ?`)
        updateArgs.push(body.genericName || null)
      }
      if (body.manufacturer !== undefined) {
        updateFields.push(`manufacturer = ?`)
        updateArgs.push(body.manufacturer || null)
      }
      if (body.manufacturerId !== undefined) {
        updateFields.push(`"manufacturerId" = ?`)
        updateArgs.push(body.manufacturerId || null)
      }
      if (body.vendorId !== undefined) {
        updateFields.push(`"vendorId" = ?`)
        updateArgs.push(body.vendorId || null)
      }
      if (body.category !== undefined) {
        updateFields.push(`category = ?`)
        updateArgs.push(body.category)
      }
      if (body.description !== undefined) {
        updateFields.push(`description = ?`)
        updateArgs.push(body.description || null)
      }
      if (body.dosageForm !== undefined) {
        updateFields.push(`"dosageForm" = ?`)
        updateArgs.push(body.dosageForm || null)
      }
      if (body.strength !== undefined) {
        updateFields.push(`strength = ?`)
        updateArgs.push(body.strength || null)
      }
      if (body.unitOfMeasure !== undefined) {
        updateFields.push(`"unitOfMeasure" = ?`)
        updateArgs.push(body.unitOfMeasure)
      }
      if (body.sellingUnit !== undefined) {
        updateFields.push(`"sellingUnit" = ?`)
        updateArgs.push(body.sellingUnit)
      }
      if (body.itemsPerUnit !== undefined) {
        updateFields.push(`"itemsPerUnit" = ?`)
        updateArgs.push(body.itemsPerUnit)
      }
      if (body.requiresPrescription !== undefined) {
        updateFields.push(`"requiresPrescription" = ?`)
        updateArgs.push(body.requiresPrescription ? 1 : 0)
      }
      if (body.status !== undefined) {
        updateFields.push(`status = ?`)
        updateArgs.push(body.status)
      }
      if (body.sellingPrice !== undefined) {
        updateFields.push(`"sellingPrice" = ?`)
        updateArgs.push(body.sellingPrice)
      }
      if (body.costPrice !== undefined) {
        updateFields.push(`"costPrice" = ?`)
        updateArgs.push(body.costPrice != null ? body.costPrice : null)
      }
      if (body.reorderPoint !== undefined) {
        updateFields.push(`"reorderPoint" = ?`)
        updateArgs.push(body.reorderPoint)
      }
      if (body.reorderQty !== undefined) {
        updateFields.push(`"reorderQty" = ?`)
        updateArgs.push(body.reorderQty)
      }
      if (body.maxStock !== undefined) {
        updateFields.push(`"maxStock" = ?`)
        updateArgs.push(body.maxStock != null ? body.maxStock : null)
      }
      if (body.storageLocation !== undefined) {
        updateFields.push(`"storageLocation" = ?`)
        updateArgs.push(body.storageLocation || null)
      }
      if (body.batchNumber !== undefined) {
        updateFields.push(`"batchNumber" = ?`)
        updateArgs.push(body.batchNumber || null)
      }
      if (body.expiryDate !== undefined) {
        updateFields.push(`"expiryDate" = ?`)
        updateArgs.push(body.expiryDate || null)
      }
      if (body.controlledSubstance !== undefined) {
        updateFields.push(`"controlledSubstance" = ?`)
        updateArgs.push(body.controlledSubstance ? 1 : 0)
      }
      if (body.deaSchedule !== undefined) {
        updateFields.push(`"deaSchedule" = ?`)
        updateArgs.push(body.deaSchedule || null)
      }
      if (body.barcode !== undefined) {
        updateFields.push(`barcode = ?`)
        updateArgs.push(body.barcode || null)
      }

      if (updateFields.length > 0) {
        updateFields.push(`"updatedAt" = ?`)
        updateArgs.push(new Date().toISOString())

        const sql = `UPDATE "Product" SET ${updateFields.join(', ')} WHERE id = ?`
        updateArgs.push(id)

        // Capture previous values before update for history
        const prevResult = await turso.execute({
          sql: `SELECT name, category, "sellingPrice", "costPrice", "reorderPoint",
                       "expiryDate", "batchNumber", status, ndc, "dosageForm",
                       manufacturer, "vendorId", "manufacturerId", strength
                FROM "Product" WHERE id = ?`,
          args: [id],
        })
        const prevRow = prevResult.rows[0]

        await turso.execute({ sql, args: updateArgs })

        // Record update in product history (fire-and-forget)
        const fieldMap: Record<number, string> = {
          0: 'ndc', 1: 'name', 2: 'genericName', 3: 'manufacturer',
          4: 'manufacturerId', 5: 'vendorId', 6: 'category', 7: 'description',
          8: 'dosageForm', 9: 'strength', 10: 'unitOfMeasure', 11: 'sellingUnit',
          12: 'itemsPerUnit', 13: 'requiresPrescription',
          14: 'status', 15: 'sellingPrice', 16: 'costPrice', 17: 'reorderPoint',
          18: 'reorderQty', 19: 'maxStock', 20: 'storageLocation', 21: 'batchNumber',
          22: 'expiryDate', 23: 'controlledSubstance', 24: 'deaSchedule',
        }
        const changedFieldNames = updateFields
          .filter((f) => f !== '"updatedAt" = ?')
          .map((f) => {
            const col = f.split(' = ')[0].replace(/"/g, '')
            return col
          })

        const previousValues: Record<string, unknown> = {}
        if (prevRow) {
          for (const fieldName of changedFieldNames) {
            const idx = prevResult.columns.indexOf(fieldName)
            if (idx >= 0) previousValues[fieldName] = prevRow[idx]
          }
        }
        const newValues: Record<string, unknown> = {}
        for (const fieldName of changedFieldNames) {
          if (body[fieldName] !== undefined) newValues[fieldName] = body[fieldName]
        }

        const userId = request.headers.get('x-user-id') || ''
        writeProductHistory({
          productId: id, action: 'UPDATED',
          changedFields: changedFieldNames,
          previousValues, newValues, userId,
        })
      }

      // Fetch the updated product with inventory
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
          ? {
              id: row.inv_id as string,
              productId: row.inv_productId as string,
              quantity: Number(row.inv_quantity),
              lastCounted: row.inv_lastCounted as string | null,
              createdAt: row.inv_createdAt as string,
              updatedAt: row.inv_updatedAt as string,
            }
          : null,
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

      const { userId: aUid1, ipAddress: aIp1, userAgent: aUa1 } = getRequestContext(request)
      writeAuditLog({ userId: aUid1, action: 'PRODUCT_UPDATED', category: 'product', entity: 'Product', entityId: id, ipAddress: aIp1, userAgent: aUa1 })
      return NextResponse.json(product)
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const existing = await db.product.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      const product = await db.product.update({
        where: { id },
        data: {
          ndc: body.ndc !== undefined ? body.ndc : undefined,
          barcode: body.barcode !== undefined ? body.barcode : undefined,
          name: body.name !== undefined ? body.name : undefined,
          genericName: body.genericName !== undefined ? body.genericName : undefined,
          manufacturer: body.manufacturer !== undefined ? body.manufacturer : undefined,
          manufacturerId: body.manufacturerId !== undefined ? body.manufacturerId : undefined,
          vendorId: body.vendorId !== undefined ? body.vendorId : undefined,
          category: body.category !== undefined ? body.category : undefined,
          description: body.description !== undefined ? body.description : undefined,
          dosageForm: body.dosageForm !== undefined ? body.dosageForm : undefined,
          strength: body.strength !== undefined ? body.strength : undefined,
          unitOfMeasure: body.unitOfMeasure !== undefined ? body.unitOfMeasure : undefined,
          sellingUnit: body.sellingUnit !== undefined ? body.sellingUnit : undefined,
          itemsPerUnit: body.itemsPerUnit !== undefined ? body.itemsPerUnit : undefined,
          requiresPrescription: body.requiresPrescription !== undefined ? body.requiresPrescription : undefined,
          status: body.status !== undefined ? body.status : undefined,
          sellingPrice: body.sellingPrice !== undefined ? body.sellingPrice : undefined,
          costPrice: body.costPrice !== undefined ? body.costPrice : undefined,
          reorderPoint: body.reorderPoint !== undefined ? body.reorderPoint : undefined,
          reorderQty: body.reorderQty !== undefined ? body.reorderQty : undefined,
          maxStock: body.maxStock !== undefined ? body.maxStock : undefined,
          storageLocation: body.storageLocation !== undefined ? body.storageLocation : undefined,
          batchNumber: body.batchNumber !== undefined ? body.batchNumber : undefined,
          expiryDate: body.expiryDate !== undefined ? body.expiryDate : undefined,
          controlledSubstance: body.controlledSubstance !== undefined ? body.controlledSubstance : undefined,
          deaSchedule: body.deaSchedule !== undefined ? body.deaSchedule : undefined,
        },
        include: { inventory: true },
      })

      const changedFieldNames = Object.keys(body)
      writeProductHistory({
        productId: id, action: 'UPDATED',
        changedFields: changedFieldNames,
        previousValues: Object.fromEntries(changedFieldNames.map((f) => [f, (existing as any)[f]])),
        newValues: body,
        userId: request.headers.get('x-user-id') || '',
      })

      const { userId: aUid2, ipAddress: aIp2, userAgent: aUa2 } = getRequestContext(request)
      writeAuditLog({ userId: aUid2, action: 'PRODUCT_UPDATED', category: 'product', entity: 'Product', entityId: id, ipAddress: aIp2, userAgent: aUa2 })
      return NextResponse.json(product)
    }
  } catch (error) {
    console.error('Error updating product:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to update product', detail: msg },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Soft delete (set status to DISCONTINUED)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params

    if (isTurso()) {
      // Raw SQL path
      // Check if product exists
      const existing = await turso.execute({
        sql: `SELECT id FROM "Product" WHERE id = ?`,
        args: [id],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      // Soft delete: set status to DISCONTINUED
      const now = new Date().toISOString()

      // Capture product name and current stock before deleting for history
      const preResult = await turso.execute({
        sql: `SELECT name FROM "Product" WHERE id = ?`,
        args: [id],
      })
      const productName = (preResult.rows[0]?.name as string) || ''

      // Zero out all Batch quantities for this product
      await turso.execute({
        sql: `UPDATE "Batch" SET quantity = 0, "updatedAt" = ? WHERE "productId" = ? AND quantity > 0`,
        args: [now, id],
      })

      // Zero out Inventory for this product
      const invCheck = await turso.execute({
        sql: `SELECT quantity FROM Inventory WHERE "productId" = ?`,
        args: [id],
      })
      const prevStock = invCheck.rows.length > 0 ? Number(invCheck.rows[0][0]) : 0

      if (invCheck.rows.length > 0) {
        await turso.execute({
          sql: `UPDATE Inventory SET quantity = 0, "lastCounted" = ?, "updatedAt" = ? WHERE "productId" = ?`,
          args: [now, now, id],
        })
      }

      // Soft delete: set status to DISCONTINUED
      await turso.execute({
        sql: `UPDATE "Product" SET status = 'DISCONTINUED', "updatedAt" = ? WHERE id = ?`,
        args: [now, id],
      })

      // Clear product-level expiry date (batches are zeroed)
      await turso.execute({
        sql: `UPDATE "Product" SET "expiryDate" = NULL WHERE id = ?`,
        args: [id],
      })

      // Record deletion in product history (fire-and-forget)
      writeProductHistory({
        productId: id, action: 'DELETED',
        previousValues: { name: productName, status: 'ACTIVE', stock: prevStock },
        newValues: { name: productName, status: 'DISCONTINUED', stock: 0 },
        userId: request.headers.get('x-user-id') || '',
      })

      // Fetch the updated product
      const result = await turso.execute({
        sql: `SELECT * FROM "Product" WHERE id = ?`,
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
      }

      const { userId: aUid3, ipAddress: aIp3, userAgent: aUa3 } = getRequestContext(request)
      writeAuditLog({ userId: aUid3, action: 'PRODUCT_DELETED', category: 'product', entity: 'Product', entityId: id, ipAddress: aIp3, userAgent: aUa3 })
      return NextResponse.json({ message: `Product discontinued. Inventory and batches zeroed (${prevStock} units adjusted).`, product })
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const existing = await db.product.findUnique({
        where: { id },
        include: { inventory: true },
      })
      if (!existing) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }

      const prevStock = existing.inventory?.quantity || 0

      // Zero out inventory
      if (existing.inventory) {
        await db.inventory.update({
          where: { productId: id },
          data: { quantity: 0 },
        })
      }

      const product = await db.product.update({
        where: { id },
        data: { status: 'DISCONTINUED', expiryDate: null },
      })

      writeProductHistory({
        productId: id, action: 'DELETED',
        previousValues: { name: existing.name, status: existing.status, stock: prevStock },
        newValues: { name: product.name, status: 'DISCONTINUED', stock: 0 },
        userId: request.headers.get('x-user-id') || '',
      })

      const { userId: aUid4, ipAddress: aIp4, userAgent: aUa4 } = getRequestContext(request)
      writeAuditLog({ userId: aUid4, action: 'PRODUCT_DELETED', category: 'product', entity: 'Product', entityId: id, ipAddress: aIp4, userAgent: aUa4 })
      return NextResponse.json({ message: `Product discontinued. Inventory zeroed (${prevStock} units adjusted).`, product })
    }
  } catch (error) {
    console.error('Error deleting product:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to delete product', detail: msg },
      { status: 500 }
    )
  }
}
