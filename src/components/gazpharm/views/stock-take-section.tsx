'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ClipboardCheck, Play, Save, AlertTriangle, Eye, ArrowLeft, RefreshCw,
  Search, CheckCircle2, XCircle, Clock, Plus, Trash2, FileText,
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
import { PageHeader } from '@/components/gazpharm/shared/page-header'
import { EmptyState } from '@/components/gazpharm/shared/empty-state'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { formatDateTime } from '@/lib/format-date'

interface StockTakeItem {
  id: string
  stockTakeId: string
  productId: string
  systemQty: number
  countedQty: number | null
  variance: number | null
  notes: string | null
  product: { id: string; name: string; ndc: string | null; category: string; unitOfMeasure: string } | null
}

interface StockTake {
  id: string
  reference: string
  status: string
  notes: string | null
  countedBy: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  countedByUser: { name: string; email: string } | null
  items: StockTakeItem[]
}

interface ProductInventory {
  id: string
  productId: string
  quantity: number
  product: { id: string; name: string; ndc: string | null; category: string; unitOfMeasure: string }
}

export function StockTakeSection() {
  const [stockTakes, setStockTakes] = useState<StockTake[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'detail' | 'new'>('list')
  const [selectedTake, setSelectedTake] = useState<StockTake | null>(null)
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [inventory, setInventory] = useState<ProductInventory[]>([])
  const [countedItems, setCountedItems] = useState<Record<string, number>>({})
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StockTake | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [inventorySearch, setInventorySearch] = useState('')
  const addToast = useAppStore((s) => s.addToast)
  const bumpInventoryVersion = useAppStore((s) => s.bumpInventoryVersion)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setStockTakeReportId = useAppStore((s) => s.setStockTakeReportId)

  const fetchStockTakes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/stock-take', { headers: authHeaders() })
      if (res.ok) {
        setStockTakes(await res.json())
      } else {
        const err = await res.json().catch(() => ({ error: 'Network error' }))
        addToast({ title: 'Error', description: err.error || err.detail || 'Failed to fetch stock takes', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to fetch stock takes:', err)
      addToast({ title: 'Error', description: 'Network error fetching stock takes', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchStockTakes() }, [fetchStockTakes])

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory', { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        setInventory(Array.isArray(json) ? json : json.items || [])
      }
    } catch (err) {
      console.error('Failed to fetch inventory:', err)
    }
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/stock-take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ notes: newNotes || null }),
      })
      if (res.ok) {
        const created = await res.json()
        setNewNotes('')
        setView('list')
        fetchStockTakes()
        // Navigate to the new stock take detail
        setTimeout(() => handleViewDetail(created.id), 500)
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to create stock take' }))
        addToast({ title: 'Error', description: err.error || err.details || 'Failed to create stock take', variant: 'destructive' })
        console.error('[StockTake Create] failed:', err)
      }
    } catch (err) {
      console.error('Failed to create stock take:', err)
      addToast({ title: 'Error', description: 'Failed to create stock take', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const handleViewDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/stock-take/${id}`, { headers: authHeaders() })
      if (res.ok) {
        const detail = await res.json()
        setSelectedTake(detail)
        setView('detail')
        // Initialize counted items from existing data
        const counts: Record<string, number> = {}
        const expiries: Record<string, string> = {}
        if (detail.items) {
          for (const item of detail.items) {
            if (item.countedQty !== null) counts[item.productId] = item.countedQty
            if (item.notes && item.notes.match(/^\d{4}-\d{2}-\d{2}$/)) expiries[item.productId] = item.notes
          }
        }
        setCountedItems(counts)
        setExpiryDates(expiries)
      } else {
        addToast({ title: 'Error', description: 'Failed to load stock take details', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to fetch stock take detail:', err)
      addToast({ title: 'Error', description: 'Network error loading stock take', variant: 'destructive' })
    }
  }

  const handleStartCounting = async () => {
    if (!selectedTake) return
    await fetchInventory()
  }

  const handleCountedChange = (productId: string, value: string) => {
    const qty = parseInt(value, 10)
    if (!isNaN(qty) && qty >= 0) {
      setCountedItems((prev) => ({ ...prev, [productId]: qty }))
    }
  }

  const handleExpiryChange = (productId: string, value: string) => {
    setExpiryDates((prev) => ({ ...prev, [productId]: value }))
  }

  const handleSaveCounts = async () => {
    if (!selectedTake) return
    setSaving(true)
    try {
      const items = inventory.map((inv) => ({
        productId: inv.productId,
        systemQty: inv.quantity,
        countedQty: countedItems[inv.productId] ?? null,
        expiryDate: expiryDates[inv.productId] || null,
      }))

      await fetch(`/api/stock-take/${selectedTake.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'update-item', items }),
      })

      // Refresh detail
      await handleViewDetail(selectedTake.id)
    } catch (err) {
      console.error('Failed to save counts:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleComplete = async () => {
    if (!selectedTake) return
    setSaving(true)
    try {
      const res = await fetch(`/api/stock-take/${selectedTake.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'complete' }),
      })
      if (res.ok) {
        const data = await res.json()
        const meta = data._meta
        addToast({
          title: 'Stock Take Completed',
          description: meta
            ? `Inventory updated for ${meta.inventoryUpdated} of ${meta.totalItems} items.`
            : 'System quantities updated.',
          variant: 'success',
        })
        // Bump global inventory version so all views (POS, dashboard, inventory, etc.) refresh
        bumpInventoryVersion()

        // Navigate to full-page report
        if (data._report?.stockTakeId || selectedTake?.id) {
          const reportId = data._report?.stockTakeId || selectedTake.id
          setStockTakeReportId(reportId)
          setCurrentView('stock-take-report')
        }
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to complete' }))
        addToast({ title: 'Error', description: err.error || 'Failed to complete stock take', variant: 'destructive' })
      }
      setView('list')
      fetchStockTakes()
    } catch (err) {
      console.error('Failed to complete stock take:', err)
      addToast({ title: 'Error', description: 'Failed to complete stock take', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    if (!selectedTake) return
    try {
      await fetch(`/api/stock-take/${selectedTake.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'cancel' }),
      })
      setView('list')
      fetchStockTakes()
    } catch (err) {
      console.error('Failed to cancel stock take:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/stock-take/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (res.ok) {
        addToast({ title: 'Deleted', description: `${deleteTarget.reference} has been deleted`, variant: 'success' })
        setDeleteTarget(null)
        fetchStockTakes()
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to delete' }))
        addToast({ title: 'Error', description: err.error || 'Failed to delete stock take', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to delete stock take', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const handleViewReport = (stockTakeId: string) => {
    setStockTakeReportId(stockTakeId)
    setCurrentView('stock-take-report')
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-gray-100 text-gray-700',
      IN_PROGRESS: 'bg-blue-100 text-blue-700',
      COMPLETED: 'bg-emerald-100 text-emerald-700',
      CANCELLED: 'bg-red-100 text-red-700',
    }
    return styles[status] || 'bg-gray-100 text-gray-700'
  }

  // Filter inventory by search query (memoized to avoid recomputing on every state change)
  const filteredInventory = useMemo(() => {
    if (!inventorySearch.trim()) return inventory
    const q = inventorySearch.toLowerCase()
    return inventory.filter((inv) => (
      (inv.product?.name || '').toLowerCase().includes(q) ||
      (inv.product?.ndc || '').toLowerCase().includes(q) ||
      (inv.product?.category || '').toLowerCase().includes(q)
    ))
  }, [inventory, inventorySearch])

  // ── New Stock Take Form ──
  if (view === 'new') {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <CardTitle className="text-sm">New Stock Take</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="e.g. Monthly stock check for July..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1.5" />
              {creating ? 'Creating...' : 'Create Stock Take'}
            </Button>
            <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── Detail View ──
  if (view === 'detail' && selectedTake) {
    const itemCount = selectedTake.items?.length || 0
    const variances = (selectedTake.items || []).filter((i) => i.variance !== null && i.variance !== 0)

    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setView('list'); setSelectedTake(null) }}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div>
                <CardTitle className="text-sm">{selectedTake.reference}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Created {formatDateTime(selectedTake.createdAt)}
                  {selectedTake.countedByUser && ` · By ${selectedTake.countedByUser.name}`}
                </p>
              </div>
            </div>
            <Badge className={statusBadge(selectedTake.status)}>
              {(selectedTake.status || '').replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 stagger-children">
            <Card className="card-hover">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold">{itemCount}</p>
                <p className="text-[11px] text-muted-foreground">Products</p>
              </CardContent>
            </Card>
            <Card className="card-hover">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{variances.length}</p>
                <p className="text-[11px] text-muted-foreground">Variances</p>
              </CardContent>
            </Card>
            <Card className="card-hover">
              <CardContent className="p-3 text-center">
                <p className="text-lg font-bold">{Object.keys(countedItems).length}</p>
                <p className="text-[11px] text-muted-foreground">Counted</p>
              </CardContent>
            </Card>
          </div>

          {/* Show items if completed or has saved items */}
          {selectedTake.status === 'COMPLETED' && selectedTake.items && selectedTake.items.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table className="table-header-standard">
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="text-xs">Product</TableHead>
                    <TableHead className="text-xs text-right">System</TableHead>
                    <TableHead className="text-xs text-right">Counted</TableHead>
                    <TableHead className="text-xs text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedTake.items.map((item) => (
                    <TableRow key={item.id} className={item.variance && item.variance !== 0 ? 'bg-amber-50/50' : ''}>
                      <TableCell className="text-sm">{item.product?.name || item.productId}</TableCell>
                      <TableCell className="text-right text-sm">{item.systemQty}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{item.countedQty ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm">
                        {item.variance !== null ? (
                          <span className={item.variance > 0 ? 'text-emerald-600' : item.variance < 0 ? 'text-red-600' : 'text-gray-600'}>
                            {item.variance > 0 ? '+' : ''}{item.variance}
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : selectedTake.status === 'IN_PROGRESS' ? (
            <>
              {/* Counting interface */}
              {inventory.length > 0 ? (
                <>
                  {/* Search filter bar */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search product by name, NDC, or category..."
                        className="pl-9 h-9"
                        value={inventorySearch}
                        onChange={(e) => setInventorySearch(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {filteredInventory.length} of {inventory.length} products
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Enter physical counts for each product:</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleSaveCounts} disabled={saving}>
                        <Save className="h-3.5 w-3.5 mr-1" /> Save Counts
                      </Button>
                      <Button size="sm" onClick={handleComplete} disabled={saving}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Complete
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    <Table className="table-header-standard">
                      <TableHeader className="sticky top-0">
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs">Product</TableHead>
                          <TableHead className="text-xs">Expiry Date</TableHead>
                          <TableHead className="text-xs text-right">System Qty</TableHead>
                          <TableHead className="text-xs">Physical Count</TableHead>
                          <TableHead className="text-xs text-right">Variance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="p-0">
                              <EmptyState icon={Search} title="No products found" description="No products match your search" />
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredInventory.map((inv) => {
                            const counted = countedItems[inv.productId] ?? ''
                            const countedNum = typeof counted === 'number' ? counted : (counted !== '' ? parseInt(String(counted), 10) : null)
                            const variance = countedNum !== null && !isNaN(countedNum) ? countedNum - inv.quantity : null
                            return (
                              <TableRow key={inv.productId}>
                                <TableCell className="text-sm">{inv.product.name}</TableCell>
                                <TableCell>
                                  <input
                                    type="date"
                                    value={expiryDates[inv.productId] || ''}
                                    onChange={(e) => handleExpiryChange(inv.productId, e.target.value)}
                                    className="h-8 w-[130px] text-xs border rounded-md px-2 bg-white dark:bg-gray-900"
                                  />
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">{inv.quantity}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={counted}
                                    onChange={(e) => handleCountedChange(inv.productId, e.target.value)}
                                    placeholder="—"
                                    className="h-8 w-24"
                                  />
                                </TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {variance !== null ? (
                                    <span className={variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-red-600' : 'text-gray-500'}>
                                      {variance > 0 ? '+' : ''}{variance}
                                    </span>
                                  ) : '—'}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={Play}
                  title="Ready to count inventory"
                  description="Load current inventory to begin counting"
                  action={{ label: 'Load Inventory', onClick: handleStartCounting }}
                />
              )}
            </>
          ) : null}

          {/* Actions */}
          {selectedTake.status === 'IN_PROGRESS' && (
            <div className="flex gap-3 pt-2 border-t">
              <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={handleCancel}>
                <XCircle className="h-4 w-4 mr-1.5" /> Cancel Stock Take
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ── List View ──
  return (
    <div className="animate-fade-in">
      <PageHeader
        icon={ClipboardCheck}
        title="Periodic Stock Taking"
        description="Conduct regular stock counts and variance analysis"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStockTakes} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setView('new')} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New Stock Take
            </Button>
          </div>
        }
      />
    <Card>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : stockTakes.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No stock takes yet"
            description="Create a new stock take to begin counting inventory"
            action={{ label: 'New Stock Take', onClick: () => setView('new') }}
          />
        ) : (
          <div className="space-y-3">
            {stockTakes.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-emerald-50/30 cursor-pointer transition-colors"
                onClick={() => handleViewDetail(st.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{st.reference}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(st.createdAt)}
                      {st.countedByUser && ` · ${st.countedByUser.name}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {st.items?.length || 0} items
                  </span>
                  <Badge className={statusBadge(st.status)} variant="secondary">
                    {(st.status || '').replace(/_/g, ' ')}
                  </Badge>
                  {st.status === 'COMPLETED' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-blue-600 hover:bg-blue-50"
                      onClick={(e) => { e.stopPropagation(); handleViewReport(st.id) }}
                      title="View Stock Take Report"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(st) }}
                    title="Delete stock take"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Stock Take
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.reference}</strong>? This will permanently remove the stock take record and all its counted items. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    </div>
  )
}
