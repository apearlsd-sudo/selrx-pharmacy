import { NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// GET /api/company-branding — public endpoint for login page
// Returns company name and logo (no auth required)
export async function GET() {
  try {
    if (isTurso()) {
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
