const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { email: true, password: true, name: true, role: true } })
  console.log(users)
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1) })
