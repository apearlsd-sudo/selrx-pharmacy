'use client'

import { useEffect, useState } from 'react'

interface LabelData {
  productName: string
  strength?: string | null
  dosageForm?: string | null
  barcode: string
  sellingPrice: number
  batchNumber?: string | null
  expiryDate?: string | null
}

/**
 * Renders barcode labels in a hidden print-only container.
 * Call printBarcodeLabels(labels) from any component to print.
 */
export function BarcodeLabelPrintOverlay() {
  const [labels, setLabels] = useState<LabelData[]>([])

  useEffect(() => {
    // Listen for custom event
    const handler = (e: CustomEvent) => {
      setLabels(e.detail.labels || [])
      // Delay print to allow render
      setTimeout(() => window.print(), 300)
    }
    window.addEventListener('print-barcode-labels', handler as EventListener)
    return () => window.removeEventListener('print-barcode-labels', handler as EventListener)
  }, [])

  if (labels.length === 0) return null

  return (
    <div className="print-labels-container">
      {labels.map((label, i) => (
        <div key={i} className="barcode-label">
          <div className="label-product-name" dangerouslySetInnerHTML={{ __html: label.productName }} />
          {(label.strength || label.dosageForm) && (
            <div className="label-strength">
              {[label.strength, label.dosageForm].filter(Boolean).join(' · ')}
            </div>
          )}
          <div className="label-barcode-text">{label.barcode}</div>
          <div className="label-price">
            {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(label.sellingPrice)}
          </div>
          {label.batchNumber && <div className="label-batch">Batch: {label.batchNumber}</div>}
          {label.expiryDate && <div className="label-expiry">Exp: {label.expiryDate?.split('T')[0]}</div>}
        </div>
      ))}
    </div>
  )
}

/**
 * Trigger barcode label printing from any component.
 * @param labels Array of label data to print
 */
export function printBarcodeLabels(labels: LabelData[]) {
  window.dispatchEvent(new CustomEvent('print-barcode-labels', { detail: { labels } }))
}

/**
 * Generate a single label from a product and print it.
 */
export async function generateAndPrintLabel(product: {
  id: string; name: string; strength?: string | null; dosageForm?: string | null;
  barcode?: string | null; sellingPrice: number; batchNumber?: string | null;
  expiryDate?: string | null;
}, copies = 1) {
  try {
    const res = await fetch('/api/barcode/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        labelData: {
          productName: product.name,
          strength: product.strength,
          dosageForm: product.dosageForm,
          sellingPrice: product.sellingPrice,
          batchNumber: product.batchNumber,
          expiryDate: product.expiryDate,
        },
      }),
    })
    if (!res.ok) throw new Error('Failed to generate barcode')
    const data = await res.json()
    const labels = Array.from({ length: copies }, () => data.label)
    printBarcodeLabels(labels)
  } catch {
    // Fallback: print without server barcode
    const labels = Array.from({ length: copies }, () => ({
      productName: product.name,
      strength: product.strength,
      dosageForm: product.dosageForm,
      barcode: product.barcode || product.id.substring(0, 13),
      sellingPrice: product.sellingPrice,
      batchNumber: product.batchNumber,
      expiryDate: product.expiryDate,
    }))
    printBarcodeLabels(labels)
  }
}
