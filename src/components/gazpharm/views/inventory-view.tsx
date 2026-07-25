'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Package, Search, Plus, AlertTriangle, Edit, ArrowUpDown,
  Download, Filter, TrendingUp, X
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
  const [receiveDialog, setReceiveDialog] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [adjustType, setAdjustType] = useState('ADD')
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [shipmentItems, setShipmentItems] = useState([{ productId: '', quantity: '', costPrice: '' }])
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'category'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const addToast = useAppStore((s) => s.addToast)

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

  useEffect(() => { fetchInventory() }, [fetchInventory])

  const filteredItems = items.filter((item) => {
    if (stockFilter === 'LOW') return item.quantity <= item.product.reorderPoint
    if (stockFilter === 'OUT') return item.quantity === 0
    if (stockFilter === 'OK') return item.quantity > item.product.reorderPoint
    return true
  }).sort((a, b) => {
    if (sortBy === 'name') return sortDir === 'asc' ? a.product.name.localeCompare(b.product.name) : b.product.name.localeCompare(a.product.name)
    if (sortBy === 'stock') return sortDir === 'asc' ? a.quantity - b.quantity : b.quantity - a.quantity
    return sortDir === 'asc' ? a.product.category.localeCompare(b.product.category) : b.product.category.localeCompare(a.product.category)
  })

  const lowStockCount = items.filter((i) => i.quantity <= i.product.reorderPoint).length
  const outOfStockCount = items.filter((i) => i.quantity === 0).length
  const totalValue = items.reduce((sum, i) => sum + i.quantity * (i.product.costPrice || i.product.sellingPrice), 0)

  const handleAdjust = async () => {
    if (!selectedItem || !adjustAmount || !adjustReason) return
    try {
      const adj = adjustType === 'ADD' ? parseInt(adjustAmount) : adjustType === 'REMOVE' ? -parseInt(adjustAmount) : parseInt(adjustAmount)
      await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedItem.productId, adjustment: adj, reason: adjustReason }),
      })
      addToast({ title: 'Stock Updated', description: `${selectedItem.product.name} adjusted`, variant: 'success' })
      setAdjustDialog(false)
      setAdjustAmount('')
      setAdjustReason('')
      fetchInventory()
    } catch {
      addToast({ title: 'Error', description: 'Failed to adjust stock', variant: 'destructive' })
    }
  }

  const handleReceiveShipment = async () => {
    const validItems = shipmentItems.filter((i) => i.productId && i.quantity)
    if (validItems.length === 0) return
    try {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validItems.map((i) => ({
            productId: i.productId,
            quantity: parseInt(i.quantity),
            costPrice: parseFloat(i.costPrice) || 0,
          })),
        }),
      })
      addToast({ title: 'Shipment Received', description: `${validItems.length} items received`, variant: 'success' })
      setReceiveDialog(false)
      setShipmentItems([{ productId: '', quantity: '', costPrice: '' }])
      fetchInventory()
    } catch {
      addToast({ title: 'Error', description: 'Failed to receive shipment', variant: 'destructive' })
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
            <Button onClick={() => setReceiveDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-2" />
              Receive Shipment
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
                  const isLow = item.quantity <= item.product.reorderPoint
                  const isOut = item.quantity === 0
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
                      <TableCell className="text-right font-bold">{item.quantity}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-muted-foreground">{item.product.reorderPoint}</TableCell>
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

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialog} onOpenChange={setAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium">{selectedItem.product.name}</p>
                <p className="text-sm text-muted-foreground">Current Stock: {selectedItem.quantity} {selectedItem.product.unitOfMeasure}</p>
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
                  <Input type="number" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} min="0" className="mt-1" />
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
            <Button onClick={handleAdjust} className="bg-emerald-600 hover:bg-emerald-700" disabled={!adjustAmount || !adjustReason}>
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Shipment Dialog */}
      <Dialog open={receiveDialog} onOpenChange={setReceiveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {shipmentItems.map((si, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label className="text-xs">Product ID</Label>
                  <Input value={si.productId} onChange={(e) => {
                    const updated = [...shipmentItems]
                    updated[idx] = { ...updated[idx], productId: e.target.value }
                    setShipmentItems(updated)
                  }} placeholder="Product ID" className="mt-1" />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Qty</Label>
                  <Input type="number" value={si.quantity} onChange={(e) => {
                    const updated = [...shipmentItems]
                    updated[idx] = { ...updated[idx], quantity: e.target.value }
                    setShipmentItems(updated)
                  }} className="mt-1" />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Cost</Label>
                  <Input type="number" step="0.01" value={si.costPrice} onChange={(e) => {
                    const updated = [...shipmentItems]
                    updated[idx] = { ...updated[idx], costPrice: e.target.value }
                    setShipmentItems(updated)
                  }} className="mt-1" />
                </div>
                <div className="col-span-1">
                  <Button size="icon" variant="ghost" onClick={() => {
                    if (shipmentItems.length > 1) {
                      setShipmentItems(shipmentItems.filter((_, i) => i !== idx))
                    }
                  }}><X className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setShipmentItems([...shipmentItems, { productId: '', quantity: '', costPrice: '' }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveDialog(false)}>Cancel</Button>
            <Button onClick={handleReceiveShipment} className="bg-emerald-600 hover:bg-emerald-700">
              Receive Shipment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
