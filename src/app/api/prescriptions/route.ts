import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, generateRxNumber } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// Helper: convert SQLite row to prescription object with joined relations
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

// GET /api/prescriptions - List prescriptions with status filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const skip = (page - 1) * limit

    if (isTurso()) {
      // Build WHERE clause
      const conditions: string[] = []
      const args: unknown[] = []

      if (status) {
        conditions.push(`p."status" = ?`)
        args.push(status)
      }
      if (customerId) {
        conditions.push(`p."customerId" = ?`)
        args.push(customerId)
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Fetch prescriptions with pagination
      const prescriptionsSql = `
        SELECT
          p.*,
          c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName",
          fu."id" AS "filledById", fu."name" AS "filledByName",
          vu."id" AS "verifiedById", vu."name" AS "verifiedByName"
        FROM "Prescription" p
        LEFT JOIN "Customer" c ON c."id" = p."customerId"
        LEFT JOIN "User" fu ON fu."id" = p."filledById"
        LEFT JOIN "User" vu ON vu."id" = p."verifiedById"
        ${whereClause}
        ORDER BY p."createdAt" DESC
        LIMIT ? OFFSET ?
      `
      const prescriptionsArgs = [...args, limit, skip]

      // Fetch total count
      const countSql = `SELECT COUNT(*) as total FROM "Prescription" p ${whereClause}`

      const [prescriptionsResult, countResult] = await Promise.all([
        turso.execute({ sql: prescriptionsSql, args: prescriptionsArgs }),
        turso.execute({ sql: countSql, args }),
      ])

      const prescriptions = prescriptionsResult.rows.map((row) =>
        rowToPrescription(row as Record<string, unknown>)
      )
      const total = Number(countResult.rows[0].total)

      return NextResponse.json({
        prescriptions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    } else {
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}

      if (status) {
        where.status = status
      }

      if (customerId) {
        where.customerId = customerId
      }

      const [prescriptions, total] = await Promise.all([
        db.prescription.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: {
              select: { id: true, firstName: true, lastName: true },
            },
            filledBy: {
              select: { id: true, name: true },
            },
            verifiedBy: {
              select: { id: true, name: true },
            },
          },
        }),
        db.prescription.count({ where }),
      ])

      return NextResponse.json({
        prescriptions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    }
  } catch (error) {
    console.error('Error fetching prescriptions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions', detail: msg },
      { status: 500 }
    )
  }
}

// POST /api/prescriptions - Create new prescription
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (
      role !== 'PHARMACIST' &&
      role !== 'SUPER_ADMIN' &&
      role !== 'TECHNICIAN' &&
      role !== 'CLERK'
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      customerId,
      patientName,
      prescriberName,
      prescriberNPI,
      prescriberPhone,
      prescriberFax,
      productName,
      productNdc,
      dosage,
      quantity,
      refillsTotal,
      refillsRemaining,
      daysSupply,
      dispenseAsWritten,
      priority,
      expiresAt,
      notes,
    } = body

    // Validate required fields
    if (!customerId || !patientName || !prescriberName || !productName || !quantity) {
      return NextResponse.json(
        { error: 'customerId, patientName, prescriberName, productName, and quantity are required' },
        { status: 400 }
      )
    }

    const rxNumber = generateRxNumber()

    if (isTurso()) {
      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `INSERT INTO "Prescription" (
          "id", "rxNumber", "customerId", "patientName", "prescriberName", "prescriberNPI",
          "prescriberPhone", "prescriberFax", "productName", "productNdc", "dosage", "quantity",
          "refillsTotal", "refillsRemaining", "daysSupply", "dispenseAsWritten", "priority",
          "status", "expiresAt", "notes", "createdAt", "updatedAt"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
        args: [
          id,
          rxNumber,
          customerId,
          patientName,
          prescriberName,
          prescriberNPI || null,
          prescriberPhone || null,
          prescriberFax || null,
          productName,
          productNdc || null,
          dosage || null,
          quantity,
          refillsTotal || 0,
          refillsRemaining !== undefined && refillsRemaining !== null ? refillsRemaining : (refillsTotal || 0),
          daysSupply !== undefined && daysSupply !== null ? daysSupply : null,
          dispenseAsWritten ? 1 : 0,
          priority || 'ROUTINE',
          expiresAt ? new Date(expiresAt).toISOString() : null,
          notes || null,
          now,
          now,
        ],
      })

      // Fetch the created prescription with customer
      const result = await turso.execute({
        sql: `
          SELECT
            p.*,
            c."id" AS "customerId", c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName"
          FROM "Prescription" p
          LEFT JOIN "Customer" c ON c."id" = p."customerId"
          WHERE p."id" = ?
        `,
        args: [id],
      })

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: aUid, action: 'PRESCRIPTION_CREATED', category: 'prescription', entity: 'Prescription', entityId: id, details: { patientName, productName }, ipAddress, userAgent })
      return NextResponse.json(rowToPrescription(result.rows[0] as Record<string, unknown>), { status: 201 })
    } else {
      const { db } = await import('@/lib/db')

      const prescription = await db.prescription.create({
        data: {
          rxNumber,
          customerId,
          patientName,
          prescriberName,
          prescriberNPI,
          prescriberPhone,
          prescriberFax,
          productName,
          productNdc,
          dosage,
          quantity,
          refillsTotal: refillsTotal || 0,
          refillsRemaining: refillsRemaining !== undefined && refillsRemaining !== null ? refillsRemaining : (refillsTotal || 0),
          daysSupply,
          dispenseAsWritten: dispenseAsWritten || false,
          priority: priority || 'ROUTINE',
          status: 'PENDING',
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          notes,
        },
        include: {
          customer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(request)
      await writeAuditLog({ userId: aUid2, action: 'PRESCRIPTION_CREATED', category: 'prescription', entity: 'Prescription', entityId: prescription.id, details: { patientName, productName }, ipAddress, userAgent })
      return NextResponse.json(prescription, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating prescription:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to create prescription', detail: msg },
      { status: 500 }
    )
  }
}
