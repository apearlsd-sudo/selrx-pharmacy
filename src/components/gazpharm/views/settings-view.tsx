'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Settings as SettingsIcon,
  Coins,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  Building2,
  MapPin,
  Globe2,
  AlertTriangle,
  UserCog,
  Languages,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAppStore } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import {
  CURRENCIES,
  CURRENCY_LIST,
  formatCurrency,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/currency'
import {
  LANGUAGES,
  LANGUAGE_LIST,
  isLanguageCode,
  t,
  tf,
  type LanguageCode,
} from '@/lib/i18n'
import { UsersView } from '@/components/gazpharm/views/users-view'

interface CompanyInfo {
  id: string
  name: string
  currency: string
  language: string
  country: string | null
  city: string | null
}

type SettingsTab = 'currency' | 'language' | 'users'

export function SettingsView({ initialTab = 'currency' }: { initialTab?: SettingsTab } = {}) {
  const userRole = useAppStore((s) => s.user?.role)
  const userPerms = useAppStore((s) => s.user?.permissions) || []
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const addToast = useAppStore((s) => s.addToast)
  const hasPermission = useAppStore((s) => s.hasPermission)

  const canEdit =
    userRole === 'SUPER_ADMIN' ||
    userRole === 'PHARMACIST' ||
    userPerms.includes('settings:edit')

  const canManageUsers = hasPermission('users:manage')

  // Validate initialTab: 'users' requires canManageUsers; otherwise fall back to 'currency'.
  const validInitialTab: SettingsTab =
    initialTab === 'users' && canManageUsers ? 'users'
    : initialTab === 'language' ? 'language'
    : 'currency'

  const [activeTab, setActiveTab] = useState<SettingsTab>(validInitialTab)

  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState<CurrencyCode>(currency)
  const [pendingLanguage, setPendingLanguage] = useState<LanguageCode>(language)
  // Track which kind of save is in progress so the confirm dialog knows
  // whether to PATCH /api/settings/currency or /api/settings/language.
  const [confirmType, setConfirmType] = useState<'currency' | 'language' | null>(null)

  const fetchCompany = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch both currency and language in parallel
      const [curRes, langRes] = await Promise.all([
        fetch('/api/settings/currency', { headers: authHeaders() }),
        fetch('/api/settings/language', { headers: authHeaders() }),
      ])
      if (!curRes.ok || !langRes.ok) throw new Error('Failed to load company settings')
      const curData = await curRes.json()
      const langData = await langRes.json()
      // Merge — both endpoints return the same company row, but each only
      // selects its own field. Combine them so we have a single source of truth.
      const mergedCompany: CompanyInfo = {
        id: curData.company.id,
        name: curData.company.name,
        currency: curData.company.currency,
        language: langData.company.language,
        country: curData.company.country,
        city: curData.company.city,
      }
      setCompany(mergedCompany)
      if (isCurrencyCode(curData.company?.currency)) {
        setCurrency(curData.company.currency)
        setPendingCurrency(curData.company.currency)
      }
      if (isLanguageCode(langData.company?.language)) {
        setLanguage(langData.company.language)
        setPendingLanguage(langData.company.language)
      }
    } catch (err) {
      console.error('fetchCompany error:', err)
      addToast({
        title: t('settings.loadFailedTitle'),
        description: t('settings.loadFailedDesc'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [addToast, setCurrency, setLanguage])

  useEffect(() => {
    fetchCompany()
  }, [fetchCompany])

  const hasCurrencyChange = pendingCurrency !== currency
  const hasLanguageChange = pendingLanguage !== language

  const handleSaveCurrency = async () => {
    if (!hasCurrencyChange) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/currency', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ currency: pendingCurrency }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setCurrency(pendingCurrency)
      setCompany((prev) => prev ? { ...prev, currency: data.company.currency } : prev)
      addToast({
        title: t('settings.currencyUpdatedTitle'),
        description: tf('settings.currencyUpdatedDesc', { name: CURRENCIES[pendingCurrency].name, symbol: CURRENCIES[pendingCurrency].symbol }),
        variant: 'success',
        duration: 5000,
      })
      setConfirmType(null)
    } catch (err) {
      console.error('handleSaveCurrency error:', err)
      addToast({
        title: t('settings.currencySaveFailedTitle'),
        description: err instanceof Error ? err.message : t('common.error'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLanguage = async () => {
    if (!hasLanguageChange) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings/language', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ language: pendingLanguage }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Request failed (${res.status})`)
      }
      const data = await res.json()
      setLanguage(pendingLanguage)
      setCompany((prev) => prev ? { ...prev, language: data.company.language } : prev)
      addToast({
        title: pendingLanguage === 'fr' ? t('settings.languageUpdatedTitleFr') : t('settings.languageUpdatedTitle'),
        description:
          pendingLanguage === 'fr'
            ? t('settings.languageUpdatedDescFr')
            : tf('settings.languageUpdatedDesc', { name: LANGUAGES[pendingLanguage].englishLabel }),
        variant: 'success',
        duration: 5000,
      })
      setConfirmType(null)
    } catch (err) {
      console.error('handleSaveLanguage error:', err)
      addToast({
        title: t('settings.languageSaveFailedTitle'),
        description: err instanceof Error ? err.message : t('common.error'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setPendingCurrency(currency)
    setPendingLanguage(language)
  }

  // Sample amounts to preview formatting in each currency
  const sampleAmounts = [1234.56, 12.5, 0.99, 9876543.21]

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const activeCurrencyInfo = CURRENCIES[currency]
  const pendingCurrencyInfo = CURRENCIES[pendingCurrency]

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
          <SettingsIcon className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('settings.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('settings.subtitle')}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="currency" className="gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            {t('settings.currency')}
          </TabsTrigger>
          <TabsTrigger value="language" className="gap-1.5">
            <Languages className="h-3.5 w-3.5" />
            {t('settings.language')}
          </TabsTrigger>
          {canManageUsers && (
            <TabsTrigger value="users" className="gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              {t('settings.userManagement')}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Currency tab */}
        <TabsContent value="currency" className="space-y-6 mt-4">
      {/* Company context card */}
      {company && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t('settings.company')}
            </CardTitle>
            <CardDescription>
              {t('settings.companyDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('common.name')}</p>
                <p className="font-medium text-gray-900 truncate">{company.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {t('settings.location')}
                </p>
                <p className="font-medium text-gray-900 truncate">
                  {[company.city, company.country].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Globe2 className="h-3 w-3" /> {t('settings.activeCurrency')}
                </p>
                <p className="font-medium text-gray-900 flex items-center gap-2">
                  <span className="text-lg leading-none">{activeCurrencyInfo.symbol}</span>
                  <span>{activeCurrencyInfo.code}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {activeCurrencyInfo.name}
                  </Badge>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Languages className="h-3 w-3" /> {t('settings.activeLanguage')}
                </p>
                <p className="font-medium text-gray-900 flex items-center gap-2">
                  <span className="text-lg leading-none">{LANGUAGES[language].flag}</span>
                  <span>{LANGUAGES[language].label}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {LANGUAGES[language].englishLabel}
                  </Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Currency section — the main "Change Currency" action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-600" />
            {t('settings.currency')}
          </CardTitle>
          <CardDescription>
            {t('settings.currencyDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current / Pending visual cue */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border bg-emerald-50/50 p-4">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                {t('settings.current')}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-emerald-700">
                  {activeCurrencyInfo.symbol}
                </span>
                <span className="text-sm font-medium text-emerald-700">
                  {activeCurrencyInfo.code}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeCurrencyInfo.name}
              </p>
            </div>

            <div
              className={`rounded-lg border p-4 transition-colors ${
                hasCurrencyChange
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${
                  hasCurrencyChange ? 'text-amber-700' : 'text-gray-500'
                }`}
              >
                {hasCurrencyChange ? t('settings.pendingSave') : t('settings.noChanges')}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-3xl font-bold ${
                    hasCurrencyChange ? 'text-amber-700' : 'text-gray-400'
                  }`}
                >
                  {pendingCurrencyInfo.symbol}
                </span>
                <span
                  className={`text-sm font-medium ${
                    hasCurrencyChange ? 'text-amber-700' : 'text-gray-400'
                  }`}
                >
                  {pendingCurrencyInfo.code}
                </span>
              </div>
              <p className={`text-xs mt-1 ${hasCurrencyChange ? 'text-amber-700' : 'text-muted-foreground'}`}>
                {pendingCurrencyInfo.name}
              </p>
            </div>
          </div>

          {/* Currency picker */}
          <div className="space-y-2">
            <Label htmlFor="currency-select" className="text-sm font-medium">
              {t('settings.selectCurrency')}
            </Label>
            <Select
              value={pendingCurrency}
              onValueChange={(val) => setPendingCurrency(val as CurrencyCode)}
              disabled={!canEdit || saving}
            >
              <SelectTrigger id="currency-select" className="w-full">
                <SelectValue placeholder={t('settings.pickCurrencyPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_LIST.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-semibold mr-2">{c.symbol}</span>
                    <span className="font-medium">{c.code}</span>
                    <span className="text-muted-foreground ml-2">— {c.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">
                      ({c.countries.join(', ')})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {pendingCurrencyInfo.countries.length === 1
                ? tf('settings.usedInOne', { country: pendingCurrencyInfo.countries[0] })
                : tf('settings.usedInMany', { count: pendingCurrencyInfo.countries.length, countries: pendingCurrencyInfo.countries.join(', ') })}
            </p>
          </div>

          {/* Live preview */}
          <div className="rounded-lg border bg-white p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('settings.livePreview')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sampleAmounts.map((amt) => (
                <div key={amt} className="text-sm">
                  <p className="text-[10px] text-muted-foreground">{amt.toFixed(2)}</p>
                  <p className="font-mono font-semibold text-gray-900">
                    {formatCurrency(amt)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              {tf('settings.previewNote', { code: activeCurrencyInfo.code })}
            </p>
          </div>

          {!canEdit && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('settings.viewOnlyWarning')}</span>
            </div>
          )}

          {/* Action buttons */}
          <Separator />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {hasCurrencyChange ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <span>
                    {t('settings.unsavedChange')}: <strong>{activeCurrencyInfo.code}</strong> →{' '}
                    <strong>{pendingCurrencyInfo.code}</strong>
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{t('settings.allChangesSaved')}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!hasCurrencyChange || saving}
                className="text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {t('common.reset')}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmType('currency')}
                disabled={!hasCurrencyChange || !canEdit || saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {t('common.saveChanges')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        {/* Language tab */}
        <TabsContent value="language" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Languages className="h-5 w-5 text-emerald-600" />
                {t('settings.language')}
              </CardTitle>
              <CardDescription>
                {t('settings.languageDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Current / Pending visual cue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-emerald-50/50 p-4">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                    {t('settings.current')}
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl">{LANGUAGES[language].flag}</span>
                    <span className="text-lg font-bold text-emerald-700">
                      {LANGUAGES[language].label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {LANGUAGES[language].englishLabel}
                  </p>
                </div>

                <div
                  className={`rounded-lg border p-4 transition-colors ${
                    hasLanguageChange
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      hasLanguageChange ? 'text-amber-700' : 'text-gray-500'
                    }`}
                  >
                    {hasLanguageChange ? t('settings.pendingSave') : t('settings.noChanges')}
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={`text-3xl ${hasLanguageChange ? '' : 'opacity-50'}`}
                    >
                      {LANGUAGES[pendingLanguage].flag}
                    </span>
                    <span
                      className={`text-lg font-bold ${
                        hasLanguageChange ? 'text-amber-700' : 'text-gray-400'
                      }`}
                    >
                      {LANGUAGES[pendingLanguage].label}
                    </span>
                  </div>
                  <p
                    className={`text-xs mt-1 ${
                      hasLanguageChange ? 'text-amber-700' : 'text-muted-foreground'
                    }`}
                  >
                    {LANGUAGES[pendingLanguage].englishLabel}
                  </p>
                </div>
              </div>

              {/* Language picker */}
              <div className="space-y-2">
                <Label htmlFor="language-select" className="text-sm font-medium">
                  {t('settings.selectLanguage')}
                </Label>
                <Select
                  value={pendingLanguage}
                  onValueChange={(val) => setPendingLanguage(val as LanguageCode)}
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger id="language-select" className="w-full">
                    <SelectValue placeholder={t('settings.pickLanguagePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_LIST.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        <span className="font-semibold mr-2 text-base">{lang.flag}</span>
                        <span className="font-medium">{lang.label}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          ({lang.englishLabel})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Live preview */}
              <div className="rounded-lg border bg-white p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('settings.livePreview')}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">{t('settings.currency')}</p>
                    <p className="font-medium text-gray-900">{t('settings.language')}</p>
                    <p className="font-medium text-gray-900">{t('nav.settings')}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">{t('common.save')}</p>
                    <p className="font-medium text-gray-900">{t('common.cancel')}</p>
                    <p className="font-medium text-gray-900">{t('topbar.signOut')}</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  {t('settings.previewNoteLanguage')}
                </p>
              </div>

              {!canEdit && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{t('settings.viewOnlyWarning')}</span>
                </div>
              )}

              {/* Action buttons */}
              <Separator />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {hasLanguageChange ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span>
                        {t('settings.unsavedChange')}: <strong>{LANGUAGES[language].label}</strong> →{' '}
                        <strong>{LANGUAGES[pendingLanguage].label}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{t('settings.allChangesSaved')}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingLanguage(language)}
                    disabled={!hasLanguageChange || saving}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    {t('common.reset')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirmType('language')}
                    disabled={!hasLanguageChange || !canEdit || saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {t('common.saveChanges')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Management tab — embeds the existing UsersView (with its own internal Users / Roles sub-tabs) */}
        {canManageUsers && (
          <TabsContent value="users" className="mt-4">
            <UsersView embedded />
          </TabsContent>
        )}
      </Tabs>

      {/* Confirm dialog before persisting — renders different content for currency vs language */}
      <Dialog
        open={confirmType !== null}
        onOpenChange={(open) => { if (!open) setConfirmType(null) }}
      >
        <DialogContent className="max-w-md">
          {confirmType === 'currency' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-emerald-600" />
                  {t('settings.confirmCurrencyTitle')}
                </DialogTitle>
                <DialogDescription>
                  {tf('settings.confirmCurrencyDesc', { fromName: activeCurrencyInfo.name, fromSymbol: activeCurrencyInfo.symbol, toName: pendingCurrencyInfo.name, toSymbol: pendingCurrencyInfo.symbol })}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t('settings.languageAffects')}
                </p>
                <p className="ml-1">{t('settings.currencyAffectsList')}</p>
                <p className="pt-1">{t('settings.currencyNoAffect')}</p>
              </div>
            </>
          )}

          {confirmType === 'language' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Languages className="h-5 w-5 text-emerald-600" />
                  {t('settings.confirmLanguageTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('settings.confirmLanguageDesc')}{' '}
                  <strong className="text-gray-900">
                    {LANGUAGES[language].label}
                  </strong>{' '}
                  →{' '}
                  <strong className="text-gray-900">
                    {LANGUAGES[pendingLanguage].label}
                  </strong>
                  .
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {t('settings.languageAffects')}
                </p>
                <p className="ml-1">{t('settings.languageAffectsList')}</p>
                <p className="pt-1">{t('settings.languageNoAffect')}</p>
              </div>
            </>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmType(null)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirmType === 'currency') handleSaveCurrency()
                else if (confirmType === 'language') handleSaveLanguage()
              }}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  {t('settings.confirmSave')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
