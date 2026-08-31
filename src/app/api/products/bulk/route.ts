import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/products/bulk
 *
 * Bulk-create products (with their initial inventory rows) from a parsed
 * Excel/CSV file. The client does the parsing with SheetJS and sends a
 * JSON array — this endpoint just does the DB work in a transaction so
 * either everything commits or nothing does.
 *
 * Role gating: PHARMACIST, SUPER_ADMIN — same as the single POST.
 *
 * Request body:
 *   { products: Array<{ name, ndc?, genericName?, manufacturer?, vendorId?,
 *                      category?, dosageForm?, strength?, unitOfMeasure?,
 *                      requiresPrescription?, status?, sellingPrice, costPrice?,
 *                      reorderPoint?, reorderQty?, maxStock?, storageLocation?,
 *                      batchNumber?, expiryDate?, controlledSubstance?,
 *                      deaSchedule?, initialStock? }> }
 *
 * Response:
 *   200 — { created: N, skipped: M, errors: [{ row, name, error }] }
 *
 * NDC uniqueness is enforced by the DB schema (`Product.ndc @unique`). When
 * a row's NDC already exists, we skip it and report the row index + reason
 * in `errors` rather than failing the whole batch — this matches user
 * expectation when re-importing an updated sheet.
 */
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
    const rows: any[] = Array.isArray(body?.products) ? body.products : []

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No products provided' },
        { status: 400 }
      )
    }

    // Hard cap to keep the request bounded — anything larger should be
    // split into multiple imports. 500 rows is plenty for a typical
    // pharmacy's first-load stock sheet.
    const MAX_ROWS = 500
    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS} per import. Please split the file and retry.` },
        { status: 400 }
      )
    }

    // Pre-resolve vendor IDs by name so we don't hammer the DB inside
    // the loop. Excel sheets typically carry the vendor NAME (human-
    // readable), not the cuid. If the name doesn't match a known vendor,
    // we leave vendorId null and continue.
    const vendorNamesInRows = Array.from(
      new Set(
        rows
          .map((r) => (typeof r.vendorName === 'string' ? r.vendorName.trim() : ''))
          .filter(Boolean)
      )
    )
    const vendorByName = new Map<string, string>()
    if (vendorNamesInRows.length > 0) {
      const vendors = await db.vendor.findMany({
        where: { name: { in: vendorNamesInRows } },
        select: { id: true, name: true },
      })
      for (const v of vendors) vendorByName.set(v.name, v.id)
    }

    let created = 0
    let skipped = 0
    const errors: Array<{ row: number; name: string; error: string }> = []

    // Wrap the entire batch in a transaction. If an unexpected error
    // escapes (e.g., DB connection lost), nothing gets committed —
    // partial imports would be worse than a clean failure.
    await db.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowIndex = i + 2 // +2 because row 1 is the Excel header
        const name = (row.name || '').toString().trim()
        if (!name) {
          errors.push({ row: rowIndex, name: '', error: 'Missing product name' })
          skipped++
          continue
        }

        const sellingPrice = parseFloat(row.sellingPrice)
        if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push({ row: rowIndex, name, error: 'Invalid or missing selling price' })
          skipped++
          continue
        }

        const costPrice = row.costPrice === '' || row.costPrice == null
          ? null
          : parseFloat(row.costPrice)
        if (costPrice !== null && (Number.isNaN(costPrice) || costPrice < 0)) {
          errors.push({ row: rowIndex, name, error: 'Invalid cost price' })
          skipped++
          continue
        }

        // Vendor resolution: prefer explicit vendorId, else look up by name.
        let vendorId: string | null = null
        if (row.vendorId && typeof row.vendorId === 'string') {
          vendorId = row.vendorId
        } else if (row.vendorName && vendorByName.has(row.vendorName.trim())) {
          vendorId = vendorByName.get(row.vendorName.trim())!
        }

        // Initial stock — defaults to 0 if omitted/invalid.
        const initialStock = parseInt(row.initialStock || row.stockQuantity || '0') || 0

        try {
          const product = await tx.product.create({
            data: {
              name,
              ndc: row.ndc ? row.ndc.toString().trim() : null,
              genericName: row.genericName?.toString().trim() || null,
              manufacturer: row.manufacturer?.toString().trim() || null,
              vendorId,
              category: row.category?.toString().trim() || 'OTC',
              description: row.description?.toString().trim() || null,
              dosageForm: row.dosageForm?.toString().trim() || null,
              strength: row.strength?.toString().trim() || null,
              unitOfMeasure: row.unitOfMeasure?.toString().trim() || 'EA',
              requiresPrescription: String(row.requiresPrescription).toLowerCase() === 'true'
                || row.requiresPrescription === true
                || row.requiresPrescription === 1
                || row.requiresPrescription === '1',
              status: 'ACTIVE',
              sellingPrice,
              costPrice,
              reorderPoint: parseInt(row.reorderPoint || row.minStockLevel || '10') || 10,
              reorderQty: parseInt(row.reorderQty || '50') || 50,
              maxStock: row.maxStock ? parseInt(row.maxStock) : null,
              storageLocation: row.storageLocation?.toString().trim() || null,
              batchNumber: row.batchNumber?.toString().trim() || null,
              expiryDate: row.expiryDate ? row.expiryDate.toString().trim() : null,
              controlledSubstance: String(row.controlledSubstance).toLowerCase() === 'true'
                || row.controlledSubstance === true
                || row.controlledSubstance === 1
                || row.controlledSubstance === '1',
              deaSchedule: row.deaSchedule?.toString().trim() || null,
            },
          })

          await tx.inventory.create({
            data: {
              productId: product.id,
              quantity: initialStock,
              lastCounted: initialStock > 0 ? new Date() : null,
            },
          })

          created++
        } catch (err: any) {
          // Prisma unique-constraint violation code is P2002.
          if (err?.code === 'P2002') {
            errors.push({
              row: rowIndex,
              name,
              error: `Duplicate NDC/SKU: ${row.ndc} already exists`,
            })
          } else {
            errors.push({
              row: rowIndex,
              name,
              error: err?.message || 'Failed to create product',
            })
          }
          skipped++
        }
      }
    })

    return NextResponse.json({ created, skipped, errors })
  } catch (error: any) {
    console.error('Error in bulk product import:', error)
    return NextResponse.json(
      { error: error?.message || 'Bulk import failed' },
      { status: 500 }
    )
  }
}
