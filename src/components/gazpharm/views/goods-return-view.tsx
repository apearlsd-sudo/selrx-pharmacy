'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  RotateCcw, Search, AlertTriangle, CheckCircle2, XCircle,
  Clock, Package, DollarSign, ChevronLeft, ChevronRight,
  Printer, Eye, Trash2, Check, Ban, ArrowRightLeft,
  Filter,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/currency'
import { useAppStore } from '@/store/app-store'
import { ReturnTicketModal } from './return-ticket-modal'

const RETURN_REASONS = [
  { value: 'DEFECTIVE', label: 'Defective Product' },
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'WRONG_ITEM', label: 'Wrong Item Supplied' },
  { value: 'WRONG_QUANTITY', label: 'Wrong Quantity' },
  { value: 'DAMAGED', label: 'Damaged Product' },
  { value: 'CUSTOMER_CHANGE_OF_MIND', label: 'Change of Mind' },
  { value: 'RECALLED', label: 'Product Recalled' },
  { value: 'OTHER', label: 'Other' },
]

const REFUND_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CREDIT_CARD', label: 'Credit Card' },
  { value: 'DEBIT_CARD', label: 'Debit Card' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'FSA_HSA', label: 'FSA/HSA' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  PENDING_APPROVAL: { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: Ban },
}

