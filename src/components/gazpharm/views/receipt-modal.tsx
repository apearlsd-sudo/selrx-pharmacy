'use client'

import {
  Printer,
  RotateCcw,
  X,
  CheckCircle2,
  Store,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/app-store'

interface ReceiptModalProps {
  transaction: {
    id: string
    transactionNo: string
    subtotal: number
    tax: number
    discount: number
    total: number
    paymentMethod: string
    paymentAmount: number
    changeAmount: number
    status: string
    createdAt: string
    notes?: string | null
    customer?: {
      id: string
      firstName: string
      lastName: string
    } | null
    user: {
      id: string
      name: string
    }
    items: {
      id: string
      productName: string
      quantity: number
      unitPrice: number
      subtotal: number
      requiresRx: boolean
    }[]
  }
  onClose: () => void
}

import { formatCurrency } from '@/lib/currency'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function ReceiptModal({ transaction, onClose }: ReceiptModalProps) {
  const addToast = useAppStore((s) => s.addToast)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const company = useAppStore((s) => s.company)

  const handlePrintReceipt = async () => {
    try {
      await fetch('/api/hardware?action=receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transaction.id,
          hardwareType: 'receipt_printer',
          details: {
            transactionNo: transaction.transactionNo,
            total: transaction.total,
          },
        }),
      })
      addToast({
        title: 'Receipt Sent',
        description: 'Receipt sent to printer',
        variant: 'success',
        duration: 3000,
      })
    } catch {
      addToast({
        title: 'Print Failed',
        description: 'Could not send receipt to printer',
        variant: 'destructive',
      })
    }
  }

  const handleNewTransaction = () => {
    onClose()
    setCurrentView('pos')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Receipt Header - Green stripe */}
        <div className="bg-emerald-600 px-6 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-white" />
          <div>
            <DialogTitle className="text-white text-base font-semibold">
              Payment Successful
            </DialogTitle>
            <DialogDescription className="text-emerald-100 text-xs">
              Transaction completed
            </DialogDescription>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-6">
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-5 font-mono text-xs space-y-4">
            {/* Pharmacy Header */}
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5">
                <Store className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-bold tracking-wide text-gray-800">{company?.name || 'SelRx'}</span>
              </div>
              {company?.tagline && <p className="text-gray-500 text-[10px] italic">{company.tagline}</p>}
              {company?.address && <p className="text-gray-500">{company.address}</p>}
              {(company?.city || company?.country) && (
                <p className="text-gray-500">{[company?.city, company?.country].filter(Boolean).join(', ')}</p>
              )}
              {company?.phone && <p className="text-gray-500">Tel: {company.phone}</p>}
              {company?.email && <p className="text-gray-500">{company.email}</p>}
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Transaction Info */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Transaction:</span>
                <span className="font-semibold">{transaction.transactionNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date:</span>
                <span>{formatDate(transaction.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cashier:</span>
                <span>{transaction.user.name}</span>
              </div>
              {transaction.customer && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer:</span>
                  <span>{transaction.customer.firstName} {transaction.customer.lastName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Payment:</span>
                <span>{transaction.paymentMethod.replace(/_/g, ' ')}</span>
              </div>
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Items */}
            <div className="space-y-2">
              <p className="text-center font-semibold text-gray-800 text-xs uppercase tracking-wider">
                Items
              </p>
              <div className="space-y-1.5">
                {transaction.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="truncate pr-2">{item.productName}</p>
                      <p className="text-gray-400">
                        {item.quantity} x {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <span className="font-medium shrink-0">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Totals */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal:</span>
                <span>{formatCurrency(transaction.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tax:</span>
                <span>{formatCurrency(transaction.tax)}</span>
              </div>
              {transaction.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount:</span>
                  <span>-{formatCurrency(transaction.discount)}</span>
                </div>
              )}
              <Separator className="border-dashed border-gray-300" />
              <div className="flex justify-between text-sm font-bold">
                <span>Total:</span>
                <span>{formatCurrency(transaction.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Paid:</span>
                <span>{formatCurrency(transaction.paymentAmount)}</span>
              </div>
              {transaction.changeAmount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Change:</span>
                  <span>{formatCurrency(transaction.changeAmount)}</span>
                </div>
              )}
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Footer */}
            <div className="text-center space-y-1 pt-1">
              <p className="text-gray-500">Thank you for choosing {company?.name || 'SelRx'}!</p>
              <p className="text-gray-400 text-[10px]">
                Your health, our priority. Rx questions? Ask our pharmacist.
              </p>
              <p className="text-gray-400 text-[10px] mt-2">
                *** End of Receipt ***
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <DialogFooter className="px-6 pb-6 gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-1.5" />
            Close
          </Button>
          <Button
            variant="outline"
            onClick={handlePrintReceipt}
            className="flex-1"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Print Receipt
          </Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={handleNewTransaction}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" />
            New Transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
