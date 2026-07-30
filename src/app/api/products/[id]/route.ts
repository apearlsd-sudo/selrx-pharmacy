import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

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
            p.id, p.ndc, p.name, p."genericName", p.manufacturer, p."manufacturerId", p."vendorId",
            p.category, p.description, p."dosageForm", p.strength, p."unitOfMeasure",
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

      if (updateFields.length > 0) {
        updateFields.push(`"updatedAt" = ?`)
        updateArgs.push(new Date().toISOString())

        const sql = `UPDATE "Product" SET ${updateFields.join(', ')} WHERE id = ?`
        updateArgs.push(id)

        await turso.execute({ sql, args: updateArgs })
      }

      // Fetch the updated product with inventory
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
      await turso.execute({
        sql: `UPDATE "Product" SET status = 'DISCONTINUED', "updatedAt" = ? WHERE id = ?`,
        args: [now, id],
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

      return NextResponse.json({ message: 'Product discontinued successfully', product })
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
        data: { status: 'DISCONTINUED' },
      })

      return NextResponse.json({ message: 'Product discontinued successfully', product })
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
