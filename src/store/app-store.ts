import { create } from 'zustand'
import type { CurrencyCode } from '@/lib/currency'

// ============ TYPE EXPORTS ============

export type ViewName =
  | 'company-setup'
  | 'login'
  | 'dashboard'
  | 'pos'
  | 'inventory'
  | 'prescriptions'
  | 'customers'
  | 'users'
  | 'hardware'
  | 'settings'
  | 'reports'
  | 'master-data'
  | 'sales-history'
  | 'returns'
  | 'product-sales-analytics'
  | 'stock-take'
  | 'stock-take-report'
  | 'advanced-reports'
  | 'drug-interactions'
  | 'purchase-orders'
  | 'access-logs'
  | 'audit-logs'
  | 'login-history'

export type PaymentMethodType =
  | 'CASH'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'INSURANCE'
  | 'FSA_HSA'
  | 'SPLIT'

export interface UserState {
  id: string
  name: string
  email: string
  role: string
  roleLabel?: string
  permissions: string[]
}

export interface CartItem {
  product: {
    id: string
    name: string
    ndc?: string
    sellingPrice: number
    requiresPrescription: boolean
    unitOfMeasure: string
    sellingUnit: string
    itemsPerUnit: number
    strength?: string
    dosageForm?: string
  }
  quantity: number
}

export interface Customer {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  address?: string | null
  insuranceProvider?: string | null
  insurancePolicyNo?: string | null
  allergies?: string | null
  notes?: string | null
}

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
}

// ============ SLICE TYPES ============

export interface NavigationState {
  currentView: ViewName
  setCurrentView: (view: ViewName) => void
  sidebarOpen: boolean
  toggleSidebar: () => void
  stockTakeReportId: string | null
  setStockTakeReportId: (id: string | null) => void
}

export interface AuthState {
  user: UserState | null
  isAuthenticated: boolean
  authToken: string | null
  setUser: (user: UserState | null) => void
  setAuthToken: (token: string | null) => void
  logout: () => void
  hasPermission: (requiredRoles: string[]) => boolean
}

export interface POSState {
  cart: CartItem[]
  addToCart: (
    product: CartItem['product'],
    quantity: number
  ) => void
  removeFromCart: (productId: string) => void
  updateCartQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  cartSubtotal: number
  cartTax: number
  cartTotal: number
  selectedCustomer: Customer | null
  setSelectedCustomer: (customer: Customer | null) => void
  paymentMethod: PaymentMethodType
  setPaymentMethod: (method: PaymentMethodType) => void
  isProcessingPayment: boolean
  setIsProcessingPayment: (val: boolean) => void
}

export interface InventoryUIState {
  inventoryItems: any[]
  setInventoryItems: (items: any[]) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterCategory: string
  setFilterCategory: (cat: string) => void
  stockAlerts: any[]
  setStockAlerts: (alerts: any[]) => void
  /** Monotonic counter bumped whenever inventory changes; views subscribe to re-fetch */
  inventoryVersion: number
  bumpInventoryVersion: () => void
}

export interface CompanyState {
  company: {
    id: string
    name: string
    slug: string
    logo: string | null
    tagline: string | null
    businessType: string
    currency: string
    timezone: string
    phone: string | null
    email: string | null
    address: string | null
    city: string | null
    state: string | null
    country: string | null
    postalCode: string | null
    registrationNo: string | null
    pharmacyLicense: string | null
    website: string | null
  } | null
  setCompany: (company: CompanyState['company']) => void
  isCompanySetup: boolean
  setIsCompanySetup: (val: boolean) => void
}

export interface CurrencyState {
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
}

export type ReceiptFontFamily = 'mono' | 'sans' | 'serif'
export type ReceiptFontSize = 'small' | 'medium' | 'large'

export interface ReceiptPrintStyle {
  /** Font family for the receipt */
  fontFamily: ReceiptFontFamily
  setFontFamily: (val: ReceiptFontFamily) => void
  /** Base font size */
  fontSize: ReceiptFontSize
  setFontSize: (val: ReceiptFontSize) => void
  /** Whether the pharmacy name header is bold */
  boldHeader: boolean
  setBoldHeader: (val: boolean) => void
  /** Whether item names on the receipt are bold */
  boldItems: boolean
  setBoldItems: (val: boolean) => void
  /** Whether totals section is bold */
  boldTotals: boolean
  setBoldTotals: (val: boolean) => void
  /** Custom header lines displayed below pharmacy info (newline-separated) */
  receiptHeader: string
  setReceiptHeader: (val: string) => void
  /** Custom footer lines displayed above "End of Receipt" (newline-separated) */
  receiptFooter: string
  setReceiptFooter: (val: string) => void
}

