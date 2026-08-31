const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const product = await db.product.findFirst({ select: { id: true, name: true, sellingPrice: true } })
  const user = await db.user.findFirst({ select: { id: true, role: true } })
  const before = await db.inventory.findUnique({ where: { productId: product.id }, select: { quantity: true } })
  console.log('Before sale: stock =', before.quantity)

  const res = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role },
    body: JSON.stringify({
      items: [{ productId: product.id, productName: product.name, quantity: 2, unitPrice: product.sellingPrice, subtotal: product.sellingPrice * 2 }],
      paymentMethod: 'CASH', subtotal: product.sellingPrice * 2, tax: 0, discount: 0, total: product.sellingPrice * 2, paymentAmount: product.sellingPrice * 2,
    }),
  })
  console.log('Status:', res.status, res.ok ? '(success)' : '(FAILED)')
  const data = await res.json()
  if (res.ok) {
    console.log('TransactionNo:', data.transactionNo, 'Total:', data.total)
  } else {
    console.log('Error:', data.error)
  }

  const after = await db.inventory.findUnique({ where: { productId: product.id }, select: { quantity: true } })
  console.log('After sale: stock =', after.quantity, '(should be', before.quantity - 2, ')')
}
main().catch(console.error).finally(() => db.$disconnect())
