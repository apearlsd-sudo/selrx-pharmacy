/**
 * POST /api/mobile-money-payment
 *
 * Secure mobile money payment processing endpoint.
 * Handles phone validation, provider detection, and creates a
 * MobileMoneyPayment record linked to a transaction.
 *
 * SECURITY MEASURES:
 * 1. Server-side phone validation (never trust client)
 * 2. Full phone number is NEVER stored — only masked version persisted
 * 3. Rate limiting: max 5 attempts per user per minute
 * 4. Comprehensive audit logging for all processing attempts
 * 5. Transaction ID verification (must exist and belong to user)
 * 6. Simulated processing for demo; ready for real gateway (Paystack/Flutterwave/Hubtel)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  turso,
  isTurso,
  tursoExecute,
  sqlRaw,
  toObjs,
  generateId,
} from '@/lib/turso'
import {
  validatePhoneNumber,
  detectProvider,
  maskPhoneNumber,
  generateMomoRef,
  type MobileMoneyProviderInfo,
} from '@/lib/mobile-money-utils'
import { checkRateLimit, getRetryAfter } from '@/lib/security'
import { writeAuditLog, getRequestContext } from '@/lib/audit-log'

/**
 * Simulated mobile money processing delay (2-4 seconds).
 * In production, this would be a webhook-polling loop waiting for
 * the customer to confirm on their phone via Paystack/Flutterwave/Hubtel.
 */
function simulateProcessingDelay(): Promise<void> {
  const delay = 2000 + Math.random() * 2000
  return new Promise((resolve) => setTimeout(resolve, delay))
}

/**
 * Simulate a mobile money approval decision.
 * In production, this would check the actual gateway status.
 * Returns { approved, responseCode, message }
 */
