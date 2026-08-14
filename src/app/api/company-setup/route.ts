import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, generateId } from '@/lib/turso'
import { hashPassword } from '@/lib/security'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// GET /api/company-setup — check if a company has been set up
export async function GET() {
  try {
    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---
      const result = await turso.execute({
        sql: `SELECT "id", "name", "slug", "logo", "tagline", "businessType", "currency", "phone", "email", "address", "city", "state", "country", "postalCode", "timezone", "registrationNo", "pharmacyLicense", "website", "settings" FROM "Company" WHERE "active" = 1 LIMIT 1`,
        args: [],
      })

      if (result.rows.length > 0) {
        const row = result.rows[0]
        const settings = (row.settings as string) ? JSON.parse(row.settings as string) : {}
        return NextResponse.json({
          isSetup: true,
          company: {
            id: row.id as string,
            name: row.name as string,
            slug: row.slug as string,
            logo: (row.logo as string) || null,
            tagline: (row.tagline as string) || null,
            businessType: row.businessType as string,
            currency: row.currency as string,
            phone: (row.phone as string) || null,
            email: (row.email as string) || null,
            address: (row.address as string) || null,
            city: (row.city as string) || null,
            state: (row.state as string) || null,
            country: (row.country as string) || null,
            postalCode: (row.postalCode as string) || null,
            timezone: (row.timezone as string) || null,
            registrationNo: (row.registrationNo as string) || null,
            pharmacyLicense: (row.pharmacyLicense as string) || null,
            website: (row.website as string) || null,
            taxRate: (settings.taxRate as number) || null,
            defaultPaymentMethod: (settings.defaultPaymentMethod as string) || null,
            settings,
          },
        })
      }

      return NextResponse.json({ isSetup: false, company: null })
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const company = await db.company.findFirst({
        where: { active: true },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          tagline: true,
          businessType: true,
          currency: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          state: true,
          country: true,
          postalCode: true,
          timezone: true,
          registrationNo: true,
          pharmacyLicense: true,
          website: true,
          settings: true,
        },
      })

      if (company) {
        const settings = company.settings ? JSON.parse(company.settings) : {}
        return NextResponse.json({
          isSetup: true,
          company: {
            ...company,
            taxRate: (settings.taxRate as number) || null,
            defaultPaymentMethod: (settings.defaultPaymentMethod as string) || null,
            settings,
          },
        })
      }

      return NextResponse.json({ isSetup: false, company: null })
    }
  } catch (error) {
    console.error('GET /api/company-setup error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to check company status', detail: msg },
      { status: 500 }
    )
  }
}