export interface ReceiptSettingsState {
  /** Automatically print receipt after a successful sale */
  autoPrintReceipt: boolean
  setAutoPrintReceipt: (val: boolean) => void
  /** Show receipt modal dialog after sale (set to false to skip) */
  showReceiptModal: boolean
  setShowReceiptModal: (val: boolean) => void
}

export type DateFormatOption = 'dd/mm/yyyy' | 'mm/dd/yyyy' | 'yyyy-mm-dd' | 'dd Mon yyyy' | 'Mon dd, yyyy'
export type TimeFormatOption = '24h' | '12h'

export interface RegionalSettingsState {
  /** IANA timezone identifier, e.g. 'Africa/Lagos' */
  timezone: string
  setTimezone: (tz: string) => void
  /** Date display format */
  dateFormat: DateFormatOption
  setDateFormat: (fmt: DateFormatOption) => void
  /** Time display format: 24-hour or 12-hour */
  timeFormat: TimeFormatOption
  setTimeFormat: (fmt: TimeFormatOption) => void
  /** Bumped when any regional setting changes, so views re-render */
  regionalVersion: number
}

export interface ShiftState {
  currentShiftId: string | null
  shiftStartedAt: string | null
  shiftActive: boolean
  setShift: (shift: { id: string; startedAt: string } | null) => void
}

export interface UIState {
  isModalOpen: boolean
  modalContent: string | null
  openModal: (content: string) => void
  closeModal: () => void
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  isLoading: boolean
  setIsLoading: (val: boolean) => void
  /** Prevents UI flash on reload — true once hydration completes */
  isHydrated: boolean
  setHydrated: () => void
}

// ============ COMBINED APP STATE TYPE ============

export interface WorkstationState {
  currentWorkstationId: string | null
  setCurrentWorkstationId: (id: string | null) => void
}

export interface POState {
  pendingPOItems: { productId: string; productName: string; quantity: number; unitCost: number; vendorId: string | null; vendorName: string | null }[] | null
  setPendingPOItems: (items: { productId: string; productName: string; quantity: number; unitCost: number; vendorId: string | null; vendorName: string | null }[] | null) => void
}

export interface DashboardCustomization {
  visibleWidgets: string[]
  setVisibleWidgets: (widgets: string[]) => void
  toggleWidget: (widgetId: string) => void
  moveWidget: (widgetId: string, direction: 'up' | 'down') => void
}

export interface SuspendedCartState {
  /** Monotonic counter bumped whenever a cart is suspended/recalled/deleted */
  suspendedCartVersion: number
  bumpSuspendedCartVersion: () => void
}

export type AppState = NavigationState &
  AuthState &
  POSState &
  InventoryUIState &
  ShiftState &
  WorkstationState &
  POState &
  DashboardCustomization &
  SuspendedCartState &
  CompanyState &
  CurrencyState &
  ReceiptSettingsState &
  ReceiptPrintStyle &
  RegionalSettingsState &
  UIState

// ============ STORE ============

/** Persist all receipt settings to localStorage in one place */
function persistReceiptSettings(s: AppState) {
  if (typeof window === 'undefined') return
  localStorage.setItem('selrx_receipt_settings', JSON.stringify({
    autoPrintReceipt: s.autoPrintReceipt,
    showReceiptModal: s.showReceiptModal,
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    boldHeader: s.boldHeader,
    boldItems: s.boldItems,
    boldTotals: s.boldTotals,
    receiptHeader: s.receiptHeader,
    receiptFooter: s.receiptFooter,
  }))
}

