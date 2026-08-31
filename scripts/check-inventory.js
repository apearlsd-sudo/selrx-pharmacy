const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  const products = await db.product.findMany({
    select: {
      id: true,
      name: true,
      reorderPoint: true,
      sellingPrice: true,
      status: true,
      inventory: { select: { quantity: true, lastCounted: true } },
    },
    take: 30,
  })

  console.log('=== INVENTORY STATE ===')
  console.log('Total products:', await db.product.count())
  console.log('Total inventory records:', await db.inventory.count())
  console.log('')

  for (const p of products) {
    const qty = p.inventory?.[0]?.quantity
    const hasInv = p.inventory.length > 0
    console.log(
      `${p.name.padEnd(35)} qty=${qty} (type: ${typeof qty}) | hasInvRecord=${hasInv} | reorder=${p.reorderPoint} | status=${p.status}`
    )
  }
}

main().catch(console.error).finally(() => db.$disconnect())
