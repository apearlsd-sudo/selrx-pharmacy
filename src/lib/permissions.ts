// Shared granular permission definitions used by both client and server

export const ALL_PERMISSION_KEYS = [
  // Dashboard
  'dashboard',
  // Point of Sale
  'pos:sell',
  'pos:refund',
  'pos:history',
  'pos:apply-discount',
  'pos:void-transaction',
  // Inventory
  'inventory:view',
  'inventory:manage',
  'inventory:analytics',
  'inventory:stocktake',
  'inventory:adjust-stock',
  'inventory:expiry-management',
  'inventory:receive-supply',
  'inventory:batches',
  'inventory:sell-as',
  // Drug Catalogue (Master Data)
  'master-data:view',
  'master-data:manage',
  'master-data:categories',
  'master-data:manufacturers',
  'master-data:suppliers',
  // Prescriptions
  'prescriptions:view',
  'prescriptions:process',
  'prescriptions:verify',
  'prescriptions:override-alerts',
  // Customers
  'customers:view',
  'customers:manage',
  'customers:insurance',
  // Users & Roles
  'users:view',
  'users:manage',
  'users:roles',
  'users:view-logs',
  // Financial
  'financial:view',
  'financial:reports',
  'financial:reconcile',
  'financial:approve-refund',
  // Hardware
  'hardware:view',
  'hardware:manage',
  // Reports
  'reports:view',
  'reports:export',
  // Settings
  'settings:view',
  'settings:company',
  'settings:receipt',
  'settings:backup',
  // Goods Returns
  'returns:view',
  'returns:process',
  // Shift Management
  'shifts:view',
  'shifts:manage',
  'shifts:reconcile',
  // Purchase Orders
  'po:view',
  'po:create',
  'po:approve',
  'po:receive',
  'po:delete',
  'po:cancel',
  // Login History
  'login-history:view',
  'login-history:export',
  // Drug Interactions
  'drug-interactions:view',
  'drug-interactions:manage',
  // Workstations
  'workstations:view',
  'workstations:manage',
  // Audit
  'audit:view',
  'audit:export',
] as const

export type PermissionKey = typeof ALL_PERMISSION_KEYS[number]

