import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// Helper: map a raw Customer row to a plain object
function rowToCustomer(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    firstName: row.firstName as string,
    lastName: row.lastName as string,
    email: (row.email as string) || null,
    phone: (row.phone as string) || null,
    dateOfBirth: (row.dateOfBirth as string) || null,
    gender: (row.gender as string) || null,
    address: (row.address as string) || null,
    insuranceProvider: (row.insuranceProvider as string) || null,
    insurancePolicyNo: (row.insurancePolicyNo as string) || null,
    allergies: (row.allergies as string) || null,
    notes: (row.notes as string) || null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  }
}

// Helper: map a raw Prescription row (with joined filledBy/verifiedBy names) to object
function rowToPrescription(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    rxNumber: row.rxNumber as string,
    customerId: row.customerId as string,
    patientName: row.patientName as string,
    prescriberName: row.prescriberName as string,
    prescriberNPI: (row.prescriberNPI as string) || null,
    prescriberPhone: (row.prescriberPhone as string) || null,
    prescriberFax: (row.prescriberFax as string) || null,
    productName: row.productName as string,
    productNdc: (row.productNdc as string) || null,
    dosage: (row.dosage as string) || null,
    quantity: Number(row.quantity),
    refillsRemaining: Number(row.refillsRemaining),
    refillsTotal: Number(row.refillsTotal),
    daysSupply: row.daysSupply != null ? Number(row.daysSupply) : null,
    dispenseAsWritten: row.dispenseAsWritten === 1 || row.dispenseAsWritten === true,
    priority: row.priority as string,
    status: row.status as string,
    notes: (row.notes as string) || null,
    filledById: (row.filledById as string) || null,
    verifiedById: (row.verifiedById as string) || null,
    filledAt: (row.filledAt as string) || null,
    expiresAt: (row.expiresAt as string) || null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    // Joined user names
    filledByName: (row.filledByName as string) || null,
    verifiedByName: (row.verifiedByName as string) || null,
  }
}

// Helper: map a raw Transaction row to object
function rowToTransaction(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    transactionNo: row.transactionNo as string,
    customerId: (row.customerId as string) || null,
    userId: row.userId as string,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    discount: Number(row.discount),
    total: Number(row.total),
    paymentMethod: row.paymentMethod as string,
    paymentAmount: Number(row.paymentAmount),
    changeAmount: Number(row.changeAmount),
    status: row.status as string,
    prescriptionId: (row.prescriptionId as string) || null,
    notes: (row.notes as string) || null,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
    // Joined user name
    userName: (row.userName as string) || null,
    items: [] as Array<Record<string, unknown>>,
  }
}

// Helper: map a raw TransactionItem row
function rowToTransactionItem(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    transactionId: row.transactionId as string,
    productId: row.productId as string,
    productName: row.productName as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    subtotal: Number(row.subtotal),
    requiresRx: row.requiresRx === 1 || row.requiresRx === true,
    dispensedQty: row.dispensedQty != null ? Number(row.dispensedQty) : null,
    createdAt: row.createdAt as string,
  }
}

