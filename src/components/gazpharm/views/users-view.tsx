'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCog, Shield, CheckCircle, XCircle, Edit, Clock, Plus, Ban, UserCheck,
  LayoutDashboard, ShoppingCart, Package, FileText, Users, Monitor, BarChart3, Eye, Trash2,
  ArrowLeftRight, Database, ClipboardCheck, TrendingUp, History, RotateCcw, Settings
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

interface UserItem {
  id: string
  email: string
  name: string
  role: string
  phone: string | null
  licenseNumber: string | null
  permissions: string | null
  active: boolean
  lastLogin: string | null
  createdAt: string
}

interface SystemRoleItem {
  id: string
  name: string
  label: string
  description: string | null
  permissions: string
  color: string
  isSystem: boolean
  isActive: boolean
  _count: { users: number }
}

// ── Expanded Granular Permission Definitions ────────────────────────────
const PERMISSION_CATEGORIES = [
  {
    category: 'Dashboard',
    permissions: [
      { key: 'dashboard', label: 'View Dashboard', icon: LayoutDashboard, description: 'View sales dashboard & KPIs' },
    ],
  },
  {
    category: 'Point of Sale',
    permissions: [
      { key: 'pos:sell', label: 'Process Sales', icon: ShoppingCart, description: 'Create and complete sales transactions' },
      { key: 'pos:refund', label: 'Process Returns', icon: RotateCcw, description: 'Handle goods returns and refunds' },
      { key: 'pos:history', label: 'View Sales History', icon: History, description: 'Access past transaction records' },
    ],
  },
  {
    category: 'Inventory',
    permissions: [
      { key: 'inventory:view', label: 'View Inventory', icon: Eye, description: 'Browse stock levels and product details' },
      { key: 'inventory:manage', label: 'Manage Products', icon: Package, description: 'Add, edit, and delete products' },
      { key: 'inventory:analytics', label: 'Product Analytics', icon: TrendingUp, description: 'View product sales analytics' },
      { key: 'inventory:stocktake', label: 'Stock Taking', icon: ClipboardCheck, description: 'Perform periodic stock counts' },
    ],
  },
  {
    category: 'Drug Catalog',
    permissions: [
      { key: 'master-data:view', label: 'View Drug Catalog', icon: Database, description: 'Browse the master drug catalog' },
      { key: 'master-data:manage', label: 'Manage Drug Catalog', icon: Database, description: 'Add, edit, and update drug records' },
    ],
  },
  {
    category: 'Prescriptions',
    permissions: [
      { key: 'prescriptions:view', label: 'View Prescriptions', icon: FileText, description: 'Access and read prescription orders' },
      { key: 'prescriptions:process', label: 'Fill & Verify Rx', icon: ClipboardCheck, description: 'Process, fill, and verify prescriptions' },
    ],
  },
  {
    category: 'Customers',
    permissions: [
      { key: 'customers:view', label: 'View Customers', icon: Users, description: 'Browse patient records and history' },
      { key: 'customers:manage', label: 'Manage Customers', icon: Users, description: 'Add, edit, and update patient info' },
    ],
  },
  {
    category: 'Users & Roles',
    permissions: [
      { key: 'users:view', label: 'View Users', icon: Eye, description: 'See the list of system users' },
      { key: 'users:manage', label: 'Manage Users', icon: UserCog, description: 'Create, edit, and deactivate users' },
      { key: 'users:roles', label: 'Manage Roles', icon: Shield, description: 'Create and customize roles & privileges' },
    ],
  },
  {
    category: 'Hardware',
    permissions: [
      { key: 'hardware:view', label: 'View Hardware', icon: Monitor, description: 'View hardware device configuration' },
      { key: 'hardware:manage', label: 'Configure Hardware', icon: Settings, description: 'Setup and configure devices & printers' },
    ],
  },
  {
    category: 'Reports',
    permissions: [
      { key: 'reports:view', label: 'View Reports', icon: BarChart3, description: 'Access analytics and reports' },
      { key: 'reports:export', label: 'Export Data', icon: ArrowLeftRight, description: 'Export reports to CSV and other formats' },
    ],
  },
]

// Flat list of all permission keys
const ALL_PERMISSIONS = PERMISSION_CATEGORIES.flatMap(c => c.permissions)

