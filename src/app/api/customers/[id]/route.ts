import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/customers/[id] - Get single customer with prescriptions and transactions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}
