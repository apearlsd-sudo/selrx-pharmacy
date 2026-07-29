'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import {
  Tags, Pill, Truck, Plus, Trash2, Search, Package, ChevronRight,
  AlertCircle, CheckCircle2, Factory, Edit2, Save, X,
  Upload, FileSpreadsheet, Download,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'

// ── Types ──────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  description: string | null
  _count?: { products: number }
}

interface Vendor {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  _count?: { products: number }
}

interface Manufacturer {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  website: string | null
  notes: string | null
  _count?: { products: number }
  createdAt: string
}

interface DrugProduct {
  id: string
  name: string
  ndc: string | null
  category: string
  sellingPrice: number
  costPrice: number | null
  manufacturer: string | null
  manufacturerId: string | null
  dosageForm: string | null
  strength: string | null
  unitOfMeasure: string
  vendor?: { id: string; name: string } | null
  manufacturerRef?: { id: string; name: string } | null
  inventory?: { quantity: number }[]
  reorderPoint: number
  expiryDate: string | null
  batchNumber: string | null
  status: string
}

const DOSAGE_FORMS: string[] = []

const BUILT_IN_CATEGORIES: string[] = []

// ── Section Button Component ─────────────────────────────────────────────

const SECTIONS = [
  { key: 'category', label: 'Add Category', icon: Tags, desc: 'Drug categories & departments', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { key: 'drug', label: 'Add Drug Name', icon: Pill, desc: 'Register new products', color: 'bg-teal-600 hover:bg-teal-700' },
  { key: 'vendor', label: 'Add Vendor', icon: Truck, desc: 'Suppliers & distributors', color: 'bg-green-600 hover:bg-green-700' },
  { key: 'manufacturer', label: 'Add Manufacturer', icon: Factory, desc: 'Drug manufacturers & producers', color: 'bg-indigo-600 hover:bg-indigo-700' },
] as const

type SectionKey = typeof SECTIONS[number]['key']

// ── Modal Components ───────────────────────────────────────────────────

// ── Category Modal ──────────────────────────────────────────────────────

function CategoryModal({
  open,
  onOpenChange,
  editingCategory,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingCategory: Category | null
  onSaved: (category: Category) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const isEditing = !!editingCategory

  useEffect(() => {
    if (open) {
      setName(editingCategory?.name.replace(/_/g, ' ') || '')
      setDescription(editingCategory?.description || '')
      setSaving(false)
    }
  }, [open, editingCategory])

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      if (isEditing) {
        const res = await fetch(`/api/categories/${editingCategory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update')
        }
        const updated = await res.json()
        addToast({ title: 'Category Updated', description: `"${name.trim()}" updated successfully`, variant: 'success' })
        onSaved(updated)
      } else {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create')
        }
        const created = await res.json()
        addToast({ title: 'Category Created', description: `"${name.trim()}" added successfully`, variant: 'success' })
        onSaved(created)
      }
      onOpenChange(false)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update category details' : 'Create a new drug category'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs">Category Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., ANALGESICS" className="mt-1" onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of this category" className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> {isEditing ? 'Update' : 'Create'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Vendor Modal ────────────────────────────────────────────────────────

function VendorModal({
  open,
  onOpenChange,
  editingVendor,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingVendor: Vendor | null
  onSaved: (vendor: Vendor) => void
}) {
  const [form, setForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const isEditing = !!editingVendor

  useEffect(() => {
    if (open) {
      setForm({
        name: editingVendor?.name || '',
        contactPerson: editingVendor?.contactPerson || '',
        email: editingVendor?.email || '',
        phone: editingVendor?.phone || '',
        address: editingVendor?.address || '',
        notes: editingVendor?.notes || '',
      })
      setSaving(false)
    }
  }, [open, editingVendor])

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (isEditing) {
        const res = await fetch(`/api/vendors/${editingVendor.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            contactPerson: form.contactPerson.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            notes: form.notes.trim() || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to update')
        }
        const updated = await res.json()
        addToast({ title: 'Vendor Updated', description: `"${form.name.trim()}" updated successfully`, variant: 'success' })
        onSaved(updated)
      } else {
        const res = await fetch('/api/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name.trim(),
            contactPerson: form.contactPerson.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            notes: form.notes.trim() || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Failed to create')
        }
        const created = await res.json()
        addToast({ title: 'Vendor Added', description: `"${form.name.trim()}" registered as supplier`, variant: 'success' })
        onSaved(created)
      }
      onOpenChange(false)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update vendor details' : 'Register a new vendor / supplier'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
          <div className="col-span-2">
            <Label className="text-xs">Vendor Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., PharmaCorp Distribution" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Contact Person</Label>
            <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Full name" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vendor@example.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street, City, State" className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || saving} className="bg-green-600 hover:bg-green-700">
            {saving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> {isEditing ? 'Update' : 'Create'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Manufacturer Modal ─────────────────────────────────────────────────

function ManufacturerModal({
  open,
  onOpenChange,
  editingManufacturer,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingManufacturer: Manufacturer | null
  onSaved: (manufacturer: Manufacturer) => void
}) {
  const [form, setForm] = useState({
    name: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const isEditing = !!editingManufacturer

  useEffect(() => {
    if (open) {
      setForm({
        name: editingManufacturer?.name || '',
        contactPerson: editingManufacturer?.contactPerson || '',
        email: editingManufacturer?.email || '',
        phone: editingManufacturer?.phone || '',
        address: editingManufacturer?.address || '',
        city: editingManufacturer?.city || '',
        country: editingManufacturer?.country || '',
        website: editingManufacturer?.website || '',
        notes: editingManufacturer?.notes || '',
      })
      setSaving(false)
    }
  }, [open, editingManufacturer])

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
      }

      if (isEditing) {
        const res = await fetch('/api/manufacturers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingManufacturer.id, ...body }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Failed to update'))
        }
        const updated = await res.json()
        addToast({ title: 'Manufacturer Updated', description: `"${form.name.trim()}" updated successfully`, variant: 'success' })
        onSaved(updated)
      } else {
        const res = await fetch('/api/manufacturers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Failed to create'))
        }
        const created = await res.json()
        addToast({ title: 'Manufacturer Added', description: `"${form.name.trim()}" registered`, variant: 'success' })
        onSaved(created)
      }
      onOpenChange(false)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Manufacturer' : 'Add Manufacturer'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update manufacturer details' : 'Register a new drug manufacturer'}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
          <div className="col-span-2">
            <Label className="text-xs">Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Pfizer Inc." className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Contact Person</Label>
            <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} placeholder="Full name" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@company.com" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Website</Label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Country</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes" className="mt-1" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || saving} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> {isEditing ? 'Update' : 'Create'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Dosage Form Modal ─────────────────────────────────────────────────

function DosageFormModal({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (name: string) => void
}) {
  const [name, setName] = useState('')
  const addToast = useAppStore((s) => s.addToast)

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) setName('')
    onOpenChange(nextOpen)
  }

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    addToast({ title: 'Dosage Form Added', description: `"${trimmed}" added to list`, variant: 'success' })
    onSaved(trimmed)
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Dosage Form</DialogTitle>
          <DialogDescription>Create a new dosage form type</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Dosage Form Name <span className="text-red-500">*</span></Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Inhaler"
            className="mt-1"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim()} className="bg-teal-600 hover:bg-teal-700">
            <><Save className="h-4 w-4 mr-2" /> Create</>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Drug Edit Modal ─────────────────────────────────────────────────────

