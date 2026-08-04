'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  UserCog, Shield, CheckCircle, XCircle, Edit, Clock, Plus, Ban, UserCheck,
  LayoutDashboard, ShoppingCart, Package, FileText, Users, Monitor, BarChart3, Eye, Trash2,
  ArrowLeftRight, Database, ClipboardCheck, TrendingUp, History, RotateCcw, Settings,
  DollarSign, Lock, AlertTriangle, Printer, ChevronDown, ChevronUp, Crown, Info,
  Building2, CalendarDays, Tag, Stethoscope, ShieldCheck, FlaskConical, BadgeCheck,
  Receipt, CreditCard, Archive, ClipboardList, FileCheck, UserX, BadgeDollarSign,
  Search, Filter, SlidersHorizontal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATEGORIES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_METADATA,
  PRIVILEGE_TIERS,
  DEPARTMENTS,
  SHIFTS,
} from '@/lib/permissions'
import type { PrivilegeTier } from '@/lib/permissions'
import { formatDateTime, formatDate } from '@/lib/date-utils'

// ── Icon map for permission categories ─────────────────────────────────
const CATEGORY_ICONS: Record<string, any> = {
  'Dashboard': LayoutDashboard,
  'Point of Sale': ShoppingCart,
  'Inventory': Package,
  'Drug Catalog': Database,
  'Prescriptions': FileText,
  'Customers': Users,
  'Users & Security': Shield,
  'Financial': DollarSign,
  'Hardware': Monitor,
  'Reports': BarChart3,
  'Settings': Settings,
  'Audit & Compliance': ClipboardList,
  'Goods Returns': RotateCcw,
  'Shift Management': CalendarDays,
}

// Flat list of all permissions
const ALL_PERMISSIONS = PERMISSION_CATEGORIES.flatMap(c => c.permissions)

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
  department?: string | null
  shift?: string | null
  hireDate?: string | null
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

