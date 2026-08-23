/**
 * BACKUP & RESTORE API
 *
 * GET  /api/backup          — Export entire database as JSON
 * POST /api/backup          — Import (restore) database from JSON
 *
 * Both routes require SUPER_ADMIN role (checked via x-user-role header).
 * Backup includes all business tables. Passwords are excluded for security.
 * Restore uses UPSERT logic: existing rows are updated, new rows inserted.
 * IDs are preserved from the backup so references stay intact.
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoExecute, tursoBatch, generateId, sqlRaw } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'
import { aesEncrypt, aesDecrypt } from '@/lib/security'

// ── Table definitions (order matters for foreign-key constraints) ──

interface TableDef {
  name: string
  columns: string[]
  excludeCols?: string[]
  where?: string
}

/**
 * Ordered from least-referenced to most-referenced.
 * _CategoryToProduct is a join table created by Prisma.
 * Batch is created at runtime (not in schema.prisma but exists in Turso).
 */
const BACKUP_TABLES: TableDef[] = [
  { name: 'SystemRole',  columns: ['id','name','label','description','permissions','color','isSystem','isActive','createdAt','updatedAt'] },
  { name: 'Company',     columns: ['id','name','slug','logo','tagline','businessType','registrationNo','pharmacyLicense','taxId','phone','email','website','address','city','state','country','postalCode','currency','timezone','active','ownerName','ownerId','createdAt','updatedAt'] },
  { name: 'Manufacturer', columns: ['id','name','contactPerson','email','phone','address','city','country','website','notes','createdAt','updatedAt'] },
  { name: 'Vendor',      columns: ['id','name','contactPerson','email','phone','address','notes','createdAt','updatedAt'] },
  { name: 'Category',    columns: ['id','name','description','createdAt','updatedAt'] },
  { name: 'DosageForm', columns: ['id','name','isActive','createdAt','updatedAt'] },
  { name: 'Product',     columns: ['id','ndc','barcode','name','genericName','manufacturer','manufacturerId','vendorId','category','description','dosageForm','strength','unitOfMeasure','sellingUnit','itemsPerUnit','requiresPrescription','status','sellingPrice','wholesalePrice','costPrice','pricingTierId','reorderPoint','reorderQty','maxStock','storageLocation','batchNumber','expiryDate','controlledSubstance','deaSchedule','createdAt','updatedAt'] },
  { name: 'Inventory',   columns: ['id','productId','quantity','lastCounted','createdAt','updatedAt'] },
  { name: 'Batch',       columns: ['id','productId','batchNumber','expiryDate','quantity','costPrice','receivedAt','receivedBy','createdAt','updatedAt'] },
  { name: 'Customer',    columns: ['id','firstName','lastName','email','phone','dateOfBirth','gender','address','insuranceProvider','insurancePolicyNo','allergies','notes','loyaltyPoints','loyaltyTier','createdAt','updatedAt'] },
  { name: 'User',        columns: ['id','email','name','role','phone','licenseNumber','permissions','department','shift','hireDate','active','lastLogin','createdAt','updatedAt'] },
  { name: 'Prescription', columns: ['id','rxNumber','customerId','patientName','prescriberName','prescriberNPI','prescriberPhone','prescriberFax','productName','productNdc','dosage','quantity','refillsRemaining','refillsTotal','daysSupply','dispenseAsWritten','priority','status','notes','filledById','verifiedById','filledAt','expiresAt','createdAt','updatedAt'] },
  { name: 'Transaction', columns: ['id','transactionNo','customerId','userId','subtotal','tax','discount','total','paymentMethod','paymentAmount','changeAmount','status','prescriptionId','notes','createdAt','updatedAt'] },
  { name: 'TransactionItem', columns: ['id','transactionId','productId','productName','quantity','unitPrice','subtotal','requiresRx','dispensedQty','createdAt'] },
  { name: 'Return',      columns: ['id','returnNo','transactionId','transactionItemId','productId','productName','quantity','unitPrice','refundAmount','reason','reasonNote','customerId','customerName','userId','status','approvedById','approvedAt','refundMethod','refundProcessed','restocked','notes','createdAt','updatedAt'] },
  { name: 'HardwareLog', columns: ['id','transactionId','hardwareType','action','status','details','createdAt'] },
  { name: 'AuditLog',    columns: ['id','userId','action','category','entity','entityId','details','ipAddress','userAgent','createdAt'] },
  { name: 'ProductHistory', columns: ['id','productId','action','changedFields','previousValues','newValues','userId','createdAt'] },
  { name: 'StockTake',   columns: ['id','reference','status','notes','countedBy','startedAt','completedAt','createdAt','updatedAt'] },
  { name: 'StockTakeItem', columns: ['id','stockTakeId','productId','systemQty','countedQty','variance','notes','createdAt'] },
  { name: '_CategoryToProduct', columns: ['A','B'] },
  { name: 'PurchaseOrder', columns: ['id','vendorId','vendorName','status','notes','expectedDate','totalAmount','receivedAmount','createdBy','createdAt','updatedAt'] },
  { name: 'PurchaseOrderItem', columns: ['id','orderId','productId','productName','quantity','receivedQty','unitCost','createdAt'] },
  { name: 'PricingTier', columns: ['id','name','description','discountPercent','isDefault','isActive','createdAt','updatedAt'] },
  { name: 'CustomerCredit', columns: ['id','customerId','transactionId','amount','balance','description','createdBy','createdAt'] },
  { name: 'InsuranceClaim', columns: ['id','claimNo','prescriptionId','transactionId','customerId','insuranceProvider','policyNumber','totalAmount','approvedAmount','coPayAmount','status','submittedAt','approvedAt','paidAt','rejectionReason','notes','createdAt','updatedAt'] },
  { name: 'SupplierPriceList', columns: ['id','vendorId','vendorName','validFrom','validTo','notes','createdAt','updatedAt'] },
  { name: 'SupplierPriceListItem', columns: ['id','priceListId','productId','productName','unitCost','packSize','minOrderQty','createdAt'] },
  { name: 'LoyaltyTransaction', columns: ['id','customerId','transactionId','points','action','description','createdBy','createdAt'] },
  { name: 'UserTarget', columns: ['id','userId','period','targetType','targetValue','createdAt','updatedAt'] },
  { name: 'ApprovalLog', columns: ['id','action','entityType','entityId','requesterId','approverId','details','approved','createdAt'] },
  { name: 'Notification', columns: ['id','type','title','message','entityType','entityId','status','userId','createdAt','readAt'] },
]