// ── Permission Categories with metadata ──
export const PERMISSION_CATEGORIES = [
  {
    category: 'Dashboard',
    permissions: [
      { key: 'dashboard', label: 'View Dashboard', description: 'View sales dashboard & KPIs' },
    ],
  },
  {
    category: 'Point of Sale',
    permissions: [
      { key: 'pos:sell', label: 'Process Sales', description: 'Create and complete sales transactions' },
      { key: 'pos:refund', label: 'Process Returns', description: 'Handle goods returns and refunds' },
      { key: 'pos:history', label: 'View Sales History', description: 'Access past transaction records' },
      { key: 'pos:apply-discount', label: 'Apply Discounts', description: 'Apply percentage or flat discounts at POS' },
      { key: 'pos:void-transaction', label: 'Void Transactions', description: 'Cancel and void completed transactions' },
    ],
  },
  {
    category: 'Inventory',
    permissions: [
      { key: 'inventory:view', label: 'View Inventory', description: 'Browse stock levels and product details' },
      { key: 'inventory:manage', label: 'Manage Products', description: 'Add, edit, and delete products' },
      { key: 'inventory:analytics', label: 'Product Analytics', description: 'View product sales analytics' },
      { key: 'inventory:stocktake', label: 'Stock Taking', description: 'Perform periodic stock counts' },
      { key: 'inventory:adjust-stock', label: 'Adjust Stock', description: 'Manually adjust stock quantities' },
      { key: 'inventory:expiry-management', label: 'Expiry Management', description: 'Manage drug expiry tracking and alerts' },
      { key: 'inventory:receive-supply', label: 'Receive Supply', description: 'Process incoming stock from suppliers' },
      { key: 'inventory:batches', label: 'Manage Batches', description: 'Create and manage stock batches / lot numbers' },
      { key: 'inventory:sell-as', label: 'Sell As (Sub-units)', description: 'Set selling unit and items-per-unit (strip, box, etc.)' },
    ],
  },
  {
    category: 'Drug Catalogue',
    permissions: [
      { key: 'master-data:view', label: 'View Drug Catalogue', description: 'Browse the master drug catalog' },
      { key: 'master-data:manage', label: 'Manage Drug Catalogue', description: 'Add, edit, and update drug records' },
      { key: 'master-data:categories', label: 'Manage Categories', description: 'Create and manage drug categories' },
      { key: 'master-data:manufacturers', label: 'Manage Manufacturers', description: 'Add and edit manufacturer records' },
      { key: 'master-data:suppliers', label: 'Manage Suppliers', description: 'Add and edit supplier/vendor records' },
    ],
  },
  {
    category: 'Prescriptions',
    permissions: [
      { key: 'prescriptions:view', label: 'View Prescriptions', description: 'Access and read prescription orders' },
      { key: 'prescriptions:process', label: 'Fill & Dispense Rx', description: 'Process and fill prescriptions' },
      { key: 'prescriptions:verify', label: 'Verify Prescriptions', description: 'Verify and approve dispensed prescriptions' },
      { key: 'prescriptions:override-alerts', label: 'Override Drug Alerts', description: 'Override allergy and interaction alerts' },
    ],
  },
  {
    category: 'Customers',
    permissions: [
      { key: 'customers:view', label: 'View Customers', description: 'Browse patient records and history' },
      { key: 'customers:manage', label: 'Manage Customers', description: 'Add, edit, and update patient info' },
      { key: 'customers:insurance', label: 'Manage Insurance', description: 'Process insurance claims and manage policies' },
    ],
  },
  {
    category: 'Users & Security',
    permissions: [
      { key: 'users:view', label: 'View Users', description: 'See the list of system users' },
      { key: 'users:manage', label: 'Manage Users', description: 'Create, edit, and deactivate users' },
      { key: 'users:roles', label: 'Manage Roles', description: 'Create and customize roles & privileges' },
      { key: 'users:view-logs', label: 'View User Logs', description: 'Access user activity and login logs' },
    ],
  },
  {
    category: 'Financial',
    permissions: [
      { key: 'financial:view', label: 'View Financials', description: 'Access cash flow and revenue summaries' },
      { key: 'financial:reports', label: 'Financial Reports', description: 'Generate P&L, balance sheet, and tax reports' },
      { key: 'financial:reconcile', label: 'Reconcile Cash', description: 'Perform cash register reconciliation' },
      { key: 'financial:approve-refund', label: 'Approve Refunds', description: 'Authorize high-value refund requests' },
    ],
  },
  {
    category: 'Hardware',
    permissions: [
      { key: 'hardware:view', label: 'View Hardware', description: 'View hardware device configuration' },
      { key: 'hardware:manage', label: 'Configure Hardware', description: 'Setup and configure devices & printers' },
    ],
  },
  {
    category: 'Reports',
    permissions: [
      { key: 'reports:view', label: 'View Reports', description: 'Access analytics and reports' },
      { key: 'reports:export', label: 'Export Data', description: 'Export reports to CSV and other formats' },
    ],
  },
  {
    category: 'Settings',
    permissions: [
      { key: 'settings:view', label: 'View Settings', description: 'View system configuration settings' },
      { key: 'settings:company', label: 'Edit Company Info', description: 'Modify company name, address, and contact info' },
      { key: 'settings:receipt', label: 'Receipt Settings', description: 'Configure receipt printing and format' },
      { key: 'settings:backup', label: 'Backup & Restore', description: 'Manage data backup and system restore' },
    ],
  },
  {
    category: 'Goods Returns',
    permissions: [
      { key: 'returns:view', label: 'View Returns', description: 'Access goods return history and records' },
      { key: 'returns:process', label: 'Process Returns', description: 'Create and process goods return requests' },
    ],
  },
  {
    category: 'Shift Management',
    permissions: [
      { key: 'shifts:view', label: 'View Shifts', description: 'View shift records and summaries' },
      { key: 'shifts:manage', label: 'Manage Shifts', description: 'Open, close, and handover shifts' },
      { key: 'shifts:reconcile', label: 'Shift Reconciliation', description: 'Reconcile shift cash and inventory variances' },
    ],
  },
  {
    category: 'Purchase Orders',
    permissions: [
      { key: 'po:view', label: 'View Purchase Orders', description: 'View all purchase orders and their status' },
      { key: 'po:create', label: 'Create Purchase Orders', description: 'Create new purchase orders for suppliers' },
      { key: 'po:approve', label: 'Approve Purchase Orders', description: 'Approve POs before sending to suppliers' },
      { key: 'po:receive', label: 'Receive Orders', description: 'Receive stock against purchase orders and add to inventory' },
      { key: 'po:delete', label: 'Delete Purchase Orders', description: 'Permanently delete draft or cancelled purchase orders' },
      { key: 'po:cancel', label: 'Cancel Purchase Orders', description: 'Cancel sent or in-progress purchase orders' },
    ],
  },
  {
    category: 'Login History',
    permissions: [
      { key: 'login-history:view', label: 'View Login History', description: 'See user login timestamps, IPs, and devices' },
      { key: 'login-history:export', label: 'Export Login History', description: 'Export login records for security review' },
    ],
  },
  {
    category: 'Drug Interactions',
    permissions: [
      { key: 'drug-interactions:view', label: 'View Drug Interactions', description: 'Check drug-drug and drug-food interaction alerts' },
      { key: 'drug-interactions:manage', label: 'Manage Interactions Database', description: 'Add, edit, and update interaction records' },
    ],
  },
  {
    category: 'Workstations',
    permissions: [
      { key: 'workstations:view', label: 'View Workstations', description: 'See registered workstation devices and status' },
      { key: 'workstations:manage', label: 'Manage Workstations', description: 'Register, edit, and deactivate workstations' },
    ],
  },
  {
    category: 'Audit & Compliance',
    permissions: [
      { key: 'audit:view', label: 'View Audit Log', description: 'View system audit trail and activity logs' },
      { key: 'audit:export', label: 'Export Audit Log', description: 'Export audit logs for compliance review' },
    ],
  },
] as const