// PUT /api/company-setup — edit company settings after initial setup
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      tagline,
      phone,
      email,
      website,
      address,
      city,
      state,
      country,
      postalCode,
      currency,
      timezone,
      registrationNo,
      pharmacyLicense,
      businessType,
      ownerName,
      taxRate,
      defaultPaymentMethod,
    } = body

    // Map of allowed company fields → their column names (most are quoted)
    const FIELD_MAP: Record<string, string> = {
      name: '"name"',
      tagline: '"tagline"',
      phone: '"phone"',
      email: '"email"',
      website: '"website"',
      address: '"address"',
      city: '"city"',
      state: '"state"',
      country: '"country"',
      postalCode: '"postalCode"',
      currency: '"currency"',
      timezone: '"timezone"',
      registrationNo: '"registrationNo"',
      pharmacyLicense: '"pharmacyLicense"',
      businessType: '"businessType"',
      ownerName: '"ownerName"',
    }

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---

      // Check if a company exists
      const existing = await turso.execute({
        sql: `SELECT "id" FROM "Company" WHERE "active" = 1 LIMIT 1`,
        args: [],
      })
      if (existing.rows.length === 0) {
        return NextResponse.json(
          { error: 'No company found. Please complete the initial setup first.' },
          { status: 404 }
        )
      }
      const companyId = existing.rows[0].id as string

      // Get current settings JSON from the company
      const currentRow = await turso.execute({
        sql: `SELECT "settings" FROM "Company" WHERE "id" = ?`,
        args: [companyId],
      })
      let currentSettings: Record<string, unknown> = {}
      if (currentRow.rows.length > 0 && currentRow.rows[0].settings) {
        try {
          currentSettings = JSON.parse(currentRow.rows[0].settings as string)
        } catch {
          currentSettings = {}
        }
      }

      // Build dynamic UPDATE for standard fields
      const updateFields: string[] = []
      const updateArgs: (string | number | null)[] = []

      for (const [field, col] of Object.entries(FIELD_MAP)) {
        const value = (body as Record<string, unknown>)[field]
        if (value !== undefined) {
          updateFields.push(`${col} = ?`)
          updateArgs.push(value || null)
        }
      }

      // Handle taxRate and defaultPaymentMethod via settings JSON
      let settingsChanged = false
      if (taxRate !== undefined) {
        currentSettings.taxRate = taxRate
        settingsChanged = true
      }
      if (defaultPaymentMethod !== undefined) {
        currentSettings.defaultPaymentMethod = defaultPaymentMethod
        settingsChanged = true
      }
      if (settingsChanged) {
        updateFields.push('"settings" = ?')
        updateArgs.push(JSON.stringify(currentSettings))
      }

      if (updateFields.length === 0) {
        return NextResponse.json(
          { error: 'No fields to update' },
          { status: 400 }
        )
      }

      // Always update updatedAt
      updateFields.push('"updatedAt" = ?')
      updateArgs.push(new Date().toISOString())

      updateArgs.push(companyId) // WHERE "id" = ?

      await turso.execute({
        sql: `UPDATE "Company" SET ${updateFields.join(', ')} WHERE "id" = ?`,
        args: updateArgs,
      })

      // Fetch and return the updated company
      const result = await turso.execute({
        sql: `SELECT "id", "name", "slug", "logo", "tagline", "businessType", "currency", "phone", "email", "address", "city", "state", "country", "postalCode", "timezone", "registrationNo", "pharmacyLicense", "website", "ownerName", "settings" FROM "Company" WHERE "id" = ?`,
        args: [companyId],
      })

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Company not found after update' }, { status: 404 })
      }

      const row = result.rows[0]
      const updatedSettings = (row.settings as string) ? JSON.parse(row.settings as string) : {}

      const company = {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        logo: (row.logo as string) || null,
        tagline: (row.tagline as string) || null,
        businessType: row.businessType as string,
        currency: row.currency as string,
        phone: (row.phone as string) || null,
        email: (row.email as string) || null,
        address: (row.address as string) || null,
        city: (row.city as string) || null,
        state: (row.state as string) || null,
        country: (row.country as string) || null,
        postalCode: (row.postalCode as string) || null,
        timezone: (row.timezone as string) || null,
        registrationNo: (row.registrationNo as string) || null,
        pharmacyLicense: (row.pharmacyLicense as string) || null,
        website: (row.website as string) || null,
        ownerName: (row.ownerName as string) || null,
        taxRate: (updatedSettings.taxRate as number) || null,
        defaultPaymentMethod: (updatedSettings.defaultPaymentMethod as string) || null,
        settings: updatedSettings,
      }

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId: aUid, action: 'COMPANY_UPDATED', category: 'company', entity: 'Company', entityId: companyId, details: { name }, ipAddress, userAgent })

      return NextResponse.json(company)
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      const existing = await db.company.findFirst({
        where: { active: true },
      })
      if (!existing) {
        return NextResponse.json(
          { error: 'No company found. Please complete the initial setup first.' },
          { status: 404 }
        )
      }

      // Parse current settings
      let currentSettings: Record<string, unknown> = {}
      if (existing.settings) {
        try { currentSettings = JSON.parse(existing.settings) } catch { currentSettings = {} }
      }

      // Update settings fields
      if (taxRate !== undefined) currentSettings.taxRate = taxRate
      if (defaultPaymentMethod !== undefined) currentSettings.defaultPaymentMethod = defaultPaymentMethod

      const company = await db.company.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined && { name }),
          ...(tagline !== undefined && { tagline: tagline || null }),
          ...(phone !== undefined && { phone: phone || null }),
          ...(email !== undefined && { email: email || null }),
          ...(website !== undefined && { website: website || null }),
          ...(address !== undefined && { address: address || null }),
          ...(city !== undefined && { city: city || null }),
          ...(state !== undefined && { state: state || null }),
          ...(country !== undefined && { country: country || null }),
          ...(postalCode !== undefined && { postalCode: postalCode || null }),
          ...(currency !== undefined && { currency }),
          ...(timezone !== undefined && { timezone }),
          ...(registrationNo !== undefined && { registrationNo: registrationNo || null }),
          ...(pharmacyLicense !== undefined && { pharmacyLicense: pharmacyLicense || null }),
          ...(businessType !== undefined && { businessType }),
          ...(ownerName !== undefined && { ownerName: ownerName || null }),
          settings: JSON.stringify(currentSettings),
        },
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId: aUid2, action: 'COMPANY_UPDATED', category: 'company', entity: 'Company', entityId: company.id, details: { name }, ipAddress, userAgent })

      const settings = company.settings ? JSON.parse(company.settings) : {}
      return NextResponse.json({
        ...company,
        taxRate: (settings.taxRate as number) || null,
        defaultPaymentMethod: (settings.defaultPaymentMethod as string) || null,
        settings,
      })
    }
  } catch (error) {
    console.error('PUT /api/company-setup error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to update company', detail: msg },
      { status: 500 }
    )
  }
}

