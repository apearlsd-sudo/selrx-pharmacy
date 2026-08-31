const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true, name: true, role: true, permissions: true, active: true } })
  console.log('Users:', JSON.stringify(users, null, 2))
  const txCount = await db.transaction.count()
  const returnCount = await db.return.count()
  console.log(`Transactions: ${txCount}, Returns: ${returnCount}`)
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1) })
