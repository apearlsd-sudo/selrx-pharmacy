/**
 * src/lib/pdf-export.ts
 *
 * Client-side PDF export utility using the browser's built-in
 * print-to-PDF capability. Generates clean, formatted PDF reports
 * by creating a temporary HTML document and triggering window.print().
 *
 * No external PDF library needed — uses the browser's native
 * print dialog which supports "Save as PDF" on all modern browsers.
 */

import { formatCurrency } from './currency'
import { formatDateTime } from './date-utils'

export interface PDFExportOptions {
  title: string
  subtitle?: string
  companyName?: string
  companyAddress?: string
  companyPhone?: string
  companyEmail?: string
  dateRange?: string
  columns: PDFColumn[]
  rows: Record<string, unknown>[]
  summary?: { label: string; value: string | number }[]
  footerText?: string
}

export interface PDFColumn {
  header: string
  accessor: string | ((row: any) => string)
  width?: string  // CSS width, e.g. '120px', '25%'
  align?: 'left' | 'center' | 'right'
}

/**
 * Export data as a downloadable PDF by opening a print-optimized window.
 */
export function exportToPDF(options: PDFExportOptions): void {
  const { title, subtitle, columns, rows, summary, footerText } = options

  const companyLines = [
    options.companyName || '',
    options.companyAddress || '',
    [options.companyPhone, options.companyEmail].filter(Boolean).join(' | '),
  ].filter(Boolean)

  const colHeaders = columns.map(c => c.header).join('</th><th>')
  const colWidths = columns.map(c => `width: ${c.width || 'auto'};`).join('')
  const colAligns = columns.map(c => `text-align: ${c.align || 'left'};`).join('')

  const bodyRows = rows.map(row => {
    const cells = columns.map(col => {
      let value: string
      if (typeof col.accessor === 'function') {
        value = col.accessor(row)
      } else {
        const raw = row[col.accessor]
        value = raw == null ? '' : String(raw)
      }
      return `<td>${escapeHtml(value)}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const summaryRows = summary ? summary.map(s =>
    `<tr><td colspan="${columns.length}" style="text-align:right; font-weight:600; padding:4px 12px; border-top:2px solid #333;">${escapeHtml(s.label)}: ${escapeHtml(String(s.value))}</td></tr>`
  ).join('') : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 15mm; size: A4 landscape; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
    .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #059669; padding-bottom: 12px; }
    .header h1 { font-size: 18px; color: #059669; margin-bottom: 4px; }
    .header .subtitle { font-size: 12px; color: #666; }
    .header .company { font-size: 11px; color: #444; margin-top: 4px; }
    .date-range { font-size: 10px; color: #888; text-align: center; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead th { background: #f0fdf4; color: #065f46; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #059669; ${colAligns} white-space: nowrap; }
    tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; ${colAligns} }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .summary td { font-size: 12px; }
    .footer { margin-top: 16px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${companyLines.length ? `<div class="company">${companyLines.map(escapeHtml).join('<br>')}</div>` : ''}
  </div>
  ${options.dateRange ? `<p class="date-range">${escapeHtml(options.dateRange)}</p>` : ''}
  <table>
    <thead><tr>${colHeaders}</tr></thead>
    <tbody>${bodyRows}${summaryRows}</tbody>
  </table>
  ${footerText ? `<div class="footer">${escapeHtml(footerText)}</div>` : ''}
  <div class="footer no-print">
    <p>Generated on ${new Date().toLocaleString()} | ${escapeHtml(options.companyName || 'SelRx Pharmacy')}</p>
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=1024,height=700')
  if (!printWindow) {
    throw new Error('Pop-up blocked. Please allow pop-ups to export PDF.')
  }
  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for content to render, then open print dialog
  printWindow.onload = () => {
    setTimeout(() => printWindow.print(), 300)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}