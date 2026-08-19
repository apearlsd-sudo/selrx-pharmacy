'use client'

import { useState, useEffect, useCallback } from 'react'
import { KeyRound, Loader2, User, Mail, Shield, Calendar, ArrowLeft } from 'lucide-react'
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

  useEffect(() => { fetchLoginInfo() }, [fetchLoginInfo])

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
    </div>
  )
}
