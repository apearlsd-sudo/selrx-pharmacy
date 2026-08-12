'use client'

import { useState } from 'react'
import { KeyRound, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'

export function PasswordChangeSection() {
  const addToast = useAppStore((s) => s.addToast)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function clearForm() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrors({})
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!currentPassword) e.currentPassword = 'Current password is required'
    if (!newPassword) e.newPassword = 'New password is required'
    else if (newPassword.length < 6) e.newPassword = 'New password must be at least 6 characters'
    if (!confirmPassword) e.confirmPassword = 'Please confirm your new password'
    else if (newPassword !== confirmPassword) e.confirmPassword = 'Passwords do not match'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleChangePassword() {
    if (!validate()) return

    setSaving(true)
    try {
      const res = await fetch('/api/users?action=change-password', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ title: 'Password Change Failed', description: data.error || 'Could not change password', variant: 'destructive' })
        return
      }

      addToast({ title: 'Password Changed', description: 'Your password has been updated successfully', variant: 'success' })
      clearForm()
    } catch {
      addToast({ title: 'Error', description: 'Network error while changing password', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-rose-500" />
          Change Password
        </CardTitle>
        <CardDescription className="text-xs">
          Update your account password. You will need to enter your current password to confirm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Current Password</Label>
          <Input
            className="h-9 text-xs"
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setErrors((prev) => ({ ...prev, currentPassword: '' })) }}
            placeholder="Enter current password"
          />
          {errors.currentPassword && <p className="text-[11px] text-red-500 mt-1">{errors.currentPassword}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">New Password</Label>
          <Input
            className="h-9 text-xs"
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setErrors((prev) => ({ ...prev, newPassword: '' })) }}
            placeholder="Min. 6 characters"
          />
          {errors.newPassword && <p className="text-[11px] text-red-500 mt-1">{errors.newPassword}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Confirm New Password</Label>
          <Input
            className="h-9 text-xs"
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirmPassword: '' })) }}
            placeholder="Re-enter new password"
          />
          {errors.confirmPassword && <p className="text-[11px] text-red-500 mt-1">{errors.confirmPassword}</p>}
        </div>

        <div className="flex justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" disabled={saving} onClick={handleChangePassword}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Changing...</> : <><Save className="h-3.5 w-3.5" /> Change Password</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