function statusBadge(status: string) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock }
  const Icon = config.icon
  return (
    <Badge className={`text-xs border gap-1 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  )
}

function formatLocalDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function GoodsReturnView() {
  const [activeTab, setActiveTab] = useState('new-return')
  const [returns, setReturns] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })

  // Search transaction for return
  const [txnSearch, setTxnSearch] = useState('')
  const [txnResults, setTxnResults] = useState<any[]>([])
  const [txnSearching, setTxnSearching] = useState(false)
  const [selectedTxn, setSelectedTxn] = useState<any>(null)

  // Return form
  const [selectedItemIdx, setSelectedItemIdx] = useState<number | null>(null)
  const [returnQty, setReturnQty] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returnReasonNote, setReturnReasonNote] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [returnNotes, setReturnNotes] = useState('')

  // Detail / ticket modals
  const [detailReturn, setDetailReturn] = useState<any>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [ticketReturn, setTicketReturn] = useState<any>(null)
  const [ticketOpen, setTicketOpen] = useState(false)

  // Approve/reject dialog
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: string; returnData: any }>({ open: false, action: '', returnData: null })

  const addToast = useAppStore((s) => s.addToast)
  const user = useAppStore((s) => s.user)

  // Fetch returns list
  const fetchReturns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus)
      params.set('page', currentPage.toString())
      params.set('limit', '15')

      const [res, statsRes] = await Promise.all([
        fetch(`/api/returns?${params.toString()}`),
        fetch('/api/returns?action=stats'),
      ])

      if (res.ok) {
        const data = await res.json()
        setReturns(Array.isArray(data.returns) ? data.returns : [])
        setPagination(data.pagination || { page: 1, pages: 1, total: 0 })
      }
      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to load returns', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [filterStatus, currentPage, addToast])

  useEffect(() => { fetchReturns() }, [fetchReturns])
  useEffect(() => { setCurrentPage(1) }, [filterStatus])

  // Search transactions
  const searchTransactions = useCallback(async (query: string) => {
    if (query.length < 2) { setTxnResults([]); return }
    setTxnSearching(true)
    try {
      const res = await fetch(`/api/transactions?search=${encodeURIComponent(query)}&limit=10`)
      if (res.ok) {
        const data = await res.json()
        setTxnResults(Array.isArray(data) ? data : data.transactions || [])
      }
    } catch {
      // silent
    } finally {
      setTxnSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => searchTransactions(txnSearch), 300)
    return () => clearTimeout(timer)
  }, [txnSearch, searchTransactions])

  // Submit new return
  const handleSubmitReturn = async () => {
    if (!selectedTxn || selectedItemIdx === null || !returnQty || !returnReason) {
      addToast({ title: 'Validation Error', description: 'Please fill all required fields', variant: 'destructive' })
      return
    }

    const item = selectedTxn.items[selectedItemIdx]
    const qty = parseInt(returnQty)
    if (qty <= 0 || qty > item.quantity) {
      addToast({ title: 'Invalid Quantity', description: `Quantity must be between 1 and ${item.quantity}`, variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || 'demo-user' },
        body: JSON.stringify({
          transactionId: selectedTxn.id,
          transactionItemId: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: qty,
          unitPrice: item.unitPrice,
          refundAmount: item.unitPrice * qty,
          reason: returnReason,
          reasonNote: returnReasonNote || null,
          customerId: selectedTxn.customerId || null,
          customerName: selectedTxn.customer ? `${selectedTxn.customer.firstName} ${selectedTxn.customer.lastName}` : null,
          refundMethod,
          notes: returnNotes || null,
        }),
      })

      if (res.ok) {
        const newReturn = await res.json()
        addToast({ title: 'Return Created', description: `Return ${newReturn.returnNo} created successfully`, variant: 'success' })
        // Reset form
        setSelectedTxn(null)
        setSelectedItemIdx(null)
        setReturnQty('')
        setReturnReason('')
        setReturnReasonNote('')
        setRefundMethod('CASH')
        setReturnNotes('')
        setTxnSearch('')
        setTxnResults([])
        // Show ticket
        setTicketReturn(newReturn)
        setTicketOpen(true)
        // Refresh
        fetchReturns()
      } else {
        const err = await res.json()
        addToast({ title: 'Error', description: err.error || 'Failed to create return', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // Process return action (approve/complete/reject/cancel)
  const processAction = async (action: string) => {
    if (!actionDialog.returnData) return
    try {
      const res = await fetch(`/api/returns/${actionDialog.returnData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || 'demo-user' },
        body: JSON.stringify({ action }),
      })

      if (res.ok) {
        const updated = await res.json()
        addToast({
          title: `${action.charAt(0).toUpperCase() + action.slice(1)}`,
          description: `Return ${updated.returnNo} ${action}d successfully`,
          variant: 'success',
        })
        fetchReturns()
      } else {
        const err = await res.json()
        addToast({ title: 'Error', description: err.error || 'Action failed', variant: 'destructive' })
      }
    } catch {
      addToast({ title: 'Error', description: 'Network error', variant: 'destructive' })
    } finally {
      setActionDialog({ open: false, action: '', returnData: null })
    }
  }

  const selectedItem = selectedItemIdx !== null ? selectedTxn?.items[selectedItemIdx] : null
  const refundTotal = selectedItem ? selectedItem.unitPrice * (parseInt(returnQty) || 0) : 0

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-emerald-600" />
            Goods Return
          </h2>
          <p className="text-sm text-muted-foreground">Process product returns, restock inventory, and generate return tickets</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <RotateCcw className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : stats?.today?.count || 0}</p>
              <p className="text-xs text-muted-foreground">Returns Today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{loading ? <Skeleton className="h-7 w-20" /> : formatCurrency(stats?.today?.refundAmount || 0)}</p>
              <p className="text-xs text-muted-foreground">Today&apos;s Refunds</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : stats?.pendingApproval || 0}</p>
              <p className="text-xs text-muted-foreground">Pending Approval</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : stats?.today?.itemsReturned || 0}</p>
              <p className="text-xs text-muted-foreground">Items Restocked</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="new-return">New Return</TabsTrigger>
          <TabsTrigger value="history">Return History</TabsTrigger>
        </TabsList>

        {/* New Return Tab */}
        <TabsContent value="new-return" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Search Transaction & Select Item */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Search className="h-4 w-4 text-emerald-600" />
                  Find Transaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by transaction #, customer name..."
                    className="pl-9"
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                  />
                </div>

                {/* Search results */}
                {txnSearching && <Skeleton className="h-8 w-full" />}
                {txnResults.length > 0 && !selectedTxn && (
                  <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
                    {txnResults.map((txn: any) => (
                      <button
                        key={txn.id}
                        className="w-full p-3 flex items-center justify-between hover:bg-emerald-50/50 transition-colors text-left"
                        onClick={() => {
                          setSelectedTxn(txn)
                          setTxnResults([])
                          setTxnSearch('')
                          setSelectedItemIdx(null)
                          setReturnQty('')
                          setReturnReason('')
                        }}
                      >
                        <div>
                          <p className="text-xs font-mono font-medium">{txn.transactionNo}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {txn.customer ? `${txn.customer.firstName} ${txn.customer.lastName}` : 'Walk-in'}
                            {' · '}{formatLocalDate(txn.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-emerald-700">{formatCurrency(txn.total)}</p>
                          <p className="text-[10px] text-muted-foreground">{txn.items?.length || 0} items</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Transaction Details */}
                {selectedTxn && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <div>
                        <p className="text-xs font-mono font-bold">{selectedTxn.transactionNo}</p>
                        <p className="text-[10px] text-emerald-700">
                          {selectedTxn.customer ? `${selectedTxn.customer.firstName} ${selectedTxn.customer.lastName}` : 'Walk-in'}
                          {' · '}{formatLocalDate(selectedTxn.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setSelectedTxn(null)
                          setSelectedItemIdx(null)
                          setReturnQty('')
                          setReturnReason('')
                        }}
                      >
                        <X className="h-3 w-3 mr-1" /> Change
                      </Button>
                    </div>

                    {/* Items list */}
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Select Item to Return</p>
                    <div className="divide-y border rounded-lg">
                      {(selectedTxn.items || []).map((item: any, idx: number) => (
                        <button
                          key={item.id}
                          className={`w-full p-3 flex items-center gap-3 transition-colors text-left ${
                            selectedItemIdx === idx ? 'bg-emerald-50 border-l-2 border-emerald-500' : 'hover:bg-gray-50'
                          }`}
                          onClick={() => {
                            setSelectedItemIdx(idx)
                            setReturnQty('1')
                          }}
                        >
                          <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{item.productName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatCurrency(item.unitPrice)} ea. · Qty: {item.quantity}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-medium">{formatCurrency(item.subtotal)}</p>
                            {selectedItemIdx === idx && (
                              <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-600 ml-auto" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Return Form */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-emerald-600" />
                  Return Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedItem ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Package className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">Select a transaction item to return</p>
                  </div>
                ) : (
                  <>
                    {/* Selected item summary */}
                    <div className="p-3 bg-gray-50 rounded-lg border space-y-1">
                      <p className="text-sm font-medium">{selectedItem.productName}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Unit Price: {formatCurrency(selectedItem.unitPrice)}</span>
                        <span>Purchased: {selectedItem.quantity}</span>
                      </div>
                    </div>

                    {/* Return Quantity */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Return Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        max={selectedItem.quantity}
                        value={returnQty}
                        onChange={(e) => setReturnQty(e.target.value)}
                        placeholder="1"
                      />
                      <p className="text-[10px] text-muted-foreground">Max: {selectedItem.quantity} units</p>
                    </div>

                    {/* Refund Preview */}
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between">
                      <span className="text-xs font-medium text-emerald-800">Refund Amount</span>
                      <span className="text-lg font-bold text-emerald-700">{formatCurrency(refundTotal)}</span>
                    </div>

                    {/* Reason */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Return Reason *</Label>
                      <Select value={returnReason} onValueChange={setReturnReason}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                          {RETURN_REASONS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Reason Note */}
                    {returnReason === 'OTHER' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Describe the Reason *</Label>
                        <Textarea
                          value={returnReasonNote}
                          onChange={(e) => setReturnReasonNote(e.target.value)}
                          placeholder="Provide details about the return reason..."
                          rows={2}
                        />
                      </div>
                    )}

                    {/* Refund Method */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Refund Method</Label>
                      <Select value={refundMethod} onValueChange={setRefundMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REFUND_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Additional Notes</Label>
                      <Textarea
                        value={returnNotes}
                        onChange={(e) => setReturnNotes(e.target.value)}
                        placeholder="Any additional notes..."
                        rows={2}
                      />
                    </div>

                    {/* Submit */}
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleSubmitReturn}
                      disabled={submitting || !returnQty || !returnReason || (returnReason === 'OTHER' && !returnReasonNote)}
                    >
                      {submitting ? (
                        <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Processing...</>
                      ) : (
                        <><RotateCcw className="h-4 w-4 mr-2" /> Submit Return Request</>
                      )}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Return History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Filter:</span>
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {pagination.total} return{pagination.total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Returns Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Refund</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed By</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 10 }).map((_, j) => (
                            <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : returns.length > 0 ? (
                      returns.map((r: any) => (
                        <TableRow key={r.id} className="hover:bg-gray-50/50">
                          <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                          <TableCell className="text-xs">{formatLocalDate(r.createdAt)}</TableCell>
                          <TableCell className="text-xs font-medium max-w-[140px] truncate">{r.productName}</TableCell>
                          <TableCell className="text-xs">{r.customerName || 'Walk-in'}</TableCell>
                          <TableCell className="text-right text-xs">{r.quantity}</TableCell>
                          <TableCell className="text-right text-xs font-semibold text-amber-600">{formatCurrency(r.refundAmount)}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline" className="text-[10px]">
                              {r.reason.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell className="text-xs">{r.user?.name || 'Staff'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="View Details & Ticket"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/returns/${r.id}`)
                                    if (res.ok) {
                                      setDetailReturn(await res.json())
                                      setDetailOpen(true)
                                    }
                                  } catch { /* silent */ }
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {r.status === 'PENDING_APPROVAL' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                    title="Approve"
                                    onClick={() => setActionDialog({ open: true, action: 'approve', returnData: r })}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-red-500 hover:text-red-600"
                                    title="Reject"
                                    onClick={() => setActionDialog({ open: true, action: 'reject', returnData: r })}
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {r.status === 'APPROVED' && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                    title="Complete (Restock + Refund)"
                                    onClick={() => setActionDialog({ open: true, action: 'complete', returnData: r })}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">
                          No returns found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.pages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pagination.page <= 1}
                      onClick={() => setCurrentPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pagination.page >= pagination.pages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Return Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-emerald-600" />
              Return Details
            </DialogTitle>
          </DialogHeader>
          {detailReturn && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs font-bold">{detailReturn.returnNo}</p>
                  <p className="text-[10px] text-muted-foreground">{formatLocalDate(detailReturn.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(detailReturn.status)}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setTicketReturn(detailReturn); setDetailOpen(false); setTicketOpen(true) }}
                  >
                    <Printer className="h-3 w-3 mr-1" /> Ticket
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Product</p>
                  <p className="text-xs font-medium">{detailReturn.productName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Quantity</p>
                  <p className="text-xs">{detailReturn.quantity}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Refund Amount</p>
                  <p className="text-xs font-bold text-amber-600">{formatCurrency(detailReturn.refundAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Refund Method</p>
                  <p className="text-xs">{(detailReturn.refundMethod || 'CASH').replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Reason</p>
                  <p className="text-xs">{detailReturn.reason.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Restocked</p>
                  <p className="text-xs">{detailReturn.restocked ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Original Txn</p>
                  <p className="text-xs font-mono">{detailReturn.transaction?.transactionNo || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Customer</p>
                  <p className="text-xs">{detailReturn.customerName || 'Walk-in'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Processed By</p>
                  <p className="text-xs">{detailReturn.user?.name || 'Staff'}</p>
                </div>
                {detailReturn.approvedBy && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Approved By</p>
                    <p className="text-xs">{detailReturn.approvedBy.name}</p>
                  </div>
                )}
              </div>

              {(detailReturn.reasonNote || detailReturn.notes) && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  {detailReturn.reasonNote && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Reason Note</p>
                      <p className="text-xs">{detailReturn.reasonNote}</p>
                    </div>
                  )}
                  {detailReturn.notes && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Notes</p>
                      <p className="text-xs">{detailReturn.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {actionDialog.action === 'approve' && 'Approve Return'}
              {actionDialog.action === 'complete' && 'Complete Return (Restock + Refund)'}
              {actionDialog.action === 'reject' && 'Reject Return'}
              {actionDialog.action === 'cancel' && 'Cancel Return'}
            </DialogTitle>
          </DialogHeader>
          {actionDialog.returnData && (
            <div className="space-y-3">
              <div className={`p-3 rounded-lg border text-sm flex items-start gap-3 ${
                actionDialog.action === 'approve' ? 'bg-blue-50 border-blue-200' :
                actionDialog.action === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                'bg-red-50 border-red-200'
              }`}>
                {actionDialog.action === 'complete' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : actionDialog.action === 'approve' ? (
                  <Check className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-sm">
                    {actionDialog.action === 'approve' && 'Are you sure you want to approve this return?'}
                    {actionDialog.action === 'complete' && `This will restock ${actionDialog.returnData.quantity} unit(s) of "${actionDialog.returnData.productName}" back to inventory and process a refund of ${formatCurrency(actionDialog.returnData.refundAmount)}.`}
                    {actionDialog.action === 'reject' && 'Are you sure you want to reject this return? The customer will be notified.'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {actionDialog.returnData.returnNo}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setActionDialog({ open: false, action: '', returnData: null })}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${
                    actionDialog.action === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                    actionDialog.action === 'complete' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    'bg-blue-600 hover:bg-blue-700'
                  }`}
                  onClick={() => processAction(actionDialog.action)}
                >
                  {actionDialog.action === 'approve' && 'Approve'}
                  {actionDialog.action === 'complete' && 'Complete Return'}
                  {actionDialog.action === 'reject' && 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return Ticket Modal */}
      <ReturnTicketModal
        returnData={ticketReturn}
        open={ticketOpen}
        onClose={() => { setTicketOpen(false); setTicketReturn(null) }}
      />
    </div>
  )
}
