'use client'

import {
  Printer,
  RotateCcw,
  X,
  CheckCircle2,
  Store,
} from 'lucide-react'
import type React from 'react'
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
    insuranceClaim?: {
      claimNo: string
      insuranceProvider: string
      policyNumber: string
      totalAmount: number
      coPayAmount: number
      status: string
    } | null
    cardPayment?: {
      cardLast4: string
      cardBrand: string
      cardBrandLabel: string
      authCode: string
      refNumber: string
      status: string
      approvalMessage: string
    } | null
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
  const receiptHeader = useAppStore((s) => s.receiptHeader)
  const receiptFooter = useAppStore((s) => s.receiptFooter)

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

  const handleBrowserPrint = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=700')
    if (!printWindow) return

    const itemRows = transaction.items.map((item) => `
        <tr>
          <td style="padding:4px 0;text-align:left;vertical-align:top;">
            <strong>${item.productName}</strong>
            <br/>
            <span style="color:#666;font-size:0.85em;">${item.quantity}${item.sellingUnit && item.sellingUnit !== 'EA' ? ` ${item.sellingUnit.toLowerCase()}${item.quantity !== 1 ? 's' : ''}` : ''} × ${formatCurrency(item.unitPrice)}</span>
          </td>
          <td style="padding:4px 0;text-align:right;white-space:nowrap;">${formatCurrency(item.subtotal)}</td>
        </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt - ${transaction.transactionNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${getFontCSS(fontFamily)};
      font-size: ${getBaseSize(fontSize)};
      color: #000;
      background: #fff;
      padding: 20px;
      max-width: 320px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .header { text-align: center; margin-bottom: 12px; }
    .header h2 { font-size: 1.3em; margin-bottom: 2px; }
    .header p { color: #444; font-size: 0.9em; }
    .divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
    .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .info-label { color: #666; }
    table { width: 100%; border-collapse: collapse; }
    .totals-section { margin-top: 4px; }
    .totals-section .info-row { margin: 2px 0; }
    .total-row { font-size: 1.2em; font-weight: bold; border-top: 1px dashed #999; padding-top: 6px; margin-top: 4px; }
    .footer { text-align: center; margin-top: 12px; color: #666; font-size: 0.85em; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>${company?.name || 'SelRx'}</h2>
    ${company?.tagline ? `<p style="font-style:italic;">${company.tagline}</p>` : ''}
    ${company?.address ? `<p>${company.address}</p>` : ''}
    ${company?.phone ? `<p>Tel: ${company.phone}</p>` : ''}
    ${company?.email ? `<p>${company.email}</p>` : ''}
    ${company?.registrationNo ? `<p style="font-size:0.85em;">Reg: ${company.registrationNo}</p>` : ''}
    ${company?.pharmacyLicense ? `<p style="font-size:0.85em;">Pharm. Lic: ${company.pharmacyLicense}</p>` : ''}
  </div>

  <hr class="divider" />

  <div class="info-row"><span class="info-label">Transaction:</span><span><strong>${transaction.transactionNo}</strong></span></div>
  <div class="info-row"><span class="info-label">Date:</span><span>${formatDate(transaction.createdAt)}</span></div>
  <div class="info-row"><span class="info-label">Cashier:</span><span>${transaction.user?.name || 'Unknown'}</span></div>
  ${transaction.customer ? `<div class="info-row"><span class="info-label">Customer:</span><span>${transaction.customer.firstName} ${transaction.customer.lastName}</span></div>` : ''}
  <div class="info-row"><span class="info-label">Payment:</span><span>${(transaction.paymentMethod || '').replace(/_/g, ' ')}</span></div>
  ${transaction.insuranceClaim ? `
  <div class="info-row"><span class="info-label">Ins. Provider:</span><span>${transaction.insuranceClaim.insuranceProvider}</span></div>
  <div class="info-row"><span class="info-label">Policy #:</span><span>${transaction.insuranceClaim.policyNumber}</span></div>
  <div class="info-row"><span class="info-label">Claim #:</span><span>${transaction.insuranceClaim.claimNo}</span></div>
  <div class="info-row"><span class="info-label">Co-pay:</span><span>${formatCurrency(transaction.insuranceClaim.coPayAmount || 0)}</span></div>
  <div class="info-row"><span class="info-label">Ins. Covers:</span><span>${formatCurrency((transaction.insuranceClaim.totalAmount || 0) - (transaction.insuranceClaim.coPayAmount || 0))}</span></div>
  ` : ''}
  ${transaction.cardPayment ? `
  <div class="info-row"><span class="info-label">Card:</span><span>${transaction.cardPayment.cardBrandLabel} **** ${transaction.cardPayment.cardLast4}</span></div>
  <div class="info-row"><span class="info-label">Auth Code:</span><span>${transaction.cardPayment.authCode}</span></div>
  <div class="info-row"><span class="info-label">Reference:</span><span>${transaction.cardPayment.refNumber}</span></div>
  ` : ''}

  <hr class="divider" />

  <table>
    <thead>
      <tr style="text-align:center;text-transform:uppercase;letter-spacing:0.05em;font-size:0.9em;border-bottom:1px solid #ccc;"><td colspan="2" style="padding:4px 0;">Items</td></tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <hr class="divider" />

  <div class="totals-section">
    <div class="info-row"><span class="info-label">Subtotal:</span><span>${formatCurrency(transaction.subtotal)}</span></div>
    <div class="info-row"><span class="info-label">Tax:</span><span>${formatCurrency(transaction.tax)}</span></div>
    ${transaction.discount > 0 ? `<div class="info-row"><span class="info-label">Discount:</span><span>-${formatCurrency(transaction.discount)}</span></div>` : ''}
    <div class="info-row total-row"><span>Total:</span><span>${formatCurrency(transaction.total)}</span></div>
    <div class="info-row"><span class="info-label">Paid:</span><span>${formatCurrency(transaction.paymentAmount)}</span></div>
    ${transaction.changeAmount > 0 ? `<div class="info-row" style="color:#059669;"><span>Change:</span><span>${formatCurrency(transaction.changeAmount)}</span></div>` : ''}
  </div>

  <hr class="divider" />

  <div class="footer">
    <p>Thank you for choosing ${company?.name || 'SelRx'}!</p>
    <p>Your health, our priority. Rx questions? Ask our pharmacist.</p>
    ${receiptFooter ? receiptFooter.split('\n').filter(Boolean).map((line) => `<p>${line}</p>`).join('') : ''}
    ${company?.website ? `<p>${company.website}</p>` : ''}
    <p style="margin-top:8px;">*** End of Receipt ***</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:16px;">
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#059669;color:#fff;">Print</button>
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
  }

  const handleNewTransaction = () => {
    onClose()
    setCurrentView('pos')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md !p-0 !gap-0 max-h-[90vh] flex flex-col" showCloseButton={false}>
        {/* Receipt Header - Green stripe */}
        <div className="bg-emerald-600 px-6 py-3 flex items-center gap-3 shrink-0">
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
        <div className="px-6 py-4 overflow-y-auto flex-1">
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
              {/* Custom header lines */}
              {receiptHeader && (
                <div className="pt-1 space-y-0.5" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
                  {receiptHeader.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i} className="text-gray-500">{line}</p>
                  ))}
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
              {transaction.insuranceClaim && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ins. Provider:</span>
                    <span className="font-medium">{transaction.insuranceClaim.insuranceProvider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Policy #:</span>
                    <span className="font-mono text-xs">{transaction.insuranceClaim.policyNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Claim #:</span>
                    <span className="font-mono text-xs">{transaction.insuranceClaim.claimNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Co-pay:</span>
                    <span className="font-medium text-amber-600">{formatCurrency(transaction.insuranceClaim.coPayAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ins. Covers:</span>
                    <span className="font-medium text-sky-600">{formatCurrency((transaction.insuranceClaim.totalAmount || 0) - (transaction.insuranceClaim.coPayAmount || 0))}</span>
                  </div>
                </>
              )}
              {transaction.cardPayment && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Card:</span>
                    <span className="font-medium">{transaction.cardPayment.cardBrandLabel} **** {transaction.cardPayment.cardLast4}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Auth Code:</span>
                    <span className="font-mono text-xs">{transaction.cardPayment.authCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reference:</span>
                    <span className="font-mono text-[10px]">{transaction.cardPayment.refNumber}</span>
                  </div>
                </>
              )}
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
                      <p className={`${boldItems ? 'font-bold' : ''}`}>{item.productName}</p>
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
              {/* Custom footer lines */}
              {receiptFooter && (
                <div className="space-y-0.5 pt-1" style={{ fontSize: getSizeForRole(fontSize, 'small') }}>
                  {receiptFooter.split('\n').filter(Boolean).map((line, i) => (
                    <p key={i} className="text-gray-500">{line}</p>
                  ))}
                </div>
              )}
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
        <DialogFooter className="px-6 pb-5 pt-2 border-t shrink-0 gap-2">
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
            onClick={handleBrowserPrint}
            className="flex-1"
          >
            <Printer className="h-4 w-4 mr-1.5" />
            Browser Print
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
