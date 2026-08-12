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
        sql: `SELECT "id", "name", "slug", "logo", "tagline", "businessType", "currency", "phone", "email", "address", "city", "state", "country", "postalCode", "timezone", "registrationNo", "pharmacyLicense", "website" FROM "Company" WHERE "active" = 1 LIMIT 1`,
        args: [],
      })

      if (result.rows.length > 0) {
        const row = result.rows[0]
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
        },
      })

      if (company) {
        return NextResponse.json({ isSetup: true, company })
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
    if (!companyName || !ownerName || !ownerEmail || !ownerPassword) {
      return NextResponse.json(
        { error: 'Company name, owner name, email, and password are required' },
        { status: 400 }
      )
    }

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
        args: [ownerEmail],
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
          ownerEmail,
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
      await turso.execute({
        sql: `INSERT INTO "Company" ("id", "name", "slug", "tagline", "logo", "businessType", "registrationNo", "pharmacyLicense", "taxId", "phone", "email", "website", "address", "city", "state", "country", "postalCode", "currency", "timezone", "active", "ownerName", "ownerId", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
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
          companyEmail || ownerEmail,
          website || null,
          address || null,
          city || null,
          state || null,
          country || null,
          postalCode || null,
          currency || 'USD',
          timezone || 'UTC',
          ownerName,
          ownerId,
          now,
          now,
        ],
      })

      const { userId: aUid, ipAddress, userAgent } = getRequestContext(req)
      writeAuditLog({ userId: aUid, action: 'COMPANY_SETUP_COMPLETED', category: 'company', details: { companyName }, ipAddress, userAgent })
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
            email: ownerEmail,
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
      const existingUser = await db.user.findUnique({ where: { email: ownerEmail } })
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
            email: ownerEmail,
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
            email: companyEmail || ownerEmail,
            website: website || null,
            address: address || null,
            city: city || null,
            state: state || null,
            country: country || null,
            postalCode: postalCode || null,
            currency: currency || 'USD',
            timezone: timezone || 'UTC',
            active: true,
            ownerName: ownerName,
            ownerId: ownerUser.id,
          },
        })

        return { company, owner: ownerUser }
      })

      const { userId: aUid2, ipAddress, userAgent } = getRequestContext(req)
      writeAuditLog({ userId: aUid2, action: 'COMPANY_SETUP_COMPLETED', category: 'company', details: { companyName }, ipAddress, userAgent })
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
            email: result.owner.email,
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
