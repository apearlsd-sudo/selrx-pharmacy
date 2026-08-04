'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search,
  Camera,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  Shield,
  HeartPulse,
  X,
  ChevronDown,
  Loader2,
  User,
  PackageX,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAppStore, type CartItem, type PaymentMethodType } from '@/store/app-store'
import { authHeaders } from '@/lib/auth-headers'
import { ReceiptModal } from './receipt-modal'
import { NewReturnDialog } from './new-return-dialog'

interface Product {
  id: string
  ndc?: string | null
  name: string
  genericName?: string | null
  strength?: string | null
  dosageForm?: string | null
  unitOfMeasure: string
  sellingUnit: string
  itemsPerUnit: number
  sellingPrice: number
  requiresPrescription: boolean
  category: string
  status: string
  inventory?: {
    id: string
    quantity: number
  }[]
}

interface CustomerOption {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  insuranceProvider?: string | null
}

const PAYMENT_OPTIONS: { value: PaymentMethodType; label: string; icon: typeof CreditCard }[] = [
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'CREDIT_CARD', label: 'Credit Card', icon: CreditCard },
  { value: 'DEBIT_CARD', label: 'Debit Card', icon: CreditCard },
  { value: 'INSURANCE', label: 'Insurance', icon: Shield },
  { value: 'FSA_HSA', label: 'FSA/HSA', icon: HeartPulse },
]



import { formatCurrency, currencySymbol } from '@/lib/currency'