// POST /api/company-setup — create company + owner user account
// Requires a SETUP_TOKEN to prevent unauthorized initial account creation
export async function POST(req: NextRequest) {
  try {
    // Verify setup token — prevents unauthorized account creation
    const setupToken = process.env.SETUP_TOKEN
    if (setupToken) {
      const body = await req.clone().json().catch(() => ({}))
      const providedToken = (body as Record<string, unknown>).setupToken
      if (providedToken !== setupToken) {
        return NextResponse.json(
          { error: 'Invalid or missing setup token' },
          { status: 403 }
        )
      }
    } // If no SETUP_TOKEN env var is set, allow setup (first-run convenience)

    const body = await req.json()

    const {
      // Company fields
      companyName,
      tagline,
      businessType,
      registrationNo,
      pharmacyLicense,
      taxId,
      phone,
      email: companyEmail,
      website,
      address,
      city,
      state,
      country,
      postalCode,
      currency,
      timezone,
      // Owner / Account fields
      ownerName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
    } = body

    // Validation
    if (!companyName || !ownerName || !ownerPassword) {
      return NextResponse.json(
        { error: 'Company name, owner name, and password are required' },
        { status: 400 }
      )
    }

    // Generate a fallback email if not provided (used as username/login)
    const effectiveEmail = ownerEmail || `${ownerName.toLowerCase().replace(/\s+/g, '.')}@local`

    // Hash the password with bcrypt before storing
    const hashedPassword = await hashPassword(ownerPassword)

    if (isTurso()) {
      // --- Raw SQL path (Turso / libsql) ---

      // Check if a company already exists
      const existingCompany = await turso.execute({
        sql: `SELECT 1 FROM "Company" LIMIT 1`,
        args: [],
      })
      if (existingCompany.rows.length > 0) {
        return NextResponse.json(
          { error: 'A company has already been set up. Please contact the administrator.' },
          { status: 409 }
        )
      }

      // Check if owner email is already taken
      const existingUser = await turso.execute({
        sql: `SELECT 1 FROM "User" WHERE "email" = ? LIMIT 1`,
        args: [effectiveEmail],
      })
      if (existingUser.rows.length > 0) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }

      // Generate slug from company name
      const slug =
        companyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36)

      const now = new Date().toISOString()

      // Create the owner user (SUPER_ADMIN)
      const ownerId = generateId()
      await turso.execute({
        sql: `INSERT INTO "User" ("id", "email", "password", "name", "role", "phone", "active", "permissions", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, 'SUPER_ADMIN', ?, 1, ?, ?, ?)`,
        args: [
          ownerId,
          effectiveEmail,
          hashedPassword,
          ownerName,
          ownerPhone || null,
          JSON.stringify([
            'dashboard', 'pos', 'inventory', 'prescriptions',
            'customers', 'users', 'hardware', 'reports',
          ]),
          now,
          now,
        ],
      })

      // Create the company linked to the owner
      const companyId = generateId()
      const initialSettings = JSON.stringify({})
      await turso.execute({
        sql: `INSERT INTO "Company" ("id", "name", "slug", "tagline", "logo", "businessType", "registrationNo", "pharmacyLicense", "taxId", "phone", "email", "website", "address", "city", "state", "country", "postalCode", "currency", "timezone", "active", "ownerName", "ownerId", "settings", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        args: [
          companyId,
          companyName,
          slug,
          tagline || null,
          null, // logo
          businessType || 'Pharmacy',
          registrationNo || null,
          pharmacyLicense || null,
          taxId || null,
          phone || null,
          companyEmail || effectiveEmail,
          website || null,
          address || null,
          city || null,
          state || null,
          country || null,
          postalCode || null,
          currency || 'USD',
          timezone || 'Africa/Lagos',
          ownerName,
          ownerId,
          initialSettings,
          now,
          now,
        ],
      })

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId: aUid, action: 'COMPANY_SETUP_COMPLETED', category: 'company', details: { companyName }, ipAddress, userAgent })
      return NextResponse.json(
        {
          message: 'Company created successfully!',
          company: {
            id: companyId,
            name: companyName,
            slug,
            businessType: businessType || 'Pharmacy',
            currency: currency || 'USD',
          },
          owner: {
            id: ownerId,
            name: ownerName,
            email: effectiveEmail,
            role: 'SUPER_ADMIN',
          },
        },
        { status: 201 }
      )
    } else {
      // --- Prisma fallback (local dev) ---
      const { db } = await import('@/lib/db')

      // Check if a company already exists
      const existingCompany = await db.company.findFirst()
      if (existingCompany) {
        return NextResponse.json(
          { error: 'A company has already been set up. Please contact the administrator.' },
          { status: 409 }
        )
      }

      // Check if owner email is already taken
      const existingUser = await db.user.findUnique({ where: { email: effectiveEmail } })
      if (existingUser) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }

      // Generate slug from company name
      const slug =
        companyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36)

      // Create company + owner user in a transaction
      const result = await db.$transaction(async (tx) => {
        // Create the owner user first (SUPER_ADMIN)
        const ownerUser = await tx.user.create({
          data: {
            name: ownerName,
            email: effectiveEmail,
            password: hashedPassword,
            phone: ownerPhone || null,
            role: 'SUPER_ADMIN',
            active: true,
            permissions: JSON.stringify([
              'dashboard', 'pos', 'inventory', 'prescriptions',
              'customers', 'users', 'hardware', 'reports',
            ]),
          },
        })

        // Create the company linked to the owner
        const company = await tx.company.create({
          data: {
            name: companyName,
            slug,
            tagline: tagline || null,
            logo: null,
            businessType: businessType || 'Pharmacy',
            registrationNo: registrationNo || null,
            pharmacyLicense: pharmacyLicense || null,
            taxId: taxId || null,
            phone: phone || null,
            email: companyEmail || effectiveEmail,
            website: website || null,
            address: address || null,
            city: city || null,
            state: state || null,
            country: country || null,
            postalCode: postalCode || null,
            currency: currency || 'USD',
            timezone: timezone || 'Africa/Lagos',
            active: true,
            ownerName: ownerName,
            ownerId: ownerUser.id,
            settings: JSON.stringify({}),
          },
        })

        return { company, owner: ownerUser }
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(req)
      await writeAuditLog({ userId: aUid2, action: 'COMPANY_SETUP_COMPLETED', category: 'company', details: { companyName }, ipAddress, userAgent })
      return NextResponse.json(
        {
          message: 'Company created successfully!',
          company: {
            id: result.company.id,
            name: result.company.name,
            slug: result.company.slug,
            businessType: result.company.businessType,
            currency: result.company.currency,
          },
          owner: {
            id: result.owner.id,
            name: result.owner.name,
            email: effectiveEmail,
            role: result.owner.role,
          },
        },
        { status: 201 }
      )
    }
  } catch (error) {
    console.error('POST /api/company-setup error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Failed to create company', detail: msg },
      { status: 500 }
    )
  }
}
