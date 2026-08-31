const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const product = await db.product.findFirst({ select: { id: true, name: true } })
  console.log('Testing Adjust Stock WITHOUT x-user-role header (mimicking the UI):')

  const before = await db.inventory.findUnique({ where: { productId: product.id }, select: { quantity: true } })
  console.log('Before:', before.quantity)

  const res = await fetch('http://localhost:3000/api/inventory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },  // <-- NO x-user-role, exactly like the UI
    body: JSON.stringify({
      productId: product.id,
      adjustment: 50,
      reason: 'Test without role header',
    }),
  })
  console.log('Status:', res.status, res.ok ? '(success)' : '(FAILED)')
  console.log('Body:', await res.text())

  const after = await db.inventory.findUnique({ where: { productId: product.id }, select: { quantity: true } })
  console.log('After:', after.quantity, '(should be 145 = 95 + 50 if it worked)')
}

main().catch(console.error).finally(() => db.$disconnect())
