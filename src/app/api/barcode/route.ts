import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso, sqlRaw } from '@/lib/turso'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

// Code128 barcode pattern encoding
// Using Code Set B (ASCII 32-127)
const CODE128_PATTERNS: Record<string, string> = {
  '212222': ' ', '222122': '!', '222221': '"', '121223': '#', '121322': '$', '131222': '%',
  '122213': '&', '122312': "'", '132212': '(', '221213': ')', '221312': '*', '231212': '+',
  '112232': ',', '122132': '-', '122231': '.', '113222': '/', '123122': '0', '123221': '1',
  '223211': '2', '221132': '3', '221231': '4', '213212': '5', '223112': '6', '312131': '7',
  '311222': '8', '321122': '9', '321221': ':', '312212': ';', '322112': '<', '322211': '=',
  '212123': '>', '212321': '?', '232121': '@', '111323': 'A', '131123': 'B', '131321': 'C',
  '112313': 'D', '132113': 'E', '132311': 'F', '211313': 'G', '231113': 'H', '231311': 'I',
  '112133': 'J', '112331': 'K', '132131': 'L', '113123': 'M', '113321': 'N', '133121': 'O',
  '313121': 'P', '211331': 'Q', '231131': 'R', '213113': 'S', '213311': 'T', '213131': 'U',
  '311123': 'V', '311321': 'W', '331121': 'X', '312113': 'Y', '312311': 'Z', '332111': '[',
  '314111': '\\', '221411': ']', '431111': '^', '111224': '_', '111422': '`', '121124': 'a',
  '121421': 'b', '141122': 'c', '141221': 'd', '112214': 'e', '112412': 'f', '122114': 'g',
  '122411': 'h', '142112': 'i', '142211': 'j', '241211': 'k', '221114': 'l', '413111': 'm',
  '241112': 'n', '134111': 'o', '111242': 'p', '121142': 'q', '121241': 'r', '114212': 's',
  '124112': 't', '124211': 'u', '411212': 'v', '421112': 'w', '421211': 'x', '212141': 'y',
  '214121': 'z', '412121': '{', '111143': '|', '111341': '}', '131141': '~',
}

const CODE128_STOP = '2331112'

/** Extract 2-letter uppercase initials from a company name. */
function extractInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'XX'
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function encodeCode128(data: string): { bars: string; width: number } {
  // Build reverse lookup
  const patternToIdx: string[] = []
  const charToIdx: Map<string, number> = new Map()
  let idx = 0
  for (const [pattern, char] of Object.entries(CODE128_PATTERNS)) {
    patternToIdx[idx] = pattern
    charToIdx.set(char, idx)
    idx++
  }

  // Start code B = 104
  const values: number[] = [104]
  for (const ch of data) {
    const i = charToIdx.get(ch)
    if (i === undefined) continue // skip unsupported chars
    values.push(i)
  }

  // Checksum
  let checksum = values[0]
  for (let i = 1; i < values.length; i++) {
    checksum += i * values[i]
  }
  checksum = checksum % 103
  values.push(checksum)

  // Build bar pattern
  let bars = patternToIdx[104] // start
  for (let i = 1; i < values.length; i++) {
    bars += patternToIdx[values[i]]
  }
  bars += CODE128_STOP

  return { bars, width: bars.length }
}

function generateBarcodeSVG(data: string, width = 200, height = 60): string {
  const { bars } = encodeCode128(data)
  const totalModules = bars.length
  const moduleWidth = width / totalModules
  let x = 0
  let rects = ''
  for (let i = 0; i < bars.length; i++) {
    if (i % 2 === 0) { // bar (even positions)
      const barWidth = moduleWidth * parseInt(bars[i])
      rects += `<rect x="${x.toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${height}" fill="#000"/>`
      x += barWidth
    } else { // space (odd positions)
      x += moduleWidth * parseInt(bars[i])
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rects}</svg>`
}

// POST /api/barcode/generate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, labelData, companyPrefix } = body

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    // Get company prefix (2-letter initials) for barcode prefix
    let prefix = companyPrefix || 'XX'
    if (!companyPrefix) {
      try {
        // Import dynamically to avoid circular deps
        const { turso: t, isTurso: isT } = await import('@/lib/turso')
        if (isT()) {
          const comp = await t.execute(`SELECT "name" FROM "Company" WHERE "active" = 1 LIMIT 1`)
          if (comp.rows.length > 0) {
            const name = comp.rows[0].name as string
            prefix = extractInitials(name)
          }
        } else {
          const { db } = await import('@/lib/db')
          const company = await db.company.findFirst({ where: { active: true }, select: { name: true } })
          if (company) prefix = extractInitials(company.name)
        }
      } catch {
        // fallback to XX
      }
    }

    let productData: {
      name: string; strength: string | null; dosageForm: string | null;
      barcode: string | null; sellingPrice: number; batchNumber: string | null;
      expiryDate: string | null;
    }

    if (labelData) {
      productData = {
        name: labelData.productName,
        strength: labelData.strength || null,
        dosageForm: labelData.dosageForm || null,
        barcode: null,
        sellingPrice: labelData.sellingPrice || 0,
        batchNumber: labelData.batchNumber || null,
        expiryDate: labelData.expiryDate || null,
      }
    } else {
      // Fetch from DB
      if (isTurso()) {
        const result = await turso.execute(sqlRaw(
          `SELECT name, strength, "dosageForm", barcode, "sellingPrice", "batchNumber", "expiryDate" FROM "Product" WHERE id = ? AND status = 'ACTIVE'`,
          [productId]
        ))
        if (result.rows.length === 0) {
          return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }
        const row = result.rows[0]
        productData = {
          name: row.name as string,
          strength: row.strength as string | null,
          dosageForm: row.dosageForm as string | null,
          barcode: row.barcode as string | null,
          sellingPrice: Number(row.sellingPrice),
          batchNumber: row.batchNumber as string | null,
          expiryDate: row.expiryDate as string | null,
        }
      } else {
        const { db } = await import('@/lib/db')
        const product = await db.product.findUnique({
          where: { id: productId, status: 'ACTIVE' },
          select: { name: true, strength: true, dosageForm: true, barcode: true, sellingPrice: true, batchNumber: true, expiryDate: true },
        })
        if (!product) {
          return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }
        productData = product
      }
    }

    // Generate barcode: use existing barcode, or build one with company prefix
    let barcodeValue: string
    if (productData.barcode && productData.barcode.length > 0) {
      barcodeValue = productData.barcode
    } else {
      // Build: PREFIX + short product ID digits
      const suffix = productId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
      barcodeValue = `${prefix}${suffix}`
    }

    const svgBarcode = generateBarcodeSVG(barcodeValue)

    const { userId, ipAddress, userAgent } = getRequestContext(request)
    await writeAuditLog({
      userId, action: 'LABEL_GENERATED', category: 'general',
      entity: 'Product', entityId: productId,
      details: { productName: productData.name },
      ipAddress, userAgent,
    }).catch(() => {})

    return NextResponse.json({
      label: {
        productName: productData.name,
        strength: productData.strength,
        dosageForm: productData.dosageForm,
        barcode: barcodeValue,
        sellingPrice: productData.sellingPrice,
        batchNumber: productData.batchNumber,
        expiryDate: productData.expiryDate,
      },
      svgBarcode,
    })
  } catch (error) {
    console.error('Error generating barcode:', error)
    return NextResponse.json({ error: 'Failed to generate barcode' }, { status: 500 })
  }
}
