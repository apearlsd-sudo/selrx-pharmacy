/**
 * UNAUTHENTICATED BACKUP RESTORE (for fresh install / re-install)
 *
 * POST /api/backup/restore-setup
 *
 * This endpoint allows restoring a backup WITHOUT authentication.
 * It is intended ONLY for the initial setup flow when a user is
 * re-installing the app and has a previous backup file.
 *
 * Security:
 * - This endpoint only works when NO company exists yet (returns 409 otherwise).
 * - Passwords are NEVER included in backup files (the User table excludes
 *   the password column). After restore, a temporary password is generated
 *   for the SUPER_ADMIN and returned in the response for one-time display.
 * - Users must change their password after first login.
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, tursoBatch, generateId, sqlRaw } from '@/lib/turso'
import { hashPassword } from '@/lib/security'

// Same table definitions as the main backup route
const BACKUP_TABLES = [
  { name: 'SystemRole',  columns: ['id','name','label','description','permissions','color','isSystem','isActive','createdAt','updatedAt'] },
  { name: 'Company',     columns: ['id','name','slug','logo','tagline','businessType','registrationNo','pharmacyLicense','taxId','phone','email','website','address','city','state','country','postalCode','currency','timezone','active','ownerName','ownerId','settings','createdAt','updatedAt'] },
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
  { name: 'Transaction', columns: ['id','transactionNo','customerId','userId','workstationId','subtotal','tax','discount','total','paymentMethod','paymentAmount','changeAmount','status','prescriptionId','notes','createdAt','updatedAt'] },
  { name: 'TransactionItem', columns: ['id','transactionId','productId','productName','quantity','unitPrice','subtotal','requiresRx','dispensedQty','sellingUnit','itemsPerUnit','createdAt'] },
  { name: 'Return',      columns: ['id','returnNo','transactionId','transactionItemId','productId','productName','quantity','unitPrice','refundAmount','reason','reasonNote','customerId','customerName','userId','status','approvedById','approvedAt','refundMethod','refundProcessed','restocked','notes','createdAt','updatedAt'] },
  { name: 'Workstation',  columns: ['id','name','description','location','isActive','createdAt','updatedAt'] },
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
  { name: 'DrugInteraction', columns: ['id','drug1','drug2','severity','category','description','mechanism','management','onset','evidence','source','isCustom','isActive','createdAt','updatedAt'] },
  { name: 'SuspendedCart', columns: ['id','userId','workstationId','customerId','customerName','items','subtotal','tax','total','note','createdAt','updatedAt'] },
  { name: 'ControlledSubstanceLog', columns: ['id','productId','productName','prescriptionId','quantity','dispensedBy','verifiedBy','notes','createdAt'] },
  { name: 'Shift', columns: ['id','userId','userName','startedAt','endedAt','status','totalSales','totalTransactions','totalItemsSold','cashAtStart','cashAtEnd','expectedCash','cashDiscrepancy','createdAt','updatedAt'] },
  { name: 'ShiftInventory', columns: ['id','shiftId','productId','productName','quantity','sellingPrice','costPrice','category','createdAt'] },
]

export async function POST(request: NextRequest) {
  try {
    // Safety check: only allow restore when no company exists yet
    // This prevents abuse after the app is already set up
    if (isTurso()) {
      const existing = await turso.execute(`SELECT 1 FROM "Company" LIMIT 1`)
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
      // Ensure Company columns exist
      try { await turso.execute(`ALTER TABLE "Company" ADD COLUMN "logo" TEXT`) } catch { /* exists */ }
      try { await turso.execute(`ALTER TABLE "Company" ADD COLUMN "tagline" TEXT`) } catch { /* exists */ }
      try { await turso.execute(`ALTER TABLE "Company" ADD COLUMN "settings" TEXT`) } catch { /* exists */ }
      // Ensure Transaction columns exist
      try { await turso.execute(`ALTER TABLE "Transaction" ADD COLUMN "workstationId" TEXT`) } catch { /* exists */ }
      // Ensure TransactionItem columns exist
      try { await turso.execute(`ALTER TABLE "TransactionItem" ADD COLUMN "sellingUnit" TEXT DEFAULT 'EA'`) } catch { /* exists */ }
      try { await turso.execute(`ALTER TABLE "TransactionItem" ADD COLUMN "itemsPerUnit" INTEGER DEFAULT 1`) } catch { /* exists */ }

      // Ensure dynamically-created tables exist (they may not be in a fresh install)
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "Workstation" (
        "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT, "location" TEXT,
        "isActive" INTEGER NOT NULL DEFAULT 1, "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
      )`) } catch { /* */ }
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "DrugInteraction" (
        "id" TEXT NOT NULL PRIMARY KEY, "drug1" TEXT NOT NULL, "drug2" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'moderate', "category" TEXT NOT NULL DEFAULT 'drug-drug',
        "description" TEXT NOT NULL DEFAULT '', "mechanism" TEXT NOT NULL DEFAULT '',
        "management" TEXT NOT NULL DEFAULT '', "onset" TEXT NOT NULL DEFAULT '',
        "evidence" TEXT NOT NULL DEFAULT 'established', "source" TEXT NOT NULL DEFAULT 'SelRx Database',
        "isCustom" INTEGER NOT NULL DEFAULT 0, "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
      )`) } catch { /* */ }
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "SuspendedCart" (
        "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "workstationId" TEXT,
        "customerId" TEXT, "customerName" TEXT, "items" TEXT NOT NULL,
        "subtotal" REAL NOT NULL DEFAULT 0, "tax" REAL NOT NULL DEFAULT 0,
        "total" REAL NOT NULL DEFAULT 0, "note" TEXT,
        "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
      )`) } catch { /* */ }
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "ControlledSubstanceLog" (
        "id" TEXT NOT NULL PRIMARY KEY, "productId" TEXT NOT NULL, "productName" TEXT,
        "prescriptionId" TEXT, "quantity" INTEGER NOT NULL, "dispensedBy" TEXT NOT NULL,
        "verifiedBy" TEXT NOT NULL, "notes" TEXT, "createdAt" TEXT NOT NULL
      )`) } catch { /* */ }
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "Shift" (
        "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "userName" TEXT,
        "startedAt" TEXT NOT NULL, "endedAt" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "totalSales" REAL NOT NULL DEFAULT 0, "totalTransactions" INTEGER NOT NULL DEFAULT 0,
        "totalItemsSold" INTEGER NOT NULL DEFAULT 0, "cashAtStart" REAL, "cashAtEnd" REAL,
        "expectedCash" REAL, "cashDiscrepancy" REAL,
        "createdAt" TEXT NOT NULL, "updatedAt" TEXT NOT NULL
      )`) } catch { /* */ }
      try { await turso.execute(`CREATE TABLE IF NOT EXISTS "ShiftInventory" (
        "id" TEXT NOT NULL PRIMARY KEY, "shiftId" TEXT NOT NULL, "productId" TEXT NOT NULL,
        "productName" TEXT, "quantity" INTEGER NOT NULL DEFAULT 0, "sellingPrice" REAL,
        "costPrice" REAL, "category" TEXT, "createdAt" TEXT NOT NULL
      )`) } catch { /* */ }

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
            await turso.execute(`SELECT 1 FROM "${table.name}" LIMIT 1`)
          } catch {
            console.warn(`[restore-setup] Table "${table.name}" does not exist, skipping`)
            continue
          }

          // Use INSERT OR REPLACE for idempotent restore
          if (rows.length > 0) {
            const stmts = rows.map((row: any) => {
              const vals = cols.map(c => {
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

            for (let i = 0; i < stmts.length; i += 100) {
              const chunk = stmts.slice(i, i + 100)
              try {
                await tursoBatch(chunk)
              } catch (err: any) {
                console.warn(`[restore-setup] Batch failed for ${table.name}, falling back:`, err.message)
                for (const stmt of chunk) {
                  try { await turso.execute(stmt.sql) } catch { totalErrors++ }
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

    // Generate a temporary password for the admin user so they can log in
    // (passwords are never stored in backup files for security)
    const tempPassword = 'SelRx' + Math.random().toString(36).slice(2, 10)
    const hashedPw = await hashPassword(tempPassword)

    try {
      if (isTurso()) {
        await turso.execute(sqlRaw(`UPDATE "User" SET "password" = ? WHERE "id" = ?`, [hashedPw, adminUser.id]))
      } else {
        const { db } = await import('@/lib/db')
        await db.user.update({ where: { id: adminUser.id }, data: { password: hashedPw } })
      }
    } catch (err) {
      console.error('[restore-setup] Failed to set temp password:', err)
    }

    return NextResponse.json({
      success: true,
      tempPassword,
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
