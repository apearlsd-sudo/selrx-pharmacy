/**
 * PATIENT MEDICATION RECORDS API
 *
 * GET /api/patient-records?customerId=...            — Full medication history
 * GET /api/patient-records?customerId=...&summary=true — Summary view
 */

import { NextRequest, NextResponse } from 'next/server'
import { turso, isTurso } from '@/lib/turso'

// ── GET: Patient medication records ──

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const customerId = searchParams.get('customerId')
    const summary = searchParams.get('summary') === 'true'

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }

    if (isTurso()) {
      if (summary) {
        // Summary view: medication list, total prescriptions, last visit, active medications
        const [rxResult, txResult, customerResult] = await Promise.all([
          turso.execute({
            sql: `SELECT id, "rxNumber", "productName", "prescriberName", "prescriberNPI", "prescriberPhone",
                          status, quantity, dosage, "daysSupply", "refillsRemaining", "refillsTotal",
                          "createdAt", "expiresAt"
                   FROM "Prescription" WHERE "customerId" = ? ORDER BY "createdAt" DESC`,
            args: [customerId],
          }),
          turso.execute({
            sql: `SELECT t.id, t."transactionNo", t.total, t.status, t."createdAt",
                         COUNT(ti.id) as "itemsCount"
                  FROM "Transaction" t
                  LEFT JOIN "TransactionItem" ti ON ti."transactionId" = t.id
                  WHERE t."customerId" = ? AND t.status = 'COMPLETED'
                  GROUP BY t.id
                  ORDER BY t."createdAt" DESC`,
            args: [customerId],
          }),
          turso.execute({
            sql: `SELECT id, "firstName", "lastName", "allergies", "insuranceProvider",
                         "insurancePolicyNo", "phone", "email", "dateOfBirth"
                  FROM "Customer" WHERE id = ?`,
            args: [customerId],
          }),
        ])

        const rxs = rxResult.rows.map((r) => ({
          id: r.id as string,
          rxNumber: r.rxNumber as string,
          productName: r.productName as string,
          prescriberName: (r.prescriberName as string) || '',
          prescriberNPI: (r.prescriberNPI as string) || null,
          prescriberPhone: (r.prescriberPhone as string) || null,
          status: r.status as string,
          quantity: Number(r.quantity),
          dosage: (r.dosage as string) || null,
          daysSupply: (r.daysSupply as number) || null,
          refillsRemaining: Number(r.refillsRemaining),
          refillsTotal: Number(r.refillsTotal),
          createdAt: r.createdAt as string,
          expiresAt: (r.expiresAt as string) || null,
        }))

        const txns = txResult.rows.map((r) => ({
          id: r.id as string,
          transactionNo: r.transactionNo as string,
          total: Number(r.total),
          status: r.status as string,
          itemsCount: Number(r.itemsCount),
          createdAt: r.createdAt as string,
        }))

        const customer = customerResult.rows[0]
        const allergies = (customer?.allergies as string) || ''

        // Build unique medication list
        const medicationMap = new Map<string, { productName: string; prescriberName: string; lastDate: string; totalQuantity: number; refillsRemaining: number }>()
        for (const rx of rxs) {
          const existing = medicationMap.get(rx.productName)
          if (existing) {
            existing.totalQuantity += rx.quantity
            if (rx.createdAt > existing.lastDate) existing.lastDate = rx.createdAt
            if (rx.refillsRemaining > 0) existing.refillsRemaining = rx.refillsRemaining
          } else {
            medicationMap.set(rx.productName, {
              productName: rx.productName,
              prescriberName: rx.prescriberName,
              lastDate: rx.createdAt,
              totalQuantity: rx.quantity,
              refillsRemaining: rx.refillsRemaining,
            })
          }
        }

        // Prescriber history
        const prescriberMap = new Map<string, { name: string; npi: string | null; phone: string | null; lastDate: string }>()
        for (const rx of rxs) {
          const existing = prescriberMap.get(rx.prescriberName)
          if (existing) {
            if (rx.createdAt > existing.lastDate) existing.lastDate = rx.createdAt
          } else {
            prescriberMap.set(rx.prescriberName, {
              name: rx.prescriberName,
              npi: rx.prescriberNPI,
              phone: rx.prescriberPhone,
              lastDate: rx.createdAt,
            })
          }
        }

        return NextResponse.json({
          summary: {
            totalPrescriptions: rxs.length,
            totalTransactions: txns.length,
            lastVisit: txns[0]?.createdAt || null,
            totalSpent: txns.reduce((s, t) => s + t.total, 0),
            allergies: allergies ? allergies.split(',').map((a: string) => a.trim()).filter(Boolean) : [],
            insuranceProvider: (customer?.insuranceProvider as string) || null,
            insurancePolicyNo: (customer?.insurancePolicyNo as string) || null,
          },
          medications: Array.from(medicationMap.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
          prescribers: Array.from(prescriberMap.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
        })
      } else {
        // Full history: prescriptions + transactions with items + allergies + insurance
        const [rxResult, txResult, customerResult] = await Promise.all([
          turso.execute({
            sql: `SELECT id, "rxNumber", "productName", "prescriberName", "prescriberNPI", "prescriberPhone",
                          status, quantity, dosage, "daysSupply", "refillsRemaining", "refillsTotal",
                          "createdAt", "expiresAt"
                   FROM "Prescription" WHERE "customerId" = ? ORDER BY "createdAt" DESC`,
            args: [customerId],
          }),
          turso.execute({
            sql: `SELECT t.id, t."transactionNo", t.total, t.status, t."createdAt",
                         ti."productId", ti."productName" as "itemProductName", ti.quantity, ti."unitPrice", ti.subtotal
                  FROM "Transaction" t
                  LEFT JOIN "TransactionItem" ti ON ti."transactionId" = t.id
                  WHERE t."customerId" = ?
                  ORDER BY t."createdAt" DESC, ti."createdAt" ASC`,
            args: [customerId],
          }),
          turso.execute({
            sql: `SELECT id, "firstName", "lastName", "allergies", "insuranceProvider",
                         "insurancePolicyNo", "phone", "email", "dateOfBirth"
                  FROM "Customer" WHERE id = ?`,
            args: [customerId],
          }),
        ])

        const rxs = rxResult.rows.map((r) => ({
          id: r.id as string,
          rxNumber: r.rxNumber as string,
          productName: r.productName as string,
          prescriberName: (r.prescriberName as string) || '',
          prescriberNPI: (r.prescriberNPI as string) || null,
          prescriberPhone: (r.prescriberPhone as string) || null,
          status: r.status as string,
          quantity: Number(r.quantity),
          dosage: (r.dosage as string) || null,
          daysSupply: (r.daysSupply as number) || null,
          refillsRemaining: Number(r.refillsRemaining),
          refillsTotal: Number(r.refillsTotal),
          createdAt: r.createdAt as string,
          expiresAt: (r.expiresAt as string) || null,
        }))

        // Group transaction items by transaction
        const txMap = new Map<string, any>()
        for (const r of txResult.rows) {
          const txId = r.id as string
          if (!txMap.has(txId)) {
            txMap.set(txId, {
              id: txId,
              transactionNo: r.transactionNo as string,
              total: Number(r.total),
              status: r.status as string,
              createdAt: r.createdAt as string,
              items: [],
            })
          }
          if (r.productId) {
            txMap.get(txId)!.items.push({
              productId: r.productId as string,
              productName: r.itemProductName as string,
              quantity: Number(r.quantity),
              unitPrice: Number(r.unitPrice),
              subtotal: Number(r.subtotal),
            })
          }
        }
        const txns = Array.from(txMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

        const customer = customerResult.rows[0]
        const allergies = (customer?.allergies as string) || ''

        return NextResponse.json({
          customer: {
            id: customer?.id as string,
            firstName: customer?.firstName as string,
            lastName: customer?.lastName as string,
            allergies: allergies ? allergies.split(',').map((a: string) => a.trim()).filter(Boolean) : [],
            insuranceProvider: (customer?.insuranceProvider as string) || null,
            insurancePolicyNo: (customer?.insurancePolicyNo as string) || null,
            phone: (customer?.phone as string) || null,
            email: (customer?.email as string) || null,
            dateOfBirth: (customer?.dateOfBirth as string) || null,
          },
          prescriptions: rxs,
          transactions: txns,
        })
      }
    }

    // Prisma fallback
    const { db } = await import('@/lib/db')
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, firstName: true, lastName: true, allergies: true,
        insuranceProvider: true, insurancePolicyNo: true, phone: true, email: true, dateOfBirth: true,
      },
    })
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const [rxs, txns] = await Promise.all([
      db.prescription.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      }),
      db.transaction.findMany({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const allergies = (customer.allergies as string || '').split(',').map((a) => a.trim()).filter(Boolean)

    if (summary) {
      const medicationMap = new Map<string, any>()
      for (const rx of rxs as any[]) {
        const existing = medicationMap.get(rx.productName)
        if (existing) {
          existing.totalQuantity += rx.quantity
          if (rx.createdAt > existing.lastDate) existing.lastDate = rx.createdAt.toISOString()
        } else {
          medicationMap.set(rx.productName, {
            productName: rx.productName, prescriberName: rx.prescriberName || '',
            lastDate: rx.createdAt.toISOString(), totalQuantity: rx.quantity, refillsRemaining: rx.refillsRemaining,
          })
        }
      }
      return NextResponse.json({
        summary: {
          totalPrescriptions: rxs.length, totalTransactions: txns.length,
          lastVisit: txns[0]?.createdAt?.toISOString?.() || null,
          totalSpent: txns.reduce((s: number, t: any) => s + (t.total || 0), 0),
          allergies, insuranceProvider: customer.insuranceProvider, insurancePolicyNo: customer.insurancePolicyNo,
        },
        medications: Array.from(medicationMap.values()),
        prescribers: [],
      })
    }

    return NextResponse.json({
      customer: { ...customer, allergies },
      prescriptions: rxs.map((r: any) => ({ ...r, createdAt: r.createdAt?.toISOString?.() })),
      transactions: txns.map((t: any) => ({ ...t, items: t.items || [], createdAt: t.createdAt?.toISOString?.() })),
    })
  } catch (error) {
    console.error('[patient-records] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch patient records' }, { status: 500 })
  }
}
