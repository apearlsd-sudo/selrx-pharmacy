import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// One-time migration: add sellingUnit & itemsPerUnit to Product + TransactionItem tables
export async function GET() {
  try {
    if (!isTurso()) {
      return NextResponse.json({ message: 'Not a Turso environment', skipped: true })
    }

    const results: string[] = []

    // Product columns
    try {
      await turso.execute({ sql: 'ALTER TABLE Product ADD COLUMN sellingUnit TEXT DEFAULT "EA"' })
      results.push('Added Product.sellingUnit column')
    } catch (e: any) {
      results.push(`Product.sellingUnit: ${e.message?.substring(0, 60)}`)
    }

    try {
      await turso.execute({ sql: 'ALTER TABLE Product ADD COLUMN itemsPerUnit INTEGER DEFAULT 1' })
      results.push('Added Product.itemsPerUnit column')
    } catch (e: any) {
      results.push(`Product.itemsPerUnit: ${e.message?.substring(0, 60)}`)
    }

    // TransactionItem columns (for receipt display at time of sale)
    try {
      await turso.execute({ sql: 'ALTER TABLE TransactionItem ADD COLUMN sellingUnit TEXT DEFAULT "EA"' })
      results.push('Added TransactionItem.sellingUnit column')
    } catch (e: any) {
      results.push(`TransactionItem.sellingUnit: ${e.message?.substring(0, 60)}`)
    }

    try {
      await turso.execute({ sql: 'ALTER TABLE TransactionItem ADD COLUMN itemsPerUnit INTEGER DEFAULT 1' })
      results.push('Added TransactionItem.itemsPerUnit column')
    } catch (e: any) {
      results.push(`TransactionItem.itemsPerUnit: ${e.message?.substring(0, 60)}`)
    }

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