// GET /api/customers/[id] - Get single customer with prescriptions and transactions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---

      // Fetch customer
      const customerResult = await turso.execute({
        sql: `SELECT "id", "firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "insuranceProvider", "insurancePolicyNo", "allergies", "notes", "createdAt", "updatedAt" FROM "Customer" WHERE "id" = ?`,
        args: [id],
      })

      if (customerResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        )
      }

      const customer = rowToCustomer(customerResult.rows[0] as Record<string, unknown>)

      // Fetch prescriptions with filledBy and verifiedBy user names (LEFT JOIN)
      const prescriptionsResult = await turso.execute({
        sql: `
          SELECT
            p.id, p."rxNumber", p."customerId", p."patientName", p."prescriberName",
            p."prescriberNPI", p."prescriberPhone", p."prescriberFax",
            p."productName", p."productNdc", p.dosage, p.quantity,
            p."refillsRemaining", p."refillsTotal", p."daysSupply",
            p."dispenseAsWritten", p.priority, p.status, p.notes,
            p."filledById", p."verifiedById", p."filledAt", p."expiresAt",
            p."createdAt", p."updatedAt",
            filler.name AS "filledByName",
            verifier.name AS "verifiedByName"
          FROM "Prescription" p
          LEFT JOIN "User" filler ON p."filledById" = filler.id
          LEFT JOIN "User" verifier ON p."verifiedById" = verifier.id
          WHERE p."customerId" = ?
          ORDER BY p."createdAt" DESC
        `,
        args: [id],
      })

      const prescriptions = prescriptionsResult.rows.map((row) =>
        rowToPrescription(row as Record<string, unknown>)
      )

      // Fetch transactions (take 20) with user names
      const transactionsResult = await turso.execute({
        sql: `
          SELECT
            t.id, t."transactionNo", t."customerId", t."userId",
            t.subtotal, t.tax, t.discount, t.total,
            t."paymentMethod", t."paymentAmount", t."changeAmount",
            t.status, t."prescriptionId", t.notes,
            t."createdAt", t."updatedAt",
            u.name AS "userName"
          FROM "Transaction" t
          LEFT JOIN "User" u ON t."userId" = u.id
          WHERE t."customerId" = ?
          ORDER BY t."createdAt" DESC
          LIMIT 20
        `,
        args: [id],
      })

      const transactions = transactionsResult.rows.map((row) =>
        rowToTransaction(row as Record<string, unknown>)
      )

      // Fetch items for each transaction via separate query
      if (transactions.length > 0) {
        const txIds = transactions.map((t) => t.id)
        // Build placeholders for IN clause
        const placeholders = txIds.map(() => '?').join(', ')
        const itemsResult = await turso.execute({
          sql: `
            SELECT "id", "transactionId", "productId", "productName", quantity, "unitPrice", subtotal, "requiresRx", "dispensedQty", "createdAt"
            FROM "TransactionItem"
            WHERE "transactionId" IN (${placeholders})
          `,
          args: txIds,
        })

        // Group items by transactionId
        const itemsByTx = new Map<string, Array<Record<string, unknown>>>()
        for (const row of itemsResult.rows) {
          const txId = row.transactionId as string
          if (!itemsByTx.has(txId)) {
            itemsByTx.set(txId, [])
          }
          itemsByTx.get(txId)!.push(rowToTransactionItem(row as Record<string, unknown>))
        }

        // Attach items to their transactions
        for (const tx of transactions) {
          tx.items = itemsByTx.get(tx.id) || []
        }
      }

      return NextResponse.json({
        ...customer,
        prescriptions,
        transactions,
      })
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const customer = await db.customer.findUnique({
        where: { id },
        include: {
          prescriptions: {
            orderBy: { createdAt: 'desc' },
            include: {
              filledBy: { select: { id: true, name: true } },
              verifiedBy: { select: { id: true, name: true } },
            },
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
            include: {
              items: true,
              user: { select: { id: true, name: true } },
            },
            take: 20,
          },
        },
      })

      if (!customer) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(customer)
    }
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}

