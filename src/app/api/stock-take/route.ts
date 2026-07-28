import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/stock-take — list stock takes
export async function GET(req: NextRequest) {
  try {
    const stockTakes = await db.stockTake.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        countedByUser: { select: { name: true, email: true } },
        items: {
          include: { product: { select: { id: true, name: true, ndc: true, category: true, unitOfMeasure: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    return NextResponse.json(stockTakes)
  } catch (error) {
    console.error('Error fetching stock takes:', error)
    return NextResponse.json({ error: 'Failed to fetch stock takes' }, { status: 500 })
  }
}

// POST /api/stock-take — create a new stock take
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { notes, countedBy } = body

    // Generate a unique reference: find the highest numeric suffix and increment
    const allTakes = await db.stockTake.findMany({
      select: { reference: true },
      orderBy: { createdAt: 'desc' },
    })

    let maxNum = 0
    for (const st of allTakes) {
      const match = st.reference?.match(/ST-(\d+)/)
      if (match) {
        const num = Number(match[1])
        if (num > maxNum) maxNum = num
      }
    }
    const ref = `ST-${String(maxNum + 1).padStart(4, '0')}`

    console.log(`[StockTake Create] ref=${ref} notes=${notes || 'none'}`)

    const stockTake = await db.stockTake.create({
      data: {
        reference: ref,
        status: 'IN_PROGRESS',
        notes: notes || null,
        countedBy: countedBy || null,
        startedAt: new Date(),
      },
    })

    console.log(`[StockTake Create] success id=${stockTake.id}`)
    return NextResponse.json(stockTake, { status: 201 })
  } catch (error) {
    console.error('[StockTake Create] error:', error)
    return NextResponse.json({ error: 'Failed to create stock take', details: String(error) }, { status: 500 })
  }
}
