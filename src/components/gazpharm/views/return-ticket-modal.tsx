'use client'

import {
  CheckCircle2, Printer, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/currency'
import { useAppStore } from '@/store/app-store'

interface ReturnTicketModalProps {
  returnData: any
  open: boolean
  onClose: () => void
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const REASON_LABELS: Record<string, string> = {
  DEFECTIVE: 'Defective Product',
  EXPIRED: 'Expired Product',
  WRONG_ITEM: 'Wrong Item Supplied',
  WRONG_QUANTITY: 'Wrong Quantity',
  DAMAGED: 'Damaged Product',
  CUSTOMER_CHANGE_OF_MIND: 'Customer Change of Mind',
  RECALLED: 'Product Recalled',
  OTHER: 'Other Reason',
}

export function ReturnTicketModal({ returnData, open, onClose }: ReturnTicketModalProps) {
  const addToast = useAppStore((s) => s.addToast)

  if (!returnData) return null

  const handlePrint = async () => {
    try {
      await fetch('/api/hardware', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receipt', type: 'return_ticket', returnId: returnData.id }),
      })
      addToast({ title: 'Printing', description: 'Return ticket sent to printer', variant: 'success' })
    } catch {
      addToast({ title: 'Print Error', description: 'Failed to send to printer', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Return Ticket</DialogTitle>
        </DialogHeader>

        {/* Receipt Body */}
        <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-5 font-mono text-xs space-y-4">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <div className="h-6 w-6 rounded bg-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-base font-bold text-gray-900">SelRx</h3>
            </div>
            <p className="text-muted-foreground">Goods Return Ticket</p>
            <Separator />
          </div>

          {/* Return Info */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Return #</span>
              <span className="font-bold">{returnData.returnNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{formatDate(returnData.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-medium ${
                returnData.status === 'COMPLETED' ? 'text-emerald-600' :
                returnData.status === 'APPROVED' ? 'text-blue-600' :
                returnData.status === 'REJECTED' ? 'text-red-600' :
                returnData.status === 'CANCELLED' ? 'text-gray-500' :
                'text-amber-600'
              }`}>
                {returnData.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason</span>
              <span>{REASON_LABELS[returnData.reason] || returnData.reason}</span>
            </div>
          </div>

          <Separator />

          {/* Product Info */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Product Returned</p>
            <div className="flex justify-between">
              <span className="font-medium">{returnData.productName}</span>
              <span>Qty: {returnData.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Price</span>
              <span>{formatCurrency(returnData.unitPrice)}</span>
            </div>
          </div>

          <Separator />

          {/* Original Transaction */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Original Transaction</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Receipt #</span>
              <span>{returnData.transaction?.transactionNo || 'N/A'}</span>
            </div>
            {returnData.customerName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span>{returnData.customerName}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Refund Info */}
          <div className="space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase font-semibold">Refund Details</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refund Amount</span>
              <span className="font-bold text-base text-emerald-700">{formatCurrency(returnData.refundAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refund Method</span>
              <span>{(returnData.refundMethod || 'CASH').replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Restocked</span>
              <span>{returnData.restocked ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {returnData.reasonNote && (
            <>
              <Separator />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Notes</p>
                <p className="mt-1 text-gray-600">{returnData.reasonNote}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Staff Info */}
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Processed By</span>
              <span>{returnData.user?.name || 'Staff'}</span>
            </div>
            {returnData.approvedBy && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved By</span>
                <span>{returnData.approvedBy.name}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center pt-2">
            <p className="text-muted-foreground text-[10px]">Thank you for choosing SelRx</p>
            <p className="text-muted-foreground text-[10px]">This return ticket serves as proof of goods returned.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="h-4 w-4 mr-2" />
            Print Ticket
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