function DrugEditModal({
  open,
  onOpenChange,
  editingDrug,
  categories,
  vendors,
  manufacturers,
  dosageForms,
  onSaved,
  onOpenAddManufacturer,
  onOpenAddVendor,
  onOpenAddCategory,
  onOpenAddDosageForm,
  onDeleteCategory,
  onDeleteDosageForm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingDrug: DrugProduct | null
  categories: Category[]
  vendors: Vendor[]
  manufacturers: Manufacturer[]
  dosageForms: string[]
  onSaved: () => void
  onOpenAddManufacturer: () => void
  onOpenAddVendor: () => void
  onOpenAddCategory: () => void
  onOpenAddDosageForm: () => void
  onDeleteCategory: (catName: string) => void
  onDeleteDosageForm: (formName: string) => void
}) {
  const [form, setForm] = useState({
    name: '', ndc: '', category: 'OTC', dosageForm: '', manufacturerId: '', costPrice: '', sellingPrice: '',
    vendorId: '', reorderPoint: '', expiryDate: '', batchNumber: '',
  })
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)

  useEffect(() => {
    if (open && editingDrug) {
      setForm({
        name: editingDrug.name || '',
        ndc: editingDrug.ndc || '',
        category: editingDrug.category || 'OTC',
        dosageForm: editingDrug.dosageForm || '',
        manufacturerId: editingDrug.manufacturerId || '',
        costPrice: editingDrug.costPrice != null ? String(editingDrug.costPrice) : '',
        sellingPrice: editingDrug.sellingPrice != null ? String(editingDrug.sellingPrice) : '',
        vendorId: editingDrug.vendor?.id || '',
        reorderPoint: String(editingDrug.reorderPoint || 10),
        expiryDate: editingDrug.expiryDate ? editingDrug.expiryDate.split('T')[0] : '',
        batchNumber: editingDrug.batchNumber || '',
      })
      setSaving(false)
    }
  }, [open, editingDrug])

  const handleSave = async () => {
    if (!form.name.trim() || !form.sellingPrice) return
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${editingDrug?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
        body: JSON.stringify({
          name: form.name.trim(),
          ndc: form.ndc.trim() || null,
          category: form.category,
          dosageForm: form.dosageForm || null,
          manufacturerId: form.manufacturerId || null,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
          sellingPrice: parseFloat(form.sellingPrice),
          vendorId: form.vendorId || null,
          reorderPoint: parseInt(form.reorderPoint) || 10,
          expiryDate: form.expiryDate || null,
          batchNumber: form.batchNumber || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update product')
      }
      addToast({ title: 'Drug Updated', description: `"${form.name.trim()}" updated successfully`, variant: 'success' })
      onSaved()
      onOpenChange(false)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Drug / Product</DialogTitle>
          <DialogDescription>Update product details and pricing</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="col-span-2">
            <Label className="text-xs">Product Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Paracetamol 500mg" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">SKU / NDC</Label>
            <Input value={form.ndc} onChange={(e) => setForm({ ...form, ndc: e.target.value })} placeholder="e.g., SKU-00123" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={(v) => { if (v === '__new__') { onOpenAddCategory() } else if (v.startsWith('__del__:')) { onDeleteCategory(v.split(':').slice(1).join(':')) } else { setForm({ ...form, category: v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUILT_IN_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                ))}
                {categories.filter((c) => !BUILT_IN_CATEGORIES.includes(c.name)).map((c) => (
                  <Fragment key={c.id}>
                    <SelectItem value={c.name}>{c.name.replace(/_/g, ' ')}</SelectItem>
                    <SelectItem value={`__del__:${c.name}`} className="text-red-500 text-xs py-1 h-8 focus:bg-red-50 focus:text-red-600">
                      ↳ Delete "{c.name.replace(/_/g, ' ')}"
                    </SelectItem>
                  </Fragment>
                ))}
                <SelectItem value="__new__" className="text-emerald-600 font-medium">+ Add new category</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Manufacturer</Label>
            <Select value={form.manufacturerId || '_none'} onValueChange={(v) => { if (v === '__new__') { onOpenAddManufacturer() } else { setForm({ ...form, manufacturerId: v === '_none' ? '' : v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {manufacturers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
                <SelectItem value="__new__" className="text-emerald-600 font-medium">+ Add new manufacturer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Dosage Form</Label>
            <Select value={form.dosageForm || '_none'} onValueChange={(v) => { if (v === '__new__') { onOpenAddDosageForm() } else if (v.startsWith('__del__:')) { onDeleteDosageForm(v.split(':').slice(1).join(':')) } else { setForm({ ...form, dosageForm: v === '_none' ? '' : v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {dosageForms.map((f) => {
                  const isBuiltIn = DOSAGE_FORMS.includes(f)
                  return isBuiltIn ? (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ) : (
                    <Fragment key={f}>
                      <SelectItem value={f}>{f}</SelectItem>
                      <SelectItem value={`__del__:${f}`} className="text-red-500 text-xs py-1 h-8 focus:bg-red-50 focus:text-red-600">
                        ↳ Delete "{f}"
                      </SelectItem>
                    </Fragment>
                  )
                })}
                <SelectItem value="__new__" className="text-emerald-600 font-medium">+ Add new dosage form</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vendor / Supplier</Label>
            <Select value={form.vendorId || '_none'} onValueChange={(v) => { if (v === '__new__') { onOpenAddVendor() } else { setForm({ ...form, vendorId: v === '_none' ? '' : v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
                <SelectItem value="__new__" className="text-emerald-600 font-medium">+ Add new vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cost Price ($)</Label>
            <Input type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} placeholder="0.00" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Selling Price ($) <span className="text-red-500">*</span></Label>
            <Input type="number" step="0.01" min="0" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} placeholder="0.00" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Min Stock Level</Label>
            <Input type="number" min="0" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} placeholder="10" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Expiry Date</Label>
            <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Batch Number</Label>
            <Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="e.g., BN-00123" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.name.trim() || !form.sellingPrice || saving} className="bg-teal-600 hover:bg-teal-700">
            {saving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> Update Drug</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main View ──────────────────────────────────────────────────────────

export function MasterDataView() {
  const [activeSection, setActiveSection] = useState<SectionKey>('category')

  return (
    <div className="space-y-6">
      {/* Section Selector Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SECTIONS.map((sec) => {
          const Icon = sec.icon
          const isActive = activeSection === sec.key
          return (
            <button
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              className={`relative flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100'
                  : 'border-transparent bg-white hover:border-gray-200 hover:shadow-sm'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-emerald-600' : 'bg-gray-100'}`}>
                <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isActive ? 'text-emerald-800' : 'text-gray-700'}`}>{sec.label}</p>
                <p className={`text-xs ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>{sec.desc}</p>
              </div>
              {isActive && (
                <ChevronRight className="h-5 w-5 text-emerald-500 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Active Section Content */}
      {activeSection === 'category' && <CategorySection />}
      {activeSection === 'drug' && <DrugSection />}
      {activeSection === 'vendor' && <VendorSection />}
      {activeSection === 'manufacturer' && <ManufacturerSection />}
    </div>
  )
}

// ── CATEGORY SECTION ───────────────────────────────────────────────────

function CategorySection() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const addToast = useAppStore((s) => s.addToast)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/categories')
      if (res.ok) setCategories(await res.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load categories', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const openAdd = () => {
    setEditingCategory(null)
    setModalOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditingCategory(cat)
    setModalOpen(true)
  }

  const handleModalSaved = (saved: Category) => {
    fetchCategories()
  }

  const handleDelete = async (cat: Category) => {
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Deleted', description: `"${cat.name.replace(/_/g, ' ')}" removed`, variant: 'success' })
      fetchCategories()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Tags className="h-4 w-4 text-emerald-600" />
          Drug Categories ({categories.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Add Category
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Categories Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead className="hidden sm:table-cell">Description</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead className="text-center">Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No categories found</TableCell>
                </TableRow>
              ) : (
                filtered.map((cat) => {
                  const isBuiltIn = BUILT_IN_CATEGORIES.includes(cat.name)
                  const prodCount = cat._count?.products || 0
                  return (
                    <TableRow key={cat.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{cat.name.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{cat.description || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{prodCount}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {isBuiltIn ? (
                          <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">System</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-purple-100 text-purple-700 border-purple-200">Custom</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                            onClick={() => handleDelete(cat)}
                            disabled={isBuiltIn || prodCount > 0}
                            title={isBuiltIn ? 'System category' : prodCount > 0 ? `${prodCount} products linked` : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Category Modal */}
      <CategoryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingCategory={editingCategory}
        onSaved={handleModalSaved}
      />
    </div>
  )
}

// ── DRUG SECTION ────────────────────────────────────────────────────────

function DrugSection() {
  const [drugs, setDrugs] = useState<DrugProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const addToast = useAppStore((s) => s.addToast)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

  const [form, setForm] = useState({
    name: '', sku: '', category: '', dosageForm: '', manufacturerId: '', costPrice: '', sellingPrice: '',
    stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', vendorId: '',
  })

  // Modal states for "+ Add new" in drug form
  const [mfgModalOpen, setMfgModalOpen] = useState(false)
  const [vendorModalOpen, setVendorModalOpen] = useState(false)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [dosageFormModalOpen, setDosageFormModalOpen] = useState(false)

  // Drug edit modal
  const [drugEditOpen, setDrugEditOpen] = useState(false)
  const [editingDrug, setEditingDrug] = useState<DrugProduct | null>(null)

  // Custom dosage forms
  const [customDosageForms, setCustomDosageForms] = useState<string[]>([])

  // ── Import state ────────────────────────────────────────────────
  const [importDialog, setImportDialog] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean; message?: string; error?: string;
    totalRows?: number; created?: number; failed?: number; skipped?: number;
    validationErrors?: { row: number; name?: string; errors: string[] }[]
    createdProducts?: { id: string; name: string; ndc: string | null }[]
  } | null>(null)
  const [importPreview, setImportPreview] = useState<{ name: string; rows: number; size: string } | null>(null)

  const currentUser = useAppStore((s) => s.user)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)

  const allDosageForms = [...DOSAGE_FORMS, ...customDosageForms]

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, catRes, venRes, mfgRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/categories'),
        fetch('/api/vendors'),
        fetch('/api/manufacturers'),
      ])
      if (prodRes.ok) {
        const data = await prodRes.json()
        const list = Array.isArray(data) ? data : data.products || []
        setDrugs(list)
      }
      if (catRes.ok) setCategories(await catRes.json())
      if (venRes.ok) setVendors(await venRes.json())
      if (mfgRes.ok) setManufacturers(await mfgRes.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchData() }, [fetchData])

  // Delete a custom category from the dropdown
  const handleDeleteCategory = async (catName: string) => {
    const cat = categories.find((c) => c.name === catName && !BUILT_IN_CATEGORIES.includes(c.name))
    if (!cat) return
    const prodCount = cat._count?.products || 0
    if (prodCount > 0) {
      addToast({ title: 'Cannot Delete', description: `${prodCount} product(s) linked to "${catName.replace(/_/g, ' ')}". Reassign them first.`, variant: 'destructive' })
      return
    }
    try {
      const res = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete')
      }
      addToast({ title: 'Deleted', description: `"${catName.replace(/_/g, ' ')}" removed`, variant: 'success' })
      if (form.category === catName) setForm({ ...form, category: '' })
      fetchData()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  // Remove a custom dosage form
  const handleDeleteDosageForm = (formName: string) => {
    setCustomDosageForms((prev) => prev.filter((f) => f !== formName))
    if (form.dosageForm === formName) setForm({ ...form, dosageForm: '' })
    addToast({ title: 'Removed', description: `"${formName}" removed from dosage forms`, variant: 'success' })
  }

  // Re-fetch drugs when inventory changes (stock counts, adjusts)
  const prevInvVer = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInvVer.current !== inventoryVersion) {
      prevInvVer.current = inventoryVersion
      fetch('/api/products').then(r => { if (r.ok) r.json().then(d => setDrugs(Array.isArray(d) ? d : d.products || [])) }).catch(() => {})
    }
  }, [inventoryVersion])

  const handleCreate = async () => {
    if (!form.name || !form.sellingPrice) return
    setSaving(true)
    try {
      const selectedMfg = manufacturers.find((m) => m.id === form.manufacturerId)
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'SUPER_ADMIN',
        },
        body: JSON.stringify({
          name: form.name,
          ndc: form.sku || null,
          category: form.category,
          dosageForm: form.dosageForm || null,
          manufacturer: selectedMfg?.name || null,
          manufacturerId: form.manufacturerId || null,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
          sellingPrice: parseFloat(form.sellingPrice),
          reorderPoint: parseInt(form.minStockLevel) || 10,
          expiryDate: form.expiryDate || null,
          batchNumber: form.barcode || null,
          vendorId: form.vendorId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create product')
      }
      const newProduct = await res.json()

      // Set initial stock
      const qty = parseInt(form.stockQuantity) || 0
      if (qty > 0) {
        await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: newProduct.id, adjustment: qty, reason: 'Initial stock on creation' }),
        })
      }

      addToast({ title: 'Drug Added', description: `"${form.name}" registered in inventory`, variant: 'success' })
      setForm({
        name: '', sku: '', category: 'OTC', dosageForm: '', manufacturerId: '', costPrice: '', sellingPrice: '',
        stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', vendorId: '',
      })
      fetchData()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add drug', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Handlers for "+ Add new" modals
  const handleManufacturerCreated = (mfg: Manufacturer) => {
    setManufacturers((prev) => [...prev, mfg])
    setForm((prev) => ({ ...prev, manufacturerId: mfg.id }))
  }

  const handleVendorCreated = (vendor: Vendor) => {
    setVendors((prev) => [...prev, vendor])
    setForm((prev) => ({ ...prev, vendorId: vendor.id }))
  }

  const handleCategoryCreated = (cat: Category) => {
    setCategories((prev) => [...prev, cat])
    setForm((prev) => ({ ...prev, category: cat.name }))
  }

  const handleDosageFormCreated = (name: string) => {
    setCustomDosageForms((prev) => [...prev, name])
    setForm((prev) => ({ ...prev, dosageForm: name }))
  }

  // Handlers for drug edit modal "+ Add new"
  const handleEditManufacturerCreated = (mfg: Manufacturer) => {
    setManufacturers((prev) => [...prev, mfg])
  }

  const handleEditVendorCreated = (vendor: Vendor) => {
    setVendors((prev) => [...prev, vendor])
  }

  const handleEditCategoryCreated = (cat: Category) => {
    setCategories((prev) => [...prev, cat])
  }

  const handleEditDosageFormCreated = (name: string) => {
    setCustomDosageForms((prev) => [...prev, name])
  }

  // ── Import handlers ──────────────────────────────────────────────
  const handleImportFileSelect = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      addToast({ title: 'File Too Large', description: 'Maximum file size is 5 MB', variant: 'destructive' })
      return
    }
    setImportFile(file)
    setImportResult(null)
    const estRows = Math.max(1, Math.floor(file.size / 200))
    const sizeStr = file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(1)} MB`
    setImportPreview({ name: file.name, rows: estRows, size: sizeStr })
  }

  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
        headers: { 'x-user-role': currentUser?.role || 'SUPER_ADMIN' },
      })
      const data = await res.json()
      setImportResult(data)
      if (data.success && data.created > 0) {
        addToast({
          title: 'Import Successful',
          description: `${data.created} product${data.created !== 1 ? 's' : ''} imported${data.failed > 0 ? ` (${data.failed} failed)` : ''}`,
          variant: 'success',
        })
        bumpInventoryVersion()
      } else if (!data.success) {
        addToast({ title: 'Import Failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (err: any) {
      setImportResult({ success: false, error: err.message || 'Network error' })
      addToast({ title: 'Import Error', description: err.message || 'Failed to import', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const filtered = drugs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.ndc && d.ndc.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-4">
      {/* Drug Registration Form */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Pill className="h-4 w-4 text-teal-600" />
              Register New Drug / Product
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-teal-600 text-teal-700 hover:bg-teal-50"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/products/import')
                    if (res.ok) {
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'product-import-template.xlsx'
                      a.click()
                      URL.revokeObjectURL(url)
                      addToast({ title: 'Template Downloaded', description: 'Fill in your product data and import', variant: 'success' })
                    }
                  } catch {
                    addToast({ title: 'Error', description: 'Failed to download template', variant: 'destructive' })
                  }
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Template
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-teal-600 text-teal-700 hover:bg-teal-50"
                onClick={() => setImportDialog(true)}
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Import
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Product Name - full width */}
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-xs">Product Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., Paracetamol 500mg" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>

            {/* SKU */}
            <div>
              <Label className="text-xs">SKU / NDC</Label>
              <Input placeholder="e.g., SKU-00123" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mt-1" />
            </div>

            {/* Manufacturer Dropdown */}
            <div>
              <Label className="text-xs">Manufacturer</Label>
              <Select
                value={form.manufacturerId || '_none'}
                onValueChange={(v) => {
                  if (v === '__new__') {
                    setMfgModalOpen(true)
                  } else {
                    setForm({ ...form, manufacturerId: v === '_none' ? '' : v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__" className="text-emerald-600 font-medium">
                    + Add new manufacturer
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Dropdown */}
            <div>
              <Label className="text-xs">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => {
                  if (v === '__new__') {
                    setCatModalOpen(true)
                  } else if (v.startsWith('__del__:')) {
                    const catName = v.split(':').slice(1).join(':')
                    handleDeleteCategory(catName)
                  } else {
                    setForm({ ...form, category: v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUILT_IN_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                  ))}
                  {categories.filter((c) => !BUILT_IN_CATEGORIES.includes(c.name)).map((c) => (
                    <Fragment key={c.id}>
                      <SelectItem value={c.name}>{c.name.replace(/_/g, ' ')}</SelectItem>
                      <SelectItem value={`__del__:${c.name}`} className="text-red-500 text-xs py-1 h-8 focus:bg-red-50 focus:text-red-600">
                        ↳ Delete "{c.name.replace(/_/g, ' ')}"
                      </SelectItem>
                    </Fragment>
                  ))}
                  <SelectItem value="__new__" className="text-emerald-600 font-medium">
                    + Add new category
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dosage Form Dropdown */}
            <div>
              <Label className="text-xs">Dosage Form</Label>
              <Select
                value={form.dosageForm || '_none'}
                onValueChange={(v) => {
                  if (v === '__new__') {
                    setDosageFormModalOpen(true)
                  } else if (v.startsWith('__del__:')) {
                    const formName = v.split(':').slice(1).join(':')
                    handleDeleteDosageForm(formName)
                  } else {
                    setForm({ ...form, dosageForm: v === '_none' ? '' : v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select form..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {allDosageForms.map((f) => {
                    const isCustom = customDosageForms.includes(f)
                    return isCustom ? (
                      <Fragment key={f}>
                        <SelectItem value={f}>{f}</SelectItem>
                        <SelectItem value={`__del__:${f}`} className="text-red-500 text-xs py-1 h-8 focus:bg-red-50 focus:text-red-600">
                          ↳ Delete "{f}"
                        </SelectItem>
                      </Fragment>
                    ) : (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    )
                  })}
                  <SelectItem value="__new__" className="text-emerald-600 font-medium">
                    + Add new dosage form
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cost Price */}
            <div>
              <Label className="text-xs">Cost Price ($)</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} className="mt-1" />
            </div>

            {/* Selling Price */}
            <div>
              <Label className="text-xs">Selling Price ($) <span className="text-red-500">*</span></Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} className="mt-1" />
            </div>

            {/* Vendor Dropdown */}
            <div>
              <Label className="text-xs">Vendor / Supplier</Label>
              <Select
                value={form.vendorId || '_none'}
                onValueChange={(v) => {
                  if (v === '__new__') {
                    setVendorModalOpen(true)
                  } else {
                    setForm({ ...form, vendorId: v === '_none' ? '' : v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                  <SelectItem value="__new__" className="text-emerald-600 font-medium">
                    + Add new vendor
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stock Quantity */}
            <div>
              <Label className="text-xs">Stock Quantity</Label>
              <Input type="number" min="0" placeholder="0" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} className="mt-1" />
            </div>

            {/* Min Stock Level */}
            <div>
              <Label className="text-xs">Min Stock Level</Label>
              <Input type="number" min="0" placeholder="10" value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} className="mt-1" />
            </div>

            {/* Expiry Date */}
            <div>
              <Label className="text-xs">Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="mt-1" />
            </div>

            {/* Barcode */}
            <div>
              <Label className="text-xs">Barcode</Label>
              <Input placeholder="e.g., 1234567890123" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="mt-1" />
            </div>

            {/* Submit - full width */}
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                onClick={handleCreate}
                disabled={!form.name || !form.sellingPrice || saving}
                className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700"
              >
                {saving ? 'Registering...' : <><Pill className="h-4 w-4 mr-2" /> Register Drug</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search drugs by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Drug Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drug Name</TableHead>
                <TableHead className="hidden md:table-cell">Manufacturer</TableHead>
                <TableHead className="hidden sm:table-cell">Dosage Form</TableHead>
                <TableHead className="hidden md:table-cell">Vendor</TableHead>
                <TableHead className="hidden lg:table-cell">SKU</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Stock</TableHead>
                <TableHead className="hidden lg:table-cell">Expiry</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No drugs found</TableCell>
                </TableRow>
              ) : (
                filtered.map((drug) => (
                  <TableRow key={drug.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
                          <Pill className="h-3.5 w-3.5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{drug.name}</p>
                          {drug.strength && <p className="text-[10px] text-muted-foreground">{drug.strength}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {drug.manufacturerRef?.name || drug.manufacturer || '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {drug.dosageForm ? (
                        <Badge variant="outline" className="text-[10px]">{drug.dosageForm}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{drug.vendor?.name || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">{drug.ndc || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[10px]">{drug.category.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {drug.costPrice != null ? formatCurrency(drug.costPrice) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(drug.sellingPrice)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm font-bold">{drug.inventory?.[0]?.quantity || 0}</span>
                        <span className="text-[10px] text-muted-foreground">/ {drug.reorderPoint}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {drug.expiryDate ? drug.expiryDate.split('T')[0] : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDrug(drug); setDrugEditOpen(true) }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* "+ Add new" modals for drug form dropdowns */}
      <ManufacturerModal
        open={mfgModalOpen}
        onOpenChange={setMfgModalOpen}
        editingManufacturer={null}
        onSaved={handleManufacturerCreated}
      />
      <VendorModal
        open={vendorModalOpen}
        onOpenChange={setVendorModalOpen}
        editingVendor={null}
        onSaved={handleVendorCreated}
      />
      <CategoryModal
        open={catModalOpen}
        onOpenChange={setCatModalOpen}
        editingCategory={null}
        onSaved={handleCategoryCreated}
      />
      <DosageFormModal
        open={dosageFormModalOpen}
        onOpenChange={setDosageFormModalOpen}
        onSaved={handleDosageFormCreated}
      />

      {/* Drug Edit Modal */}
      <DrugEditModal
        open={drugEditOpen}
        onOpenChange={setDrugEditOpen}
        editingDrug={editingDrug}
        categories={categories}
        vendors={vendors}
        manufacturers={manufacturers}
        dosageForms={allDosageForms}
        onSaved={fetchData}
        onOpenAddManufacturer={() => setMfgModalOpen(true)}
        onOpenAddVendor={() => setVendorModalOpen(true)}
        onOpenAddCategory={() => setCatModalOpen(true)}
        onOpenAddDosageForm={() => setDosageFormModalOpen(true)}
        onDeleteCategory={handleDeleteCategory}
        onDeleteDosageForm={handleDeleteDosageForm}
      />

      {/* ── Import Products Dialog ──────────────────────────────── */}
      <Dialog open={importDialog} onOpenChange={(open) => { if (!open) { setImportDialog(false); setImportFile(null); setImportResult(null); setImportPreview(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-teal-600" />
              Import Products from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or CSV file to bulk-import products into the drug catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Template download */}
            <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <FileSpreadsheet className="h-5 w-5 text-teal-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-teal-800">Download Import Template</p>
                <p className="text-xs text-teal-600">Contains column guide, example data, and reference sheets for categories and dosage forms.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-teal-600 text-teal-700 hover:bg-teal-100"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/products/import')
                    if (res.ok) {
                      const blob = await res.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'product-import-template.xlsx'
                      a.click()
                      URL.revokeObjectURL(url)
                      addToast({ title: 'Template Downloaded', description: 'Fill in your product data and upload', variant: 'success' })
                    }
                  } catch {
                    addToast({ title: 'Error', description: 'Failed to download template', variant: 'destructive' })
                  }
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                .xlsx Template
              </Button>
            </div>

            {/* File upload area */}
            {!importResult && (
              <div className="space-y-3">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    importFile
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                  }`}
                  onClick={() => document.getElementById('drug-import-file-input')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (file) handleImportFileSelect(file)
                  }}
                >
                  <input
                    id="drug-import-file-input"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImportFileSelect(file)
                    }}
                  />
                  {importFile ? (
                    <div className="space-y-2">
                      <FileSpreadsheet className="h-10 w-10 text-teal-600 mx-auto" />
                      <p className="text-sm font-medium text-teal-800">{importFile.name}</p>
                      {importPreview && (
                        <p className="text-xs text-muted-foreground">
                          {importPreview.rows} rows &middot; {importPreview.size}
                        </p>
                      )}
                      <p className="text-xs text-teal-600">Click or drag to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-10 w-10 text-gray-400 mx-auto" />
                      <p className="text-sm font-medium text-gray-700">
                        Drop your Excel/CSV file here, or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports .xlsx, .xls, .csv &middot; Max 5 MB
                      </p>
                    </div>
                  )}
                </div>

                {/* Column guide */}
                <div className="text-xs text-muted-foreground space-y-1 p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-foreground">Required columns (marked with * in template):</p>
                  <p><span className="text-red-500 font-bold">*</span> <strong>Name</strong> — Product name</p>
                  <p><span className="text-red-500 font-bold">*</span> <strong>Selling Price</strong> — Retail price</p>
                  <p className="mt-1 font-medium text-foreground">Optional:</p>
                  <p>NDC, Category, Dosage Form, Strength, Cost Price, Quantity, Manufacturer, Vendor, Batch Number, Expiry Date, and more</p>
                </div>

                {/* Import button */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setImportDialog(false); setImportFile(null); setImportPreview(null) }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={!importFile || importing}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    {importing ? (
                      <><span className="animate-spin mr-2">⟳</span> Importing...</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Import {importPreview ? `${importPreview.rows} Products` : 'Products'}</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Import results */}
            {importResult && (
              <div className="space-y-3">
                {importResult.success ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <p className="font-medium text-emerald-800">Import Complete!</p>
                    </div>
                    <p className="text-sm text-emerald-700">{importResult.message}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 bg-white rounded">
                        <p className="text-lg font-bold text-emerald-700">{importResult.created}</p>
                        <p className="text-xs text-muted-foreground">Created</p>
                      </div>
                      <div className="p-2 bg-white rounded">
                        <p className="text-lg font-bold text-amber-600">{importResult.failed}</p>
                        <p className="text-xs text-muted-foreground">Failed</p>
                      </div>
                      <div className="p-2 bg-white rounded">
                        <p className="text-lg font-bold text-gray-600">{importResult.skipped}</p>
                        <p className="text-xs text-muted-foreground">Skipped</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                      <p className="font-medium text-red-800">Import Failed</p>
                    </div>
                    <p className="text-sm text-red-700">{importResult.error || importResult.message}</p>
                  </div>
                )}

                {/* Validation errors */}
                {importResult.validationErrors && importResult.validationErrors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Validation Issues ({importResult.validationErrors.length})</p>
                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Row</th>
                            <th className="px-3 py-2 text-left font-medium">Product</th>
                            <th className="px-3 py-2 text-left font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.validationErrors.map((err, i) => (
                            <tr key={i} className="border-t">
                              <td className="px-3 py-2">{err.row}</td>
                              <td className="px-3 py-2 font-medium">{err.name || '—'}</td>
                              <td className="px-3 py-2 text-red-600">{err.errors.join('; ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Close buttons */}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setImportResult(null); setImportFile(null); setImportPreview(null) }}>
                    Import Another File
                  </Button>
                  <Button
                    onClick={() => {
                      setImportDialog(false); setImportResult(null); setImportFile(null); setImportPreview(null)
                      fetchData()
                    }}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── VENDOR SECTION ──────────────────────────────────────────────────────

function VendorSection() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const addToast = useAppStore((s) => s.addToast)

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/vendors')
      if (res.ok) setVendors(await res.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load vendors', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchVendors() }, [fetchVendors])

  const openAdd = () => {
    setEditingVendor(null)
    setModalOpen(true)
  }

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setModalOpen(true)
  }

  const handleModalSaved = () => {
    fetchVendors()
  }

  const handleDelete = async (vendor: Vendor) => {
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Deleted', description: `"${vendor.name}" removed`, variant: 'success' })
      fetchVendors()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.contactPerson && v.contactPerson.toLowerCase().includes(search.toLowerCase())) ||
    (v.email && v.email.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Truck className="h-4 w-4 text-green-600" />
          Vendors / Suppliers ({vendors.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-2" /> Add Vendor
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Vendor Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead className="hidden sm:table-cell">Contact Person</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No vendors found</TableCell>
                </TableRow>
              ) : (
                filtered.map((vendor) => {
                  const prodCount = vendor._count?.products || 0
                  return (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                            <Truck className="h-3.5 w-3.5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{vendor.name}</p>
                            {vendor.address && <p className="text-[10px] text-muted-foreground">{vendor.address}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{vendor.contactPerson || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{vendor.email || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{vendor.phone || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{prodCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(vendor)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                            onClick={() => handleDelete(vendor)}
                            disabled={prodCount > 0}
                            title={prodCount > 0 ? `${prodCount} products linked` : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Vendor Modal */}
      <VendorModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingVendor={editingVendor}
        onSaved={handleModalSaved}
      />
    </div>
  )
}

// ── MANUFACTURER SECTION ────────────────────────────────────────────────

function ManufacturerSection() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null)
  const addToast = useAppStore((s) => s.addToast)

  const fetchManufacturers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/manufacturers')
      if (res.ok) setManufacturers(await res.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load manufacturers', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchManufacturers() }, [fetchManufacturers])

  const openAdd = () => {
    setEditingManufacturer(null)
    setModalOpen(true)
  }

  const openEdit = (mfg: Manufacturer) => {
    setEditingManufacturer(mfg)
    setModalOpen(true)
  }

  const handleModalSaved = () => {
    fetchManufacturers()
  }

  const handleDelete = async (mfg: Manufacturer) => {
    try {
      const res = await fetch(`/api/manufacturers?id=${mfg.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Deleted', description: `"${mfg.name}" removed`, variant: 'success' })
      fetchManufacturers()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  const filtered = manufacturers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.city && m.city.toLowerCase().includes(search.toLowerCase())) ||
    (m.country && m.country.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-4">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Factory className="h-4 w-4 text-indigo-600" />
          Manufacturers ({manufacturers.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" /> Add Manufacturer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search manufacturers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Manufacturers Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="hidden sm:table-cell">Contact Person</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="text-center">Products</TableHead>
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
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No manufacturers found</TableCell>
                </TableRow>
              ) : (
                filtered.map((mfg) => {
                  const prodCount = mfg._count?.products || 0
                  const location = [mfg.city, mfg.country].filter(Boolean).join(', ')
                  return (
                    <TableRow key={mfg.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                            <Factory className="h-3.5 w-3.5 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{mfg.name}</p>
                            {mfg.website && <p className="text-[10px] text-muted-foreground">{mfg.website}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{mfg.contactPerson || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{mfg.email || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{mfg.phone || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{location || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{prodCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(mfg)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                            onClick={() => handleDelete(mfg)}
                            disabled={prodCount > 0}
                            title={prodCount > 0 ? `${prodCount} products linked` : 'Delete'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Manufacturer Modal */}
      <ManufacturerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        editingManufacturer={editingManufacturer}
        onSaved={handleModalSaved}
      />
    </div>
  )
}
