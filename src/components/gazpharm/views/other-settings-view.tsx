'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  Coins,
  Printer,
  FileText,
  Monitor,
  Info,
  Globe,
  CalendarDays,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore, type DateFormatOption, type TimeFormatOption } from '@/store/app-store'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'

// ── Timezone data ─────────────────────────────────────────────────────

interface TZEntry {
  value: string
  label: string
  utc: string
  country: string
}

const WEST_AFRICAN_TZS: TZEntry[] = [
  { value: 'Africa/Lagos',      label: 'Lagos (WAT)',       utc: 'UTC+1',  country: 'Nigeria' },
  { value: 'Africa/Accra',      label: 'Accra (GMT)',      utc: 'UTC+0',  country: 'Ghana' },
  { value: 'Africa/Abidjan',    label: 'Abidjan (GMT)',    utc: 'UTC+0',  country: "C\u00f4te d'Ivoire" },
  { value: 'Africa/Dakar',      label: 'Dakar (GMT)',      utc: 'UTC+0',  country: 'Senegal' },
  { value: 'Africa/Bamako',     label: 'Bamako (GMT)',     utc: 'UTC+0',  country: 'Mali' },
  { value: 'Africa/Ouagadougou',label: 'Ouagadougou (GMT)',utc: 'UTC+0',  country: 'Burkina Faso' },
  { value: 'Africa/Conakry',    label: 'Conakry (GMT)',    utc: 'UTC+0',  country: 'Guinea' },
  { value: 'Africa/Niamey',     label: 'Niamey (WAT)',     utc: 'UTC+1',  country: 'Niger' },
  { value: 'Africa/Cotonou',    label: 'Cotonou (WAT)',    utc: 'UTC+1',  country: 'Benin' },
  { value: 'Africa/Lome',       label: 'Lom\u00e9 (GMT)',      utc: 'UTC+0',  country: 'Togo' },
  { value: 'Africa/Nouakchott', label: 'Nouakchott (GMT)', utc: 'UTC+0',  country: 'Mauritania' },
  { value: 'Africa/Banjul',     label: 'Banjul (GMT)',     utc: 'UTC+0',  country: 'Gambia' },
  { value: 'Africa/Freetown',   label: 'Freetown (GMT)',   utc: 'UTC+0',  country: 'Sierra Leone' },
  { value: 'Africa/Monrovia',   label: 'Monrovia (GMT)',   utc: 'UTC+0',  country: 'Liberia' },
  { value: 'Africa/Sao_Tome',   label: 'S\u00e3o Tom\u00e9 (WAT)',utc: 'UTC+1',  country: 'S\u00e3o Tom\u00e9 & Pr\u00edncipe' },
  { value: 'Africa/Malabo',     label: 'Malabo (WAT)',     utc: 'UTC+1',  country: 'Equatorial Guinea' },
  { value: 'Africa/Libreville', label: 'Libreville (WAT)', utc: 'UTC+1',  country: 'Gabon' },
  { value: 'Africa/Brazzaville',label: 'Brazzaville (WAT)',utc: 'UTC+1',  country: 'Congo' },
  { value: 'Africa/Kinshasa',   label: 'Kinshasa (WAT)',   utc: 'UTC+1',  country: 'DR Congo (west)' },
  { value: 'Africa/Douala',     label: 'Douala (WAT)',     utc: 'UTC+1',  country: 'Cameroon' },
  { value: 'Africa/Bangui',     label: 'Bangui (WAT)',     utc: 'UTC+1',  country: 'Central African Rep.' },
  { value: 'Africa/Ndjamena',   label: 'N\u2019Djamena (WAT)',utc: 'UTC+1', country: 'Chad' },
]

const OTHER_AFRICAN_TZS: TZEntry[] = [
  { value: 'Africa/Cairo',      label: 'Cairo (EET)',       utc: 'UTC+2',  country: 'Egypt' },
  { value: 'Africa/Johannesburg',label: 'Johannesburg (SAST)',utc: 'UTC+2', country: 'South Africa' },
  { value: 'Africa/Nairobi',    label: 'Nairobi (EAT)',     utc: 'UTC+3',  country: 'Kenya' },
  { value: 'Africa/Casablanca', label: 'Casablanca (WET)',  utc: 'UTC+1',  country: 'Morocco' },
  { value: 'Africa/Tunis',      label: 'Tunis (CET)',       utc: 'UTC+1',  country: 'Tunisia' },
  { value: 'Africa/Algiers',    label: 'Algiers (CET)',     utc: 'UTC+1',  country: 'Algeria' },
  { value: 'Africa/Addis_Ababa',label: 'Addis Ababa (EAT)',utc: 'UTC+3',  country: 'Ethiopia' },
  { value: 'Africa/Dar_es_Salaam',label:'Dar es Salaam (EAT)',utc:'UTC+3', country: 'Tanzania' },
  { value: 'Africa/Lusaka',     label: 'Lusaka (CAT)',      utc: 'UTC+2',  country: 'Zambia' },
  { value: 'Africa/Harare',     label: 'Harare (CAT)',      utc: 'UTC+2',  country: 'Zimbabwe' },
  { value: 'Africa/Maputo',     label: 'Maputo (CAT)',      utc: 'UTC+2',  country: 'Mozambique' },
]

