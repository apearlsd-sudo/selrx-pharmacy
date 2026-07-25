import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/prescriptions/[id] - Get single prescription
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    const existing = await db.prescription.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      )
    }

    // POST /api/prescriptions/[id]/fill - Fill prescription
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

    // POST /api/prescriptions/[id]/verify - Verify prescription
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
  } catch (error) {
    console.error('Error updating prescription:', error)
    return NextResponse.json(
      { error: 'Failed to update prescription' },
      { status: 500 }
    )
  }
}
