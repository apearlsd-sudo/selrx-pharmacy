'use client'

import { useState, useEffect, useCallback } from 'react'
import { KeyRound, Loader2, User, Mail, Shield, Calendar, ArrowLeft, Fingerprint, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/app-store'
import { PageHeader } from '@/components/gazpharm/shared/page-header'

export function MyProfileView() {
  const user = useAppStore((s) => s.user)
  const addToast = useAppStore((s) => s.addToast)
  const setCurrentView = useAppStore((s) => s.setCurrentView)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const [loginCount, setLoginCount] = useState<number | null>(null)

  // PIN state
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [pinPassword, setPinPassword] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaving, setPinSaving] = useState(false)
  const [pinErrors, setPinErrors] = useState<Record<string, string>>({})
  const [clearingPin, setClearingPin] = useState(false)

  const fetchLoginInfo = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/login-history?userId=${user.id}&limit=1`)
      if (res.ok) {
        const data = await res.json()
        if (data.logs?.length > 0) setLastLogin(data.logs[0].createdAt)
        setLoginCount(data.total || data.logs?.length || 0)
      }
    } catch { /* ignore */ }
  }, [user?.id])

  const fetchPinStatus = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await fetch(`/api/users?action=profile`, { headers: { 'Content-Type': 'application/json', 'x-user-id': user.id, 'x-user-role': user.role || '' } })
      if (res.ok) {
        const data = await res.json()
        setHasPin(!!data.hasPin)
      }
    } catch { /* ignore */ }
  }, [user?.id, user?.role])

  useEffect(() => { fetchLoginInfo(); fetchPinStatus() }, [fetchLoginInfo, fetchPinStatus])

  const initials = (user?.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({ title: 'Password Change Failed', description: data.error || 'Could not change password', variant: 'destructive' })
        return
      }
      addToast({ title: 'Password Changed', description: 'Your password has been updated successfully', variant: 'success' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setErrors({})
    } catch {
      addToast({ title: 'Error', description: 'Network error while changing password', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  function validatePin(): boolean {
    const e: Record<string, string> = {}
    if (!pinPassword) e.pinPassword = 'Current password is required'
    if (!newPin) e.newPin = 'PIN is required'
    else if (!/^[0-9]{4,8}$/.test(newPin)) e.newPin = 'PIN must be 4 to 8 digits'
    if (!confirmPin) e.confirmPin = 'Please confirm your PIN'
    else if (newPin !== confirmPin) e.confirmPin = 'PINs do not match'
    setPinErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSetPin() {
    if (!validatePin()) return
    setPinSaving(true)
    try {
      const res = await fetch('/api/users?action=manage-pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pinPassword, newPin }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({ title: 'PIN Setup Failed', description: data.error || 'Could not set PIN', variant: 'destructive' })
        return
      }
      addToast({ title: 'PIN Set', description: 'Your return approval PIN has been set successfully', variant: 'success' })
      setHasPin(true)
      setPinPassword('')
      setNewPin('')
      setConfirmPin('')
      setPinErrors({})
    } catch {
      addToast({ title: 'Error', description: 'Network error while setting PIN', variant: 'destructive' })
    } finally {
      setPinSaving(false)
    }
  }

  async function handleClearPin() {
    if (!pinPassword) {
      setPinErrors({ pinPassword: 'Enter your password to clear PIN' })
      return
    }
    setClearingPin(true)
    try {
      const res = await fetch('/api/users?action=manage-pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pinPassword, clearPin: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({ title: 'PIN Clear Failed', description: data.error || 'Could not clear PIN', variant: 'destructive' })
        return
      }
      addToast({ title: 'PIN Cleared', description: 'Your return approval PIN has been removed', variant: 'success' })
      setHasPin(false)
      setPinPassword('')
      setPinErrors({})
    } catch {
      addToast({ title: 'Error', description: 'Network error while clearing PIN', variant: 'destructive' })
    } finally {
      setClearingPin(false)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Profile"
        icon={User}
        action={
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCurrentView('dashboard')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        }
      />

      {/* Profile Info Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
              <span className="text-emerald-700 dark:text-emerald-300 text-xl font-bold">{initials}</span>
            </div>
            <div>
              <CardTitle className="text-lg">{user.name}</CardTitle>
              <CardDescription className="text-sm mt-0.5">{user.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Role</p>
                <p className="text-sm font-medium">{user.roleLabel || user.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Email</p>
                <p className="text-sm font-medium truncate max-w-[180px]">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
              <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Last Login</p>
                <p className="text-sm font-medium">{lastLogin ? new Date(lastLogin).toLocaleString() : '—'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Card */}
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
        <CardContent className="space-y-3">
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

          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
              onClick={handleChangePassword}
            >
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Changing...</> : <><KeyRound className="h-3.5 w-3.5" /> Change Password</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Return Approval PIN Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-amber-500" />
            Return Approval PIN
          </CardTitle>
          <CardDescription className="text-xs">
            Set a personal PIN to authorize goods return processing. If no PIN is set, the supervisor (admin) password will be required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* PIN status indicator */}
          <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${hasPin ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
            <Fingerprint className="h-3.5 w-3.5" />
            <span className="font-medium">{hasPin ? 'PIN is set' : 'No PIN configured'}</span>
            <span className="ml-auto">{hasPin ? 'You can use your PIN to approve returns' : 'Set a PIN to quickly approve returns without needing admin password'}</span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Your Password</Label>
            <Input
              className="h-9 text-xs"
              type="password"
              value={pinPassword}
              onChange={(e) => { setPinPassword(e.target.value); setPinErrors((prev) => ({ ...prev, pinPassword: '' })) }}
              placeholder="Enter your current password"
            />
            {pinErrors.pinPassword && <p className="text-[11px] text-red-500 mt-1">{pinErrors.pinPassword}</p>}
          </div>

          {!hasPin && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">New PIN (4-8 digits)</Label>
                <Input
                  className="h-9 text-xs"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPin}
                  onChange={(e) => { setNewPin(e.target.value.replace(/[^0-9]/g, '')); setPinErrors((prev) => ({ ...prev, newPin: '' })) }}
                  placeholder="e.g. 1234"
                />
                {pinErrors.newPin && <p className="text-[11px] text-red-500 mt-1">{pinErrors.newPin}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Confirm PIN</Label>
                <Input
                  className="h-9 text-xs"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(e) => { setConfirmPin(e.target.value.replace(/[^0-9]/g, '')); setPinErrors((prev) => ({ ...prev, confirmPin: '' })) }}
                  placeholder="Re-enter your PIN"
                />
                {pinErrors.confirmPin && <p className="text-[11px] text-red-500 mt-1">{pinErrors.confirmPin}</p>}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={pinSaving}
                  onClick={handleSetPin}
                >
                  {pinSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Setting...</> : <><Fingerprint className="h-3.5 w-3.5" /> Set PIN</>}
                </Button>
              </div>
            </>
          )}

          {hasPin && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs gap-1.5"
                disabled={clearingPin}
                onClick={handleClearPin}
              >
                {clearingPin ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Clearing...</> : <><Trash2 className="h-3.5 w-3.5" /> Remove PIN</>}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-900/10 rounded-md p-2.5">
            <Fingerprint className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span>This PIN is used to authorize goods return approvals. Without a PIN, you will need a supervisor's password for return processing.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