const DATE_FORMATS: { value: DateFormatOption; label: string; example: string }[] = [
  { value: 'dd/mm/yyyy',   label: 'DD/MM/YYYY',   example: '02/08/2026' },
  { value: 'mm/dd/yyyy',   label: 'MM/DD/YYYY',   example: '08/02/2026' },
  { value: 'yyyy-mm-dd',   label: 'YYYY-MM-DD',   example: '2026-08-02' },
  { value: 'dd Mon yyyy',  label: 'DD Mon YYYY',  example: '02 Aug 2026' },
  { value: 'Mon dd, yyyy', label: 'Mon DD, YYYY', example: 'Aug 02, 2026' },
]

const TIME_FORMATS: { value: TimeFormatOption; label: string; example: string }[] = [
  { value: '24h', label: '24-hour', example: '14:30' },
  { value: '12h', label: '12-hour (AM/PM)', example: '2:30 PM' },
]

export function OtherSettingsView() {
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const autoPrintReceipt = useAppStore((s) => s.autoPrintReceipt)
  const setAutoPrintReceipt = useAppStore((s) => s.setAutoPrintReceipt)
  const showReceiptModal = useAppStore((s) => s.showReceiptModal)
  const setShowReceiptModal = useAppStore((s) => s.setShowReceiptModal)
  const addToast = useAppStore((s) => s.addToast)
  const company = useAppStore((s) => s.company)

  // Regional settings (hydrated at app level from localStorage)
  const timezone = useAppStore((s) => s.timezone)
  const setTimezone = useAppStore((s) => s.setTimezone)
  const dateFormat = useAppStore((s) => s.dateFormat)
  const setDateFormat = useAppStore((s) => s.setDateFormat)
  const timeFormat = useAppStore((s) => s.timeFormat)
  const setTimeFormat = useAppStore((s) => s.setTimeFormat)
  const regionalVersion = useAppStore((s) => s.regionalVersion)

  // Live preview clock
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const previewDate = now.toLocaleDateString(
    dateFormat === 'mm/dd/yyyy' || dateFormat === 'Mon dd, yyyy' ? 'en-US' :
    dateFormat === 'yyyy-mm-dd' ? 'en-CA' : 'en-GB',
    {
      timeZone: timezone,
      ...(dateFormat === 'dd Mon yyyy' ? { day: '2-digit', month: 'short', year: 'numeric' } :
        dateFormat === 'Mon dd, yyyy' ? { month: 'short', day: 'numeric', year: 'numeric' } : {}),
    }
  )
  const previewTime = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: timeFormat === '12h',
  })

  // Keep regionalVersion in scope so changing settings triggers re-render
  void regionalVersion

  const currentTZ = WEST_AFRICAN_TZS.find(t => t.value === timezone) || OTHER_AFRICAN_TZS.find(t => t.value === timezone)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-5 w-5 text-emerald-600" />
          Other Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure currency, date/time, receipt printing, and other preferences
        </p>
      </div>

      {/* ── Regional Settings ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-indigo-500" />
            Regional Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Set your timezone, date format, and time format. Changes apply across all pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Timezone */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Timezone
            </Label>
            <Select value={timezone} onValueChange={(val) => {
              setTimezone(val)
              const entry = [...WEST_AFRICAN_TZS, ...OTHER_AFRICAN_TZS].find(t => t.value === val)
              addToast({ title: 'Timezone Updated', description: `Switched to ${entry?.label || val} (${entry?.utc || ''})`, variant: 'success' })
            }}>
              <SelectTrigger className="h-9 w-full max-w-xs text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">West Africa</div>
                {WEST_AFRICAN_TZS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    <span className="font-medium">{tz.label}</span>
                    <span className="ml-1.5 text-muted-foreground">{tz.utc}</span>
                    <span className="ml-1 text-muted-foreground/60">{tz.country}</span>
                  </SelectItem>
                ))}
                <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 pt-2">Other African</div>
                {OTHER_AFRICAN_TZS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value} className="text-xs">
                    <span className="font-medium">{tz.label}</span>
                    <span className="ml-1.5 text-muted-foreground">{tz.utc}</span>
                    <span className="ml-1 text-muted-foreground/60">{tz.country}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Date Format */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              Date Format
            </Label>
            <Select value={dateFormat} onValueChange={(val) => {
              setDateFormat(val as DateFormatOption)
              addToast({ title: 'Date Format Updated', description: `Dates will display as ${val}`, variant: 'success' })
            }}>
              <SelectTrigger className="h-9 w-full max-w-xs text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-2 text-muted-foreground">e.g. {f.example}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Time Format */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Time Format
            </Label>
            <Select value={timeFormat} onValueChange={(val) => {
              setTimeFormat(val as TimeFormatOption)
              addToast({ title: 'Time Format Updated', description: `Time will display in ${val === '12h' ? '12-hour' : '24-hour'} format`, variant: 'success' })
            }}>
              <SelectTrigger className="h-9 w-full max-w-xs text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="ml-2 text-muted-foreground">e.g. {f.example}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Live Preview */}
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 space-y-2">
            <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Live Preview
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/80 border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Date</p>
                <p className="text-lg font-bold text-foreground mt-0.5 font-mono">{previewDate}</p>
              </div>
              <div className="rounded-lg bg-white/80 border p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current Time</p>
                <p className="text-lg font-bold text-foreground mt-0.5 font-mono">{previewTime}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="text-[10px] bg-indigo-100 text-indigo-700 border-indigo-200">{currentTZ?.label || timezone}</Badge>
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">{currentTZ?.utc || ''}</Badge>
              <span className="text-[10px] text-muted-foreground">{currentTZ?.country || ''}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Currency Settings ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-500" />
            Currency Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Select the local currency used for all prices and transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-xs font-medium w-20 shrink-0">Currency</Label>
            <Select value={currency} onValueChange={(val) => {
              setCurrency(val as CurrencyCode)
              addToast({ title: 'Currency Updated', description: `Switched to ${CURRENCIES[val as CurrencyCode].name}`, variant: 'success' })
            }}>
              <SelectTrigger className="h-9 w-full max-w-xs text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-medium">{CURRENCIES[code].symbol}</span>
                    <span className="ml-1.5">{CURRENCIES[code].name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-lg font-bold text-amber-700">{CURRENCIES[currency].symbol}</span>
            </div>
            <div>
              <p className="text-sm font-medium">{CURRENCIES[currency].name}</p>
              <p className="text-xs text-muted-foreground">Code: {currency} &middot; {CURRENCIES[currency].country}</p>
            </div>
            <Badge className="ml-auto text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* ── Receipt Printing Settings ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-500" />
            Sales Receipt Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Configure how receipts are handled after completing a sale
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <Printer className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <Label className="text-sm font-medium">Auto-print Receipt</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically send the receipt to the printer after each completed sale
                </p>
              </div>
            </div>
            <Switch
              checked={autoPrintReceipt}
              onCheckedChange={(checked) => {
                setAutoPrintReceipt(checked)
                addToast({
                  title: checked ? 'Auto-print Enabled' : 'Auto-print Disabled',
                  description: checked ? 'Receipts will print automatically after sales' : 'Receipts will not print automatically',
                  variant: 'success',
                })
              }}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <Label className="text-sm font-medium">Show Receipt Popup</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Display a receipt preview modal after completing a sale. Disable to skip the popup entirely.
                </p>
              </div>
            </div>
            <Switch
              checked={showReceiptModal}
              onCheckedChange={(checked) => {
                setShowReceiptModal(checked)
                addToast({
                  title: checked ? 'Receipt Popup Enabled' : 'Receipt Popup Disabled',
                  description: checked ? 'Receipt preview will appear after sales' : 'Receipt preview will be skipped',
                  variant: 'success',
                })
              }}
            />
          </div>

          <Separator />

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-medium">Receipt Printer Setup</p>
              <p className="mt-0.5 text-blue-600">
                To use auto-print, configure your receipt printer in the Hardware settings page.
                Make sure the printer is connected and drivers are installed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── System Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-gray-500" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Application</p>
              <p className="font-medium mt-0.5">SelRx Pharmacy POS</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Version</p>
              <p className="font-medium mt-0.5">v1.0.0</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Pharmacy</p>
              <p className="font-medium mt-0.5">{company?.name || 'Not configured'}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground">Business Type</p>
              <p className="font-medium mt-0.5 capitalize">{company?.businessType || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
