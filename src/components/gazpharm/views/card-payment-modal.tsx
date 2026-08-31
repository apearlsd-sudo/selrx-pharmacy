'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  CreditCard,
  X,
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  validateCard,
  type CardBrandInfo,
} from '@/lib/card-utils'
import { formatCurrency } from '@/lib/currency'

type PaymentStep = 'entry' | 'processing' | 'success' | 'declined' | 'error'

interface CardPaymentModalProps {
  open: boolean
  amount: number
  paymentMethod: 'CREDIT_CARD' | 'DEBIT_CARD'
  transactionId: string | null
  onClose: (cardData?: CardPaymentResult) => void
  authHeaders: () => Record<string, string>
}

export interface CardPaymentResult {
  cardLast4: string
  cardBrand: string
  cardBrandLabel: string
  authCode: string
  refNumber: string
  status: string
  approvalMessage: string
}

function BrandBadge({ brand }: { brand: CardBrandInfo }) {
  if (brand.brand === 'UNKNOWN') return null

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-white"
      style={{ backgroundColor: brand.color }}
    >
      <CreditCard className="h-3 w-3" />
      {brand.label}
    </span>
  )
}

export function CardPaymentModal({
  open,
  amount,
  paymentMethod,
  transactionId,
  onClose,
  authHeaders,
}: CardPaymentModalProps) {
  // Form state
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardholderName, setCardholderName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState<PaymentStep>('entry')
  const [declineReason, setDeclineReason] = useState('')
  const [result, setResult] = useState<CardPaymentResult | null>(null)

  // Refs for auto-focus
  const cardNumberRef = useRef<HTMLInputElement>(null)
  const expiryRef = useRef<HTMLInputElement>(null)
  const cvvRef = useRef<HTMLInputElement>(null)

  const brand = detectCardBrand(cardNumber.replace(/\D/g, ''))

  // Auto-focus card number when modal opens
  useEffect(() => {
    if (open && step === 'entry') {
      setTimeout(() => cardNumberRef.current?.focus(), 100)
    }
  }, [open, step])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setCardNumber('')
      setExpiry('')
      setCvv('')
      setCardholderName('')
      setErrors({})
      setStep('entry')
      setDeclineReason('')
      setResult(null)
    }
  }, [open])

  // Handle card number input with formatting
  const handleCardNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    // Limit to brand max length
    const detectedBrand = detectCardBrand(raw)
    const maxLen = Math.min(raw.length, detectedBrand.maxLength + 3) // +3 for spaces
    const formatted = formatCardNumber(raw.slice(0, detectedBrand.maxLength))
    setCardNumber(formatted)
    // Clear error when typing
    if (errors.cardNumber) setErrors((prev) => ({ ...prev, cardNumber: '' }))

    // Auto-jump to expiry when card number is complete
    if (raw.length >= detectedBrand.maxLength) {
      setTimeout(() => expiryRef.current?.focus(), 50)
    }
  }, [errors.cardNumber])

  // Handle expiry input with auto-slash
  const handleExpiryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
    const formatted = formatExpiry(raw)
    setExpiry(formatted)
    if (errors.expiry) setErrors((prev) => ({ ...prev, expiry: '' }))

    // Auto-jump to CVV when expiry is complete
    if (raw.length >= 4) {
      setTimeout(() => cvvRef.current?.focus(), 50)
    }
  }, [errors.expiry])

  // Handle CVV input
  const handleCvvChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, brand.cvvLength)
    setCvv(raw)
    if (errors.cvv) setErrors((prev) => ({ ...prev, cvv: '' }))
  }, [brand.cvvLength, errors.cvv])

  // Handle cardholder name
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow letters, spaces, hyphens, apostrophes
    const cleaned = e.target.value.replace(/[^a-zA-Z\s\-']/g, '')
    setCardholderName(cleaned)
  }, [])

  // Submit handler
  const handleSubmit = async () => {
    // Client-side validation
    const validation = validateCard(cardNumber, expiry, cvv, cardholderName)
    const newErrors: Record<string, string> = {}

    for (const err of validation.errors) {
      if (err.toLowerCase().includes('card number') || err.toLowerCase().includes('luhn') || err.toLowerCase().includes('too short') || err.toLowerCase().includes('too long')) {
        newErrors.cardNumber = err
      } else if (err.toLowerCase().includes('expir')) {
        newErrors.expiry = err
      } else if (err.toLowerCase().includes('cvv')) {
        newErrors.cvv = err
      } else {
        newErrors.general = err
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (!transactionId) {
      setErrors({ general: 'No transaction ID available' })
      return
    }

    // Proceed to processing
    setStep('processing')

    try {
      const res = await fetch('/api/card-payment', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          cardNumber: cardNumber.replace(/\D/g, ''),
          expiry,
          cvv,
          cardholderName: cardholderName.trim() || undefined,
          paymentMethod,
        }),
      })

      const data = await res.json()

      if (res.ok && res.status === 201) {
        setStep('success')
        setResult({
          cardLast4: data.cardLast4,
          cardBrand: data.cardBrand,
          cardBrandLabel: data.cardBrandLabel,
          authCode: data.authCode,
          refNumber: data.refNumber,
          status: data.status,
          approvalMessage: data.approvalMessage,
        })
      } else if (res.status === 402) {
        // Declined
        setStep('declined')
        setDeclineReason(data.detail || data.error || 'Card declined')
      } else {
        // Other error
        setStep('error')
        setDeclineReason(data.detail || data.error || 'Processing failed')
      }
    } catch (err) {
      setStep('error')
      setDeclineReason(err instanceof Error ? err.message : 'Network error — please check connection')
    }
  }

  const handleClose = () => {
    if (step === 'success' && result) {
      onClose(result)
    } else if (step === 'processing') {
      // Don't allow closing while processing
      return
    } else {
      onClose(undefined)
    }
  }

  const handleRetry = () => {
    setStep('entry')
    setDeclineReason('')
    setErrors({})
    setCvv('') // Clear CVV for security
    setTimeout(() => cvvRef.current?.focus(), 100)
  }

  const isSubmitting = step === 'processing'
  const cardLabel = paymentMethod === 'CREDIT_CARD' ? 'Credit Card' : 'Debit Card'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== 'processing') handleClose() }}>
      <DialogContent className="sm:max-w-md !p-0 !gap-0" showCloseButton={step !== 'processing'}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-full p-2">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-base font-semibold">
                  {step === 'entry' && `${cardLabel} Payment`}
                  {step === 'processing' && 'Processing Payment...'}
                  {step === 'success' && 'Payment Approved'}
                  {step === 'declined' && 'Payment Declined'}
                  {step === 'error' && 'Payment Error'}
                </DialogTitle>
                <DialogDescription className="text-blue-100 text-xs">
                  {step === 'entry' && `Enter card details for ${formatCurrency(amount)}`}
                  {step === 'processing' && 'Please wait while we process your card'}
                  {step === 'success' && 'Transaction authorized successfully'}
                  {step === 'declined' && 'The card was not authorized'}
                  {step === 'error' && 'An error occurred during processing'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* ENTRY STEP */}
          {step === 'entry' && (
            <div className="space-y-4">
              {/* Amount Display */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                <span className="text-sm text-muted-foreground">Amount</span>
                <span className="text-lg font-bold">{formatCurrency(amount)}</span>
              </div>

              {/* Card Number */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Card Number</Label>
                  <BrandBadge brand={brand} />
                </div>
                <div className="relative">
                  <Input
                    ref={cardNumberRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className={`h-11 text-base font-mono tracking-wider pr-10 ${errors.cardNumber ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                    disabled={isSubmitting}
                  />
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
                {errors.cardNumber && (
                  <p className="text-xs text-red-500">{errors.cardNumber}</p>
                )}
              </div>

              {/* Expiry + CVV Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Expiry</Label>
                  <Input
                    ref={expiryRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM/YY"
                    value={expiry}
                    onChange={handleExpiryChange}
                    className={`h-11 text-base font-mono tracking-wider ${errors.expiry ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                    disabled={isSubmitting}
                    maxLength={5}
                  />
                  {errors.expiry && (
                    <p className="text-xs text-red-500">{errors.expiry}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {brand.brand === 'AMEX' ? 'CID' : 'CVV'}
                  </Label>
                  <Input
                    ref={cvvRef}
                    type="password"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder={brand.brand === 'AMEX' ? '1234' : '123'}
                    value={cvv}
                    onChange={handleCvvChange}
                    className={`h-11 text-base font-mono tracking-wider pr-10 ${errors.cvv ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                    disabled={isSubmitting}
                    maxLength={brand.cvvLength}
                  />
                  {errors.cvv && (
                    <p className="text-xs text-red-500">{errors.cvv}</p>
                  )}
                </div>
              </div>

              {/* Cardholder Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cardholder Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="text"
                  autoComplete="cc-name"
                  placeholder="Name on card"
                  value={cardholderName}
                  onChange={handleNameChange}
                  className="h-11"
                  disabled={isSubmitting}
                />
              </div>

              {/* General Error */}
              {errors.general && (
                <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.general}</p>
                </div>
              )}

              {/* Security Notice */}
              <div className="flex items-start gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div className="text-[11px] text-emerald-700 dark:text-emerald-400 space-y-0.5">
                  <p className="font-medium">Secured with PCI-DSS compliant processing</p>
                  <p>Your card number is validated and never stored. Only the last 4 digits are retained for your receipt.</p>
                </div>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-sm font-semibold shadow-lg"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                <Lock className="h-4 w-4 mr-2" />
                Process {cardLabel} — {formatCurrency(amount)}
              </Button>
            </div>
          )}

          {/* PROCESSING STEP */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900" />
                <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Processing your {cardLabel.toLowerCase()}...</p>
                <p className="text-xs text-muted-foreground">Please do not close this window</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-blue-600">{formatCurrency(amount)}</p>
              </div>
            </div>
          )}

          {/* SUCCESS STEP */}
          {step === 'success' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-full p-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-emerald-700">Payment Approved</p>
                  <p className="text-lg font-bold">{formatCurrency(amount)}</p>
                </div>
              </div>

              {/* Card Details */}
              <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Card</span>
                  <span className="text-sm font-medium">{result.cardBrandLabel} ending in {result.cardLast4}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Auth Code</span>
                  <span className="text-sm font-mono font-medium">{result.authCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Reference</span>
                  <span className="text-sm font-mono text-xs">{result.refNumber}</span>
                </div>
              </div>

              <Button
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold"
                onClick={handleClose}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Complete Sale
              </Button>
            </div>
          )}

          {/* DECLINED STEP */}
          {step === 'declined' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="bg-red-100 dark:bg-red-900/30 rounded-full p-4">
                  <X className="h-10 w-10 text-red-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-red-700">Payment Declined</p>
                  <p className="text-xs text-muted-foreground">{declineReason}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleRetry}
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onClose(undefined)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ERROR STEP */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className="bg-amber-100 dark:bg-amber-900/30 rounded-full p-4">
                  <AlertTriangle className="h-10 w-10 text-amber-600" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-semibold text-amber-700">Processing Error</p>
                  <p className="text-xs text-muted-foreground max-w-xs">{declineReason}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleRetry}
                >
                  Retry
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onClose(undefined)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
