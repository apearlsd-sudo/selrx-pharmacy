'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Package, Search, AlertTriangle, Edit, ArrowUpDown,
  Download, Filter, TrendingUp, PackagePlus, ClipboardCheck, X, Plus,
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Pencil
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'
import { generateBarcode } from '@/lib/barcode'
import { formatDate, getDaysToExpiry, getTodayWAT, daysToExpiryFrom } from '@/lib/date-utils'

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
    sellingUnit: string
    itemsPerUnit: number
    expiryDate: string | null
    batchNumber: string | null
    manufacturer?: string | null
    manufacturerRef?: { id: string; name: string } | null
    vendor?: { id: string; name: string } | null
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
  const [adjustExpiryDate, setAdjustExpiryDate] = useState('')
  const [adjustBatchNumber, setAdjustBatchNumber] = useState('')
  const [batches, setBatches] = useState<any[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)
  const [newBatchQty, setNewBatchQty] = useState('')
  const [newBatchExpiry, setNewBatchExpiry] = useState('')
  const [newBatchCost, setNewBatchCost] = useState('')
  // Client-side batch number generator (matches server-side BN-DDMMYYYY-XXXX format)
  const genBN = () => {
    const d = new Date()
    const date = String(d.getDate()).padStart(2, '0') +
      String(d.getMonth() + 1).padStart(2, '0') +
      d.getFullYear().toString()
    const seq = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
    return `BN-${date}-${seq}`
  }
  const [newBatchNumber, setNewBatchNumber] = useState(genBN)
  const [savingBatch, setSavingBatch] = useState(false)
  const [editBatchModalOpen, setEditBatchModalOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<any>(null)
  const [editBatchQty, setEditBatchQty] = useState('')
  const [editBatchExpiry, setEditBatchExpiry] = useState('')
  const [editBatchCost, setEditBatchCost] = useState('')
  const [editBatchNumber, setEditBatchNumber] = useState('')
  // Enhanced batch edit: quick stock adjustment fields
  const [editBatchAdjType, setEditBatchAdjType] = useState('ADD')
  const [editBatchAdjAmount, setEditBatchAdjAmount] = useState('')
  const [editBatchSellingPrice, setEditBatchSellingPrice] = useState('')
  const [editBatchReason, setEditBatchReason] = useState('')
  // Sell As (Unit Sales) in edit batch modal
  const [editBatchSellingUnit, setEditBatchSellingUnit] = useState('')
  const [editBatchItemsPerUnit, setEditBatchItemsPerUnit] = useState('')
  const [editBatchSavingSellAs, setEditBatchSavingSellAs] = useState(false)
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<any>(null)
  const [deletingBatch, setDeletingBatch] = useState(false)
  // Batch lookup state (search by batch number or expiry across all products)
  const [batchLookupQuery, setBatchLookupQuery] = useState('')
  const [batchLookupResults, setBatchLookupResults] = useState<any[]>([])
  const [batchLookupSearching, setBatchLookupSearching] = useState(false)
  const [batchLookupDebounce, setBatchLookupDebounce] = useState<NodeJS.Timeout | null>(null)
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
    name: '', sku: '', category: '', price: '', costPrice: '', stockQuantity: '',
    minStockLevel: '10', expiryDate: '', barcode: '', batchNumber: '',
    manufacturerId: '', vendorId: '', dosageForm: '',
    sellingUnit: 'EA', itemsPerUnit: '1',
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
  const [dosageForms, setDosageForms] = useState<string[]>([])
  const [savingProduct, setSavingProduct] = useState(false)

  // -- Import state ------------------------------------------------
  const [importDialog, setImportDialog] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    success: boolean
    message?: string
    error?: string
    totalRows?: number
    created?: number
    failed?: number
    skipped?: number
    validationErrors?: { row: number; name?: string; errors: string[] }[]
    createdProducts?: { id: string; name: string; ndc: string | null }[]
  } | null>(null)
  const [importPreview, setImportPreview] = useState<{ name: string; rows: number; size: string } | null>(null)

  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAppStore((s) => s.user)
  const dateFormat = useAppStore((s) => s.dateFormat)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)

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

  const fetchDosageForms = useCallback(async () => {
    try {
      const res = await fetch('/api/products/dosage-forms')
      if (res.ok) {
        setDosageForms(await res.json())
      }
    } catch {
      // silent
    }
  }, [])

  // Separate stable fetches from search-dependent inventory fetch
  useEffect(() => { fetchCategories(); fetchManufacturers(); fetchVendors(); fetchDosageForms() }, [fetchCategories, fetchManufacturers, fetchVendors, fetchDosageForms])
  useEffect(() => { fetchInventory() }, [fetchInventory])

  // Re-fetch inventory when drug catalog or other views mutate product data
  const prevInvVer = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInvVer.current !== inventoryVersion) {
      prevInvVer.current = inventoryVersion
      fetchInventory(true)
      fetchDosageForms()
    }
  }, [inventoryVersion, fetchInventory, fetchDosageForms])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
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
  }, [items, stockFilter, sortBy, sortDir])

  const lowStockCount = useMemo(() => items.filter((i) => { const q = Number(i.quantity) || 0; const r = Number(i.product.reorderPoint) || 10; return q > 0 && q <= r }).length, [items])
  const outOfStockCount = useMemo(() => items.filter((i) => (Number(i.quantity) || 0) === 0).length, [items])
  const totalValue = useMemo(() => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (i.product.costPrice || i.product.sellingPrice), 0), [items])


  const handleAdjust = async () => {
    if (!selectedItem || (!adjustAmount && !adjustCostPrice && !adjustSellingPrice && !adjustExpiryDate && !adjustBatchNumber) || !adjustReason) return
    try {
      const isSet = adjustType === 'SET'
      const adj = adjustAmount ? (adjustType === 'ADD' ? parseInt(adjustAmount) : adjustType === 'REMOVE' ? -parseInt(adjustAmount) : parseInt(adjustAmount)) : 0
      const body: Record<string, any> = {
        productId: selectedItem.productId,
        reason: adjustReason,
      }
      // Only send quantity fields when user actually entered an amount
      if (adjustAmount) {
        body.adjustmentType = adjustType
        if (isSet) { body.setQuantity = adj; body.adjustment = 0 } else { body.adjustment = adj }
      }
      if (adjustCostPrice !== '') body.costPrice = parseFloat(adjustCostPrice)
      if (adjustSellingPrice !== '') body.sellingPrice = parseFloat(adjustSellingPrice)
      if (adjustExpiryDate) body.expiryDate = adjustExpiryDate
      if (adjustBatchNumber.trim()) body.batchNumber = adjustBatchNumber.trim()

      const res = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to adjust')
      }
      const result = await res.json()
      addToast({ title: 'Product Updated', description: result.message || `${selectedItem.product.name} adjusted successfully`, variant: 'success' })
      setAdjustAmount('')
      setAdjustReason('')
      setAdjustCostPrice('')
      setAdjustSellingPrice('')
      setAdjustExpiryDate('')
      setAdjustBatchNumber('')
      fetchInventory(true)
      fetchBatches(selectedItem.productId)
      bumpInventoryVersion()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to adjust stock', variant: 'destructive' })
    }
  }

  // -- Batch management ----------------------------------------─
  const fetchBatches = useCallback(async (productId: string) => {
    setBatchesLoading(true)
    try {
      const res = await fetch(`/api/inventory/batches?productId=${productId}`)
      if (res.ok) {
        const data = await res.json()
        setBatches(data.batches || [])
      }
    } catch { /* silent */ }
    setBatchesLoading(false)
  }, [])

  const handleReceiveBatch = async () => {
    if (!selectedItem || !newBatchQty || Number(newBatchQty) <= 0) return
    setSavingBatch(true)
    try {
      const res = await fetch('/api/inventory/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser?.role || 'SUPER_ADMIN',
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify({
          productId: selectedItem.productId,
          quantity: Number(newBatchQty),
          expiryDate: newBatchExpiry || null,
          costPrice: newBatchCost ? parseFloat(newBatchCost) : null,
          batchNumber: newBatchNumber || null,
          reason: 'Received new stock (batch)',
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to receive batch') }
      const data = await res.json()
      const usedBN = data.batchNumber || newBatchNumber
      addToast({ title: 'Stock Received', description: `Added ${newBatchQty} units (${usedBN})`, variant: 'success' })
      setNewBatchQty(''); setNewBatchExpiry(''); setNewBatchCost(''); setNewBatchNumber(genBN())
      fetchBatches(selectedItem.productId)
      fetchInventory(true)
      bumpInventoryVersion()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to receive batch', variant: 'destructive' })
    }
    setSavingBatch(false)
  }

  const handleDeleteBatch = (batch: any) => {
    setDeleteBatchTarget(batch)
  }

  const confirmDeleteBatch = async () => {
    if (!deleteBatchTarget) return
    setDeletingBatch(true)
    try {
      const res = await fetch(`/api/inventory/batches/${deleteBatchTarget.id}`, {
        method: 'DELETE',
        headers: { 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to delete batch') }
      addToast({ title: 'Batch Removed', description: 'Batch deleted, inventory recalculated', variant: 'success' })
      if (selectedItem) fetchBatches(selectedItem.productId)
      fetchInventory(true)
      bumpInventoryVersion()
      setDeleteBatchTarget(null)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to delete batch', variant: 'destructive' })
    }
    setDeletingBatch(false)
  }

  const handleEditBatch = (b: any) => {
    setEditingBatch(b)
    setEditBatchQty(String(b.quantity))
    setEditBatchExpiry(b.expiryDate ? b.expiryDate.slice(0, 10) : '')
    setEditBatchCost(b.costPrice != null ? String(b.costPrice) : '')
    setEditBatchNumber(b.batchNumber || '')
    setEditBatchAdjType('ADD')
    setEditBatchAdjAmount('')
    setEditBatchSellingPrice('')
    setEditBatchReason('')
    // Initialize sell-as from the matching product or defaults
    const prod = selectedItem?.productId === b.productId ? selectedItem.product : null
    setEditBatchSellingUnit(prod?.sellingUnit || 'EA')
    setEditBatchItemsPerUnit(String(prod?.itemsPerUnit || 1))
    setEditBatchSavingSellAs(false)
    setEditBatchModalOpen(true)
  }

  const handleSaveBatch = async () => {
    if (!editingBatch) return
    const hasAdjAmount = editBatchAdjAmount !== '' && Number(editBatchAdjAmount) !== 0
    const hasDirectEdits = editBatchQty !== '' || editBatchExpiry !== '' || editBatchCost !== '' || editBatchNumber !== (editingBatch.batchNumber || '')
    const hasPriceChange = editBatchSellingPrice !== ''
    const needsReason = hasAdjAmount

    if (!hasDirectEdits && !hasAdjAmount && !hasPriceChange) return
    if (needsReason && !editBatchReason.trim()) {
      addToast({ title: 'Reason Required', description: 'Enter a reason for the stock adjustment', variant: 'destructive' })
      setSavingBatch(false)
      return
    }

    setSavingBatch(true)
    try {
      // 1) Calculate the final batch quantity
      let finalQty: number | undefined
      if (hasAdjAmount) {
        const currentQty = Number(editingBatch.quantity) || 0
        const adj = Number(editBatchAdjAmount) || 0
        if (editBatchAdjType === 'ADD') finalQty = currentQty + adj
        else if (editBatchAdjType === 'REMOVE') finalQty = Math.max(0, currentQty - adj)
        else finalQty = adj // SET
      } else if (editBatchQty !== '') {
        finalQty = parseInt(editBatchQty)
      }

      // 2) Update the batch via PUT
      const body: Record<string, any> = { reason: editBatchReason.trim() || 'Batch edit' }
      if (finalQty !== undefined) body.quantity = finalQty
      if (editBatchExpiry) body.expiryDate = new Date(editBatchExpiry).toISOString()
      else if (editBatchExpiry === '' && editingBatch.expiryDate) body.expiryDate = null
      if (editBatchCost !== '') body.costPrice = parseFloat(editBatchCost)
      if (editBatchNumber !== (editingBatch.batchNumber || '')) body.batchNumber = editBatchNumber.trim() || null

      const res = await fetch(`/api/inventory/batches/${editingBatch.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentUser?.role || 'SUPER_ADMIN',
          'x-user-id': currentUser?.id || '',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to update batch') }
      const result = await res.json()

      // 3) Update selling price at product level if changed
      if (hasPriceChange) {
        const sp = parseFloat(editBatchSellingPrice)
        await fetch(`/api/products/${editingBatch.productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
          body: JSON.stringify({ sellingPrice: sp }),
        })
      }

      const descParts: string[] = []
      if (hasAdjAmount) descParts.push(`stock ${editBatchAdjType === 'ADD' ? '+' : editBatchAdjType === 'REMOVE' ? '-' : 'set'}${editBatchAdjAmount}`)
      if (hasPriceChange) descParts.push(`price → ${formatCurrency(parseFloat(editBatchSellingPrice))}`)
      if (!hasAdjAmount && hasDirectEdits) descParts.push('details updated')

      addToast({ title: 'Batch Updated', description: `${result.batchNumber || 'Batch'}: ${descParts.join(', ')}. Total stock: ${result.totalStock}`, variant: 'success' })
      setEditBatchModalOpen(false)
      setEditingBatch(null)
      if (selectedItem && editingBatch?.productId === selectedItem.productId) fetchBatches(selectedItem.productId)
      fetchInventory(true)
      bumpInventoryVersion()
      // Refresh lookup results if there's an active search
      if (batchLookupQuery.trim()) handleBatchLookup(batchLookupQuery)
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to update batch', variant: 'destructive' })
    }
    setSavingBatch(false)
  }

  // -- Save Sell As from Edit Batch modal --
  const handleEditBatchSaveSellAs = async () => {
    if (!editingBatch) return
    const productId = editingBatch.productId
    const su = editBatchSellingUnit || 'EA'
    const ipu = editBatchItemsPerUnit ? parseInt(editBatchItemsPerUnit) : 1
    // Check if changed from current product values
    const currentSu = selectedItem?.product.sellingUnit || 'EA'
    const currentIpu = selectedItem?.product.itemsPerUnit || 1
    if (su === currentSu && ipu === currentIpu) {
      addToast({ title: 'No Change', description: 'Selling unit is already set to this value', variant: 'default' })
      return
    }
    setEditBatchSavingSellAs(true)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
        body: JSON.stringify({ sellingUnit: su, itemsPerUnit: ipu }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to update') }
      // Optimistically update local state
      setItems(prev => prev.map(it =>
        it.productId === productId
          ? { ...it, product: { ...it.product, sellingUnit: su, itemsPerUnit: ipu } }
          : it
      ))
      setSelectedItem(prev => prev ? { ...prev, product: { ...prev.product, sellingUnit: su, itemsPerUnit: ipu } } : null)
      addToast({ title: 'Sell As Updated', description: `Now sells as ${su}${ipu > 1 ? ` (${ipu} per unit)` : ''}`, variant: 'success' })
      fetchInventory(true)
      bumpInventoryVersion()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to update selling unit', variant: 'destructive' })
    } finally {
      setEditBatchSavingSellAs(false)
    }
  }

  // -- Batch lookup (search across all products by batch# or expiry) --
  const handleBatchLookup = (query: string) => {
    setBatchLookupQuery(query)
    if (batchLookupDebounce) clearTimeout(batchLookupDebounce)
    if (!query.trim()) { setBatchLookupResults([]); setBatchLookupSearching(false); return }
    setBatchLookupSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/inventory/batches?action=search&q=${encodeURIComponent(query.trim())}`)
        if (res.ok) {
          const data = await res.json()
          setBatchLookupResults(data.batches || [])
        }
      } catch { /* silent */ }
      setBatchLookupSearching(false)
    }, 400)
    setBatchLookupDebounce(timer)
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
          barcode: productForm.barcode || null,
          category: productForm.category,
          sellingPrice: parseFloat(productForm.price),
          costPrice: productForm.costPrice ? parseFloat(productForm.costPrice) : parseFloat(productForm.price) * 0.7,
          reorderPoint: parseInt(productForm.minStockLevel) || 10,
          expiryDate: productForm.expiryDate || null,
          batchNumber: productForm.batchNumber || null,
          manufacturerId: productForm.manufacturerId || null,
          vendorId: productForm.vendorId || null,
          dosageForm: productForm.dosageForm || null,
          sellingUnit: productForm.sellingUnit || 'EA',
          itemsPerUnit: parseInt(productForm.itemsPerUnit) || 1,
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
      bumpInventoryVersion()
      setAddProductDialog(false)
      setProductForm({ name: '', sku: '', category: 'OTC', price: '', costPrice: '', stockQuantity: '', minStockLevel: '10', expiryDate: '', barcode: '', batchNumber: '', manufacturerId: '', vendorId: '', dosageForm: '', sellingUnit: 'EA', itemsPerUnit: '1' })
      fetchInventory()
      fetchDosageForms()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add product', variant: 'destructive' })
    } finally {
      setSavingProduct(false)
    }
  }

  // -- Inline "add new" handlers for dropdowns --
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

  const handleAddDosageForm = async () => {
    if (!addDfName.trim()) return
    const upper = addDfName.trim().toUpperCase()
    if (dosageForms.includes(upper)) {
      setProductForm((prev) => ({ ...prev, dosageForm: upper }))
      setAddDfName('')
      setAddDfOpen(false)
      return
    }
    try {
      const res = await fetch('/api/products/dosage-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: upper }),
      })
      if (res.ok || res.status === 409) {
        setDosageForms((prev) => [...new Set([...prev, upper])].sort())
        setProductForm((prev) => ({ ...prev, dosageForm: upper }))
        addToast({ title: 'Dosage Form Added', description: `${upper} added`, variant: 'success' })
      } else {
        addToast({ title: 'Error', description: 'Failed to add dosage form', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to add dosage form', variant: 'destructive' })
    }
    setAddDfName('')
    setAddDfOpen(false)
  }

  // -- Stock Count: API-based product search + set physical quantities & prices --
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
            headers: { 'Content-Type': 'application/json', 'x-user-role': currentUser?.role || 'SUPER_ADMIN', 'x-user-id': currentUser?.id || '' },
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

  // -- Import file handler ------------------------------------------
  const handleImportFileSelect = async (file: File) => {
    // Validate size (5 MB)
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
          description: `${data.created} product${data.created !== 1 ? 's' : ''} imported successfully${data.failed > 0 ? ` (${data.failed} failed)` : ''}`,
          variant: 'success',
        })
        bumpInventoryVersion()
      } else if (!data.success) {
        addToast({ title: 'Import Failed', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (err: any) {
      setImportResult({ success: false, error: err.message || 'Network error while importing' })
      addToast({ title: 'Import Error', description: err.message || 'Failed to import products', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader icon={Package} title="Inventory" description="Manage your pharmacy product stock and batches" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Package className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-gray-400">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{lowStockCount}</p>
              <p className="text-xs text-gray-400">Low Stock Alerts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{outOfStockCount}</p>
              <p className="text-xs text-gray-400">Out of Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover transition-all duration-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-50 flex items-center justify-center">
              <TrendingUp className="h-4.5 w-4.5 text-teal-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
              <p className="text-xs text-gray-400">Inventory Value</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by product name or NDC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50/50 border-gray-200/80 focus:bg-white"
              />
            </div>
            <div className="relative sm:w-56">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${batchLookupSearching ? 'text-indigo-500 animate-pulse' : 'text-indigo-400'}`} />
              <Input
                placeholder="Batch # or expiry (YYYY-MM-DD)"
                value={batchLookupQuery}
                onChange={(e) => handleBatchLookup(e.target.value)}
                className={`pl-9 pr-8 ${batchLookupQuery ? 'bg-indigo-50/50 border-indigo-300/80 focus:bg-indigo-50' : 'bg-gray-50/50 border-gray-200/80 focus:bg-white'}`}
              />
              {batchLookupQuery && (
                <button
                  onClick={() => { setBatchLookupQuery(''); setBatchLookupResults([]) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
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
            <Button onClick={() => setImportDialog(true)} variant="outline" className="border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300">
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline Batch Lookup */}
      {batchLookupQuery && (
        <Card className="shadow-sm border-indigo-200/60 bg-indigo-50/30">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700">Batch Lookup</span>
                {batchLookupSearching ? (
                  <span className="text-xs text-muted-foreground animate-pulse">Searching...</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{batchLookupResults.length} found</span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setBatchLookupQuery(''); setBatchLookupResults([]) }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {batchLookupResults.length > 0 ? (
              <div className="border rounded max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Product</th>
                      <th className="px-2 py-1.5 text-left font-medium">Batch #</th>
                      <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-left font-medium">Expiry</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                      <th className="px-2 py-1.5 text-center font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {batchLookupResults.map((b: any) => {
                      const days = b.expiryDate ? getDaysToExpiry(b.expiryDate) : null
                      return (
                        <tr key={b.id} className="hover:bg-muted/30">
                          <td className="px-2 py-1.5">
                            <p className="font-medium truncate max-w-[160px]">{b.productName}</p>
                          </td>
                          <td className="px-2 py-1.5 font-mono">{b.batchNumber || '—'}</td>
                          <td className="px-2 py-1.5 text-center font-mono">{b.quantity}</td>
                          <td className="px-2 py-1.5">
                            {b.expiryDate ? (
                              <span className={days !== null && days <= 90 ? (days <= 0 ? 'text-red-600 font-semibold' : 'text-amber-600') : ''}>
                                {formatDate(b.expiryDate)}
                                {days !== null && days <= 90 && (
                                  <Badge variant={days <= 0 ? 'destructive' : 'secondary'} className="ml-1 text-[10px] px-1 py-0">
                                    {days <= 0 ? 'Expired' : `${days}d`}
                                  </Badge>
                                )}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right">{b.costPrice != null ? formatCurrency(b.costPrice) : '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => handleEditBatch(b)}
                              disabled={savingBatch}
                              className="text-muted-foreground hover:text-indigo-600 disabled:opacity-50 p-0.5"
                              title="Edit batch"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : !batchLookupSearching && (
              <p className="text-xs text-muted-foreground text-center py-3">No batches found matching "{batchLookupQuery}"</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inventory Table */}
      <Card className="card-hover">
        <CardContent className="p-0">
          <Table className="table-header-standard">
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => { setSortBy('name'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center gap-1">Drug Name <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="cursor-pointer hidden sm:table-cell" onClick={() => { setSortBy('category'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center gap-1">Category <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead className="hidden md:table-cell">Manufacturer</TableHead>
                <TableHead className="hidden md:table-cell">Vendor</TableHead>
                <TableHead className="hidden md:table-cell">Dosage Form</TableHead>
                <TableHead className="hidden md:table-cell">Sell As</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => { setSortBy('stock'); setSortDir(sortDir === 'asc' ? 'desc' : 'asc') }}>
                  <span className="flex items-center justify-end gap-1">Stock Qty <ArrowUpDown className="h-3 w-3" /></span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Reorder Lvl</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Cost</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Retail</TableHead>
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
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14}>
                    <EmptyState
                      icon={searchQuery || categoryFilter !== 'ALL' || stockFilter !== 'ALL' ? Search : Package}
                      title={searchQuery || categoryFilter !== 'ALL' || stockFilter !== 'ALL' ? 'No matching items' : 'No inventory items'}
                      description={searchQuery || categoryFilter !== 'ALL' || stockFilter !== 'ALL' ? 'Try adjusting your search or filters' : 'Add your first product to get started'}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                (() => {
                  const todayWAT = getTodayWAT()
                  return filteredItems.map((item) => {
                  const qty = Number(item.quantity) || 0
                  const reorder = Number(item.product.reorderPoint) || 10
                  const isOut = qty === 0
                  const isLow = qty > 0 && qty <= reorder
                  const bs = (item as any).batchExpirySummary
                  // Use batch-level expiry summary for accurate status (avoids false-expired when some batches are still active)
                  const allBatchesExpired = bs?.hasBatches ? (bs.allBatchesExpired === true) : false
                  const hasExpiredBatches = bs?.hasBatches ? (bs.hasExpiredBatches === true) : false
                  const activeExpiry = bs?.nearestActiveExpiry || item.product.expiryDate
                  const nearExpiryCount = bs?.nearExpiryBatches || 0
                  const daysToExpiry = daysToExpiryFrom(activeExpiry, todayWAT)
                  const nearExpiry = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 30
                  const showExpired = allBatchesExpired && qty > 0
                  const isDiscontinued = item.product.status === 'DISCONTINUED'
                  return (
                    <TableRow key={item.id} className={`hover:bg-gray-50/50 transition-colors ${isOut ? 'bg-red-50/50' : isLow ? 'bg-amber-50/50' : ''}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{item.product.name}</p>
                          <p className="text-xs text-gray-600">
                            {item.product.strength} {item.product.dosageForm} · {item.product.unitOfMeasure}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs font-mono">{item.product.ndc || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">{item.product.category.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-600">{item.product.manufacturerRef?.name || item.product.manufacturer || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-600">{item.product.vendor?.name || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-600">{item.product.dosageForm || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-600">
                        {item.product.sellingUnit && item.product.sellingUnit !== 'EA' ? (
                          <span>{item.product.sellingUnit} ({item.product.itemsPerUnit})</span>
                        ) : (
                          <span className="text-gray-400">Each</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {qty}
                        {item.product.sellingUnit && item.product.sellingUnit !== 'EA' && item.product.itemsPerUnit > 1 ? (
                          <p className="text-[10px] text-gray-400 font-normal">{Math.floor(qty / item.product.itemsPerUnit)} {item.product.sellingUnit.toLowerCase()}{Math.floor(qty / item.product.itemsPerUnit) !== 1 ? 's' : ''}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {isDiscontinued ? (
                          <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">Discontinued</Badge>
                        ) : isOut ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Out of Stock</Badge>
                        ) : showExpired ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Expired</Badge>
                        ) : hasExpiredBatches ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px]">Partial Expired</Badge>
                        ) : isLow ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Low Stock</Badge>
                        ) : nearExpiry && daysToExpiry !== null ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{daysToExpiry} day{daysToExpiry !== 1 ? 's' : ''} to expiry</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">In Stock</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right text-gray-600">{reorder}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right">{item.product.costPrice != null ? formatCurrency(item.product.costPrice) : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right">{formatCurrency(item.product.sellingPrice)}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-gray-600">
                        {formatDate(activeExpiry)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedItem(item); setAdjustType('SET'); setAdjustExpiryDate(item.product.expiryDate?.split('T')[0] || ''); fetchBatches(item.productId); setAdjustDialog(true) }}>
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Adjust
                        </Button>
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

      {/* Add Product Dialog */}
      <Dialog open={addProductDialog} onOpenChange={setAddProductDialog}>
        <DialogContent className="max-w-2xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <PackagePlus className="h-4.5 w-4.5 text-emerald-600" />
              </div>
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
                <Select value={productForm.category || undefined} onValueChange={(v) => setProductForm({ ...productForm, category: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">No categories yet</div>}
                    {categories.map((cat) => (
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
              <div className="flex gap-1 mt-1">
                <Input
                  id="prod-barcode"
                  placeholder="Auto-generated if blank"
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => setProductForm({ ...productForm, barcode: generateBarcode(productForm.sku || undefined) })} title="Auto-generate barcode">
                  Auto
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Leave blank to auto-generate</p>
            </div>

            {/* Batch Number */}
            <div>
              <Label htmlFor="prod-batchno">Batch Number</Label>
              <div className="flex gap-1 mt-1">
                <Input
                  id="prod-batchno"
                  placeholder="BN-DDMMYYYY-XXXX"
                  value={productForm.batchNumber}
                  onChange={(e) => setProductForm({ ...productForm, batchNumber: e.target.value })}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" className="h-9 w-9 px-0 shrink-0" onClick={() => setProductForm({ ...productForm, batchNumber: genBN() })} title="Auto-generate batch number">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Leave blank to auto-generate on first stock receipt</p>
            </div>

            {/* Sell As (Selling Unit) */}
            <div>
              <Label htmlFor="prod-selling-unit">Sell As</Label>
              <Select value={productForm.sellingUnit} onValueChange={(v) => setProductForm({ ...productForm, sellingUnit: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
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
            <div>
              <Label htmlFor="prod-items-per-unit">Items Per {productForm.sellingUnit === 'EA' ? 'Unit' : productForm.sellingUnit}</Label>
              <Input
                id="prod-items-per-unit"
                type="number"
                min="1"
                step="1"
                placeholder="e.g., 10"
                value={productForm.itemsPerUnit}
                onChange={(e) => setProductForm({ ...productForm, itemsPerUnit: e.target.value })}
                className="mt-1"
                disabled={productForm.sellingUnit === 'EA'}
              />
              {productForm.sellingUnit !== 'EA' && productForm.itemsPerUnit && parseInt(productForm.itemsPerUnit) > 1 && productForm.price && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Unit price: {formatCurrency(parseFloat(productForm.price) / parseInt(productForm.itemsPerUnit))} per item
                </p>
              )}
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



      {/* -- Add Manufacturer Modal -- */}
      <Dialog open={addMfgOpen} onOpenChange={setAddMfgOpen}>
        <DialogContent className="max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Plus className="h-4.5 w-4.5 text-emerald-600" />
              </div>
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

      {/* -- Add Vendor Modal -- */}
      <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
        <DialogContent className="max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Plus className="h-4.5 w-4.5 text-emerald-600" />
              </div>
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

      {/* -- Add Category Modal -- */}
      <Dialog open={addCatOpen} onOpenChange={setAddCatOpen}>
        <DialogContent className="max-w-md rounded-xl">
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

      {/* -- Add Dosage Form Modal -- */}
      <Dialog open={addDfOpen} onOpenChange={setAddDfOpen}>
        <DialogContent className="max-w-md rounded-xl">
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

      {/* Stock Adjustment Dialog with Batch Management */}
      <Dialog open={adjustDialog} onOpenChange={(open) => { if (!open) { setAdjustDialog(false); setBatches([]) } else setAdjustDialog(true) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle>Adjust Product</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium">{selectedItem.product.name}</p>
                <p className="text-sm text-muted-foreground">
                  Current Stock: {Number(selectedItem.quantity) || 0} {selectedItem.product.unitOfMeasure}
                  &nbsp;·&nbsp; Cost: {selectedItem.product.costPrice != null ? formatCurrency(selectedItem.product.costPrice) : '—'}
                  &nbsp;·&nbsp; Price: {formatCurrency(selectedItem.product.sellingPrice)}
                  {selectedItem.product.expiryDate && (
                    <>&nbsp;·&nbsp; Nearest Expiry: {formatDate(selectedItem.product.expiryDate)}</>
                  )}
                </p>
              </div>

              {/* ── Batch / Lot Management ── */}
              <div className="border rounded-lg p-3 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Stock Batches (Lots)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Each batch has its own expiry date and cost. Use this section to add new stock with its specific expiry date. Sales automatically consume the earliest-expiring batch first (FEFO).
                </p>

                {/* Existing batches table */}
                {batchesLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : batches.length > 0 ? (
                  <div className="border rounded max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Batch #</th>
                          <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                          <th className="px-2 py-1.5 text-left font-medium">Expiry</th>
                          <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                          <th className="px-2 py-1.5 text-center font-medium w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {batches.map((b: any) => {
                          const days = b.expiryDate ? getDaysToExpiry(b.expiryDate) : null
                          return (
                            <tr key={b.id} className="hover:bg-muted/30">
                              <td className="px-2 py-1.5 font-medium">{b.batchNumber || '—'}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{b.quantity}</td>
                              <td className="px-2 py-1.5">
                                {b.expiryDate ? (
                                  <span className={days !== null && days <= 90 ? (days <= 0 ? 'text-red-600 font-semibold' : 'text-amber-600') : ''}>
                                    {formatDate(b.expiryDate)}
                                    {days !== null && days <= 90 && (
                                      <Badge variant={days <= 0 ? 'destructive' : 'secondary'} className="ml-1 text-[10px] px-1 py-0">
                                        {days <= 0 ? 'Expired' : `${days}d`}
                                      </Badge>
                                    )}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{b.costPrice != null ? formatCurrency(b.costPrice) : '—'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleEditBatch(b)}
                                    disabled={savingBatch}
                                    className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 disabled:opacity-50 rounded p-1"
                                    title="Edit batch"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteBatch(b)}
                                    disabled={savingBatch}
                                    className="bg-red-100 hover:bg-red-200 text-red-600 disabled:opacity-50 rounded p-1"
                                    title="Remove batch"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={Package} title="No batches" description="No batches recorded for this product yet." />
                )}

                {/* Receive new batch form */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Receive New Stock as Batch</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Quantity <span className="text-red-500">*</span></Label>
                      <Input type="number" min="1" placeholder="e.g., 100" value={newBatchQty} onChange={(e) => setNewBatchQty(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Batch Number</Label>
                      <div className="flex gap-1 mt-0.5">
                        <Input placeholder="BN-DDMMYYYY-XXXX" value={newBatchNumber} onChange={(e) => setNewBatchNumber(e.target.value)} className="h-7 text-xs flex-1" />
                        <Button type="button" variant="outline" size="sm" className="h-7 w-7 px-0 shrink-0" onClick={() => setNewBatchNumber(genBN())} title="Regenerate batch number">
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px]">Expiry Date</Label>
                      <Input type="date" value={newBatchExpiry} onChange={(e) => setNewBatchExpiry(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Cost Price</Label>
                      <Input type="number" step="0.01" min="0" placeholder="e.g., 5.00" value={newBatchCost} onChange={(e) => setNewBatchCost(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleReceiveBatch} disabled={!newBatchQty || Number(newBatchQty) <= 0 || savingBatch} className="w-full text-xs">
                    {savingBatch ? 'Receiving...' : `Receive ${newBatchQty || '0'} Units as New Batch`}
                  </Button>
                </div>
              </div>

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Count Dialog — API search + physical count + price edit */}
      <Dialog open={stockCountDialog} onOpenChange={(open) => {
        if (!open) { setStockCountDialog(false); setStockEntries([]); setStockSearch(''); setStockSearchResults([]) }
        else setStockCountDialog(true)
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              Periodic Stock Taking
            </DialogTitle>
            <DialogDescription>Search products, enter physical stock counts and optionally adjust cost & selling prices. All changes update the system immediately.</DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Product Search — queries API with debounce */}
          <div className="relative shrink-0">
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
              <EmptyState icon={ClipboardCheck} title="No products added yet" description="Search and add products above to begin counting stock" />
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
                            <p className="text-xs text-gray-600">{entry.ndc || '—'}</p>
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
                              placeholder="0.00"
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
                              placeholder="0.00"
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

      {/* -- Import Products Dialog -------------------------------- */}
      <Dialog open={importDialog} onOpenChange={(open) => { if (!open) { setImportDialog(false); setImportFile(null); setImportResult(null); setImportPreview(null) } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-teal-600" />
              Import Products from Excel
            </DialogTitle>
            <DialogDescription>
              Upload an Excel (.xlsx) or CSV file to bulk-import products. Download the template first to see the required format.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Template download */}
            <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg">
              <FileSpreadsheet className="h-5 w-5 text-teal-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-teal-800">Download Import Template</p>
                <p className="text-xs text-teal-600">Contains columns guide, example data, and reference sheets for categories and dosage forms.</p>
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
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    importFile
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'
                  }`}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (file) handleImportFileSelect(file)
                  }}
                >
                  <input
                    id="import-file-input"
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
                      <>
                        <span className="animate-spin mr-2">⟳</span>
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Import {importPreview ? `${importPreview.rows} Products` : 'Products'}
                      </>
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

                {/* Validation errors table */}
                {importResult.validationErrors && importResult.validationErrors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Validation Issues ({importResult.validationErrors.length} row{importResult.validationErrors.length !== 1 ? 's' : ''})
                    </p>
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

                {/* Close button */}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setImportResult(null); setImportFile(null); setImportPreview(null) }}
                  >
                    Import Another File
                  </Button>
                  <Button
                    onClick={() => {
                      setImportDialog(false)
                      setImportResult(null)
                      setImportFile(null)
                      setImportPreview(null)
                      fetchInventory(true)
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

      {/* Edit Batch Modal — includes Quick Stock Adjustment */}
      <Dialog open={editBatchModalOpen} onOpenChange={(open) => { if (!open) { setEditBatchModalOpen(false); setEditingBatch(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] rounded-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-indigo-600" />
              Edit Batch
            </DialogTitle>
            <DialogDescription>
              {editingBatch ? `Editing batch ${editingBatch.batchNumber || editingBatch.id.slice(0, 8)}${editingBatch.productName ? ` for ${editingBatch.productName}` : selectedItem ? ` for ${selectedItem.product.name}` : ''}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current batch info */}
            {editingBatch && (
              <div className="bg-muted rounded-lg p-2.5 text-xs text-muted-foreground">
                Current: <span className="font-mono font-medium text-foreground">{editingBatch.quantity}</span> units
                {editingBatch.costPrice != null && <>
                  · Cost: <span className="font-medium text-foreground">{formatCurrency(editingBatch.costPrice)}</span></>}
                {editingBatch.expiryDate && <>
                  · Exp: <span className={getDaysToExpiry(editingBatch.expiryDate) <= 0 ? 'text-red-600 font-semibold' : ''}>{formatDate(editingBatch.expiryDate)}</span></>}
              </div>
            )}

            {/* ── Quick Stock Adjustment ── */}
            <div className="border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Edit className="h-3.5 w-3.5" />
                Quick Stock Adjustment
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Adjustment Type</Label>
                  <Select value={editBatchAdjType} onValueChange={setEditBatchAdjType}>
                    <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADD">Add Stock</SelectItem>
                      <SelectItem value="SET">Set Quantity</SelectItem>
                      <SelectItem value="REMOVE">Remove Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{editBatchAdjType === 'SET' ? 'New Total' : 'Units'}</Label>
                  <Input type="number" min="0" placeholder={editBatchAdjType === 'SET' ? 'New total qty' : 'Units to adjust'} value={editBatchAdjAmount} onChange={(e) => setEditBatchAdjAmount(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <Label className="text-xs">Selling Price</Label>
                  <Input type="number" step="0.01" min="0" placeholder="Leave blank to keep" value={editBatchSellingPrice} onChange={(e) => setEditBatchSellingPrice(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <Label className="text-xs">Reason {editBatchAdjAmount && Number(editBatchAdjAmount) !== 0 && <span className="text-red-500">*</span>}</Label>
                  <Input placeholder="e.g., Restocked, Damaged" value={editBatchReason} onChange={(e) => setEditBatchReason(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
              </div>
            </div>

            {/* ── Batch Details ── */}
            <div className="border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Batch Details
              </h4>
              <div>
                <Label className="text-xs">Batch Number</Label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="BN-DDMMYYYY-XXXX or leave blank" value={editBatchNumber} onChange={(e) => setEditBatchNumber(e.target.value)} className="h-8 text-sm flex-1" />
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 px-0 shrink-0" onClick={() => setEditBatchNumber(genBN())} title="Auto-generate">
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty to clear.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Set Quantity</Label>
                  <Input type="number" min="0" placeholder={String(editingBatch?.quantity || 0)} value={editBatchQty} onChange={(e) => setEditBatchQty(e.target.value)} className="h-8 text-sm mt-0.5" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Direct set (or use adjustment above)</p>
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input type="date" value={editBatchExpiry} onChange={(e) => setEditBatchExpiry(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <Label className="text-xs">Cost Price</Label>
                  <Input type="number" step="0.01" min="0" value={editBatchCost} onChange={(e) => setEditBatchCost(e.target.value)} className="h-8 text-sm mt-0.5" placeholder="0.00" />
                </div>
              </div>
            </div>

            {/* ── Sell As (Unit Sales) ── */}
            <div className="border rounded-lg p-3 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <PackagePlus className="h-3.5 w-3.5" />
                Sell As (Unit Sales)
              </h4>
              <p className="text-xs text-muted-foreground">
                Set how this product is sold to customers. E.g., sell as a Strip of 10 tablets instead of individual tablets.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Selling Unit</Label>
                  <Select value={editBatchSellingUnit} onValueChange={setEditBatchSellingUnit}>
                    <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
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
                <div>
                  <Label className="text-xs">Items Per {editBatchSellingUnit === 'EA' ? 'Unit' : editBatchSellingUnit}</Label>
                  <Input type="number" min="1" step="1" placeholder="e.g., 10" value={editBatchItemsPerUnit} onChange={(e) => setEditBatchItemsPerUnit(e.target.value)} className="h-8 text-sm mt-0.5" disabled={editBatchSellingUnit === 'EA'} />
                </div>
              </div>
              {editBatchSellingUnit !== 'EA' && editBatchItemsPerUnit && parseInt(editBatchItemsPerUnit) > 1 && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                  Stock shows as: <span className="font-medium">{Math.floor((Number(selectedItem?.quantity) || 0) / parseInt(editBatchItemsPerUnit))} {editBatchSellingUnit.toLowerCase()}{Math.floor((Number(selectedItem?.quantity) || 0) / parseInt(editBatchItemsPerUnit)) !== 1 ? 's' : ''}</span> of {editBatchItemsPerUnit} items each
                  &nbsp;·&nbsp; Unit price: <span className="font-medium">{selectedItem ? formatCurrency(selectedItem.product.sellingPrice / parseInt(editBatchItemsPerUnit)) : '—'}</span>
                </p>
              )}
              <Button size="sm" variant="outline" onClick={handleEditBatchSaveSellAs} disabled={editBatchSavingSellAs} className="w-full">
                {editBatchSavingSellAs ? 'Saving...' : 'Update Sell As'}
              </Button>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setEditBatchModalOpen(false); setEditingBatch(null) }}>Cancel</Button>
            <Button onClick={handleSaveBatch} disabled={savingBatch} className="bg-indigo-600 hover:bg-indigo-700">
              {savingBatch ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Batch Confirmation ─────────────────────── */}
      <AlertDialog open={!!deleteBatchTarget} onOpenChange={(open) => { if (!open) setDeleteBatchTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              Delete Batch
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete batch <strong>{deleteBatchTarget?.batchNumber || deleteBatchTarget?.id}</strong>?
              This will permanently remove this stock batch record and reduce the product's total inventory.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmDeleteBatch}
              disabled={deletingBatch}
            >
              {deletingBatch ? 'Deleting...' : 'Delete Batch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
