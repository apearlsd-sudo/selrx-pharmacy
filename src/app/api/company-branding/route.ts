import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

/**
 * Ensure the "logo" column exists on the Turso Company table.
 * Older Turso databases may have been pushed before this column was added.
 * SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we try/catch.
 */
async function ensureLogoColumn() {
  try {
    await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "logo" TEXT`, args: [] })
  } catch {
    // Column already exists — safe to ignore
  }
}

// GET /api/company-branding — public endpoint for login page
// Returns company name and logo (no auth required)
export async function GET() {
  try {
    if (isTurso()) {
      await ensureLogoColumn()
      const result = await turso.execute({
        sql: `SELECT "name", "logo", "tagline" FROM "Company" WHERE "active" = 1 LIMIT 1`,
        args: [],
      })
      if (result.rows.length > 0) {
        const row = result.rows[0]
        return NextResponse.json({
          name: row.name as string,
          logo: (row.logo as string) || null,
          tagline: (row.tagline as string) || null,
        })
      }
      return NextResponse.json({ name: null, logo: null, tagline: null })
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const company = await db.company.findFirst({
      where: { active: true },
      select: { name: true, logo: true, tagline: true },
    })
    if (company) {
      return NextResponse.json({
        name: company.name,
        logo: company.logo || null,
        tagline: company.tagline || null,
      })
    }
    return NextResponse.json({ name: null, logo: null, tagline: null })
  } catch (error) {
    console.error('GET /api/company-branding error:', error)
    return NextResponse.json({ name: null, logo: null, tagline: null })
  }
}
