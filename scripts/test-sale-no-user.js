const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const product = await db.product.findFirst({ select: { id: true, name: true, sellingPrice: true } })
  const res = await fetch('http://localhost:3000/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // NO x-user-id
    body: JSON.stringify({
      items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: product.sellingPrice, subtotal: product.sellingPrice }],
      paymentMethod: 'CASH', subtotal: product.sellingPrice, tax: 0, discount: 0, total: product.sellingPrice, paymentAmount: product.sellingPrice,
    }),
  })
  console.log('Status:', res.status, '(expected 401)')
  console.log('Body:', await res.text())
}
main().catch(console.error).finally(() => db.$disconnect())
