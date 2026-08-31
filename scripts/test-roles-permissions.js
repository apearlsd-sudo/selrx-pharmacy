// End-to-end test of the new role & permission system.
// Verifies:
//   1. Login as Edem (SUPER_ADMIN) returns ALL_PERMISSION_KEYS
//   2. Login as meda (CLERK) returns only CLERK's role permissions
//   3. Edem can list/create/edit/delete roles
//   4. meda (no roles:manage) gets 403 on POST /api/roles
//   5. System role cannot be deleted
//   6. Custom role CRUD works
//   7. Users tab requires users:manage permission

const BASE = 'http://localhost:3000'

async function main() {
  // ── Step 1: Login as Edem (SUPER_ADMIN) ─────────────────────────────
  console.log('\n=== Step 1: Login as Edem (SUPER_ADMIN) ===')
  const edemLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'edem@gmail.com', password: 'Admin123' }),
  })
  const edemData = await edemLogin.json()
  if (!edemLogin.ok) throw new Error('Edem login failed: ' + JSON.stringify(edemData))
  console.log(`✓ Edem logged in. Role: ${edemData.user.role}, Permissions: ${edemData.user.permissions.length}`)
  console.log(`  roleName: ${edemData.user.roleName}, roleColor: ${edemData.user.roleColor}`)
  if (edemData.user.permissions.length < 20) {
    throw new Error(`Expected 22 perms for SUPER_ADMIN, got ${edemData.user.permissions.length}`)
  }
  if (!edemData.user.permissions.includes('roles:manage')) {
    throw new Error('SUPER_ADMIN should have roles:manage')
  }
  console.log('✓ SUPER_ADMIN has all permissions including roles:manage')

  // ── Step 2: Login as meda (CLERK) ───────────────────────────────────
  console.log('\n=== Step 2: Login as meda (CLERK) ===')
  const medaLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'meda@gmail.com', password: 'meda123' }),
  })
  const medaData = await medaLogin.json()
  if (!medaLogin.ok) throw new Error('meda login failed: ' + JSON.stringify(medaData))
  console.log(`✓ meda logged in. Role: ${medaData.user.role}, Permissions: ${medaData.user.permissions.length}`)
  console.log(`  permissions: ${medaData.user.permissions.join(', ')}`)
  if (medaData.user.permissions.includes('roles:manage')) {
    throw new Error('CLERK should NOT have roles:manage')
  }
  if (medaData.user.permissions.includes('users:manage')) {
    throw new Error('CLERK should NOT have users:manage')
  }
  if (medaData.user.permissions.includes('inventory:view')) {
    throw new Error('CLERK should NOT have inventory:view')
  }
  if (!medaData.user.permissions.includes('dashboard:view')) {
    throw new Error('CLERK should have dashboard:view')
  }
  console.log('✓ CLERK has correct restricted permission set')

  // ── Step 3: Edem can list roles ─────────────────────────────────────
  console.log('\n=== Step 3: GET /api/roles as Edem ===')
  const rolesRes = await fetch(`${BASE}/api/roles`, {
    headers: {
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
  })
  const roles = await rolesRes.json()
  if (!rolesRes.ok) throw new Error('List roles failed: ' + JSON.stringify(roles))
  console.log(`✓ Listed ${roles.length} roles:`)
  for (const r of roles) {
    console.log(`   - ${r.name.padEnd(15)} | ${r.displayName.padEnd(22)} | ${r.permissions.length} perms | users=${r.userCount} | system=${r.isSystem}`)
  }

  // ── Step 4: meda (no roles:manage) is blocked from POST /api/roles ─
  console.log('\n=== Step 4: meda attempts POST /api/roles (expect 403) ===')
  const medaCreateRes = await fetch(`${BASE}/api/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': medaData.user.id,
      'x-user-role': medaData.user.role,
      'x-user-permissions': medaData.user.permissions.join(','),
    },
    body: JSON.stringify({ name: 'HACKER_ROLE', displayName: 'Hacker', permissions: ['roles:manage'] }),
  })
  const medaCreateData = await medaCreateRes.json()
  console.log(`  Status: ${medaCreateRes.status}`)
  if (medaCreateRes.status !== 403) {
    throw new Error(`Expected 403 for non-permitted role create, got ${medaCreateRes.status}`)
  }
  console.log('✓ meda correctly blocked: ' + medaCreateData.error)

  // ── Step 5: Edem tries to delete a SYSTEM role (expect 400) ─────────
  console.log('\n=== Step 5: Delete SUPER_ADMIN system role (expect 400) ===')
  const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN')
  const delSysRes = await fetch(`${BASE}/api/roles/${superAdminRole.id}`, {
    method: 'DELETE',
    headers: {
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
  })
  const delSysData = await delSysRes.json()
  console.log(`  Status: ${delSysRes.status}`)
  if (delSysRes.status !== 400) {
    throw new Error(`Expected 400 for system role delete, got ${delSysRes.status}`)
  }
  console.log('✓ System role protected: ' + delSysData.error)

  // ── Step 6: Create a custom role ────────────────────────────────────
  console.log('\n=== Step 6: Create custom role "SHIFT_LEAD" ===')
  const createRes = await fetch(`${BASE}/api/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
    body: JSON.stringify({
      name: 'SHIFT_LEAD',
      displayName: 'Shift Lead',
      description: 'Leads a shift. POS + inventory + basic returns.',
      color: 'teal',
      permissions: ['dashboard:view', 'pos:use', 'inventory:view', 'returns:view', 'returns:process'],
      isDefault: false,
    }),
  })
  const newRole = await createRes.json()
  if (!createRes.ok) throw new Error('Create role failed: ' + JSON.stringify(newRole))
  console.log(`✓ Created role: id=${newRole.id}, name=${newRole.name}, perms=${newRole.permissions.length}`)
  const customRoleId = newRole.id

  // ── Step 7: Try to create same role name again (expect 409) ─────────
  console.log('\n=== Step 7: Duplicate role name (expect 409) ===')
  const dupRes = await fetch(`${BASE}/api/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
    body: JSON.stringify({
      name: 'SHIFT_LEAD',
      displayName: 'Another Shift Lead',
      permissions: [],
    }),
  })
  console.log(`  Status: ${dupRes.status}`)
  if (dupRes.status !== 409) {
    throw new Error(`Expected 409 for duplicate role name, got ${dupRes.status}`)
  }
  console.log('✓ Duplicate name rejected')

  // ── Step 8: Try to create role with system name (expect 409) ────────
  console.log('\n=== Step 8: Use reserved system role name (expect 409) ===')
  const sysNameRes = await fetch(`${BASE}/api/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
    body: JSON.stringify({
      name: 'PHARMACIST',
      displayName: 'Fake Pharmacist',
      permissions: [],
    }),
  })
  console.log(`  Status: ${sysNameRes.status}`)
  if (sysNameRes.status !== 409) {
    throw new Error(`Expected 409 for reserved name, got ${sysNameRes.status}`)
  }
  console.log('✓ Reserved system name rejected')

  // ── Step 9: Edit the custom role ────────────────────────────────────
  console.log('\n=== Step 9: Edit SHIFT_LEAD role — add customers:edit ===')
  const editRes = await fetch(`${BASE}/api/roles/${customRoleId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
    body: JSON.stringify({
      permissions: ['dashboard:view', 'pos:use', 'inventory:view', 'returns:view', 'returns:process', 'customers:view', 'customers:edit'],
    }),
  })
  const edited = await editRes.json()
  if (!editRes.ok) throw new Error('Edit role failed: ' + JSON.stringify(edited))
  if (edited.permissions.length !== 7) {
    throw new Error(`Expected 7 perms after edit, got ${edited.permissions.length}`)
  }
  console.log(`✓ Role now has ${edited.permissions.length} permissions`)

  // ── Step 10: Delete the custom role (no users assigned → should work) ─
  console.log('\n=== Step 10: Delete SHIFT_LEAD role ===')
  const delRes = await fetch(`${BASE}/api/roles/${customRoleId}`, {
    method: 'DELETE',
    headers: {
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
  })
  const delData = await delRes.json()
  if (!delRes.ok) throw new Error('Delete role failed: ' + JSON.stringify(delData))
  console.log('✓ ' + delData.message)

  // ── Step 11: meda tries to list users (expect 403) ──────────────────
  console.log('\n=== Step 11: meda attempts GET /api/users (expect 403) ===')
  const medaUsersRes = await fetch(`${BASE}/api/users`, {
    headers: {
      'x-user-id': medaData.user.id,
      'x-user-role': medaData.user.role,
      'x-user-permissions': medaData.user.permissions.join(','),
    },
  })
  console.log(`  Status: ${medaUsersRes.status}`)
  if (medaUsersRes.status !== 403) {
    throw new Error(`Expected 403 for meda listing users, got ${medaUsersRes.status}`)
  }
  console.log('✓ meda correctly blocked from listing users')

  // ── Step 12: Edem lists users ───────────────────────────────────────
  console.log('\n=== Step 12: GET /api/users as Edem ===')
  const usersRes = await fetch(`${BASE}/api/users`, {
    headers: {
      'x-user-id': edemData.user.id,
      'x-user-role': edemData.user.role,
      'x-user-permissions': edemData.user.permissions.join(','),
    },
  })
  const users = await usersRes.json()
  if (!usersRes.ok) throw new Error('List users failed: ' + JSON.stringify(users))
  console.log(`✓ Listed ${users.length} users:`)
  for (const u of users) {
    console.log(`   - ${u.name.padEnd(8)} | ${u.role.padEnd(12)} | ${u.roleName} | rolePerms=${u.rolePermissions?.length || 0}`)
  }

  console.log('\n=== ✅ All tests passed ===')
}

main().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message)
  process.exit(1)
})
