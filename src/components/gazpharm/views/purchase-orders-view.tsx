'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShoppingCart,
  Plus,
  Search,
  Eye,
  Send,
  XCircle,
  PackageCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  CalendarDays,
  Truck,
  Clock,
  AlertCircle,
  X,
  Minus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { authHeaders } from '@/lib/auth-headers'
import { formatCurrency } from '@/lib/currency'
import { formatDateTime, formatDate } from '@/lib/date-utils'
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'

// ── Types ──────────────────────────────────────────────────────────────────

type POStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'

interface POItem {
  id: string
  orderId: string
  productId: string
  productName: string
  quantity: number
  receivedQty: number
  unitCost: number
  createdAt: string
}

interface PurchaseOrder {
  id: string
  vendorId: string | null
  vendorName: string
  status: POStatus
  notes: string | null
  expectedDate: string | null
  totalAmount: number
  receivedAmount: number
  createdBy: string
  createdAt: string
  updatedAt: string
  vendor: { name: string; phone: string | null; email: string | null } | null
  items?: POItem[]
  _count?: { items: number }
}

interface Vendor {
  id: string
  name: string
  phone: string | null
  email: string | null
}

interface Product {
  id: string
  name: string
  ndc: string | null
  costPrice: number | null
  sellingPrice: number
  dosageForm: string | null
  strength: string | null
}

interface NewItemForm {
  productId: string
  productName: string
  quantity: number
  unitCost: number
}

interface ReceiveItemForm {
  orderItemId: string
  productName: string
  orderedQty: number
  alreadyReceived: number
  quantityReceived: number
  batchNumber: string
  expiryDate: string
  costPrice: number
}

// ── Status helpers ────────────────────────────────────────────────────────

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PARTIALLY_RECEIVED', label: 'Partially Received' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

function statusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return <Badge className="bg-slate-100 text-slate-700 text-xs border-slate-200"><FileText className="h-3 w-3 mr-1" />Draft</Badge>
    case 'SENT':
      return <Badge className="bg-blue-100 text-blue-700 text-xs border-blue-200"><Send className="h-3 w-3 mr-1" />Sent</Badge>
    case 'PARTIALLY_RECEIVED':
      return <Badge className="bg-amber-100 text-amber-700 text-xs border-amber-200"><Truck className="h-3 w-3 mr-1" />Partial</Badge>
    case 'RECEIVED':
      return <Badge className="bg-emerald-100 text-emerald-700 text-xs border-emerald-200"><PackageCheck className="h-3 w-3 mr-1" />Received</Badge>
    case 'CANCELLED':
      return <Badge className="bg-red-100 text-red-700 text-xs border-red-200"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>
    default:
      return <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs border-gray-200 dark:border-gray-700">{status}</Badge>
  }
}

function truncId(id: string) {
  return id.length > 10 ? id.substring(0, 8) + '…' : id
}

// ── Component ─────────────────────────────────────────────────────────────

