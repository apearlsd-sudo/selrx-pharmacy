import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId, tursoExecute, tursoBatch, safeArgs, toObjs } from '@/lib/turso'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionSeverity = 'contraindicated' | 'critical' | 'severe' | 'moderate' | 'mild'
export type InteractionCategory = 'drug-drug' | 'drug-disease' | 'drug-allergy' | 'duplicate-therapy' | 'drug-food'

export interface DrugInteractionRecord {
  id: string
  drug1: string
  drug2: string
  severity: InteractionSeverity
  category: InteractionCategory
  description: string
  mechanism: string
  management: string
  onset: string
  evidence: string
  source: string
  isCustom: number
  isActive: number
  createdAt: string
  updatedAt: string
}

const VALID_SEVERITIES: InteractionSeverity[] = ['contraindicated', 'critical', 'severe', 'moderate', 'mild']
const VALID_CATEGORIES: InteractionCategory[] = ['drug-drug', 'drug-disease', 'drug-allergy', 'duplicate-therapy', 'drug-food']

function toInteractionRecord(obj: Record<string, unknown>): DrugInteractionRecord {
  return {
    id: obj.id as string,
    drug1: obj.drug1 as string,
    drug2: obj.drug2 as string,
    severity: obj.severity as InteractionSeverity,
    category: obj.category as InteractionCategory,
    description: obj.description as string,
    mechanism: obj.mechanism as string,
    management: obj.management as string,
    onset: obj.onset as string,
    evidence: obj.evidence as string,
    source: obj.source as string,
    isCustom: Number(obj.isCustom || 0),
    isActive: Number(obj.isActive ?? 1),
    createdAt: obj.createdAt as string,
    updatedAt: obj.updatedAt as string,
  }
}

// ---------------------------------------------------------------------------
// Ensure table exists (self-healing)
// ---------------------------------------------------------------------------

