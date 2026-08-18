/**
 * UNAUTHENTICATED BACKUP RESTORE (for fresh install / re-install)
 *
 * POST /api/backup/restore-setup
 *
 * This endpoint allows restoring a backup WITHOUT authentication.
 * It is intended ONLY for the initial setup flow when a user is
 * re-installing the app and has a previous backup file.
 *
 * Security: This endpoint is rate-limited by checking that NO company
 * exists yet. If a company is already set up, it returns 409.
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoBatch, generateId } from '@/lib/turso'

// Same table definitions as the main backup route
const BACKUP_TABLES = [
  { name: 'SystemRole',  columns: ['id','name','label','description','permissions','color','isSystem','isActive','createdAt','updatedAt'] },
  { name: 'Company',     columns: ['id','name','slug','logo','tagline','businessType','registrationNo','pharmacyLicense','taxId','phone','email','website','address','city','state','country','postalCode','currency','timezone','active','ownerName','ownerId','settings','createdAt','updatedAt'] },
  { name: 'Manufacturer', columns: ['id','name','contactPerson','email','phone','address','city','country','website','notes','createdAt','updatedAt'] },
  { name: 'Vendor',      columns: ['id','name','contactPerson','email','phone','address','notes','createdAt','updatedAt'] },
  { name: 'Category',    columns: ['id','name','description','createdAt','updatedAt'] },
  { name: 'Product',     columns: ['id','ndc','name','genericName','manufacturer','manufacturerId','vendorId','category','description','dosageForm','strength','unitOfMeasure','sellingUnit','itemsPerUnit','requiresPrescription','status','sellingPrice','costPrice','reorderPoint','reorderQty','maxStock','storageLocation','batchNumber','expiryDate','controlledSubstance','deaSchedule','createdAt','updatedAt'] },
  { name: 'Inventory',   columns: ['id','productId','quantity','lastCounted','createdAt','updatedAt'] },
  { name: 'Batch',       columns: ['id','productId','batchNumber','expiryDate','quantity','costPrice','receivedAt','receivedBy','createdAt','updatedAt'] },
  { name: 'Customer',    columns: ['id','firstName','lastName','email','phone','dateOfBirth','gender','address','insuranceProvider','insurancePolicyNo','allergies','notes','createdAt','updatedAt'] },
  { name: 'User',        columns: ['id','email','name','role','phone','licenseNumber','password','permissions','department','shift','hireDate','active','lastLogin','createdAt','updatedAt'] },
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
]

export async function POST(request: NextRequest) {
  try {
    // Safety check: only allow restore when no company exists yet
    // This prevents abuse after the app is already set up
    if (isTurso()) {
      const existing = await turso.execute({
        sql: `SELECT 1 FROM "Company" LIMIT 1`,
        args: [],
      })
      if (existing.rows.length > 0) {
        return NextResponse.json(
          { error: 'A company already exists. Please log in and use Settings > Data Management to restore a backup.' },
          { status: 409 }
        )
      }
    } else {
      const { db } = await import('@/lib/db')
      const existing = await db.company.findFirst()
      if (existing) {
        return NextResponse.json(
          { error: 'A company already exists. Please log in and use Settings > Data Management to restore a backup.' },
          { status: 409 }
        )
      }
    }

    const body = await request.json()
    const { data } = body as { data: Record<string, any[]> }

    if (!data || typeof data !== 'object') {
      return NextResponse.json(
        { error: 'Invalid backup file. Please select a valid SelRx backup JSON file.' },
        { status: 400 }
      )
    }

    // Validate the backup has at least a Company table
    if (!data.Company || !Array.isArray(data.Company) || data.Company.length === 0) {
      return NextResponse.json(
        { error: 'Invalid backup file: no company data found. This does not appear to be a SelRx backup.' },
        { status: 400 }
      )
    }

    // Validate the backup has at least one User (admin account)
    if (!data.User || !Array.isArray(data.User) || data.User.length === 0) {
      return NextResponse.json(
        { error: 'Invalid backup file: no user accounts found. This does not appear to be a valid SelRx backup.' },
        { status: 400 }
      )
    }

    let totalInserted = 0
    let totalErrors = 0
    const tablesProcessed: string[] = []

    if (isTurso()) {
      // Ensure logo and tagline columns exist
      try { await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "logo" TEXT`, args: [] }) } catch { /* exists */ }
      try { await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "tagline" TEXT`, args: [] }) } catch { /* exists */ }
      try { await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "settings" TEXT`, args: [] }) } catch { /* exists */ }

      const tables = BACKUP_TABLES.filter(t =>
        data[t.name] && Array.isArray(data[t.name]) && data[t.name].length > 0
      )

      for (const table of tables) {
        const rows = data[table.name]

        try {
          const cols = table.columns
          const placeholders = cols.map(() => '?').join(', ')
          const colList = cols.map(c => `"${c}"`).join(', ')

          // Check if table exists
          try {
            await turso.execute({ sql: `SELECT 1 FROM "${table.name}" LIMIT 1`, args: [] })
          } catch {
            console.warn(`[restore-setup] Table "${table.name}" does not exist, skipping`)
            continue
          }

          // Use INSERT OR REPLACE for idempotent restore
          if (rows.length > 0) {
            const stmts = rows.map((row: any) => ({
              sql: `INSERT OR REPLACE INTO "${table.name}" (${colList}) VALUES (${placeholders})`,
              args: cols.map(c => {
                const val = row[c]
                if (val === true) return 1
                if (val === false) return 0
                return val ?? null
              }),
            }))

            for (let i = 0; i < stmts.length; i += 100) {
              const chunk = stmts.slice(i, i + 100)
              try {
                await tursoBatch(chunk)
              } catch (err: any) {
                console.warn(`[restore-setup] Batch failed for ${table.name}, falling back:`, err.message)
                for (const stmt of chunk) {
                  try { await turso.execute(stmt) } catch { totalErrors++ }
                }
              }
            }
            totalInserted += rows.length
          }
          tablesProcessed.push(table.name)
        } catch (err: any) {
          console.error(`[restore-setup] Error restoring ${table.name}:`, err.message)
          totalErrors++
        }
      }
    } else {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const tables = BACKUP_TABLES.filter(t =>
        data[t.name] && Array.isArray(data[t.name]) && data[t.name].length > 0
      )

      for (const table of tables) {
        const rows = data[table.name]
        try {
          const modelName = table.name.replace(/^_/, '')
          const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1) as keyof typeof db
          const model: any = db[modelKey]

          if (typeof model?.upsert !== 'function') continue

          for (const row of rows) {
            const rowData: Record<string, unknown> = {}
            for (const col of table.columns) {
              if (row[col] !== undefined) rowData[col] = row[col]
            }
            try {
              await model.upsert({ where: { id: row.id }, create: rowData, update: rowData })
              totalInserted++
            } catch { totalErrors++ }
          }
          tablesProcessed.push(table.name)
        } catch (err: any) {
          console.error(`[restore-setup] Error restoring ${table.name}:`, err.message)
          totalErrors++
        }
      }
    }

    // Extract company info for the response
    const company = data.Company[0]
    const adminUser = data.User.find((u: any) => u.role === 'SUPER_ADMIN') || data.User[0]

    return NextResponse.json({
      success: true,
      company: {
        name: company.name,
        email: company.email,
      },
      adminUser: {
        name: adminUser.name,
        email: adminUser.email,
      },
      summary: {
        totalInserted,
        totalErrors,
        tablesProcessed: tablesProcessed.length,
      },
    })
  } catch (error) {
    console.error('[restore-setup] Restore failed:', error)
    return NextResponse.json(
      { error: 'Restore failed. Please check the backup file and try again.' },
      { status: 500 }
    )
  }
}
