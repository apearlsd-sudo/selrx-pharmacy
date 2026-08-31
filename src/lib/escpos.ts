/**
 * Minimal ESC/POS byte encoder for thermal receipt printers.
 * ----------------------------------------------------------
 * Implements just the subset of the ESC/POS protocol needed to print
 * pharmacy receipts + return tickets: text alignment, bold/size styles,
 * separator lines, and a final paper cut. No third-party dependency —
 * the bytes are written into a Uint8Array and exposed as base64 so the
 * API route can hand them to a print spooler, a USB driver, or a
 * network printer bridge without further encoding.
 *
 * Limitations: no barcode/QR commands, no image rasterization. Those
 * can be added later if a real printer needs them; for now the goal is
 * to match what the on-screen receipt shows in plain text.
 *
 * Reference: https://escpos.readthedocs.io/
 */

// ---------- low-level byte helpers ----------

function strToBytes(s: string): Uint8Array {
  // ESC/POS printers typically expect CP437 / raw ASCII. The characters
  // we emit (ASCII + a handful of currency symbols + Latin-1 letters)
  // round-trip cleanly through TextEncoder for the byte values that
  // matter. For non-ASCII currency symbols we fall back to the ISO
  // 4217 code (e.g. "GHS") upstream so we never feed the printer a
  // multi-byte UTF-8 sequence it can't render.
  return new TextEncoder().encode(s)
}

