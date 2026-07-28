/**
 * Test: Import an actual .xlsx file (not CSV)
 */
const BASE = 'http://localhost:3000'

async function testExcelImport() {
  console.log('\n=== TEST: Import .xlsx File ===')
  
  // Create a simple xlsx buffer manually using the xlsx library
  // We'll create a CSV that mimics xlsx content and save as xlsx
  const XLSX = require('xlsx')
  
  const data = [
    { 'Name': 'Excel Test Product 1', 'NDC': 'XLSX-0001', 'Category': 'OTC', 'Selling Price': 7.99, 'Cost Price': 4.00, 'Quantity': 30 },
    { 'Name': 'Excel Test Product 2', 'NDC': 'XLSX-0002', 'Category': 'PRESCRIPTION', 'Dosage Form': 'TABLET', 'Strength': '250mg', 'Selling Price': 15.50, 'Quantity': 10 },
    { 'Name': 'Excel Test Product 3', 'NDC': 'XLSX-0003', 'Category': 'SUPPLEMENT', 'Selling Price': 22.00, 'Cost Price': 12.00, 'Quantity': 50, 'Requires Prescription': 'no' },
  ]
  
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Products')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const formData = new FormData()
  formData.append('file', blob, 'test-import.xlsx')
  
  const res = await fetch(`${BASE}/api/products/import`, {
    method: 'POST',
    body: formData,
    headers: { 'x-user-role': 'SUPER_ADMIN' },
  })
  
  const result = await res.json()
  console.log(`  Status: ${res.status}`)
  console.log(`  Success: ${result.success}`)
  console.log(`  Total Rows: ${result.totalRows}`)
  console.log(`  Created: ${result.created}`)
  console.log(`  Failed: ${result.failed}`)
  console.log(`  Skipped: ${result.skipped}`)
  
  if (result.createdProducts?.length) {
    console.log(`  Created Products:`)
    for (const p of result.createdProducts) {
      console.log(`    - ${p.name} (NDC: ${p.ndc})`)
    }
  }
  if (result.validationErrors?.length) {
    console.log(`  Validation Errors:`)
    for (const err of result.validationErrors) {
      console.log(`    Row ${err.row} (${err.name}): ${err.errors.join(', ')}`)
    }
  }
  
  if (result.created === 3) {
    console.log('  PASS: Excel import created all 3 products')
  } else {
    console.error(`  FAIL: Expected 3 products, got ${result.created}`)
  }
}

testExcelImport().catch(console.error)
