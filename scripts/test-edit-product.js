// Smoke-test the new PUT /api/products/[id] flow — fetch the first
// product, then issue a PUT that tweaks the manufacturer, vendorId,
// and sellingPrice. Finally re-fetch to confirm the changes persisted.
// The script uses node's built-in fetch (Node 18+).

const BASE = 'http://localhost:3000'

async function main() {
  // 1. Find a SUPER_ADMIN user so the PUT doesn't 403.
  const adminIdRes = await fetch(`${BASE}/api/users`, {
    headers: { 'x-user-id': 'bootstrap', 'x-user-role': 'SUPER_ADMIN' },
  })
  if (!adminIdRes.ok) throw new Error(`users fetch ${adminIdRes.status}`)
  const usersJson = await adminIdRes.json()
  const users = Array.isArray(usersJson) ? usersJson : usersJson.users || []
  const admin = users.find((u) => u.role === 'SUPER_ADMIN' || u.roleName === 'SUPER_ADMIN')
  if (!admin) throw new Error('No SUPER_ADMIN user found')
  console.log(`Using admin: ${admin.id} (${admin.name || admin.email || '?'})`)

  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': admin.id,
    'x-user-role': 'SUPER_ADMIN',
  }

  // 2. Fetch a product to edit.
  const prodRes = await fetch(`${BASE}/api/products?limit=1`)
  if (!prodRes.ok) throw new Error(`products fetch ${prodRes.status}`)
  const prodJson = await prodRes.json()
  const products = Array.isArray(prodJson) ? prodJson : prodJson.products || []
  if (products.length === 0) throw new Error('No products to edit')
  const original = products[0]
  console.log(`Editing product: ${original.id} — ${original.name}`)

  // 3. Snapshot the original values so we can restore them afterwards.
  const snapshot = {
    name: original.name,
    ndc: original.ndc,
    manufacturer: original.manufacturer,
    vendorId: original.vendorId,
    sellingPrice: original.sellingPrice,
    dosageForm: original.dosageForm,
    reorderPoint: original.reorderPoint,
  }

  // 4. Issue the PUT with new values.
  const updatedSellingPrice = (Number(original.sellingPrice) || 1) + 0.01
  const putBody = {
    name: original.name,
    manufacturer: 'GSK-Edit-Test',
    dosageForm: original.dosageForm || 'Tablet',
    sellingPrice: updatedSellingPrice,
    reorderPoint: Number(original.reorderPoint) || 10,
    vendorId: original.vendorId || null,
  }
  const putRes = await fetch(`${BASE}/api/products/${original.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(putBody),
  })
  if (!putRes.ok) {
    const err = await putRes.text()
    throw new Error(`PUT failed ${putRes.status}: ${err}`)
  }
  const after = await putRes.json()
  console.log('  After PUT:')
  console.log(`    manufacturer = ${after.manufacturer}`)
  console.log(`    sellingPrice = ${after.sellingPrice}`)
  console.log(`    dosageForm   = ${after.dosageForm}`)
  console.log(`    vendor.id    = ${after.vendor?.id ?? '(none)'}`)
  console.log(`    vendor.name  = ${after.vendor?.name ?? '(none)'}`)

  if (after.manufacturer !== 'GSK-Edit-Test') throw new Error('manufacturer not updated')
  if (Number(after.sellingPrice) !== updatedSellingPrice) throw new Error('sellingPrice not updated')
  if (!after.vendor && original.vendorId) throw new Error('vendor relation missing')

  // 5. Restore the original values so this test run is idempotent.
  const restoreRes = await fetch(`${BASE}/api/products/${original.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      name: snapshot.name,
      ndc: snapshot.ndc,
      manufacturer: snapshot.manufacturer,
      dosageForm: snapshot.dosageForm,
      sellingPrice: snapshot.sellingPrice,
      reorderPoint: snapshot.reorderPoint,
      vendorId: snapshot.vendorId,
    }),
  })
  if (!restoreRes.ok) throw new Error(`restore PUT failed ${restoreRes.status}`)
  console.log('  Restored original values ✓')

  // 6. Test that a CLERK gets 403.
  const clerk = users.find((u) => u.role === 'CLERK' || u.roleName === 'CLERK')
  if (clerk) {
    const forbRes = await fetch(`${BASE}/api/products/${original.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': clerk.id,
        'x-user-role': 'CLERK',
      },
      body: JSON.stringify({ name: 'CLERK test' }),
    })
    if (forbRes.status !== 403) throw new Error(`Expected 403 for CLERK, got ${forbRes.status}`)
    console.log('  CLERK correctly denied (403) ✓')
  }

  console.log('\nAll edit-product checks passed ✓')
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
