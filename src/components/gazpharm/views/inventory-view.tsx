'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Package, Search, AlertTriangle, Edit, ArrowUpDown,
  Download, Filter, TrendingUp, PackagePlus, ClipboardCheck, X, Plus
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'

interface InventoryItem {
  id: string
  productId: string
  quantity: number
  lastCounted: string | null
  product: {
    id: string
    name: string
    ndc: string | null
    category: string
    sellingPrice: number
    costPrice: number | null
    status: string
    reorderPoint: number
    maxStock: number | null
    dosageForm: string | null
    strength: string | null
    unitOfMeasure: string
    expiryDate: string | null
    batchNumber: string | null
  }
}

export function InventoryView() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [stockFilter, setStockFilter] = useState('ALL')
  const [adjustDialog, setAdjustDialog] = useState(false)
  const [addProductDialog, setAddProductDialog] = useState(false)
  const [categories, setCategories] = useState<{ id: string; name: string; description: string | null; _count?: { products: number } }[]>([])
  const [manufacturers, setManufacturers] = useState<{ id: string; name: string; _count?: { products: number } }[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string; _count?: { products: number } }[]>([])
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [adjustType, setAdjustType] = useState('ADD')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustCostPrice, setAdjustCostPrice] = useState('')
  const [adjustSellingPrice, setAdjustSellingPrice] = useState('')
  const [stockCountDialog, setStockCountDialog] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [stockSearchResults, setStockSearchResults] = useState<{ id: string; name: string; ndc: string | null; unitOfMeasure: string; currentQty: number }[]>([])
  const [stockSearching, setStockSearching] = useState(false)
  const [stockEntries, setStockEntries] = useState<{
    productId: string; name: string; ndc: string | null; currentQty: number; physicalQty: string;
    unit: string; costPrice: string; sellingPrice: string
  }[]>([])
  const [stockSaving, setStockSaving] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'category'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [productForm, setProductForm] = useState({
    name: '', sku: '', category: 'OTC', price: '', costPrice: '', stockQuantity: '',
    minStockLevel: '10', expiryDate: '', barcode: '',
    manufacturerId: '', vendorId: '', dosageForm: '',
  })
  // Full-detail modal states for inline "add new"
  const [addMfgOpen, setAddMfgOpen] = useState(false)
  const [addMfgSaving, setAddMfgSaving] = useState(false)
  const [addMfgForm, setAddMfgForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', notes: '' })
  const [addVendorOpen, setAddVendorOpen] = useState(false)
  const [addVendorSaving, setAddVendorSaving] = useState(false)
  const [addVendorForm, setAddVendorForm] = useState({ name: '', contactPerson: '', email: '', phone: '', address: '', notes: '' })
  const [addCatOpen, setAddCatOpen] = useState(false)
  const [addCatSaving, setAddCatSaving] = useState(false)
  const [addCatForm, setAddCatForm] = useState({ name: '', description: '' })
  const [addDfOpen, setAddDfOpen] = useState(false)
  const [addDfName, setAddDfName] = useState('')
  const [dosageForms, setDosageForms] = useState<string[]>(['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'CREAM', 'OINTMENT', 'GEL', 'DROPS', 'INJECTION', 'INHALER', 'SPRAY', 'PATCH', 'POWDER', 'LOZENGE', 'SUPPOSITORY'])
  const [savingProduct, setSavingProduct] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAppStore((s) => s.user)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)

  const fetchInventory = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter)
      if (forceRefresh) params.set('_t', String(Date.now()))
      const res = await fetch(`/api/inventory?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data)
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load inventory', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [searchQuery, categoryFilter, addToast])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories')
      if (res.ok) setCategories(await res.json())
    } catch {
      // silent
    }
  }, [])

  const fetchManufacturers = useCallback(async () => {
    try {
      const res = await fetch('/api/manufacturers')
      if (res.ok) setManufacturers(await res.json())
    } catch {
      // silent
    }
  }, [])

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch('/api/vendors')
      if (res.ok) setVendors(await res.json())
    } catch {
      // silent
    }
  }, [])

  useEffect(() => { fetchInventory(); fetchCategories(); fetchManufacturers(); fetchVendors() }, [fetchInventory, fetchCategories, fetchManufacturers, fetchVendors])

  const filteredItems = items.filter((item) => {
    const q = Number(item.quantity) || 0
    const r = Number(item.product.reorderPoint) || 10
    if (stockFilter === 'LOW') return q > 0 && q <= r
    if (stockFilter === 'OUT') return q === 0
    if (stockFilter === 'OK') return q > r
    return true
  }).sort((a, b) => {
    if (sortBy === 'name') return sortDir === 'asc' ? a.product.name.localeCompare(b.product.name) : b.product.name.localeCompare(a.product.name)
    if (sortBy === 'stock') return sortDir === 'asc' ? (Number(a.quantity)||0) - (Number(b.quantity)||0) : (Number(b.quantity)||0) - (Number(a.quantity)||0)
    return sortDir === 'asc' ? a.product.category.localeCompare(b.product.category) : b.product.category.localeCompare(a.product.category)
  })

  const lowStockCount = items.filter((i) => { const q = Number(i.quantity) || 0; const r = Number(i.product.reorderPoint) || 10; return q > 0 && q <= r }).length
  const outOfStockCount = items.filter((i) => (Number(i.quantity) || 0) === 0).length
  const totalValue = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (i.product.costPrice || i.product.sellingPrice), 0)

  const handleAdjust = async () => {
    if (!selectedItem || (!adjustAmount && !adjustCostPrice && !adjustSellingPrice) || !adjustReason) return
    try {
      const isSet = adjustType === 'SET'
      const adj = adjustAmount ? (adjustType === 'ADD' ? parseInt(adjustAmount) : adjustType === 'REMOVE' ? -parseInt(adjustAmount) : parseInt(adjustAmount)) : 0
      const body: Record<string, any> = {
        productId: selectedItem.productId,
        adjustmentType: adjustType,
        reason: adjustReason,
      }
      if (isSet) {
        body.setQuantity = adj
        body.adjustment = 0
      } else {
        body.adjustment = adj
      }
      if (adjustCostPrice !== '') body.costPrice = parseFloat(adjustCostPrice)
      if (adjustSellingPrice !== '') body.sellingPrice = parseFloat(adjustSellingPrice)

      const res = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to adjust')
      }
      addToast({ title: 'Product Updated', description: `${selectedItem.product.name} adjusted successfully`, variant: 'success' })
      setAdjustDialog(false)
      setAdjustAmount('')
      setAdjustReason('')
      setAdjustCostPrice('')
      setAdjustSellingPrice('')
      fetchInventory(true)
      bumpInventoryVersion()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to adjust stock', variant: 'destructive' })
    }
  }

  const handleAddProduct = async () => {
    if (!productForm.name || !productForm.price) return
    setSavingProduct(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser?.role || 'SUPER_ADMIN',
        },
        body: JSON.stringify({
          name: productForm.name,
          ndc: productForm.sku || null,
          category: productForm.category,
          sellingPrice: parseFloat(productForm.price),
          costPrice: productForm.costPrice ? parseFloat(productForm.costPrice) : parseFloat(productForm.price) * 0.7,
          reorderPoint: parseInt(productForm.minStockLevel) || 10,
          expiryDate: productForm.expiryDate || null,
          batchNumber: productForm.barcode || null,
          manufacturerId: productForm.manufacturerId || null,
          vendorId: productForm.vendorId || null,
          dosageForm: productForm.dosageForm || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create product')
      }
      const newProduct = await res.json()

      // Set initial stock quantity if specified
      const qty = parseInt(productForm.stockQuantity)
      if (qty > 0) {
        await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: newProduct.id,
            adjustment: qty,
            reason: 'Initial stock on product creation',
          }),
        })
      }

      addToast({ title: 'Product Added', description: `${productForm.name} has been added to inventory`, variant: 'success' })
      setAddProductDialog(false)
      setProductForm({ name: '', sku: '', category: 'OTC', price: '', costPrice: '', stockQuantity: '', minStockLevel: '10', expiryDate: '', barcode: '', manufacturerId: '', vendorId: '', dosageForm: '' })
      fetchInventory()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add product', variant: 'destructive' })
    } finally {
      setSavingProduct(false)
    }
  }

  // ── Inline "add new" handlers for dropdowns ──
  const handleAddManufacturer = async () => {
    if (!addMfgForm.name.trim()) return
    setAddMfgSaving(true)
    try {
      const res = await fetch('/api/manufacturers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addMfgForm.name.trim(),
          contactPerson: addMfgForm.contactPerson.trim() || null,
          email: addMfgForm.email.trim() || null,
          phone: addMfgForm.phone.trim() || null,
          address: addMfgForm.address.trim() || null,
          city: addMfgForm.city.trim() || null,
          country: addMfgForm.country.trim() || null,
          website: addMfgForm.website.trim() || null,
          notes: addMfgForm.notes.trim() || null,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setManufacturers((prev) => [...prev, created])
        setProductForm((prev) => ({ ...prev, manufacturerId: created.id }))
        setAddMfgForm({ name: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', website: '', notes: '' })
        setAddMfgOpen(false)
        addToast({ title: 'Manufacturer Added', description: created.name, variant: 'success' })
      } else {
        const err = await res.json()
        addToast({ title: 'Error', description: err.error || 'Failed to add manufacturer', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to add manufacturer', variant: 'destructive' })
    } finally {
      setAddMfgSaving(false)
    }
  }

  const handleAddVendor = async () => {
    if (!addVendorForm.name.trim()) return
    setAddVendorSaving(true)
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addVendorForm.name.trim(),
          contactPerson: addVendorForm.contactPerson.trim() || null,
          email: addVendorForm.email.trim() || null,
          phone: addVendorForm.phone.trim() || null,
          address: addVendorForm.address.trim() || null,
          notes: addVendorForm.notes.trim() || null,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setVendors((prev) => [...prev, created])
        setProductForm((prev) => ({ ...prev, vendorId: created.id }))
        setAddVendorForm({ name: '', contactPerson: '', email: '', phone: '', address: '', notes: '' })
        setAddVendorOpen(false)
        addToast({ title: 'Vendor Added', description: created.name, variant: 'success' })
      } else {
        const err = await res.json()
        addToast({ title: 'Error', description: err.error || 'Failed to add vendor', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to add vendor', variant: 'destructive' })
    } finally {
      setAddVendorSaving(false)
    }
  }

  const handleAddCategory = async () => {
    if (!addCatForm.name.trim()) return
    setAddCatSaving(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addCatForm.name.trim(), description: addCatForm.description.trim() || null }),
      })
      if (res.ok) {
        const created = await res.json()
        setCategories((prev) => [...prev, created])
        setProductForm((prev) => ({ ...prev, category: created.name }))
        setAddCatForm({ name: '', description: '' })
        setAddCatOpen(false)
        addToast({ title: 'Category Added', description: created.name, variant: 'success' })
      } else {
        const err = await res.json()
        addToast({ title: 'Error', description: err.error || 'Failed to add category', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to add category', variant: 'destructive' })
    } finally {
      setAddCatSaving(false)
    }
  }

  const handleAddDosageForm = () => {
    if (!addDfName.trim()) return
    const upper = addDfName.trim().toUpperCase()
    if (dosageForms.includes(upper)) {
      setProductForm((prev) => ({ ...prev, dosageForm: upper }))
    } else {
      setDosageForms((prev) => [...prev, upper])
      setProductForm((prev) => ({ ...prev, dosageForm: upper }))
      addToast({ title: 'Dosage Form Added', description: upper, variant: 'success' })
    }
    setAddDfName('')
    setAddDfOpen(false)
  }

  // ── Stock Count: API-based product search + set physical quantities & prices ──
  const searchStockProducts = useCallback(async (query: string) => {
    if (query.length < 1) { setStockSearchResults([]); return }
    setStockSearching(true)
    try {
      const params = new URLSearchParams({ search: query, limit: '15' })
      const res = await fetch(`/api/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        const productList = data.products || data
        // Merge current inventory quantities
        setStockSearchResults(
          (Array.isArray(productList) ? productList : []).map((p: any) => {
            const inv = items.find(i => i.productId === p.id)
            return {
              id: p.id,
              name: p.name,
              ndc: p.ndc || null,
              unitOfMeasure: p.unitOfMeasure || 'EA',
              currentQty: inv ? (Number(inv.quantity) || 0) : (p.inventory ? (Number(p.inventory.quantity) || 0) : 0),
              costPrice: p.costPrice,
              sellingPrice: p.sellingPrice,
            }
          })
        )
      }
    } catch { /* silent */ } finally {
      setStockSearching(false)
    }
  }, [items])

  // Debounced search
  useEffect(() => {
    if (!stockCountDialog) return
    const timer = setTimeout(() => searchStockProducts(stockSearch), 300)
    return () => clearTimeout(timer)
  }, [stockSearch, stockCountDialog, searchStockProducts])

  const addStockEntry = (product: { id: string; name: string; ndc: string | null; unitOfMeasure: string; currentQty: number; costPrice?: number | null; sellingPrice?: number | null }) => {
    if (stockEntries.find(e => e.productId === product.id)) return
    setStockEntries(prev => [...prev, {
      productId: product.id,
      name: product.name,
      ndc: product.ndc,
      currentQty: product.currentQty,
      physicalQty: String(product.currentQty),
      unit: product.unitOfMeasure,
      costPrice: product.costPrice ? String(product.costPrice) : '',
      sellingPrice: product.sellingPrice ? String(product.sellingPrice) : '',
    }])
    setStockSearch('')
    setStockSearchResults([])
  }

  const removeStockEntry = (productId: string) => {
    setStockEntries(prev => prev.filter(e => e.productId !== productId))
  }

  const updateStockEntry = (productId: string, field: 'physicalQty' | 'costPrice' | 'sellingPrice', value: string) => {
    setStockEntries(prev => prev.map(e => e.productId === productId ? { ...e, [field]: value } : e))
  }

  const handleStockCountSave = async () => {
    if (stockEntries.length === 0) return
    setStockSaving(true)
    try {
      let updated = 0
      let failed = 0
      const results: { name: string; requested: number; confirmed: number }[] = []
      for (const entry of stockEntries) {
        const physicalQty = parseInt(entry.physicalQty)
        if (isNaN(physicalQty)) continue
        const body: Record<string, any> = {
          productId: entry.productId,
          adjustmentType: 'SET',
          setQuantity: physicalQty,
          adjustment: 0,
          reason: 'Physical stock count',
        }
        // Include price updates if changed
        const cp = parseFloat(entry.costPrice)
        if (!isNaN(cp) && cp >= 0) body.costPrice = cp
        const sp = parseFloat(entry.sellingPrice)
        if (!isNaN(sp) && sp >= 0) body.sellingPrice = sp
        try {
          const res = await fetch('/api/inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN' },
            body: JSON.stringify(body),
          })
          if (res.ok) {
            const json = await res.json()
            const confirmed = Number(json.newQuantity) || Number(json.inventory?.quantity) || 0
            results.push({ name: entry.name, requested: physicalQty, confirmed })
            if (confirmed === physicalQty) {
              updated++
            } else {
              console.error(`Stock count mismatch for ${entry.name}: requested ${physicalQty}, DB confirmed ${confirmed}`)
              failed++
            }
          } else {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }))
            console.error(`Stock count failed for ${entry.name}:`, err)
            failed++
          }
        } catch (e) {
          console.error(`Stock count network error for ${entry.name}:`, e)
          failed++
        }
      }
      console.log('[Stock Count Save] Results:', results)
      if (updated > 0) {
        addToast({
          title: 'Stock Count Saved',
          description: `${updated} product${updated !== 1 ? 's' : ''} updated to physical count${failed > 0 ? ` (${failed} failed)` : ''}`,
          variant: updated === stockEntries.length ? 'success' : 'default',
        })
      } else {
        addToast({ title: 'Save Failed', description: `All ${failed} product updates failed. Check console for details.`, variant: 'destructive' })
      }
      setStockCountDialog(false)
      setStockEntries([])
      setStockSearch('')
      setStockSearchResults([])
      // Wait for Turso read replica to catch up, then force-refresh
      await new Promise(r => setTimeout(r, 1000))
      await fetchInventory(true)
      // Notify all other views (POS, Dashboard, Master Data, Reports) to re-fetch
      bumpInventoryVersion()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to save stock count', variant: 'destructive' })
    } finally {
      setStockSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Package className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{lowStockCount}</p>
              <p className="text-xs text-muted-foreground">Low Stock Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{outOfStockCount}</p>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-xs text-muted-foreground">Inventory Value</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or NDC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="OTC">OTC</SelectItem>
                <SelectItem value="PRESCRIPTION">Prescription</SelectItem>
                <SelectItem value="SUPPLEMENT">Supplement</SelectItem>
                <SelectItem value="MEDICAL_DEVICE">Medical Device</SelectItem>
                <SelectItem value="PERSONAL_CARE">Personal Care</SelectItem>
                <SelectItem value="CONSUMABLES">Consumables</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={setStockFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Stock</SelectItem>
                <SelectItem value="LOW">Low Stock</SelectItem>
                <SelectItem value="OUT">Out of Stock</SelectItem>
                <SelectItem value="OK">In Stock OK</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddProductDialog(true)} className="bg-teal-600 hover:bg-teal-700">
              <PackagePlus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
            <Button onClick={() => setStockCountDialog(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Stock Count
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => { setSortBy('name'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center gap-1">Product <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="hidden md:table-cell">NDC</TableHead>
                <TableHead className="cursor-pointer hidden sm:table-cell" onClick={() => { setSortBy('category'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center gap-1">Category <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => { setSortBy('stock'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center justify-end gap-1">In Stock <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="hidden lg:table-cell text-right">Reorder Point</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Cost</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Retail</TableHead>
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
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No inventory items found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const qty = Number(item.quantity) || 0
                  const reorder = Number(item.product.reorderPoint) || 10
                  const isOut = qty === 0
                  const isLow = qty > 0 && qty <= reorder
                  return (
                    <TableRow key={item.id} className={isOut ? 'bg-red-50/50' : isLow ? 'bg-amber-50/50' : ''}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{item.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.product.strength} {item.product.dosageForm} · {item.product.unitOfMeasure}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs font-mono">{item.product.ndc || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">{item.product.category.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold">{qty}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-muted-foreground">{reorder}</TableCell>
                      <TableCell className="text-right">
                        {isOut ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200">Out of Stock</Badge>
                        ) : isLow ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200">Low Stock</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">In Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right">${item.product.costPrice?.toFixed(2) || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right">${item.product.sellingPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedItem(item); setAdjustDialog(true) }}>
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Adjust
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

      {/* Add Product Dialog */}
      <Dialog open={addProductDialog} onOpenChange={setAddProductDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-teal-600" />
              Add New Product
            </DialogTitle>
            <DialogDescription>Fill in the product details. Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Product Name */}
            <div className="col-span-2">
              <Label htmlFor="prod-name">Product Name <span className="text-red-500">*</span></Label>
              <Input
                id="prod-name"
                placeholder="e.g., Amoxicillin 500mg Capsules"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* SKU / NDC */}
            <div>
              <Label htmlFor="prod-sku">SKU / NDC</Label>
              <Input
                id="prod-sku"
                placeholder="e.g., SKU-00123"
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Category with inline Add */}
            <div>
              <Label htmlFor="prod-category">Category</Label>
              <div className="flex gap-1 mt-1">
                <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OTC">OTC</SelectItem>
                    <SelectItem value="PRESCRIPTION">Prescription</SelectItem>
                    <SelectItem value="SUPPLEMENT">Supplement</SelectItem>
                    <SelectItem value="MEDICAL_DEVICE">Medical Device</SelectItem>
                    <SelectItem value="PERSONAL_CARE">Personal Care</SelectItem>
                    <SelectItem value="CONSUMABLES">Consumables</SelectItem>
                    {categories.filter((c) => !['OTC','PRESCRIPTION','SUPPLEMENT','MEDICAL_DEVICE','PERSONAL_CARE','CONSUMABLES'].includes(c.name)).map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name.replace(/_/g, ' ')}</SelectItem>
                    ))}
                    <div className="border-t my-1" />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-teal-600 hover:bg-teal-50 rounded-sm transition-colors"
                      onClick={() => setAddCatOpen(true)}
                    >
                      <Plus className="h-3 w-3" /> Add New Category...
                    </button>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Manufacturer with Add Modal */}
            <div>
              <Label htmlFor="prod-mfg">Manufacturer</Label>
              <Select value={productForm.manufacturerId} onValueChange={(v) => setProductForm({ ...productForm, manufacturerId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select manufacturer..." />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">No manufacturers yet</div>}
                  {manufacturers.map((mfg) => (
                    <SelectItem key={mfg.id} value={mfg.id}>{mfg.name}</SelectItem>
                  ))}
                  <div className="border-t my-1" />
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-teal-600 hover:bg-teal-50 rounded-sm transition-colors"
                    onClick={() => setAddMfgOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Add New Manufacturer...
                  </button>
                </SelectContent>
              </Select>
            </div>

            {/* Vendor with Add Modal */}
            <div>
              <Label htmlFor="prod-vendor">Vendor</Label>
              <Select value={productForm.vendorId} onValueChange={(v) => setProductForm({ ...productForm, vendorId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">No vendors yet</div>}
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                  <div className="border-t my-1" />
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-teal-600 hover:bg-teal-50 rounded-sm transition-colors"
                    onClick={() => setAddVendorOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Add New Vendor...
                  </button>
                </SelectContent>
              </Select>
            </div>

            {/* Dosage Form with Add Modal */}
            <div>
              <Label htmlFor="prod-dosage">Dosage Form</Label>
              <Select value={productForm.dosageForm} onValueChange={(v) => setProductForm({ ...productForm, dosageForm: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select dosage form..." />
                </SelectTrigger>
                <SelectContent>
                  {dosageForms.map((df) => (
                    <SelectItem key={df} value={df}>{df.charAt(0) + df.slice(1).toLowerCase()}</SelectItem>
                  ))}
                  <div className="border-t my-1" />
                  <button
                    type="button"
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-teal-600 hover:bg-teal-50 rounded-sm transition-colors"
                    onClick={() => setAddDfOpen(true)}
                  >
                    <Plus className="h-3 w-3" /> Add New Dosage Form...
                  </button>
                </SelectContent>
              </Select>
            </div>

            {/* Selling Price */}
            <div>
              <Label htmlFor="prod-price">Selling Price ($) <span className="text-red-500">*</span></Label>
              <Input
                id="prod-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Cost Price */}
            <div>
              <Label htmlFor="prod-cost">Cost Price ($)</Label>
              <Input
                id="prod-cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={productForm.costPrice}
                onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Stock Quantity */}
            <div>
              <Label htmlFor="prod-stock">Stock Quantity</Label>
              <Input
                id="prod-stock"
                type="number"
                min="0"
                placeholder="0"
                value={productForm.stockQuantity}
                onChange={(e) => setProductForm({ ...productForm, stockQuantity: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Min Stock Level */}
            <div>
              <Label htmlFor="prod-minstock">Min Stock Level</Label>
              <Input
                id="prod-minstock"
                type="number"
                min="0"
                placeholder="10"
                value={productForm.minStockLevel}
                onChange={(e) => setProductForm({ ...productForm, minStockLevel: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Expiry Date */}
            <div>
              <Label htmlFor="prod-expiry">Expiry Date</Label>
              <Input
                id="prod-expiry"
                type="date"
                value={productForm.expiryDate}
                onChange={(e) => setProductForm({ ...productForm, expiryDate: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Barcode */}
            <div>
              <Label htmlFor="prod-barcode">Barcode</Label>
              <Input
                id="prod-barcode"
                placeholder="e.g., 1234567890123"
                value={productForm.barcode}
                onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddProductDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAddProduct}
              className="bg-teal-600 hover:bg-teal-700"
              disabled={!productForm.name || !productForm.price || savingProduct}
            >
              {savingProduct ? 'Adding...' : 'Add Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* ── Add Manufacturer Modal ── */}
      <Dialog open={addMfgOpen} onOpenChange={setAddMfgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-600" />
              Add New Manufacturer
            </DialogTitle>
            <DialogDescription>Enter the full details for the new manufacturer.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="col-span-2">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., Pfizer Inc." value={addMfgForm.name} onChange={(e) => setAddMfgForm({ ...addMfgForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input placeholder="e.g., John Doe" value={addMfgForm.contactPerson} onChange={(e) => setAddMfgForm({ ...addMfgForm, contactPerson: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="e.g., contact@company.com" value={addMfgForm.email} onChange={(e) => setAddMfgForm({ ...addMfgForm, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input placeholder="e.g., +1-555-0123" value={addMfgForm.phone} onChange={(e) => setAddMfgForm({ ...addMfgForm, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Website</Label>
              <Input placeholder="e.g., https://company.com" value={addMfgForm.website} onChange={(e) => setAddMfgForm({ ...addMfgForm, website: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input placeholder="Street address" value={addMfgForm.address} onChange={(e) => setAddMfgForm({ ...addMfgForm, address: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>City</Label>
              <Input placeholder="e.g., New York" value={addMfgForm.city} onChange={(e) => setAddMfgForm({ ...addMfgForm, city: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Country</Label>
              <Input placeholder="e.g., USA" value={addMfgForm.country} onChange={(e) => setAddMfgForm({ ...addMfgForm, country: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional notes..." value={addMfgForm.notes} onChange={(e) => setAddMfgForm({ ...addMfgForm, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddMfgOpen(false)}>Cancel</Button>
            <Button onClick={handleAddManufacturer} disabled={!addMfgForm.name.trim() || addMfgSaving} className="bg-teal-600 hover:bg-teal-700">
              {addMfgSaving ? 'Saving...' : 'Add Manufacturer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Vendor Modal ── */}
      <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-600" />
              Add New Vendor
            </DialogTitle>
            <DialogDescription>Enter the full details for the new vendor.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="col-span-2">
              <Label>Company Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., MedSupply Corp" value={addVendorForm.name} onChange={(e) => setAddVendorForm({ ...addVendorForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Contact Person</Label>
              <Input placeholder="e.g., Jane Smith" value={addVendorForm.contactPerson} onChange={(e) => setAddVendorForm({ ...addVendorForm, contactPerson: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="e.g., sales@vendor.com" value={addVendorForm.email} onChange={(e) => setAddVendorForm({ ...addVendorForm, email: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input placeholder="e.g., +1-555-0456" value={addVendorForm.phone} onChange={(e) => setAddVendorForm({ ...addVendorForm, phone: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Address</Label>
              <Input placeholder="Street address" value={addVendorForm.address} onChange={(e) => setAddVendorForm({ ...addVendorForm, address: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional notes..." value={addVendorForm.notes} onChange={(e) => setAddVendorForm({ ...addVendorForm, notes: e.target.value })} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddVendorOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVendor} disabled={!addVendorForm.name.trim() || addVendorSaving} className="bg-teal-600 hover:bg-teal-700">
              {addVendorSaving ? 'Saving...' : 'Add Vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Category Modal ── */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-600" />
              Add New Category
            </DialogTitle>
            <DialogDescription>Create a new product category.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., Herbal Remedies" value={addCatForm.name} onChange={(e) => setAddCatForm({ ...addCatForm, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Brief description of the category..." value={addCatForm.description} onChange={(e) => setAddCatForm({ ...addCatForm, description: e.target.value })} className="mt-1" rows={3} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddCatOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCategory} disabled={!addCatForm.name.trim() || addCatSaving} className="bg-teal-600 hover:bg-teal-700">
              {addCatSaving ? 'Saving...' : 'Add Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Dosage Form Modal ── */}
      <Dialog open={addDfOpen} onOpenChange={setAddDfOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-600" />
              Add New Dosage Form
            </DialogTitle>
            <DialogDescription>Add a new dosage form type to the list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Dosage Form Name <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g., Chewable Tablet" value={addDfName} onChange={(e) => setAddDfName(e.target.value)} className="mt-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddDosageForm() } }} />
              <p className="text-xs text-muted-foreground mt-1">Will be saved in uppercase (e.g., CHEWABLE TABLET)</p>
            </div>
            {dosageForms.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Existing dosage forms:</p>
                <div className="flex flex-wrap gap-1.5">
                  {dosageForms.map((df) => (
                    <Badge key={df} variant="secondary" className="text-xs">{df.charAt(0) + df.slice(1).toLowerCase()}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setAddDfOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDosageForm} disabled={!addDfName.trim()} className="bg-teal-600 hover:bg-teal-700">
              Add Dosage Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adjust Product</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium">{selectedItem.product.name}</p>
                <p className="text-sm text-muted-foreground">
                  Current Stock: {Number(selectedItem.quantity) || 0} {selectedItem.product.unitOfMeasure}
                  &nbsp;·&nbsp; Cost: ${selectedItem.product.costPrice?.toFixed(2) || '—'}
                  &nbsp;·&nbsp; Price: ${selectedItem.product.sellingPrice?.toFixed(2) || '—'}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label>Adjustment Type</Label>
                  <Select value={adjustType} onValueChange={setAdjustType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADD">Add Stock</SelectItem>
                      <SelectItem value="REMOVE">Remove Stock</SelectItem>
                      <SelectItem value="SET">Set Count</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} min="0" placeholder="Leave blank to skip stock change" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cost Price ($)</Label>
                    <Input type="number" step="0.01" min="0" value={adjustCostPrice} onChange={(e) => setAdjustCostPrice(e.target.value)} placeholder={selectedItem.product.costPrice?.toFixed(2) || '0.00'} className="mt-1" />
                  </div>
                  <div>
                    <Label>Selling Price ($)</Label>
                    <Input type="number" step="0.01" min="0" value={adjustSellingPrice} onChange={(e) => setAdjustSellingPrice(e.target.value)} placeholder={selectedItem.product.sellingPrice?.toFixed(2) || '0.00'} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Reason (required)</Label>
                  <Textarea value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Reason for adjustment..." className="mt-1" rows={2} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)}>Cancel</Button>
            <Button onClick={handleAdjust} className="bg-emerald-600 hover:bg-emerald-700" disabled={(!adjustAmount && !adjustCostPrice && !adjustSellingPrice) || !adjustReason}>
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Count Dialog — API search + physical count + price edit */}
      <Dialog open={stockCountDialog} onOpenChange={(open) => {
        if (!open) { setStockCountDialog(false); setStockEntries([]); setStockSearch(''); setStockSearchResults([]) }
        else setStockCountDialog(true)
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              Periodic Stock Taking
            </DialogTitle>
            <DialogDescription>Search products, enter physical stock counts and optionally adjust cost & selling prices. All changes update the system immediately.</DialogDescription>
          </DialogHeader>

          {/* Product Search — queries API with debounce */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${stockSearching ? 'text-indigo-500 animate-pulse' : 'text-muted-foreground'}`} />
            <Input
              placeholder="Search product by name or NDC to add..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="pl-9 pr-20"
              autoFocus
            />
            {stockSearch && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {stockSearching ? 'Searching...' : `${stockSearchResults.length} found`}
              </span>
            )}
            {stockSearchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {stockSearchResults.map((product) => {
                  const alreadyAdded = stockEntries.find(e => e.productId === product.id)
                  return (
                    <button
                      key={product.id}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-sm border-b last:border-b-0 transition-colors ${alreadyAdded ? 'bg-muted/50 opacity-60 cursor-not-allowed' : 'hover:bg-indigo-50'}`}
                      disabled={!!alreadyAdded}
                      onClick={() => !alreadyAdded && addStockEntry(product)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          NDC: {product.ndc || '—'}
                          {product.ndc && ' · '}
                          Current Stock: {product.currentQty} {product.unitOfMeasure}
                        </p>
                      </div>
                      <span className={`text-xs font-medium ml-3 shrink-0 ${alreadyAdded ? 'text-muted-foreground' : 'text-indigo-600'}`}>
                        {alreadyAdded ? '✓ Added' : '+ Add'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Summary badges */}
          {stockEntries.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {stockEntries.length} product{stockEntries.length !== 1 ? 's' : ''} to count
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Diff: {stockEntries.reduce((s, e) => s + (parseInt(e.physicalQty || '0') - e.currentQty), 0) >= 0 ? '+' : ''}{stockEntries.reduce((s, e) => s + (parseInt(e.physicalQty || '0') - e.currentQty), 0)}
              </Badge>
              <Button size="sm" variant="ghost" className="text-xs text-red-500 hover:text-red-700 ml-auto" onClick={() => { setStockEntries([]) }}>
                Clear All
              </Button>
            </div>
          )}

          {/* Stock Count Table */}
          <div className="border rounded-lg flex-1 min-h-0">
            {stockEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No products added yet</p>
                <p className="text-xs mt-1">Search and add products above to begin counting stock</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[40vh]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Product</th>
                      <th className="text-center px-3 py-2 font-medium w-24">System Qty</th>
                      <th className="text-center px-3 py-2 font-medium w-28">Physical Count</th>
                      <th className="text-center px-3 py-2 font-medium w-16">Diff</th>
                      <th className="text-center px-3 py-2 font-medium w-28">Cost Price</th>
                      <th className="text-center px-3 py-2 font-medium w-28">Selling Price</th>
                      <th className="text-center px-3 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {stockEntries.map((entry) => {
                      const diff = parseInt(entry.physicalQty || '0') - entry.currentQty
                      return (
                        <tr key={entry.productId} className="hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <p className="font-medium truncate max-w-[200px]">{entry.name}</p>
                            <p className="text-xs text-muted-foreground">{entry.ndc || '—'}</p>
                          </td>
                          <td className="text-center px-3 py-2 font-mono">
                            {entry.currentQty} <span className="text-xs text-muted-foreground">{entry.unit}</span>
                          </td>
                          <td className="text-center px-3 py-2">
                            <Input
                              type="number"
                              min="0"
                              value={entry.physicalQty}
                              onChange={(e) => updateStockEntry(entry.productId, 'physicalQty', e.target.value)}
                              className="w-full text-center h-8 text-sm"
                              placeholder="0"
                            />
                          </td>
                          <td className="text-center px-3 py-2">
                            {diff !== 0 && (
                              <Badge variant={diff > 0 ? 'default' : 'destructive'} className="text-xs px-1.5 py-0">
                                {diff > 0 ? '+' : ''}{diff}
                              </Badge>
                            )}
                            {diff === 0 && <span className="text-xs text-muted-foreground">0</span>}
                          </td>
                          <td className="text-center px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={entry.costPrice}
                              onChange={(e) => updateStockEntry(entry.productId, 'costPrice', e.target.value)}
                              className="w-full text-center h-8 text-sm"
                              placeholder="$0.00"
                            />
                          </td>
                          <td className="text-center px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={entry.sellingPrice}
                              onChange={(e) => updateStockEntry(entry.productId, 'sellingPrice', e.target.value)}
                              className="w-full text-center h-8 text-sm"
                              placeholder="$0.00"
                            />
                          </td>
                          <td className="text-center px-3 py-2">
                            <Button size="sm" variant="ghost" onClick={() => removeStockEntry(entry.productId)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setStockCountDialog(false); setStockEntries([]); setStockSearch(''); setStockSearchResults([]) }}>
              Cancel
            </Button>
            <Button
              onClick={handleStockCountSave}
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={stockEntries.length === 0 || stockSaving}
            >
              {stockSaving ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Updating Stocks...
                </>
              ) : (
                `Update ${stockEntries.length} Product${stockEntries.length !== 1 ? 's' : ''} Stock & Prices`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
