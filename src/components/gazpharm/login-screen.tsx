'use client'

import { useState } from 'react'
import { User, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAppStore, type UserState } from '@/store/app-store'

import type { CompanyBranding } from '@/lib/get-branding'

interface LoginScreenProps {
  initialBranding: CompanyBranding
}

export function LoginScreen({ initialBranding }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const branding = initialBranding

  const setUser = useAppStore((s) => s.setUser)
  const setAuthToken = useAppStore((s) => s.setAuthToken)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setShift = useAppStore((s) => s.setShift)
  const addToast = useAppStore((s) => s.addToast)

  const handleLogin = async (loginUser: string, loginPassword: string) => {
    setIsLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginUser, password: loginPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      const user: UserState = data.user
      setUser(user)
      if (data.token) setAuthToken(data.token)

      // Clear any leftover shift state from a previous user on the same browser,
      // then ask the server whether THIS user has an active shift.
      setShift(null)
      try {
        const shiftRes = await fetch('/api/shifts?action=active', {
          headers: { 'Authorization': `Bearer ${data.token}` },
        })
        const shiftData = await shiftRes.json()
        if (shiftData.active && shiftData.shift) {
          setShift({ id: shiftData.shift.id, startedAt: shiftData.shift.startedAt })
        }
      } catch { /* silent — shift check is non-blocking */ }

      // Redirect to POS if user doesn't have dashboard permission
      const hasDashboard = user.role === 'SUPER_ADMIN' || (user.permissions || []).includes('dashboard')
      setCurrentView(hasDashboard ? 'dashboard' : 'pos')
      addToast({
        title: 'Welcome back!',
        description: `Signed in as ${user.name}`,
        variant: 'success',
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleLogin(username, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 p-4">
      <div
        className="relative z-10 w-full max-w-md"
      >
        {/* Company Logo / Branding */}
        <div
          className="mb-8 text-center"
        >
          {branding.logo ? (
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center">
              <img
                src={branding.logo}
                alt={branding.name || 'Company logo'}
                className="h-20 w-20 object-contain"
              />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {branding.name || 'SelRx'}
          </h1>
          <p className="mt-1.5 text-emerald-200/70 text-sm font-medium">
            {branding.tagline || 'Pharmacy Management System'}
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-white/15 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-gray-900">
              Sign in to your account
            </CardTitle>
            <CardDescription className="text-gray-500">
              Enter your credentials to access the POS system
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Username or Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    type="text"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 h-11"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Footer */}
        <p
          className="mt-6 text-center text-xs text-emerald-200/60"
        >
          SelRx Pharmacy Management System
        </p>
      </div>
    </div>
  )
}
