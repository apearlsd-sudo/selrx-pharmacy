'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import {
  Smartphone,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Phone,
  Signal,
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
  formatPhoneNumber,
  validatePhoneNumber,
  detectProvider,
  maskPhoneNumber,
  getAvailableProviders,
  type MobileMoneyProviderInfo,
} from '@/lib/mobile-money-utils'
import { formatCurrency } from '@/lib/currency'

type PaymentStep = 'entry' | 'confirming' | 'processing' | 'success' | 'declined' | 'error' | 'timeout'

interface MobileMoneyModalProps {
  open: boolean
  amount: number
  transactionId: string | null
  onClose: (result?: MobileMoneyResult) => void
  authHeaders: () => Record<string, string>
}

export interface MobileMoneyResult {
  provider: string
  providerLabel: string
  maskedPhone: string
  reference: string
  status: string
  approvalMessage: string
}

function ProviderBadge({ provider }: { provider: MobileMoneyProviderInfo }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
      style={{
        backgroundColor: provider.color + '22',
        color: provider.color === '#FFC300' ? '#8B6914' : provider.color,
        border: `1px solid ${provider.color}44`,
      }}
    >
      {provider.logoUrl ? (
        <Image src={provider.logoUrl} alt={provider.label} width={14} height={14} className="w-3.5 h-3.5 rounded-full" />
      ) : (
        <Signal className="h-3 w-3" />
      )}
      {provider.label}
    </span>
  )
}

