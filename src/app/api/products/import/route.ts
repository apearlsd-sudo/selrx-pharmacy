import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateBatchNo } from '@/lib/turso'
import * as XLSX from 'xlsx'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// ── Excel column mapping (header name → field name) ──────────────────────
const COLUMN_MAP: Record<string, string> = {
  // Primary columns (template order)
  'drug name': 'name',
  'name': 'name',
  'product name': 'name',
  'sku': 'ndc',
  'ndc': 'ndc',
  'national drug code': 'ndc',
  'category': 'category',
  'manufacturer': 'manufacturer',
  'vendor': 'vendorName',
  'dosage form': 'dosageForm',
  'dosageform': 'dosageForm',
  'stock qty': 'quantity',
  'stock quantity': 'quantity',
  'quantity': 'quantity',
  'initial qty': 'quantity',
  'initial quantity': 'quantity',
  'status': 'status',
  'reorder level': 'reorderPoint',
  'reorder point': 'reorderPoint',
  'min stock': 'reorderPoint',
  'cost': 'costPrice',
  'cost price': 'costPrice',
  'wholesale price': 'costPrice',
  'retail': 'sellingPrice',
  'retail price': 'sellingPrice',
  'selling price': 'sellingPrice',
  'price': 'sellingPrice',
  'expiry': 'expiryDate',
  'expiry date': 'expiryDate',
  'expiration date': 'expiryDate',
  // Legacy / extra columns (still accepted but not in template)
  'generic name': 'genericName',
  'generic': 'genericName',
  'strength': 'strength',
  'unit of measure': 'unitOfMeasure',
  'uom': 'unitOfMeasure',
  'unit': 'unitOfMeasure',
  'reorder qty': 'reorderQty',
  'reorder quantity': 'reorderQty',
  'max stock': 'maxStock',
  'batch number': 'batchNumber',
  'batch': 'batchNumber',
  'storage location': 'storageLocation',
  'location': 'storageLocation',
  'description': 'description',
  'requires prescription': 'requiresPrescription',
  'rx required': 'requiresPrescription',
  'controlled substance': 'controlledSubstance',
  'dea schedule': 'deaSchedule',
}

// ── Fields that should NOT become empty strings ─────────────────────────────
const KEEP_NULL_IF_EMPTY = new Set([
  'ndc', 'genericName', 'description', 'dosageForm', 'strength',
  'batchNumber', 'expiryDate', 'manufacturer', 'vendorName',
  'storageLocation', 'deaSchedule',
])

// ── Boolean fields ──────────────────────────────────────────────────────────
const BOOL_FIELDS = new Set(['requiresPrescription', 'controlledSubstance'])

// ── Numeric fields ──────────────────────────────────────────────────────────
const NUMERIC_FIELDS = new Set([
  'sellingPrice', 'costPrice', 'reorderPoint', 'reorderQty',
  'maxStock', 'quantity',
])

function parseBoolean(val: string): boolean {
  const v = val.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'y'
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => h.trim().toLowerCase().replace(/\s*\*\s*$/, ''))
}

/**
 * Parse a date string in the user's preferred format to YYYY-MM-DD.
 * Supported formats: dd/mm/yyyy, mm/dd/yyyy, yyyy-mm-dd, dd Mon yyyy, Mon dd, yyyy
 */
function parseDateString(raw: string, dateFormat: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // Try to let the JS engine parse it first (handles Excel date-like strings)
  const fallback = new Date(s)

  switch (dateFormat) {
    case 'dd/mm/yyyy': {
      // e.g. 31/12/2026
      const m = s.match(/^(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{4})$/)
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      break
    }
    case 'mm/dd/yyyy': {
      // e.g. 12/31/2026
      const m = s.match(/^(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{4})$/)
      if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
      break
    }
    case 'yyyy-mm-dd': {
      // e.g. 2026-12-31
      const m = s.match(/^(\d{4})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{1,2})$/)
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      break
    }
    case 'dd Mon yyyy': {
      // e.g. 31 Dec 2026
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${dy}`
      }
      break
    }
    case 'Mon dd, yyyy': {
      // e.g. Dec 31, 2026
      const d = new Date(s)
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${dy}`
      }
      break
    }
  }

  // Fallback: if JS Date parsed it, use that
  if (!isNaN(fallback.getTime())) {
    const y = fallback.getFullYear()
    const mo = String(fallback.getMonth() + 1).padStart(2, '0')
    const dy = String(fallback.getDate()).padStart(2, '0')
    return `${y}-${mo}-${dy}`
  }

  return null
}

