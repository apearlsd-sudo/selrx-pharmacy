/**
 * Test: Create stock take, save counts, complete, generate report
 */
const BASE = process.env.BASE || 'http://127.0.0.1:3099'

async function main() {
  // 1) Get the existing stock take
  const takesRes = await fetch(`${BASE}/api/stock-take`)
  const takes = await takesRes.json()
  if (!takes.length) {
    console.log('No stock takes found, creating one...')
    const createRes = await fetch(`${BASE}/api/stock-take`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
      body: JSON.stringify({ notes: 'Test stock take' }),
    })
    const created = await createRes.json()
    takes.push(created)
  }
  const stockTakeId = takes[0].id
  console.log(`\nUsing stock take: ${stockTakeId} (${takes[0].reference}) - ${takes[0].status}`)

  // 2) Get inventory
  const invRes = await fetch(`${BASE}/api/inventory`)
  const inv = await invRes.json()
  console.log(`Inventory items: ${inv.length}`)

  // 3) Save counts (set counted = system for all, no variance)
  const items = inv.map((i) => ({
    productId: i.productId,
    systemQty: i.quantity,
    countedQty: i.quantity,
    notes: null,
  }))
  const saveRes = await fetch(`${BASE}/api/stock-take/${stockTakeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
    body: JSON.stringify({ action: 'update-item', items }),
  })
  console.log(`Save counts: ${saveRes.status} ${saveRes.ok ? 'OK' : 'FAILED'}`)
  const saveData = await saveRes.json()
  console.log(`Save response:`, saveData)

  // 4) Complete the stock take
  const completeRes = await fetch(`${BASE}/api/stock-take/${stockTakeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
    body: JSON.stringify({ action: 'complete' }),
  })
  console.log(`\nComplete: ${completeRes.status} ${completeRes.ok ? 'OK' : 'FAILED'}`)
  const completeData = await completeRes.json()
  console.log(`Complete response keys:`, Object.keys(completeData))
  console.log(`_meta:`, completeData._meta)
  console.log(`_report keys:`, completeData._report ? Object.keys(completeData._report) : 'null')

  // 5) Generate the full report (this is what the report view calls)
  const reportRes = await fetch(`${BASE}/api/stock-take?action=report&id=${stockTakeId}`, {
    headers: { 'x-user-role': 'SUPER_ADMIN' },
  })
  console.log(`\nReport: ${reportRes.status} ${reportRes.ok ? 'OK' : 'FAILED'}`)
  const report = await reportRes.json()
  if (report.error) {
    console.error(`Report error:`, report.error)
    process.exit(1)
  }
  console.log(`Report top-level keys:`, Object.keys(report))
  console.log(`stockTakeRef:`, report.stockTakeRef)
  console.log(`totalItemsChecked:`, report.totalItemsChecked)
  console.log(`inventoryValuation:`, report.inventoryValuation)
  console.log(`expiredGoods.count:`, report.expiredGoods?.count)
  console.log(`nearExpiryGoods.count:`, report.nearExpiryGoods?.count)
  console.log(`stockVariance.totalVarianceItems:`, report.stockVariance?.totalVarianceItems)
  console.log(`reorderAlerts.count:`, report.reorderAlerts?.count)

  // Check if all expected fields exist (the UI component reads these)
  const requiredFields = [
    'generatedAt', 'stockTakeRef', 'stockTakeId', 'completedAt', 'countedBy',
    'startedAt', 'notes', 'totalItemsChecked', 'itemsWithZeroCount', 'itemsMatched',
    'inventoryValuation', 'expiredGoods', 'nearExpiryGoods', 'stockVariance', 'reorderAlerts',
  ]
  const missing = requiredFields.filter((f) => !(f in report))
  if (missing.length) {
    console.error(`\n!!! MISSING FIELDS in report:`, missing)
    process.exit(1)
  }

  // Check nested structures
  const checkNested = (obj, path, fields) => {
    const missing = fields.filter((f) => !(f in obj))
    if (missing.length) console.error(`!!! MISSING in ${path}:`, missing)
  }
  checkNested(report.inventoryValuation, 'inventoryValuation', ['totalItems', 'totalCostValue', 'totalRetailValue', 'potentialProfit', 'profitMargin'])
  checkNested(report.expiredGoods, 'expiredGoods', ['count', 'totalCost', 'totalPotentialRevenue', 'items'])
  checkNested(report.nearExpiryGoods, 'nearExpiryGoods', ['count', 'totalCost', 'totalPotentialRevenue', 'items'])
  checkNested(report.stockVariance, 'stockVariance', ['totalVarianceItems', 'shortageCount', 'shortageTotalCost', 'surplusCount', 'surplusTotalCost', 'netVarianceCost', 'items'])
  checkNested(report.reorderAlerts, 'reorderAlerts', ['count', 'totalReorderCost', 'items'])

  console.log('\n=== Report validation PASSED ===')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
