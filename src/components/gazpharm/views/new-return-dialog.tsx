'use client'

import { useState, useCallback } from 'react'
import {
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingBag,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { useAppStore } from '@/store/app-store'
import { formatCurrency } from '@/lib/currency'
import { formatDateTimeShort } from '@/lib/date-utils'
import { authHeaders } from '@/lib/auth-headers'

function formatDate(dateStr: string): string {
  return formatDateTimeShort(dateStr)
}

interface TransactionItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  subtotal: number
  transactionId: string
}

interface TransactionData {
  id: string
  transactionNo: string
  status: string
  items: TransactionItem[]
  customer?: { firstName: string; lastName: string; id?: string }
  createdAt: string
}

interface NewReturnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReturnCreated?: () => void
}

export function NewReturnDialog({ open, onOpenChange, onReturnCreated }: NewReturnDialogProps) {
  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)

  const [recentReceipts, setRecentReceipts] = useState<any[]>([])
  const [receiptsPage, setReceiptsPage] = useState(1)
  const [receiptsTotalPages, setReceiptsTotalPages] = useState(1)
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [txSearchQuery, setTxSearchQuery] = useState('')
  const [searchingTx, setSearchingTx] = useState(false)
  const [foundTx, setFoundTx] = useState<TransactionData | null>(null)
  const [selectedItem, setSelectedItem] = useState<TransactionItem | null>(null)
  const [returnQty, setReturnQty] = useState(1)
  const [returnReason, setReturnReason] = useState('')
  const [returnReasonNote, setReturnReasonNote] = useState('')
  const [returnRefundMethod, setReturnRefundMethod] = useState('CASH')
  const [submitting, setSubmitting] = useState(false)

  // Fetch recent completed sales receipts
  const fetchRecentReceipts = useCallback(async (pg: number, search?: string) => {
    setReceiptsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pg),
        limit: '10',
        status: 'COMPLETED',
      })
      if (search && search.trim()) {
        params.set('search', search.trim())
      }
      const res = await fetch(`/api/transactions?${params}`, { headers: authHeaders() })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        addToast({ title: 'Failed to load receipts', description: errData.error || `Server error (${res.status})`, variant: 'destructive' })
        return
      }
      const data = await res.json()
      if (data.error) {
        addToast({ title: 'Failed to load receipts', description: data.error, variant: 'destructive' })
        return
      }
      if (data.transactions && Array.isArray(data.transactions)) {
        setRecentReceipts(data.transactions)
        setReceiptsPage(pg)
        setReceiptsTotalPages(data.pagination ? data.pagination.pages : 1)
      }
    } catch (err) {
      console.error('Failed to fetch recent receipts:', err)
      addToast({ title: 'Network error', description: 'Could not connect to server', variant: 'destructive' })
    } finally {
      setReceiptsLoading(false)
    }
  }, [])

  // Reset dialog state when opened
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setFoundTx(null)
      setSelectedItem(null)
      setTxSearchQuery('')
      setReturnQty(1)
      setReturnReason('')
      setReturnReasonNote('')
      setReturnRefundMethod('CASH')
      fetchRecentReceipts(1)
    }
    onOpenChange(newOpen)
  }

  // Search for transaction by transaction number or customer name
  const searchTransaction = async () => {
    if (!txSearchQuery.trim()) {
      fetchRecentReceipts(1)
      return
    }
    setSearchingTx(true)
    setFoundTx(null)
    setSelectedItem(null)
    try {
      const params = new URLSearchParams({
        search: txSearchQuery.trim(),
        limit: '10',
        status: 'COMPLETED',
      })
      const res = await fetch(`/api/transactions?${params}`, { headers: authHeaders() })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        addToast({ title: 'Search failed', description: errData.error || `Server error (${res.status})`, variant: 'destructive' })
        return
      }
      const data = await res.json()
      if (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) {
        setRecentReceipts(data.transactions)
        setReceiptsPage(1)
        setReceiptsTotalPages(data.pagination ? data.pagination.pages : 1)
      } else {
        addToast({ title: 'Transaction not found', description: 'No matching transaction found', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to search transaction:', err)
      addToast({ title: 'Search failed', description: 'Could not search for transaction', variant: 'destructive' })
    } finally {
      setSearchingTx(false)
    }
  }

  // Submit new return
  const submitReturn = async () => {
    if (!selectedItem || !returnReason || !user || !foundTx) return
    const itemQty = Number(selectedItem.quantity)
    const itemPrice = Number(selectedItem.unitPrice)
    if (returnQty <= 0 || returnQty > itemQty) {
      addToast({ title: 'Invalid quantity', description: 'Quantity must be between 1 and the purchased amount', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const customerName = foundTx.customer
        ? `${foundTx.customer.firstName} ${foundTx.customer.lastName}`
        : null
      const customerId = foundTx.customer ? foundTx.customer.id : null

      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          transactionId: foundTx.id,
          transactionItemId: selectedItem.id,
          productId: selectedItem.productId,
          productName: selectedItem.productName,
          quantity: returnQty,
          unitPrice: itemPrice,
          refundAmount: itemPrice * returnQty,
          reason: returnReason,
          reasonNote: returnReasonNote || null,
          customerId,
          customerName,
          userId: user.id,
          refundMethod: returnRefundMethod,
        }),
      })
      const data = await res.json()
      if (res.ok && data.return) {
        addToast({
          title: 'Return Created',
          description: `Return ticket ${data.return.returnNo} created successfully`,
          variant: 'success',
        })
        onOpenChange(false)
        onReturnCreated?.()
      } else {
        addToast({ title: 'Failed to create return', description: data.error || 'Unknown error', variant: 'destructive' })
      }
    } catch (err) {
      console.error('Failed to create return:', err)
      addToast({ title: 'Error', description: 'Failed to create return', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-emerald-600" />
            Process Goods Return
          </DialogTitle>
          <DialogDescription>
            Select a recent sale receipt or search by receipt number, then choose the item to return.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Step 1: Find Transaction */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Step 1: Find Original Sale Receipt</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by receipt # or customer name..."
                  className="pl-9"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') searchTransaction() }}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => { setTxSearchQuery(''); fetchRecentReceipts(1) }}
                title="Clear search and show recent receipts"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                onClick={searchTransaction}
                disabled={searchingTx}
              >
                {searchingTx ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Recent Receipts List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {recentReceipts.length > 0
                  ? `Showing ${recentReceipts.length} receipt${recentReceipts.length !== 1 ? 's' : ''} (Page ${receiptsPage} of ${receiptsTotalPages})`
                  : 'No receipts found'}
              </p>
              {receiptsTotalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={receiptsPage <= 1 || receiptsLoading}
                    onClick={() => fetchRecentReceipts(receiptsPage - 1, txSearchQuery)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs text-muted-foreground px-1">{receiptsPage}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={receiptsPage >= receiptsTotalPages || receiptsLoading}
                    onClick={() => fetchRecentReceipts(receiptsPage + 1, txSearchQuery)}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {receiptsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : recentReceipts.length === 0 ? (
              <div className="text-center py-8 border rounded-lg border-dashed">
                <ShoppingBag className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-muted-foreground">No completed sales found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different search or check back later</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {recentReceipts.map((receipt) => {
                  const isSelected = foundTx?.id === receipt.id
                  return (
                    <button
                      key={receipt.id}
                      onClick={() => {
                        setFoundTx({
                          id: receipt.id,
                          transactionNo: receipt.transactionNo,
                          status: receipt.status,
                          items: receipt.items,
                          customer: receipt.customer,
                          createdAt: receipt.createdAt,
                        })
                        setSelectedItem(null)
                        setReturnQty(1)
                      }}
                      className={`w-full text-left rounded-lg border p-3 transition-all ${
                        isSelected
                          ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200'
                          : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-emerald-600' : 'bg-gray-100'
                          }`}>
                            <ShoppingBag className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{receipt.transactionNo}</p>
                            <p className="text-xs text-muted-foreground">
                              {receipt.customer
                                ? `${receipt.customer.firstName} ${receipt.customer.lastName}`
                                : 'Walk-in Customer'}
                              {' · '}
                              {formatDate(receipt.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold">{formatCurrency(Number(receipt.total))}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {receipt.items?.length || 0} item{(receipt.items?.length || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Show items when receipt is selected */}
                      {isSelected && foundTx && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 space-y-1.5">
                          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                            Items — click to select for return
                          </p>
                          {foundTx.items.map((item: TransactionItem) => (
                            <button
                              key={item.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedItem(item)
                                setReturnQty(1)
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-colors ${
                                selectedItem?.id === item.id
                                  ? 'border-emerald-500 bg-emerald-100'
                                  : 'border-gray-200 bg-white hover:border-emerald-300'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{item.productName}</p>
                                <p className="text-muted-foreground">
                                  {formatCurrency(Number(item.unitPrice))} × {Number(item.quantity)} = {formatCurrency(Number(item.subtotal))}
                                </p>
                              </div>
                              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Step 2: Return Details */}
          {selectedItem && (
            <div className="space-y-4 border-t pt-4">
              <Label className="text-sm font-medium">Step 2: Return Details</Label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Product</Label>
                  <p className="text-sm font-medium">{selectedItem.productName}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Unit Price</Label>
                  <p className="text-sm font-medium">{formatCurrency(Number(selectedItem.unitPrice))}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Quantity to Return</Label>
                  <Input
                    type="number"
                    min={1}
                    max={Number(selectedItem.quantity)}
                    value={returnQty}
                    onChange={(e) => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Max: {Number(selectedItem.quantity)} (purchased quantity)
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Refund Amount</Label>
                  <p className="text-sm font-bold text-emerald-600">
                    {formatCurrency(Number(selectedItem.unitPrice) * returnQty)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Return Reason *</Label>
                <Select value={returnReason} onValueChange={setReturnReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEFECTIVE">Defective Product</SelectItem>
                    <SelectItem value="EXPIRED">Expired Product</SelectItem>
                    <SelectItem value="WRONG_ITEM">Wrong Item Delivered</SelectItem>
                    <SelectItem value="WRONG_QUANTITY">Wrong Quantity</SelectItem>
                    <SelectItem value="DAMAGED">Damaged in Transit</SelectItem>
                    <SelectItem value="CUSTOMER_CHANGE_OF_MIND">Customer Change of Mind</SelectItem>
                    <SelectItem value="RECALLED">Product Recalled</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Additional Notes</Label>
                <Textarea
                  placeholder="Optional notes about this return..."
                  value={returnReasonNote}
                  onChange={(e) => setReturnReasonNote(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Refund Method</Label>
                <Select value={returnRefundMethod} onValueChange={setReturnRefundMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CREDIT_CARD">Credit Card</SelectItem>
                    <SelectItem value="DEBIT_CARD">Debit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submitReturn}
            disabled={!selectedItem || !returnReason || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Create Return Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