function mapRowToProduct(
  row: Record<string, unknown>,
  normalizedHeaders: string[],
  rawHeaders: string[],
  dateFormat: string
): Record<string, unknown> {
  const product: Record<string, unknown> = {}
  let initialQty: number | undefined

  for (let i = 0; i < normalizedHeaders.length; i++) {
    const header = normalizedHeaders[i]
    const rawVal = row[rawHeaders[i]]
    if (rawVal === undefined || rawVal === null) continue

    const fieldName = COLUMN_MAP[header]
    if (!fieldName) continue

    // Handle date values (from Excel cellDates or string dates)
    if (fieldName === 'expiryDate') {
      if (rawVal instanceof Date) {
        const y = rawVal.getFullYear()
        const m = String(rawVal.getMonth() + 1).padStart(2, '0')
        const d = String(rawVal.getDate()).padStart(2, '0')
        product[fieldName] = `${y}-${m}-${d}`
      } else {
        const parsed = parseDateString(String(rawVal), dateFormat)
        if (parsed) {
          product[fieldName] = parsed
        }
      }
      continue
    }

    const strVal = String(rawVal).trim()
    if (strVal === '') continue

    if (fieldName === 'quantity') {
      initialQty = Number(strVal) || 0
      continue
    }

    if (BOOL_FIELDS.has(fieldName)) {
      product[fieldName] = parseBoolean(strVal)
    } else if (NUMERIC_FIELDS.has(fieldName)) {
      product[fieldName] = Number(strVal) || 0
    } else {
      product[fieldName] = strVal
    }
  }

  return { ...product, initialQty }
}

// POST /api/products/import — Bulk import products from Excel/CSV
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'No file uploaded. Please send a multipart form with a "file" field.' }, { status: 400 })
    }
    const file = formData.get('file') as File | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ]
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx?|csv)$/i)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload .xlsx, .xls, or .csv' },
        { status: 400 }
      )
    }

    // Read user's date format preference
    const dateFormat = request.headers.get('x-date-format') || 'dd/mm/yyyy'

    // Parse the file
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'Empty workbook — no sheets found' }, { status: 400 })
    }
    const sheet = workbook.Sheets[sheetName]
    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    // Filter out completely blank rows (all values empty)
    const rows = allRows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '')
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in the file' }, { status: 400 })
    }

    const rawHeaders = Object.keys(rows[0])
    const normalizedHeaders = normalizeHeaders(rawHeaders)

    // Check that at least 'name' column is present
    const hasName = normalizedHeaders.some((h) => COLUMN_MAP[h] === 'name')
    if (!hasName) {
      return NextResponse.json(
        {
          error: 'Missing required column "Drug Name". Please use the template or ensure your file has a "Drug Name" column.',
          requiredColumns: ['Drug Name (required)', 'SKU', 'Category', 'Manufacturer', 'Vendor', 'Dosage Form', 'Stock Qty', 'Status', 'Reorder Level', 'Cost', 'Retail', 'Expiry'],
        },
        { status: 400 }
      )
    }

    // Validate and prepare all rows
    const results: {
      row: number
      product: Record<string, unknown>
      initialQty: number
      errors: string[]
    }[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const mapped = mapRowToProduct(row, normalizedHeaders, rawHeaders, dateFormat)
      const errors: string[] = []

      if (!mapped.name || String(mapped.name).trim() === '') {
        errors.push('Drug Name is required')
      }

      const validStatuses = ['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'RECALLED']
      if (mapped.status && !validStatuses.includes(String(mapped.status).toUpperCase())) {
        errors.push(`Invalid status "${mapped.status}". Must be one of: ${validStatuses.join(', ')}`)
        delete mapped.status
      } else if (mapped.status) {
        mapped.status = String(mapped.status).toUpperCase()
      }

      results.push({
        row: i + 2,
        product: mapped,
        initialQty: mapped.initialQty as number || 0,
        errors,
      })
    }

    const validRows = results.filter((r) => r.errors.length === 0)
    const invalidRows = results.filter((r) => r.errors.length > 0)

    if (validRows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid rows to import',
        totalRows: rows.length,
        validRows: 0,
        invalidRows: invalidRows.length,
        validationErrors: invalidRows.map((r) => ({ row: r.row, errors: r.errors })),
      })
    }

    // ── Turso raw SQL path ──
    if (isTurso()) {
      const result = await importViaTurso(validRows, invalidRows, rows.length)
      const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: auditUserId, action: 'PRODUCTS_IMPORTED', category: 'product', entity: 'Product', details: { totalRows, created: result.created, failed: result.failed }, ipAddress, userAgent })
      return result
    }

    // ── Prisma fallback (local dev only) ──
    const result = await importViaPrisma(validRows, invalidRows, rows.length)
    const { userId: auditUserId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId: auditUserId, action: 'PRODUCTS_IMPORTED', category: 'product', entity: 'Product', details: { totalRows, created: result.created, failed: result.failed }, ipAddress, userAgent })
    return result
  } catch (error) {
    console.error('[Product Import] Error:', error)
    return NextResponse.json(
      { error: 'Failed to import products', details: String(error) },
      { status: 500 }
    )
  }
}

