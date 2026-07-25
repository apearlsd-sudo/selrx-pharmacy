'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  UserCog, Shield, CheckCircle, XCircle, Edit, Clock, Plus, Ban, UserCheck
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
  active: boolean
  lastLogin: string | null
  createdAt: string
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-red-100 text-red-700 border-red-200' },
  PHARMACIST: { label: 'Pharmacist', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  TECHNICIAN: { label: 'Technician', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  CASHIER: { label: 'Cashier', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  CLERK: { label: 'Clerk', color: 'bg-gray-100 text-gray-700 border-gray-200' },
}

export function UsersView() {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '',
  })
  const [editRole, setEditRole] = useState('')
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

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) return
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify(form),
      })
      addToast({ title: 'Created', description: 'User created successfully', variant: 'success' })
      setCreateDialog(false)
      setForm({ name: '', email: '', password: '', role: 'CLERK', phone: '', licenseNumber: '' })
      fetchUsers()
    } catch {
      addToast({ title: 'Error', description: 'Failed to create user', variant: 'destructive' })
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

  const handleUpdateRole = async () => {
    if (!selectedUser) return
    try {
      await fetch(`/api/users?id=${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({ role: editRole }),
      })
      addToast({ title: 'Updated', description: `${selectedUser.name} role changed to ${editRole}`, variant: 'success' })
      setEditDialog(false)
      fetchUsers()
    } catch {
      addToast({ title: 'Error', description: 'Failed to update role', variant: 'destructive' })
    }
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
          <Button onClick={() => setCreateDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
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
                <TableHead className="hidden md:table-cell">License</TableHead>
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
                      <TableCell className="hidden md:table-cell text-sm font-mono">{userItem.licenseNumber || '—'}</TableCell>
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
                          {currentUser?.role === 'SUPER_ADMIN' && userItem.id !== currentUser.id && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => { setSelectedUser(userItem); setEditRole(userItem.role); setEditDialog(true) }}>
                                <UserCog className="h-3.5 w-3.5" />
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

      {/* Role Permission Matrix */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Role Permissions</h3>
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
                {[
                  ['Dashboard', true, true, true, true, true],
                  ['POS Terminal', true, true, true, true, false],
                  ['Inventory', true, true, true, false, false],
                  ['Prescriptions', true, true, true, false, false],
                  ['Customers', true, true, true, true, true],
                  ['User Management', true, false, false, false, false],
                  ['Hardware', true, true, false, false, false],
                  ['Reports', true, true, false, false, false],
                ].map(([perm, ...roles]) => (
                  <TableRow key={perm as string}>
                    <TableCell className="font-medium text-sm">{perm as string}</TableCell>
                    {roles.map((allowed, i) => (
                      <TableCell key={i} className="text-center">
                        {allowed ? <CheckCircle className="h-4 w-4 text-emerald-600 mx-auto" /> : <XCircle className="h-4 w-4 text-gray-300 mx-auto" />}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Full Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                  <SelectItem value="TECHNICIAN">Technician</SelectItem>
                  <SelectItem value="CASHIER">Cashier</SelectItem>
                  <SelectItem value="CLERK">Clerk</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>License Number (for pharmacists)</Label>
              <Input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.name || !form.email || !form.password}>
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium">{selectedUser.name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                    <SelectItem value="PHARMACIST">Pharmacist</SelectItem>
                    <SelectItem value="TECHNICIAN">Technician</SelectItem>
                    <SelectItem value="CASHIER">Cashier</SelectItem>
                    <SelectItem value="CLERK">Clerk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleUpdateRole} className="bg-emerald-600 hover:bg-emerald-700">
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
