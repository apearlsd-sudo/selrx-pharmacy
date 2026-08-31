import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isCurrencyCode } from '@/lib/currency'

/**
 * GET /api/settings/currency
 * --------------------------
 * Returns the active company's persisted currency code plus the full
 * CURRENCIES catalog (so the client can render the picker without a
 * separate fetch). Any authenticated user can read this — the top bar
 * currency selector and the Settings page both call it on mount.
 */
export async function GET() {
  try {
    const company = await db.company.findFirst({
      where: { active: true },
      select: { id: true, name: true, currency: true, country: true, city: true },
    })
    if (!company) {
      return NextResponse.json(
        { error: 'No active company configured' },
        { status: 404 }
      )
    }
    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        currency: company.currency,
        country: company.country,
        city: company.city,
      },
    })
  } catch (error) {
    console.error('GET /api/settings/currency error:', error)
    return NextResponse.json(
      { error: 'Failed to load company currency' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/currency
 * ----------------------------
 * Updates the active company's `currency` field. Body: { currency: "GHS"|"NGN"|... }.
 *
 * RBAC: only SUPER_ADMIN and PHARMACIST may change the company-wide currency.
 * Other roles receive 403. The settings:edit permission is the formal grant,
 * but we also accept the older role-name check so the existing top-bar
 * quick switch keeps working for pharmacists who haven't been re-granted
 * the new permission key yet.
 */
export async function PATCH(req: NextRequest) {
  try {
    const role = req.headers.get('x-user-role')
    const permsHeader = req.headers.get('x-user-permissions') || ''
    const perms = permsHeader
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    const hasSettingsEdit =
      role === 'SUPER_ADMIN' ||
      role === 'PHARMACIST' ||
      perms.includes('settings:edit')

    if (!hasSettingsEdit) {
      return NextResponse.json(
        { error: 'Insufficient permissions to change currency' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { currency } = body as { currency?: unknown }

    if (!isCurrencyCode(currency)) {
      return NextResponse.json(
        {
          error:
            'Invalid currency code. Must be one of GHS, NGN, XOF, GNF, LRD, SLL, GMD, MRU, CVE.',
        },
        { status: 400 }
      )
    }

    const company = await db.company.findFirst({ where: { active: true } })
    if (!company) {
      return NextResponse.json(
        { error: 'No active company configured' },
        { status: 404 }
      )
    }

    const updated = await db.company.update({
      where: { id: company.id },
      data: { currency },
      select: {
        id: true,
        name: true,
        currency: true,
        country: true,
        city: true,
      },
    })

    return NextResponse.json({
      message: 'Currency updated successfully',
      company: updated,
    })
  } catch (error) {
    console.error('PATCH /api/settings/currency error:', error)
    return NextResponse.json(
      { error: 'Failed to update currency' },
      { status: 500 }
    )
  }
}
