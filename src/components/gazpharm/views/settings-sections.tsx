'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, Monitor, Info, Globe, CalendarDays, Clock, Database,
  Download, Upload, AlertTriangle, Loader2, CheckCircle2, XCircle,
  ShieldCheck, Type, Coins, Printer,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useAppStore, type DateFormatOption, type TimeFormatOption,
  type ReceiptFontFamily, type ReceiptFontSize,
} from '@/store/app-store'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { authHeaders } from '@/lib/auth-headers'

// ═══════════════════════════════════════════════════════════════════
// Shared data
// ═══════════════════════════════════════════════════════════════════

interface TZEntry { value: string; label: string; utc: string; country: string }

const WEST_AFRICAN_TZS: TZEntry[] = [
  { value: 'Africa/Lagos',       label: 'Lagos (WAT)',        utc: 'UTC+1',  country: 'Nigeria' },
  { value: 'Africa/Accra',       label: 'Accra (GMT)',        utc: 'UTC+0',  country: 'Ghana' },
  { value: 'Africa/Abidjan',     label: 'Abidjan (GMT)',      utc: 'UTC+0',  country: "C\u00f4te d'Ivoire" },
  { value: 'Africa/Dakar',       label: 'Dakar (GMT)',        utc: 'UTC+0',  country: 'Senegal' },
  { value: 'Africa/Bamako',      label: 'Bamako (GMT)',       utc: 'UTC+0',  country: 'Mali' },
  { value: 'Africa/Ouagadougou', label: 'Ouagadougou (GMT)',  utc: 'UTC+0',  country: 'Burkina Faso' },
  { value: 'Africa/Conakry',     label: 'Conakry (GMT)',      utc: 'UTC+0',  country: 'Guinea' },
  { value: 'Africa/Niamey',      label: 'Niamey (WAT)',       utc: 'UTC+1',  country: 'Niger' },
  { value: 'Africa/Cotonou',     label: 'Cotonou (WAT)',      utc: 'UTC+1',  country: 'Benin' },
  { value: 'Africa/Lome',        label: 'Lom\u00e9 (GMT)',       utc: 'UTC+0',  country: 'Togo' },
  { value: 'Africa/Nouakchott',  label: 'Nouakchott (GMT)',   utc: 'UTC+0',  country: 'Mauritania' },
  { value: 'Africa/Banjul',      label: 'Banjul (GMT)',       utc: 'UTC+0',  country: 'Gambia' },
  { value: 'Africa/Freetown',    label: 'Freetown (GMT)',     utc: 'UTC+0',  country: 'Sierra Leone' },
  { value: 'Africa/Monrovia',    label: 'Monrovia (GMT)',     utc: 'UTC+0',  country: 'Liberia' },
  { value: 'Africa/Sao_Tome',    label: 'S\u00e3o Tom\u00e9 (WAT)', utc: 'UTC+1',  country: 'S\u00e3o Tom\u00e9 & Pr\u00edncipe' },
  { value: 'Africa/Malabo',      label: 'Malabo (WAT)',       utc: 'UTC+1',  country: 'Equatorial Guinea' },
  { value: 'Africa/Libreville',  label: 'Libreville (WAT)',   utc: 'UTC+1',  country: 'Gabon' },
  { value: 'Africa/Brazzaville', label: 'Brazzaville (WAT)',  utc: 'UTC+1',  country: 'Congo' },
  { value: 'Africa/Kinshasa',    label: 'Kinshasa (WAT)',     utc: 'UTC+1',  country: 'DR Congo (west)' },
  { value: 'Africa/Douala',      label: 'Douala (WAT)',       utc: 'UTC+1',  country: 'Cameroon' },
  { value: 'Africa/Bangui',      label: 'Bangui (WAT)',       utc: 'UTC+1',  country: 'Central African Rep.' },
  { value: 'Africa/Ndjamena',    label: 'N\u2019Djamena (WAT)', utc: 'UTC+1', country: 'Chad' },
]