// ── Helpers ──

function requireAdmin(request: NextRequest): NextResponse | null {
  const role = request.headers.get('x-user-role')
  if (role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only Super Admin can backup/restore data' }, { status: 403 })
  }
  return null
}

// ── GET: Export ──

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const tablesParam = searchParams.get('tables')
    const encryptBackup = searchParams.get('encrypt') === 'true'
    // Allow exporting specific tables: ?tables=Product,Inventory
    const requestedTables = tablesParam
      ? tablesParam.split(',').map(t => t.trim()).filter(Boolean)
      : null

    const backup: Record<string, unknown[]> = {}
    const meta = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      database: isTurso() ? 'turso' : 'prisma',
      tableCount: 0,
      totalRows: 0,
    }

    if (isTurso()) {
      const tables = BACKUP_TABLES.filter(t => !requestedTables || requestedTables.includes(t.name))

      for (const table of tables) {
        try {
          const whereClause = table.where || ''
          // Use SELECT * to avoid column-mismatch failures.
          // If the BACKUP_TABLES column list has a column that doesn't exist
          // in the actual Turso table, a named-column SELECT would fail
          // silently and the catch block would return [].
          const result = await turso.execute(
            `SELECT * FROM "${table.name}" ${whereClause}`
          )

          if (result.rows.length > 0) {
            // Get actual column names from result metadata
            const actualCols: string[] = result.columns
            // Convert libsql rows to plain objects, handling boolean conversion
            backup[table.name] = result.rows.map((row: any) => {
              const obj: Record<string, unknown> = {}
              for (const col of actualCols) {
                let val = row[col]
                // libsql returns 0/1 for booleans
                if (val === 0 || val === 1) {
                  const colLower = col.toLowerCase()
                  if (colLower.includes('active') || colLower.includes('require') ||
                      colLower.includes('controlled') || colLower.includes('dispense') ||
                      colLower === 'issystem' || colLower === 'restocked' ||
                      colLower === 'refundprocessed') {
                    val = val === 1
                  }
                }
                obj[col] = val
              }
              return obj
            })
            meta.totalRows += result.rows.length
          } else {
            backup[table.name] = []
          }
          meta.tableCount++
        } catch (err) {
          // Table might not exist (e.g. _CategoryToProduct, Batch on some deployments)
          console.warn(`[backup] Table "${table.name}" not found or error:`, err)
          backup[table.name] = []
          meta.tableCount++
        }
      }
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const tables = BACKUP_TABLES.filter(t => !requestedTables || requestedTables.includes(t.name))

      for (const table of tables) {
        try {
          // Prisma model names are PascalCase singular
          const modelName = table.name.replace(/^_/, '')
          const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof typeof db
          const model: any = db[modelKey]

          if (typeof model?.findMany === 'function') {
            const rows = await model.findMany()
            backup[table.name] = rows.map((row: any) => {
              const obj: Record<string, unknown> = {}
              // Capture all keys from the row, not just table.columns,
              // to avoid losing columns that exist in the model but
              // were omitted from the static column list.
              for (const col of Object.keys(row)) {
                if (col.startsWith('_')) continue // skip Prisma internal keys like _count
                obj[col] = row[col]
              }
              return obj
            })
            meta.totalRows += rows.length
          } else {
            backup[table.name] = []
          }
          meta.tableCount++
        } catch (err) {
          console.warn(`[backup] Prisma table "${table.name}" error:`, err)
          backup[table.name] = []
          meta.tableCount++
        }
      }
    }

    // ── Post-processing: synthesize _CategoryToProduct from Product.category + Category ──
    //
    // The app stores category as a TEXT field on Product (e.g. "OTC") but never writes
    // to the Prisma implicit junction table _CategoryToProduct (A=Category.id, B=Product.id).
    // If the junction table is empty but both Product and Category rows exist, build the
    // junction rows by matching Product.category → Category.name.
    const ctpRows = backup['_CategoryToProduct'] as Record<string, string>[] | undefined
    if ((!ctpRows || ctpRows.length === 0) &&
        backup['Product'] && backup['Product'].length > 0 &&
        backup['Category'] && backup['Category'].length > 0) {
      const products = backup['Product'] as Record<string, unknown>[]
      const categories = backup['Category'] as Record<string, unknown>[]
      // Build name→id lookup
      const catByName = new Map<string, string>()
      for (const cat of categories) {
        const name = cat.name as string
        const id = cat.id as string
        if (name && id) catByName.set(name, id)
      }
      // Match each product's category string to a Category id
      const synthesized: Record<string, string>[] = []
      for (const prod of products) {
        const catName = prod.category as string | undefined
        const prodId = prod.id as string
        if (catName && prodId) {
          const catId = catByName.get(catName)
          if (catId) {
            synthesized.push({ A: catId, B: prodId })
          }
        }
      }
      if (synthesized.length > 0) {
        backup['_CategoryToProduct'] = synthesized
        meta.totalRows += synthesized.length
        console.log(`[backup] Synthesized ${synthesized.length} _CategoryToProduct rows from Product.category + Category.name`)
      }
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'BACKUP_CREATED', category: 'backup', details: { tableCount: meta.tableCount, totalRows: meta.totalRows, encrypted: encryptBackup }, ipAddress, userAgent }).catch(() => {})

    const payload = { meta: { ...meta, encrypted: !!encryptBackup }, data: backup }
    const jsonStr = JSON.stringify(payload, null, 2)

    // If encryption requested, encrypt the JSON
    if (encryptBackup) {
      const encrypted = await aesEncrypt(jsonStr)
      return new NextResponse(encrypted, {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="selrx-backup-${new Date().toISOString().slice(0,10)}.json.enc"`,
          'X-Backup-Encrypted': 'true',
          'X-Backup-Version': meta.version,
        },
      })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[backup] Export failed:', error)
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 })
  }
}

// ── POST: Import / Restore ──

export async function POST(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied

  try {
    let rawBody: string | null = null
    let parsedBody: any = null

    // Try to read the raw body to detect encryption
    const rawText = await request.text()

    // Detect if encrypted: check if it looks like base64 but not valid JSON
    let isEncrypted = false
    const encryptedHeader = request.headers.get('X-Backup-Encrypted')
    if (encryptedHeader === 'true') {
      isEncrypted = true
    } else {
      // Heuristic: try parsing as JSON, if fails assume encrypted
      try {
        parsedBody = JSON.parse(rawText)
      } catch {
        // Not valid JSON — might be encrypted base64
        // Check if it's a valid base64 string
        const trimmed = rawText.trim()
        if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 20) {
          isEncrypted = true
        }
      }
    }

    if (isEncrypted && !parsedBody) {
      try {
        const decrypted = await aesDecrypt(rawText.trim())
        parsedBody = JSON.parse(decrypted)
        console.log('[backup] Detected and decrypted encrypted backup')
      } catch (decryptErr) {
        console.error('[backup] Failed to decrypt backup:', decryptErr)
        return NextResponse.json({ error: 'Failed to decrypt backup. Ensure AES_ENCRYPTION_KEY is set correctly.' }, { status: 400 })
      }
    }

    if (!parsedBody) {
      return NextResponse.json({ error: 'Invalid backup data' }, { status: 400 })
    }

    const { data, options } = parsedBody as {
      meta?: any
      data: Record<string, any[]>
      options?: {
        skipTables?: string[]
        mode?: 'upsert' | 'replace'
      }
    }

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'Invalid backup data: expected { data: { ... } }' }, { status: 400 })
    }

    const mode = options?.mode || 'upsert'
    const skipTables = new Set(options?.skipTables || [])
    const results: Record<string, { inserted: number; updated: number; skipped: number; errors: string[] }> = {}
    let totalInserted = 0
    let totalUpdated = 0
    let totalErrors = 0

    if (isTurso()) {
      // Process tables in dependency order
      const tables = BACKUP_TABLES.filter(t =>
        !skipTables.has(t.name) && data[t.name] && Array.isArray(data[t.name]) && data[t.name].length > 0
      )

      for (const table of tables) {
        const rows = data[table.name]
        const tableResult = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] }

        try {
          // Check if table exists
          try {
            await turso.execute(`SELECT 1 FROM "${table.name}" LIMIT 1`)
          } catch {
            console.warn(`[restore] Table "${table.name}" does not exist, skipping`)
            results[table.name] = { ...tableResult, skipped: rows.length }
            continue
          }

          // Probe actual columns in the target table via PRAGMA
          let targetCols: string[] = []
          try {
            const pragmaResult = await turso.execute(`PRAGMA table_info("${table.name}")`)
            targetCols = pragmaResult.rows
              .map((r: any) => r.name as string)
              .filter(Boolean)
          } catch {
            // Fallback to static definition if PRAGMA fails
            targetCols = [...table.columns]
          }

          // Use the intersection of backup row keys and target table columns.
          // This avoids INSERT failures when the backup has columns the target
          // table lacks, or vice versa.
          const backupKeys = new Set<string>()
          for (const row of rows) {
            if (row && typeof row === 'object') {
              for (const k of Object.keys(row)) backupKeys.add(k)
            }
          }
          // Prefer target columns that also exist in backup data
          const cols = targetCols.filter(c => backupKeys.has(c))
          // Also include backup keys that are in our known schema (for _CategoryToProduct etc.)
          const extraCols = table.columns.filter(c => backupKeys.has(c) && !cols.includes(c))
          const allCols = [...cols, ...extraCols]
          // Ensure 'id' is always included if present
          if (backupKeys.has('id') && !allCols.includes('id')) allCols.unshift('id')

          if (allCols.length === 0) {
            console.warn(`[restore] No matching columns for "${table.name}", skipping`)
            results[table.name] = { ...tableResult, skipped: rows.length }
            continue
          }

          const colList = allCols.map(c => `"${c}"`).join(', ')

          if (mode === 'replace') {
            // DELETE all existing rows, then INSERT
            await turso.execute(`DELETE FROM "${table.name}"`)

            if (rows.length > 0) {
              const stmts = rows.map((row: any) => {
                const vals = allCols.map(c => {
                  const val = row[c]
                  if (val === true) return '1'
                  if (val === false) return '0'
                  if (val === null || val === undefined) return 'NULL'
                  if (typeof val === 'number') return String(val)
                  return "'" + String(val).replace(/'/g, "''") + "'"
                })
                return {
                  sql: `INSERT INTO "${table.name}" (${colList}) VALUES (${vals.join(', ')})`,
                  args: [],
                }
              })

              // Batch in chunks of 100 to avoid size limits
              for (let i = 0; i < stmts.length; i += 100) {
                const chunk = stmts.slice(i, i + 100)
                await tursoBatch(chunk)
              }
              tableResult.inserted = rows.length
            }
          } else {
            // UPSERT mode: INSERT OR REPLACE
            if (rows.length > 0) {
              const stmts = rows.map((row: any) => {
                const vals = allCols.map(c => {
                  const val = row[c]
                  if (val === true) return '1'
                  if (val === false) return '0'
                  if (val === null || val === undefined) return 'NULL'
                  if (typeof val === 'number') return String(val)
                  return "'" + String(val).replace(/'/g, "''") + "'"
                })
                return {
                  sql: `INSERT OR REPLACE INTO "${table.name}" (${colList}) VALUES (${vals.join(', ')})`,
                  args: [],
                }
              })

              // Batch in chunks of 100
              for (let i = 0; i < stmts.length; i += 100) {
                const chunk = stmts.slice(i, i + 100)
                try {
                  await tursoBatch(chunk)
                  tableResult.inserted += Math.min(100, stmts.length - i)
                } catch (err: any) {
                  // If batch fails, try one-by-one for this chunk
                  console.warn(`[restore] Batch failed for ${table.name}, falling back to row-by-row:`, err.message)
                  for (const stmt of chunk) {
                    try {
                      await turso.execute(stmt.sql)
                      tableResult.inserted++
                    } catch (rowErr: any) {
                      tableResult.errors.push(rowErr.message || String(rowErr))
                      totalErrors++
                    }
                  }
                }
              }
            }
          }

          totalInserted += tableResult.inserted
          totalUpdated += tableResult.updated
          totalErrors += tableResult.errors.length
        } catch (err: any) {
          tableResult.errors.push(err.message || String(err))
          totalErrors++
        }

        results[table.name] = tableResult
      }
    } else {
      // Prisma fallback for local dev
      const { db } = await import('@/lib/db')

      const tables = BACKUP_TABLES.filter(t =>
        !skipTables.has(t.name) && data[t.name] && Array.isArray(data[t.name]) && data[t.name].length > 0
      )

      for (const table of tables) {
        const rows = data[table.name]
        const tableResult = { inserted: 0, updated: 0, skipped: 0, errors: [] as string[] }

        try {
          const modelName = table.name.replace(/^_/, '')
          const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof typeof db
          const model: any = db[modelKey]

          if (typeof model?.upsert !== 'function') {
            tableResult.skipped = rows.length
            results[table.name] = tableResult
            continue
          }

          for (const row of rows) {
            try {
              // Filter to only columns that exist on this model
              const data: Record<string, unknown> = {}
              for (const col of table.columns) {
                if (row[col] !== undefined) {
                  data[col] = row[col]
                }
              }

              await model.upsert({
                where: { id: row.id },
                create: data,
                update: data,
              })
              tableResult.inserted++
            } catch (err: any) {
              tableResult.errors.push(err.message || String(err))
              totalErrors++
            }
          }

          totalInserted += tableResult.inserted
          totalUpdated += tableResult.updated
          totalErrors += tableResult.errors.length
        } catch (err: any) {
          tableResult.errors.push(err.message || String(err))
          totalErrors++
        }

        results[table.name] = tableResult
      }
    }

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({ userId, action: 'BACKUP_RESTORED', category: 'backup', details: { totalInserted, totalUpdated, totalErrors, tablesProcessed: Object.keys(results).length }, ipAddress, userAgent })
    return NextResponse.json({
      success: true,
      summary: {
        totalInserted,
        totalUpdated,
        totalErrors,
        tablesProcessed: Object.keys(results).length,
      },
      details: results,
    })
  } catch (error) {
    console.error('[backup] Restore failed:', error)
    return NextResponse.json({ error: 'Restore failed' }, { status: 500 })
  }
}