function parsePermissions(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ── Privilege Tier Badge ────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  const meta = PRIVILEGE_TIERS[tier as PrivilegeTier]
  if (!meta) return null
  const colors: Record<string, string> = {
    LEVEL_1: 'bg-gray-100 text-gray-700 border-gray-200',
    LEVEL_2: 'bg-blue-100 text-blue-700 border-blue-200',
    LEVEL_3: 'bg-amber-100 text-amber-700 border-amber-200',
    LEVEL_4: 'bg-orange-100 text-orange-700 border-orange-200',
    LEVEL_5: 'bg-purple-100 text-purple-700 border-purple-200',
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-[10px] px-1.5 py-0 border ${colors[tier] || colors.LEVEL_1}`}>
            {meta.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Level {meta.level}: {meta.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ── Permission Grid Component ──────────────────────────────────────────
function PermissionGrid({
  permissions,
  onChange,
  disabled,
  compact = false,
}: {
  permissions: string[]
  onChange: (updated: string[]) => void
  disabled?: boolean
  compact?: boolean
}) {
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    if (disabled) return
    if (permissions.includes(key)) {
      onChange(permissions.filter((p) => p !== key))
    } else {
      onChange([...permissions, key])
    }
  }

  const toggleCategory = (catKey: string, permKeys: string[]) => {
    if (disabled) return
    const allChecked = permKeys.every((k) => permissions.includes(k))
    if (allChecked) {
      onChange(permissions.filter((p) => !permKeys.includes(p)))
    } else {
      const add = permKeys.filter((k) => !permissions.includes(k))
      onChange([...permissions, ...add])
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
  const totalGranted = permissions.length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-semibold">Privileges & Permissions</Label>
          <Badge variant="outline" className="text-[10px] h-5">{totalGranted}/{ALL_PERMISSIONS.length}</Badge>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={selectAll} disabled={disabled}>
            All
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={deselectAll} disabled={disabled}>
            Clear
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="flex gap-2 flex-wrap">
        {PERMISSION_CATEGORIES.map((cat) => {
          const catPerms = cat.permissions.filter(p => permissions.includes(p.key)).length
          return (
            <Badge key={cat.category} variant={catPerms > 0 ? 'default' : 'secondary'} className={`text-[10px] h-5 ${catPerms > 0 && catPerms === cat.permissions.length ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : ''}`}>
              {cat.category}: {catPerms}/{cat.permissions.length}
            </Badge>
          )
        })}
      </div>

      {PERMISSION_CATEGORIES.map((cat) => {
        const CatIcon = CATEGORY_ICONS[cat.category] || Shield
        const catSelected = cat.permissions.filter(p => permissions.includes(p.key)).length
        const isCollapsed = collapsedCats.has(cat.category)

        return (
          <div key={cat.category} className="border border-gray-200/80 rounded-xl">
            <div
              className={`px-3 py-2 bg-gray-50/50 border-b flex items-center justify-between cursor-pointer hover:bg-gray-100/50 transition-colors ${disabled ? 'cursor-not-allowed' : ''}`}
              onClick={() => disabled ? null : setCollapsedCats(prev => {
                const next = new Set(prev)
                next.has(cat.category) ? next.delete(cat.category) : next.add(cat.category)
                return next
              })}
            >
              <div className="flex items-center gap-2">
                <CatIcon className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.category}</span>
                <Badge variant="outline" className="text-[10px] h-5">
                  {catSelected}/{cat.permissions.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {!disabled && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-emerald-600 px-1 py-0.5 rounded"
                    onClick={(e) => { e.stopPropagation(); toggleCategory(cat.category, cat.permissions.map(p => p.key)) }}
                  >
                    {catSelected === cat.permissions.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                {isCollapsed ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronUp className="h-3 w-3 text-gray-400" />}
              </div>
            </div>
            {!isCollapsed && (
              <div className="divide-y">
                {cat.permissions.map((perm) => {
                  const isChecked = permissions.includes(perm.key)
                  const PermIcon = CATEGORY_ICONS[perm.key.split(':')[0] === 'pos' ? 'Point of Sale' : '']
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                        disabled ? 'opacity-60 cursor-not-allowed' : isChecked ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggle(perm.key)}
                        disabled={disabled}
                        className={isChecked ? 'data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600' : ''}
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${isChecked ? 'text-emerald-700' : ''}`}>{perm.label}</span>
                        {!compact && <span className="text-xs text-muted-foreground ml-2 hidden sm:inline">{perm.description}</span>}
                      </div>
                      <Badge variant={isChecked ? 'outline' : 'secondary'} className={`text-[10px] h-5 ${isChecked ? 'border-emerald-300 text-emerald-700' : ''}`}>
                        {isChecked ? 'Granted' : 'Denied'}
                      </Badge>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>{totalGranted} of {ALL_PERMISSIONS.length} permissions granted</span>
        {!allSelected && totalGranted > 0 && (
          <span className="text-amber-600 font-medium">Custom permissions active</span>
        )}
      </div>
    </div>
  )
}

