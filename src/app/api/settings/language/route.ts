import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isLanguageCode } from '@/lib/i18n'

/**
 * GET /api/settings/language
 * -------------------------
 * Returns the active company's persisted UI language. Any authenticated
 * user may read this — the top bar language selector and the Settings page
 * both call it on mount.
 */
export async function GET() {
  try {
    const company = await db.company.findFirst({
      where: { active: true },
      select: { id: true, name: true, language: true, currency: true, country: true, city: true },
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
        language: company.language,
        currency: company.currency,
        country: company.country,
        city: company.city,
      },
    })
  } catch (error) {
    console.error('GET /api/settings/language error:', error)
    return NextResponse.json(
      { error: 'Failed to load company language' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/language
 * ---------------------------
 * Updates the active company's `language` field. Body: { language: "en"|"fr" }.
 *
 * RBAC: same as currency — SUPER_ADMIN, PHARMACIST, or anyone with the
 * settings:edit permission may change it. Other roles receive 403.
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
        { error: 'Insufficient permissions to change language' },
        { status: 403 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { language } = body as { language?: unknown }

    if (!isLanguageCode(language)) {
      return NextResponse.json(
        { error: 'Invalid language code. Must be one of: en, fr.' },
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
      data: { language },
      select: {
        id: true,
        name: true,
        language: true,
        currency: true,
        country: true,
        city: true,
      },
    })

    return NextResponse.json({
      message: 'Language updated successfully',
      company: updated,
    })
  } catch (error) {
    console.error('PATCH /api/settings/language error:', error)
    return NextResponse.json(
      { error: 'Failed to update language' },
      { status: 500 }
    )
  }
}
