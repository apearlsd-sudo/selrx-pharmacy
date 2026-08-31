const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true, role: true } })
  console.log('=== USERS IN DB ===')
  for (const u of users) console.log(u.id, '|', u.name, '|', u.email, '|', u.role)
  console.log('Total users:', users.length)

  const txnCount = await db.transaction.count()
  console.log('Existing transactions:', txnCount)
}
main().catch(console.error).finally(() => db.$disconnect())