export function PurchaseOrdersView() {
  // List state
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})

  // Detail dialog
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Pending PO items from store (pre-filled from low stock)
  const pendingPOItems = useAppStore((s) => s.pendingPOItems)
  const setPendingPOItems = useAppStore((s) => s.setPendingPOItems)
  const addToast = useAppStore((s) => s.addToast)

  // New PO dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [selectedVendorId, setSelectedVendorId] = useState('')
  const [selectedVendorName, setSelectedVendorName] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [poNotes, setPoNotes] = useState('')
  const [newItems, setNewItems] = useState<NewItemForm[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [productDropdownOpen, setProductDropdownOpen] = useState(false)
  const [addItemIndex, setAddItemIndex] = useState<number | null>(null)

  // Receive dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false)
  const [receiveItems, setReceiveItems] = useState<ReceiveItemForm[]>([])
  const [receiving, setReceiving] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ── Fetch POs ──
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(activeTab !== 'ALL' ? { status: activeTab } : {}),
        ...(search ? { search } : {}),
      })
      const res = await fetch(`/api/purchase-orders?${params}`, { headers: authHeaders() })
      const data = await res.json()
      if (res.ok) {
        setOrders(data.orders || [])
        setTotalPages(data.pagination?.pages || 1)
        setStatusCounts(data.statusCounts || {})
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err)
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { setPage(1) }, [activeTab, search])

  // ── Auto-open PO dialog with pending items from low stock ──
  useEffect(() => {
    if (pendingPOItems && pendingPOItems.length > 0 && !newDialogOpen) {
      // Pre-fill items
      const prefilledItems = pendingPOItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitCost,
      }))
      // Set vendor from first item if available
      const firstItem = pendingPOItems[0]
      setSelectedVendorId(firstItem.vendorId || '')
      setSelectedVendorName(firstItem.vendorName || '')
      setExpectedDate('')
      setPoNotes('Auto-generated from low stock alerts')
      setNewItems(prefilledItems)
      setProductSearch('')
      setNewDialogOpen(true)
      // Clear pending items
      setPendingPOItems(null)
    }
  }, [pendingPOItems])

  // ── Fetch vendors for new PO dialog ──
  useEffect(() => {
    if (!newDialogOpen) return
    fetch('/api/vendors', { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setVendors(data) })
      .catch(() => {})
  }, [newDialogOpen])

  // ── Fetch products for search ──
  const fetchProducts = useCallback((query: string) => {
    const params = new URLSearchParams({ limit: '50', ...(query ? { search: query } : {}) })
    fetch(`/api/products?${params}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data)
        else if (data.products) setProducts(data.products)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (newDialogOpen) fetchProducts('')
  }, [newDialogOpen, fetchProducts])

  // ── Fetch PO detail ──
  const openDetail = async (order: PurchaseOrder) => {
    setDetailOrder(order)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}`, { headers: authHeaders() })
      const data = await res.json()
      if (res.ok) setDetailOrder(data.order)
    } catch {} finally {
      setDetailLoading(false)
    }
  }

  // ── New PO handlers ──
  const openNewDialog = () => {
    setSelectedVendorId('')
    setSelectedVendorName('')
    setExpectedDate('')
    setPoNotes('')
    setNewItems([{ productId: '', productName: '', quantity: 1, unitCost: 0 }])
    setProductSearch('')
    setNewDialogOpen(true)
  }

  const addItemRow = () => {
    setNewItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitCost: 0 }])
  }

  const removeItemRow = (index: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== index))
  }

  const updateItemRow = (index: number, field: keyof NewItemForm, value: string | number) => {
    setNewItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const selectProduct = (index: number, product: Product) => {
    updateItemRow(index, 'productId', product.id)
    updateItemRow(index, 'productName', product.name)
    updateItemRow(index, 'unitCost', product.costPrice || 0)
    setProductSearch('')
    setProductDropdownOpen(false)
    setAddItemIndex(null)
  }

  const newOrderTotal = newItems.reduce((s, i) => s + (i.quantity * i.unitCost), 0)

  const handleVendorChange = (vendorId: string) => {
    setSelectedVendorId(vendorId)
    const v = vendors.find((v) => v.id === vendorId)
    setSelectedVendorName(v?.name || '')
  }

  const submitNewPO = async () => {
    if (!selectedVendorName.trim()) {
      addToast({ title: 'Vendor Required', description: 'Please select or enter a vendor name', variant: 'destructive' })
      return
    }
    const validItems = newItems.filter((i) => i.productId && i.quantity > 0)
    if (validItems.length === 0) {
      addToast({ title: 'No Valid Items', description: 'Add at least one product with a quantity', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          vendorId: selectedVendorId || null,
          vendorName: selectedVendorName,
          expectedDate: expectedDate || null,
          notes: poNotes || null,
          items: validItems,
        }),
      })
      if (res.ok) {
        addToast({ title: 'PO Created', description: `Purchase order with ${validItems.length} item(s) created`, variant: 'success' })
        setNewDialogOpen(false)
        fetchOrders()
      } else if (res.status === 401) {
        addToast({ title: 'Session Expired', description: 'Please log in again', variant: 'destructive' })
      } else {
        const err = await res.json().catch(() => ({}))
        console.error('PO create failed:', res.status, err)
        addToast({ title: 'Failed to Create PO', description: err.detail || err.error || `Error ${res.status}`, variant: 'destructive' })
      }
    } catch (err) {
      addToast({ title: 'Error', description: 'Network error creating purchase order', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Send to Vendor ──
  const handleSendToVendor = async (order: PurchaseOrder) => {
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'SENT' }),
      })
      if (res.ok) {
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {}
  }

  // ── Delete PO ──
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/purchase-orders/${deleteTarget.id}`, {
        method: 'DELETE', headers: authHeaders(),
      })
      if (res.ok) {
        setDeleteTarget(null)
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {} finally {
      setDeleting(false)
    }
  }

  // ── Cancel PO ──
  const handleCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/purchase-orders/${cancelTarget.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'CANCELLED' }),
      })
      if (res.ok) {
        setCancelTarget(null)
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {} finally {
      setCancelling(false)
    }
  }

  // ── Receive stock ──
  const openReceiveDialog = (order: PurchaseOrder) => {
    if (!order.items) return
    const forms: ReceiveItemForm[] = order.items.map((item) => ({
      orderItemId: item.id,
      productName: item.productName,
      orderedQty: item.quantity,
      alreadyReceived: item.receivedQty,
      quantityReceived: item.quantity - item.receivedQty,
      batchNumber: '',
      expiryDate: '',
      costPrice: item.unitCost,
    }))
    setReceiveItems(forms)
    setReceiveDialogOpen(true)
  }

  const updateReceiveItem = (index: number, field: keyof ReceiveItemForm, value: string | number) => {
    setReceiveItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const submitReceive = async () => {
    if (!detailOrder) return
    const validItems = receiveItems.filter((i) => i.quantityReceived > 0)
    if (validItems.length === 0) return

    setReceiving(true)
    try {
      const res = await fetch(`/api/purchase-orders/${detailOrder.id}/receive`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          items: validItems.map((i) => ({
            orderItemId: i.orderItemId,
            quantityReceived: Number(i.quantityReceived),
            batchNumber: i.batchNumber || undefined,
            expiryDate: i.expiryDate || undefined,
            costPrice: i.costPrice || undefined,
          })),
        }),
      })
      if (res.ok) {
        setReceiveDialogOpen(false)
        setDetailOrder(null)
        fetchOrders()
      }
    } catch {} finally {
      setReceiving(false)
    }
  }

  // Filtered products for dropdown
  const filteredProducts = productSearch
    ? products.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.ndc && p.ndc.includes(productSearch))
      )
    : products

  // ── Render ──
  return (
    <div className="space-y-4">
      <PageHeader
        icon={ShoppingCart}
        title="Purchase Orders"
        description="Manage purchase orders and stock receiving"
        action={
          <Button onClick={openNewDialog} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Purchase Order
          </Button>
        }
      />

      {/* Search + Status Tabs */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by vendor, PO ID, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === 'ALL'
              ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
              : statusCounts[tab.value] || 0
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                  ${activeTab === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === tab.value ? 'bg-primary-foreground/20' : 'bg-muted-foreground/10'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* PO List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchase orders found"
          description={search || activeTab !== 'ALL' ? 'Try adjusting your search or filters.' : 'Create your first purchase order to get started.'}
          action={!search && activeTab === 'ALL' ? { label: 'New Purchase Order', onClick: openNewDialog } : undefined}
        />
      ) : (
        <>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">PO ID</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[60px] text-center">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[110px]">Expected</TableHead>
                  <TableHead className="w-[150px]">Created</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(order)}>
                    <TableCell className="font-mono text-xs">{truncId(order.id)}</TableCell>
                    <TableCell className="font-medium">{order.vendorName}</TableCell>
                    <TableCell>{statusBadge(order.status)}</TableCell>
                    <TableCell className="text-center">{order._count?.items ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(order.totalAmount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.expectedDate ? formatDate(order.expectedDate) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); openDetail(order) }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) setDetailOrder(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Purchase Order
              {detailOrder && <span className="text-muted-foreground font-mono text-sm">{truncId(detailOrder.id)}</span>}
            </DialogTitle>
            <DialogDescription>View and manage purchase order details</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex-1 space-y-3 p-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detailOrder ? (
            <div className="flex-1 overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="px-1 pb-4 space-y-4">
                  {/* PO Info */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Vendor</span>
                      <p className="font-medium">{detailOrder.vendorName}</p>
                      {detailOrder.vendor?.phone && <p className="text-xs text-muted-foreground">{detailOrder.vendor.phone}</p>}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <div className="mt-0.5">{statusBadge(detailOrder.status)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expected Date</span>
                      <p className="font-medium">{detailOrder.expectedDate ? formatDate(detailOrder.expectedDate) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <p className="font-medium">{formatDateTime(detailOrder.createdAt)}</p>
                    </div>
                    {detailOrder.notes && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Notes</span>
                        <p className="mt-0.5 text-sm">{detailOrder.notes}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* Items Table */}
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Line Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailOrder.items?.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-sm">{item.productName}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">
                              <span className={item.receivedQty >= item.quantity ? 'text-emerald-600 dark:text-emerald-400 font-medium' : item.receivedQty > 0 ? 'text-amber-600 dark:text-amber-400' : ''}>
                                {item.receivedQty}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.quantity * item.unitCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-between items-center text-sm px-1">
                    <div>
                      <span className="text-muted-foreground">Received Amount: </span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(detailOrder.receivedAmount)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Order Total: </span>
                      <span className="font-bold text-lg">{formatCurrency(detailOrder.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {detailOrder.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => handleSendToVendor(detailOrder)}>
                        <Send className="h-4 w-4 mr-1" /> Send to Vendor
                      </Button>
                    )}
                    {detailOrder.status !== 'CANCELLED' && (
                      <Button size="sm" variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700" onClick={() => openReceiveDialog(detailOrder)}>
                        <PackageCheck className="h-4 w-4 mr-1" /> {detailOrder.status === 'RECEIVED' ? 'Add to Inventory' : 'Receive Stock'}
                      </Button>
                    )}
                    {(detailOrder.status !== 'CANCELLED') && (
                      <Button size="sm" variant="destructive" onClick={() => setCancelTarget(detailOrder)}>
                        <XCircle className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-red-600 dark:text-red-400" onClick={() => setDeleteTarget(detailOrder)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── New PO Dialog ── */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Purchase Order
            </DialogTitle>
            <DialogDescription>Create a new purchase order for your vendor</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full">
              <div className="space-y-4 pb-4">
                {/* Vendor + Date row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select value={selectedVendorId} onValueChange={handleVendorChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a vendor..." />
                      </SelectTrigger>
                      <SelectContent>
                        {vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Or type vendor name directly"
                      value={selectedVendorId ? selectedVendorName : selectedVendorName}
                      onChange={(e) => {
                        if (!selectedVendorId) setSelectedVendorName(e.target.value)
                      }}
                      disabled={!!selectedVendorId}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Delivery Date</Label>
                    <Input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Add any notes for this purchase order..."
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                <Separator />

                {/* Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Items</Label>
                    <Button variant="outline" size="sm" onClick={addItemRow}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                    </Button>
                  </div>

                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[200px]">Product</TableHead>
                          <TableHead className="w-[80px] text-right">Qty</TableHead>
                          <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Line Total</TableHead>
                          <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {newItems.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="relative">
                                {item.productId ? (
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-medium truncate">{item.productName}</span>
                                    <button
                                      className="text-muted-foreground hover:text-foreground shrink-0"
                                      onClick={() => updateItemRow(index, 'productId', '')}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <Input
                                      placeholder="Search product..."
                                                              value={addItemIndex === index ? productSearch : ''}
                                                              onFocus={() => { setProductDropdownOpen(true); setAddItemIndex(index); setProductSearch('') }}
                                                              onChange={(e) => { setProductSearch(e.target.value); setAddItemIndex(index); setProductDropdownOpen(true) }}
                                                              className="h-8 text-sm"
                                                            />
                                    {productDropdownOpen && addItemIndex === index && (
                                                              <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
                                                                {filteredProducts.length === 0 ? (
                                                                  <p className="text-sm text-muted-foreground p-2">No products found</p>
                                                                ) : (
                                                                  filteredProducts.slice(0, 20).map((p) => (
                                                                    <button
                                                                      key={p.id}
                                                                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                                                                      onClick={() => selectProduct(index, p)}
                                                                    >
                                                                      <span className="font-medium">{p.name}</span>
                                                                      {p.strength && <span className="text-muted-foreground ml-1">{p.strength}</span>}
                                                                      {p.dosageForm && <span className="text-muted-foreground ml-1">({p.dosageForm})</span>}
                                                                      {p.costPrice != null && <span className="text-xs text-muted-foreground ml-2">Cost: {formatCurrency(p.costPrice)}</span>}
                                                                    </button>
                                                                  ))
                                                                )}
                                                              </div>
                                                            )}
                                                          </>
                                                        )}
                                                      </div>
                                                    </TableCell>
                                                    <TableCell>
                                                      <Input
                                                        type="number"
                                                        min={1}
                                                        value={item.quantity}
                                                        onChange={(e) => updateItemRow(index, 'quantity', Math.max(1, Number(e.target.value)))}
                                                        className="h-8 text-right text-sm"
                                                      />
                                                    </TableCell>
                                                    <TableCell>
                                                      <Input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={item.unitCost}
                                                        onChange={(e) => updateItemRow(index, 'unitCost', Math.max(0, Number(e.target.value)))}
                                                        className="h-8 text-right text-sm"
                                                      />
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium text-sm">
                                                      {formatCurrency(item.quantity * item.unitCost)}
                                                    </TableCell>
                                                    <TableCell>
                                                      {newItems.length > 1 && (
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500" onClick={() => removeItemRow(index)}>
                                                          <Minus className="h-3.5 w-3.5" />
                                                        </Button>
                                                      )}
                                                    </TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                          </div>

                                          {/* Order Total */}
                                          <div className="flex justify-end items-center gap-2 text-sm">
                                            <span className="text-muted-foreground">Order Total:</span>
                                            <span className="text-lg font-bold">{formatCurrency(newOrderTotal)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </ScrollArea>
                                  </div>

                                  {/* Dialog Footer */}
                                  <div className="flex justify-end gap-2 pt-2 border-t">
                                    <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
                                    <Button
                                      onClick={submitNewPO}
                                      disabled={submitting || !selectedVendorName.trim() || newItems.filter((i) => i.productId && i.quantity > 0 && i.unitCost > 0).length === 0}
                                    >
                                      {submitting ? 'Creating...' : 'Create Purchase Order'}
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>

      {/* ── Receive Stock Dialog ── */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5" /> Receive Stock
            </DialogTitle>
            <DialogDescription>Enter quantities received for each item</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <ScrollArea className="h-full">
              <div className="space-y-3 pb-4">
                {receiveItems.map((item, index) => (
                  <Card key={item.orderItemId} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium text-sm">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">
                          Ordered: {item.orderedQty} · Already received: {item.alreadyReceived} · Remaining: {item.orderedQty - item.alreadyReceived}
                        </p>
                      </div>
                      {item.quantityReceived > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Receiving {item.quantityReceived}</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Qty Received *</Label>
                        <Input
                          type="number"
                          min={0}
                          max={item.orderedQty - item.alreadyReceived}
                          value={item.quantityReceived}
                          onChange={(e) => updateReceiveItem(index, 'quantityReceived', Math.min(item.orderedQty - item.alreadyReceived, Math.max(0, Number(e.target.value))))}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Batch Number</Label>
                        <Input
                          placeholder="Optional"
                          value={item.batchNumber}
                          onChange={(e) => updateReceiveItem(index, 'batchNumber', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Expiry Date</Label>
                        <Input
                          type="date"
                          value={item.expiryDate}
                          onChange={(e) => updateReceiveItem(index, 'expiryDate', e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cost Price</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.costPrice}
                          onChange={(e) => updateReceiveItem(index, 'costPrice', Math.max(0, Number(e.target.value)))}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitReceive}
              disabled={receiving || receiveItems.filter((i) => i.quantityReceived > 0).length === 0}
            >
              {receiving ? 'Receiving...' : 'Receive Stock'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the purchase order for <strong>{deleteTarget?.vendorName}</strong> and all its items. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancel Confirmation ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the purchase order for <strong>{cancelTarget?.vendorName}</strong>. Cancelled orders cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep Order</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-red-600 hover:bg-red-700">
              {cancelling ? 'Cancelling...' : 'Cancel Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
