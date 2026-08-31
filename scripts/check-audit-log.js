const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const logs = await db.auditLog.findMany({
    where: { action: 'USER_SIGN_OUT' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { user: { select: { name: true, email: true } } },
  })
  console.log('Recent USER_SIGN_OUT audit logs:')
  console.log(JSON.stringify(logs, null, 2))
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1) })
