'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Tags, Pill, Truck, Plus, Trash2, Search, Package, ChevronRight,
  AlertCircle, CheckCircle2
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
import { useAppStore } from '@/store/app-store'

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

interface DrugProduct {
  id: string
  name: string
  ndc: string | null
  category: string
  sellingPrice: number
  costPrice: number | null
  manufacturer: string | null
  dosageForm: string | null
  strength: string | null
  unitOfMeasure: string
  vendor?: { id: string; name: string } | null
  inventory?: { quantity: number }[]
  reorderPoint: number
  expiryDate: string | null
  batchNumber: string | null
  status: string
}

const DOSAGE_FORMS = [
  'Tablet', 'Capsules', 'Syrup', 'Lozenges', 'Ointment',
  'Suppository', 'Eyedrop', 'Eardrop', 'Contraceptive', 'Condom',
  'Herbal', 'Cream', 'Gel', 'Injection', 'Spray', 'Powder', 'Drops', 'Patch', 'Other',
]

const BUILT_IN_CATEGORIES = ['OTC', 'PRESCRIPTION', 'SUPPLEMENT', 'MEDICAL_DEVICE', 'PERSONAL_CARE', 'CONSUMABLES']

// ── Section Button Component ─────────────────────────────────────────────

const SECTIONS = [
  { key: 'category', label: 'Add Category', icon: Tags, desc: 'Drug categories & departments', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { key: 'drug', label: 'Add Drug Name', icon: Pill, desc: 'Register new products', color: 'bg-teal-600 hover:bg-teal-700' },
  { key: 'vendor', label: 'Add Vendor', icon: Truck, desc: 'Suppliers & distributors', color: 'bg-green-600 hover:bg-green-700' },
] as const

type SectionKey = typeof SECTIONS[number]['key']

// ── Main View ──────────────────────────────────────────────────────────

export function MasterDataView() {
  const [activeSection, setActiveSection] = useState<SectionKey>('category')

  return (
    <div className="space-y-6">
      {/* Section Selector Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
    </div>
  )
}

// ── CATEGORY SECTION ───────────────────────────────────────────────────

function CategorySection() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
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

  const handleCreate = async () => {
    if (!newName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Category Created', description: `"${newName.trim()}" added successfully`, variant: 'success' })
      setNewName('')
      setNewDesc('')
      fetchCategories()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
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
      {/* Create Form */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Tags className="h-4 w-4 text-emerald-600" />
            Create New Category
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3">
              <Label className="text-xs">Category Name *</Label>
              <Input
                placeholder="e.g., ANALGESICS"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div className="sm:col-span-6">
              <Label className="text-xs">Description</Label>
              <Input
                placeholder="Brief description of this category"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              />
            </div>
            <div className="sm:col-span-3 flex items-end">
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? 'Saving...' : <><Plus className="h-4 w-4 mr-2" /> Add Category</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(cat)}
                          disabled={isBuiltIn || prodCount > 0}
                          title={isBuiltIn ? 'System category' : prodCount > 0 ? `${prodCount} products linked` : 'Delete'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── DRUG SECTION ────────────────────────────────────────────────────────

function DrugSection() {
  const [drugs, setDrugs] = useState<DrugProduct[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const addToast = useAppStore((s) => s.addToast)

  const [form, setForm] = useState({
    name: '', sku: '', category: 'OTC', dosageForm: '', manufacturer: '', costPrice: '', sellingPrice: '',
    stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', vendorId: '',
  })
  const [showNewManufacturer, setShowNewManufacturer] = useState(false)
  const [newManufacturerName, setNewManufacturerName] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [prodRes, catRes, venRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/categories'),
        fetch('/api/vendors'),
      ])
      if (prodRes.ok) {
        const data = await prodRes.json()
        const list = Array.isArray(data) ? data : data.products || []
        setDrugs(list)
      }
      if (catRes.ok) setCategories(await catRes.json())
      if (venRes.ok) setVendors(await venRes.json())
    } catch {
      addToast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreate = async () => {
    if (!form.name || !form.sellingPrice) return
    setSaving(true)
    try {
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
          manufacturer: form.manufacturer || null,
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
        name: '', sku: '', category: 'OTC', dosageForm: '', manufacturer: '', costPrice: '', sellingPrice: '',
        stockQuantity: '0', minStockLevel: '10', expiryDate: '', barcode: '', vendorId: '',
      })
      setShowNewManufacturer(false)
      setNewManufacturerName('')
      fetchData()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add drug', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const filtered = drugs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    (d.ndc && d.ndc.toLowerCase().includes(search.toLowerCase()))
  )

  // Extract unique manufacturers from existing drugs
  const existingManufacturers = [...new Set(drugs.map((d) => d.manufacturer).filter(Boolean))] as string[]

  const handleAddNewManufacturer = () => {
    const trimmed = newManufacturerName.trim()
    if (!trimmed) return
    setForm({ ...form, manufacturer: trimmed })
    setNewManufacturerName('')
    setShowNewManufacturer(false)
  }

  return (
    <div className="space-y-4">
      {/* Drug Registration Form */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Pill className="h-4 w-4 text-teal-600" />
            Register New Drug / Product
          </h3>
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
            {showNewManufacturer ? (
              <div>
                <Label className="text-xs">New Manufacturer</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    placeholder="Enter manufacturer name"
                    value={newManufacturerName}
                    onChange={(e) => setNewManufacturerName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddNewManufacturer() }}
                    autoFocus
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleAddNewManufacturer} className="shrink-0 px-3">
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowNewManufacturer(false); setNewManufacturerName('') }} className="shrink-0 px-2">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Manufacturer</Label>
                <Select
                  value={form.manufacturer || '_none'}
                  onValueChange={(v) => {
                    if (v === '__new__') {
                      setShowNewManufacturer(true)
                    } else {
                      setForm({ ...form, manufacturer: v === '_none' ? '' : v })
                    }
                  }}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {existingManufacturers.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    <SelectItem value="__new__" className="text-emerald-600 font-medium">
                      + Add new manufacturer
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category Dropdown */}
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUILT_IN_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                  ))}
                  {categories.filter((c) => !BUILT_IN_CATEGORIES.includes(c.name)).map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dosage Form Dropdown */}
            <div>
              <Label className="text-xs">Dosage Form</Label>
              <Select value={form.dosageForm} onValueChange={(v) => setForm({ ...form, dosageForm: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select form..." /></SelectTrigger>
                <SelectContent>
                  {DOSAGE_FORMS.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
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
              <Select value={form.vendorId} onValueChange={(v) => setForm({ ...form, vendorId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No drugs found</TableCell>
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
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{drug.manufacturer || '—'}</TableCell>
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
                      ${drug.costPrice ? drug.costPrice.toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      ${drug.sellingPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-sm font-bold">{drug.inventory?.[0]?.quantity || 0}</span>
                        <span className="text-[10px] text-muted-foreground">/ {drug.reorderPoint}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {drug.expiryDate || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── VENDOR SECTION ──────────────────────────────────────────────────────

function VendorSection() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '', contactPerson: '', email: '', phone: '', address: '', notes: '',
  })
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

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed')
      }
      addToast({ title: 'Vendor Added', description: `"${form.name.trim()}" registered as supplier`, variant: 'success' })
      setForm({ name: '', contactPerson: '', email: '', phone: '', address: '', notes: '' })
      fetchVendors()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
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
      {/* Create Form */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Truck className="h-4 w-4 text-green-600" />
            Register New Vendor / Supplier
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2 lg:col-span-2">
              <Label className="text-xs">Vendor Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., PharmaCorp Distribution" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Contact Person</Label>
              <Input placeholder="Full name" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" placeholder="vendor@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input placeholder="+1 (555) 000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Address</Label>
              <Input placeholder="Street, City, State" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input placeholder="Additional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button
                onClick={handleCreate}
                disabled={!form.name.trim() || saving}
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                {saving ? 'Saving...' : <><Truck className="h-4 w-4 mr-2" /> Register Vendor</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
                        <Button
                          size="sm" variant="ghost"
                          className="text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(vendor)}
                          disabled={prodCount > 0}
                          title={prodCount > 0 ? `${prodCount} products linked` : 'Delete'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
