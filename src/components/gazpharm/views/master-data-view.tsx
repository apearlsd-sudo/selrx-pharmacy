'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Tags, Pill, Truck, Plus, Trash2, Search, Package, ChevronRight,
  AlertCircle, CheckCircle2, Factory, Edit2, Save, X, RefreshCw,
  Upload, FileSpreadsheet, Download, History, Clock, RotateCcw, Database,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'
import { formatDate, formatDateTimeShort, getDaysToExpiry, getTodayWAT, daysToExpiryFrom } from '@/lib/date-utils'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'

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
  sellingUnit: string
  itemsPerUnit: number
  vendor?: { id: string; name: string } | null
  manufacturerRef?: { id: string; name: string } | null
  inventory?: { quantity: number }[]
  reorderPoint: number
  expiryDate: string | null
  batchNumber: string | null
  status: string
}

// ── Section Button Component ─────────────────────────────────────────────

const SECTIONS = [
  { key: 'drug', label: 'Add Drug Name', icon: Pill, desc: 'Register new products', color: 'bg-teal-600 hover:bg-teal-700' },
  { key: 'category', label: 'Add Category', icon: Tags, desc: 'Drug categories & departments', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { key: 'dosage-form', label: 'Add Dosage Form', icon: Pill, desc: 'Tablet, capsule, syrup, etc.', color: 'bg-cyan-600 hover:bg-cyan-700' },
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
      <DialogContent className="sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-semibold text-gray-800">{isEditing ? 'Edit Category' : 'Add Category'}</DialogTitle>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
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
      <DialogContent className="sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-semibold text-gray-800">{isEditing ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
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
      <DialogContent className="sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-semibold text-gray-800">{isEditing ? 'Edit Manufacturer' : 'Add Manufacturer'}</DialogTitle>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
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
    const trimmed = name.trim().toUpperCase()
    if (!trimmed) return
    addToast({ title: 'Dosage Form Added', description: `"${trimmed}" added to list`, variant: 'success' })
    onSaved(trimmed)
    setName('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-semibold text-gray-800">Add Dosage Form</DialogTitle>
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
          <Button variant="outline" onClick={() => handleClose(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
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
}) {
  const [form, setForm] = useState({
    name: '', ndc: '', category: 'OTC', dosageForm: '', manufacturerId: '', costPrice: '', sellingPrice: '',
    vendorId: '', reorderPoint: '', expiryDate: '', batchNumber: '', stockQuantity: '',
    sellingUnit: 'EA', itemsPerUnit: '1',
  })
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)
  const currentUser = useAppStore((s) => s.user)
  const genBN = () => {
    const d = new Date()
    const date = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear().toString()
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `BN-${date}-${seq}`
  }

  useEffect(() => {
    if (open && editingDrug) {
      setForm({
        name: editingDrug.name || '',
        ndc: editingDrug.ndc || '',
        category: editingDrug.category || '',
        dosageForm: editingDrug.dosageForm || '',
        manufacturerId: editingDrug.manufacturerId || '',
        costPrice: editingDrug.costPrice != null ? String(editingDrug.costPrice) : '',
        sellingPrice: editingDrug.sellingPrice != null ? String(editingDrug.sellingPrice) : '',
        vendorId: editingDrug.vendor?.id || '',
        reorderPoint: String(editingDrug.reorderPoint || 10),
        expiryDate: editingDrug.expiryDate ? editingDrug.expiryDate.split('T')[0] : '',
        batchNumber: editingDrug.batchNumber || '',
        stockQuantity: editingDrug.inventory?.[0]?.quantity != null ? String(editingDrug.inventory[0].quantity) : '',
        sellingUnit: editingDrug.sellingUnit || 'EA',
        itemsPerUnit: String(editingDrug.itemsPerUnit || 1),
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
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          ndc: form.ndc.trim() || null,
          category: form.category,
          dosageForm: form.dosageForm || null,
          manufacturerId: form.manufacturerId || null,
          costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
          sellingPrice: parseFloat(form.sellingPrice),
          sellingUnit: form.sellingUnit || 'EA',
          itemsPerUnit: parseInt(form.itemsPerUnit) || 1,
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

      // Update stock quantity if changed
      if (form.stockQuantity !== '' && editingDrug) {
        const currentQty = editingDrug.inventory?.[0]?.quantity ?? 0
        const newQty = parseInt(form.stockQuantity) || 0
        if (newQty !== currentQty) {
          await fetch('/api/inventory', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-user-role': currentUser?.role || '',
              'x-user-id': currentUser?.id || '',
            },
            body: JSON.stringify({
              productId: editingDrug.id,
              setQuantity: newQty,
              adjustmentType: 'SET',
              reason: 'Updated from Drug Catalog edit',
            }),
          }).catch(() => {})
          bumpInventoryVersion()
        }
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
      <DialogContent className="sm:max-w-2xl rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-semibold text-gray-800">Edit Drug / Product</DialogTitle>
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
            <Select value={form.category} onValueChange={(v) => { if (v === '__new__') { onOpenAddCategory() } else { setForm({ ...form, category: v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name.replace(/_/g, ' ')}</SelectItem>
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
            <Select value={form.dosageForm || '_none'} onValueChange={(v) => { if (v === '__new__') { onOpenAddDosageForm() } else { setForm({ ...form, dosageForm: v === '_none' ? '' : v }) } }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select form..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {dosageForms.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
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
            <Label className="text-xs">Stock Quantity</Label>
            <p className="text-[10px] text-muted-foreground mb-0.5">Leave blank to keep unchanged</p>
            <Input
              type="number"
              min="0"
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              placeholder={editingDrug?.inventory?.[0]?.quantity != null ? `Current: ${editingDrug.inventory[0].quantity}` : 'Enter quantity'}
              className="mt-0.5"
            />
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
            <Label className="text-xs">Sell As</Label>
            <Select value={form.sellingUnit} onValueChange={(v) => setForm({ ...form, sellingUnit: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EA">Each / Piece</SelectItem>
                <SelectItem value="Tablet">Tablet</SelectItem>
                <SelectItem value="Capsule">Capsule</SelectItem>
                <SelectItem value="Sachet">Sachet</SelectItem>
                <SelectItem value="Vial">Vial</SelectItem>
                <SelectItem value="Ampoule">Ampoule</SelectItem>
                <SelectItem value="Bottle">Bottle</SelectItem>
                <SelectItem value="Strip">Strip</SelectItem>
                <SelectItem value="Blister">Blister Pack</SelectItem>
                <SelectItem value="Tube">Tube</SelectItem>
                <SelectItem value="Pack">Pack</SelectItem>
                <SelectItem value="Box">Box</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.sellingUnit !== 'EA' && (
            <div>
              <Label className="text-xs">Items Per {form.sellingUnit}</Label>
              <Input type="number" min="1" placeholder="e.g., 10" value={form.itemsPerUnit} onChange={(e) => setForm({ ...form, itemsPerUnit: e.target.value })} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Individual units (tablets/capsules) per {form.sellingUnit.toLowerCase()}</p>
            </div>
          )}
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
            <div className="flex gap-1 mt-1">
              <Input value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} placeholder="BN-DDMMYYYY-XXXX" className="flex-1" />
              <Button type="button" variant="outline" size="sm" className="h-9 w-9 px-0 shrink-0" onClick={() => setForm({ ...form, batchNumber: genBN() })} title="Auto-generate batch number">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
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
  const [activeSection, setActiveSection] = useState<SectionKey>('drug')

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader icon={Database} title="Drug Catalog" description="Manage medications, categories, suppliers, and dosage forms" />

      {/* Section Selector Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
                <p className={`text-xs ${isActive ? 'text-emerald-600' : 'text-gray-500'}`}>{sec.desc}</p>
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
      {activeSection === 'dosage-form' && <DosageFormSection />}
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
    <div className="space-y-6">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Tags className="h-4.5 w-4.5 text-emerald-600" /></div>
          Drug Categories ({categories.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" /> Add Category
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white" />
      </div>

      {/* Categories Table */}
      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead className="hidden sm:table-cell">Description</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="p-0"><EmptyState icon={Tags} title="No categories found" description="Create your first drug category to get started" /></TableCell>
                </TableRow>
              ) : (
                filtered.map((cat) => {
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
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                            onClick={() => handleDelete(cat)}
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
    stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', batchNumber: '', vendorId: '',
    sellingUnit: 'EA', itemsPerUnit: '1',
  })

  const genBN = () => {
    const d = new Date()
    const date = String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + d.getFullYear().toString()
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `BN-${date}-${seq}`
  }

  // Modal states for "+ Add new" in drug form
  const [mfgModalOpen, setMfgModalOpen] = useState(false)
  const [vendorModalOpen, setVendorModalOpen] = useState(false)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [dosageFormModalOpen, setDosageFormModalOpen] = useState(false)

  // Drug edit modal
  const [drugEditOpen, setDrugEditOpen] = useState(false)
  const [editingDrug, setEditingDrug] = useState<DrugProduct | null>(null)

  // Delete confirmation
  const [deleteDrug, setDeleteDrug] = useState<DrugProduct | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Product history
  const [historyDrug, setHistoryDrug] = useState<DrugProduct | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Custom dosage forms (synced with localStorage via DosageFormSection)
  const [customDosageForms, setCustomDosageForms] = useState<string[]>(() => loadDosageForms())

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
  const dateFormat = useAppStore((s) => s.dateFormat)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)

  const allDosageForms = [...customDosageForms]

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
          sellingUnit: form.sellingUnit || 'EA',
          itemsPerUnit: parseInt(form.itemsPerUnit) || 1,
          reorderPoint: parseInt(form.minStockLevel) || 10,
          expiryDate: form.expiryDate || null,
          batchNumber: form.batchNumber || null,
          vendorId: form.vendorId || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create product')
      }
      const newProduct = await res.json()

      // Set initial stock — use batch endpoint when expiry or batch number is provided
      const qty = parseInt(form.stockQuantity) || 0
      if (qty > 0) {
        if (form.expiryDate || form.batchNumber) {
          // Use batch receive endpoint for proper batch/lot tracking
          await fetch('/api/inventory/batches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
            body: JSON.stringify({
              productId: newProduct.id,
              quantity: qty,
              expiryDate: form.expiryDate || null,
              batchNumber: form.batchNumber || null,
              costPrice: form.costPrice ? parseFloat(form.costPrice) : null,
              reason: 'Initial stock on creation',
            }),
          })
        } else {
          await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: newProduct.id, adjustment: qty, reason: 'Initial stock on creation' }),
          })
        }
      }

      addToast({ title: 'Drug Added', description: `"${form.name}" registered in inventory`, variant: 'success' })
      setForm({
        name: '', sku: '', category: 'OTC', dosageForm: '', manufacturerId: '', costPrice: '', sellingPrice: '',
        stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', batchNumber: '', vendorId: '',
        sellingUnit: 'EA', itemsPerUnit: '1',
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
    const upper = name.trim().toUpperCase()
    setCustomDosageForms((prev) => {
      const updated = prev.includes(upper) ? prev : [...prev, upper].sort()
      saveDosageForms(updated)
      return updated
    })
    setForm((prev) => ({ ...prev, dosageForm: upper }))
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
    const upper = name.trim().toUpperCase()
    setCustomDosageForms((prev) => {
      const updated = prev.includes(upper) ? prev : [...prev, upper].sort()
      saveDosageForms(updated)
      return updated
    })
  }

  // ── Import handlers ──────────────────────────────────────────────
  const handleImportFileSelect = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      addToast({ title: 'File Too Large', description: 'Maximum file size is 5 MB', variant: 'destructive' })
      return
    }
    setImportFile(file)
    setImportResult(null)
    const sizeStr = file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(1)} MB`
    // Parse file to count actual non-empty rows
    let rowCount = 1
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      rowCount = allRows.filter((r) => Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim() !== '')).length
      if (rowCount === 0) rowCount = 1
    } catch { /* fall back to estimate */ }
    setImportPreview({ name: file.name, rows: rowCount, size: sizeStr })
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
        headers: { 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-date-format': dateFormat },
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

  // Delete handler
  const handleDeleteDrug = async () => {
    if (!deleteDrug) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${deleteDrug.id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-date-format': dateFormat },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete product')
      }
      const data = await res.json()
      addToast({ title: 'Product Discontinued', description: data.message || `"${deleteDrug.name}" has been discontinued`, variant: 'success' })
      fetchData()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setDeleting(false)
      setDeleteDrug(null)
    }
  }

  const handleReactivateDrug = async (drug: DrugProduct) => {
    try {
      const res = await fetch(`/api/products/${drug.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to reactivate product')
      }
      addToast({ title: 'Product Reactivated', description: `"${drug.name}" is now active`, variant: 'success' })
      fetchData()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    }
  }

  // History handler
  const handleOpenHistory = async (drug: DrugProduct) => {
    setHistoryDrug(drug)
    setHistoryOpen(true)
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/product-history?productId=${drug.id}`)
      if (res.ok) {
        const data = await res.json()
        setHistoryData(data.history || [])
      }
    } catch { /* silent */ } finally {
      setHistoryLoading(false)
    }
  }

  const filtered = drugs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.ndc && d.ndc.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="space-y-6">
      {/* Drug Registration Form */}
      <Card className="card-hover shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Pill className="h-4.5 w-4.5 text-emerald-600" /></div>
              Register New Drug / Product
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-teal-600 text-teal-700 hover:bg-teal-50"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/products/import?dateFormat=${encodeURIComponent(dateFormat)}`)
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
                  } else {
                    setForm({ ...form, category: v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name.replace(/_/g, ' ')}</SelectItem>
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
                  } else {
                    setForm({ ...form, dosageForm: v === '_none' ? '' : v })
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select form..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {allDosageForms.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
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

            {/* Selling Unit */}
            <div>
              <Label className="text-xs">Sell As</Label>
              <Select value={form.sellingUnit} onValueChange={(v) => setForm({ ...form, sellingUnit: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EA">Each / Piece</SelectItem>
                  <SelectItem value="Tablet">Tablet</SelectItem>
                  <SelectItem value="Capsule">Capsule</SelectItem>
                  <SelectItem value="Sachet">Sachet</SelectItem>
                  <SelectItem value="Vial">Vial</SelectItem>
                  <SelectItem value="Ampoule">Ampoule</SelectItem>
                  <SelectItem value="Bottle">Bottle</SelectItem>
                  <SelectItem value="Strip">Strip</SelectItem>
                  <SelectItem value="Blister">Blister Pack</SelectItem>
                  <SelectItem value="Tube">Tube</SelectItem>
                  <SelectItem value="Pack">Pack</SelectItem>
                  <SelectItem value="Box">Box</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Items Per Unit */}
            {form.sellingUnit !== 'EA' && (
              <div>
                <Label className="text-xs">Items Per {form.sellingUnit}</Label>
                <Input type="number" min="1" placeholder="e.g., 10" value={form.itemsPerUnit} onChange={(e) => setForm({ ...form, itemsPerUnit: e.target.value })} className="mt-1" />
                <p className="text-[10px] text-muted-foreground mt-1">Number of individual units (tablets/capsules) in each {form.sellingUnit.toLowerCase()}</p>
              </div>
            )}

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

            {/* Batch Number */}
            <div>
              <Label className="text-xs">Batch Number</Label>
              <div className="flex gap-1 mt-1">
                <Input placeholder="BN-DDMMYYYY-XXXX" value={form.batchNumber} onChange={(e) => setForm({ ...form, batchNumber: e.target.value })} className="flex-1" />
                <Button type="button" variant="outline" size="sm" className="h-9 w-9 px-0 shrink-0" onClick={() => setForm({ ...form, batchNumber: genBN() })} title="Auto-generate batch number">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Leave blank to auto-generate on first stock receipt</p>
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search drugs by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white" />
      </div>

      {/* Drug Table */}
      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>Drug Name</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden md:table-cell">Manufacturer</TableHead>
                <TableHead className="hidden md:table-cell">Vendor</TableHead>
                <TableHead className="hidden sm:table-cell">Dosage Form</TableHead>
                <TableHead className="text-right">Stock Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Reorder Lvl</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Retail</TableHead>
                <TableHead className="hidden lg:table-cell">Sell As</TableHead>
                <TableHead className="hidden md:table-cell">Expiry</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 14 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="p-0"><EmptyState icon={Pill} title="No drugs found" description="Add your first medication to the catalog" /></TableCell>
                </TableRow>
              ) : (
                (() => {
                  const todayWAT = getTodayWAT()
                  return filtered.map((drug) => {
                  const stockQty = drug.inventory?.[0]?.quantity || 0
                  const reorderLvl = drug.reorderPoint || 10
                  const isDiscontinued = drug.status === 'DISCONTINUED'
                  const bs = (drug as any).batchExpirySummary
                  const allBatchesExpired = bs?.hasBatches ? (bs.allBatchesExpired === true) : false
                  const hasExpiredBatches = bs?.hasBatches ? (bs.hasExpiredBatches === true) : false
                  const activeExpiry = bs?.nearestActiveExpiry || drug.expiryDate
                  const daysToExpiry = daysToExpiryFrom(activeExpiry, todayWAT)
                  const nearExpiry = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 30
                  const showExpired = allBatchesExpired && stockQty > 0
                  return (
                    <TableRow key={drug.id} className={showExpired ? 'opacity-60' : isDiscontinued ? 'opacity-50' : nearExpiry ? 'bg-amber-50/50' : ''}>
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
                      <TableCell className="hidden sm:table-cell text-xs font-mono text-gray-600">{drug.ndc || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-[10px]">{drug.category.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-gray-600">
                        {drug.manufacturerRef?.name || drug.manufacturer || '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-gray-600">{drug.vendor?.name || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {drug.dosageForm ? (
                          <Badge variant="outline" className="text-[10px]">{drug.dosageForm}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-bold ${stockQty === 0 ? 'text-red-600' : stockQty <= reorderLvl ? 'text-amber-600' : ''}`}>{stockQty}</span>
                      </TableCell>
                      <TableCell>
                        {isDiscontinued ? (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">Discontinued</Badge>
                        ) : stockQty === 0 ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Out of Stock</Badge>
                        ) : showExpired ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Expired</Badge>
                        ) : hasExpiredBatches ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">Partial Expired</Badge>
                        ) : stockQty <= reorderLvl ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Low Stock</Badge>
                        ) : nearExpiry && daysToExpiry !== null ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{daysToExpiry} day{daysToExpiry !== 1 ? 's' : ''} to expiry</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">In Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-gray-600">{reorderLvl}</TableCell>
                      <TableCell className="text-right text-xs text-gray-600">
                        {drug.costPrice != null ? formatCurrency(drug.costPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(drug.sellingPrice)}
                        {drug.sellingUnit && drug.sellingUnit !== 'EA' && (
                          <p className="text-[10px] text-muted-foreground font-normal">/ {drug.sellingUnit.toLowerCase()}{drug.itemsPerUnit > 1 ? ` (${drug.itemsPerUnit} pcs)` : ''}</p>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {drug.sellingUnit === 'EA' || !drug.sellingUnit ? 'Each' : `${drug.itemsPerUnit || 1}x ${drug.sellingUnit.toLowerCase()}`}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {formatDate(activeExpiry)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isDiscontinued ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleReactivateDrug(drug)} title="Reactivate">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setDeleteDrug(drug)} title="Discontinue">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDrug(drug); setDrugEditOpen(true) }} title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
                })()
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
      />

      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      <AlertDialog open={!!deleteDrug} onOpenChange={(open) => { if (!open) setDeleteDrug(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discontinue Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discontinue <strong>{deleteDrug?.name}</strong>? This will mark the product as discontinued and <strong>zero out all inventory and batch quantities</strong>. The product will no longer appear in active listings but existing transaction records are preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteDrug}
              disabled={deleting}
            >
              {deleting ? 'Discontinuing...' : 'Discontinue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Product History Dialog ─────────────────────────────── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-semibold text-gray-800">
              <Clock className="h-4 w-4 text-teal-600" />
              Product History
            </DialogTitle>
            <DialogDescription>
              {historyDrug?.name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-2">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Loading...</div>
            ) : historyData.length === 0 ? (
              <EmptyState icon={History} title="No history recorded yet" description="Product change history will appear here" />
            ) : (
              <div className="space-y-3">
                {historyData.map((h: any) => {
                  const actionColor = h.action === 'CREATED' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                    : h.action === 'DELETED' ? 'text-red-600 bg-red-50 border-red-200'
                    : 'text-blue-600 bg-blue-50 border-blue-200'
                  const actionIcon = h.action === 'CREATED' ? '+' : h.action === 'DELETED' ? '-' : '~'
                  const prev = h.previousValues ? (typeof h.previousValues === 'string' ? JSON.parse(h.previousValues) : h.previousValues) : null
                  const next = h.newValues ? (typeof h.newValues === 'string' ? JSON.parse(h.newValues) : h.newValues) : null
                  const dateStr = h.createdAt ? formatDateTimeShort(h.createdAt) : ''
                  return (
                    <div key={h.id} className="border border-gray-200/80 rounded-xl p-3 transition-all duration-200">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${actionColor}`}>
                            {actionIcon} {h.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground">by {h.userName}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{dateStr}</span>
                      </div>
                      {h.action === 'UPDATED' && h.changedFields && (
                        <div className="mt-2 space-y-1">
                          {(typeof h.changedFields === 'string' ? h.changedFields.split(', ') : (h.changedFields || [])).map((field: string, i: number) => (
                            <div key={i} className="text-xs flex items-start gap-2 bg-gray-50 rounded px-2 py-1.5">
                              <span className="font-medium text-gray-600 min-w-[80px]">{field}:</span>
                              <span className="text-red-500 line-through">{prev?.[field] != null ? String(prev[field]) : '—'}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-emerald-600">{next?.[field] != null ? String(next[field]) : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {h.action === 'CREATED' && next && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Created: {next.name}{next.category ? ` (${next.category})` : ''} — {next.sellingPrice != null ? formatCurrency(next.sellingPrice) : ''}
                        </div>
                      )}
                      {h.action === 'DELETED' && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Status changed to <span className="text-red-600 font-medium">DISCONTINUED</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* ── Import Products Dialog ──────────────────────────────── */}
      <Dialog open={importDialog} onOpenChange={(open) => { if (!open) { setImportDialog(false); setImportFile(null); setImportResult(null); setImportPreview(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-semibold text-gray-800">
              <FileSpreadsheet className="h-5 w-5 text-teal-600" />
              Import Products from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or CSV file to bulk-import products into the drug catalog.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Template download */}
            <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl transition-all duration-200">
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
                    const res = await fetch(`/api/products/import?dateFormat=${encodeURIComponent(dateFormat)}`)
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
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
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
                <div className="text-xs text-gray-400 space-y-1 p-3 bg-gray-50 rounded-xl">
                  <p className="font-medium text-foreground">Template columns:</p>
                  <p><span className="text-red-500 font-bold">*</span> <strong>Drug Name</strong> — Product name (required)</p>
                  <p>SKU, Category, Manufacturer, Vendor, Dosage Form, Stock Qty, Status, Reorder Level, Cost, Retail, Expiry</p>
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

// ── DOSAGE FORM SECTION ──────────────────────────────────────────

const STORAGE_KEY_DOSAGE = 'selrx-custom-dosage-forms'

function loadDosageForms(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOSAGE)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveDosageForms(forms: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_DOSAGE, JSON.stringify(forms))
}

function DosageFormSection() {
  const [forms, setForms] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingForm, setEditingForm] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const addToast = useAppStore((s) => s.addToast)

  useEffect(() => { setForms(loadDosageForms()) }, [])

  const openAdd = () => { setEditingForm(null); setNewName(''); setModalOpen(true) }
  const openEdit = (f: string) => { setEditingForm(f); setNewName(f); setModalOpen(true) }

  const handleSave = () => {
    const trimmed = newName.trim().toUpperCase()
    if (!trimmed) return
    setSaving(true)
    try {
      if (editingForm) {
        const updated = forms.map((f) => f === editingForm ? trimmed : f)
        setForms(updated)
        saveDosageForms(updated)
        addToast({ title: 'Updated', description: `Renamed to "${trimmed}"`, variant: 'success' })
      } else {
        if (forms.includes(trimmed)) {
          addToast({ title: 'Duplicate', description: `"${trimmed}" already exists`, variant: 'destructive' })
          setSaving(false)
          return
        }
        const updated = [...forms, trimmed].sort()
        setForms(updated)
        saveDosageForms(updated)
        addToast({ title: 'Added', description: `"${trimmed}" added`, variant: 'success' })
      }
      setModalOpen(false)
      setNewName('')
    } finally { setSaving(false) }
  }

  const handleDelete = (f: string) => {
    const updated = forms.filter((x) => x !== f)
    setForms(updated)
    saveDosageForms(updated)
    addToast({ title: 'Deleted', description: `"${f}" removed`, variant: 'success' })
  }

  const filtered = forms.filter((f) => f.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Pill className="h-4.5 w-4.5 text-emerald-600" /></div>
          Dosage Forms ({forms.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
          <Plus className="h-4 w-4 mr-2" /> Add Dosage Form
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search dosage forms..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white" />
      </div>

      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Dosage Form</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="p-0"><EmptyState icon={Pill} title={forms.length === 0 ? 'No dosage forms yet' : 'No matches found'} description={forms.length === 0 ? 'Add your first dosage form to get started' : 'Try a different search term'} /></TableCell>
                </TableRow>
              ) : (
                filtered.map((f, i) => (
                  <TableRow key={f}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{f}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 h-7 w-7"
                          onClick={() => handleDelete(f)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add/Edit Dosage Form Dialog */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) { setNewName(''); setEditingForm(null) }; setModalOpen(o) }}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="font-semibold text-gray-800">{editingForm ? 'Edit Dosage Form' : 'Add Dosage Form'}</DialogTitle>
            <DialogDescription>{editingForm ? 'Rename the dosage form' : 'Create a new dosage form type (e.g., TABLET, CAPSULE, SYRUP)'}</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Dosage Form Name <span className="text-red-500">*</span></Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., INHALER"
              className="mt-1"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground mt-1">Will be saved in uppercase (e.g., CHEWABLE TABLET)</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">Cancel</Button>
            <Button onClick={handleSave} disabled={!newName.trim() || saving} className="bg-cyan-600 hover:bg-cyan-700">
              <><Save className="h-4 w-4 mr-2" /> {editingForm ? 'Update' : 'Create'}</>
            </Button>
          </DialogFooter>
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
    <div className="space-y-6">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Truck className="h-4.5 w-4.5 text-emerald-600" /></div>
          Vendors / Suppliers ({vendors.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-green-600 hover:bg-green-700">
          <Plus className="h-4 w-4 mr-2" /> Add Vendor
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white" />
      </div>

      {/* Vendor Table */}
      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
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
                  <TableCell colSpan={6} className="p-0"><EmptyState icon={Truck} title="No vendors found" description="Register your first supplier or distributor" /></TableCell>
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
    <div className="space-y-6">
      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Factory className="h-4.5 w-4.5 text-emerald-600" /></div>
          Manufacturers ({manufacturers.length})
        </h3>
        <Button onClick={openAdd} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" /> Add Manufacturer
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input placeholder="Search manufacturers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white" />
      </div>

      {/* Manufacturers Table */}
      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
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
                  <TableCell colSpan={7} className="p-0"><EmptyState icon={Factory} title="No manufacturers found" description="Register your first drug manufacturer" /></TableCell>
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