// ── Privilege Tiers ──
export type PrivilegeTier = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LEVEL_4' | 'LEVEL_5'

export const PRIVILEGE_TIERS: Record<PrivilegeTier, { label: string; description: string; level: number }> = {
  LEVEL_1: { label: 'Basic Access', description: 'View-only access with no sensitive data', level: 1 },
  LEVEL_2: { label: 'Standard', description: 'Standard operational access with data entry', level: 2 },
  LEVEL_3: { label: 'Supervisor', description: 'Supervisory access with approval capabilities', level: 3 },
  LEVEL_4: { label: 'Manager', description: 'Management access with financial oversight', level: 4 },
  LEVEL_5: { label: 'Executive', description: 'Full system access including configuration', level: 5 },
}

// ── Default Role Definitions ──
// These serve as fallback when SystemRole is not found in DB
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS.slice(),

  PHARMACIST: [
    'dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'pos:apply-discount',
    'inventory:view', 'inventory:manage', 'inventory:analytics', 'inventory:stocktake', 'inventory:adjust-stock', 'inventory:expiry-management', 'inventory:batches', 'inventory:sell-as',
    'returns:view', 'returns:process',
    'shifts:view',
    'prescriptions:view', 'prescriptions:process', 'prescriptions:verify', 'prescriptions:override-alerts',
    'customers:view', 'customers:manage', 'customers:insurance',
    'master-data:view', 'master-data:manage', 'master-data:categories', 'master-data:manufacturers',
    'hardware:view', 'hardware:manage',
    'reports:view', 'reports:export',
    'settings:view', 'settings:receipt',
    'po:view', 'po:create', 'po:receive',
    'drug-interactions:view', 'drug-interactions:manage',
    'workstations:view',
    'login-history:view',
  ],

  PHARMACY_TECHNICIAN: [
    'dashboard', 'pos:sell', 'pos:history',
    'inventory:view', 'inventory:manage', 'inventory:stocktake', 'inventory:receive-supply', 'inventory:batches',
    'returns:view',
    'shifts:view',
    'prescriptions:view', 'prescriptions:process',
    'customers:view', 'customers:manage',
    'master-data:view',
    'reports:view',
    'po:view', 'po:receive',
    'drug-interactions:view',
  ],

  DISPENSER: [
    'dashboard', 'pos:sell', 'pos:history',
    'inventory:view', 'inventory:stocktake', 'inventory:expiry-management', 'inventory:batches',
    'returns:view',
    'shifts:view',
    'prescriptions:view', 'prescriptions:process',
    'customers:view', 'customers:manage',
    'master-data:view',
  ],

  CASHIER: [
    'dashboard', 'pos:sell', 'pos:refund', 'pos:history',
    'inventory:view',
    'returns:view',
    'shifts:view',
    'customers:view', 'customers:manage',
  ],

  CLERK: [
    'dashboard',
    'customers:view',
  ],

  STORE_MANAGER: [
    'dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'pos:apply-discount', 'pos:void-transaction',
    'inventory:view', 'inventory:manage', 'inventory:analytics', 'inventory:stocktake', 'inventory:adjust-stock', 'inventory:expiry-management', 'inventory:receive-supply', 'inventory:batches', 'inventory:sell-as',
    'returns:view', 'returns:process',
    'shifts:view', 'shifts:manage', 'shifts:reconcile',
    'prescriptions:view',
    'customers:view', 'customers:manage', 'customers:insurance',
    'users:view',
    'financial:view', 'financial:reports', 'financial:reconcile', 'financial:approve-refund',
    'master-data:view', 'master-data:manage', 'master-data:categories', 'master-data:manufacturers', 'master-data:suppliers',
    'reports:view', 'reports:export',
    'settings:view', 'settings:receipt',
    'po:view', 'po:create', 'po:approve', 'po:receive', 'po:delete', 'po:cancel',
    'workstations:view', 'workstations:manage',
    'drug-interactions:view',
    'login-history:view',
    'audit:view',
  ],

  SHIFT_SUPERVISOR: [
    'dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'pos:apply-discount',
    'inventory:view', 'inventory:manage', 'inventory:stocktake', 'inventory:adjust-stock', 'inventory:receive-supply', 'inventory:batches',
    'returns:view', 'returns:process',
    'shifts:view', 'shifts:manage', 'shifts:reconcile',
    'prescriptions:view', 'prescriptions:process',
    'customers:view', 'customers:manage',
    'users:view',
    'financial:view', 'financial:reconcile',
    'master-data:view',
    'reports:view',
    'settings:view', 'settings:receipt',
    'po:view', 'po:create', 'po:receive',
    'workstations:view',
    'drug-interactions:view',
    'login-history:view',
  ],

  ACCOUNTANT: [
    'dashboard',
    'pos:history',
    'inventory:view', 'inventory:analytics',
    'returns:view',
    'shifts:view', 'shifts:reconcile',
    'customers:view',
    'financial:view', 'financial:reports', 'financial:reconcile',
    'reports:view', 'reports:export',
    'po:view',
    'audit:view', 'audit:export',
    'login-history:view', 'login-history:export',
    'settings:view',
  ],

  RECEPTIONIST: [
    'dashboard',
    'returns:view',
    'shifts:view',
    'customers:view', 'customers:manage', 'customers:insurance',
    'prescriptions:view',
  ],

  LAB_TECHNICIAN: [
    'dashboard',
    'inventory:view', 'inventory:manage', 'inventory:stocktake', 'inventory:expiry-management', 'inventory:batches',
    'shifts:view',
    'master-data:view', 'master-data:manage',
    'reports:view',
  ],

  SECURITY_OFFICER: [
    'dashboard',
    'pos:history',
    'shifts:view',
    'users:view', 'users:view-logs',
    'audit:view', 'audit:export',
    'login-history:view', 'login-history:export',
    'workstations:view',
    'reports:view',
  ],
}

