'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Pill,
  Building2,
  User,
  MapPin,
  DollarSign,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Phone,
  Globe,
  FileText,
  Landmark,
  Store,
  Briefcase,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { CURRENCIES, type CurrencyCode } from '@/lib/currency'

// Step configuration
const STEPS = [
  { id: 1, label: 'Welcome', icon: Sparkles },
  { id: 2, label: 'Company', icon: Building2 },
  { id: 3, label: 'Owner Account', icon: User },
  { id: 4, label: 'Address', icon: MapPin },
  { id: 5, label: 'Preferences', icon: DollarSign },
] as const

const BUSINESS_TYPES = [
  { value: 'Pharmacy', label: 'Pharmacy', desc: 'Retail or community pharmacy' },
  { value: 'Hospital Pharmacy', label: 'Hospital Pharmacy', desc: 'In-patient hospital pharmacy' },
  { value: 'Clinic', label: 'Clinic', desc: 'Medical clinic with dispensing' },
  { value: 'Drug Store', label: 'Drug Store', desc: 'General drug store' },
  { value: 'Chain Pharmacy', label: 'Chain Pharmacy', desc: 'Multi-branch pharmacy chain' },
  { value: 'Online Pharmacy', label: 'Online Pharmacy', desc: 'E-commerce pharmacy' },
  { value: 'Wholesale', label: 'Wholesale Distributor', desc: 'Pharmaceutical wholesaler' },
]

const AFRICAN_COUNTRIES = [
  'Ghana', 'Nigeria', 'Kenya', 'South Africa', 'Tanzania', 'Uganda',
  'Rwanda', 'Ethiopia', 'Senegal', 'Cameroon', 'Cote d\'Ivoire', 'Mozambique',
  'Zambia', 'Zimbabwe', 'Botswana', 'Namibia', 'Malawi', 'Liberia',
  'Sierra Leone', 'Gambia', 'Togo', 'Benin', 'Mali', 'Burkina Faso',
  'Niger', 'Chad', 'Congo', 'DR Congo', 'Angola', 'Madagascar',
  'Other',
]

const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Africa/Accra', label: 'Accra (GMT+0)' },
  { value: 'Africa/Lagos', label: 'Lagos (GMT+1)' },
  { value: 'Africa/Nairobi', label: 'Nairobi (GMT+3)' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg (GMT+2)' },
  { value: 'Africa/Cairo', label: 'Cairo (GMT+2)' },
  { value: 'Africa/Dar_es_Salaam', label: 'Dar es Salaam (GMT+3)' },
  { value: 'Africa/Kampala', label: 'Kampala (GMT+3)' },
  { value: 'Africa/Addis_Ababa', label: 'Addis Ababa (GMT+3)' },
]

