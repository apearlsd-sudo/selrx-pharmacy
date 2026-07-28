/**
 * Test script: Product Import API
 * Tests both GET (template download) and POST (import) endpoints
 */
const BASE = 'http://localhost:3000'

async function testTemplateDownload() {
  console.log('\n=== TEST 1: Download Import Template ===')
  try {
    const res = await fetch(`${BASE}/api/products/import`)
    if (!res.ok) {
      console.error(`  FAIL: Status ${res.status}`)
      const body = await res.text()
      console.error(`  Response: ${body}`)
      return false
    }
    const contentType = res.headers.get('content-type')
    const contentLength = res.headers.get('content-length')
    const contentDisp = res.headers.get('content-disposition')
    console.log(`  Status: ${res.status}`)
    console.log(`  Content-Type: ${contentType}`)
    console.log(`  Content-Length: ${contentLength} bytes`)
    console.log(`  Content-Disposition: ${contentDisp}`)
    
    if (!contentType?.includes('spreadsheetml')) {
      console.error(`  FAIL: Expected spreadsheet content type, got ${contentType}`)
      return false
    }
    console.log('  PASS: Template downloaded successfully')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

async function testImportEmpty() {
  console.log('\n=== TEST 2: Import with No File ===')
  try {
    const res = await fetch(`${BASE}/api/products/import`, {
      method: 'POST',
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Response: ${JSON.stringify(data)}`)
    
    if (res.status !== 400 || !data.error?.includes('No file')) {
      console.error('  FAIL: Expected 400 with "No file" error')
      return false
    }
    console.log('  PASS: Correctly rejects missing file')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

async function testImportInvalidType() {
  console.log('\n=== TEST 3: Import with Invalid File Type ===')
  try {
    const formData = new FormData()
    formData.append('file', new File(['hello world'], 'test.txt', { type: 'text/plain' }))
    
    const res = await fetch(`${BASE}/api/products/import`, {
      method: 'POST',
      body: formData,
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Response: ${JSON.stringify(data)}`)
    
    if (res.status !== 400 || !data.error?.includes('Invalid file type')) {
      console.error('  FAIL: Expected 400 with "Invalid file type" error')
      return false
    }
    console.log('  PASS: Correctly rejects invalid file type')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

async function testImportCSV() {
  console.log('\n=== TEST 4: Import Valid CSV ===')
  try {
    const csv = `Name *,NDC,Category,Selling Price *,Cost Price,Quantity
Amoxicillin 500mg Test,99999-0001-01,PRESCRIPTION,12.99,8.50,25
Ibuprofen 200mg Test,99999-0002-02,OTC,5.99,2.50,50
Aspirin 300mg Test,99999-0003-03,OTC,3.49,,100
Invalid Price Product,,OTC,abc,,0
Missing Name,,,,5.00,,0`

    const formData = new FormData()
    formData.append('file', new File([csv], 'test-products.csv', { type: 'text/csv' }))
    
    const res = await fetch(`${BASE}/api/products/import`, {
      method: 'POST',
      body: formData,
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Success: ${data.success}`)
    console.log(`  Total Rows: ${data.totalRows}`)
    console.log(`  Created: ${data.created}`)
    console.log(`  Failed: ${data.failed}`)
    console.log(`  Skipped: ${data.skipped}`)
    if (data.validationErrors?.length) {
      console.log(`  Validation Errors:`)
      for (const err of data.validationErrors) {
        console.log(`    Row ${err.row}: ${err.errors.join(', ')}`)
      }
    }
    if (data.createdProducts?.length) {
      console.log(`  Created Products:`)
      for (const p of data.createdProducts) {
        console.log(`    - ${p.name} (NDC: ${p.ndc})`)
      }
    }
    
    if (data.created < 3) {
      console.error('  FAIL: Expected at least 3 products created')
      return false
    }
    console.log('  PASS: Valid CSV imported correctly')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

async function testImportRBAC() {
  console.log('\n=== TEST 5: Import with CLERK Role (should fail) ===')
  try {
    const csv = `Name *,Selling Price *
RBAC Test Product,9.99`
    const formData = new FormData()
    formData.append('file', new File([csv], 'test-rbac.csv', { type: 'text/csv' }))
    
    const res = await fetch(`${BASE}/api/products/import`, {
      method: 'POST',
      body: formData,
      headers: { 'x-user-role': 'CLERK' },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Response: ${JSON.stringify(data)}`)
    
    if (res.status !== 403) {
      console.error('  FAIL: Expected 403 Forbidden')
      return false
    }
    console.log('  PASS: CLERK correctly denied import access')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

async function testImportDuplicateNDC() {
  console.log('\n=== TEST 6: Import Duplicate NDC (should fail for duplicate) ===')
  try {
    const csv = `Name *,NDC,Selling Price *
Duplicate NDC Test,99999-0001-01,15.99`
    const formData = new FormData()
    formData.append('file', new File([csv], 'test-duplicate.csv', { type: 'text/csv' }))
    
    const res = await fetch(`${BASE}/api/products/import`, {
      method: 'POST',
      body: formData,
      headers: { 'x-user-role': 'SUPER_ADMIN' },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Created: ${data.created}`)
    console.log(`  Failed: ${data.failed}`)
    if (data.validationErrors?.length) {
      console.log(`  Validation Errors:`)
      for (const err of data.validationErrors) {
        console.log(`    Row ${err.row} (${err.name}): ${err.errors.join(', ')}`)
      }
    }
    
    if (data.failed !== 1) {
      console.error('  FAIL: Expected 1 failure for duplicate NDC')
      return false
    }
    console.log('  PASS: Duplicate NDC correctly rejected')
    return true
  } catch (err) {
    console.error(`  FAIL: ${err.message}`)
    return false
  }
}

// Run all tests
async function main() {
  console.log('Starting Product Import API Tests...')
  console.log(`Base URL: ${BASE}`)
  
  let passed = 0
  let total = 0
  
  total++; if (await testTemplateDownload()) passed++
  total++; if (await testImportEmpty()) passed++
  total++; if (await testImportInvalidType()) passed++
  total++; if (await testImportRBAC()) passed++
  total++; if (await testImportCSV()) passed++
  total++; if (await testImportDuplicateNDC()) passed++
  
  console.log(`\n=== RESULTS: ${passed}/${total} tests passed ===`)
  if (passed === total) {
    console.log('All tests passed!')
  } else {
    console.log(`${total - passed} test(s) failed.`)
  }
}

main().catch(console.error)