// PUT /api/customers/[id] - Update customer
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---

      // Check customer exists
      const existingResult = await turso.execute({
        sql: `SELECT "id", "email" FROM "Customer" WHERE "id" = ?`,
        args: [id],
      })
      if (existingResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        )
      }

      const existingEmail = existingResult.rows[0].email as string | null

      // Check for duplicate email if changing
      if (body.email && body.email !== existingEmail) {
        const dupResult = await turso.execute({
          sql: `SELECT "id" FROM "Customer" WHERE "email" = ? AND "id" != ? LIMIT 1`,
          args: [body.email, id],
        })
        if (dupResult.rows.length > 0) {
          return NextResponse.json(
            { error: 'A customer with this email already exists' },
            { status: 409 }
          )
        }
      }

      // Build dynamic UPDATE SET clause
      const setFields: string[] = []
      const setArgs: (string | number | null)[] = []

      if (body.firstName !== undefined) {
        setFields.push(`"firstName" = ?`)
        setArgs.push(body.firstName)
      }
      if (body.lastName !== undefined) {
        setFields.push(`"lastName" = ?`)
        setArgs.push(body.lastName)
      }
      if (body.email !== undefined) {
        setFields.push(`"email" = ?`)
        setArgs.push(body.email || null)
      }
      if (body.phone !== undefined) {
        setFields.push(`"phone" = ?`)
        setArgs.push(body.phone || null)
      }
      if (body.dateOfBirth !== undefined) {
        setFields.push(`"dateOfBirth" = ?`)
        setArgs.push(body.dateOfBirth || null)
      }
      if (body.gender !== undefined) {
        setFields.push(`"gender" = ?`)
        setArgs.push(body.gender || null)
      }
      if (body.address !== undefined) {
        setFields.push(`"address" = ?`)
        setArgs.push(body.address || null)
      }
      if (body.insuranceProvider !== undefined) {
        setFields.push(`"insuranceProvider" = ?`)
        setArgs.push(body.insuranceProvider || null)
      }
      if (body.insurancePolicyNo !== undefined) {
        setFields.push(`"insurancePolicyNo" = ?`)
        setArgs.push(body.insurancePolicyNo || null)
      }
      if (body.allergies !== undefined) {
        setFields.push(`"allergies" = ?`)
        setArgs.push(body.allergies || null)
      }
      if (body.notes !== undefined) {
        setFields.push(`"notes" = ?`)
        setArgs.push(body.notes || null)
      }

      if (setFields.length > 0) {
        setFields.push(`"updatedAt" = ?`)
        setArgs.push(new Date().toISOString())

        const sql = `UPDATE "Customer" SET ${setFields.join(', ')} WHERE "id" = ?`
        setArgs.push(id)

        await turso.execute({ sql, args: setArgs })
      }

      // Fetch updated customer
      const updatedResult = await turso.execute({
        sql: `SELECT "id", "firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "insuranceProvider", "insurancePolicyNo", "allergies", "notes", "createdAt", "updatedAt" FROM "Customer" WHERE "id" = ?`,
        args: [id],
      })

      return NextResponse.json(rowToCustomer(updatedResult.rows[0] as Record<string, unknown>))
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const existing = await db.customer.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json(
          { error: 'Customer not found' },
          { status: 404 }
        )
      }

      // Check for duplicate email if changing
      if (body.email && body.email !== existing.email) {
        const duplicate = await db.customer.findUnique({
          where: { email: body.email },
        })
        if (duplicate) {
          return NextResponse.json(
            { error: 'A customer with this email already exists' },
            { status: 409 }
          )
        }
      }

      const customer = await db.customer.update({
        where: { id },
        data: {
          firstName: body.firstName !== undefined ? body.firstName : undefined,
          lastName: body.lastName !== undefined ? body.lastName : undefined,
          email: body.email !== undefined ? body.email : undefined,
          phone: body.phone !== undefined ? body.phone : undefined,
          dateOfBirth: body.dateOfBirth !== undefined ? body.dateOfBirth : undefined,
          gender: body.gender !== undefined ? body.gender : undefined,
          address: body.address !== undefined ? body.address : undefined,
          insuranceProvider: body.insuranceProvider !== undefined ? body.insuranceProvider : undefined,
          insurancePolicyNo: body.insurancePolicyNo !== undefined ? body.insurancePolicyNo : undefined,
          allergies: body.allergies !== undefined ? body.allergies : undefined,
          notes: body.notes !== undefined ? body.notes : undefined,
        },
      })

      return NextResponse.json(customer)
    }
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}
