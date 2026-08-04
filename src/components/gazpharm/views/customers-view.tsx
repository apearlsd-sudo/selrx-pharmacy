'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, Search, Plus, Edit, Eye, Phone, Mail, Shield, X
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
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store/app-store'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'

interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  dateOfBirth: string | null
  gender: string | null
  address: string | null
  insuranceProvider: string | null
  insurancePolicyNo: string | null
  allergies: string | null
  notes: string | null
}

export function CustomersView() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [formDialog, setFormDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '',
    gender: '', address: '', insuranceProvider: '', insurancePolicyNo: '',
    allergies: '', notes: '',
  })
  const addToast = useAppStore((s) => s.addToast)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      const res = await fetch(`/api/customers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCustomers(Array.isArray(data) ? data : data.customers || [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load customers', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, addToast])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const openCreateDialog = () => {
    setEditingCustomer(null)
    setForm({ firstName: '', lastName: '', email: '', phone: '', dateOfBirth: '', gender: '', address: '', insuranceProvider: '', insurancePolicyNo: '', allergies: '', notes: '' })
    setFormDialog(true)
  }

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      firstName: customer.firstName, lastName: customer.lastName,
      email: customer.email || '', phone: customer.phone || '',
      dateOfBirth: customer.dateOfBirth || '', gender: customer.gender || '',
      address: customer.address || '', insuranceProvider: customer.insuranceProvider || '',
      insurancePolicyNo: customer.insurancePolicyNo || '', allergies: customer.allergies || '',
      notes: customer.notes || '',
    })
    setFormDialog(true)
  }

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) return
    try {
      if (editingCustomer) {
        await fetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        addToast({ title: 'Updated', description: 'Customer updated', variant: 'success' })
      } else {
        await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        addToast({ title: 'Created', description: 'New customer added', variant: 'success' })
      }
      setFormDialog(false)
      fetchCustomers()
    } catch {
      addToast({ title: 'Error', description: 'Failed to save customer', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader icon={Users} title="Customers" description="Manage your customer records and information" />
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{customers.length}</p>
              <p className="text-xs text-muted-foreground">Total Customers</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{customers.filter((c) => c.insuranceProvider).length}</p>
              <p className="text-xs text-muted-foreground">With Insurance</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{customers.filter((c) => c.allergies).length}</p>
              <p className="text-xs text-muted-foreground">Allergy Alerts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50/50"
              />
            </div>
            <Button onClick={openCreateDialog} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              New Customer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="hidden md:table-cell">Insurance</TableHead>
                <TableHead className="hidden lg:table-cell">Allergies</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="p-0">
                    <EmptyState icon={Users} title="No customers found" description="Try adjusting your search or add a new customer" />
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                          {customer.firstName[0]}{customer.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{customer.firstName} {customer.lastName}</p>
                          <p className="text-xs text-muted-foreground">{customer.gender || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="text-sm space-y-0.5">
                        {customer.email && (
                          <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{customer.email}</p>
                        )}
                        {customer.phone && (
                          <p className="flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{customer.phone}</p>
                        )}
                        {!customer.email && !customer.phone && <p className="text-muted-foreground">No contact info</p>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {customer.insuranceProvider ? (
                        <Badge variant="outline" className="text-xs">{customer.insuranceProvider}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {customer.allergies ? (
                        <div className="flex flex-wrap gap-1">
                          {customer.allergies.split(',').map((a, i) => (
                            <Badge key={i} className="bg-red-100 text-red-700 border-red-200 text-xs">{a.trim()}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedCustomer(customer); setDetailDialog(true) }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditDialog(customer)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-lg font-bold text-emerald-700">
                  {selectedCustomer.firstName[0]}{selectedCustomer.lastName[0]}
                </div>
                <div>
                  <p className="text-lg font-semibold">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                  <p className="text-sm text-muted-foreground">{selectedCustomer.gender || ''} {selectedCustomer.dateOfBirth ? `· DOB: ${selectedCustomer.dateOfBirth}` : ''}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span><p className="font-medium">{selectedCustomer.email || '—'}</p></div>
                <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{selectedCustomer.phone || '—'}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground">Address:</span><p className="font-medium">{selectedCustomer.address || '—'}</p></div>
                <div><span className="text-muted-foreground">Insurance:</span><p className="font-medium">{selectedCustomer.insuranceProvider || '—'}</p></div>
                <div><span className="text-muted-foreground">Policy #:</span><p className="font-medium">{selectedCustomer.insurancePolicyNo || '—'}</p></div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Allergies:</span>
                  {selectedCustomer.allergies ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedCustomer.allergies.split(',').map((a, i) => (
                        <Badge key={i} className="bg-red-100 text-red-700 border-red-200">{a.trim()}</Badge>
                      ))}
                    </div>
                  ) : <p className="font-medium">None recorded</p>}
                </div>
                {selectedCustomer.notes && (
                  <div className="col-span-2 bg-muted rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{selectedCustomer.notes}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog(false)}>Close</Button>
            <Button onClick={() => { setDetailDialog(false); openEditDialog(selectedCustomer!) }} className="bg-emerald-600 hover:bg-emerald-700">
              Edit Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={formDialog} onOpenChange={setFormDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
            <div>
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} placeholder="YYYY-MM-DD" className="mt-1" />
            </div>
            <div>
              <Label>Gender</Label>
              <Input value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="M/F/Other" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Insurance Provider</Label>
              <Input value={form.insuranceProvider} onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Policy Number</Label>
              <Input value={form.insurancePolicyNo} onChange={(e) => setForm({ ...form, insurancePolicyNo: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Allergies</Label>
              <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Comma-separated (e.g., Penicillin, Sulfa)" className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700" disabled={!form.firstName || !form.lastName}>
              {editingCustomer ? 'Update' : 'Create'} Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
