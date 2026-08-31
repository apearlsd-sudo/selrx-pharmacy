const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const product = await db.product.findFirst({ select: { id: true, name: true, sellingPrice: true } })
  const user = await db.user.findFirst({ select: { id: true, role: true } })

  console.log('--- Step 1: Create a sale of 4 units ---')
  const saleRes = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      items: [{
        productId: product.id, productName: product.name,
        quantity: 4, unitPrice: product.sellingPrice, subtotal: product.sellingPrice * 4,
      }],
      paymentMethod: 'CASH', subtotal: product.sellingPrice * 4,
      tax: 0, discount: 0, total: product.sellingPrice * 4,
      paymentAmount: product.sellingPrice * 4,
    }),
  })
  const sale = await saleRes.json()
  console.log('Sale created:', sale.transactionNo, 'total =', sale.total, '(expected', product.sellingPrice * 4 + ')')
  console.log('Sale response includes returns array?', Array.isArray(sale.returns), 'len:', sale.returns?.length)
  console.log('Sale response includes refundTotal?', 'refundTotal' in sale, '=', sale.refundTotal)

  // Find the TransactionItem we just created (for the return)
  const txnItem = await db.transactionItem.findFirst({
    where: { transactionId: sale.id },
    orderBy: { createdAt: 'desc' },
  })

  console.log('')
  console.log('--- Step 2: Create a return for 1 unit ---')
  const returnCreateRes = await fetch('http://localhost:3000/api/returns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      transactionId: sale.id,
      transactionItemId: txnItem.id,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.sellingPrice,
      refundAmount: product.sellingPrice,
      reason: 'EXPIRED',
      reasonNote: 'Customer returned 1 expired unit',
      userId: user.id,
    }),
  })
  const returnCreated = await returnCreateRes.json()
  console.log('Return created:', returnCreated.return?.returnNo || returnCreated.returnNo, 'status:', returnCreated.return?.status || returnCreated.status)
  const returnId = returnCreated.return?.id || returnCreated.id

  console.log('')
  console.log('--- Step 3: Approve the return ---')
  await fetch(`http://localhost:3000/api/returns/${returnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({ action: 'approve', approvedById: user.id }),
  })
  console.log('Approved.')

  console.log('')
  console.log('--- Step 4: Complete the return (restocks inventory + processes refund) ---')
  const completeRes = await fetch(`http://localhost:3000/api/returns/${returnId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({ action: 'complete', refundMethod: 'CASH' }),
  })
  const completed = await completeRes.json()
  console.log('Completed. Return status:', completed.return?.status)

  console.log('')
  console.log('--- Step 5: Fetch the transaction and check receipt data ---')
  const fetchRes = await fetch(`http://localhost:3000/api/transactions/${sale.id}`)
  const fetched = await fetchRes.json()
  console.log('Original total:', fetched.total)
  console.log('Returns included?', Array.isArray(fetched.returns), 'len:', fetched.returns?.length)
  console.log('First return:', fetched.returns?.[0])
  console.log('Computed refundTotal:', fetched.refundTotal, '(expected', product.sellingPrice + ')')
  console.log('Computed netTotal:', fetched.netTotal, '(expected', product.sellingPrice * 3 + ')')

  if (fetched.refundTotal === product.sellingPrice && fetched.netTotal === product.sellingPrice * 3) {
    console.log('')
    console.log('SUCCESS: Receipt data now reflects the return. Original total =', fetched.total, ', refund =', fetched.refundTotal, ', net =', fetched.netTotal)
  } else {
    console.log('')
    console.log('FAILURE: Numbers do not match expected values.')
  }
}

main().catch(console.error).finally(() => db.$disconnect())