export function POSView() {
  // Local state
  const [searchQuery, setSearchQuery] = useState('')
  const [posCategories, setPosCategories] = useState<{ value: string; label: string }[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [activeCategory, setActiveCategory] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([])
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false)
  const [amountTendered, setAmountTendered] = useState('')
  const [receiptTxn, setReceiptTxn] = useState<any | null>(null)
  const [returnDialogOpen, setReturnDialogOpen] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [showBarcodeInput, setShowBarcodeInput] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zustand state
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const removeFromCart = useAppStore((s) => s.removeFromCart)
  const updateCartQuantity = useAppStore((s) => s.updateCartQuantity)
  const clearCart = useAppStore((s) => s.clearCart)
  const selectedCustomer = useAppStore((s) => s.selectedCustomer)
  const setSelectedCustomer = useAppStore((s) => s.setSelectedCustomer)
  const paymentMethod = useAppStore((s) => s.paymentMethod)
  const setPaymentMethod = useAppStore((s) => s.setPaymentMethod)

  const isProcessingPayment = useAppStore((s) => s.isProcessingPayment)
  const setIsProcessingPayment = useAppStore((s) => s.setIsProcessingPayment)
  const addToast = useAppStore((s) => s.addToast)
  const shiftActive = useAppStore((s) => s.shiftActive)
  const inventoryVersion = useAppStore((s) => s.inventoryVersion)
  const showReceiptModal = useAppStore((s) => s.showReceiptModal)
  const autoPrintReceipt = useAppStore((s) => s.autoPrintReceipt)

  const subtotal = cart.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0)
  // Items that deduct more than 1 base unit per selling unit need stock check multiplied
  const cartStockMap = new Map<string, number>()
  for (const item of cart) {
    const current = cartStockMap.get(item.product.id) || 0
    cartStockMap.set(item.product.id, current + item.quantity * item.product.itemsPerUnit)
  }
  const tax = 0
  const total = subtotal + tax

  // Search products
  const searchProducts = useCallback(async (query: string, category: string) => {
    setSearching(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('search', query)
      if (category) params.set('category', category)
      params.set('limit', '50')
      const res = await fetch(`/api/products?${params.toString()}`, { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        setProducts(json.products || [])
      }
    } catch {
      addToast({ title: 'Error', description: 'Failed to search products', variant: 'destructive' })
    } finally {
      setSearching(false)
    }
  }, [addToast])

  // Search customers
  const searchCustomers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCustomerOptions([])
      return
    }
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=10`, { headers: authHeaders() })
      if (res.ok) {
        const json = await res.json()
        setCustomerOptions(json.customers || [])
      }
    } catch {
      // Silent fail
    }
  }, [])

  // Barcode scan
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    if (!barcode.trim()) return
    setSearching(true)
    try {
      const res = await fetch('/api/hardware?action=barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim() }),
      })
      if (res.ok) {
        const json = await res.json()
        if (json.product) {
          const product = json.product
          const stock = json.stockLevel ?? product.inventory?.quantity ?? 0
          if (stock === 0) {
            addToast({
              title: 'Out of Stock',
              description: `${product.name} has no stock available`,
              variant: 'destructive',
              duration: 3000,
            })
          } else {
            addToCart(
              {
                id: product.id,
                name: product.name,
                ndc: product.ndc,
                sellingPrice: product.sellingPrice,
                requiresPrescription: product.requiresPrescription,
                unitOfMeasure: product.unitOfMeasure,
                sellingUnit: product.sellingUnit || 'EA',
                itemsPerUnit: product.itemsPerUnit || 1,
                strength: product.strength,
                dosageForm: product.dosageForm,
              },
              1
            )
            addToast({
              title: 'Product Added',
              description: `${product.name} added to cart`,
              variant: 'success',
              duration: 2000,
            })
          }
        } else {
          addToast({
            title: 'Not Found',
            description: 'No product found for this barcode',
            variant: 'destructive',
            duration: 3000,
          })
        }
      }
    } catch {
      addToast({
        title: 'Scan Error',
        description: 'Barcode scan failed',
        variant: 'destructive',
      })
    } finally {
      setSearching(false)
      setBarcodeInput('')
      setShowBarcodeInput(false)
    }
  }, [addToCart, addToast])

  // Fetch categories on mount
  useEffect(() => {
    fetch('/api/categories', { headers: authHeaders() })
      .then((res) => res.ok ? res.json() : [])
      .then((cats: { name: string }[]) => {
        setPosCategories([
          { value: '', label: 'All' },
          ...cats.map((c) => ({ value: c.name, label: c.name.replace(/_/g, ' ') })),
        ])
      })
      .catch(() => {})
  }, [])

  // Debounced product search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchProducts(searchQuery, activeCategory)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchQuery, activeCategory, searchProducts])

  // Debounced customer search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchCustomers(customerSearch)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [customerSearch, searchCustomers])

  // Re-search products when inventory changes (stock count, adjust, etc.)
  const prevInventoryVersion = useRef(inventoryVersion)
  useEffect(() => {
    if (prevInventoryVersion.current !== inventoryVersion) {
      prevInventoryVersion.current = inventoryVersion
      searchProducts(searchQuery, activeCategory)
    }
  }, [inventoryVersion, searchQuery, activeCategory, searchProducts])

  const handleAddToCart = (product: Product) => {
    addToCart(
      {
        id: product.id,
        name: product.name,
        ndc: product.ndc,
        sellingPrice: product.sellingPrice,
        requiresPrescription: product.requiresPrescription,
        unitOfMeasure: product.unitOfMeasure,
        sellingUnit: product.sellingUnit || 'EA',
        itemsPerUnit: product.itemsPerUnit || 1,
        strength: product.strength,
        dosageForm: product.dosageForm,
      },
      1
    )
    addToast({
      title: 'Added',
      description: `${product.name} added to cart`,
      variant: 'success',
      duration: 1500,
    })
  }

  const handleProcessPayment = async () => {
    if (!shiftActive) {
      addToast({ title: 'No Active Shift', description: 'Please start your shift before making sales.', variant: 'destructive' })
      return
    }

    if (cart.length === 0) {
      addToast({ title: 'Empty Cart', description: 'Add items before processing', variant: 'destructive' })
      return
    }

    if (paymentMethod === 'CASH') {
      const tendered = parseFloat(amountTendered)
      if (isNaN(tendered) || tendered < total) {
        addToast({
          title: 'Insufficient Amount',
          description: `Amount tendered must be at least ${formatCurrency(total)}`,
          variant: 'destructive',
        })
        return
      }
    }

    setIsProcessingPayment(true)
    try {
      const payload = {
        customerId: selectedCustomer?.id || null,
        items: cart.map((item: CartItem) => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.product.sellingPrice,
          subtotal: item.product.sellingPrice * item.quantity,
          requiresRx: item.product.requiresPrescription,
          sellingUnit: item.product.sellingUnit || 'EA',
          itemsPerUnit: item.product.itemsPerUnit,
        })),
        paymentMethod,
        subtotal,
        tax,
        discount: 0,
        total,
        paymentAmount: paymentMethod === 'CASH' ? parseFloat(amountTendered) || total : total,
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Transaction failed')
      }

      const transaction = await res.json()
      clearCart()
      setAmountTendered('')
      addToast({
        title: 'Payment Successful',
        description: `Transaction ${transaction.transactionNo} completed`,
        variant: 'success',
        duration: 3000,
      })

      // Handle receipt based on settings
      if (showReceiptModal) {
        setReceiptTxn(transaction)
      }
      if (autoPrintReceipt) {
        // Auto-send receipt to printer (fire-and-forget)
        fetch('/api/hardware?action=receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionId: transaction.id,
            hardwareType: 'receipt_printer',
            details: { transactionNo: transaction.transactionNo, total: transaction.total },
          }),
        }).catch(() => { /* silent fail for auto-print */ })
      }
    } catch (err) {
      addToast({
        title: 'Payment Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
        duration: 5000,
      })
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const handleVoidTransaction = () => {
    if (cart.length === 0) return
    addToast({
      title: 'Transaction Voided',
      description: 'Cart has been cleared',
      variant: 'destructive',
    })
    clearCart()
    setAmountTendered('')
  }

  const changeAmount =
    paymentMethod === 'CASH' && parseFloat(amountTendered) > 0
      ? parseFloat(amountTendered) - total
      : 0

  return (
    <>
      {!shiftActive && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">No Active Shift</p>
            <p className="text-xs text-amber-600/80 mt-0.5">You must start a shift before processing sales. Click "Start Shift" in the top bar.</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Product Search & List */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search Bar */}
          <Card className="gap-0 shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center gap-2.5 p-3.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search products by name, NDC, generic name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-10 bg-gray-50/50 border-gray-200/80 focus:bg-white"
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowBarcodeInput(!showBarcodeInput)}
                  title="Barcode Scan"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>
              {/* Barcode Input */}
              {showBarcodeInput && (
                <div className="flex items-center gap-2 px-3 pb-3">
                  <Input
                    placeholder="Scan or type barcode..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleBarcodeScan(barcodeInput)
                    }}
                    className="h-9"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={() => handleBarcodeScan(barcodeInput)}
                    disabled={!barcodeInput.trim()}
                  >
                    Scan
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowBarcodeInput(false)
                      setBarcodeInput('')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {/* Category Filters */}
              <div className="flex items-center gap-1.5 px-3.5 pb-3 overflow-x-auto">
                {posCategories.map((cat) => (
                  <Button
                    key={cat.value}
                    variant={activeCategory === cat.value ? 'default' : 'outline'}
                    size="sm"
                    className={`text-xs whitespace-nowrap h-7 rounded-lg transition-all duration-200 ${
                      activeCategory === cat.value
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200'
                        : 'border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300'
                    }`}
                    onClick={() => setActiveCategory(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Product Results */}
          <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
            {searching ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="animate-pulse space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                        <div className="flex justify-between mt-2">
                          <div className="h-4 bg-muted rounded w-20" />
                          <div className="h-8 bg-muted rounded w-8" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <PackageX className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">No products found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products
                  .filter((p) => p.status !== 'DISCONTINUED')
                  .map((product) => {
                    const stock = product.inventory?.[0]?.quantity ?? 0
                    const isOut = stock === 0
                    const inCart = cart.find((item: CartItem) => item.product.id === product.id)
                    return (
                      <Card
                        key={product.id}
                        className={`group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-gray-200/80 ${
                          isOut ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        } ${
                          inCart ? 'ring-2 ring-emerald-500 bg-emerald-50/40 border-emerald-200' : ''
                        }`}
                        onClick={() => {
                          if (isOut) {
                            addToast({ title: 'Out of Stock', description: `${product.name} has no stock available`, variant: 'destructive', duration: 2000 })
                            return
                          }
                          handleAddToCart(product)
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm leading-tight truncate text-gray-800">
                                {product.name}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {[product.strength, product.dosageForm, product.unitOfMeasure]
                                  .filter(Boolean)
                                  .join(' · ') || product.category}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-bold text-emerald-600 text-sm">
                                {formatCurrency(product.sellingPrice)}
                              </p>
                              {(product.sellingUnit && product.sellingUnit !== 'EA') && (
                                <p className="text-[10px] text-muted-foreground">
                                  per {product.sellingUnit.toLowerCase()}
                                  {product.itemsPerUnit > 1 ? ` (${product.itemsPerUnit} ${product.unitOfMeasure.toLowerCase()}${product.itemsPerUnit > 1 ? 's' : ''})` : ''}
                                </p>
                              )}
                              <p
                                className={`text-xs mt-0.5 ${
                                  isOut ? 'text-red-600 font-bold' : stock <= 5 ? 'text-red-500 font-medium' : 'text-muted-foreground'
                                }`}
                              >
                                {isOut ? 'Out of Stock' : product.itemsPerUnit > 1
                                  ? `${Math.floor(stock / product.itemsPerUnit)} ${product.sellingUnit.toLowerCase()}${Math.floor(stock / product.itemsPerUnit) !== 1 ? 's' : ''} (${stock} pcs)`
                                  : `Stock: ${stock}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-3.5">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {product.category}
                              </Badge>
                              {product.requiresPrescription && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700"
                                >
                                  Rx
                                </Badge>
                              )}
                              {isOut && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200">
                                  Out of Stock
                                </Badge>
                              )}
                              {inCart && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-emerald-600 text-white border-emerald-600">
                                  x{inCart.quantity}
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              className={`h-7 w-7 p-0 rounded-lg shadow-sm ${isOut ? 'bg-gray-200 cursor-not-allowed text-gray-400' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                              disabled={isOut}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!isOut) handleAddToCart(product)
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Cart & Checkout */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-4 space-y-4">
            <Card className="gap-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <ShoppingCart className="h-4.5 w-4.5 text-emerald-600" />
                    </div>
                    <CardTitle className="text-base font-semibold text-gray-800">Cart</CardTitle>
                    <Badge variant="secondary" className="text-[10px] font-medium bg-gray-100 text-gray-500">
                      {cart.reduce((sum, item: CartItem) => sum + item.quantity, 0)} items
                    </Badge>
                  </div>
                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCart}
                      className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                    >
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>

              <Separator />

              {/* Cart Items */}
              <div className="max-h-[260px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-sm font-medium text-gray-400">Cart is empty</p>
                    <p className="text-xs mt-1 text-gray-300">Search and add products</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {cart.map((item: CartItem) => (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-card p-2.5 hover:border-gray-300 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-gray-800">{item.product.name}</p>
                          <p className="text-xs text-gray-400">
                            {formatCurrency(item.product.sellingPrice)}
                            {item.product.sellingUnit && item.product.sellingUnit !== 'EA'
                              ? ` / ${item.product.sellingUnit.toLowerCase()}`
                              : ` / ${item.product.unitOfMeasure}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateCartQuantity(item.product.id, item.quantity - 1)
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateCartQuantity(item.product.id, item.quantity + 1)
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="w-16 text-right text-sm font-medium">
                          {formatCurrency(item.product.sellingPrice * item.quantity)}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600 shrink-0"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Cart Totals */}
              <div className="p-4 space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="font-medium text-gray-700">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Tax</span>
                  <span className="font-medium text-gray-700">{formatCurrency(tax)}</span>
                </div>
                <Separator className="bg-gray-100" />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-600">Total</span>
                  <span className="text-xl font-bold text-emerald-600">{formatCurrency(total)}</span>
                </div>
              </div>

              <Separator />

              {/* Customer Selection */}
              <div className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Customer (optional)</p>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-lg border p-2.5 bg-emerald-50/50">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-medium">
                          {selectedCustomer.firstName} {selectedCustomer.lastName}
                        </p>
                        {selectedCustomer.insuranceProvider && (
                          <p className="text-xs text-muted-foreground">
                            {selectedCustomer.insuranceProvider}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(null)
                        setCustomerSearch('')
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      placeholder="Search customer name, email, phone..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value)
                        setCustomerDropdownOpen(true)
                      }}
                      onFocus={() => {
                        if (customerSearch.length >= 2) setCustomerDropdownOpen(true)
                      }}
                      className="h-9 text-sm"
                    />
                    {customerDropdownOpen && customerOptions.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
                        {customerOptions.map((cust) => (
                          <button
                            key={cust.id}
                            className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                            onClick={() => {
                              setSelectedCustomer({
                                id: cust.id,
                                firstName: cust.firstName,
                                lastName: cust.lastName,
                                email: cust.email,
                                phone: cust.phone,
                                insuranceProvider: cust.insuranceProvider,
                              })
                              setCustomerSearch('')
                              setCustomerDropdownOpen(false)
                            }}
                          >
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium">
                              {cust.firstName} {cust.lastName}
                            </span>
                            {cust.insuranceProvider && (
                              <Badge variant="outline" className="text-[10px] ml-auto px-1.5 py-0">
                                {cust.insuranceProvider}
                              </Badge>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Payment Method */}
              <div className="p-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Payment Method</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {PAYMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all text-xs ${
                        paymentMethod === opt.value
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600'
                          : 'hover:bg-accent text-muted-foreground'
                      }`}
                      onClick={() => setPaymentMethod(opt.value)}
                    >
                      <opt.icon className="h-4 w-4" />
                      <span className="text-[10px] leading-tight font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash Payment - Amount Tendered */}
              {paymentMethod === 'CASH' && total > 0 && (
                <>
                  <Separator />
                  <div className="p-4 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Amount Tendered</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {currencySymbol()}
                      </span>
                      <Input
                        type="number"
                        min={total}
                        step="0.01"
                        placeholder="0.00"
                        value={amountTendered}
                        onChange={(e) => setAmountTendered(e.target.value)}
                        className="pl-7 h-10"
                      />
                    </div>
                    {changeAmount > 0 && (
                      <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-2.5">
                        <span className="text-sm text-emerald-700">Change</span>
                        <span className="font-bold text-emerald-700">
                          {formatCurrency(changeAmount)}
                        </span>
                      </div>
                    )}
                    {/* Quick cash buttons */}
                    <div className="flex gap-1.5">
                      {[Math.ceil(total), 20, 50, 100].map((amt) => (
                        <Button
                          key={amt}
                          variant="outline"
                          size="sm"
                          className="flex-1 h-7 text-xs"
                          onClick={() => setAmountTendered(amt.toString())}
                        >
                          {currencySymbol()}{amt}
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Action Buttons */}
              <div className="p-4 space-y-2">
                <Button
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-base font-semibold shadow-lg shadow-emerald-200 transition-all duration-200"
                  onClick={handleProcessPayment}
                  disabled={cart.length === 0 || isProcessingPayment || !shiftActive}
                >
                  {isProcessingPayment ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Banknote className="h-5 w-5" />
                      Process Payment — {formatCurrency(total)}
                    </>
                  )}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-gray-200/80 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                    onClick={handleVoidTransaction}
                    disabled={cart.length === 0}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Void
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-gray-200/80 text-gray-500 hover:text-gray-800 hover:border-gray-300"
                    onClick={() => {
                      clearCart()
                      setAmountTendered('')
                    }}
                    disabled={cart.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Clear Cart
                  </Button>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-10 border-amber-200/80 text-amber-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 text-sm font-medium"
                  onClick={() => setReturnDialogOpen(true)}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Goods Return
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptTxn && (
        <ReceiptModal
          transaction={receiptTxn}
          onClose={() => setReceiptTxn(null)}
        />
      )}

      {/* Goods Return Dialog */}
      <NewReturnDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
      />
    </>
  )
}