// ── Role Metadata (label, tier, color) ──
export const ROLE_METADATA: Record<string, { label: string; tier: PrivilegeTier; color: string; description: string }> = {
  SUPER_ADMIN:          { label: 'Super Admin',       tier: 'LEVEL_5', color: 'bg-purple-100 text-purple-700 border-purple-200',       description: 'Full system access, configuration, and user management' },
  PHARMACIST:           { label: 'Pharmacist',        tier: 'LEVEL_4', color: 'bg-emerald-100 text-emerald-700 border-emerald-200',   description: 'Clinical operations: prescriptions, dispensing, drug alerts' },
  PHARMACY_TECHNICIAN:  { label: 'Pharmacy Tech',     tier: 'LEVEL_3', color: 'bg-teal-100 text-teal-700 border-teal-200',             description: 'Assists pharmacists: inventory, basic dispensing' },
  DISPENSER:            { label: 'Dispenser',          tier: 'LEVEL_2', color: 'bg-cyan-100 text-cyan-700 border-cyan-200',             description: 'Dispenses medications and manages prescriptions' },
  CASHIER:              { label: 'Cashier',            tier: 'LEVEL_2', color: 'bg-blue-100 text-blue-700 border-blue-200',             description: 'Handles POS sales and basic customer interactions' },
  CLERK:                { label: 'Clerk',              tier: 'LEVEL_1', color: 'bg-gray-100 text-gray-700 border-gray-200',           description: 'Basic access: customer lookup and browsing only' },
  STORE_MANAGER:        { label: 'Store Manager',      tier: 'LEVEL_4', color: 'bg-amber-100 text-amber-700 border-amber-200',         description: 'Full store operations: inventory, financials, and staff' },
  SHIFT_SUPERVISOR:     { label: 'Shift Supervisor',   tier: 'LEVEL_3', color: 'bg-orange-100 text-orange-700 border-orange-200',       description: 'Supervises shifts: POS, inventory adjustments, cash reconciliation' },
  ACCOUNTANT:           { label: 'Accountant',         tier: 'LEVEL_3', color: 'bg-indigo-100 text-indigo-700 border-indigo-200',      description: 'Financial access: reports, reconciliation, and audit logs' },
  RECEPTIONIST:         { label: 'Receptionist',       tier: 'LEVEL_1', color: 'bg-pink-100 text-pink-700 border-pink-200',             description: 'Front desk: customer registration, insurance, appointments' },
  LAB_TECHNICIAN:       { label: 'Lab Technician',     tier: 'LEVEL_2', color: 'bg-violet-100 text-violet-700 border-violet-200',       description: 'Laboratory operations: stock quality, expiry management' },
  SECURITY_OFFICER:     { label: 'Security Officer',  tier: 'LEVEL_2', color: 'bg-red-100 text-red-700 border-red-200',               description: 'Security: audit logs, user activity monitoring' },
}

