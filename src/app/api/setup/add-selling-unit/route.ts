import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// One-time migration: add sellingUnit & itemsPerUnit to Product table
export async function GET() {
  try {
    if (!isTurso()) {
      return NextResponse.json({ message: 'Not a Turso environment', skipped: true })
    }

    const results: string[] = []

    try {
      await turso.execute({ sql: 'ALTER TABLE Product ADD COLUMN sellingUnit TEXT DEFAULT "EA"' })
      results.push('Added sellingUnit column')
    } catch (e: any) {
      results.push(`sellingUnit: ${e.message?.substring(0, 60)}`)
    }

    try {
      await turso.execute({ sql: 'ALTER TABLE Product ADD COLUMN itemsPerUnit INTEGER DEFAULT 1' })
      results.push('Added itemsPerUnit column')
    } catch (e: any) {
      results.push(`itemsPerUnit: ${e.message?.substring(0, 60)}`)
    }

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
