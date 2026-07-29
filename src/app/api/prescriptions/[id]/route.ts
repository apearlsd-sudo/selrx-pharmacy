import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// Helper: convert SQLite row to prescription detail object (with customer, filledBy, verifiedBy, transactions)
function rowToPrescriptionDetail(row: Record<string, unknown>) {
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
    refillsTotal: Number(row.refillsTotal),
    refillsRemaining: Number(row.refillsRemaining),
    daysSupply: row.daysSupply !== null && row.daysSupply !== undefined ? Number(row.daysSupply) : null,
    dispenseAsWritten: row.dispenseAsWritten === 1 || row.dispenseAsWritten === true,
    priority: row.priority as string,
    status: row.status as string,
    notes: (row.notes as string) || null,
    filledById: (row.filledById as string) || null,
    verifiedById: (row.verifiedById as string) || null,
    filledAt: (row.filledAt as string) || null,
    expiresAt: (row.expiresAt as string) || null,
    createdAt: (row.createdAt as string) || null,
    updatedAt: (row.updatedAt as string) || null,
    // Joined relations
    customer: row.customerId ? {
      id: row.customerId as string,
      firstName: (row.customerFirstName as string) || '',
      lastName: (row.customerLastName as string) || '',
      email: (row.customerEmail as string) || null,
      phone: (row.customerPhone as string) || null,
      dateOfBirth: (row.customerDateOfBirth as string) || null,
      allergies: (row.customerAllergies as string) || null,
    } : null,
    filledBy: row.filledById ? {
      id: row.filledById as string,
      name: (row.filledByName as string) || null,
      licenseNumber: (row.filledByLicenseNumber as string) || null,
    } : null,
    verifiedBy: row.verifiedById ? {
      id: row.verifiedById as string,
      name: (row.verifiedByName as string) || null,
      licenseNumber: (row.verifiedByLicenseNumber as string) || null,
    } : null,
  }
}

// Helper: convert SQLite row to prescription summary (for fill/verify/regular update responses)
function rowToPrescriptionSummary(row: Record<string, unknown>) {
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
    refillsTotal: Number(row.refillsTotal),
    refillsRemaining: Number(row.refillsRemaining),
    daysSupply: row.daysSupply !== null && row.daysSupply !== undefined ? Number(row.daysSupply) : null,
    dispenseAsWritten: row.dispenseAsWritten === 1 || row.dispenseAsWritten === true,
    priority: row.priority as string,
    status: row.status as string,
    notes: (row.notes as string) || null,
    filledById: (row.filledById as string) || null,
    verifiedById: (row.verifiedById as string) || null,
    filledAt: (row.filledAt as string) || null,
    expiresAt: (row.expiresAt as string) || null,
    createdAt: (row.createdAt as string) || null,
    updatedAt: (row.updatedAt as string) || null,
    // Joined relations (summary-level)
    customer: row.customerId ? {
      id: row.customerId as string,
      firstName: (row.customerFirstName as string) || '',
      lastName: (row.customerLastName as string) || '',
    } : null,
    filledBy: row.filledById ? {
      id: row.filledById as string,
      name: (row.filledByName as string) || null,
    } : null,
    verifiedBy: row.verifiedById ? {
      id: row.verifiedById as string,
      name: (row.verifiedByName as string) || null,
    } : null,
  }
}

// GET /api/prescriptions/[id] - Get single prescription
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (isTurso()) {
      // Fetch prescription with deep joins (customer, filledBy, verifiedBy)
      const result = await turso.execute({
        sql: `
          SELECT
            p.*,
            c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
            c."email" AS "customerEmail", c."phone" AS "customerPhone",
            c."dateOfBirth" AS "customerDateOfBirth", c."allergies" AS "customerAllergies",
            fu."id" AS "filledById", fu."name" AS "filledByName", fu."licenseNumber" AS "filledByLicenseNumber",
            vu."id" AS "verifiedById", vu."name" AS "verifiedByName", vu."licenseNumber" AS "verifiedByLicenseNumber"
          FROM "Prescription" p
          LEFT JOIN "Customer" c ON c."id" = p."customerId"
          LEFT JOIN "User" fu ON fu."id" = p."filledById"
          LEFT JOIN "User" vu ON vu."id" = p."verifiedById"
          WHERE p."id" = ?
        `,
        args: [id],
      })

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Prescription not found' },
          { status: 404 }
        )
      }

      // Fetch transactions for this prescription
      const txResult = await turso.execute({
        sql: `SELECT "id", "transactionNo", "total", "status", "createdAt" FROM "Transaction" WHERE "prescriptionId" = ?`,
        args: [id],
      })

      const prescription = rowToPrescriptionDetail(result.rows[0] as Record<string, unknown>)
      prescription.transactions = txResult.rows.map((tx) => ({
        id: tx.id as string,
        transactionNo: tx.transactionNo as string,
        total: Number(tx.total),
        status: tx.status as string,
        createdAt: (tx.createdAt as string) || null,
      }))

      return NextResponse.json(prescription)
    } else {
      const { db } = await import('@/lib/db')

      const prescription = await db.prescription.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              dateOfBirth: true,
              allergies: true,
            },
          },
          filledBy: {
            select: { id: true, name: true, licenseNumber: true },
          },
          verifiedBy: {
            select: { id: true, name: true, licenseNumber: true },
          },
          transactions: {
            select: {
              id: true,
              transactionNo: true,
              total: true,
              status: true,
              createdAt: true,
            },
          },
        },
      })

      if (!prescription) {
        return NextResponse.json(
          { error: 'Prescription not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(prescription)
    }
  } catch (error) {
    console.error('Error fetching prescription:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prescription' },
      { status: 500 }
    )
  }
}

