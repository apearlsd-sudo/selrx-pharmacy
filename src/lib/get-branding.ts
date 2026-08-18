import { turso, isTurso } from './turso'

export interface CompanyBranding {
  name: string | null
  logo: string | null
  tagline: string | null
}

const EMPTY_BRANDING: CompanyBranding = { name: null, logo: null, tagline: null }

/**
 * Server-only function to fetch company branding directly from the database.
 * Used by the login page server component to avoid a client-side fetch delay.
 */
export async function getCompanyBranding(): Promise<CompanyBranding> {
  try {
    if (isTurso()) {
      // Ensure columns exist (self-healing for older databases)
      try {
        await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "logo" TEXT`, args: [] })
      } catch { /* column exists */ }
      try {
        await turso.execute({ sql: `ALTER TABLE "Company" ADD COLUMN "tagline" TEXT`, args: [] })
      } catch { /* column exists */ }

      const result = await turso.execute({
        sql: `SELECT "name", "logo", "tagline" FROM "Company" WHERE "active" = 1 LIMIT 1`,
        args: [],
      })
      if (result.rows.length > 0) {
        const row = result.rows[0]
        return {
          name: (row.name as string) || null,
          logo: (row.logo as string) || null,
          tagline: (row.tagline as string) || null,
        }
      }
      return EMPTY_BRANDING
    }

    // Prisma fallback (local dev)
    const { db } = await import('./db')
    const company = await db.company.findFirst({
      where: { active: true },
      select: { name: true, logo: true, tagline: true },
    })
    if (company) {
      return {
        name: company.name || null,
        logo: company.logo || null,
        tagline: company.tagline || null,
      }
    }
    return EMPTY_BRANDING
  } catch {
    return EMPTY_BRANDING
  }
}
