import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/customers - List customers with search and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---
      let customersResult
      let totalResult

      if (search) {
        // LIKE pattern using SQLite concatenation: '%' || ? || '%'
        const likePattern = `'%' || ? || '%'`
        const whereClause = `"firstName" LIKE ${likePattern} OR "lastName" LIKE ${likePattern} OR "email" LIKE ${likePattern} OR "phone" LIKE ${likePattern} OR "insurancePolicyNo" LIKE ${likePattern}`

        const countSql = `SELECT COUNT(*) as count FROM "Customer" WHERE ${whereClause}`
        const dataSql = `SELECT "id", "firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "insuranceProvider", "insurancePolicyNo", "allergies", "notes", "createdAt", "updatedAt" FROM "Customer" WHERE ${whereClause} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`

        // 5 search args for LIKE, then limit + skip for data
        ;[customersResult, totalResult] = await Promise.all([
          turso.execute({
            sql: dataSql,
            args: [search, search, search, search, search, limit, skip],
          }),
          turso.execute({
            sql: countSql,
            args: [search, search, search, search, search],
          }),
        ])
      } else {
        const countSql = `SELECT COUNT(*) as count FROM "Customer"`
        const dataSql = `SELECT "id", "firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "insuranceProvider", "insurancePolicyNo", "allergies", "notes", "createdAt", "updatedAt" FROM "Customer" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`

        ;[customersResult, totalResult] = await Promise.all([
          turso.execute({
            sql: dataSql,
            args: [limit, skip],
          }),
          turso.execute({
            sql: countSql,
            args: [],
          }),
        ])
      }

      const customers = customersResult.rows.map((row) => ({
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
      }))

      const total = Number(totalResult.rows[0].count)

      return NextResponse.json({
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}

      if (search) {
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { phone: { contains: search } },
          { insurancePolicyNo: { contains: search } },
        ]
      }

      const [customers, total] = await Promise.all([
        db.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
            address: true,
            insuranceProvider: true,
            insurancePolicyNo: true,
            allergies: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        db.customer.count({ where }),
      ])

      return NextResponse.json({
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    }
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create a new customer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      address,
      insuranceProvider,
      insurancePolicyNo,
      allergies,
      notes,
    } = body

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'firstName and lastName are required' },
        { status: 400 }
      )
    }

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---

      // Check for duplicate email
      if (email) {
        const existingResult = await turso.execute({
          sql: `SELECT "id" FROM "Customer" WHERE "email" = ? LIMIT 1`,
          args: [email],
        })
        if (existingResult.rows.length > 0) {
          return NextResponse.json(
            { error: 'A customer with this email already exists' },
            { status: 409 }
          )
        }
      }

      const id = generateId()
      const now = new Date().toISOString()

      await turso.execute({
        sql: `INSERT INTO "Customer" ("id", "firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "address", "insuranceProvider", "insurancePolicyNo", "allergies", "notes", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          firstName,
          lastName,
          email || null,
          phone || null,
          dateOfBirth || null,
          gender || null,
          address || null,
          insuranceProvider || null,
          insurancePolicyNo || null,
          allergies || null,
          notes || null,
          now,
          now,
        ],
      })

      const customer = {
        id,
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        address: address || null,
        insuranceProvider: insuranceProvider || null,
        insurancePolicyNo: insurancePolicyNo || null,
        allergies: allergies || null,
        notes: notes || null,
        createdAt: now,
        updatedAt: now,
      }

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid, action: 'CUSTOMER_CREATED', category: 'customer', entity: 'Customer', entityId: id, details: { firstName, lastName, email }, ipAddress, userAgent })
      return NextResponse.json(customer, { status: 201 })
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      // Check for duplicate email
      if (email) {
        const existing = await db.customer.findUnique({ where: { email } })
        if (existing) {
          return NextResponse.json(
            { error: 'A customer with this email already exists' },
            { status: 409 }
          )
        }
      }

      const customer = await db.customer.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          dateOfBirth,
          gender,
          address,
          insuranceProvider,
          insurancePolicyNo,
          allergies,
          notes,
        },
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(request)
      writeAuditLog({ userId: aUid2, action: 'CUSTOMER_CREATED', category: 'customer', entity: 'Customer', entityId: customer.id, details: { firstName, lastName, email }, ipAddress, userAgent })
      return NextResponse.json(customer, { status: 201 })
    }
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}
