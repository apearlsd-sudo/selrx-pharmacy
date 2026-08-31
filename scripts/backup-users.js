const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany()
  fs.writeFileSync('/home/z/my-project/scripts/users-backup.json', JSON.stringify(users, null, 2))
  console.log(`Backed up ${users.length} users to scripts/users-backup.json`)
  console.log(JSON.stringify(users.map(u => ({ email: u.email, role: u.role })), null, 2))
}
main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1) })