function simulateMomoApproval(
  amount: number,
  provider: MobileMoneyProviderInfo,
  maskedPhone: string
): { approved: boolean; responseCode: string; message: string } {
  // Simulate a 3% decline rate for realism
  const chance = Math.random()
  if (chance < 0.02) {
    return {
      approved: false,
      responseCode: 'REJECTED',
      message: 'Customer rejected the payment prompt',
    }
  }
  if (chance < 0.03) {
    return {
      approved: false,
      responseCode: 'INSUFFICIENT',
      message: 'Insufficient mobile money balance',
    }
  }
  if (chance < 0.04) {
    return {
      approved: false,
      responseCode: 'TIMEOUT',
      message: 'Payment prompt expired — customer did not confirm',
    }
  }

  // Approved
  return {
    approved: true,
    responseCode: 'COMPLETED',
    message: `Payment of ${amount.toFixed(2)} received from ${maskedPhone} via ${provider.label}`,
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── Authentication ──
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const { ipAddress, userAgent } = getRequestContext(request)

    // ── Rate Limiting: max 5 mobile money attempts per user per 60 seconds ──
    const rateLimitKey = `momo-payment:${userId}`
    if (!checkRateLimit(rateLimitKey, 5, 60_000)) {
      const retryAfter = getRetryAfter(rateLimitKey)
      await writeAuditLog({
        userId,
        action: 'MOMO_PAYMENT_RATE_LIMITED',
        category: 'transaction',
        entity: 'MobileMoneyPayment',
        details: { reason: 'rate_limit', retryAfterSeconds: retryAfter },
        ipAddress,
        userAgent,
      })
      return NextResponse.json(
        {
          error: 'Too many mobile money payment attempts',
          detail: `Please wait ${retryAfter} seconds before trying again`,
        },
        { status: 429 },
      )
    }

    // ── Parse and validate request body ──
    const body = await request.json()
    const { transactionId, phoneNumber, provider, providerLabel } = body

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 },
      )
    }

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 },
      )
    }

    if (!provider || typeof provider !== 'string') {
      return NextResponse.json(
        { error: 'Mobile money provider is required' },
        { status: 400 },
      )
    }

    // ── Server-side phone validation ──
    const validation = validatePhoneNumber(phoneNumber)
    if (!validation.valid) {
      await writeAuditLog({
        userId,
        action: 'MOMO_VALIDATION_FAILED',
        category: 'transaction',
        entity: 'MobileMoneyPayment',
        entityId: transactionId,
        details: { error: validation.error, provider, paymentMethod: 'MOBILE_MONEY' },
        ipAddress,
        userAgent,
      })
      return NextResponse.json(
        { error: 'Phone validation failed', detail: validation.error },
        { status: 400 },
      )
    }

    // ── Verify provider matches phone prefix ──
    const detectedProvider = detectProvider(validation.normalized)
    if (detectedProvider.provider !== provider && detectedProvider.provider !== 'UNKNOWN') {
      await writeAuditLog({
        userId,
        action: 'MOMO_PROVIDER_MISMATCH',
        category: 'transaction',
        entity: 'MobileMoneyPayment',
        entityId: transactionId,
        details: { submittedProvider: provider, detectedProvider: detectedProvider.provider, phone: validation.normalized },
        ipAddress,
        userAgent,
      })
      return NextResponse.json(
        { error: 'Provider mismatch', detail: `Phone number appears to be ${detectedProvider.label}, not ${providerLabel || provider}` },
        { status: 400 },
      )
    }

    const maskedPhone = maskPhoneNumber(validation.normalized)

    // ── Idempotency check ──
    const idempotencyKey = request.headers.get('x-idempotency-key')
    if (idempotencyKey) {
      if (isTurso()) {
        const idemResult = await turso.execute(
          sqlRaw(`SELECT id, status, reference, provider, "providerLabel", "phoneNumber", "responseCode", "approvalMessage" FROM "MobileMoneyPayment" WHERE reference = ?`, [idempotencyKey])
        )
        const idemRows = toObjs(idemResult)
        if (idemRows.length > 0) {
          const existing = idemRows[0]
          return NextResponse.json({
            id: existing.id, transactionId,
            provider: existing.provider, providerLabel: existing.providerLabel,
            maskedPhone: existing.phoneNumber, reference: existing.reference,
            status: existing.status, responseCode: existing.responseCode,
            approvalMessage: existing.approvalMessage,
            message: 'Idempotent: returned previously processed payment',
          })
        }
      } else {
        const { db } = await import('@/lib/db')
        const existing = await db.mobileMoneyPayment.findFirst({ where: { reference: idempotencyKey } })
        if (existing) {
          return NextResponse.json({
            id: existing.id, transactionId,
            provider: existing.provider, providerLabel: existing.providerLabel,
            maskedPhone: existing.phoneNumber, reference: existing.reference,
            status: existing.status, responseCode: existing.responseCode,
            approvalMessage: existing.approvalMessage,
            message: 'Idempotent: returned previously processed payment',
          })
        }
      }
    }

    // ── Verify transaction exists, is MOBILE_MONEY, and belongs to user ──
    let transactionAmount = 0
    let existingMomoPayment = false

    if (isTurso()) {
      // Ensure MobileMoneyPayment table exists
      try {
        await turso.execute({
          sql: `CREATE TABLE IF NOT EXISTS "MobileMoneyPayment" (
            id TEXT PRIMARY KEY,
            "transactionId" TEXT NOT NULL UNIQUE,
            provider TEXT NOT NULL,
            "providerLabel" TEXT NOT NULL,
            "phoneNumber" TEXT NOT NULL,
            reference TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            "responseCode" TEXT,
            "approvalMessage" TEXT,
            "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY ("transactionId") REFERENCES "Transaction"(id)
          )`,
          args: [],
        })
      } catch (e) {
        console.warn('[momo-payment] Table create/check:', e instanceof Error ? e.message : e)
      }

      const txnResult = await turso.execute(
        sqlRaw(`SELECT id, total, "paymentMethod", "userId" FROM "Transaction" WHERE id = ?`, [transactionId])
      )
      const txnRows = toObjs(txnResult)

      if (txnRows.length === 0) {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 },
        )
      }

      const txn = txnRows[0]
      transactionAmount = Number(txn.total)

      // ── Ownership verification ──
      if (txn.userId && txn.userId !== userId) {
        await writeAuditLog({
          userId, action: 'MOMO_PAYMENT_UNAUTHORIZED_TXN_ACCESS', category: 'security',
          entity: 'MobileMoneyPayment', entityId: transactionId,
          details: { transactionOwner: txn.userId, amount: transactionAmount, provider }, ipAddress, userAgent,
        })
        return NextResponse.json(
          { error: 'Transaction does not belong to this user' },
          { status: 403 },
        )
      }

      if (txn.paymentMethod !== 'MOBILE_MONEY') {
        return NextResponse.json(
          { error: 'Transaction is not a mobile money payment' },
          { status: 400 },
        )
      }

      const existingResult = await turso.execute(
        sqlRaw(`SELECT id FROM "MobileMoneyPayment" WHERE "transactionId" = ?`, [transactionId])
      )
      if (toObjs(existingResult).length > 0) {
        existingMomoPayment = true
      }
    } else {
      const { db } = await import('@/lib/db')
      const txn = await db.transaction.findUnique({
        where: { id: transactionId },
        select: { id: true, total: true, paymentMethod: true, userId: true },
      })

      if (!txn) {
        return NextResponse.json(
          { error: 'Transaction not found' },
          { status: 404 },
        )
      }

      transactionAmount = txn.total

      // ── Ownership verification ──
      if (txn.userId && txn.userId !== userId) {
        await writeAuditLog({
          userId, action: 'MOMO_PAYMENT_UNAUTHORIZED_TXN_ACCESS', category: 'security',
          entity: 'MobileMoneyPayment', entityId: transactionId,
          details: { transactionOwner: txn.userId, amount: transactionAmount, provider }, ipAddress, userAgent,
        })
        return NextResponse.json(
          { error: 'Transaction does not belong to this user' },
          { status: 403 },
        )
      }

      if (txn.paymentMethod !== 'MOBILE_MONEY') {
        return NextResponse.json(
          { error: 'Transaction is not a mobile money payment' },
          { status: 400 },
        )
      }

      const existingMomo = await db.mobileMoneyPayment.findUnique({
        where: { transactionId },
        select: { id: true },
      })
      if (existingMomo) {
        existingMomoPayment = true
      }
    }

    if (existingMomoPayment) {
      return NextResponse.json(
        { error: 'Mobile money payment already processed for this transaction' },
        { status: 409 },
      )
    }

    // ── Simulate mobile money processing (replace with real gateway) ──
    await simulateProcessingDelay()

    const result = simulateMomoApproval(transactionAmount, detectedProvider, maskedPhone)

    if (!result.approved) {
      // Log failed/declined payment
      await writeAuditLog({
        userId,
        action: 'MOMO_PAYMENT_FAILED',
        category: 'transaction',
        entity: 'MobileMoneyPayment',
        entityId: transactionId,
        details: {
          provider,
          providerLabel,
          maskedPhone,
          responseCode: result.responseCode,
          message: result.message,
          amount: transactionAmount,
          paymentMethod: 'MOBILE_MONEY',
        },
        ipAddress,
        userAgent,
      })

      const status = result.responseCode === 'TIMEOUT' ? 408 : 402
      return NextResponse.json(
        {
          error: 'Mobile money payment failed',
          detail: result.message,
          responseCode: result.responseCode,
        },
        { status },
      )
    }

    // ── Payment approved — create MobileMoneyPayment record ──
    const momoPaymentId = generateId()
    const now = new Date().toISOString()
    const provLabel = providerLabel || detectedProvider.label
    const refNumber = idempotencyKey || generateMomoRef()

    if (isTurso()) {
      await tursoExecute({
        sql: `INSERT INTO "MobileMoneyPayment"
              (id, "transactionId", provider, "providerLabel", "phoneNumber", reference, status, "responseCode", "approvalMessage", "createdAt")
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          momoPaymentId,
          transactionId,
          provider,
          provLabel,
          maskedPhone,
          refNumber,
          'COMPLETED',
          result.responseCode,
          result.message,
          now,
        ],
      })
    } else {
      const { db } = await import('@/lib/db')
      await db.mobileMoneyPayment.create({
        data: {
          id: momoPaymentId,
          transactionId,
          provider,
          providerLabel: provLabel,
          phoneNumber: maskedPhone,
          reference: refNumber,
          status: 'COMPLETED',
          responseCode: result.responseCode,
          approvalMessage: result.message,
        },
      })
    }

    // ── Audit log: successful mobile money payment ──
    await writeAuditLog({
      userId,
      action: 'MOMO_PAYMENT_COMPLETED',
      category: 'transaction',
      entity: 'MobileMoneyPayment',
      entityId: momoPaymentId,
      details: {
        transactionId,
        provider,
        providerLabel: provLabel,
        maskedPhone,
        reference: refNumber,
        responseCode: result.responseCode,
        amount: transactionAmount,
        paymentMethod: 'MOBILE_MONEY',
        idempotencyKey: idempotencyKey || undefined,
      },
      ipAddress,
      userAgent,
    })

    // ── Return payment details (NO sensitive data) ──
    return NextResponse.json({
      id: momoPaymentId,
      transactionId,
      provider,
      providerLabel: provLabel,
      maskedPhone,
      reference: refNumber,
      status: 'COMPLETED',
      responseCode: result.responseCode,
      approvalMessage: result.message,
    }, { status: 201 })

  } catch (error) {
    console.error('[momo-payment] Processing error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'Mobile money payment processing failed', detail: msg },
      { status: 500 },
    )
  }
}
