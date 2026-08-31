// Quick verification: pull a real transactionId from the DB and exercise
// both the sale-receipt and return-ticket paths against the running
// server. Run once after restarting the server to confirm wiring.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  const tx = await db.transaction.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, transactionNo: true, total: true },
  })
  const ret = await db.return.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, returnNo: true },
  })

  console.log('--- DB probe ---')
  console.log('Latest transaction:', tx)
  console.log('Latest return:    ', ret)

  if (tx) {
    console.log('\n--- POST /api/hardware?action=receipt (sale receipt) ---')
    const r = await fetch('http://localhost:3000/api/hardware?action=receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: tx.id, hardwareType: 'receipt_printer' }),
    })
    const j = await r.json()
    console.log('HTTP', r.status)
    console.log('message:', j.message)
    console.log('hardwareLog.id:', j.hardwareLog?.id)
    console.log('printPayload.kind:', j.printPayload?.kind)
    console.log('printPayload.company.name:', j.printPayload?.company?.name ?? '<null — no company set up>')
    console.log('printPayload.escposBase64.length:', j.printPayload?.escposBase64?.length, 'chars')
    console.log('printPayload.generatedAt:', j.printPayload?.generatedAt)
    // Decode the ESC/POS bytes back to a readable form so we can eyeball
    // what the printer would actually output. (Drops the ESC/GS control
    // bytes so the printed text shows up as plain ASCII.)
    if (j.printPayload?.escposBase64) {
      const raw = Buffer.from(j.printPayload.escposBase64, 'base64').toString('latin1')
      const printable = raw.replace(/[\x00-\x1f]/g, '').replace(/\x7f/g, '')
      console.log('\n--- printable preview (control bytes stripped) ---')
      console.log(printable)
    }
  }

  if (ret) {
    console.log('\n--- POST /api/hardware (return ticket) ---')
    const r = await fetch('http://localhost:3000/api/hardware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'receipt', type: 'return_ticket', returnId: ret.id }),
    })
    const j = await r.json()
    console.log('HTTP', r.status)
    console.log('message:', j.message)
    console.log('printPayload.kind:', j.printPayload?.kind)
    console.log('printPayload.company.name:', j.printPayload?.company?.name ?? '<null>')
    if (j.printPayload?.escposBase64) {
      const raw = Buffer.from(j.printPayload.escposBase64, 'base64').toString('latin1')
      const printable = raw.replace(/[\x00-\x1f]/g, '').replace(/\x7f/g, '')
      console.log('\n--- printable preview ---')
      console.log(printable)
    }
  }

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
