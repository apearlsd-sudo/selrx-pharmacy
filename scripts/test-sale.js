const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const product = await db.product.findFirst({ select: { id: true, name: true, sellingPrice: true } })
  const user = await db.user.findFirst({ select: { id: true, name: true, role: true } })
  if (!product || !user) { console.log('Missing product/user'); return }

  console.log('Testing sale of 5 units of', product.name, 'at $' + product.sellingPrice)

  const res = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      items: [{
        productId: product.id,
        productName: product.name,
        quantity: 5,
        unitPrice: product.sellingPrice,
        subtotal: product.sellingPrice * 5,
      }],
      subtotal: product.sellingPrice * 5,
      tax: 0,
      discount: 0,
      total: product.sellingPrice * 5,
      paymentMethod: 'CASH',
      paymentAmount: product.sellingPrice * 5,
      userId: user.id,
    }),
  })
  console.log('POST /api/transactions status:', res.status)
  const data = await res.json()
  if (res.ok) {
    console.log('Sale succeeded! TransactionNo:', data.transactionNo, 'Total:', data.total)
  } else {
    console.log('Sale failed:', data.error)
  }

  const after = await db.inventory.findUnique({
    where: { productId: product.id },
    select: { quantity: true },
  })
  console.log('Stock after sale:', after.quantity, '(should be 95 = 100 - 5)')
}

main().catch(console.error).finally(() => db.$disconnect())
