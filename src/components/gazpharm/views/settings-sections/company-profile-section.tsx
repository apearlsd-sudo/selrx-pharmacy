'use client'

import { useState, useEffect } from 'react'
import { Building2, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'
import { authHeaders } from '@/lib/auth-headers'

interface CompanyFormData {
  name: string
  tagline: string
  phone: string
  email: string
  website: string
  address: string
  city: string
  state: string
  country: string
  postalCode: string
  registrationNo: string
  pharmacyLicense: string
  businessType: string
  currency: string
  timezone: string
  taxRate: string
}

const BUSINESS_TYPES = [
  'Pharmacy',
  'Hospital Pharmacy',
  'Chain Pharmacy',
  'Community Pharmacy',
  'Clinical Pharmacy',
  'Compounding Pharmacy',
  'Specialty Pharmacy',
  'Online Pharmacy',
]

const WEST_AFRICAN_TZS = [
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
  { value: 'Africa/Sao_Tome',    label: 'S\u00e3o Tom\u00e9 (WAT)', utc: 'UTC+1', country: 'S\u00e3o Tom\u00e9 & Pr\u00edncipe' },
  { value: 'Africa/Malabo',      label: 'Malabo (WAT)',       utc: 'UTC+1',  country: 'Equatorial Guinea' },
  { value: 'Africa/Libreville',  label: 'Libreville (WAT)',   utc: 'UTC+1',  country: 'Gabon' },
  { value: 'Africa/Brazzaville', label: 'Brazzaville (WAT)',  utc: 'UTC+1',  country: 'Congo' },
  { value: 'Africa/Kinshasa',    label: 'Kinshasa (WAT)',     utc: 'UTC+1',  country: 'DR Congo (west)' },
  { value: 'Africa/Douala',      label: 'Douala (WAT)',       utc: 'UTC+1',  country: 'Cameroon' },
  { value: 'Africa/Bangui',      label: 'Bangui (WAT)',       utc: 'UTC+1',  country: 'Central African Rep.' },
  { value: 'Africa/Ndjamena',    label: 'N\u2019Djamena (WAT)', utc: 'UTC+1', country: 'Chad' },
]

const OTHER_AFRICAN_TZS = [
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

const ALL_TZS = [...WEST_AFRICAN_TZS, ...OTHER_AFRICAN_TZS]

const EMPTY_FORM: CompanyFormData = {
  name: '',
  tagline: '',
  phone: '',
  email: '',
  website: '',
  address: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  registrationNo: '',
  pharmacyLicense: '',
  businessType: 'Pharmacy',
  currency: 'USD',
  timezone: 'Africa/Lagos',
  taxRate: '',
}

export function CompanyProfileSection() {
  const addToast = useAppStore((s) => s.addToast)
  const setCompany = useAppStore((s) => s.setCompany)
  const setTimezone = useAppStore((s) => s.setTimezone)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CompanyFormData>(EMPTY_FORM)

  // Fetch company data on mount
  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch('/api/company-setup', { headers: authHeaders() })
        const data = await res.json()
        if (!res.ok) {
          addToast({ title: 'Error', description: data.error || 'Failed to load company', variant: 'destructive' })
          return
        }
        const c = data.company
        if (c) {
          setForm({
            name: c.name || '',
            tagline: c.tagline || '',
            phone: c.phone || '',
            email: c.email || '',
            website: c.website || '',
            address: c.address || '',
            city: c.city || '',
            state: c.state || '',
            country: c.country || '',
            postalCode: c.postalCode || '',
            registrationNo: c.registrationNo || '',
            pharmacyLicense: c.pharmacyLicense || '',
            businessType: c.businessType || 'Pharmacy',
            currency: c.currency || 'USD',
            timezone: c.timezone || 'Africa/Lagos',
            taxRate: c.taxRate != null ? String(c.taxRate) : '',
          })
        }
      } catch {
        addToast({ title: 'Error', description: 'Network error loading company data', variant: 'destructive' })
      } finally {
        setLoading(false)
      }
    }
    fetchCompany()
  }, [])

  function updateField(field: keyof CompanyFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) {
      addToast({ title: 'Validation Error', description: 'Company name is required', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        tagline: form.tagline || null,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        country: form.country || null,
        postalCode: form.postalCode || null,
        registrationNo: form.registrationNo || null,
        pharmacyLicense: form.pharmacyLicense || null,
        businessType: form.businessType,
        currency: form.currency,
        timezone: form.timezone,
        taxRate: form.taxRate !== '' ? Number(form.taxRate) : null,
      }

      const res = await fetch('/api/company-setup', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ title: 'Save Failed', description: data.error || 'Failed to update company', variant: 'destructive' })
        return
      }

      // Update Zustand store
      const tz = data.timezone || form.timezone
      setCompany({
        id: data.id,
        name: data.name,
        slug: data.slug,
        logo: data.logo || null,
        tagline: data.tagline || null,
        businessType: data.businessType,
        currency: data.currency,
        timezone: tz,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        country: data.country || null,
        postalCode: data.postalCode || null,
        registrationNo: data.registrationNo || null,
        pharmacyLicense: data.pharmacyLicense || null,
        website: data.website || null,
      })

      // Sync timezone to live regional settings immediately
      setTimezone(tz)

      addToast({ title: 'Company Updated', description: 'Company profile has been saved successfully', variant: 'success' })
    } catch {
      addToast({ title: 'Error', description: 'Network error while saving', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading company data...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-500" />
          Company Profile
        </CardTitle>
        <CardDescription className="text-xs">
          Edit your pharmacy business information, contact details, and tax settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Business Information ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            Business Information
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Company Name <span className="text-red-500">*</span></Label>
              <Input className="h-9 text-xs" value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="e.g. HealthPlus Pharmacy" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tagline</Label>
              <Input className="h-9 text-xs" value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)} placeholder="e.g. Your health, our priority" />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Contact Details ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Contact Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Phone</Label>
              <Input className="h-9 text-xs" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="e.g. +234 123 456 7890" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Email</Label>
              <Input className="h-9 text-xs" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} placeholder="e.g. info@pharmacy.com" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Website</Label>
              <Input className="h-9 text-xs" value={form.website} onChange={(e) => updateField('website', e.target.value)} placeholder="e.g. https://www.pharmacy.com" />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Address ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Address</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Street Address</Label>
              <Input className="h-9 text-xs" value={form.address} onChange={(e) => updateField('address', e.target.value)} placeholder="e.g. 45 Broad Street, Marina" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">City</Label>
                <Input className="h-9 text-xs" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="e.g. Lagos" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">State / Province</Label>
                <Input className="h-9 text-xs" value={form.state} onChange={(e) => updateField('state', e.target.value)} placeholder="e.g. Lagos State" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Postal Code</Label>
                <Input className="h-9 text-xs" value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} placeholder="e.g. 100001" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Country</Label>
                <Input className="h-9 text-xs" value={form.country} onChange={(e) => updateField('country', e.target.value)} placeholder="e.g. Nigeria" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Registration & Licensing ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Registration & Licensing</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Registration No</Label>
              <Input className="h-9 text-xs" value={form.registrationNo} onChange={(e) => updateField('registrationNo', e.target.value)} placeholder="e.g. RC-1234567" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Pharmacy License</Label>
              <Input className="h-9 text-xs" value={form.pharmacyLicense} onChange={(e) => updateField('pharmacyLicense', e.target.value)} placeholder="e.g. PCN-XXXXX" />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Business Settings ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Business Settings</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Business Type</Label>
              <Select value={form.businessType} onValueChange={(val) => updateField('businessType', val)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {BUSINESS_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt} className="text-xs">{bt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Currency</Label>
              <Select value={form.currency} onValueChange={(val) => updateField('currency', val)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                    <SelectItem key={code} value={code} className="text-xs">
                      <span className="font-medium">{CURRENCIES[code].symbol}</span>
                      <span className="ml-1.5">{CURRENCIES[code].name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Timezone</Label>
              <Select value={form.timezone} onValueChange={(val) => updateField('timezone', val)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">West Africa</div>
                  {WEST_AFRICAN_TZS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value} className="text-xs">
                      <span className="font-medium">{tz.label}</span>
                      <span className="ml-1.5 text-muted-foreground">{tz.utc}</span>
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t mt-1 pt-2">Other African</div>
                  {OTHER_AFRICAN_TZS.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value} className="text-xs">
                      <span className="font-medium">{tz.label}</span>
                      <span className="ml-1.5 text-muted-foreground">{tz.utc}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Tax Rate ── */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">Tax Configuration</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tax Rate (%)</Label>
              <Input className="h-9 text-xs" type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(e) => updateField('taxRate', e.target.value)} placeholder="e.g. 7.5" />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Save Button ── */}
        <div className="flex justify-end">
          <Button size="sm" className="h-8 text-xs gap-1.5" disabled={saving} onClick={handleSave}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</> : <><Save className="h-3.5 w-3.5" /> Save Changes</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