// ── Permission Helpers ──

/** Parse a JSON-encoded permission string or comma-separated string into an array */
export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((p: unknown) => typeof p === 'string') : []
  } catch {
    // Fallback: treat as comma-separated
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
}

/** Sanitize a permissions array: keep only valid keys */
export function sanitizePermissions(perms: unknown[]): string[] {
  const validSet = new Set<string>(ALL_PERMISSION_KEYS)
  return Array.isArray(perms)
    ? perms.filter((p): p is string => typeof p === 'string' && validSet.has(p))
    : []
}

/** DEFAULT_ROLES alias for backward compat — maps ROLE_METADATA into array form */
export const DEFAULT_ROLES = Object.entries(ROLE_METADATA).map(([name, meta]) => ({
  name,
  displayName: meta.label,
  description: meta.description,
  color: meta.color,
  isSystem: true,
  isDefault: name === 'CLERK',
}))

// ── Department Options ──
export const DEPARTMENTS = [
  'Administration',
  'Pharmacy',
  'Front Desk',
  'Finance',
  'Laboratory',
  'Inventory/Warehouse',
  'Security',
  'Management',
  'IT',
] as const

// ── Shift Options ──
export const SHIFTS = [
  'Morning (6AM - 2PM)',
  'Afternoon (2PM - 10PM)',
  'Night (10PM - 6AM)',
  'Rotating',
  'Flexible',
] as const
