import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/products - List all products with search, filter, pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { genericName: { contains: search } },
        { manufacturer: { contains: search } },
        { ndc: { contains: search } },
      ]
    }

    if (category) {
      where.category = category
    }

    if (status) {
      where.status = status
    }

    const skip = (page - 1) * limit

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          inventory: true,
        },
      }),
      db.product.count({ where }),
    ])

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}

// POST /api/products - Create product (PHARMACIST, SUPER_ADMIN only)
export async function POST(request: NextRequest) {
  try {
    const role = request.headers.get('x-user-role')
    if (role !== 'PHARMACIST' && role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()

    const product = await db.product.create({
      data: {
        ndc: body.ndc,
        name: body.name,
        genericName: body.genericName,
        manufacturer: body.manufacturer,
        vendorId: body.vendorId || null,
        category: body.category || 'OTC',
        description: body.description,
        dosageForm: body.dosageForm,
        strength: body.strength,
        unitOfMeasure: body.unitOfMeasure || 'EA',
        requiresPrescription: body.requiresPrescription || false,
        status: body.status || 'ACTIVE',
        sellingPrice: body.sellingPrice,
        costPrice: body.costPrice,
        reorderPoint: body.reorderPoint || 10,
        reorderQty: body.reorderQty || 50,
        maxStock: body.maxStock,
        storageLocation: body.storageLocation,
        batchNumber: body.batchNumber,
        expiryDate: body.expiryDate,
        controlledSubstance: body.controlledSubstance || false,
        deaSchedule: body.deaSchedule,
      },
    })

    // Create inventory record for the product
    await db.inventory.create({
      data: {
        productId: product.id,
        quantity: 0,
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}
