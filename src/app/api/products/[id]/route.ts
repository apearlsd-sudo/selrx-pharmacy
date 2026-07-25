import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products/[id] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const product = await db.product.findUnique({
      where: { id },
      include: {
        inventory: true,
      },
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

// PUT /api/products/[id] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    const product = await db.product.update({
      where: { id },
      data: {
        ndc: body.ndc !== undefined ? body.ndc : undefined,
        name: body.name !== undefined ? body.name : undefined,
        genericName: body.genericName !== undefined ? body.genericName : undefined,
        manufacturer: body.manufacturer !== undefined ? body.manufacturer : undefined,
        category: body.category !== undefined ? body.category : undefined,
        description: body.description !== undefined ? body.description : undefined,
        dosageForm: body.dosageForm !== undefined ? body.dosageForm : undefined,
        strength: body.strength !== undefined ? body.strength : undefined,
        unitOfMeasure: body.unitOfMeasure !== undefined ? body.unitOfMeasure : undefined,
        requiresPrescription: body.requiresPrescription !== undefined ? body.requiresPrescription : undefined,
        status: body.status !== undefined ? body.status : undefined,
        sellingPrice: body.sellingPrice !== undefined ? body.sellingPrice : undefined,
        costPrice: body.costPrice !== undefined ? body.costPrice : undefined,
        reorderPoint: body.reorderPoint !== undefined ? body.reorderPoint : undefined,
        reorderQty: body.reorderQty !== undefined ? body.reorderQty : undefined,
        maxStock: body.maxStock !== undefined ? body.maxStock : undefined,
        storageLocation: body.storageLocation !== undefined ? body.storageLocation : undefined,
        batchNumber: body.batchNumber !== undefined ? body.batchNumber : undefined,
        expiryDate: body.expiryDate !== undefined ? body.expiryDate : undefined,
        controlledSubstance: body.controlledSubstance !== undefined ? body.controlledSubstance : undefined,
        deaSchedule: body.deaSchedule !== undefined ? body.deaSchedule : undefined,
      },
      include: { inventory: true },
    })

    return NextResponse.json(product)
  } catch (error) {
    console.error('Error updating product:', error)
    return NextResponse.json(
      { error: 'Failed to update product' },
      { status: 500 }
    )
  }
}

// DELETE /api/products/[id] - Soft delete (set status to DISCONTINUED)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const { id } = await params

    const existing = await db.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    const product = await db.product.update({
      where: { id },
      data: { status: 'DISCONTINUED' },
    })

    return NextResponse.json({ message: 'Product discontinued successfully', product })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json(
      { error: 'Failed to delete product' },
      { status: 500 }
    )
  }
}
