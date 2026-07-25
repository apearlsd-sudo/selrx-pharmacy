import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Helper: Generate RX number
function generateRxNumber(): string {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0')
  return `RX-${year}${random}`
}

// GET /api/prescriptions - List prescriptions with status filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const customerId = searchParams.get('customerId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (customerId) {
      where.customerId = customerId
    }

    const skip = (page - 1) * limit

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
  } catch (error) {
    console.error('Error fetching prescriptions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch prescriptions' },
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

    return NextResponse.json(prescription, { status: 201 })
  } catch (error) {
    console.error('Error creating prescription:', error)
    return NextResponse.json(
      { error: 'Failed to create prescription' },
      { status: 500 }
    )
  }
}
