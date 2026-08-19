'use client'

import { useState, useRef, useEffect } from 'react'
import { ShieldCheck, Loader2, XCircle, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

export type ApprovalAction =
  | 'PRICE_OVERRIDE'
  | 'REFUND_APPROVAL'
  | 'CONTROLLED_DISPENSE'
  | 'DISCOUNT_OVERRIDE'
  | 'CREDIT_SALE'
  | 'VOID_TRANSACTION'

interface PinApprovalDialogProps {
  open: boolean
  onClose: () => void
  onApproved: () => void
  action: ApprovalAction
  entityType: string
  entityId?: string
  title?: string
  description?: string
}

const ACTION_LABELS: Record<ApprovalAction, string> = {
  PRICE_OVERRIDE: 'Price Override',
  REFUND_APPROVAL: 'Refund Approval',
  CONTROLLED_DISPENSE: 'Controlled Substance Dispense',
  DISCOUNT_OVERRIDE: 'Discount Override (>20%)',
  CREDIT_SALE: 'Credit Sale',
  VOID_TRANSACTION: 'Void Transaction',
}

export function PinApprovalDialog({
  open,
  onClose,
  onApproved,
  action,
  entityType,
  entityId,
  title,
  description,
}: PinApprovalDialogProps) {
  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)

  const [pin, setPin] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus the PIN input when dialog opens
  useEffect(() => {
    if (open) {
      setPin('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSubmit = async () => {
    if (!pin.trim()) {
      setError('Please enter a PIN')
      return
    }

    if (!user?.id) {
      setError('User session not found')
      return
    }

    setVerifying(true)
    setError('')

    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          action,
          entityType,
          entityId: entityId || null,
          requesterId: user.id,
          pin: pin.trim(),
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        addToast({
          title: 'Approved',
          description: `${ACTION_LABELS[action]} has been approved by ${data.approval?.approverName || 'supervisor'}`,
          variant: 'success',
        })
        onApproved()
        onClose()
      } else {
        setError(data.error || 'Verification failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setVerifying(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !verifying) {
      handleSubmit()
    }
  }

  const displayTitle = title || `Supervisor PIN Required`
  const displayDescription = description || `Enter a supervisor PIN to authorize: ${ACTION_LABELS[action]}`

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-600" />
            {displayTitle}
          </DialogTitle>
          <DialogDescription>{displayDescription}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pin-input">Supervisor PIN</Label>
            <Input
              id="pin-input"
              ref={inputRef}
              type="password"
              placeholder="Enter supervisor PIN"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md p-2.5">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/10 rounded-md p-2.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>This action requires supervisor authorization and will be logged.</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={verifying}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={verifying || !pin.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Verifying...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Verify & Approve
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
