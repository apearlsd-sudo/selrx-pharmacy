/**
 * Smoke test for the new "Change Currency" action in Settings.
 *
 * Verifies:
 *   1. GET /api/settings/currency returns the active company + persisted currency.
 *   2. PATCH /api/settings/currency with a valid West African code updates the DB
 *      and the response reflects the new code.
 *   3. PATCH with an invalid currency code is rejected with 400.
 *   4. PATCH with a CLERK role (no settings:edit) is rejected with 403.
 *   5. After the test, the original currency is restored.
 */
const BASE = 'http://localhost:3000'

async function json(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

function headers(role, perms = []) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': role === 'bootstrap' ? 'bootstrap' : 'smoke-test-' + role.toLowerCase(),
    'x-user-role': role,
    'x-user-permissions': perms.join(','),
  }
}

async function main() {
  console.log('=== Smoke test: Change Currency action ===\n')

  // 1. GET current currency (as bootstrap SUPER_ADMIN)
  const before = await json('/api/settings/currency', {
    headers: headers('SUPER_ADMIN', ['settings:view', 'settings:edit']),
  })
  if (before.status !== 200) {
    console.error('FAIL: GET /api/settings/currency returned', before.status, before.body)
    process.exit(1)
  }
  const originalCurrency = before.body.company?.currency
  const companyId = before.body.company?.id
  console.log(`✓ GET /api/settings/currency → 200`)
  console.log(`  Company: ${before.body.company.name} (${companyId})`)
  console.log(`  Current currency: ${originalCurrency}\n`)

  // 2. PATCH with a valid currency (NGN)
  const patchRes = await json('/api/settings/currency', {
    method: 'PATCH',
    headers: headers('SUPER_ADMIN', ['settings:view', 'settings:edit']),
    body: JSON.stringify({ currency: 'NGN' }),
  })
  if (patchRes.status !== 200) {
    console.error('FAIL: PATCH with NGN returned', patchRes.status, patchRes.body)
    process.exit(1)
  }
  if (patchRes.body.company?.currency !== 'NGN') {
    console.error('FAIL: response currency is not NGN:', patchRes.body.company?.currency)
    process.exit(1)
  }
  console.log(`✓ PATCH /api/settings/currency { currency: 'NGN' } → 200`)
  console.log(`  Response currency: ${patchRes.body.company.currency}\n`)

  // Verify by re-GETting
  const afterPatch = await json('/api/settings/currency', {
    headers: headers('SUPER_ADMIN', ['settings:view']),
  })
  if (afterPatch.body.company?.currency !== 'NGN') {
    console.error('FAIL: GET after PATCH did not reflect NGN:', afterPatch.body.company?.currency)
    process.exit(1)
  }
  console.log(`✓ GET after PATCH confirms persisted currency is NGN\n`)

  // 3. PATCH with an invalid currency code
  const invalidRes = await json('/api/settings/currency', {
    method: 'PATCH',
    headers: headers('SUPER_ADMIN', ['settings:view', 'settings:edit']),
    body: JSON.stringify({ currency: 'USD' }), // USD is no longer supported
  })
  if (invalidRes.status !== 400) {
    console.error('FAIL: invalid currency should return 400, got', invalidRes.status, invalidRes.body)
    process.exit(1)
  }
  console.log(`✓ PATCH with invalid code 'USD' → 400 (rejected)`)

  const invalidRes2 = await json('/api/settings/currency', {
    method: 'PATCH',
    headers: headers('SUPER_ADMIN', ['settings:view', 'settings:edit']),
    body: JSON.stringify({ currency: 'XYZ_FAKE' }),
  })
  if (invalidRes2.status !== 400) {
    console.error('FAIL: fake currency should return 400, got', invalidRes2.status)
    process.exit(1)
  }
  console.log(`✓ PATCH with fake code 'XYZ_FAKE' → 400 (rejected)\n`)

  // 4. PATCH as CLERK (no settings:edit permission) → 403
  const clerkRes = await json('/api/settings/currency', {
    method: 'PATCH',
    headers: headers('CLERK', ['dashboard:view', 'customers:view']),
    body: JSON.stringify({ currency: 'GHS' }),
  })
  if (clerkRes.status !== 403) {
    console.error('FAIL: CLERK should get 403, got', clerkRes.status, clerkRes.body)
    process.exit(1)
  }
  console.log(`✓ PATCH as CLERK (no settings:edit) → 403 (denied)\n`)

  // 5. Restore the original currency
  const restoreRes = await json('/api/settings/currency', {
    method: 'PATCH',
    headers: headers('SUPER_ADMIN', ['settings:view', 'settings:edit']),
    body: JSON.stringify({ currency: originalCurrency }),
  })
  if (restoreRes.status !== 200 || restoreRes.body.company?.currency !== originalCurrency) {
    console.error('FAIL: could not restore original currency', restoreRes.status, restoreRes.body)
    process.exit(1)
  }
  console.log(`✓ Restored original currency: ${originalCurrency}`)

  // Verify final state
  const finalCheck = await json('/api/settings/currency', {
    headers: headers('SUPER_ADMIN', ['settings:view']),
  })
  if (finalCheck.body.company?.currency !== originalCurrency) {
    console.error('FAIL: final GET does not match original currency:', finalCheck.body.company?.currency)
    process.exit(1)
  }
  console.log(`✓ Final GET confirms currency is back to ${originalCurrency}\n`)

  // 6. Home page should still serve
  const home = await fetch(BASE + '/')
  if (home.status !== 200) {
    console.error('FAIL: home page returned', home.status)
    process.exit(1)
  }
  console.log(`✓ Home page → 200`)

  console.log('\n=== All smoke tests passed ===')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
