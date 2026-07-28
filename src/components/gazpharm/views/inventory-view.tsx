'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Package, Search, AlertTriangle, Edit, ArrowUpDown,
  Download, Filter, TrendingUp, PackagePlus, ClipboardCheck, X
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [adjustType, setAdjustType] = useState('ADD')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustCostPrice, setAdjustCostPrice] = useState('')
  const [adjustSellingPrice, setAdjustSellingPrice] = useState('')
  const [stockCountDialog, setStockCountDialog] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [stockEntries, setStockEntries] = useState<{ productId: string; name: string; currentQty: number; physicalQty: string; unit: string }[]>([])
  const [stockSaving, setStockSaving] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'category'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [productForm, setProductForm] = useState({
    name: '', sku: '', category: 'OTC', price: '', stockQuantity: '',
    minStockLevel: '10', expiryDate: '', barcode: '',
  })
  const [savingProduct, setSavingProduct] = useState(false)
  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAppStore((s) => s.user)

  const fetchInventory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('search', searchQuery)
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter)
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
      // silent — categories are optional enhancement
    }
  }, [])

  useEffect(() => { fetchInventory(); fetchCategories() }, [fetchInventory, fetchCategories])

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
        headers: { 'Content-Type': 'application/json' },
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
      fetchInventory()
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
          costPrice: parseFloat(productForm.price) * 0.7,
          reorderPoint: parseInt(productForm.minStockLevel) || 10,
          expiryDate: productForm.expiryDate || null,
          batchNumber: productForm.barcode || null,
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
      setProductForm({ name: '', sku: '', category: 'OTC', price: '', stockQuantity: '', minStockLevel: '10', expiryDate: '', barcode: '' })
      fetchInventory()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add product', variant: 'destructive' })
    } finally {
      setSavingProduct(false)
    }
  }

  // ── Stock Count: search + set physical quantities ──────────────
  const filteredStockProducts = stockSearch.length > 0
    ? items.filter(i => i.product.name.toLowerCase().includes(stockSearch.toLowerCase()) || i.product.ndc?.toLowerCase().includes(stockSearch.toLowerCase()))
    : []

  const addStockEntry = (item: InventoryItem) => {
    if (stockEntries.find(e => e.productId === item.productId)) return
    setStockEntries(prev => [...prev, {
      productId: item.productId,
      name: item.product.name,
      currentQty: Number(item.quantity) || 0,
      physicalQty: String(Number(item.quantity) || 0),
      unit: item.product.unitOfMeasure,
    }])
    setStockSearch('')
  }

  const removeStockEntry = (productId: string) => {
    setStockEntries(prev => prev.filter(e => e.productId !== productId))
  }

  const updateStockEntry = (productId: string, physicalQty: string) => {
    setStockEntries(prev => prev.map(e => e.productId === productId ? { ...e, physicalQty } : e))
  }

  const handleStockCountSave = async () => {
    if (stockEntries.length === 0) return
    setStockSaving(true)
    try {
      let updated = 0
      for (const entry of stockEntries) {
        const physicalQty = parseInt(entry.physicalQty)
        if (isNaN(physicalQty)) continue
        if (physicalQty === entry.currentQty) continue // no change needed
        await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: entry.productId,
            adjustmentType: 'SET',
            setQuantity: physicalQty,
            adjustment: 0,
            reason: 'Physical stock count',
          }),
        })
        updated++
      }
      addToast({ title: 'Stock Count Saved', description: `${updated} product${updated !== 1 ? 's' : ''} updated to physical count`, variant: 'success' })
      setStockCountDialog(false)
      setStockEntries([])
      fetchInventory()
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-teal-600" />
              Add New Product
            </DialogTitle>
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

            {/* SKU */}
            <div>
              <Label htmlFor="prod-sku">SKU</Label>
              <Input
                id="prod-sku"
                placeholder="e.g., SKU-00123"
                value={productForm.sku}
                onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="prod-category">Category</Label>
              <Select value={productForm.category} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                <SelectTrigger className="mt-1">
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
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div>
              <Label htmlFor="prod-price">Price ($) <span className="text-red-500">*</span></Label>
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

      {/* Stock Count Dialog — search products & set physical quantities */}
      <Dialog open={stockCountDialog} onOpenChange={setStockCountDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              Stock Count
            </DialogTitle>
            <DialogDescription>Search products and enter current physical stock counts. System quantities will be updated to match.</DialogDescription>
          </DialogHeader>

          {/* Product Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search product by name or NDC..."
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              className="pl-9"
            />
            {filteredStockProducts.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredStockProducts.slice(0, 10).map((item) => (
                  <button
                    key={item.productId}
                    className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between text-sm"
                    onClick={() => addStockEntry(item)}
                  >
                    <div>
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        NDC: {item.product.ndc || '—'} · Current: {Number(item.quantity) || 0} {item.product.unitOfMeasure}
                      </p>
                    </div>
                    <span className="text-xs text-indigo-600 font-medium">+ Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Products List */}
          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
            {stockEntries.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                Search and add products above to begin counting stock
              </div>
            ) : (
              stockEntries.map((entry) => {
                const diff = parseInt(entry.physicalQty || '0') - entry.currentQty
                return (
                  <div key={entry.productId} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">System: {entry.currentQty} {entry.unit}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        value={entry.physicalQty}
                        onChange={(e) => updateStockEntry(entry.productId, e.target.value)}
                        className="w-24 text-center"
                        placeholder="Qty"
                      />
                      <span className="text-xs text-muted-foreground">{entry.unit}</span>
                      {diff !== 0 && (
                        <Badge variant={diff > 0 ? 'default' : 'destructive'} className="text-xs px-1.5 py-0">
                          {diff > 0 ? '+' : ''}{diff}
                        </Badge>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeStockEntry(entry.productId)} className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setStockCountDialog(false); setStockEntries([]); setStockSearch('') }}>
              Cancel
            </Button>
            <Button
              onClick={handleStockCountSave}
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={stockEntries.length === 0 || stockSaving}
            >
              {stockSaving ? 'Saving...' : `Update ${stockEntries.length} Product${stockEntries.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
