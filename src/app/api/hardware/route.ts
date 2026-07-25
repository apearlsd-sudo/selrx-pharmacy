import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/hardware - Get hardware status and barcode lookup
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // GET /api/hardware/status - Get hardware status (simulated)
    if (action === 'status' || !action) {
      const status = {
        receiptPrinter: {
          connected: true,
          name: 'POS-80MM Thermal Printer',
          status: 'ready',
          paperLevel: 'good',
        },
        barcodeScanner: {
          connected: true,
          name: 'Honeywell Voyager 1202g',
          status: 'ready',
        },
        cashDrawer: {
          connected: true,
          name: 'APG VB320 Cash Drawer',
          status: 'closed',
        },
        labelPrinter: {
          connected: false,
          name: 'Zebra ZD420',
          status: 'disconnected',
        },
        scale: {
          connected: true,
          name: 'Mettler Toledo BC-150',
          status: 'ready',
        },
        lastChecked: new Date().toISOString(),
      }

      return NextResponse.json(status)
    }

    // GET /api/hardware/barcode - Barcode lookup
    if (action === 'barcode') {
      const barcode = searchParams.get('barcode')
      if (!barcode) {
        return NextResponse.json(
          { error: 'Barcode parameter is required' },
          { status: 400 }
        )
      }

      const product = await db.product.findFirst({
        where: {
          OR: [
            { ndc: barcode },
            { batchNumber: barcode },
          ],
          status: 'ACTIVE',
        },
        include: {
          inventory: true,
        },
      })

      if (!product) {
        return NextResponse.json(
          { error: 'Product not found for this barcode' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        product,
        stockLevel: product.inventory?.quantity || 0,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error with hardware request:', error)
    return NextResponse.json(
      { error: 'Hardware request failed' },
      { status: 500 }
    )
  }
}

// POST /api/hardware - Log receipt print, cash drawer open, barcode scan
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const body = await request.json()

    if (!action) {
      return NextResponse.json(
        { error: 'Action parameter is required (receipt, drawer, barcode)' },
        { status: 400 }
      )
    }

    // POST /api/hardware/receipt - Log receipt print
    if (action === 'receipt') {
      const { transactionId, hardwareType, details } = body

      if (!transactionId) {
        return NextResponse.json(
          { error: 'transactionId is required' },
          { status: 400 }
        )
      }

      const hardwareLog = await db.hardwareLog.create({
        data: {
          transactionId,
          hardwareType: hardwareType || 'receipt_printer',
          action: 'RECEIPT_PRINTED',
          status: 'success',
          details: details ? JSON.stringify(details) : null,
        },
      })

      return NextResponse.json({
        message: 'Receipt print logged successfully',
        hardwareLog,
      })
    }

    // POST /api/hardware/drawer - Log cash drawer open
    if (action === 'drawer') {
      const { details } = body

      const hardwareLog = await db.hardwareLog.create({
        data: {
          hardwareType: 'cash_drawer',
          action: 'CASH_DRAWER_OPENED',
          status: 'success',
          details: details ? JSON.stringify(details) : null,
        },
      })

      return NextResponse.json({
        message: 'Cash drawer open logged successfully',
        hardwareLog,
      })
    }

    // POST /api/hardware/barcode - Simulate barcode scan lookup
    if (action === 'barcode') {
      const { barcode } = body

      if (!barcode) {
        return NextResponse.json(
          { error: 'Barcode is required' },
          { status: 400 }
        )
      }

      // Log the scan
      await db.hardwareLog.create({
        data: {
          hardwareType: 'barcode_scanner',
          action: 'BARCODE_SCANNED',
          status: 'success',
          details: JSON.stringify({ barcode }),
        },
      })

      // Look up product
      const product = await db.product.findFirst({
        where: {
          OR: [
            { ndc: barcode },
            { batchNumber: barcode },
            { name: { contains: barcode } },
          ],
          status: 'ACTIVE',
        },
        include: {
          inventory: true,
        },
      })

      if (!product) {
        return NextResponse.json(
          { error: 'Product not found for this barcode' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        product,
        stockLevel: product.inventory?.quantity || 0,
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use: receipt, drawer, or barcode' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error with hardware POST:', error)
    return NextResponse.json(
      { error: 'Hardware request failed' },
      { status: 500 }
    )
  }
}
