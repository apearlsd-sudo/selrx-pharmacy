#!/usr/bin/env node
/**
 * Smoke test for /api/settings/language
 *
 * Verifies:
 *   1. GET returns the active company with a `language` field
 *   2. PATCH { language: 'fr' } persists and returns the updated row
 *   3. Follow-up GET reflects the change
 *   4. PATCH with invalid code ('es', 'xyz') → 400
 *   5. PATCH as CLERK → 403
 *   6. Restores the original language
 *   7. Home page still 200
 */
const BASE = 'http://localhost:3000'

const SUPER_ADMIN = {
  'x-user-id': 'cms1im8ad0002sla8v62k3n5o',
  'x-user-role': 'SUPER_ADMIN',
  'x-user-permissions': 'settings:edit',
}

const CLERK = {
  'x-user-id': 'clerk-test',
  'x-user-role': 'CLERK',
  'x-user-permissions': '',
}

async function json(path, init = {}) {
  const res = await fetch(BASE + path, init)
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

function assert(cond, msg) {
  if (cond) {
    console.log('  ✓ ' + msg)
  } else {
    console.error('  ✗ ' + msg)
    process.exitCode = 1
  }
}

async function main() {
  console.log('\n=== /api/settings/language smoke test ===\n')

  // 1. GET
  console.log('[1] GET /api/settings/language (SUPER_ADMIN)')
  let r = await json('/api/settings/language', { headers: SUPER_ADMIN })
  assert(r.status === 200, `returns 200 (got ${r.status})`)
  assert(r.body?.company?.language === 'en' || r.body?.company?.language === 'fr',
    `company.language is en|fr (got ${r.body?.company?.language})`)
  const original = r.body?.company?.language
  console.log(`      company=${r.body?.company?.name}, language=${original}`)

  // 2. PATCH to fr
  console.log('\n[2] PATCH /api/settings/language { language: "fr" }')
  r = await json('/api/settings/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...SUPER_ADMIN },
    body: JSON.stringify({ language: 'fr' }),
  })
  assert(r.status === 200, `returns 200 (got ${r.status})`)
  assert(r.body?.company?.language === 'fr',
    `response.company.language === 'fr' (got ${r.body?.company?.language})`)

  // 3. Follow-up GET
  console.log('\n[3] GET /api/settings/language (verify persistence)')
  r = await json('/api/settings/language', { headers: SUPER_ADMIN })
  assert(r.status === 200, `returns 200 (got ${r.status})`)
  assert(r.body?.company?.language === 'fr',
    `company.language persisted as 'fr' (got ${r.body?.company?.language})`)

  // 4a. Invalid code: 'es'
  console.log('\n[4a] PATCH { language: "es" } (invalid)')
  r = await json('/api/settings/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...SUPER_ADMIN },
    body: JSON.stringify({ language: 'es' }),
  })
  assert(r.status === 400, `returns 400 for unsupported code (got ${r.status})`)

  // 4b. Invalid code: 'xyz'
  console.log('\n[4b] PATCH { language: "xyz_fake" } (invalid)')
  r = await json('/api/settings/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...SUPER_ADMIN },
    body: JSON.stringify({ language: 'xyz_fake' }),
  })
  assert(r.status === 400, `returns 400 for fake code (got ${r.status})`)

  // 5. CLERK cannot change language
  console.log('\n[5] PATCH as CLERK (should be denied)')
  r = await json('/api/settings/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...CLERK },
    body: JSON.stringify({ language: 'en' }),
  })
  assert(r.status === 403, `returns 403 for CLERK (got ${r.status})`)

  // 6. Restore original
  console.log(`\n[6] Restore original language (${original})`)
  r = await json('/api/settings/language', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...SUPER_ADMIN },
    body: JSON.stringify({ language: original }),
  })
  assert(r.status === 200, `returns 200 (got ${r.status})`)
  assert(r.body?.company?.language === original,
    `language restored to '${original}' (got ${r.body?.company?.language})`)

  // 7. Home page still 200
  console.log('\n[7] Home page')
  const home = await fetch(BASE + '/')
  assert(home.status === 200, `home page returns 200 (got ${home.status})`)

  console.log('\n=== Done ===\n')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