async function ensureTable() {
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS "DrugInteraction" (
      "id"         TEXT NOT NULL PRIMARY KEY,
      "drug1"      TEXT NOT NULL,
      "drug2"      TEXT NOT NULL,
      "severity"   TEXT NOT NULL DEFAULT 'moderate',
      "category"   TEXT NOT NULL DEFAULT 'drug-drug',
      "description" TEXT NOT NULL DEFAULT '',
      "mechanism"  TEXT NOT NULL DEFAULT '',
      "management" TEXT NOT NULL DEFAULT '',
      "onset"      TEXT NOT NULL DEFAULT '',
      "evidence"   TEXT NOT NULL DEFAULT 'established',
      "source"     TEXT NOT NULL DEFAULT 'SelRx Database',
      "isCustom"  INTEGER NOT NULL DEFAULT 0,
      "isActive"   INTEGER NOT NULL DEFAULT 1,
      "createdAt"  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "DI_drug1_idx" ON "DrugInteraction"("drug1")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "DI_drug2_idx" ON "DrugInteraction"("drug2")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "DI_severity_idx" ON "DrugInteraction"("severity")`) } catch { /* */ }
  try { await turso.execute(`CREATE INDEX IF NOT EXISTS "DI_active_idx" ON "DrugInteraction"("isActive")`) } catch { /* */ }
}

// ---------------------------------------------------------------------------
// GET /api/drug-interactions — list all interactions (with filtering)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const severity = searchParams.get('severity') || ''
    const category = searchParams.get('category') || ''
    const customOnly = searchParams.get('custom') === '1'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const action = searchParams.get('action')

    // ── Check action: cart items ──
    if (action === 'check') {
      return handleCheck(request)
    }

    if (isTurso()) {
      try { await ensureTable() } catch { /* non-fatal */ }

      const conditions: string[] = [`"isActive" = 1`]
      const args: any[] = []

      if (search) {
        conditions.push(`("drug1" LIKE ? OR "drug2" LIKE ? OR "description" LIKE ?)`)
        const pattern = `%${search}%`
        args.push(pattern, pattern, pattern)
      }
      if (severity && VALID_SEVERITIES.includes(severity as InteractionSeverity)) {
        conditions.push(`"severity" = ?`)
        args.push(severity)
      }
      if (category && VALID_CATEGORIES.includes(category as InteractionCategory)) {
        conditions.push(`"category" = ?`)
        args.push(category)
      }
      if (customOnly) {
        conditions.push(`"isCustom" = 1`)
      }

      const whereClause = 'WHERE ' + conditions.join(' AND ')

      // Count
      const countResult = await tursoExecute({
        sql: `SELECT COUNT(*) as cnt FROM "DrugInteraction" ${whereClause}`,
        args: safeArgs(args),
      })
      const total = Number(toObjs(countResult)[0]?.cnt || 0)

      // Paginate
      const offset = (page - 1) * limit
      const result = await tursoExecute({
        sql: `SELECT * FROM "DrugInteraction" ${whereClause}
              ORDER BY CASE "severity"
                WHEN 'contraindicated' THEN 1
                WHEN 'critical' THEN 2
                WHEN 'severe' THEN 3
                WHEN 'moderate' THEN 4
                WHEN 'mild' THEN 5
                ELSE 6
              END, "drug1", "drug2"
              LIMIT ? OFFSET ?`,
        args: safeArgs([...args, limit, offset]),
      })

      return NextResponse.json({
        interactions: toObjs(result).map(toInteractionRecord),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      })
    }

    // Prisma fallback — no interaction for non-Turso
    return NextResponse.json({ interactions: [], pagination: { page, limit, total: 0, pages: 0 } })
  } catch (error) {
    console.error('Error fetching drug interactions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to fetch drug interactions', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/drug-interactions — create new interaction
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'check') {
      return handleCheck(request)
    }
    if (action === 'seed') {
      return handleSeed()
    }

    const body = await request.json()
    const { drug1, drug2, severity, category, description, mechanism, management, onset, evidence, source } = body

    if (!drug1 || !drug2) {
      return NextResponse.json({ error: 'drug1 and drug2 are required' }, { status: 400 })
    }
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 })
    }

    if (isTurso()) {
      try { await ensureTable() } catch { /* non-fatal */ }

      // Check for duplicate
      const dupResult = await tursoExecute({
        sql: `SELECT id FROM "DrugInteraction" WHERE (
          ("drug1" = ? AND "drug2" = ?) OR ("drug1" = ? AND "drug2" = ?)
        ) AND "isActive" = 1 LIMIT 1`,
        args: [drug1.toLowerCase().trim(), drug2.toLowerCase().trim(), drug2.toLowerCase().trim(), drug1.toLowerCase().trim()],
      })
      if (dupResult.rows.length > 0) {
        return NextResponse.json({ error: 'This interaction pair already exists' }, { status: 409 })
      }

      const id = generateId()
      const now = new Date().toISOString()
      await tursoExecute({
        sql: `INSERT INTO "DrugInteraction" (id, "drug1", "drug2", "severity", "category", "description", "mechanism", "management", "onset", "evidence", "source", "isCustom", "isActive", "createdAt", "updatedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        args: [id, drug1.toLowerCase().trim(), drug2.toLowerCase().trim(), severity || 'moderate', category || 'drug-drug',
          description || '', mechanism || '', management || '', onset || '', evidence || 'established', source || 'Custom', now, now],
      })

      return NextResponse.json({ id, drug1, drug2, severity, category, isCustom: 1 }, { status: 201 })
    }

    return NextResponse.json({ error: 'Drug interactions require cloud database' }, { status: 400 })
  } catch (error) {
    console.error('Error creating drug interaction:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to create drug interaction', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PUT /api/drug-interactions — update interaction
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...fields } = body

    if (!id) {
      return NextResponse.json({ error: 'Interaction id is required' }, { status: 400 })
    }

    if (isTurso()) {
      const sets: string[] = ['"updatedAt" = ?']
      const args: any[] = [new Date().toISOString()]

      const allowedFields = ['drug1', 'drug2', 'severity', 'category', 'description', 'mechanism', 'management', 'onset', 'evidence', 'isActive']
      for (const field of allowedFields) {
        if (fields[field] !== undefined) {
          sets.push(`"${field}" = ?`)
          args.push(field === 'isActive' ? (fields[field] ? 1 : 0) : fields[field])
        }
      }

      if (sets.length === 1) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
      }

      args.push(id)
      await tursoExecute({
        sql: `UPDATE "DrugInteraction" SET ${sets.join(', ')} WHERE id = ?`,
        args: safeArgs(args),
      })

      return NextResponse.json({ success: true, id })
    }

    return NextResponse.json({ error: 'Drug interactions require cloud database' }, { status: 400 })
  } catch (error) {
    console.error('Error updating drug interaction:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to update drug interaction', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/drug-interactions?id=... — soft-delete interaction
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Interaction id is required' }, { status: 400 })
    }

    if (isTurso()) {
      await tursoExecute({
        sql: `UPDATE "DrugInteraction" SET "isActive" = 0, "updatedAt" = ? WHERE id = ?`,
        args: [new Date().toISOString(), id],
      })
      return NextResponse.json({ success: true, id })
    }

    return NextResponse.json({ error: 'Drug interactions require cloud database' }, { status: 400 })
  } catch (error) {
    console.error('Error deleting drug interaction:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to delete drug interaction', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Check handler: action=check
// ---------------------------------------------------------------------------

async function handleCheck(request: NextRequest) {
  try {
    const body = await request.json()
    const { drugs, allergies, patientAge, patientGender } = body as {
      drugs: Array<{ id: string; name: string; genericName?: string }>
      allergies?: string[]
      patientAge?: number
      patientGender?: string
    }

    if (!drugs || drugs.length < 2) {
      return NextResponse.json({ interactions: [], allergyAlerts: [], duplicates: [] })
    }

    const drugNames = drugs.map(d => (d.genericName || d.name).toLowerCase().trim()).filter(Boolean)

    const interactions: DrugInteractionRecord[] = []
    const allergyAlerts: Array<{ drug: string; allergen: string }> = []
    const duplicates: Array<{ drugClass: string; drugs: string[] }> = []

    // ── DB-backed drug-drug interaction check ──
    if (isTurso()) {
      try { await ensureTable() } catch { /* non-fatal */ }

      for (let i = 0; i < drugNames.length; i++) {
        for (let j = i + 1; j < drugNames.length; j++) {
          const a = drugNames[i]
          const b = drugNames[j]

          const result = await tursoExecute({
            sql: `SELECT * FROM "DrugInteraction"
                  WHERE "isActive" = 1
                    AND (("drug1" LIKE ? AND "drug2" LIKE ?) OR ("drug1" LIKE ? AND "drug2" LIKE ?))`,
            args: [`%${a}%`, `%${b}%`, `%${b}%`, `%${a}%`],
          })

          for (const row of toObjs(result)) {
            const d1 = row.drug1 as string
            const d2 = row.drug2 as string
            const aMatchesD1 = a.includes(d1) || d1.includes(a)
            const aMatchesD2 = a.includes(d2) || d2.includes(a)
            const bMatchesD1 = b.includes(d1) || d1.includes(b)
            const bMatchesD2 = b.includes(d2) || d2.includes(b)

            if ((aMatchesD1 && bMatchesD2) || (aMatchesD2 && bMatchesD1)) {
              interactions.push(toInteractionRecord(row))
            }
          }
        }
      }
    }

    // ── Allergy cross-check ──
    if (allergies && allergies.length > 0) {
      const allergyLower = allergies.map(a => a.toLowerCase().trim()).filter(Boolean)
      const drugClassPatterns: Record<string, string[]> = {
        penicillin: ['amoxicillin', 'ampicillin', 'benzylpenicillin', 'phenoxymethylpenicillin', 'flucloxacillin', 'amoxicillin-clavulanate', 'co-amoxiclav'],
        sulfa: ['sulfamethoxazole', 'co-trimoxazole', 'sulfasalazine', 'sulfadiazine'],
        cephalosporin: ['ceftriaxone', 'cefalexin', 'cefixime', 'cefuroxime', 'cefadroxil'],
        nsaids: ['ibuprofen', 'diclofenac', 'naproxen', 'mefenamic acid', 'piroxicam', 'celecoxib'],
        codeine: ['codeine', 'codeine phosphate', 'co-codamol', 'dihydrocodeine'],
      }

      const seen = new Set<string>()
      for (const drugName of drugNames) {
        // Direct allergy match
        for (const allergen of allergyLower) {
          if (drugName.includes(allergen) || allergen.includes(drugName)) {
            const key = `${drugName}:${allergen}`
            if (!seen.has(key)) { seen.add(key); allergyAlerts.push({ drug: drugName, allergen }) }
          }
        }
        // Class-level allergy check
        for (const [allergenClass, classDrugs] of Object.entries(drugClassPatterns)) {
          if (allergyLower.some(a => a.includes(allergenClass))) {
            for (const classDrug of classDrugs) {
              if (drugName.includes(classDrug) || classDrug.includes(drugName)) {
                const key = `${drugName}:${allergenClass}`
                if (!seen.has(key)) { seen.add(key); allergyAlerts.push({ drug: drugName, allergen: allergenClass }) }
              }
            }
          }
        }
      }
    }

    // ── Duplicate therapy detection ──
    const duplicateClasses: Record<string, string[]> = {
      'NSAIDs': ['ibuprofen', 'diclofenac', 'naproxen', 'mefenamic acid', 'piroxicam', 'celecoxib', 'aspirin', 'ketoprofen'],
      'PPIs': ['omeprazole', 'esomeprazole', 'pantoprazole', 'lansoprazole', 'rabeprazole'],
      'Statins': ['simvastatin', 'atorvastatin', 'rosuvastatin', 'pravastatin', 'fluvastatin'],
      'ACE Inhibitors': ['enalapril', 'lisinopril', 'ramipril', 'captopril', 'perindopril', 'benazepril'],
      'ARBs': ['losartan', 'valsartan', 'candesartan', 'irbesartan', 'telmisartan'],
      'Beta Blockers': ['atenolol', 'propranolol', 'metoprolol', 'bisoprolol', 'carvedilol', 'nebivolol'],
      'Sulfonylureas': ['glibenclamide', 'glimepiride', 'gliclazide', 'tolbutamide', 'glipizide'],
      'Fluoroquinolones': ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin'],
    }

    for (const [drugClass, classDrugs] of Object.entries(duplicateClasses)) {
      const matchedDrugs: string[] = []
      for (const drugName of drugNames) {
        for (const classDrug of classDrugs) {
          if (drugName.includes(classDrug) || classDrug.includes(drugName)) {
            if (!matchedDrugs.includes(drugName)) matchedDrugs.push(drugName)
          }
        }
      }
      if (matchedDrugs.length >= 2) {
        duplicates.push({ drugClass, drugs: matchedDrugs })
      }
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { contraindicated: 0, critical: 1, severe: 2, moderate: 3, mild: 4 }
    interactions.sort((a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5))

    return NextResponse.json({ interactions, allergyAlerts, duplicates })
  } catch (error) {
    console.error('Error checking drug interactions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Interaction check failed', detail: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Seed handler: action=seed
// ---------------------------------------------------------------------------

async function handleSeed() {
  try {
    if (!isTurso()) {
      return NextResponse.json({ error: 'Seeding requires Turso database' }, { status: 400 })
    }

    await ensureTable()

    // Check if already seeded
    const countResult = await tursoExecute({ sql: `SELECT COUNT(*) as cnt FROM "DrugInteraction"` })
    const existingCount = Number(toObjs(countResult)[0]?.cnt || 0)
    if (existingCount > 0) {
      return NextResponse.json({ message: `Already has ${existingCount} interactions. Skipping seed.`, seeded: 0 })
    }

    const { seedInteractions } = await import('@/lib/drug-interaction-seed')
    const data = seedInteractions()
    const now = new Date().toISOString()

    const stmts = data.map((item) => ({
      sql: `INSERT INTO "DrugInteraction" (id, "drug1", "drug2", "severity", "category", "description", "mechanism", "management", "onset", "evidence", "source")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      args: [generateId(), item.drug1, item.drug2, item.severity, item.category, item.description, item.mechanism, item.management, item.onset, item.evidence, item.source, now, now],
    }))

    await tursoBatch(stmts)
    return NextResponse.json({ message: `Seeded ${data.length} drug interactions`, seeded: data.length })
  } catch (error) {
    console.error('Error seeding drug interactions:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Seed failed', detail: msg }, { status: 500 })
  }
}
