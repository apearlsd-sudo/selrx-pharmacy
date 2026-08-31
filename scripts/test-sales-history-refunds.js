const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // First, create a sale and a return so we have real data to test
  const product = await db.product.findFirst({ select: { id: true, name: true, sellingPrice: true } })
  const user = await db.user.findFirst({ select: { id: true, name: true, role: true } })

  console.log('--- Creating a sale of 3 units ---')
  const saleRes = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      items: [{
        productId: product.id, productName: product.name,
        quantity: 3, unitPrice: product.sellingPrice, subtotal: product.sellingPrice * 3,
      }],
      paymentMethod: 'CASH', subtotal: product.sellingPrice * 3,
      tax: 0, discount: 0, total: product.sellingPrice * 3,
      paymentAmount: product.sellingPrice * 3,
    }),
  })
  const sale = await saleRes.json()
  console.log('Sale created:', sale.transactionNo, 'total:', sale.total)

  const txnItem = await db.transactionItem.findFirst({
    where: { transactionId: sale.id },
    orderBy: { createdAt: 'desc' },
  })

  console.log('--- Creating + approving + completing a return for 2 units ---')
  const returnCreateRes = await fetch('http://localhost:3000/api/returns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      transactionId: sale.id,
      transactionItemId: txnItem.id,
      productId: product.id,
      productName: product.name,
      quantity: 2,
      unitPrice: product.sellingPrice,
      refundAmount: product.sellingPrice * 2,
      reason: 'EXPIRED',
      reasonNote: 'Test refund for sales-history verification',
      userId: user.id,
    }),
  })
  const returnCreated = await returnCreateRes.json()
  const returnId = returnCreated.return?.id || returnCreated.id

  await fetch(`http://localhost:3000/api/returns/${returnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({ action: 'approve', approvedById: user.id }),
  })

  await fetch(`http://localhost:3000/api/returns/${returnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({ action: 'complete', refundMethod: 'CASH' }),
  })

  console.log('--- Fetching sales history ---')
  const res = await fetch('http://localhost:3000/api/sales-history')
  const data = await res.json()

  console.log('')
  console.log('=== SUMMARY ===')
  console.log('totalSales (gross):', data.summary.totalSales)
  console.log('totalRefunds:', data.summary.totalRefunds)
  console.log('netSales:', data.summary.netSales)
  console.log('totalTransactions:', data.summary.totalTransactions)

  console.log('')
  console.log('=== SALES BY USER ===')
  for (const u of data.salesByUser) {
    console.log(
      `${u.userName.padEnd(20)} | txns=${u.transactionCount} | ` +
      `gross=${u.totalSales} | refunds=${u.totalRefunds} | ` +
      `net=${u.netSales} | returns=${u.returnCount}`
    )
  }

  // Verify the math
  const user1 = data.salesByUser[0]
  const expectedNet = user1.totalSales - user1.totalRefunds
  if (Math.abs(user1.netSales - expectedNet) < 0.001) {
    console.log('')
    console.log('SUCCESS: netSales = totalSales - totalRefunds ✓')
  } else {
    console.log('')
    console.log('FAILURE: netSales does not match expected')
  }

  console.log('Summary netSales matches sum of user netSales:',
    Math.abs(data.summary.netSales - data.salesByUser.reduce((s, u) => s + u.netSales, 0)) < 0.001
  )
}

main().catch(console.error).finally(() => db.$disconnect())