// Exported flat key list for use by login API (SUPER_ADMIN gets all)
export const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map(p => p.key)

// Default permissions per role — loaded from DB, fallback hardcoded
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'inventory:view', 'inventory:manage', 'inventory:analytics', 'inventory:stocktake', 'prescriptions:view', 'prescriptions:process', 'customers:view', 'customers:manage', 'users:view', 'users:manage', 'users:roles', 'hardware:view', 'hardware:manage', 'reports:view', 'reports:export', 'master-data:view', 'master-data:manage'],
  PHARMACIST: ['dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'inventory:view', 'inventory:manage', 'inventory:analytics', 'inventory:stocktake', 'prescriptions:view', 'prescriptions:process', 'customers:view', 'customers:manage', 'hardware:view', 'hardware:manage', 'reports:view', 'reports:export', 'master-data:view', 'master-data:manage'],
  TECHNICIAN: ['dashboard', 'pos:sell', 'pos:history', 'inventory:view', 'inventory:manage', 'inventory:stocktake', 'prescriptions:view', 'customers:view', 'customers:manage', 'master-data:view'],
  CASHIER: ['dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'customers:view', 'customers:manage'],
  CLERK: ['dashboard', 'customers:view'],
  STORE_MANAGER: ['dashboard', 'pos:sell', 'pos:refund', 'pos:history', 'inventory:view', 'inventory:manage', 'inventory:analytics', 'inventory:stocktake', 'prescriptions:view', 'customers:view', 'customers:manage', 'users:view', 'reports:view', 'reports:export', 'master-data:view', 'master-data:manage'],
}

function parsePermissions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Permission Checkboxes Component ────────────────────────────────────
function PermissionGrid({
  permissions,
  onChange,
  disabled,
}: {
  permissions: string[]
  onChange: (updated: string[]) => void
  disabled?: boolean
}) {
  const toggle = (key: string) => {
    if (disabled) return
    if (permissions.includes(key)) {
      onChange(permissions.filter((p) => p !== key))
    } else {
      onChange([...permissions, key])
    }
  }

  const selectAll = () => {
    if (disabled) return
    onChange(ALL_PERMISSIONS.map((p) => p.key))
  }

  const deselectAll = () => {
    if (disabled) return
    onChange([])
  }

  const allSelected = ALL_PERMISSIONS.every((p) => permissions.includes(p.key))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Privileges & Permissions</Label>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={selectAll} disabled={disabled}>
            Select All
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={deselectAll} disabled={disabled}>
            Clear All
          </Button>
        </div>
      </div>
      {PERMISSION_CATEGORIES.map((cat) => {
        const catSelected = cat.permissions.filter(p => permissions.includes(p.key)).length
        return (
          <div key={cat.category} className="border rounded-lg">
            <div className="px-3 py-2 bg-gray-50/50 border-b flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.category}</span>
              <Badge variant="outline" className="text-[10px] h-5">{catSelected}/{cat.permissions.length}</Badge>
            </div>
            <div className="divide-y">
              {cat.permissions.map((perm) => {
                const isChecked = permissions.includes(perm.key)
                const Icon = perm.icon
                return (
                  <label
                    key={perm.key}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      disabled ? 'opacity-60 cursor-not-allowed' : isChecked ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggle(perm.key)}
                      disabled={disabled}
                      className={isChecked ? 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600' : ''}
                    />
                    <Icon className={`h-4 w-4 shrink-0 ${isChecked ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${isChecked ? 'text-emerald-700' : ''}`}>{perm.label}</span>
                      <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{perm.description}</span>
                    </div>
                    <Badge variant={isChecked ? 'outline' : 'secondary'} className={`text-[10px] h-5 ${isChecked ? 'border-emerald-300 text-emerald-700' : ''}`}>
                      {isChecked ? 'Granted' : 'Denied'}
                    </Badge>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{permissions.length} of {ALL_PERMISSIONS.length} permissions granted</span>
        {!allSelected && permissions.length > 0 && (
          <span className="text-amber-600 font-medium">Custom permissions (different from role defaults)</span>
        )}
      </div>
    </div>
  )
}

// ── Main View ──────────────────────────────────────────────────────────
export function UsersView() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '',
  })
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [editForm, setEditForm] = useState({
    role: '', phone: '', licenseNumber: '',
  })
  const [editPermissions, setEditPermissions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAppStore((s) => s.user)

  // ── Roles Management State ──
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users')
  const [roles, setRoles] = useState<SystemRoleItem[]>([])
  const [createRoleDialog, setCreateRoleDialog] = useState(false)
  const [editRoleDialog, setEditRoleDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState<SystemRoleItem | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', label: '', description: '' })
  const [roleFormPermissions, setRoleFormPermissions] = useState<string[]>([])
  const [editRoleForm, setEditRoleForm] = useState({ label: '', description: '', color: '' })
  const [editRolePermissions, setEditRolePermissions] = useState<string[]>([])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users', { headers: authHeaders() })
      if (res.ok) setUsers(await res.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // ── Roles CRUD ──
  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch('/api/roles', { headers: { 'x-user-role': 'SUPER_ADMIN' } })
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
        // Update DEFAULT_ROLE_PERMISSIONS from DB roles
        data.forEach((r: SystemRoleItem) => {
          try {
            const perms = JSON.parse(r.permissions)
            if (Array.isArray(perms)) DEFAULT_ROLE_PERMISSIONS[r.name] = perms
          } catch { /* skip */ }
        })
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchRoles() }, [fetchRoles])

  const handleCreateRole = async () => {
    if (!roleForm.name || !roleForm.label) return
    setSaving(true)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ ...roleForm, permissions: roleFormPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create role')
      }
      addToast({ title: 'Role Created', description: `"${roleForm.label}" role created successfully`, variant: 'success' })
      setCreateRoleDialog(false)
      setRoleForm({ name: '', label: '', description: '' })
      setRoleFormPermissions([])
      fetchRoles()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to create role', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const openEditRoleDialog = (role: SystemRoleItem) => {
    setSelectedRole(role)
    setEditRoleForm({ label: role.label, description: role.description || '', color: role.color })
    try { setEditRolePermissions(JSON.parse(role.permissions)) } catch { setEditRolePermissions([]) }
    setEditRoleDialog(true)
  }

  const handleUpdateRole = async () => {
    if (!selectedRole) return
    setSaving(true)
    try {
      const res = await fetch(`/api/roles?id=${selectedRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ ...editRoleForm, permissions: editRolePermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update role')
      }
      addToast({ title: 'Role Updated', description: `"${editRoleForm.label}" updated successfully`, variant: 'success' })
      setEditRoleDialog(false)
      setSelectedRole(null)
      fetchRoles()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to update role', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRole = async (role: SystemRoleItem) => {
    if (role.isSystem || role._count.users > 0) {
      addToast({ title: 'Cannot Delete', description: role.isSystem ? 'System roles cannot be deleted' : `Reassign ${role._count.users} user(s) first`, variant: 'destructive' })
      return
    }
    if (!confirm(`Delete the "${role.label}" role? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': 'SUPER_ADMIN' },
      })
      if (res.ok) {
        addToast({ title: 'Deleted', description: `"${role.label}" role deleted`, variant: 'success' })
        fetchRoles()
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to delete role', variant: 'destructive' })
    }
  }

  // Get role permissions from DB-loaded roles state, fallback to hardcoded defaults
  const getRolePerms = (roleName: string): string[] => {
    const dbRole = roles.find(r => r.name === roleName)
    if (dbRole) {
      try { const p = JSON.parse(dbRole.permissions); if (Array.isArray(p)) return p } catch { /* fall through */ }
    }
    return DEFAULT_ROLE_PERMISSIONS[roleName] || []
  }

  // When role changes in create dialog, auto-fill default permissions
  const handleCreateRoleChange = (newRole: string) => {
    setForm({ ...form, role: newRole })
    setFormPermissions([...getRolePerms(newRole)])
  }

  // When role changes in edit dialog, auto-fill default permissions
  const handleEditRoleChange = (newRole: string) => {
    setEditForm({ ...editForm, role: newRole })
    setEditPermissions([...getRolePerms(newRole)])
  }

  const openEditDialog = (user: UserItem) => {
    setSelectedUser(user)
    const parsed = parsePermissions(user.permissions)
    const perms = parsed.length > 0 ? parsed : [...getRolePerms(user.role)]
    setEditForm({ role: user.role, phone: user.phone || '', licenseNumber: user.licenseNumber || '' })
    setEditPermissions(perms)
    setEditDialog(true)
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ ...form, userRole: form.role, permissions: formPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create user')
      }
      addToast({ title: 'Created', description: 'User created successfully', variant: 'success' })
      setCreateDialog(false)
      setForm({ name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '' })
      setFormPermissions([])
      fetchUsers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to create user', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedUser) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users?id=${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ userRole: editForm.role, phone: editForm.phone, licenseNumber: editForm.licenseNumber, permissions: editPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update user')
      }
      addToast({ title: 'Updated', description: `${selectedUser.name} has been updated`, variant: 'success' })
      setEditDialog(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to update user', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: UserItem) => {
    try {
      await fetch(`/api/users?id=${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ active: !user.active }),
      })
      addToast({ title: user.active ? 'Deactivated' : 'Activated', description: `${user.name} ${user.active ? 'deactivated' : 'activated'}`, variant: 'success' })
      fetchUsers()
    } catch {
      addToast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' })
    }
  }

  const handleDeleteUser = async (user: UserItem) => {
    if (!confirm(`Delete user "${user.name}" (${user.email})? This action cannot be undone.`)) return
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      addToast({ title: 'User Deleted', description: `"${user.name}" has been removed`, variant: 'success' })
      fetchUsers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to delete user', variant: 'destructive' })
    }
  }

  const getUserPermissions = (user: UserItem): string[] => {
    const parsed = parsePermissions(user.permissions)
    if (parsed.length > 0) return parsed
    return getRolePerms(user.role)
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{users.filter((u) => u.active).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Ban className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{users.filter((u) => !u.active).length}</p>
              <p className="text-xs text-muted-foreground">Inactive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{users.filter((u) => u.role === 'SUPER_ADMIN').length}</p>
              <p className="text-xs text-muted-foreground">Admins</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Users ({users.length})</span>
        </button>
        {(currentUser?.role === 'SUPER_ADMIN') && (
          <button
            onClick={() => setActiveTab('roles')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'roles' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Roles ({roles.length})</span>
          </button>
        )}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground">Manage staff accounts and role permissions</p>
        </div>
        {(currentUser?.role === 'SUPER_ADMIN') && (
          <Button onClick={() => {
            setForm({ name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '' })
            setFormPermissions([...DEFAULT_ROLE_PERMISSIONS.CLERK])
            setCreateDialog(true)
          }} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        )}
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Username / Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Privileges</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                users.map((userItem) => {
                  const roleData = roles.find(r => r.name === userItem.role)
                  const roleColor = roleData?.color || 'bg-gray-100 text-gray-700 border-gray-200'
                  const roleLabel = roleData?.label || userItem.role
                  const perms = getUserPermissions(userItem)
                  const isCustomPerms = parsePermissions(userItem.permissions).length > 0
                  return (
                    <TableRow key={userItem.id} className={!userItem.active ? 'opacity-50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                            {userItem.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <p className="font-medium text-sm">{userItem.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{userItem.email}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${roleColor}`}>{roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {perms.length}/{ALL_PERMISSIONS.length}
                          </Badge>
                          {isCustomPerms && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                              Custom
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {userItem.active ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {userItem.lastLogin ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(userItem.lastLogin).toLocaleString()}
                          </div>
                        ) : (
                          'Never'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setSelectedUser(userItem); setDetailDialog(true) }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {currentUser?.role === 'SUPER_ADMIN' && userItem.id !== currentUser.id && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => openEditDialog(userItem)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className={userItem.active ? 'text-red-500' : 'text-emerald-600'}
                                onClick={() => handleToggleActive(userItem)}
                              >
                                {userItem.active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteUser(userItem)}
                                title="Delete user"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Role Permission Reference Matrix */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Default Role Permissions</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  {roles.map((role) => (
                    <TableHead key={role.id} className="text-center">{role.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_PERMISSIONS.map((perm) => (
                  <TableRow key={perm.key}>
                    <TableCell className="font-medium text-sm">{perm.label}</TableCell>
                    {roles.map((role) => {
                      const hasPerm = DEFAULT_ROLE_PERMISSIONS[role.name]?.includes(perm.key)
                      return (
                        <TableCell key={role.id} className="text-center">
                          {hasPerm ? <CheckCircle className="h-4 w-4 text-emerald-600 mx-auto" /> : <XCircle className="h-4 w-4 text-gray-300 mx-auto" />}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Create User Dialog ─────────────────────────────────────────── */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Create New User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-1">
            {/* Personal Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="mt-1" />
              </div>
              <div>
                <Label>Username or Email <span className="text-red-500">*</span></Label>
                <Input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. johndoe or john@selrx.com" className="mt-1" />
              </div>
              <div>
                <Label>Password <span className="text-red-500">*</span></Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" className="mt-1" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="mt-1" />
              </div>
              <div>
                <Label>License Number</Label>
                <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="For pharmacists" className="mt-1" />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t pt-4">
              {/* Role Dropdown */}
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-semibold">Assign Role</Label>
                  <Select value={form.role} onValueChange={handleCreateRoleChange}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.filter(r => r.isActive).map((r) => (
                        <SelectItem key={r.id} value={r.name}>
                          <div className="flex items-center gap-2">
                            <span>{r.label}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {getRolePerms(r.name).length}/{ALL_PERMISSIONS.length}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Selecting a role auto-fills default permissions. You can customize them below.
                  </p>
                </div>

                {/* Permission Checkboxes */}
                <PermissionGrid
                  permissions={formPermissions}
                  onChange={setFormPermissions}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.name || !form.email || !form.password || saving}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog (Role + Permissions) ─────────────────────── */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-teal-600" />
              Edit User: {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-1">
              {/* User Info */}
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                    {selectedUser.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-medium">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  </div>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>License Number</Label>
                  <Input value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} className="mt-1" />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t pt-4">
                {/* Role Dropdown */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">Change Role</Label>
                    <Select value={editForm.role} onValueChange={handleEditRoleChange}>
                      <SelectTrigger className="mt-1 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.filter(r => r.isActive).map((r) => (
                          <SelectItem key={r.id} value={r.name}>
                            <div className="flex items-center gap-2">
                              <span>{r.label}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {getRolePerms(r.name).length}/{ALL_PERMISSIONS.length}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Changing the role resets permissions to defaults. Customize below as needed.
                    </p>
                  </div>

                  {/* Permission Checkboxes */}
                  <PermissionGrid
                    permissions={editPermissions}
                    onChange={setEditPermissions}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdate} className="bg-teal-600 hover:bg-teal-700" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Detail Dialog ────────────────────────────────────────── */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-emerald-600" />
              User Details
            </DialogTitle>
          </DialogHeader>
          {selectedUser && (() => {
            const perms = getUserPermissions(selectedUser)
            const isCustomPerms = parsePermissions(selectedUser.permissions).length > 0
            const detailRoleData = roles.find(r => r.name === selectedUser.role)
            const detailRoleLabel = detailRoleData?.label || selectedUser.role
            const detailRoleColor = detailRoleData?.color || 'bg-gray-100 text-gray-700 border-gray-200'
            return (
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-lg font-bold text-emerald-700">
                      {selectedUser.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{selectedUser.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Role:</span>
                      <Badge className={`ml-2 text-xs ${detailRoleColor}`}>{detailRoleLabel}</Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Badge className={`ml-2 text-xs ${selectedUser.active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                        {selectedUser.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="ml-2 font-medium">{selectedUser.phone || 'Not set'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">License:</span>
                      <span className="ml-2 font-medium">{selectedUser.licenseNumber || 'None'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Granted Permissions</Label>
                    {isCustomPerms && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Custom</Badge>
                    )}
                  </div>
                  <div className="border rounded-lg divide-y">
                    {PERMISSION_CATEGORIES.map((cat) => (
                      <div key={cat.category}>
                        <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] font-semibold text-gray-500 uppercase">{cat.category}</div>
                        {cat.permissions.map((perm) => {
                          const has = perms.includes(perm.key)
                          const Icon = perm.icon
                          return (
                            <div key={perm.key} className={`flex items-center gap-3 px-3 py-2 ${has ? '' : 'opacity-40'}`}>
                              {has ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-gray-300 shrink-0" />}
                              <Icon className={`h-4 w-4 shrink-0 ${has ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                              <span className={`text-sm ${has ? 'font-medium' : ''}`}>{perm.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{perms.length} of {ALL_PERMISSIONS.length} permissions granted</p>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog(false)}>Close</Button>
            {currentUser?.role === 'SUPER_ADMIN' && selectedUser?.id !== currentUser.id && (
              <Button onClick={() => { setDetailDialog(false); openEditDialog(selectedUser!) }} className="bg-teal-600 hover:bg-teal-700">
                <Edit className="h-3.5 w-3.5 mr-1" />
                Edit User
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}

      {/* Roles Tab */}
      {activeTab === 'roles' && currentUser?.role === 'SUPER_ADMIN' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Roles & Privileges</h2>
              <p className="text-sm text-muted-foreground">Create and manage custom roles with granular permissions</p>
            </div>
            <Button onClick={() => {
              setRoleForm({ name: '', label: '', description: '' })
              setRoleFormPermissions([])
              setCreateRoleDialog(true)
            }} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          </div>

          {/* Roles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => {
              const permCount = (() => { try { return JSON.parse(role.permissions).length } catch { return 0 } })()
              return (
                <Card key={role.id} className={`relative overflow-hidden ${!role.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs px-2 py-0.5 border ${role.color}`}>{role.label}</Badge>
                          {role.isSystem && <Badge variant="outline" className="text-[10px] h-5">System</Badge>}
                          {!role.isActive && <Badge variant="secondary" className="text-[10px] h-5">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">{role.description || 'No description'}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRoleDialog(role)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {!role.isSystem && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => handleDeleteRole(role)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{permCount} permissions</span>
                      <span className="text-muted-foreground">{role._count.users} user{role._count.users !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Mini permission preview */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(() => {
                        try { return JSON.parse(role.permissions).slice(0, 5).map((p: string) => (
                          <Badge key={p} variant="secondary" className="text-[9px] h-4 px-1">{p}</Badge>
                        )) } catch { return [] }
                      })()}
                      {permCount > 5 && <Badge variant="secondary" className="text-[9px] h-4 px-1">+{permCount - 5}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Create Role Dialog */}
          <Dialog open={createRoleDialog} onOpenChange={setCreateRoleDialog}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Role Name (Code) <span className="text-red-500">*</span></Label>
                    <Input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="SHIFT_LEAD" className="mt-1" />
                    <p className="text-[10px] text-muted-foreground mt-1">Uppercase letters, numbers, underscores</p>
                  </div>
                  <div>
                    <Label>Display Label <span className="text-red-500">*</span></Label>
                    <Input value={roleForm.label} onChange={(e) => setRoleForm({ ...roleForm, label: e.target.value })} placeholder="Shift Lead" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={roleForm.description} onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })} placeholder="Brief role description" className="mt-1" />
                </div>
                <PermissionGrid permissions={roleFormPermissions} onChange={setRoleFormPermissions} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateRoleDialog(false)}>Cancel</Button>
                <Button onClick={handleCreateRole} className="bg-emerald-600 hover:bg-emerald-700" disabled={!roleForm.name || !roleForm.label || saving}>
                  {saving ? 'Creating...' : 'Create Role'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Role Dialog */}
          <Dialog open={editRoleDialog} onOpenChange={setEditRoleDialog}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Role: {selectedRole?.label}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Role Name</Label>
                  <Input value={selectedRole?.name || ''} disabled className="mt-1 bg-gray-50" />
                  <p className="text-[10px] text-muted-foreground mt-1">Role name cannot be changed after creation</p>
                </div>
                <div>
                  <Label>Display Label</Label>
                  <Input value={editRoleForm.label} onChange={(e) => setEditRoleForm({ ...editRoleForm, label: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={editRoleForm.description} onChange={(e) => setEditRoleForm({ ...editRoleForm, description: e.target.value })} className="mt-1" />
                </div>
                <PermissionGrid permissions={editRolePermissions} onChange={setEditRolePermissions} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditRoleDialog(false)}>Cancel</Button>
                <Button onClick={handleUpdateRole} className="bg-emerald-600 hover:bg-emerald-700" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  )
}