export function MobileMoneyModal({
  open,
  amount,
  transactionId,
  onClose,
  authHeaders,
}: MobileMoneyModalProps) {
  // Form state
  const [phoneNumber, setPhoneNumber] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<MobileMoneyProviderInfo | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState<PaymentStep>('entry')
  const [declineReason, setDeclineReason] = useState('')
  const [result, setResult] = useState<MobileMoneyResult | null>(null)
  const [countdown, setCountdown] = useState(0)

  const phoneRef = useRef<HTMLInputElement>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const detectedProvider = detectProvider(phoneNumber.replace(/[\s\-()]/g, ''))
  const displayProvider = selectedProvider || detectedProvider

  // Available providers for manual selection
  const providers = getAvailableProviders()

  // Auto-focus phone input when modal opens
  useEffect(() => {
    if (open && step === 'entry') {
      setTimeout(() => phoneRef.current?.focus(), 100)
    }
  }, [open, step])

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setPhoneNumber('')
      setSelectedProvider(null)
      setErrors({})
      setStep('entry')
      setDeclineReason('')
      setResult(null)
      setCountdown(0)
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
  }, [open])

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Handle phone number input with formatting
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d+]/g, '')
    // Auto-add leading 0 if user starts typing digits
    let formatted = raw
    if (formatted.length > 0 && !formatted.startsWith('0') && !formatted.startsWith('+')) {
      formatted = '0' + formatted
    }
    formatted = formatPhoneNumber(formatted)
    setPhoneNumber(formatted)
    if (errors.phoneNumber) setErrors((prev) => ({ ...prev, phoneNumber: '' }))

    // Auto-detect provider and select if unique match
    if (formatted.replace(/\D/g, '').length >= 4) {
      const detected = detectProvider(formatted)
      if (detected.provider !== 'UNKNOWN' && !selectedProvider) {
        setSelectedProvider(detected)
      }
    }
  }, [errors.phoneNumber, selectedProvider])

  // Handle provider manual selection
  const handleProviderSelect = useCallback((provider: MobileMoneyProviderInfo) => {
    setSelectedProvider(provider)
  }, [])

  // Submit handler
  const handleSubmit = async () => {
    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber)
    const newErrors: Record<string, string> = {}

    if (!validation.valid) {
      newErrors.phoneNumber = validation.error
    }

    if (!selectedProvider || selectedProvider.provider === 'UNKNOWN') {
      newErrors.provider = 'Please select or confirm a mobile money provider'
    }

    if (!transactionId) {
      newErrors.general = 'No transaction ID available'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Move to confirming step
    setStep('confirming')
  }

  // Confirm and process
  const handleConfirm = async () => {
    setStep('processing')
    setCountdown(120) // 2-minute timeout

    // Start countdown
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          setStep('timeout')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    try {
      const res = await fetch('/api/mobile-money-payment', {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          phoneNumber: phoneNumber.replace(/\D/g, ''),
          provider: selectedProvider!.provider,
          providerLabel: selectedProvider!.label,
        }),
      })

      // Stop countdown
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }

      const data = await res.json()

      if (res.ok && res.status === 201) {
        setStep('success')
        setResult({
          provider: data.provider,
          providerLabel: data.providerLabel,
          maskedPhone: data.maskedPhone,
          reference: data.reference,
          status: data.status,
          approvalMessage: data.approvalMessage,
        })
      } else if (res.status === 402 || res.status === 408) {
        setStep(res.status === 408 ? 'timeout' : 'declined')
        setDeclineReason(data.detail || data.error || 'Payment failed')
      } else {
        setStep('error')
        setDeclineReason(data.detail || data.error || 'Processing failed')
      }
    } catch (err) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      setStep('error')
      setDeclineReason(err instanceof Error ? err.message : 'Network error — please check connection')
    }
  }

  const handleClose = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (step === 'success' && result) {
      onClose(result)
    } else if (step === 'processing' || step === 'confirming') {
      return
    } else {
      onClose(undefined)
    }
  }

  const handleRetry = () => {
    setStep('entry')
    setDeclineReason('')
    setErrors({})
    setTimeout(() => phoneRef.current?.focus(), 100)
  }

  const isSubmitting = step === 'processing' || step === 'confirming'
  const providerColor = displayProvider?.color || '#6B7280'

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== 'processing' && step !== 'confirming') handleClose() }}>
      <DialogContent className="sm:max-w-md !p-0 !gap-0" showCloseButton={step !== 'processing' && step !== 'confirming'}>
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-lg"
          style={{
            background: `linear-gradient(135deg, ${providerColor}dd, ${providerColor}aa)`,
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-full p-2">
                <Smartphone className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-base font-semibold">
                  {step === 'entry' && 'Mobile Money Payment'}
                  {step === 'confirming' && 'Confirm Payment'}
                  {step === 'processing' && 'Waiting for Confirmation...'}
                  {step === 'success' && 'Payment Received'}
                  {step === 'declined' && 'Payment Failed'}
                  {step === 'timeout' && 'Payment Timed Out'}
                  {step === 'error' && 'Processing Error'}
                </DialogTitle>
                <DialogDescription className="text-white/80 text-xs">
                  {step === 'entry' && `Enter mobile money details for ${formatCurrency(amount)}`}
                  {step === 'confirming' && 'Review and confirm the payment details'}
                  {step === 'processing' && `Check your phone and confirm the ${formatCurrency(amount)} prompt`}
                  {step === 'success' && 'Transaction completed successfully'}
                  {step === 'declined' && 'The mobile money payment was not completed'}
                  {step === 'timeout' && 'No response received from the customer\'s phone'}
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

              {/* Phone Number */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Phone Number</Label>
                  {displayProvider && displayProvider.provider !== 'UNKNOWN' && (
                    <ProviderBadge provider={displayProvider} />
                  )}
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="024 XXX XXXX"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    className={`h-11 text-base font-mono tracking-wider pl-10 ${errors.phoneNumber ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                    disabled={isSubmitting}
                    maxLength={14}
                  />
                </div>
                {errors.phoneNumber && (
                  <p className="text-xs text-red-500">{errors.phoneNumber}</p>
                )}
              </div>

              {/* Provider Selection */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Network Provider</Label>
                <div className="grid grid-cols-3 gap-2">
                  {providers.map((prov) => (
                    <button
                      key={prov.provider}
                      type="button"
                      onClick={() => handleProviderSelect(prov)}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all text-xs font-medium
                        ${displayProvider?.provider === prov.provider
                          ? 'border-current shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }
                      `}
                      style={
                        displayProvider?.provider === prov.provider
                          ? { borderColor: prov.color, backgroundColor: prov.color + '11' }
                          : {}
                      }
                      disabled={isSubmitting}
                    >
                      {prov.logoUrl ? (
                        <Image
                          src={prov.logoUrl}
                          alt={prov.label}
                          width={28}
                          height={28}
                          className="w-7 h-7 rounded-full shrink-0"
                        />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: prov.color }}
                        >
                          {prov.logoInitials.slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate" style={{ color: displayProvider?.provider === prov.provider ? prov.color : undefined }}>
                          {prov.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-normal">{prov.shortcode}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {errors.provider && (
                  <p className="text-xs text-red-500">{errors.provider}</p>
                )}
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
                  <p className="font-medium">Secure mobile money processing</p>
                  <p>Customer will receive a payment prompt on their phone to confirm. Phone number is masked and never stored in full.</p>
                </div>
              </div>

              {/* Submit */}
              <Button
                className="w-full h-11 text-sm font-semibold shadow-lg text-white"
                style={{
                  background: `linear-gradient(135deg, ${providerColor}, ${providerColor}cc)`,
                }}
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Pay with Mobile Money — {formatCurrency(amount)}
              </Button>
            </div>
          )}

          {/* CONFIRMING STEP */}
          {step === 'confirming' && selectedProvider && (
            <div className="space-y-4">
              <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <span className="text-lg font-bold">{formatCurrency(amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Provider</span>
                  <ProviderBadge provider={selectedProvider} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  <span className="text-sm font-mono font-medium">{formatPhoneNumber(phoneNumber)}</span>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                A payment prompt of <span className="font-bold text-foreground">{formatCurrency(amount)}</span> will be sent to the customer&apos;s phone. They need to confirm it.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep('entry')}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${selectedProvider.color}, ${selectedProvider.color}cc)`,
                  }}
                  onClick={handleConfirm}
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Send Prompt
                </Button>
              </div>
            </div>
          )}

          {/* PROCESSING STEP */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full border-4 animate-ping opacity-20" style={{ borderColor: providerColor }} />
                <div className="relative rounded-full p-6" style={{ backgroundColor: providerColor + '15' }}>
                  <Smartphone className="h-12 w-12 animate-pulse" style={{ color: providerColor }} />
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">Waiting for customer confirmation...</p>
                <p className="text-xs text-muted-foreground">
                  The customer should check their phone and approve the payment prompt
                </p>
                <div className="text-2xl font-bold font-mono" style={{ color: providerColor }}>
                  {formatCurrency(amount)}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Expires in {formatCountdown(countdown)}
                </div>
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
                  <p className="text-sm font-semibold text-emerald-700">Payment Received</p>
                  <p className="text-lg font-bold">{formatCurrency(amount)}</p>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Provider</span>
                  <span className="text-sm font-medium">{result.providerLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Phone</span>
                  <span className="text-sm font-mono font-medium">{result.maskedPhone}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Reference</span>
                  <span className="text-sm font-mono text-xs">{result.reference}</span>
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

          {/* DECLINED / TIMEOUT / ERROR STEPS */}
          {(step === 'declined' || step === 'timeout' || step === 'error') && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <div className={
                  step === 'timeout'
                    ? 'bg-amber-100 dark:bg-amber-900/30 rounded-full p-4'
                    : 'bg-red-100 dark:bg-red-900/30 rounded-full p-4'
                }>
                  {step === 'timeout'
                    ? <AlertTriangle className="h-10 w-10 text-amber-600" />
                    : <X className="h-10 w-10 text-red-600" />
                  }
                </div>
                <div className="text-center space-y-1">
                  <p className={`text-sm font-semibold ${step === 'timeout' ? 'text-amber-700' : 'text-red-700'}`}>
                    {step === 'timeout' ? 'Payment Timed Out' : step === 'declined' ? 'Payment Failed' : 'Processing Error'}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">{declineReason}</p>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
