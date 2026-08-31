const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const product = await db.product.findFirst({
    select: { id: true, name: true, inventory: { select: { quantity: true } } },
  })
  if (!product) { console.log('No product found'); return }
  console.log('Before:', product.name, 'qty=', product.inventory?.[0]?.quantity)

  // Simulate the PUT /api/inventory call that the Adjust Stock dialog makes
  const res = await fetch('http://localhost:3000/api/inventory', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-user-role': 'SUPER_ADMIN' },
    body: JSON.stringify({
      productId: product.id,
      adjustment: 100,
      reason: 'Test restock via API',
    }),
  })
  console.log('PUT /api/inventory status:', res.status)
  if (!res.ok) {
    console.log('Error body:', await res.text())
    return
  }
  const data = await res.json()
  console.log('Response:', JSON.stringify(data, null, 2).slice(0, 500))

  const after = await db.product.findUnique({
    where: { id: product.id },
    select: { inventory: { select: { quantity: true } } },
  })
  console.log('After: qty=', after.inventory?.[0]?.quantity)
}

main().catch(console.error).finally(() => db.$disconnect())