// ── Role Comparison Matrix ─────────────────────────────────────────────
function RoleComparisonMatrix({ roles }: { roles: SystemRoleItem[] }) {
  return (
    <Card className="card-hover transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><ShieldCheck className="h-4.5 w-4.5 text-emerald-600" /></div>
          Role Permission Matrix
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-white z-10 min-w-[160px]">Permission</TableHead>
                {roles.filter(r => r.isActive).map((role) => {
                  const meta = ROLE_METADATA[role.name]
                  return (
                    <TableHead key={role.id} className="text-center min-w-[80px]">
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge className={`text-[10px] px-1.5 py-0 border ${meta?.color || role.color}`}>
                          {meta?.label || role.label}
                        </Badge>
                        {meta?.tier && (
                          <span className="text-[9px] text-muted-foreground">L{PRIVILEGE_TIERS[meta.tier]?.level}</span>
                        )}
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_CATEGORIES.map((cat) => (
                <React.Fragment key={cat.category}>
                  <TableRow className="bg-gray-50/50">
                    <TableCell colSpan={roles.filter(r => r.isActive).length + 1} className="py-1.5 px-3">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{cat.category}</span>
                    </TableCell>
                  </TableRow>
                  {cat.permissions.map((perm) => (
                    <TableRow key={perm.key} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-medium text-xs sticky left-0 bg-white z-10">{perm.label}</TableCell>
                      {roles.filter(r => r.isActive).map((role) => {
                        const hasPerm = DEFAULT_ROLE_PERMISSIONS[role.name]?.includes(perm.key)
                        return (
                          <TableCell key={role.id} className="text-center px-2">
                            {hasPerm ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600 mx-auto" /> : <XCircle className="h-3.5 w-3.5 text-gray-300 mx-auto" />}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main View ──────────────────────────────────────────────────────────
export function UsersView() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '',
    department: '', shift: '', hireDate: '',
  })
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [editForm, setEditForm] = useState({
    role: '', phone: '', licenseNumber: '', department: '', shift: '',
  })
  const [editPermissions, setEditPermissions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAppStore((s) => s.user)

  // Search/filter
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRole, setFilterRole] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterTier, setFilterTier] = useState<string>('all')

  // ── Roles Management State ──
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'matrix'>('users')
  const [roles, setRoles] = useState<SystemRoleItem[]>([])
  const [createRoleDialog, setCreateRoleDialog] = useState(false)
  const [editRoleDialog, setEditRoleDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState<SystemRoleItem | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', label: '', description: '', color: '' })
  const [roleFormPermissions, setRoleFormPermissions] = useState<string[]>([])
  const [editRoleForm, setEditRoleForm] = useState({ label: '', description: '', color: '' })
  const [editRolePermissions, setEditRolePermissions] = useState<string[]>([])
  const [deleteRoleDialog, setDeleteRoleDialog] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users', { headers: authHeaders() })
      if (res.ok) {
        setUsers(await res.json())
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to load users' }))
        addToast({ title: 'Error', description: err.detail ? `${err.error}: ${err.detail}` : (err.error || `Failed to load users (${res.status})`), variant: 'destructive' })
      }
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
      const res = await fetch('/api/roles', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...roleForm, permissions: roleFormPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create role')
      }
      addToast({ title: 'Role Created', description: `"${roleForm.label}" role created successfully`, variant: 'success' })
      setCreateRoleDialog(false)
      setRoleForm({ name: '', label: '', description: '', color: '' })
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    setSaving(true)
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        addToast({ title: 'Deleted', description: `"${role.label}" role deleted`, variant: 'success' })
        setDeleteRoleDialog(false)
        setSelectedRole(null)
        fetchRoles()
      } else {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to delete role', variant: 'destructive' })
    } finally {
      setSaving(false)
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
    setEditForm({ role: user.role, phone: user.phone || '', licenseNumber: user.licenseNumber || '', department: (user as any).department || '', shift: (user as any).shift || '' })
    setEditPermissions(perms)
    setEditDialog(true)
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...form, userRole: form.role, permissions: formPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Failed to create user'))
      }
      addToast({ title: 'Created', description: 'User created successfully', variant: 'success' })
      setCreateDialog(false)
      setForm({ name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '', department: '', shift: '', hireDate: '' })
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ userRole: editForm.role, phone: editForm.phone, licenseNumber: editForm.licenseNumber, department: editForm.department, shift: editForm.shift, permissions: editPermissions }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Failed to update user'))
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
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ active: !user.active }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to update user' }))
        throw new Error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Failed to update user'))
      }
      addToast({ title: user.active ? 'Deactivated' : 'Activated', description: `${user.name} ${user.active ? 'deactivated' : 'activated'}`, variant: 'success' })
      fetchUsers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to update user', variant: 'destructive' })
    }
  }

  const openDeleteDialog = (user: UserItem) => {
    setSelectedUser(user)
    setDeleteDialog(true)
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users?id=${selectedUser.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      addToast({ title: 'User Deleted', description: `"${selectedUser.name}" has been removed`, variant: 'success' })
      setDeleteDialog(false)
      setSelectedUser(null)
      fetchUsers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to delete user', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const getUserPermissions = (user: UserItem): string[] => {
    const parsed = parsePermissions(user.permissions)
    if (parsed.length > 0) return parsed
    return getRolePerms(user.role)
  }

  // Filter users (memoized)
  const filteredUsers = useMemo(() => users.filter((userItem) => {
    const matchesSearch = searchQuery === '' || 
      userItem.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userItem.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userItem.role.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRole = filterRole === 'all' || userItem.role === filterRole
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && userItem.active) ||
      (filterStatus === 'inactive' && !userItem.active)
    const meta = ROLE_METADATA[userItem.role]
    const matchesTier = filterTier === 'all' || meta?.tier === filterTier
    return matchesSearch && matchesRole && matchesStatus && matchesTier
  }), [users, searchQuery, filterRole, filterStatus, filterTier])

  // Count by privilege tier (memoized)
  const tierCounts = useMemo(() => Object.entries(PRIVILEGE_TIERS).map(([tier, info]) => ({
    tier,
    ...info,
    count: users.filter(u => ROLE_METADATA[u.role]?.tier === tier).length,
  })), [users])

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-gray-400">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{users.filter((u) => u.active).length}</p>
              <p className="text-xs text-gray-400">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <Ban className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{users.filter((u) => !u.active).length}</p>
              <p className="text-xs text-gray-400">Inactive</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Crown className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-600">{roles.length}</p>
              <p className="text-xs text-gray-400">Total Roles</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{ALL_PERMISSIONS.length}</p>
              <p className="text-xs text-gray-400">Permissions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Privilege Tier Distribution */}
      <Card className="card-hover transition-all duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Crown className="h-4.5 w-4.5 text-emerald-600" /></div>
            Access Level Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-5 gap-2">
            {tierCounts.map(({ tier, label, level, count }) => (
              <div key={tier} className="text-center p-2 rounded-lg bg-gray-50 border">
                <p className="text-lg font-bold text-gray-900">{count}</p>
                <p className="text-[10px] text-muted-foreground">Level {level}</p>
                <p className="text-xs font-medium">{label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Users ({users.length})</span>
        </button>
        {(currentUser?.role === 'SUPER_ADMIN') && (
          <>
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'roles' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Roles ({roles.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'matrix' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Matrix</span>
            </button>
          </>
        )}
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
      <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">User Management</h2>
          <p className="text-sm text-muted-foreground">Manage staff accounts, roles, and permissions</p>
        </div>
        {(currentUser?.role === 'SUPER_ADMIN') && (
          <Button onClick={() => {
            setForm({ name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '', department: '', shift: '', hireDate: '' })
            setFormPermissions([...DEFAULT_ROLE_PERMISSIONS.CLERK])
            setCreateDialog(true)
          }} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        )}
      </div>

      {/* Search & Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9 bg-gray-50/50 border-gray-200/80 focus:bg-white"
              />
            </div>
            <div className="flex gap-2">
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {roles.filter(r => r.isActive).map((r) => (
                    <SelectItem key={r.name} value={r.name}>{ROLE_METADATA[r.name]?.label || r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterTier} onValueChange={setFilterTier}>
                <SelectTrigger className="h-9 w-[140px]">
                  <Crown className="h-3.5 w-3.5 mr-1" />
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tiers</SelectItem>
                  {Object.entries(PRIVILEGE_TIERS).map(([tier, info]) => (
                    <SelectItem key={tier} value={tier}>L{info.level} - {info.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-[120px]">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="card-hover transition-all duration-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Username / Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Access Level</TableHead>
                <TableHead className="hidden lg:table-cell">Privileges</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden xl:table-cell">Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <p className="text-muted-foreground">No users found matching your filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((userItem) => {
                  const roleData = roles.find(r => r.name === userItem.role)
                  const meta = ROLE_METADATA[userItem.role]
                  const roleColor = meta?.color || roleData?.color || 'bg-gray-100 text-gray-700 border-gray-200'
                  const roleLabel = meta?.label || roleData?.label || userItem.role
                  const perms = getUserPermissions(userItem)
                  const isCustomPerms = parsePermissions(userItem.permissions).length > 0
                  const tier = meta?.tier
                  return (
                    <TableRow key={userItem.id} className={`hover:bg-gray-50/50 transition-colors ${!userItem.active ? 'opacity-50' : ''}`}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                            {(userItem.name || '').split(' ').map((n) => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{userItem.name}</p>
                            {(userItem as any).department && (
                              <p className="text-[10px] text-muted-foreground">{(userItem as any).department}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{userItem.email}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${roleColor}`}>{roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {tier && <TierBadge tier={tier} />}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
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
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {userItem.lastLogin ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(userItem.lastLogin)}
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
                                onClick={() => openDeleteDialog(userItem)}
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

      {/* ── Create User Dialog ─────────────────────────────────────────── */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-emerald-600" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Fill in user details and assign a role with appropriate permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-1">
            {/* Personal Info */}
            <div>
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Personal Information</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="col-span-2">
                  <Label>Full Name <span className="text-red-500">*</span></Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" className="mt-1" />
                </div>
                <div>
                  <Label>Username or Email <span className="text-red-500">*</span></Label>
                  <Input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. johndoe" className="mt-1" />
                </div>
                <div>
                  <Label>Password <span className="text-red-500">*</span></Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" className="mt-1" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+233 XXX XXX XXX" className="mt-1" />
                </div>
                <div>
                  <Label>License Number</Label>
                  <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} placeholder="For pharmacists" className="mt-1" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Work Details */}
            <div>
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Details</Label>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <Label>Department</Label>
                  <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Shift</Label>
                  <Select value={form.shift} onValueChange={(v) => setForm({ ...form, shift: v })}>
                    <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select shift" /></SelectTrigger>
                    <SelectContent>
                      {SHIFTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Hire Date</Label>
                  <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} className="mt-1" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Role & Permissions */}
            <div>
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role & Permissions</Label>
              <div className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Assign Role</Label>
                    <Select value={form.role} onValueChange={handleCreateRoleChange}>
                      <SelectTrigger className="mt-1 h-10">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.filter(r => r.isActive).map((r) => {
                          const rMeta = ROLE_METADATA[r.name]
                          return (
                            <SelectItem key={r.id} value={r.name}>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-[10px] px-1.5 py-0 border ${rMeta?.color || r.color}`}>{rMeta?.label || r.label}</Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {getRolePerms(r.name).length} perms
                                </Badge>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {ROLE_METADATA[form.role] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {ROLE_METADATA[form.role].description}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Access Level</Label>
                    <div className="mt-2">
                      {ROLE_METADATA[form.role]?.tier && <TierBadge tier={ROLE_METADATA[form.role].tier} />}
                    </div>
                  </div>
                </div>

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
        <DialogContent className="max-w-3xl max-h-[90vh] rounded-xl">
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
                    {(selectedUser.name || '').split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-medium">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                  </div>
                  {ROLE_METADATA[selectedUser.role]?.tier && (
                    <div className="ml-auto">
                      <TierBadge tier={ROLE_METADATA[selectedUser.role].tier} />
                    </div>
                  )}
                </div>
              </div>

              {/* Editable Fields */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Details</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <Label>Phone</Label>
                    <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>License Number</Label>
                    <Input value={editForm.licenseNumber} onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Select value={editForm.department} onValueChange={(v) => setEditForm({ ...editForm, department: v })}>
                      <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select department" /></SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Shift</Label>
                    <Select value={editForm.shift} onValueChange={(v) => setEditForm({ ...editForm, shift: v })}>
                      <SelectTrigger className="mt-1 h-10"><SelectValue placeholder="Select shift" /></SelectTrigger>
                      <SelectContent>
                        {SHIFTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Role Dropdown */}
              <div>
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Role & Permissions</Label>
                <div className="space-y-3 mt-2">
                  <div>
                    <Label>Change Role</Label>
                    <Select value={editForm.role} onValueChange={handleEditRoleChange}>
                      <SelectTrigger className="mt-1 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.filter(r => r.isActive).map((r) => {
                          const rMeta = ROLE_METADATA[r.name]
                          return (
                            <SelectItem key={r.id} value={r.name}>
                              <div className="flex items-center gap-2">
                                <Badge className={`text-[10px] px-1.5 py-0 border ${rMeta?.color || r.color}`}>{rMeta?.label || r.label}</Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {getRolePerms(r.name).length}/{ALL_PERMISSIONS.length}
                                </Badge>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    {ROLE_METADATA[editForm.role] && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {ROLE_METADATA[editForm.role].description}
                      </p>
                    )}
                  </div>

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
        <DialogContent className="max-w-lg max-h-[90vh] rounded-xl">
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
            const meta = ROLE_METADATA[selectedUser.role]
            const detailRoleLabel = meta?.label || detailRoleData?.label || selectedUser.role
            const detailRoleColor = meta?.color || detailRoleData?.color || 'bg-gray-100 text-gray-700 border-gray-200'
            return (
              <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-1">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-lg font-bold text-emerald-700">
                      {(selectedUser.name || '').split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <p className="text-lg font-semibold">{selectedUser.name}</p>
                      <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`text-xs px-2 py-0.5 border ${detailRoleColor}`}>{detailRoleLabel}</Badge>
                      {meta?.tier && <TierBadge tier={meta.tier} />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
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
                    <div>
                      <span className="text-muted-foreground">Created:</span>
                      <span className="ml-2 font-medium">{formatDate(selectedUser.createdAt)}</span>
                    </div>
                    {(selectedUser as any).department && (
                      <div>
                        <span className="text-muted-foreground">Department:</span>
                        <span className="ml-2 font-medium">{(selectedUser as any).department}</span>
                      </div>
                    )}
                    {(selectedUser as any).shift && (
                      <div>
                        <span className="text-muted-foreground">Shift:</span>
                        <span className="ml-2 font-medium">{(selectedUser as any).shift}</span>
                      </div>
                    )}
                    {meta && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Role Description:</span>
                        <p className="text-xs mt-0.5">{meta.description}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Granted Permissions ({perms.length}/{ALL_PERMISSIONS.length})</Label>
                    {isCustomPerms && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Custom</Badge>
                    )}
                  </div>
                  <div className="border rounded-lg divide-y">
                    {PERMISSION_CATEGORIES.map((cat) => {
                      const catPerms = cat.permissions.filter(p => perms.includes(p.key))
                      if (catPerms.length === 0) return null
                      const CatIcon = CATEGORY_ICONS[cat.category] || Shield
                      return (
                        <div key={cat.category}>
                          <div className="px-3 py-1.5 bg-gray-50 border-b text-[10px] font-semibold text-gray-500 uppercase flex items-center gap-1.5">
                            <CatIcon className="h-3 w-3" />
                            {cat.category} ({catPerms.length}/{cat.permissions.length})
                          </div>
                          {cat.permissions.map((perm) => {
                            const has = perms.includes(perm.key)
                            if (!has) return null
                            return (
                              <div key={perm.key} className="flex items-center gap-3 px-3 py-2">
                                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                                <span className="text-sm font-medium">{perm.label}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
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

      {/* ── Delete User Confirmation Dialog ────────────────────────────── */}
      <Dialog open={deleteDialog} onOpenChange={(open) => { if (!open || !deleting) setDeleteDialog(false) }}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete User
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All data for this user will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{selectedUser.name}</p>
                <Badge className={`text-xs ${ROLE_METADATA[selectedUser.role]?.color || ''}`}>
                  {ROLE_METADATA[selectedUser.role]?.label || selectedUser.role}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : <>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete User
              </>}
            </Button>
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
              <p className="text-sm text-muted-foreground">Create and manage custom roles with granular permissions ({ALL_PERMISSIONS.length} total permissions across {PERMISSION_CATEGORIES.length} categories)</p>
            </div>
            <Button onClick={() => {
              setRoleForm({ name: '', label: '', description: '', color: '' })
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
              const meta = ROLE_METADATA[role.name]
              const tier = meta?.tier
              return (
                <Card key={role.id} className={`relative overflow-hidden ${!role.isActive ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-xs px-2 py-0.5 border ${meta?.color || role.color}`}>{meta?.label || role.label}</Badge>
                          {role.isSystem && <Badge variant="outline" className="text-[10px] h-5">System</Badge>}
                          {!role.isActive && <Badge variant="secondary" className="text-[10px] h-5">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">{meta?.description || role.description || 'No description'}</p>
                        {tier && (
                          <div className="mt-1">
                            <TierBadge tier={tier} />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRoleDialog(role)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {!role.isSystem && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => { setSelectedRole(role); setDeleteRoleDialog(true) }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{permCount} permissions</span>
                      <span className="text-muted-foreground">{role._count.users} user{role._count.users !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Category breakdown */}
                    <div className="mt-2 space-y-1">
                      {(() => {
                        try {
                          const rolePerms: string[] = JSON.parse(role.permissions)
                          return PERMISSION_CATEGORIES.map((cat) => {
                            const catCount = cat.permissions.filter(p => rolePerms.includes(p.key)).length
                            return (
                              <div key={cat.category} className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${catCount === cat.permissions.length ? 'bg-emerald-500' : catCount > 0 ? 'bg-emerald-300' : 'bg-gray-100'}`}
                                    style={{ width: `${cat.permissions.length > 0 ? (catCount / cat.permissions.length) * 100 : 0}%` }}
                                  />
                                </div>
                                <span className="text-[9px] text-muted-foreground w-16 text-right">{catCount}/{cat.permissions.length}</span>
                              </div>
                            )
                          })
                        } catch { return null }
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Create Role Dialog */}
          <Dialog open={createRoleDialog} onOpenChange={setCreateRoleDialog}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-600" />
                  Create New Role
                </DialogTitle>
                <DialogDescription>Define a new role with custom permissions and access levels.</DialogDescription>
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
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-teal-600" />
                  Edit Role: {selectedRole?.label}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-3">
                  <Badge className={`text-xs px-2 py-0.5 border ${ROLE_METADATA[selectedRole?.name || '']?.color || selectedRole?.color || ''}`}>
                    {ROLE_METADATA[selectedRole?.name || '']?.label || selectedRole?.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{selectedRole?._count.users} user(s) assigned</span>
                  {ROLE_METADATA[selectedRole?.name || '']?.tier && <TierBadge tier={ROLE_METADATA[selectedRole?.name || '']!.tier} />}
                </div>
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

          {/* Delete Role Dialog */}
          <Dialog open={deleteRoleDialog} onOpenChange={setDeleteRoleDialog}>
            <DialogContent className="sm:max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <Trash2 className="h-5 w-5" />
                  Delete Role
                </DialogTitle>
                <DialogDescription>
                  {selectedRole?.isSystem
                    ? 'System roles cannot be deleted.'
                    : selectedRole && selectedRole._count.users > 0
                    ? `Cannot delete: ${selectedRole._count.users} user(s) are assigned. Reassign them first.`
                    : 'This action cannot be undone.'}
                </DialogDescription>
              </DialogHeader>
              {selectedRole && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                  <p className="text-sm font-medium">{ROLE_METADATA[selectedRole.name]?.label || selectedRole.label}</p>
                  <p className="text-xs text-muted-foreground">{selectedRole._count.users} user(s) assigned</p>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteRoleDialog(false)} disabled={saving}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDeleteRole(selectedRole!)}
                  disabled={saving || selectedRole?.isSystem || (selectedRole?._count.users ?? 0) > 0}
                >
                  {saving ? 'Deleting...' : 'Delete Role'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Role Comparison Matrix Tab */}
      {activeTab === 'matrix' && currentUser?.role === 'SUPER_ADMIN' && (
        <RoleComparisonMatrix roles={roles} />
      )}
    </div>
  )
}