const OTHER_AFRICAN_TZS: TZEntry[] = [
  { value: 'Africa/Cairo',        label: 'Cairo (EET)',         utc: 'UTC+2',  country: 'Egypt' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', utc: 'UTC+2',  country: 'South Africa' },
  { value: 'Africa/Nairobi',      label: 'Nairobi (EAT)',       utc: 'UTC+3',  country: 'Kenya' },
  { value: 'Africa/Casablanca',   label: 'Casablanca (WET)',   utc: 'UTC+1',  country: 'Morocco' },
  { value: 'Africa/Tunis',        label: 'Tunis (CET)',        utc: 'UTC+1',  country: 'Tunisia' },
  { value: 'Africa/Algiers',      label: 'Algiers (CET)',      utc: 'UTC+1',  country: 'Algeria' },
  { value: 'Africa/Addis_Ababa',  label: 'Addis Ababa (EAT)',  utc: 'UTC+3',  country: 'Ethiopia' },
  { value: 'Africa/Dar_es_Salaam',label: 'Dar es Salaam (EAT)', utc: 'UTC+3', country: 'Tanzania' },
  { value: 'Africa/Lusaka',       label: 'Lusaka (CAT)',        utc: 'UTC+2',  country: 'Zambia' },
  { value: 'Africa/Harare',       label: 'Harare (CAT)',        utc: 'UTC+2',  country: 'Zimbabwe' },
  { value: 'Africa/Maputo',       label: 'Maputo (CAT)',        utc: 'UTC+2',  country: 'Mozambique' },
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

const FONT_FAMILIES: { value: ReceiptFontFamily; label: string; cssClass: string; sample: string }[] = [
  { value: 'mono',  label: 'Monospaced',  cssClass: 'font-mono',  sample: 'Courier New, monospace' },
  { value: 'sans',  label: 'Sans Serif',   cssClass: 'font-sans',  sample: 'Inter, Helvetica, Arial' },
  { value: 'serif', label: 'Serif',        cssClass: 'font-serif', sample: 'Georgia, Times New Roman' },
]

const FONT_SIZES: { value: ReceiptFontSize; label: string; sizeClass: string }[] = [
  { value: 'small',  label: 'Small  (10px)',  sizeClass: 'text-[10px]' },
  { value: 'medium', label: 'Medium (12px)', sizeClass: 'text-xs' },
  { value: 'large',  label: 'Large  (14px)',  sizeClass: 'text-sm' },
]

function getBaseSize(fs: ReceiptFontSize): string {
  if (fs === 'large') return '14px'
  if (fs === 'medium') return '12px'
  return '10px'
}

// ═══════════════════════════════════════════════════════════════════
// Regional Settings
// ═══════════════════════════════════════════════════════════════════

export function RegionalSettingsSection() {
  const timezone = useAppStore((s) => s.timezone)
  const setTimezone = useAppStore((s) => s.setTimezone)
  const dateFormat = useAppStore((s) => s.dateFormat)
  const setDateFormat = useAppStore((s) => s.setDateFormat)
  const timeFormat = useAppStore((s) => s.timeFormat)
  const setTimeFormat = useAppStore((s) => s.setTimeFormat)
  const regionalVersion = useAppStore((s) => s.regionalVersion)
  const addToast = useAppStore((s) => s.addToast)
  const company = useAppStore((s) => s.company)

  const [now, setNow] = useState(new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])

  const currentTZ = [...WEST_AFRICAN_TZS, ...OTHER_AFRICAN_TZS].find(t => t.value === timezone)
  const previewDate = now.toLocaleDateString('en-GB', { timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, dateFormat.includes('/') ? '/' : '-')
  const previewTime = now.toLocaleTimeString('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: timeFormat === '12h' })

  // trigger re-render when regional settings change
  useEffect(() => { /* regionalVersion: */ }, [regionalVersion])

  return (
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
  )
}

// ═══════════════════════════════════════════════════════════════════
// Currency Settings
// ═══════════════════════════════════════════════════════════════════

export function CurrencySettingsSection() {
  const currency = useAppStore((s) => s.currency)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const addToast = useAppStore((s) => s.addToast)

  return (
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
  )
}

// ═══════════════════════════════════════════════════════════════════
// Receipt Settings
// ═══════════════════════════════════════════════════════════════════

export function ReceiptSettingsSection() {
  const addToast = useAppStore((s) => s.addToast)
  const autoPrintReceipt = useAppStore((s) => s.autoPrintReceipt)
  const setAutoPrintReceipt = useAppStore((s) => s.setAutoPrintReceipt)
  const showReceiptModal = useAppStore((s) => s.showReceiptModal)
  const setShowReceiptModal = useAppStore((s) => s.setShowReceiptModal)
  const fontFamily = useAppStore((s) => s.fontFamily)
  const setFontFamily = useAppStore((s) => s.setFontFamily)
  const fontSize = useAppStore((s) => s.fontSize)
  const setFontSize = useAppStore((s) => s.setFontSize)
  const boldHeader = useAppStore((s) => s.boldHeader)
  const setBoldHeader = useAppStore((s) => s.setBoldHeader)
  const boldItems = useAppStore((s) => s.boldItems)
  const setBoldItems = useAppStore((s) => s.setBoldItems)
  const boldTotals = useAppStore((s) => s.boldTotals)
  const setBoldTotals = useAppStore((s) => s.setBoldTotals)
  const company = useAppStore((s) => s.company)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Printer className="h-4 w-4 text-blue-500" />
          Sales Receipt Settings
        </CardTitle>
        <CardDescription className="text-xs">
          Configure receipt printing behavior, text style, and font appearance
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
              <p className="text-xs text-muted-foreground mt-0.5">Automatically send the receipt to the printer after each completed sale</p>
            </div>
          </div>
          <Switch checked={autoPrintReceipt} onCheckedChange={(checked) => {
            setAutoPrintReceipt(checked)
            addToast({ title: checked ? 'Auto-print Enabled' : 'Auto-print Disabled', description: checked ? 'Receipts will print automatically after sales' : 'Receipts will not print automatically', variant: 'success' })
          }} />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <Label className="text-sm font-medium">Show Receipt Popup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Display a receipt preview modal after completing a sale. Disable to skip the popup entirely.</p>
            </div>
          </div>
          <Switch checked={showReceiptModal} onCheckedChange={(checked) => {
            setShowReceiptModal(checked)
            addToast({ title: checked ? 'Receipt Popup Enabled' : 'Receipt Popup Disabled', description: checked ? 'Receipt preview will appear after sales' : 'Receipt preview will be skipped', variant: 'success' })
          }} />
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            <Type className="h-4 w-4 text-blue-500" />
            <p className="text-xs font-semibold text-foreground">Print Text & Font Style</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Font Family</Label>
              <Select value={fontFamily} onValueChange={(val) => {
                setFontFamily(val as ReceiptFontFamily)
                addToast({ title: 'Font Updated', description: `Receipt font set to ${FONT_FAMILIES.find(f => f.value === val)?.label || val}`, variant: 'success' })
              }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_FAMILIES.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">
                      <span className={f.cssClass}>{f.label}</span>
                      <span className="ml-2 text-muted-foreground text-[10px]">{f.sample}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Font Size</Label>
              <Select value={fontSize} onValueChange={(val) => {
                setFontSize(val as ReceiptFontSize)
                addToast({ title: 'Size Updated', description: `Receipt font size set to ${FONT_SIZES.find(f => f.value === val)?.label || val}`, variant: 'success' })
              }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((f) => (
                    <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3">
            {([['Bold Pharmacy Header', 'Make the store name and tagline bold', boldHeader, setBoldHeader],
               ['Bold Item Names', 'Make product names on the receipt bold', boldItems, setBoldItems],
               ['Bold Totals', 'Make the total and payment amounts bold', boldTotals, setBoldTotals]] as const).map(([label, desc, val, set]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-xs font-medium">{label}</Label>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={val} onCheckedChange={(checked) => set(checked as boolean)} />
              </div>
            ))}
          </div>

          <Separator />

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Receipt Preview
            </p>
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-lg p-4 space-y-3" style={{
              fontFamily: fontFamily === 'sans' ? "'Inter', 'Helvetica Neue', Arial, sans-serif" : fontFamily === 'serif' ? "Georgia, 'Times New Roman', Times, serif" : "'Courier New', Courier, monospace",
              fontSize: getBaseSize(fontSize), lineHeight: '1.6',
            }}>
              <div className="text-center space-y-0.5">
                <p className={boldHeader ? 'font-bold tracking-wide' : 'tracking-wide'} style={{ fontSize: fontSize === 'large' ? '16px' : fontSize === 'medium' ? '13px' : '11px' }}>{company?.name || 'SelRx Pharmacy'}</p>
                <p className="text-gray-400" style={{ fontSize: fontSize === 'large' ? '11px' : fontSize === 'medium' ? '9px' : '8px', fontStyle: 'italic' }}>{company?.tagline || 'Your health, our priority'}</p>
              </div>
              <div className="border-t border-dashed border-gray-300" />
              <div className="flex justify-between"><span className="text-gray-500">Paracetamol 500mg</span><span className={boldItems ? 'font-bold' : ''}>2 x GHS 5.00</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Amoxicillin 250mg</span><span className={boldItems ? 'font-bold' : ''}>1 x GHS 12.50</span></div>
              <div className="border-t border-dashed border-gray-300" />
              <div className="flex justify-between"><span className="text-gray-500">Total:</span><span className={boldTotals ? 'font-bold' : ''}>GHS 22.50</span></div>
              <div className="border-t border-dashed border-gray-300" />
              <p className="text-center text-gray-400" style={{ fontSize: fontSize === 'large' ? '11px' : fontSize === 'medium' ? '9px' : '8px' }}>Thank you for choosing us!</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700">
            <p className="font-medium">Receipt Printer Setup</p>
            <p className="mt-0.5 text-blue-600">To use auto-print, configure your receipt printer in the Hardware settings page. Make sure the printer is connected and drivers are installed.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Backup & Restore + Auto-Backup (combined because they share state)
// ═══════════════════════════════════════════════════════════════════

interface BackupMeta { version: string; exportedAt: string; database: string; tableCount: number; totalRows: number }
interface RestoreResult {
  success: boolean
  summary: { totalInserted: number; totalUpdated: number; totalErrors: number; tablesProcessed: number }
  details: Record<string, { inserted: number; updated: number; skipped: number; errors: string[] }>
}
type RestorePhase = 'idle' | 'confirming' | 'uploading' | 'processing' | 'done' | 'error'

export function BackupRestoreSection() {
  return <_BackupSection />
}
export function AutoBackupSection() {
  return <_BackupSection autoOnly />
}

function _BackupSection({ autoOnly = false }: { autoOnly?: boolean }) {
  const addToast = useAppStore((s) => s.addToast)
  const [backup, setBackup] = useState({
    exporting: false, lastBackup: null as string | null, lastBackupRows: 0,
    autoBackupEnabled: false, autoBackupFrequency: 'daily',
    autoBackupLastBackup: null as string | null, autoBackupNextTime: null as number | null,
    autoBackupIsBackingUp: false,
  })
  const autoBackupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { /* prevents Turbopack TDZ */ }, [])
  const [restore, setRestore] = useState({
    phase: 'idle' as RestorePhase, progress: '', result: null as RestoreResult | null,
    selectedFile: null as File | null, error: '',
  })

  // Load auto-backup settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('selrx_auto_backup')
      if (saved) {
        const parsed = JSON.parse(saved)
        setBackup(b => ({ ...b, autoBackupEnabled: parsed.enabled || false, autoBackupFrequency: parsed.frequency || 'daily', autoBackupLastBackup: parsed.lastBackup || null }))
      }
    } catch { /* ignore */ }
  }, [])

  // Calculate next backup time
  useEffect(() => {
    if (!backup.autoBackupEnabled) { setBackup(b => ({ ...b, autoBackupNextTime: null })); return }
    const intervals: Record<string, number> = { 'hourly': 3600_000, '6hours': 6 * 3600_000, 'daily': 24 * 3600_000, 'weekly': 7 * 24 * 3600_000 }
    const interval = intervals[backup.autoBackupFrequency] || 24 * 3600_000
    const base = backup.autoBackupLastBackup ? new Date(backup.autoBackupLastBackup).getTime() : Date.now()
    setBackup(b => ({ ...b, autoBackupNextTime: base + interval }))
  }, [backup.autoBackupEnabled, backup.autoBackupFrequency, backup.autoBackupLastBackup])

  // Auto-backup timer
  useEffect(() => {
    if (autoBackupTimerRef.current) clearInterval(autoBackupTimerRef.current)
    if (!backup.autoBackupEnabled) return
    const intervals: Record<string, number> = { 'hourly': 3600_000, '6hours': 6 * 3600_000, 'daily': 24 * 3600_000, 'weekly': 7 * 24 * 3600_000 }
    const interval = intervals[backup.autoBackupFrequency] || 24 * 3600_000
    autoBackupTimerRef.current = setInterval(() => { handleRunBackupNow() }, interval)
    return () => { if (autoBackupTimerRef.current) clearInterval(autoBackupTimerRef.current) }
  }, [backup.autoBackupEnabled, backup.autoBackupFrequency])

  const handleBackupFrequencyChange = (freq: string) => {
    setBackup(b => ({ ...b, autoBackupFrequency: freq }))
    const saved = JSON.parse(localStorage.getItem('selrx_auto_backup') || '{}')
    localStorage.setItem('selrx_auto_backup', JSON.stringify({ ...saved, frequency: freq }))
  }

  const handleBackup = useCallback(async () => {
    setBackup(b => ({ ...b, exporting: true }))
    try {
      const res = await fetch('/api/backup', { headers: authHeaders() })
      if (!res.ok) throw new Error(`Backup failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `selrx-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
      const text = await blob.text()
      const json = JSON.parse(text)
      const meta = json.meta as BackupMeta
      setBackup(b => ({ ...b, lastBackup: meta.exportedAt, lastBackupRows: meta.totalRows }))
      addToast({ title: 'Backup Complete', description: `Exported ${meta.totalRows} rows across ${meta.tableCount} tables`, variant: 'success' })
    } catch (err: any) {
      addToast({ title: 'Backup Failed', description: err.message || 'Unknown error', variant: 'destructive' })
    } finally {
      setBackup(b => ({ ...b, exporting: false }))
    }
  }, [addToast])

  const handleRunBackupNow = useCallback(async () => {
    setBackup(b => ({ ...b, autoBackupIsBackingUp: true }))
    try {
      const res = await fetch('/api/backup', { headers: authHeaders() })
      if (!res.ok) throw new Error('Backup failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `selrx-auto-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
      const now = new Date().toISOString()
      setBackup(b => ({ ...b, autoBackupLastBackup: now }))
      localStorage.setItem('selrx_auto_backup', JSON.stringify({ enabled: backup.autoBackupEnabled, frequency: backup.autoBackupFrequency, lastBackup: now }))
      addToast({ title: 'Auto-Backup Complete', variant: 'success', duration: 3000 })
    } catch {
      addToast({ title: 'Auto-Backup Failed', variant: 'destructive', duration: 3000 })
    } finally {
      setBackup(b => ({ ...b, autoBackupIsBackingUp: false }))
    }
  }, [backup.autoBackupEnabled, backup.autoBackupFrequency, addToast])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setRestore(r => ({ ...r, selectedFile: file, phase: 'confirming', result: null, error: '' }))
    e.target.value = ''
  }
  const handleRestoreCancel = () => setRestore({ phase: 'idle', progress: '', result: null, selectedFile: null, error: '' })

  const handleRestoreConfirm = useCallback(async () => {
    if (!restore.selectedFile) return
    setRestore(r => ({ ...r, phase: 'uploading', progress: 'Reading backup file...' }))
    try {
      const text = await restore.selectedFile!.text()
      setRestore(r => ({ ...r, progress: 'Parsing backup data...' }))
      const json = JSON.parse(text)
      if (!json.data || typeof json.data !== 'object') throw new Error('Invalid backup file: missing data object')
      const tablesWithData = Object.entries(json.data).filter(([, rows]) => Array.isArray(rows) && rows.length > 0).map(([name, rows]) => `${name} (${(rows as any[]).length})`)
      setRestore(r => ({ ...r, progress: `Restoring ${tablesWithData.length} tables...` }))
      const res = await fetch('/api/backup/restore', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(json) })
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Restore failed' })); throw new Error(err.error || `HTTP ${res.status}`) }
      const result = res.json() as Promise<RestoreResult>
      const resolved = await result
      setRestore(r => ({ ...r, result: resolved, phase: 'done', progress: '' }))
      addToast({ title: 'Restore Complete', description: `Processed ${resolved.summary.tablesProcessed} tables: ${resolved.summary.totalInserted} inserted, ${resolved.summary.totalErrors} errors`, variant: resolved.summary.totalErrors > 0 ? 'destructive' : 'success' })
    } catch (err: any) {
      setRestore(r => ({ ...r, phase: 'error', error: err.message || 'Unknown error', progress: '' }))
      addToast({ title: 'Restore Failed', description: err.message || 'Unknown error', variant: 'destructive' })
    }
  }, [restore.selectedFile, addToast])

  if (autoOnly) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Automatic Backup Schedule
          </CardTitle>
          <CardDescription className="text-xs">Automatically back up your data at set intervals. Backups are saved as downloadable files.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Auto-Backup</p>
              <p className="text-xs text-muted-foreground">Runs backup in the background at the selected interval</p>
            </div>
            <Switch checked={backup.autoBackupEnabled} onCheckedChange={(v) => setBackup(b => ({ ...b, autoBackupEnabled: v }))} />
          </div>
          {backup.autoBackupEnabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Frequency</Label>
                  <Select value={backup.autoBackupFrequency} onValueChange={handleBackupFrequencyChange}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Every Hour</SelectItem>
                      <SelectItem value="6hours">Every 6 Hours</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Last Backup</Label>
                  <div className="h-9 flex items-center text-xs text-muted-foreground px-3 rounded-md border bg-muted/50">
                    {backup.autoBackupLastBackup ? new Date(backup.autoBackupLastBackup).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>
              {backup.autoBackupNextTime && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <Clock className="h-4 w-4 text-blue-500 shrink-0" />
                  <p className="text-xs text-blue-700">Next backup: <span className="font-medium">{new Date(backup.autoBackupNextTime).toLocaleString()}</span></p>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleRunBackupNow} disabled={backup.autoBackupIsBackingUp} className="gap-2 h-8 text-xs">
                {backup.autoBackupIsBackingUp ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Backing Up...</> : <><Download className="h-3.5 w-3.5" /> Backup Now</>}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Database className="h-4 w-4 text-violet-500" />
          Data Backup & Restore
        </CardTitle>
        <CardDescription className="text-xs">Export your entire database as a JSON file, or restore from a previous backup. Requires Super Admin privileges.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 mt-0.5"><Download className="h-4 w-4 text-violet-600" /></div>
            <div className="flex-1">
              <Label className="text-sm font-medium">Create Backup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Download a complete snapshot of all your data including products, inventory, transactions, customers, and settings.</p>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={backup.exporting} onClick={handleBackup}>
              {backup.exporting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting...</> : <><Download className="h-3.5 w-3.5" /> Download Backup</>}
            </Button>
          </div>
          {backup.lastBackup && (
            <div className="ml-11 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <div className="text-xs text-emerald-700">
                <span className="font-medium">Last backup:</span>{' '}
                {new Date(backup.lastBackup).toLocaleString()}
                <span className="text-emerald-600 ml-1.5">({backup.lastBackupRows.toLocaleString()} rows)</span>
              </div>
            </div>
          )}
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5"><Upload className="h-4 w-4 text-orange-600" /></div>
            <div className="flex-1">
              <Label className="text-sm font-medium">Restore from Backup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Upload a previously downloaded backup file. Existing data will be updated; new records will be inserted.</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-orange-200 text-orange-700 hover:bg-orange-50" disabled={restore.phase === 'uploading' || restore.phase === 'processing'} onClick={() => fileInputRef.current?.click()}>
              {restore.phase === 'uploading' || restore.phase === 'processing' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing...</> : <><Upload className="h-3.5 w-3.5" /> Upload File</>}
            </Button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileSelect} />
          </div>
          {restore.phase === 'confirming' && restore.selectedFile && (
            <div className="ml-11 rounded-lg border border-orange-200 bg-orange-50/50 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-800">
                  <p className="font-semibold">Confirm Restore</p>
                  <p className="mt-0.5 text-orange-700">File: <span className="font-medium">{restore.selectedFile.name}</span> ({(restore.selectedFile.size / 1024).toFixed(1)} KB)</p>
                  <p className="mt-1 text-orange-600">This will update existing records and add new ones from the backup. Existing data not in the backup will not be deleted.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRestoreCancel}>Cancel</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700"><ShieldCheck className="h-3 w-3 mr-1" /> Restore Data</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-500" />Confirm Data Restore</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <p>You are about to restore data from <span className="font-semibold">{restore.selectedFile.name}</span>. This action will update existing records and insert new ones.</p>
                        <p className="font-medium text-foreground">Make sure you have a recent backup before proceeding.</p>
                        <div className="rounded-md bg-orange-50 border border-orange-200 p-2 text-orange-800">
                          <p className="text-xs font-medium">What happens during restore:</p>
                          <ul className="text-xs mt-1 list-disc list-inside space-y-0.5">
                            <li>Existing records with matching IDs are updated</li><li>New records are inserted</li><li>Records not in the backup are left unchanged</li>
                          </ul>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel onClick={handleRestoreCancel}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-orange-600 hover:bg-orange-700" onClick={handleRestoreConfirm}>Yes, Restore Now</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
          {(restore.phase === 'uploading' || restore.phase === 'processing') && restore.progress && (
            <div className="ml-11 rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" /><p className="text-xs text-blue-700 font-medium">{restore.progress}</p>
            </div>
          )}
          {restore.phase === 'done' && restore.result && (
            <div className="ml-11 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><p className="text-xs font-semibold text-emerald-700">Restore Successful</p></div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="rounded bg-white/80 border p-2 text-center"><p className="text-lg font-bold text-emerald-700">{restore.result.summary.tablesProcessed}</p><p className="text-[10px] text-muted-foreground">Tables</p></div>
                <div className="rounded bg-white/80 border p-2 text-center"><p className="text-lg font-bold text-blue-700">{restore.result.summary.totalInserted}</p><p className="text-[10px] text-muted-foreground">Inserted</p></div>
                <div className="rounded bg-white/80 border p-2 text-center"><p className="text-lg font-bold text-red-600">{restore.result.summary.totalErrors}</p><p className="text-[10px] text-muted-foreground">Errors</p></div>
              </div>
              {Object.entries(restore.result.details).some(([, r]) => r.errors.length > 0) && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider">Tables with errors:</p>
                  {Object.entries(restore.result.details).filter(([, r]) => r.errors.length > 0).map(([table, r]) => (
                    <div key={table} className="rounded bg-red-50 border border-red-100 p-1.5 text-[10px]">
                      <span className="font-medium text-red-700">{table}:</span>{' '}<span className="text-red-600">{r.errors.length} error(s) — {r.errors[0]}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs mt-2" onClick={handleRestoreCancel}>Dismiss</Button>
            </div>
          )}
          {restore.phase === 'error' && restore.error && (
            <div className="ml-11 rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /><p className="text-xs font-semibold text-red-700">Restore Failed</p></div>
              <p className="text-xs text-red-600 ml-6">{restore.error}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs ml-6" onClick={handleRestoreCancel}>Dismiss</Button>
            </div>
          )}
        </div>
        <Separator />
        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
          <div className="text-xs text-violet-700">
            <p className="font-medium">Backup Recommendations</p>
            <p className="mt-0.5 text-violet-600">Create regular backups before making major changes (bulk imports, stock takes, pricing updates). Store backup files securely. The backup includes all data except user passwords for security.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════
// System Information
// ═══════════════════════════════════════════════════════════════════

export function SystemInfoSection() {
  const company = useAppStore((s) => s.company)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4 text-gray-500" />
          System Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Application</p><p className="font-medium mt-0.5">SelRx Pharmacy POS</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Version</p><p className="font-medium mt-0.5">v1.0.0</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Pharmacy</p><p className="font-medium mt-0.5">{company?.name || 'Not configured'}</p></div>
          <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Business Type</p><p className="font-medium mt-0.5 capitalize">{company?.businessType || 'N/A'}</p></div>
        </div>
      </CardContent>
    </Card>
  )
}
