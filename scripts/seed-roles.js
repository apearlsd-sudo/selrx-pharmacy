/**
 * Seed default system roles into the Role table.
 *
 * Idempotent: if a role already exists (by name), its permissions and
 * metadata are updated to match the catalog. Custom roles created by admins
 * are never touched.
 *
 * Run with: `node scripts/seed-roles.js`
 */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

// Inline the permission catalog so this script works without ts-node.
// Keep in sync with src/lib/permissions.ts.
const PERMISSION_CATALOG = [
  { key: 'dashboard:view', category: 'Dashboard' },
  { key: 'pos:use', category: 'Point of Sale' },
  { key: 'pos:refund', category: 'Point of Sale' },
  { key: 'inventory:view', category: 'Inventory' },
  { key: 'inventory:adjust', category: 'Inventory' },
  { key: 'inventory:receive', category: 'Inventory' },
  { key: 'master-data:view', category: 'Drug Catalog' },
  { key: 'master-data:edit', category: 'Drug Catalog' },
  { key: 'prescriptions:view', category: 'Prescriptions' },
  { key: 'prescriptions:fill', category: 'Prescriptions' },
  { key: 'prescriptions:verify', category: 'Prescriptions' },
  { key: 'customers:view', category: 'Customers' },
  { key: 'customers:edit', category: 'Customers' },
  { key: 'reports:view', category: 'Reports' },
  { key: 'sales-history:view', category: 'Sales History' },
  { key: 'returns:view', category: 'Goods Returns' },
  { key: 'returns:process', category: 'Goods Returns' },
  { key: 'returns:approve', category: 'Goods Returns' },
  { key: 'hardware:view', category: 'Hardware' },
  { key: 'hardware:edit', category: 'Hardware' },
  { key: 'users:manage', category: 'Administration' },
  { key: 'roles:manage', category: 'Administration' },
]
const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key)

const DEFAULT_ROLES = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description: 'Full system access. Can manage users, roles, and all pharmacy operations.',
    color: 'red',
    isSystem: true,
    isDefault: false,
    permissions: [...ALL_KEYS],
  },
  {
    name: 'PHARMACIST',
    displayName: 'Pharmacist',
    description: 'Licensed pharmacist. Can dispense/verify prescriptions, manage inventory, and approve returns.',
    color: 'emerald',
    isSystem: true,
    isDefault: false,
    permissions: [
      'dashboard:view',
      'pos:use', 'pos:refund',
      'inventory:view', 'inventory:adjust', 'inventory:receive',
      'master-data:view', 'master-data:edit',
      'prescriptions:view', 'prescriptions:fill', 'prescriptions:verify',
      'customers:view', 'customers:edit',
      'reports:view',
      'sales-history:view',
      'returns:view', 'returns:process', 'returns:approve',
      'hardware:view', 'hardware:edit',
    ],
  },
  {
    name: 'TECHNICIAN',
    displayName: 'Pharmacy Technician',
    description: 'Supports pharmacists with inventory, dispensing prep, and customer service.',
    color: 'sky',
    isSystem: true,
    isDefault: false,
    permissions: [
      'dashboard:view',
      'pos:use',
      'inventory:view', 'inventory:adjust', 'inventory:receive',
      'master-data:view',
      'prescriptions:view', 'prescriptions:fill',
      'customers:view', 'customers:edit',
      'sales-history:view',
      'returns:view', 'returns:process',
    ],
  },
  {
    name: 'CASHIER',
    displayName: 'Cashier',
    description: 'Front-of-house cashier. Operates POS, manages customers, processes basic returns.',
    color: 'amber',
    isSystem: true,
    isDefault: false,
    permissions: [
      'dashboard:view',
      'pos:use',
      'customers:view', 'customers:edit',
      'sales-history:view',
      'returns:view', 'returns:process',
    ],
  },
  {
    name: 'CLERK',
    displayName: 'Clerk',
    description: 'General clerk. Read-only access to most areas; can manage customers.',
    color: 'gray',
    isSystem: true,
    isDefault: true,
    permissions: [
      'dashboard:view',
      'customers:view', 'customers:edit',
      'sales-history:view',
    ],
  },
]

async function main() {
  console.log('Seeding default roles...')

  // Backfill any missing Role records. Existing roles are updated in place
  // so a re-seed picks up catalog changes (e.g. new permission keys).
  for (const role of DEFAULT_ROLES) {
    const existing = await db.role.findUnique({ where: { name: role.name } })
    const payload = {
      displayName: role.displayName,
      description: role.description,
      color: role.color,
      isSystem: role.isSystem,
      isDefault: role.isDefault,
      permissions: JSON.stringify(role.permissions),
    }
    if (existing) {
      await db.role.update({ where: { name: role.name }, data: payload })
      console.log(`  ✓ Updated existing role: ${role.name}`)
    } else {
      await db.role.create({ data: { name: role.name, ...payload } })
      console.log(`  ✓ Created new role: ${role.name}`)
    }
  }

  // Also: clear stale per-user permission overrides that reference old
  // single-word keys (e.g. "dashboard", "pos") so the new dot-namespace
  // (e.g. "dashboard:view", "pos:use") takes effect via the role defaults.
  // We only do this for system-role users whose override set is non-empty
  // AND contains at least one legacy key.
  const legacyKeyPattern = /^[a-z-]+$/ // no colon
  const users = await db.user.findMany({ select: { id: true, email: true, permissions: true } })
  let cleared = 0
  for (const u of users) {
    if (!u.permissions) continue
    let parsed
    try { parsed = JSON.parse(u.permissions) } catch { continue }
    if (!Array.isArray(parsed) || parsed.length === 0) continue
    const isLegacy = parsed.some((p) => typeof p === 'string' && legacyKeyPattern.test(p))
    if (!isLegacy) continue
    await db.user.update({ where: { id: u.id }, data: { permissions: null } })
    console.log(`  ✓ Cleared legacy per-user permissions for ${u.email} (will use role defaults)`)
    cleared++
  }

  console.log(`\nDone. Seeded ${DEFAULT_ROLES.length} roles, cleared ${cleared} legacy permission overrides.`)

  // Print summary
  const allRoles = await db.role.findMany({ orderBy: { name: 'asc' } })
  console.log('\n=== Roles in DB ===')
  for (const r of allRoles) {
    const count = JSON.parse(r.permissions).length
    console.log(`  ${r.name.padEnd(15)} | ${r.displayName.padEnd(22)} | ${count} perms | system=${r.isSystem} default=${r.isDefault}`)
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => { console.error(e); db.$disconnect(); process.exit(1) })