function concat(...chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

// Convert Uint8Array → base64 string (works in Node since Buffer supports it)
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

// ---------- ESC/POS command primitives ----------

// ESC @ — initialize printer (cancel any prior mode)
const INIT = new Uint8Array([0x1b, 0x40])

// LF — line feed (print + advance one line)
const LF = new Uint8Array([0x0a])

// ESC ! n — set print mode (bit 3 = bold)
function setBold(on: boolean): Uint8Array {
  return new Uint8Array([0x1b, 0x21, on ? 0x08 : 0x00])
}

// GS ! n — character size. n = 0..7 where (n & 0x0f) is width-1 and
// ((n >> 4) & 0x0f) is height-1. We only use 1x and 2x.
function setDoubleSize(on: boolean): Uint8Array {
  return new Uint8Array([0x1d, 0x21, on ? 0x11 : 0x00])
}

// ESC a n — alignment (0=left, 1=center, 2=right)
type Align = 'left' | 'center' | 'right'
function setAlign(a: Align): Uint8Array {
  const n = a === 'center' ? 1 : a === 'right' ? 2 : 0
  return new Uint8Array([0x1b, 0x61, n])
}

// GS V m — paper cut (m=0 full cut, m=1 partial cut). Use partial cut
// which is safer for printers that don't have a full-cut mechanism.
const CUT = new Uint8Array([0x1d, 0x56, 0x01])

// ---------- high-level helpers ----------

function line(text: string, opts?: { align?: Align; bold?: boolean; double?: boolean }): Uint8Array {
  const chunks: Uint8Array[] = []
  chunks.push(setAlign(opts?.align ?? 'left'))
  if (opts?.bold) chunks.push(setBold(true))
  if (opts?.double) chunks.push(setDoubleSize(true))
  chunks.push(strToBytes(text))
  if (opts?.double) chunks.push(setDoubleSize(false))
  if (opts?.bold) chunks.push(setBold(false))
  chunks.push(LF)
  return concat(...chunks)
}

function emptyLine(): Uint8Array {
  return concat(LF)
}

// A dashed separator that fills the 80mm/58mm paper width. 32 dashes
// fits comfortably on 58mm paper; on 80mm it leaves a small right
// margin which is fine.
function separator(): Uint8Array {
  return line('-'.repeat(32))
}

// Two-column row: "Label ............... Value"
function row(label: string, value: string): Uint8Array {
  // Width-32 column layout. Label left-padded, value right-aligned.
  const width = 32
  const total = label.length + value.length
  if (total >= width) {
    // If it doesn't fit on one line, just print label then value.
    return concat(line(label), line(value, { align: 'right' }))
  }
  const gap = ' '.repeat(width - total)
  return line(`${label}${gap}${value}`)
}

// ---------- public API ----------

export interface PrintPayload {
  /** "receipt" or "return_ticket" — discriminator for the print spooler */
  kind: 'receipt' | 'return_ticket'
  /** Active company record at print time — embedded so the printed
   *  document always shows the real pharmacy name + address + license
   *  even if the company is edited later. */
  company: {
    name: string
    tagline?: string | null
    address?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
    phone?: string | null
    email?: string | null
    pharmacyLicense?: string | null
  } | null
  /** The transaction (for receipts) or the return (for return tickets). */
  data: Record<string, unknown>
  /** Base64-encoded ESC/POS byte stream. A print spooler / USB driver /
   *  network bridge can pipe this straight to the printer. */
  escposBase64: string
  /** ISO timestamp of when the print was generated, for auditing. */
  generatedAt: string
}

/**
 * Build an ESC/POS byte stream + structured payload for a sale receipt.
 * The shape of `tx` mirrors what the receipt-modal already renders, so
 * the printed output matches the on-screen receipt exactly.
 */
export function buildReceiptPayload(input: {
  company: PrintPayload['company']
  tx: {
    transactionNo: string
    createdAt: string | Date
    subtotal: number
    tax: number
    discount: number
    total: number
    paymentMethod: string
    paymentAmount: number
    changeAmount: number
    cashierName: string
    customerName?: string | null
    items: { productName: string; quantity: number; unitPrice: number; subtotal: number }[]
    returns?: {
      returnNo: string
      productName: string
      quantity: number
      unitPrice: number
      refundAmount: number
    }[]
    refundTotal?: number
    netTotal?: number
  }
  formatCurrency: (n: number) => string
  formatDate: (d: string | Date) => string
}): PrintPayload {
  const { company, tx, formatCurrency, formatDate } = input

  const chunks: Uint8Array[] = [INIT]

  // Header — company name centered + double-size, then small lines
  // for tagline / address / phone / license. Each line is conditional.
  chunks.push(line(company?.name || 'SelRx', { align: 'center', bold: true, double: true }))
  if (company?.tagline) chunks.push(line(company.tagline, { align: 'center' }))
  const addrLine = [company?.address, company?.city, company?.state, company?.postalCode, company?.country]
    .filter(Boolean)
    .join(', ')
  if (addrLine) chunks.push(line(addrLine, { align: 'center' }))
  if (company?.phone) chunks.push(line(`Tel: ${company.phone}`, { align: 'center' }))
  if (company?.email) chunks.push(line(company.email, { align: 'center' }))
  if (company?.pharmacyLicense) chunks.push(line(`Lic No: ${company.pharmacyLicense}`, { align: 'center' }))
  chunks.push(emptyLine())
  chunks.push(separator())

  // Transaction meta
  chunks.push(row('Receipt #', tx.transactionNo))
  chunks.push(row('Date', formatDate(tx.createdAt)))
  chunks.push(row('Cashier', tx.cashierName))
  if (tx.customerName) chunks.push(row('Customer', tx.customerName))
  chunks.push(row('Payment', tx.paymentMethod.replace(/_/g, ' ')))
  chunks.push(separator())

  // Items
  chunks.push(line('Items', { bold: true }))
  for (const it of tx.items) {
    chunks.push(line(it.productName))
    chunks.push(row(`  ${it.quantity} x ${formatCurrency(it.unitPrice)}`, formatCurrency(it.subtotal)))
  }
  chunks.push(separator())

  // Totals
  chunks.push(row('Subtotal', formatCurrency(tx.subtotal)))
  chunks.push(row('Tax', formatCurrency(tx.tax)))
  if (tx.discount > 0) chunks.push(row('Discount', `-${formatCurrency(tx.discount)}`))
  chunks.push(row('TOTAL', formatCurrency(tx.total)))

  // Returns / refunds (if any)
  if (tx.returns && tx.returns.length > 0) {
    chunks.push(separator())
    chunks.push(line('Returns', { bold: true }))
    for (const r of tx.returns) {
      chunks.push(line(r.productName))
      chunks.push(row(`  ${r.quantity} x ${formatCurrency(r.unitPrice)} ${r.returnNo}`, `-${formatCurrency(r.refundAmount)}`))
    }
    chunks.push(row('Refund Total', `-${formatCurrency(tx.refundTotal || 0)}`))
    chunks.push(row('NET TOTAL', formatCurrency(tx.netTotal ?? tx.total)))
  }

  chunks.push(row('Amount Paid', formatCurrency(tx.paymentAmount)))
  if (tx.changeAmount > 0) chunks.push(row('Change', formatCurrency(tx.changeAmount)))

  // Footer
  chunks.push(separator())
  chunks.push(line('Thank you for your visit!', { align: 'center' }))
  chunks.push(emptyLine())
  chunks.push(CUT)

  const bytes = concat(...chunks)
  return {
    kind: 'receipt',
    company,
    data: tx as unknown as Record<string, unknown>,
    escposBase64: toBase64(bytes),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Build an ESC/POS byte stream + structured payload for a return ticket.
 * Mirrors the on-screen ReturnTicketModal layout.
 */
export function buildReturnTicketPayload(input: {
  company: PrintPayload['company']
  ret: {
    returnNo: string
    createdAt: string | Date
    status: string
    reason: string
    reasonNote?: string | null
    productName: string
    quantity: number
    unitPrice: number
    refundAmount: number
    refundMethod: string
    restocked: boolean
    transactionNo?: string | null
    customerName?: string | null
    processedByName?: string | null
    approvedByName?: string | null
  }
  formatCurrency: (n: number) => string
  formatDate: (d: string | Date) => string
}): PrintPayload {
  const { company, ret, formatCurrency, formatDate } = input

  const chunks: Uint8Array[] = [INIT]

  // Header — same company block as receipts so the printed ticket
  // visually matches the rest of the pharmacy's printouts.
  chunks.push(line(company?.name || 'SelRx', { align: 'center', bold: true, double: true }))
  if (company?.tagline) chunks.push(line(company.tagline, { align: 'center' }))
  const addrLine = [company?.address, company?.city, company?.state, company?.postalCode, company?.country]
    .filter(Boolean)
    .join(', ')
  if (addrLine) chunks.push(line(addrLine, { align: 'center' }))
  if (company?.phone) chunks.push(line(`Tel: ${company.phone}`, { align: 'center' }))
  if (company?.pharmacyLicense) chunks.push(line(`Lic No: ${company.pharmacyLicense}`, { align: 'center' }))
  chunks.push(emptyLine())
  chunks.push(line('GOODS RETURN TICKET', { align: 'center', bold: true }))
  chunks.push(separator())

  // Return meta
  chunks.push(row('Return #', ret.returnNo))
  chunks.push(row('Date', formatDate(ret.createdAt)))
  chunks.push(row('Status', ret.status.replace(/_/g, ' ')))
  chunks.push(row('Reason', ret.reason.replace(/_/g, ' ')))
  chunks.push(separator())

  // Product
  chunks.push(line('Product Returned', { bold: true }))
  chunks.push(line(ret.productName))
  chunks.push(row('Quantity', String(ret.quantity)))
  chunks.push(row('Unit Price', formatCurrency(ret.unitPrice)))
  chunks.push(separator())

  // Original transaction
  chunks.push(line('Original Transaction', { bold: true }))
  chunks.push(row('Receipt #', ret.transactionNo || 'N/A'))
  if (ret.customerName) chunks.push(row('Customer', ret.customerName))
  chunks.push(separator())

  // Refund
  chunks.push(line('Refund Details', { bold: true }))
  chunks.push(row('Refund Amount', formatCurrency(ret.refundAmount)))
  chunks.push(row('Refund Method', ret.refundMethod.replace(/_/g, ' ')))
  chunks.push(row('Restocked', ret.restocked ? 'Yes' : 'No'))
  if (ret.reasonNote) {
    chunks.push(separator())
    chunks.push(line('Notes', { bold: true }))
    chunks.push(line(ret.reasonNote))
  }
  chunks.push(separator())

  // Staff
  chunks.push(row('Processed By', ret.processedByName || 'Staff'))
  if (ret.approvedByName) chunks.push(row('Approved By', ret.approvedByName))

  // Footer
  chunks.push(separator())
  chunks.push(line(`Thank you for choosing ${company?.name || 'SelRx'}`, { align: 'center' }))
  chunks.push(line('This return ticket serves as proof of goods returned.', { align: 'center' }))
  chunks.push(emptyLine())
  chunks.push(CUT)

  const bytes = concat(...chunks)
  return {
    kind: 'return_ticket',
    company,
    data: ret as unknown as Record<string, unknown>,
    escposBase64: toBase64(bytes),
    generatedAt: new Date().toISOString(),
  }
}