export const useAppStore = create<AppState>((set, get) => ({
  // ---- Navigation ----
  currentView: 'login',
  setCurrentView: (view) => {
    set({ currentView: view })
    // Persist current view to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_view', view)
    }
  },
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  stockTakeReportId: null,
  setStockTakeReportId: (id) => set({ stockTakeReportId: id }),

  // ---- Auth ----
  user: null,
  isAuthenticated: false,
  authToken: null,
  setUser: (user) => {
    set({
      user,
      isAuthenticated: !!user,
    })
    // Persist session to localStorage
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('selrx_session', JSON.stringify({ user, token: get().authToken }))
        localStorage.setItem('selrx_view', 'dashboard')
      } else {
        localStorage.removeItem('selrx_session')
        localStorage.removeItem('selrx_view')
      }
    }
  },
  setAuthToken: (token) => {
    set({ authToken: token })
    if (typeof window !== 'undefined') {
      const sessionData = localStorage.getItem('selrx_session')
      if (sessionData && token) {
        try {
          const parsed = JSON.parse(sessionData)
          parsed.token = token
          localStorage.setItem('selrx_session', JSON.stringify(parsed))
        } catch { /* ignore */ }
      }
    }
  },
  logout: () => {
    set({
      user: null,
      isAuthenticated: false,
      authToken: null,
      currentView: 'login',
      cart: [],
      selectedCustomer: null,
      currentShiftId: null,
      shiftStartedAt: null,
      shiftActive: false,
    })
    // Clear persisted session + shift (shift stays running in DB for the user,
    // but we must not leak it to a different user on the same browser)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selrx_session')
      localStorage.removeItem('selrx_view')
      localStorage.removeItem('selrx_shift')
    }
  },
  hasPermission: (requiredPermissions) => {
    const state = get()
    if (!state.user) return false
    // SUPER_ADMIN always has access
    if (state.user.role === 'SUPER_ADMIN') return true
    // If user has custom permissions, check those
    const perms = state.user.permissions || []
    if (perms.length > 0) {
      return requiredPermissions.some((p) => perms.includes(p))
    }
    // No custom permissions set — deny access (unless SUPER_ADMIN)
    return false
  },

  // ---- POS / Cart ----
  cart: [],
  addToCart: (product, quantity) =>
    set((state) => {
      const existing = state.cart.find(
        (item) => item.product.id === product.id
      )
      if (existing) {
        return {
          cart: state.cart.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + quantity }
              : item
          ),
        }
      }
      return {
        cart: [...state.cart, { product, quantity }],
      }
    }),
  removeFromCart: (productId) =>
    set((state) => ({
      cart: state.cart.filter((item) => item.product.id !== productId),
    })),
  updateCartQuantity: (productId, quantity) =>
    set((state) => ({
      cart:
        quantity <= 0
          ? state.cart.filter((item) => item.product.id !== productId)
          : state.cart.map((item) =>
              item.product.id === productId ? { ...item, quantity } : item
            ),
    })),
  clearCart: () =>
    set({
      cart: [],
      selectedCustomer: null,
      paymentMethod: 'CASH',
    }),
  cartSubtotal: 0,
  cartTax: 0,
  cartTotal: 0,
  selectedCustomer: null,
  setSelectedCustomer: (customer) => set({ selectedCustomer: customer }),
  paymentMethod: 'CASH',
  setPaymentMethod: (method) => set({ paymentMethod: method }),
  isProcessingPayment: false,
  setIsProcessingPayment: (val) => set({ isProcessingPayment: val }),

  // ---- Inventory UI ----
  inventoryItems: [],
  setInventoryItems: (items) => set({ inventoryItems: items }),
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  filterCategory: '',
  setFilterCategory: (cat) => set({ filterCategory: cat }),
  stockAlerts: [],
  setStockAlerts: (alerts) => set({ stockAlerts: alerts }),
  inventoryVersion: 0,
  bumpInventoryVersion: () => set((s) => ({ inventoryVersion: s.inventoryVersion + 1 })),

  // ---- Workstation ----
  currentWorkstationId: null,
  setCurrentWorkstationId: (id) => {
    set({ currentWorkstationId: id })
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('selrx_workstation', id)
      } else {
        localStorage.removeItem('selrx_workstation')
      }
    }
  },
  pendingPOItems: null,
  setPendingPOItems: (items) => {
    set({ pendingPOItems: items })
  },

  // ---- Dashboard Customization ----
  visibleWidgets: ['today-sales', 'pending-rx', 'low-stock', 'customers', 'inventory-value', 'total-products', 'sales-chart', 'recent-transactions', 'top-products'],
  setVisibleWidgets: (widgets) => {
    set({ visibleWidgets: widgets })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_dashboard_widgets', JSON.stringify(widgets))
    }
  },
  toggleWidget: (widgetId) => {
    const current = get().visibleWidgets
    const isVisible = current.includes(widgetId)
    const updated = isVisible ? current.filter(w => w !== widgetId) : [...current, widgetId]
    set({ visibleWidgets: updated })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_dashboard_widgets', JSON.stringify(updated))
    }
  },
  moveWidget: (widgetId, direction) => {
    const widgets = [...get().visibleWidgets]
    const idx = widgets.indexOf(widgetId)
    if (idx === -1) return
    if (direction === 'up' && idx > 0) {
      [widgets[idx - 1], widgets[idx]] = [widgets[idx], widgets[idx - 1]]
    } else if (direction === 'down' && idx < widgets.length - 1) {
      [widgets[idx], widgets[idx + 1]] = [widgets[idx + 1], widgets[idx]]
    }
    set({ visibleWidgets: widgets })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_dashboard_widgets', JSON.stringify(widgets))
    }
  },

  // ---- Suspended Cart ----
  suspendedCartVersion: 0,
  bumpSuspendedCartVersion: () => set((s) => ({ suspendedCartVersion: s.suspendedCartVersion + 1 })),

  // ---- Shift ----
  currentShiftId: null,
  shiftStartedAt: null,
  shiftActive: false,
  setShift: (shift) => {
    if (shift) {
      set({ currentShiftId: shift.id, shiftStartedAt: shift.startedAt, shiftActive: true })
      if (typeof window !== 'undefined') {
        localStorage.setItem('selrx_shift', JSON.stringify({ id: shift.id, startedAt: shift.startedAt }))
      }
    } else {
      set({ currentShiftId: null, shiftStartedAt: null, shiftActive: false })
      if (typeof window !== 'undefined') {
        localStorage.removeItem('selrx_shift')
      }
    }
  },

  // ---- UI ----
  isModalOpen: false,
  modalContent: null,
  openModal: (content) =>
    set({ isModalOpen: true, modalContent: content }),
  closeModal: () =>
    set({ isModalOpen: false, modalContent: null }),
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID()
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))
    // Auto-remove after duration (default 5s)
    const duration = toast.duration ?? 5000
    setTimeout(() => {
      get().removeToast(id)
    }, duration)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  isLoading: false,
  setIsLoading: (val) => set({ isLoading: val }),

  // ---- Hydration (prevents UI flash on reload) ----
  isHydrated: false,
  setHydrated: () => set({ isHydrated: true }),

  // ---- Company ----
  company: null,
  setCompany: (company) => {
    set({ company, isCompanySetup: !!company })
    if (typeof window !== 'undefined') {
      if (company) {
        localStorage.setItem('selrx_company', JSON.stringify(company))
      } else {
        localStorage.removeItem('selrx_company')
      }
    }
  },
  isCompanySetup: false,
  setIsCompanySetup: (val) => set({ isCompanySetup: val }),

  // ---- Currency ----
  currency: 'GHS' as CurrencyCode,
  setCurrency: (code) => set({ currency: code }),

  // ---- Receipt Settings (persisted to localStorage) ----
  autoPrintReceipt: false,
  setAutoPrintReceipt: (val) => {
    set({ autoPrintReceipt: val })
    persistReceiptSettings(get())
  },
  showReceiptModal: true,
  setShowReceiptModal: (val) => {
    set({ showReceiptModal: val })
    persistReceiptSettings(get())
  },

  // ---- Receipt Print Style (persisted to localStorage) ----
  fontFamily: 'mono' as ReceiptFontFamily,
  setFontFamily: (val) => {
    set({ fontFamily: val })
    persistReceiptSettings(get())
  },
  fontSize: 'small' as ReceiptFontSize,
  setFontSize: (val) => {
    set({ fontSize: val })
    persistReceiptSettings(get())
  },
  boldHeader: true,
  setBoldHeader: (val) => {
    set({ boldHeader: val })
    persistReceiptSettings(get())
  },
  boldItems: false,
  setBoldItems: (val) => {
    set({ boldItems: val })
    persistReceiptSettings(get())
  },
  boldTotals: true,
  setBoldTotals: (val) => {
    set({ boldTotals: val })
    persistReceiptSettings(get())
  },

  receiptHeader: '',
  setReceiptHeader: (val) => {
    set({ receiptHeader: val })
    persistReceiptSettings(get())
  },
  receiptFooter: '',
  setReceiptFooter: (val) => {
    set({ receiptFooter: val })
    persistReceiptSettings(get())
  },

  // ---- Regional Settings (persisted to localStorage) ----
  timezone: 'Africa/Lagos',
  dateFormat: 'dd/mm/yyyy' as DateFormatOption,
  timeFormat: '24h' as TimeFormatOption,
  regionalVersion: 0,
  setTimezone: (tz) => {
    set({ timezone: tz, regionalVersion: get().regionalVersion + 1 })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_regional_settings', JSON.stringify({
        timezone: tz,
        dateFormat: get().dateFormat,
        timeFormat: get().timeFormat,
      }))
    }
  },
  setDateFormat: (fmt) => {
    set({ dateFormat: fmt, regionalVersion: get().regionalVersion + 1 })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_regional_settings', JSON.stringify({
        timezone: get().timezone,
        dateFormat: fmt,
        timeFormat: get().timeFormat,
      }))
    }
  },
  setTimeFormat: (fmt) => {
    set({ timeFormat: fmt, regionalVersion: get().regionalVersion + 1 })
    if (typeof window !== 'undefined') {
      localStorage.setItem('selrx_regional_settings', JSON.stringify({
        timezone: get().timezone,
        dateFormat: get().dateFormat,
        timeFormat: fmt,
      }))
    }
  },
}))

// ============ COMPUTED VALUES (selectors) ============

/**
 * Derived cart totals selector.
 * Because Zustand doesn't auto-compute, we provide a selector
 * that reads cart and returns computed values.
 */
export const useCartTotals = () =>
  useAppStore((state) => {
    const subtotal = state.cart.reduce(
      (sum, item) => sum + item.product.sellingPrice * item.quantity,
      0
    )
    const tax = 0 // 0% tax for pharmacy
    const total = subtotal + tax
    return { subtotal, tax, total }
  })