// PUT /api/prescriptions/[id] - Update prescription
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (
      role !== 'PHARMACIST' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'TECHNICIAN'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (isTurso()) {
      // Check prescription exists
      const existingResult = await turso.execute({
        sql: `SELECT "id", "status", "productName", "quantity" FROM "Prescription" WHERE "id" = ?`,
        args: [id],
      })
      if (existingResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Prescription not found' },
          { status: 404 }
        )
      }
      const existing = existingResult.rows[0] as Record<string, unknown>

      // PUT /api/prescriptions/[id]/fill - Fill prescription
      if (action === 'fill') {
        const userId = request.headers.get('x-user-id') || 'demo-user'

        if (existing.status !== 'PENDING' && existing.status !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: 'Prescription cannot be filled in its current status' },
            { status: 400 }
          )
        }

        // Find the product and check inventory
        const productName = existing.productName as string
        const productResult = await turso.execute({
          sql: `SELECT "id" FROM "Product" WHERE "name" LIKE '%' || ? || '%' AND "status" = 'ACTIVE' LIMIT 1`,
          args: [productName],
        })

        if (productResult.rows.length > 0) {
          const productId = productResult.rows[0].id as string

          const inventoryResult = await turso.execute({
            sql: `SELECT "id", "quantity" FROM "Inventory" WHERE "productId" = ?`,
            args: [productId],
          })

          if (inventoryResult.rows.length === 0) {
            return NextResponse.json(
              { error: `Insufficient stock for ${productName}` },
              { status: 400 }
            )
          }

          const currentQty = Number(inventoryResult.rows[0].quantity)
          const requiredQty = Number(existing.quantity)

          if (currentQty < requiredQty) {
            return NextResponse.json(
              { error: `Insufficient stock for ${productName}` },
              { status: 400 }
            )
          }

          // Read-modify-write: decrement inventory
          const newQty = currentQty - requiredQty
          const now = new Date().toISOString()
          await turso.execute({
            sql: `UPDATE "Inventory" SET "quantity" = ?, "lastCounted" = ?, "updatedAt" = ? WHERE "productId" = ?`,
            args: [newQty, now, now, productId],
          })
        }

        // Update prescription status to DISPENSED
        const filledAt = new Date().toISOString()
        await turso.execute({
          sql: `UPDATE "Prescription" SET "status" = 'DISPENSED', "filledById" = ?, "filledAt" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [userId, filledAt, filledAt, id],
        })

        // Fetch updated prescription with relations
        const filledResult = await turso.execute({
          sql: `
            SELECT
              p.*,
              c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
              fu."id" AS "filledById", fu."name" AS "filledByName",
              vu."id" AS "verifiedById", vu."name" AS "verifiedByName"
            FROM "Prescription" p
            LEFT JOIN "Customer" c ON c."id" = p."customerId"
            LEFT JOIN "User" fu ON fu."id" = p."filledById"
            LEFT JOIN "User" vu ON vu."id" = p."verifiedById"
            WHERE p."id" = ?
          `,
          args: [id],
        })

        return NextResponse.json({
          message: 'Prescription filled successfully',
          prescription: rowToPrescriptionSummary(filledResult.rows[0] as Record<string, unknown>),
        })
      }

      // PUT /api/prescriptions/[id]/verify - Verify prescription
      if (action === 'verify') {
        const userId = request.headers.get('x-user-id') || 'demo-user'

        if (existing.status !== 'PENDING' && existing.status !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: 'Prescription cannot be verified in its current status' },
            { status: 400 }
          )
        }

        const now = new Date().toISOString()
        await turso.execute({
          sql: `UPDATE "Prescription" SET "status" = 'READY', "verifiedById" = ?, "updatedAt" = ? WHERE "id" = ?`,
          args: [userId, now, id],
        })

        // Fetch updated prescription with relations
        const verifiedResult = await turso.execute({
          sql: `
            SELECT
              p.*,
              c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
              fu."id" AS "filledById", fu."name" AS "filledByName",
              vu."id" AS "verifiedById", vu."name" AS "verifiedByName"
            FROM "Prescription" p
            LEFT JOIN "Customer" c ON c."id" = p."customerId"
            LEFT JOIN "User" fu ON fu."id" = p."filledById"
            LEFT JOIN "User" vu ON vu."id" = p."verifiedById"
            WHERE p."id" = ?
          `,
          args: [id],
        })

        return NextResponse.json({
          message: 'Prescription verified successfully',
          prescription: rowToPrescriptionSummary(verifiedResult.rows[0] as Record<string, unknown>),
        })
      }

      // Regular update - build SET clause dynamically for provided fields
      const setClauses: string[] = []
      const args: unknown[] = []

      if (body.patientName !== undefined) {
        setClauses.push(`"patientName" = ?`)
        args.push(body.patientName)
      }
      if (body.prescriberName !== undefined) {
        setClauses.push(`"prescriberName" = ?`)
        args.push(body.prescriberName)
      }
      if (body.prescriberNPI !== undefined) {
        setClauses.push(`"prescriberNPI" = ?`)
        args.push(body.prescriberNPI)
      }
      if (body.prescriberPhone !== undefined) {
        setClauses.push(`"prescriberPhone" = ?`)
        args.push(body.prescriberPhone)
      }
      if (body.prescriberFax !== undefined) {
        setClauses.push(`"prescriberFax" = ?`)
        args.push(body.prescriberFax)
      }
      if (body.productName !== undefined) {
        setClauses.push(`"productName" = ?`)
        args.push(body.productName)
      }
      if (body.productNdc !== undefined) {
        setClauses.push(`"productNdc" = ?`)
        args.push(body.productNdc)
      }
      if (body.dosage !== undefined) {
        setClauses.push(`"dosage" = ?`)
        args.push(body.dosage)
      }
      if (body.quantity !== undefined) {
        setClauses.push(`"quantity" = ?`)
        args.push(body.quantity)
      }
      if (body.refillsTotal !== undefined) {
        setClauses.push(`"refillsTotal" = ?`)
        args.push(body.refillsTotal)
      }
      if (body.refillsRemaining !== undefined) {
        setClauses.push(`"refillsRemaining" = ?`)
        args.push(body.refillsRemaining)
      }
      if (body.daysSupply !== undefined) {
        setClauses.push(`"daysSupply" = ?`)
        args.push(body.daysSupply)
      }
      if (body.dispenseAsWritten !== undefined) {
        setClauses.push(`"dispenseAsWritten" = ?`)
        args.push(body.dispenseAsWritten ? 1 : 0)
      }
      if (body.priority !== undefined) {
        setClauses.push(`"priority" = ?`)
        args.push(body.priority)
      }
      if (body.status !== undefined) {
        setClauses.push(`"status" = ?`)
        args.push(body.status)
      }
      if (body.expiresAt !== undefined) {
        setClauses.push(`"expiresAt" = ?`)
        args.push(body.expiresAt ? new Date(body.expiresAt).toISOString() : null)
      }
      if (body.notes !== undefined) {
        setClauses.push(`"notes" = ?`)
        args.push(body.notes)
      }

      // Always update updatedAt
      setClauses.push(`"updatedAt" = ?`)
      args.push(new Date().toISOString())

      if (setClauses.length <= 1) {
        // Only updatedAt was added, no actual fields to update
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        )
      }

      args.push(id)

      await turso.execute({
        sql: `UPDATE "Prescription" SET ${setClauses.join(', ')} WHERE "id" = ?`,
        args,
      })

      // Fetch updated prescription with relations
      const updatedResult = await turso.execute({
        sql: `
          SELECT
            p.*,
            c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
            fu."id" AS "filledById", fu."name" AS "filledByName",
            vu."id" AS "verifiedById", vu."name" AS "verifiedByName"
          FROM "Prescription" p
          LEFT JOIN "Customer" c ON c."id" = p."customerId"
          LEFT JOIN "User" fu ON fu."id" = p."filledById"
          LEFT JOIN "User" vu ON vu."id" = p."verifiedById"
          WHERE p."id" = ?
        `,
        args: [id],
      })

      return NextResponse.json(rowToPrescriptionSummary(updatedResult.rows[0] as Record<string, unknown>))
    } else {
      const { db } = await import('@/lib/db')

      const existing = await db.prescription.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json(
          { error: 'Prescription not found' },
          { status: 404 }
        )
      }

      // PUT /api/prescriptions/[id]/fill - Fill prescription
      if (action === 'fill') {
        const userId = request.headers.get('x-user-id') || 'demo-user'

        if (existing.status !== 'PENDING' && existing.status !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: 'Prescription cannot be filled in its current status' },
            { status: 400 }
          )
        }

        // Find the product and check inventory
        const product = await db.product.findFirst({
          where: {
            name: { contains: existing.productName },
            status: 'ACTIVE',
          },
        })

        if (product) {
          const inventory = await db.inventory.findUnique({
            where: { productId: product.id },
          })

          if (!inventory || inventory.quantity < existing.quantity) {
            return NextResponse.json(
              { error: `Insufficient stock for ${existing.productName}` },
              { status: 400 }
            )
          }

          // Deduct inventory
          await db.inventory.update({
            where: { productId: product.id },
            data: {
              quantity: { decrement: existing.quantity },
              lastCounted: new Date(),
            },
          })
        }

        const filled = await db.prescription.update({
          where: { id },
          data: {
            status: 'DISPENSED',
            filledById: userId,
            filledAt: new Date(),
          },
          include: {
            customer: { select: { id: true, firstName: true, lastName: true } },
            filledBy: { select: { id: true, name: true } },
            verifiedBy: { select: { id: true, name: true } },
          },
        })

        return NextResponse.json({
          message: 'Prescription filled successfully',
          prescription: filled,
        })
      }

      // PUT /api/prescriptions/[id]/verify - Verify prescription
      if (action === 'verify') {
        const userId = request.headers.get('x-user-id') || 'demo-user'

        if (existing.status !== 'PENDING' && existing.status !== 'IN_PROGRESS') {
          return NextResponse.json(
            { error: 'Prescription cannot be verified in its current status' },
            { status: 400 }
          )
        }

        const verified = await db.prescription.update({
          where: { id },
          data: {
            status: 'READY',
            verifiedById: userId,
          },
          include: {
            customer: { select: { id: true, firstName: true, lastName: true } },
            filledBy: { select: { id: true, name: true } },
            verifiedBy: { select: { id: true, name: true } },
          },
        })

        return NextResponse.json({
          message: 'Prescription verified successfully',
          prescription: verified,
        })
      }

      // Regular update
      const updated = await db.prescription.update({
        where: { id },
        data: {
          patientName: body.patientName !== undefined ? body.patientName : undefined,
          prescriberName: body.prescriberName !== undefined ? body.prescriberName : undefined,
          prescriberNPI: body.prescriberNPI !== undefined ? body.prescriberNPI : undefined,
          prescriberPhone: body.prescriberPhone !== undefined ? body.prescriberPhone : undefined,
          prescriberFax: body.prescriberFax !== undefined ? body.prescriberFax : undefined,
          productName: body.productName !== undefined ? body.productName : undefined,
          productNdc: body.productNdc !== undefined ? body.productNdc : undefined,
          dosage: body.dosage !== undefined ? body.dosage : undefined,
          quantity: body.quantity !== undefined ? body.quantity : undefined,
          refillsTotal: body.refillsTotal !== undefined ? body.refillsTotal : undefined,
          refillsRemaining: body.refillsRemaining !== undefined ? body.refillsRemaining : undefined,
          daysSupply: body.daysSupply !== undefined ? body.daysSupply : undefined,
          dispenseAsWritten: body.dispenseAsWritten !== undefined ? body.dispenseAsWritten : undefined,
          priority: body.priority !== undefined ? body.priority : undefined,
          status: body.status !== undefined ? body.status : undefined,
          expiresAt: body.expiresAt !== undefined ? (body.expiresAt ? new Date(body.expiresAt) : null) : undefined,
          notes: body.notes !== undefined ? body.notes : undefined,
        },
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          filledBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
        },
      })

      return NextResponse.json(updated)
    }
  } catch (error) {
    console.error('Error updating prescription:', error)
    return NextResponse.json(
      { error: 'Failed to update prescription' },
      { status: 500 }
    )
  }
}
