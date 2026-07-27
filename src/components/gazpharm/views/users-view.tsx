'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCog, Shield, CheckCircle, XCircle, Edit, Clock, Plus, Ban, UserCheck,
  LayoutDashboard, ShoppingCart, Package, FileText, Users, Monitor, BarChart3, Eye, Trash2
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

// ── Permission definitions ──────────────────────────────────────────────
const PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'View sales dashboard & KPIs' },
  { key: 'pos', label: 'POS Terminal', icon: ShoppingCart, description: 'Process sales transactions' },
  { key: 'inventory', label: 'Inventory', icon: Package, description: 'Manage stock & products' },
  { key: 'prescriptions', label: 'Prescriptions', icon: FileText, description: 'Process Rx orders' },
  { key: 'customers', label: 'Customers', icon: Users, description: 'View & manage patients' },
  { key: 'users', label: 'User Management', icon: UserCog, description: 'Create & manage staff' },
  { key: 'hardware', label: 'Hardware', icon: Monitor, description: 'Configure devices & printers' },
  { key: 'reports', label: 'Reports', icon: BarChart3, description: 'View analytics & export data' },
]

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-red-100 text-red-700 border-red-200' },
  PHARMACIST: { label: 'Pharmacist', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  TECHNICIAN: { label: 'Technician', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  CASHIER: { label: 'Cashier', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  CLERK: { label: 'Clerk', color: 'bg-gray-100 text-gray-700 border-gray-200' },
}

// Default permissions per role — super admin can customize per user
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['dashboard', 'pos', 'inventory', 'prescriptions', 'customers', 'users', 'hardware', 'reports'],
  PHARMACIST: ['dashboard', 'pos', 'inventory', 'prescriptions', 'customers', 'hardware', 'reports'],
  TECHNICIAN: ['dashboard', 'pos', 'inventory', 'prescriptions', 'customers'],
  CASHIER: ['dashboard', 'pos', 'customers'],
  CLERK: ['dashboard', 'customers'],
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
    onChange(PERMISSIONS.map((p) => p.key))
  }

  const deselectAll = () => {
    if (disabled) return
    onChange([])
  }

  const allSelected = PERMISSIONS.every((p) => permissions.includes(p.key))

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
      <div className="border rounded-lg divide-y">
        {PERMISSIONS.map((perm) => {
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
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{permissions.length} of {PERMISSIONS.length} permissions granted</span>
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

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // When role changes in create dialog, auto-fill default permissions
  const handleCreateRoleChange = (newRole: string) => {
    setForm({ ...form, role: newRole })
    setFormPermissions([...DEFAULT_ROLE_PERMISSIONS[newRole] || []])
  }

  // When role changes in edit dialog, auto-fill default permissions
  const handleEditRoleChange = (newRole: string) => {
    setEditForm({ ...editForm, role: newRole })
    setEditPermissions([...DEFAULT_ROLE_PERMISSIONS[newRole] || []])
  }

  const openEditDialog = (user: UserItem) => {
    setSelectedUser(user)
    const parsed = parsePermissions(user.permissions)
    const perms = parsed.length > 0 ? parsed : [...DEFAULT_ROLE_PERMISSIONS[user.role] || []]
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

  const getUserPermissions = (user: UserItem): string[] => {
    const parsed = parsePermissions(user.permissions)
    return parsed.length > 0 ? parsed : DEFAULT_ROLE_PERMISSIONS[user.role] || []
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
                <TableHead className="hidden sm:table-cell">Email</TableHead>
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
                  const roleCfg = ROLE_CONFIG[userItem.role] || ROLE_CONFIG.CLERK
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
                        <Badge className={`text-xs ${roleCfg.color}`}>{roleCfg.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {perms.length}/{PERMISSIONS.length}
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
                  <TableHead className="text-center">Super Admin</TableHead>
                  <TableHead className="text-center">Pharmacist</TableHead>
                  <TableHead className="text-center">Technician</TableHead>
                  <TableHead className="text-center">Cashier</TableHead>
                  <TableHead className="text-center">Clerk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PERMISSIONS.map((perm) => (
                  <TableRow key={perm.key}>
                    <TableCell className="font-medium text-sm">{perm.label}</TableCell>
                    {Object.keys(ROLE_CONFIG).map((role) => {
                      const hasPerm = DEFAULT_ROLE_PERMISSIONS[role]?.includes(perm.key)
                      return (
                        <TableCell key={role} className="text-center">
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
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@selrx.com" className="mt-1" />
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
                      {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <span>{cfg.label}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {DEFAULT_ROLE_PERMISSIONS[key]?.length || 0} perms
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
                        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <span>{cfg.label}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {DEFAULT_ROLE_PERMISSIONS[key]?.length || 0} perms
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
            const roleCfg = ROLE_CONFIG[selectedUser.role] || ROLE_CONFIG.CLERK
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
                      <Badge className={`ml-2 text-xs ${roleCfg.color}`}>{roleCfg.label}</Badge>
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
                    {PERMISSIONS.map((perm) => {
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
                  <p className="text-xs text-muted-foreground mt-2">{perms.length} of {PERMISSIONS.length} permissions granted</p>
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
    </div>
  )
}
