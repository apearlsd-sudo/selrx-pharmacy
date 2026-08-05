import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const COMMON_DOSAGE_FORMS = [
  'TABLET',
  'CAPSULE',
  'SYRUP',
  'SUSPENSION',
  'CREAM',
  'OINTMENT',
  'GEL',
  'LOTION',
  'DROPS',
  'INJECTION',
  'INHALER',
  'SPRAY',
  'PATCH',
  'SUPPOSITORY',
  'POWDER',
  'GRANULES',
  'SOLUTION',
  'EMULSION',
  'FOAM',
  'LOZENGE',
  'PASTILLE',
  'SOFTGEL',
  'FILM-COATED TABLET',
  'CHEWABLE TABLET',
  'EFFERVESCENT TABLET',
  'SUBLINGUAL TABLET',
  'ENTERIC-COATED TABLET',
  'EXTENDED-RELEASE TABLET',
  'BLISTER PACK',
  'VIAL',
  'AMPOULE',
  'BOTTLE',
  'SACHET',
  'STRIP',
  'TUBE',
  'PESSARY',
  'NEBULISER SOLUTION',
  'EYE OINTMENT',
  'EAR DROPS',
  'NOSE SPRAY',
  'ENEMA',
]

async function main() {
  console.log('Seeding dosage forms...')

  let created = 0
  let skipped = 0

  for (const name of COMMON_DOSAGE_FORMS) {
    try {
      await prisma.dosageForm.create({ data: { name } })
      console.log(`  Created: ${name}`)
      created++
    } catch (e: any) {
      if (e?.code === 'P2002') {
        console.log(`  Skipped (exists): ${name}`)
        skipped++
      } else {
        throw e
      }
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}`)

  const total = await prisma.dosageForm.count({ where: { isActive: true } })
  console.log(`Total active dosage forms in DB: ${total}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
