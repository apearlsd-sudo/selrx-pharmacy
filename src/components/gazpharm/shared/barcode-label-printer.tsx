'use client'

import { useEffect, useState, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { formatCurrency } from '@/lib/currency'

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
 * Renders a single barcode as an inline SVG using JsBarcode.
 * Used inside print labels so actual barcode lines appear on paper.
 */
function BarcodeImage({ value, width = 1.5, height = 50 }: { value: string; width?: number; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128',
          width,
          height,
          displayValue: true,
          fontSize: 14,
          margin: 0,
          font: 'monospace',
          textMargin: 2,
        })
      } catch {
        // fallback: show nothing
      }
    }
  }, [value, width, height])

  if (!value) return null
  return <svg ref={svgRef} className="label-barcode-svg" />
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
      document.body.classList.add('printing-barcode-labels')
      setLabels(e.detail.labels || [])
      // Delay print to allow JsBarcode to render
      setTimeout(() => {
        window.print()
        // Clean up after print dialog closes
        setTimeout(() => {
          document.body.classList.remove('printing-barcode-labels')
          setLabels([])
        }, 500)
      }, 400)
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
          <div className="label-barcode-area">
            <BarcodeImage value={label.barcode} width={1.4} height={45} />
          </div>
          <div className="label-price">
            {formatCurrency(label.sellingPrice)}
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
 * Generate company initials from company name (e.g. "GazPharm" → "GP")
 */
function getCompanyInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'XX'
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/**
 * Fetch the company name and return initials to use as barcode prefix.
 */
async function getCompanyPrefix(): Promise<string> {
  try {
    const res = await fetch('/api/company-branding')
    if (res.ok) {
      const data = await res.json()
      if (data.name) return getCompanyInitials(data.name)
    }
  } catch {
    // fallback
  }
  return 'XX'
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
    const prefix = await getCompanyPrefix()
    const res = await fetch('/api/barcode/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        companyPrefix: prefix,
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
    const prefix = await getCompanyPrefix()
    const rawBarcode = product.barcode || product.id.substring(0, 13)
    // Prefix with company initials if not already prefixed
    const barcode = rawBarcode.startsWith(prefix) ? rawBarcode : `${prefix}${rawBarcode}`
    const labels = Array.from({ length: copies }, () => ({
      productName: product.name,
      strength: product.strength,
      dosageForm: product.dosageForm,
      barcode,
      sellingPrice: product.sellingPrice,
      batchNumber: product.batchNumber,
      expiryDate: product.expiryDate,
    }))
    printBarcodeLabels(labels)
  }
}
