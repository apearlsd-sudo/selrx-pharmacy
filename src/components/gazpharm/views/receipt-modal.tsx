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
import { useAppStore, type ReceiptFontFamily, type ReceiptFontSize } from '@/store/app-store'

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
      sellingUnit?: string
      itemsPerUnit?: number
      barcode?: string | null
    }[]
  }
  onClose: () => void
}

import { formatCurrency } from '@/lib/currency'
import { formatDateTime } from '@/lib/date-utils'
import { BarcodeSVG } from '@/components/ui/barcode-svg'

function formatDate(dateStr: string): string {
  return formatDateTime(dateStr)
}

function getFontCSS(ff: ReceiptFontFamily): string {
  if (ff === 'sans') return "'Inter', 'Helvetica Neue', Arial, sans-serif"
  if (ff === 'serif') return "Georgia, 'Times New Roman', Times, serif"
  return "'Courier New', Courier, monospace"
}

function getBaseSize(fs: ReceiptFontSize): string {
  if (fs === 'large') return '14px'
  if (fs === 'medium') return '12px'
  return '10px'
}

function getSizeForRole(fs: ReceiptFontSize, role: 'header' | 'body' | 'small'): string {
  const scale = role === 'header' ? 1.4 : role === 'small' ? 0.8 : 1
  const base = fs === 'large' ? 14 : fs === 'medium' ? 12 : 10
  return `${Math.round(base * scale)}px`
}

export function ReceiptModal({ transaction, onClose }: ReceiptModalProps) {
  const addToast = useAppStore((s) => s.addToast)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const company = useAppStore((s) => s.company)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const boldHeader = useAppStore((s) => s.boldHeader)
  const boldItems = useAppStore((s) => s.boldItems)
  const boldTotals = useAppStore((s) => s.boldTotals)

  const receiptStyle: React.CSSProperties = {
    fontFamily: getFontCSS(fontFamily),
    fontSize: getBaseSize(fontSize),
    lineHeight: '1.6',
  }

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
      <DialogContent className="sm:max-w-md !p-0 !gap-0 overflow-hidden" showCloseButton={false}>
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
          <div
            className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-5 space-y-4"
            style={receiptStyle}
          >
            {/* Pharmacy Header */}
            <div className="text-center space-y-1">
              {/* Logo */}
              {company?.logo ? (
                <div className="flex justify-center mb-1.5">
                  <img
                    src={company.logo}
                    alt=""
                    className="h-12 w-12 object-contain rounded"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <Store className="h-4 w-4 text-emerald-600" />
                  <span className={`tracking-wide text-gray-800 ${boldHeader ? 'font-bold' : ''}`} style={{ fontSize: getSizeForRole(fontSize, 'header') }}>{company?.name || 'SelRx'}</span>
                </div>
              )}
              {company?.logo && (
                <p className={`tracking-wide text-gray-800 ${boldHeader ? 'font-bold' : ''}`} style={{ fontSize: getSizeForRole(fontSize, 'header') }}>{company.name || 'SelRx'}</p>
              )}
              {company?.tagline && <p className="text-gray-500 italic" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>{company.tagline}</p>}
              {company?.address && <p className="text-gray-500">{company.address}</p>}
              {(company?.city || company?.state || company?.country) && (
                <p className="text-gray-500">{[company?.city, company?.state, company?.country].filter(Boolean).join(', ')}</p>
              )}
              {company?.phone && <p className="text-gray-500">Tel: {company.phone}</p>}
              {company?.email && <p className="text-gray-500">{company.email}</p>}
              {/* Registration & License Info */}
              {(company?.registrationNo || company?.pharmacyLicense) && (
                <div className="pt-1 space-y-0.5" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
                  {company?.registrationNo && (
                    <p className="text-gray-500">Reg: {company.registrationNo}</p>
                  )}
                  {company?.pharmacyLicense && (
                    <p className="text-gray-500">Pharm. Lic: {company.pharmacyLicense}</p>
                  )}
                </div>
              )}
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
                <span>{transaction.user?.name || 'Unknown'}</span>
              </div>
              {transaction.customer && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer:</span>
                  <span>{transaction.customer.firstName} {transaction.customer.lastName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Payment:</span>
                <span>{(transaction.paymentMethod || '').replace(/_/g, ' ')}</span>
              </div>
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Items */}
            <div className="space-y-2">
              <p className={`text-center text-gray-800 uppercase tracking-wider ${boldItems ? 'font-semibold' : ''}`}>
                Items
              </p>
              <div className="space-y-1.5">
                {transaction.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <div className="flex-1 min-w-0">
                      <p className={`truncate pr-2 ${boldItems ? 'font-bold' : ''}`}>{item.productName}</p>
                      {item.barcode && (
                        <div className="mt-0.5">
                          <BarcodeSVG value={item.barcode} width={1} height={28} fontSize={7} margin={1} />
                        </div>
                      )}
                      <p className="text-gray-400">
                        {item.quantity}{item.sellingUnit && item.sellingUnit !== 'EA' ? ` ${item.sellingUnit.toLowerCase()}${item.quantity !== 1 ? 's' : ''}` : ''} x {formatCurrency(item.unitPrice)}
                        {item.itemsPerUnit && item.itemsPerUnit > 1 ? ` (${item.quantity * item.itemsPerUnit} pcs)` : ''}
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
              <div className={`flex justify-between ${boldTotals ? 'font-bold' : ''}`} style={{ fontSize: getSizeForRole(fontSize, 'header') }}>
                <span>Total:</span>
                <span>{formatCurrency(transaction.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Paid:</span>
                <span className={boldTotals ? 'font-semibold' : ''}>{formatCurrency(transaction.paymentAmount)}</span>
              </div>
              {transaction.changeAmount > 0 && (
                <div className={`flex justify-between text-emerald-600 ${boldTotals ? 'font-semibold' : ''}`}>
                  <span>Change:</span>
                  <span>{formatCurrency(transaction.changeAmount)}</span>
                </div>
              )}
            </div>

            <Separator className="border-dashed border-gray-300" />

            {/* Footer */}
            <div className="text-center space-y-1 pt-1">
              <p className="text-gray-500">Thank you for choosing {company?.name || 'SelRx'}!</p>
              <p className="text-gray-400" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
                Your health, our priority. Rx questions? Ask our pharmacist.
              </p>
              {company?.website && (
                <p className="text-gray-400" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
                  {company.website}
                </p>
              )}
              <p className="text-gray-400 mt-2" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
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