// ── Turso raw SQL import ──
async function importViaTurso(
  validRows: { row: number; product: Record<string, unknown>; initialQty: number }[],
  invalidRows: { row: number; product: Record<string, unknown>; initialQty: number; errors: string[] }[],
  totalRows: number,
) {
  // Resolve vendor/manufacturer names to IDs
  const vendorNames = [...new Set(validRows.map((r) => r.product.vendorName).filter(Boolean).map(String))]
  const manufacturerNames = [...new Set(validRows.map((r) => r.product.manufacturer).filter(Boolean).map(String))]

  // Fetch existing vendors
  const vendorMap = new Map<string, string>()
  if (vendorNames.length > 0) {
    const placeholders = vendorNames.map(() => '?').join(', ')
    const vendorResult = await turso.execute({
      sql: `SELECT id, name FROM Vendor WHERE LOWER(name) IN (${placeholders})`,
      args: vendorNames.map((n) => n.toLowerCase()),
    })
    for (const row of vendorResult.rows) {
      vendorMap.set(String(row.name).toLowerCase(), row.id as string)
    }
  }

  // Fetch existing manufacturers
  const mfrMap = new Map<string, string>()
  if (manufacturerNames.length > 0) {
    const placeholders = manufacturerNames.map(() => '?').join(', ')
    const mfrResult = await turso.execute({
      sql: `SELECT id, name FROM Manufacturer WHERE LOWER(name) IN (${placeholders})`,
      args: manufacturerNames.map((n) => n.toLowerCase()),
    })
    for (const row of mfrResult.rows) {
      mfrMap.set(String(row.name).toLowerCase(), row.id as string)
    }
  }

  // Auto-create vendors that don't exist
  for (const name of vendorNames) {
    if (!vendorMap.has(name.toLowerCase())) {
      const id = generateId()
      await turso.execute({
        sql: `INSERT INTO Vendor (id, name, "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
        args: [id, name, new Date().toISOString(), new Date().toISOString()],
      })
      vendorMap.set(name.toLowerCase(), id)
    }
  }

  // Auto-create manufacturers that don't exist
  for (const name of manufacturerNames) {
    if (!mfrMap.has(name.toLowerCase())) {
      const id = generateId()
      await turso.execute({
        sql: `INSERT INTO Manufacturer (id, name, "createdAt", "updatedAt") VALUES (?, ?, ?, ?)`,
        args: [id, name, new Date().toISOString(), new Date().toISOString()],
      })
      mfrMap.set(name.toLowerCase(), id)
    }
  }

  // Create products and inventory records
  let created = 0
  let failed = 0
  const createdProducts: { id: string; name: string; ndc: string | null }[] = []

  for (const row of validRows) {
    const p = row.product
    const vendorName = p.vendorName ? String(p.vendorName) : null
    const mfrName = p.manufacturer ? String(p.manufacturer) : null
    const vendorId = vendorName ? vendorMap.get(vendorName.toLowerCase()) || null : null
    const manufacturerId = mfrName ? mfrMap.get(mfrName.toLowerCase()) || null : null
    const now = new Date().toISOString()

    try {
      const productId = generateId()

      await turso.execute({
        sql: `
          INSERT INTO "Product" (
            id, ndc, name, "genericName", manufacturer, "manufacturerId", "vendorId",
            category, description, "dosageForm", strength, "unitOfMeasure",
            "requiresPrescription", status, "sellingPrice", "costPrice",
            "reorderPoint", "reorderQty", "maxStock", "storageLocation",
            "batchNumber", "expiryDate", "controlledSubstance", "deaSchedule",
            "createdAt", "updatedAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          productId,
          p.ndc || null,
          p.name,
          p.genericName || null,
          p.manufacturer || null,
          manufacturerId,
          vendorId,
          p.category || 'OTC',
          p.description || null,
          p.dosageForm || null,
          p.strength || null,
          p.unitOfMeasure || 'EA',
          p.requiresPrescription ? 1 : 0,
          p.status || 'ACTIVE',
          p.sellingPrice,
          p.costPrice != null ? p.costPrice : null,
          p.reorderPoint || 10,
          p.reorderQty || 50,
          p.maxStock != null ? p.maxStock : null,
          p.storageLocation || null,
          p.batchNumber || null,
          p.expiryDate || null,
          p.controlledSubstance ? 1 : 0,
          p.deaSchedule || null,
          now,
          now,
        ],
      })

      // Create inventory record
      const inventoryId = generateId()
      await turso.execute({
        sql: `INSERT INTO "Inventory" (id, "productId", quantity, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)`,
        args: [inventoryId, productId, row.initialQty, now, now],
      })

      // Create a Batch record if product has stock and/or expiry date
      // This enables FEFO (First Expired, First Out) tracking per lot
      if (row.initialQty > 0 || p.expiryDate) {
        const batchId = generateId()
        const importBN = p.batchNumber || generateBatchNo()
        await turso.execute({
          sql: `INSERT INTO "Batch" (id, "productId", "batchNumber", "expiryDate", quantity, "costPrice", "receivedAt", "receivedBy", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            batchId,
            productId,
            importBN,
            p.expiryDate || null,
            row.initialQty || 0,
            p.costPrice != null ? Number(p.costPrice) : null,
            now,
            request.headers.get('x-user-id') || '',
            now,
            now,
          ],
        })
      }

      createdProducts.push({ id: productId, name: p.name as string, ndc: p.ndc as string | null })
      created++
    } catch (err: unknown) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        invalidRows.push({
          row: row.row, product: row.product, initialQty: row.initialQty,
          errors: [`Duplicate NDC: "${p.ndc || p.name}" already exists`],
        })
      } else {
        invalidRows.push({
          row: row.row, product: row.product, initialQty: row.initialQty,
          errors: [msg],
        })
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Successfully imported ${created} product(s)`,
    totalRows,
    created,
    failed,
    skipped: invalidRows.length - failed,
    validationErrors: invalidRows.map((r) => ({ row: r.row, name: r.product.name || 'Unknown', errors: r.errors })),
    createdProducts,
  })
}

// ── Prisma fallback import (local dev only) ──
async function importViaPrisma(
  validRows: { row: number; product: Record<string, unknown>; initialQty: number }[],
  invalidRows: { row: number; product: Record<string, unknown>; initialQty: number; errors: string[] }[],
  totalRows: number,
) {
  const { db } = await import('@/lib/db')

  // Resolve vendor/manufacturer names to IDs
  const vendorNames = [...new Set(validRows.map((r) => r.product.vendorName).filter(Boolean).map(String))]
  const manufacturerNames = [...new Set(validRows.map((r) => r.product.manufacturer).filter(Boolean).map(String))]

  const [existingVendors, existingMfrs] = await Promise.all([
    vendorNames.length > 0
      ? db.vendor.findMany({ where: { name: { in: vendorNames } }, select: { id: true, name: true } })
      : [],
    manufacturerNames.length > 0
      ? db.manufacturer.findMany({ where: { name: { in: manufacturerNames } }, select: { id: true, name: true } })
      : [],
  ])

  const vendorMap = new Map(existingVendors.map((v) => [v.name.toLowerCase(), v.id]))
  const mfrMap = new Map(existingMfrs.map((m) => [m.name.toLowerCase(), m.id]))

  for (const name of vendorNames) {
    if (!vendorMap.has(name.toLowerCase())) {
      const created = await db.vendor.create({ data: { name } })
      vendorMap.set(name.toLowerCase(), created.id)
    }
  }
  for (const name of manufacturerNames) {
    if (!mfrMap.has(name.toLowerCase())) {
      const created = await db.manufacturer.create({ data: { name } })
      mfrMap.set(name.toLowerCase(), created.id)
    }
  }

  let created = 0
  let failed = 0
  const createdProducts: { id: string; name: string; ndc: string | null }[] = []

  for (const row of validRows) {
    const p = row.product
    const vendorName = p.vendorName ? String(p.vendorName) : null
    const mfrName = p.manufacturer ? String(p.manufacturer) : null
    const vendorId = vendorName ? vendorMap.get(vendorName.toLowerCase()) || null : null
    const manufacturerId = mfrName ? mfrMap.get(mfrName.toLowerCase()) || null : null

    const { vendorName: _, quantity: __, initialQty: ___, ...createData } = p
    void _; void __; void ___

    try {
      const product = await db.product.create({
        data: {
          ...(createData as Record<string, unknown>),
          vendorId,
          manufacturerId,
        },
      })

      await db.inventory.create({
        data: { productId: product.id, quantity: row.initialQty },
      })

      createdProducts.push({ id: product.id, name: product.name, ndc: product.ndc })
      created++
    } catch (err: any) {
      failed++
      if (err?.message?.includes('Unique') || err?.code === 'P2002') {
        invalidRows.push({ row: row.row, product: row.product, initialQty: row.initialQty, errors: [`Duplicate NDC: "${p.ndc || p.name}" already exists`] })
      } else {
        invalidRows.push({ row: row.row, product: row.product, initialQty: row.initialQty, errors: [String(err?.message || 'Unknown error')] })
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `Successfully imported ${created} product(s)`,
    totalRows,
    created,
    failed,
    skipped: invalidRows.length - failed,
    validationErrors: invalidRows.map((r) => ({ row: r.row, name: r.product.name || 'Unknown', errors: r.errors })),
    createdProducts,
  })
}

// GET /api/products/import — Generate and return a downloadable Excel template
export async function GET(request: NextRequest) {
  try {
    const dateFormat = request.nextUrl.searchParams.get('dateFormat') || 'dd/mm/yyyy'

    function fmtDate(isoStr: string): string {
      const d = new Date(isoStr + 'T00:00:00')
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      switch (dateFormat) {
        case 'mm/dd/yyyy': return `${m}/${day}/${y}`
        case 'yyyy-mm-dd': return `${y}-${m}-${day}`
        case 'dd Mon yyyy': return `${day} ${monthNames[d.getMonth()]} ${y}`
        case 'Mon dd, yyyy': return `${monthNames[d.getMonth()]} ${d.getDate()}, ${y}`
        case 'dd/mm/yyyy':
        default: return `${day}/${m}/${y}`
      }
    }

    const headers = [
      'Drug Name', 'SKU', 'Category', 'Manufacturer', 'Vendor',
      'Dosage Form', 'Batch Number', 'Stock Qty', 'Status', 'Reorder Level',
      'Cost', 'Retail', 'Expiry', 'Actions',
    ]

    const exampleRows = [
      {
        'Drug Name': 'Amoxicillin 500mg Capsules', SKU: '12345-6789-01',
        Category: 'PRESCRIPTION', Manufacturer: 'PharmaCorp Inc.',
        Vendor: 'MedSupply Distributors', 'Dosage Form': 'CAPSULE',
        'Batch Number': 'BN-01012026-0001',
        'Stock Qty': 150, Status: 'ACTIVE', 'Reorder Level': 20,
        Cost: 8.50, Retail: 12.99, Expiry: fmtDate('2026-12-31'), Actions: '',
      },
      {
        'Drug Name': 'Ibuprofen 200mg Tablets', SKU: '23456-7890-02',
        Category: 'OTC', Manufacturer: 'GenericLab Ltd.',
        Vendor: 'MedSupply Distributors', 'Dosage Form': 'TABLET',
        'Batch Number': 'BN-15032026-0002',
        'Stock Qty': 300, Status: 'ACTIVE', 'Reorder Level': 50,
        Cost: 2.50, Retail: 5.99, Expiry: fmtDate('2027-06-30'), Actions: '',
      },
      {
        'Drug Name': 'Metformin 500mg Tablets', SKU: '34567-8901-03',
        Category: 'PRESCRIPTION', Manufacturer: '',
        Vendor: '', 'Dosage Form': 'TABLET',
        'Batch Number': '',
        'Stock Qty': 0, Status: 'ACTIVE', 'Reorder Level': 30,
        Cost: 4.25, Retail: 9.50, Expiry: '', Actions: '',
      },
    ]

    const worksheet = XLSX.utils.json_to_sheet(exampleRows, { header: headers })
    worksheet['!cols'] = [
      { wch: 35 }, { wch: 18 }, { wch: 15 }, { wch: 22 },
      { wch: 24 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 12 },
    ]

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products')

    // Categories reference sheet
    const catHeaders = ['Category', 'Description']
    const catData = [
      { Category: 'OTC', Description: 'Over-the-counter medications' },
      { Category: 'PRESCRIPTION', Description: 'Prescription-only medications' },
      { Category: 'SUPPLEMENT', Description: 'Dietary supplements and vitamins' },
      { Category: 'MEDICAL_DEVICE', Description: 'Medical devices and equipment' },
      { Category: 'PERSONAL_CARE', Description: 'Personal care products' },
      { Category: 'CONSUMABLES', Description: 'Consumable medical supplies' },
    ]
    const catSheet = XLSX.utils.json_to_sheet(catData, { header: catHeaders })
    catSheet['!cols'] = [{ wch: 20 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(workbook, catSheet, 'Categories Reference')

    // Dosage Forms reference sheet
    const dfHeaders = ['Dosage Form', 'Description']
    const dfData = [
      { 'Dosage Form': 'TABLET', Description: 'Solid oral dosage form' },
      { 'Dosage Form': 'CAPSULE', Description: 'Gelatin capsule' },
      { 'Dosage Form': 'SYRUP', Description: 'Liquid oral solution' },
      { 'Dosage Form': 'SUSPENSION', Description: 'Liquid suspension' },
      { 'Dosage Form': 'CREAM', Description: 'Topical cream' },
      { 'Dosage Form': 'OINTMENT', Description: 'Topical ointment' },
      { 'Dosage Form': 'GEL', Description: 'Topical gel' },
      { 'Dosage Form': 'DROPS', Description: 'Eye/ear drops' },
      { 'Dosage Form': 'INJECTION', Description: 'Injectable solution' },
      { 'Dosage Form': 'INHALER', Description: 'Respiratory inhaler' },
      { 'Dosage Form': 'SPRAY', Description: 'Nasal/spray form' },
      { 'Dosage Form': 'PATCH', Description: 'Transdermal patch' },
      { 'Dosage Form': 'POWDER', Description: 'Powder form' },
      { 'Dosage Form': 'LOZENGE', Description: 'Lozenge/troche' },
      { 'Dosage Form': 'SUPPOSITORY', Description: 'Rectal/vaginal suppository' },
    ]
    const dfSheet = XLSX.utils.json_to_sheet(dfData, { header: dfHeaders })
    dfSheet['!cols'] = [{ wch: 16 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(workbook, dfSheet, 'Dosage Forms Reference')

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="product-import-template.xlsx"',
      },
    })
  } catch (error) {
    console.error('[Import Template] Error:', error)
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 })
  }
}
