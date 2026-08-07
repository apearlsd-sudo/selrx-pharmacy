import { NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'

/**
 * POST /api/setup/ensure-dosage-forms
 *
 * One-time setup: creates the DosageForm table if missing and seeds
 * common pharmacy dosage forms.
 *
 * Safe to call multiple times — skips already-existing forms.
 */

const COMMON_DOSAGE_FORMS = [
  'TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'CREAM', 'OINTMENT',
  'GEL', 'LOTION', 'DROPS', 'INJECTION', 'INHALER', 'SPRAY', 'PATCH',
  'SUPPOSITORY', 'POWDER', 'GRANULES', 'SOLUTION', 'EMULSION', 'FOAM',
  'LOZENGE', 'PASTILLE', 'SOFTGEL', 'FILM-COATED TABLET', 'CHEWABLE TABLET',
  'EFFERVESCENT TABLET', 'SUBLINGUAL TABLET', 'ENTERIC-COATED TABLET',
  'EXTENDED-RELEASE TABLET', 'BLISTER PACK', 'VIAL', 'AMPOULE', 'BOTTLE',
  'SACHET', 'STRIP', 'TUBE', 'PESSARY', 'NEBULISER SOLUTION',
  'EYE OINTMENT', 'EAR DROPS', 'NOSE SPRAY', 'ENEMA',
]

export async function POST() {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'This setup requires Turso database' }, { status: 400 })
    }

    const results: string[] = []
    const now = new Date().toISOString()

    // 1. Create DosageForm table if not exists
    await turso.execute(`
      CREATE TABLE IF NOT EXISTS "DosageForm" (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL UNIQUE,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
        "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    results.push('DosageForm table ensured')

    // 2. Seed common forms (skip duplicates)
    let created = 0
    let skipped = 0
    for (const name of COMMON_DOSAGE_FORMS) {
      const id = generateId()
      try {
        await turso.execute({
          sql: `INSERT INTO "DosageForm" (id, name, "isActive", "createdAt", "updatedAt") VALUES (?, ?, 1, ?, ?)`,
          args: [id, name, now, now],
        })
        created++
      } catch (e: any) {
        if (e?.message?.includes('UNIQUE constraint failed')) {
          skipped++
        } else {
          throw e
        }
      }
    }
    results.push(`Seeded: ${created} created, ${skipped} skipped`)

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('[ensure-dosage-forms] Failed:', error)
    return NextResponse.json({ error: 'Setup failed', details: String(error) }, { status: 500 })
  }
}
