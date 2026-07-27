// Shared granular permission definitions used by both client and server

export const ALL_PERMISSION_KEYS = [
  'dashboard',
  'pos:sell',
  'pos:refund',
  'pos:history',
  'inventory:view',
  'inventory:manage',
  'inventory:analytics',
  'inventory:stocktake',
  'prescriptions:view',
  'prescriptions:process',
  'customers:view',
  'customers:manage',
  'users:view',
  'users:manage',
  'users:roles',
  'hardware:view',
  'hardware:manage',
  'reports:view',
  'reports:export',
  'master-data:view',
  'master-data:manage',
] as const

export type PermissionKey = typeof ALL_PERMISSION_KEYS[number]