export function CompanySetupView() {
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const setCompany = useAppStore((s) => s.setCompany)
  const setIsCompanySetup = useAppStore((s) => s.setIsCompanySetup)
  const setCurrency = useAppStore((s) => s.setCurrency)
  const setUser = useAppStore((s) => s.setUser)
  const addToast = useAppStore((s) => s.addToast)

  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form fields
  const [companyName, setCompanyName] = useState('')
  const [tagline, setTagline] = useState('')
  const [businessType, setBusinessType] = useState('Pharmacy')
  const [registrationNo, setRegistrationNo] = useState('')
  const [pharmacyLicense, setPharmacyLicense] = useState('')
  const [taxId, setTaxId] = useState('')

  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [country, setCountry] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')

  const [currency, setCurrencyState] = useState<CurrencyCode>('USD')
  const [timezone, setTimezone] = useState('UTC')

  // Validate step
  const getStepError = (): string => {
    switch (currentStep) {
      case 2:
        if (!companyName.trim()) return 'Company name is required'
        if (!businessType) return 'Business type is required'
        return ''
      case 3:
        if (!ownerName.trim()) return 'Owner name is required'
        if (!ownerEmail.trim()) return 'Email is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return 'Please enter a valid email'
        if (!ownerPassword) return 'Password is required'
        if (ownerPassword.length < 6) return 'Password must be at least 6 characters'
        if (ownerPassword !== confirmPassword) return 'Passwords do not match'
        return ''
      case 4:
        if (!address.trim()) return 'Address is required'
        if (!city.trim()) return 'City is required'
        if (!country) return 'Country is required'
        return ''
      case 5:
        return ''
      default:
        return ''
    }
  }

  const canProceed = (): boolean => {
    return getStepError() === ''
  }

  const goNext = () => {
    if (!canProceed()) return
    setError('')
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1)
    }
  }

  const goBack = () => {
    setError('')
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Submit the full form
  const handleSubmit = async () => {
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/company-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          tagline: tagline || null,
          businessType,
          registrationNo: registrationNo || null,
          pharmacyLicense: pharmacyLicense || null,
          taxId: taxId || null,
          phone: phone || null,
          email: ownerEmail,
          website: website || null,
          address,
          city,
          state: stateRegion || null,
          country,
          postalCode: postalCode || null,
          currency,
          timezone,
          ownerName,
          ownerEmail,
          ownerPhone: ownerPhone || null,
          ownerPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create company')
        return
      }

      // Store company info in Zustand
      setCompany({
        id: data.company.id,
        name: data.company.name,
        slug: data.company.slug,
        logo: null,
        tagline: tagline || null,
        businessType: data.company.businessType,
        currency: data.company.currency,
        phone: phone || null,
        email: ownerEmail,
        city,
        country,
      })
      setIsCompanySetup(true)
      setCurrency(currency)

      // Auto-login the owner
      setUser({
        id: data.owner.id,
        name: data.owner.name,
        email: data.owner.email,
        role: data.owner.role,
      })
      setCurrentView('dashboard')

      addToast({
        title: 'Welcome to GAZPharm!',
        description: `${data.company.name} has been set up successfully. You are now logged in as ${data.owner.name}.`,
        variant: 'success',
        duration: 8000,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-emerald-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-teal-600/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/3 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Top bar with branding */}
        <header className="flex items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center">
              <Pill className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">GAZPharm</h1>
              <p className="text-[10px] text-emerald-200/60">Pharmacy Management System</p>
            </div>
          </div>

          {/* Step indicators */}
          <div className="hidden md:flex items-center gap-1">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-300 ${
                  currentStep >= step.id
                    ? 'bg-white/15 text-white ring-1 ring-white/20'
                    : 'text-emerald-200/40'
                }`}>
                  {currentStep > step.id ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] font-bold">{step.id}</span>
                  )}
                  <span className="hidden lg:inline">{step.label}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <ChevronRight className={`h-3 w-3 mx-0.5 ${currentStep > step.id ? 'text-white/40' : 'text-emerald-200/20'}`} />
                )}
              </div>
            ))}
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center px-4 pb-8 pt-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-2xl"
          >
            <AnimatePresence mode="wait">
              {/* ====== STEP 1: Welcome ====== */}
              {currentStep === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                  className="text-center space-y-6"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.5, type: 'spring' }}
                    className="mx-auto mb-4"
                  >
                    <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20">
                      <Store className="h-12 w-12 text-emerald-300" />
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                      Set Up Your Pharmacy
                    </h2>
                    <p className="mt-3 text-emerald-200/80 text-base max-w-lg mx-auto leading-relaxed">
                      Welcome to GAZPharm! Let&apos;s get your pharmacy account set up in just a few minutes.
                      We&apos;ll collect your company details, create your owner account, and have you ready to go.
                    </p>
                  </motion.div>

                  {/* Feature highlights */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 max-w-lg mx-auto">
                    {[
                      { icon: ShieldCheck, label: 'Secure & Reliable' },
                      { icon: DollarSign, label: 'Multi-Currency' },
                      { icon: Globe, label: 'Cloud-Based POS' },
                    ].map((feat) => (
                      <div
                        key={feat.label}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/5 backdrop-blur-sm ring-1 ring-white/10"
                      >
                        <feat.icon className="h-5 w-5 text-emerald-300" />
                        <span className="text-xs font-medium text-emerald-200/80">{feat.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-6">
                    <Button
                      onClick={goNext}
                      size="lg"
                      className="bg-white text-emerald-800 hover:bg-emerald-50 font-semibold h-12 px-8 rounded-xl shadow-lg shadow-emerald-900/20"
                    >
                      Get Started
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                    <p className="mt-3 text-xs text-emerald-200/50">
                      This will take about 3-5 minutes
                    </p>
                  </div>
                </motion.div>
              )}

              {/* ====== STEP 2: Company Details ====== */}
              {currentStep === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Company Details</h3>
                          <p className="text-xs text-emerald-100/80">Tell us about your business</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {error && currentStep === 2 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="companyName" className="text-sm font-medium">
                          Company / Pharmacy Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="companyName"
                          placeholder="e.g. GreenLeaf Pharmacy"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="h-11"
                          autoFocus
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tagline" className="text-sm font-medium">Tagline / Slogan</Label>
                        <Input
                          id="tagline"
                          placeholder="e.g. Your trusted health partner"
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Business Type <span className="text-red-500">*</span>
                        </Label>
                        <Select value={businessType} onValueChange={setBusinessType}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select business type" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUSINESS_TYPES.map((bt) => (
                              <SelectItem key={bt.value} value={bt.value}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{bt.label}</span>
                                  <span className="text-[10px] text-muted-foreground">{bt.desc}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="registrationNo" className="text-sm font-medium">
                            <Landmark className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                            Registration No.
                          </Label>
                          <Input
                            id="registrationNo"
                            placeholder="Business reg. number"
                            value={registrationNo}
                            onChange={(e) => setRegistrationNo(e.target.value)}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="pharmacyLicense" className="text-sm font-medium">
                            <FileText className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                            Pharmacy License No.
                          </Label>
                          <Input
                            id="pharmacyLicense"
                            placeholder="License number"
                            value={pharmacyLicense}
                            onChange={(e) => setPharmacyLicense(e.target.value)}
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="taxId" className="text-sm font-medium">Tax ID / VAT Number</Label>
                        <Input
                          id="taxId"
                          placeholder="Tax identification number"
                          value={taxId}
                          onChange={(e) => setTaxId(e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ====== STEP 3: Owner Account ====== */}
              {currentStep === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                          <User className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Owner Account</h3>
                          <p className="text-xs text-emerald-100/80">Create your administrator credentials</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {error && currentStep === 3 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                      )}

                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
                        <ShieldCheck className="h-4 w-4 inline mr-1.5" />
                        This account will be created as <strong>Super Administrator</strong> with full access to all features. You can add more users later.
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ownerName" className="text-sm font-medium">
                          Full Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ownerName"
                          placeholder="e.g. Dr. Kwame Asante"
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          className="h-11"
                          autoFocus
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ownerEmail" className="text-sm font-medium">
                          <Mail className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                          Email Address <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="ownerEmail"
                          type="email"
                          placeholder="owner@example.com"
                          value={ownerEmail}
                          onChange={(e) => setOwnerEmail(e.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ownerPhone" className="text-sm font-medium">
                          <Phone className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                          Phone Number
                        </Label>
                        <Input
                          id="ownerPhone"
                          placeholder="+233 XXX XXX XXX"
                          value={ownerPhone}
                          onChange={(e) => setOwnerPhone(e.target.value)}
                          className="h-11"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="ownerPassword" className="text-sm font-medium">
                            <Lock className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                            Password <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="ownerPassword"
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Min. 6 characters"
                              value={ownerPassword}
                              onChange={(e) => setOwnerPassword(e.target.value)}
                              className="h-11 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword" className="text-sm font-medium">
                            Confirm Password <span className="text-red-500">*</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="confirmPassword"
                              type={showConfirm ? 'text' : 'password'}
                              placeholder="Re-enter password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="h-11 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirm(!showConfirm)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ====== STEP 4: Business Address ====== */}
              {currentStep === 4 && (
                <motion.div
                  key="step-4"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                          <MapPin className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Business Address</h3>
                          <p className="text-xs text-emerald-100/80">Where is your pharmacy located?</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {error && currentStep === 4 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="address" className="text-sm font-medium">
                          Street Address <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="address"
                          placeholder="e.g. 45 High Street, Osu"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="h-11"
                          autoFocus
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="city" className="text-sm font-medium">
                            City <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            id="city"
                            placeholder="e.g. Accra"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stateRegion" className="text-sm font-medium">
                            State / Region
                          </Label>
                          <Input
                            id="stateRegion"
                            placeholder="e.g. Greater Accra"
                            value={stateRegion}
                            onChange={(e) => setStateRegion(e.target.value)}
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Country <span className="text-red-500">*</span>
                        </Label>
                        <Select value={country} onValueChange={setCountry}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {AFRICAN_COUNTRIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="postalCode" className="text-sm font-medium">Postal Code</Label>
                          <Input
                            id="postalCode"
                            placeholder="e.g. GA-123"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="phone" className="text-sm font-medium">
                            <Phone className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                            Business Phone
                          </Label>
                          <Input
                            id="phone"
                            placeholder="+233 XXX XXX XXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="website" className="text-sm font-medium">
                          <Globe className="h-3.5 w-3.5 inline mr-1 text-muted-foreground" />
                          Website (optional)
                        </Label>
                        <Input
                          id="website"
                          placeholder="https://www.example.com"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ====== STEP 5: Preferences ====== */}
              {currentStep === 5 && (
                <motion.div
                  key="step-5"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                          <DollarSign className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Preferences</h3>
                          <p className="text-xs text-emerald-100/80">Set your currency and timezone</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">
                      {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                      )}

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Default Currency</Label>
                        <Select value={currency} onValueChange={(val) => setCurrencyState(val as CurrencyCode)}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => (
                              <SelectItem key={code} value={code}>
                                <span className="font-medium">{CURRENCIES[code].symbol}</span>
                                <span className="ml-1.5">{CURRENCIES[code].code}</span>
                                <span className="ml-1.5 text-muted-foreground">- {CURRENCIES[code].name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Timezone</Label>
                        <Select value={timezone} onValueChange={setTimezone}>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Summary */}
                      <div className="border-t pt-5 mt-6">
                        <h4 className="text-sm font-semibold text-gray-900 mb-4">Review Summary</h4>
                        <div className="space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <span className="text-muted-foreground">Company Name</span>
                            <span className="font-medium text-right">{companyName || '-'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <span className="text-muted-foreground">Business Type</span>
                            <span className="font-medium text-right">{businessType}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <span className="text-muted-foreground">Owner</span>
                            <span className="font-medium text-right">{ownerName || '-'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-medium text-right">{ownerEmail || '-'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                            <span className="text-muted-foreground">Location</span>
                            <span className="font-medium text-right">{city ? `${city}, ${country}` : '-'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                            <span className="text-muted-foreground">Currency</span>
                            <span className="font-semibold text-emerald-700 text-right">{CURRENCIES[currency].symbol} {CURRENCIES[currency].name}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation Buttons (shown on steps 2-5) */}
            {currentStep > 1 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center justify-between mt-6"
              >
                <Button
                  variant="outline"
                  onClick={goBack}
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>

                {currentStep < 5 ? (
                  <Button
                    onClick={goNext}
                    className="bg-white text-emerald-800 hover:bg-emerald-50 font-semibold h-11 px-6"
                    disabled={!canProceed()}
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold h-11 px-8 rounded-xl shadow-lg"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Create My Account
                      </>
                    )}
                  </Button>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-emerald-200/40">
            GAZPharm Pharmacy Management System v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
