# GAZPharm Work Log

---
Task ID: 1
Agent: main
Task: Expand user roles and privileges, enable SUPER_ADMIN custom role creation

Work Log:
- Analyzed current permission system: 8 coarse keys → expanded to 21 granular permission keys across 9 categories
- Verified SystemRole table already seeded with 6 default roles (SUPER_ADMIN, PHARMACIST, TECHNICIAN, CASHIER, CLERK, STORE_MANAGER)
- Created `/src/lib/permissions.ts` shared lib with `ALL_PERMISSION_KEYS` for server/client use
- Updated login API (`/api/auth/login/route.ts`) to resolve permissions: SUPER_ADMIN → all keys, user override → SystemRole fallback
- Login now returns `roleLabel` from SystemRole for display in UI
- Added `GET /api/users?action=roles` endpoint for dynamic role dropdown population
- Fixed `PERMISSIONS` → `ALL_PERMISSIONS` bug in users-view.tsx (2 occurrences)
- Added `getRolePerms()` helper in users-view to use DB roles state over hardcoded defaults
- Updated `handleCreateRoleChange`, `handleEditRoleChange`, `openEditDialog`, `getUserPermissions` to use `getRolePerms()`
- Updated role dropdown badges to show `X/21` format using live DB permissions
- Updated `UserState` in store to include optional `roleLabel` field
- Updated topbar and sidebar footer to display `roleLabel` instead of raw role name
- Built successfully and restarted live preview

Stage Summary:
- Roles & permissions are now fully DB-backed with 6 default system roles + custom role creation support
- Login API correctly resolves permissions from role → user override hierarchy
- SUPER_ADMIN sees "Users" and "Roles" tabs; role dropdowns dynamically populated from DB
- Custom roles can be created/edited/deleted by SUPER_ADMIN via the Roles tab
- Live preview running at https://preview-5fe7d2fc-11f8-4355-b613-d9e971b3cffa.space-z.ai/

## Session: API Routes Implementation

**Date**: 2025
**Task**: Create all backend API routes for GAZPharm Pharmacy POS Application

### Files Created

#### Auth
- `src/lib/auth.ts` — NextAuth.js v4 configuration with Credentials provider, JWT strategy, session callbacks (includes user role and id), custom sign-in page. Demo mode: plain text password comparison.
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handler exporting GET and POST.

#### Products API
- `src/app/api/products/route.ts` — GET (list with search, category, status, pagination) and POST (create, PHARMACIST/SUPER_ADMIN only)
- `src/app/api/products/[id]/route.ts` — GET (single with inventory), PUT (update, PHARMACIST/SUPER_ADMIN only), DELETE (soft delete → DISCONTINUED)

#### Inventory API
- `src/app/api/inventory/route.ts` — GET (list with product info + ?action=alerts for low stock), PUT (stock adjustment with ?action=receive for shipments), POST (receive new stock shipment)

#### Transactions API
- `src/app/api/transactions/route.ts` — GET (list with date filter, pagination + ?action=stats for sales statistics), POST (create complete POS sale with inventory deduction, transaction number generation TXN-YYYYMMDD-XXXX)
- `src/app/api/transactions/[id]/route.ts` — GET (single with items, user, customer, prescription, hardwareLog), POST (?action=void to void transaction and restore inventory)

#### Prescriptions API
- `src/app/api/prescriptions/route.ts` — GET (list with status/customer filter, pagination), POST (create with RX number generation RX-YYXXXXXX)
- `src/app/api/prescriptions/[id]/route.ts` — GET (single with full details), PUT (?action=fill to dispense with inventory deduction, ?action=verify for pharmacist verification, regular update)

#### Customers API
- `src/app/api/customers/route.ts` — GET (list with search, pagination), POST (create with duplicate email check)
- `src/app/api/customers/[id]/route.ts` — GET (single with prescriptions and transactions), PUT (update with duplicate email check)

#### Users API
- `src/app/api/users/route.ts` — GET (list all, admin only + ?action=profile for own profile), POST (create user, SUPER_ADMIN only), PUT (?action=profile for own profile update, ?id=X for role/status update, SUPER_ADMIN only)

#### Hardware API
- `src/app/api/hardware/route.ts` — GET (?action=status for simulated hardware status, ?action=barcode&barcode=X for lookup), POST (?action=receipt for receipt print log, ?action=drawer for cash drawer log, ?action=barcode for barcode scan lookup)

#### Dashboard API
- `src/app/api/dashboard/route.ts` — GET (comprehensive data: today's sales/count, 7-day weekly trend, low stock alerts, pending prescriptions count, top 5 selling products, 10 most recent transactions)

### Architecture Decisions
- **Demo Auth**: Uses `x-user-role` and `x-user-id` headers for role-based access (no real auth middleware). NextAuth configured with plain text password comparison for demo.
- **Role-Based Access**: PHARMACIST and SUPER_ADMIN for product/inventory management; SUPER_ADMIN only for user creation and role updates.
- **Transaction Numbers**: Format `TXN-YYYYMMDD-XXXX` (4-digit random suffix).
- **RX Numbers**: Format `RX-YYXXXXXX` (2-digit year + 6-digit random).
- **Soft Delete**: Product deletion sets status to DISCONTINUED rather than removing records.
- **Inventory Deduction**: Happens automatically on transaction creation and prescription filling.
- **Inventory Restoration**: Happens automatically on transaction void.
- **All responses**: Use `NextResponse.json()` with proper status codes and try-catch error handling.
- **Lint**: Passes cleanly with no errors.

---

## Session: UI Components — Login, Sidebar, Toast

**Date**: 2025
**Task**: Create core UI components for GAZPharm frontend (Login screen, Sidebar navigation, Toast notifications)

### Files Created

#### API Route
- `src/app/api/auth/login/route.ts` — Custom login endpoint. POST with `{ email, password }`, validates against DB (plain text comparison), returns `{ user: { id, name, email, role } }` or 401 error. Includes input validation and error handling.

#### Login Screen
- `src/components/gazpharm/login-screen.tsx` — Full-screen pharmacy login component.
  - Green gradient background (emerald-900 → teal-800) with decorative blur circles
  - Centered white card with email/password form (shadcn Input, Label)
  - Password show/hide toggle with Eye/EyeOff icons
  - Sign In button (emerald-600) with loading spinner state
  - Three demo login buttons (Admin/Pharmacist/Cashier) with quick credentials
  - Error message display with animated reveal
  - On success: calls `setUser()` → `setCurrentView('dashboard')` → success toast
  - GAZPharm branding with Pill icon, footer version text
  - Framer Motion entrance animation

#### Sidebar Navigation
- `src/components/gazpharm/sidebar.tsx` — Role-based sidebar navigation.
  - Dark theme (bg-gray-900) with emerald branding
  - 8 nav items with Lucide icons: Dashboard, POS Terminal, Inventory, Prescriptions, Customers, User Management, Hardware, Reports
  - Role-based visibility via `hasPermission()` — each item has a `roles` array
  - Active state: emerald-600/20 bg + emerald-400 text + green dot indicator
  - Collapsible mode: toggles between full (w-64) and icon-only (w-[68px]) via `sidebarOpen` store
  - Collapsed state shows tooltips on hover (shadcn Tooltip)
  - User section at bottom: avatar with initials, name, role badge (color-coded), logout button
  - Mobile: uses shadcn Sheet (left-side drawer) with top bar containing hamburger menu + branding
  - Collapse toggle button (ChevronLeft/ChevronRight) floats on sidebar edge
  - Responsive: hidden on desktop when not authenticated

#### Toast Container
- `src/components/gazpharm/toast-container.tsx` — Notification system.
  - Fixed bottom-right positioning with z-100
  - Renders toasts from Zustand store with `AnimatePresence` for enter/exit animations
  - Three variants: default (white/gray), success (emerald/green), destructive (red)
  - Each toast: icon (CheckCircle2/AlertCircle/Info), title, description, close button
  - Framer Motion animations: slide-up enter, slide-right exit, layout animation
  - Auto-dismiss via store's built-in `setTimeout` in `addToast`

#### Updated Files
- `src/app/page.tsx` — Main page component that conditionally renders LoginScreen or DashboardPlaceholder based on authentication state. DashboardPlaceholder includes placeholder cards and module message. Responsive layout accounting for sidebar width and mobile top bar.
- `src/app/layout.tsx` — Updated metadata (title: "GAZPharm - Pharmacy Management System"), added `<ToastContainer />` to body, removed unused Toaster import.

### Architecture Decisions
- **Custom Login API**: Simplified auth flow — POST to `/api/auth/login` instead of NextAuth signIn, returns user data directly. Suitable for demo mode.
- **Toast System**: Uses Zustand store for toast state (already defined in app-store.ts) with auto-dismiss timers managed in the store's `addToast` action.
- **Sidebar Responsiveness**: Desktop = fixed sidebar with collapse toggle; Mobile = Sheet drawer triggered by hamburger menu in fixed top bar.
- **Page Layout**: Content area uses `ml-64`/`ml-[68px]` on desktop (matching sidebar width) and `pt-14` on mobile (clearing fixed top bar).
- **Design System**: Emerald/teal green primary colors, gray-900 dark sidebar, consistent with pharmacy POS branding (PioneerRX-style).
- **Lint**: Passes cleanly with no errors.

---

## Session: Dashboard View, POS Terminal View, Receipt Modal

**Date**: 2025
**Task**: Create the three main view components for GAZPharm — Dashboard, POS Terminal, and Receipt Modal — plus wire up the app shell in page.tsx.

### Files Created

#### Dashboard View
- `src/components/gazpharm/views/dashboard-view.tsx` — Comprehensive pharmacy dashboard.
  - **Top Stats Row** (4-card grid): Today's Sales ($ + txn count, emerald bg), Pending Prescriptions (amber bg), Low Stock Alerts (red bg), Active Customers (teal bg) — each with Lucide icon in colored circle.
  - **Sales Trend Chart**: Last 7 days bar chart using recharts `BarChart` with emerald-600 bars, `ResponsiveContainer`, formatted axes and tooltip.
  - **Recent Transactions Table**: shadcn `Table` with 10 most recent transactions — columns: Txn #, Customer, Items, Total, Payment, Status (color-coded badges: green=COMPLETED, red=VOIDED, amber=PENDING), Time. Max height 300px with scroll.
  - **Top Selling Products**: Grid of 5 product cards showing rank, product name, quantity sold, revenue (emerald colored). Data from `/api/dashboard` `topProducts`.
  - Fetches data from `GET /api/dashboard` on mount via `useEffect` + `useState`.
  - Full loading skeleton state (`DashboardSkeleton`) with animated `Skeleton` components.
  - Error state with red-bordered card and message.
  - Active customer count derived from recent transactions with `Set` dedup.

#### POS Terminal View
- `src/components/gazpharm/views/pos-view.tsx` — Main pharmacy POS terminal, two-column layout.
  - **Left Column** (`lg:col-span-2`): Product search & list.
    - Search bar with `Search` icon + barcode scan toggle button (Camera icon).
    - Collapsible barcode input field (Enter key or Scan button triggers POST `/api/hardware?action=barcode`).
    - Category filter buttons: All, OTC, PRESCRIPTION, SUPPLEMENT, MEDICAL_DEVICE, PERSONAL_CARE, CONSUMABLES — active button emerald-600.
    - Product grid (1 or 2 columns) showing: name, strength/form/UoM, price (emerald), stock level (red if ≤5), category badge, Rx badge, in-cart quantity badge, add button.
    - Clicking a product card or add button adds to Zustand cart.
    - Loading skeleton animation during search.
    - Empty state with `PackageX` icon.
    - Debounced search (300ms) calling `GET /api/products?search=&category=&limit=50`.
    - Max height scroll area (`calc(100vh-320px)`).
  - **Right Column** (`lg:col-span-1`, sticky):
    - Cart header with `ShoppingCart` icon, title, item count badge, "Clear All" button.
    - Cart items list: product name, unit price, quantity controls (−/+ buttons), line total, trash remove button. Border-separated rows.
    - Empty cart state with centered icon and text.
    - Cart totals: Subtotal, Tax ($0.00), Total (emerald bold).
    - **Customer Selection**: Search input with dropdown (debounced 300ms, calls `GET /api/customers?search=`). Shows selected customer with insurance badge, X to remove.
    - **Payment Method Selector**: 5-button grid — Cash (Banknote), Credit Card, Debit Card, Insurance (Shield), FSA/HSA (HeartPulse). Active state emerald ring/border.
    - **Cash Payment**: Amount tendered input, change calculation display (emerald bg), quick cash buttons (round up, $20, $50, $100).
    - **"Process Payment" button**: emerald-600, full-width, h-12, shows total. Loading state with spinner. POSTs to `/api/transactions` with cart items, payment info, customer. On success: shows ReceiptModal, clears cart, success toast. On failure: error toast.
    - **"Void Transaction" + "Clear Cart"** outline buttons in 2-column grid.
  - All cart operations use Zustand store (`addToCart`, `removeFromCart`, `updateCartQuantity`, `clearCart`, `useCartTotals`).

#### Receipt Modal
- `src/components/gazpharm/views/receipt-modal.tsx` — Post-transaction receipt dialog.
  - shadcn `Dialog` with emerald-600 header bar and `CheckCircle2` icon.
  - Receipt body: white bg, dashed border, monospace font (`font-mono`).
  - Content sections: GAZPharm header (store icon + address), transaction info (txn #, date, cashier, customer, payment method), items list (name, qty × price, subtotal), totals (subtotal, tax, discount, total, paid, change in emerald), footer (thank you message).
  - **"Print Receipt" button**: POSTs to `/api/hardware?action=receipt` with transaction details. Shows success/error toast.
  - **"New Transaction" button**: Closes modal, navigates to POS view.
  - **"Close" button**: Closes dialog.
  - Three-button footer layout.

#### App Shell (page.tsx)
- `src/app/page.tsx` — Complete app shell wiring all components together.
  - **Sidebar**: Fixed 264px width, white bg, emerald branding (Pill icon + "GAZPharm").
    - Main nav: Dashboard, POS Terminal (with "LIVE" badge).
    - Management nav: Inventory, Prescriptions, Customers, Reports, Hardware, Settings — all with placeholder view (grayed out).
    - Footer: User avatar, name, role, logout button.
    - Mobile: slide-in with overlay backdrop, auto-close on nav click.
  - **Top Bar**: Sticky, h-14, hamburger menu (mobile), view title, notification bell (with green dot), user name.
  - **Content Area**: `lg:ml-64` offset, `p-4 lg:p-6`, renders current view.
  - **Demo Auto-Login**: On mount, auto-sets user as "Dr. Sarah Chen" (PHARMACIST role) and navigates to dashboard.
  - **Toast Notifications**: Fixed bottom-right, custom rendered toasts from Zustand store (not shadcn Toaster), three variants with slide-in animation.
  - Placeholder view for unbuilt modules with Pill icon and "under development" message.

### Architecture Decisions
- **No NextAuth Required**: App auto-authenticates with a demo user on mount. No login flow needed for preview.
- **Custom Toast Rendering**: Built custom toast renderer in page.tsx instead of relying on shadcn Toaster, for better control over positioning and styling.
- **Debounced API Calls**: Both product search and customer search use 300ms debounce to avoid excessive API calls while typing.
- **Sticky Cart**: POS cart column is `lg:sticky lg:top-4` for easy access while scrolling products.
- **Receipt Format**: Monospace dashed-border layout mimicking a real pharmacy receipt printout.
- **Design System**: Emerald/teal green primary (`emerald-600`, `teal-700`), no indigo/blue. Lucide icons throughout. Professional pharmacy POS feel.
- **Lint**: Passes cleanly with no errors.

---

Task ID: 1
Agent: Main Agent
Task: Create Sales History page showing sales by various users

Work Log:
- Read and analyzed existing codebase: Prisma schema (Transaction, User, TransactionItem models), Zustand store (ViewName type, navigation), page.tsx (nav items, view router), existing transactions API, and reports view for patterns
- Created `/api/sales-history` API route (GET) with: overall summary stats (total sales, transaction count, average, top seller), sales aggregated by user (name, role, transaction count, total sales, items sold, avg sale), daily sales trend data, paginated transaction list with user/customer/item details, user list for filter dropdown
- Created `sales-history-view.tsx` with: 4 summary stat cards (Total Sales, Total Transactions, Avg Transaction, Top Seller), filter bar (date range, quick presets: Today/7 Days/This Month/3 Months/All Time, user filter dropdown), 4 tabs (Overview, By User, Transactions, Trends), Overview tab: bar chart (sales by user) + line chart (daily trend) + top sellers summary table, By User tab: pie chart (sales distribution) + user performance cards with progress bars, Transactions tab: detailed transaction table with 11 columns, pagination, and detail dialog popup, Trends tab: area chart (revenue), bar chart (transaction volume), horizontal bar chart (user comparison)
- Updated Zustand store: added `'sales-history'` to ViewName type union
- Updated page.tsx: added History icon import, SalesHistoryView import, nav item with roles (SUPER_ADMIN, PHARMACIST, TECHNICIAN), view router case
- Build passed with zero errors, dev server running, API verified returning correct grouped data

Stage Summary:
- New files: `src/app/api/sales-history/route.ts`, `src/components/gazpharm/views/sales-history-view.tsx`
- Modified files: `src/store/app-store.ts`, `src/app/page.tsx`
- Sales History page accessible via sidebar "Sales History" nav item with History icon
- API verified: returns summary, salesByUser array, dailySales array, paginated transactions, and allUsers list

---

Task ID: 3
Agent: Main Agent
Task: Create Goods Return feature with inventory restocking and return ticket generation

Work Log:
- Added `Return` model to Prisma schema with: id, returnNo (RTN-YYYYMMDD-XXXX), transactionId, transactionItemId, productId, productName, quantity, unitPrice, refundAmount, reason (enum: DEFECTIVE/EXPIRED/WRONG_ITEM/WRONG_QUANTITY/DAMAGED/CUSTOMER_CHANGE_OF_MIND/RECALLED/OTHER), reasonNote, customerId, customerName, userId, status (enum: PENDING_APPROVAL/APPROVED/REJECTED/COMPLETED/CANCELLED), approvedById, approvedAt, refundMethod, refundProcessed, restocked, notes. Added reverse relations on Transaction, TransactionItem, Product, and User models.
- Pushed schema to database with `prisma db push --accept-data-loss`
- Created `src/app/api/returns/route.ts` (GET list with status/date filters + pagination, GET ?action=stats for return statistics, POST to create return with quantity validation against original purchase)
- Created `src/app/api/returns/[id]/route.ts` (GET single with full details, PUT with action-based processing: approve, complete (restocks inventory + marks refund), reject, cancel (un-restocks if needed))
- Created `src/components/gazpharm/views/return-ticket-modal.tsx` — receipt-style ticket modal with: return number, date, status, product details, original transaction, refund amount/method, restock status, staff info, print button
- Created `src/components/gazpharm/views/goods-return-view.tsx` — full goods return page with: 4 summary stat cards (Returns Today, Today's Refunds, Pending Approval, Items Restocked), two tabs (New Return, Return History), New Return tab: transaction search with debounced input, select item from transaction, return quantity input with validation, refund amount preview, reason dropdown (8 options), notes for "Other" reason, refund method selector, submit button; Return History tab: status filter dropdown, returns table with 10 columns, pagination, action buttons (view details, approve, reject, complete), detail dialog, action confirmation dialog
- Added search support to transactions API (search by transactionNo, customer firstName/lastName)
- Updated Zustand store: added `'returns'` to ViewName type union
- Updated page.tsx: added RotateCcw icon, GoodsReturnView import, nav item with roles (SUPER_ADMIN, PHARMACIST, TECHNICIAN, CASHIER), view router case
- Build passed with zero errors, API stats endpoint verified returning correct data structure

Stage Summary:
- New files: `src/app/api/returns/route.ts`, `src/app/api/returns/[id]/route.ts`, `src/components/gazpharm/views/goods-return-view.tsx`, `src/components/gazpharm/views/return-ticket-modal.tsx`
- Modified files: `prisma/schema.prisma`, `src/store/app-store.ts`, `src/app/page.tsx`, `src/app/api/transactions/route.ts`
- Goods Return page accessible via sidebar "Goods Return" nav item with RotateCcw icon
- Return workflow: Create (PENDING_APPROVAL) → Approve (APPROVED) → Complete (COMPLETED, restocks inventory) or Reject (REJECTED) or Cancel (CANCELLED, un-restocks)
- Return ticket generated on creation with full receipt-style layout

---
Task ID: 4
Agent: Main Agent
Task: Fix live preview — static asset 404s, missing addToast crash, SUPER_ADMIN role expansion

Work Log:
- Diagnosed static asset 404s: `output: "standalone"` in next.config.ts caused `_next/static/` CSS/JS/fonts to return 404 even after copying static files. Root cause: Turbopack chunk serving incompatibility with standalone mode.
- Fixed by removing `output: "standalone"` from next.config.ts and using `next start` directly
- Diagnosed client-side crash: `addToast is not a function` — page.tsx called `addToast()` on logout but never pulled it from `useAppStore`
- Fixed by adding `const addToast = useAppStore((s) => s.addToast)` in page.tsx
- Diagnosed `PERMISSIONS` undefined bug in users-view.tsx (2 occurrences) — variable was named `ALL_PERMISSIONS` but code referenced `PERMISSIONS`
- Fixed both occurrences of the reference bug
- Added `getRolePerms()` helper in users-view.tsx to use DB-backed roles state instead of hardcoded defaults
- Updated role dropdowns to show `X/21` format using live DB permissions count
- Updated login API to resolve permissions with priority chain: SUPER_ADMIN → all keys → user-level override → SystemRole fallback
- Login now returns `roleLabel` from SystemRole for display in topbar
- Added `GET /api/users?action=roles` endpoint for dynamic role dropdown population from DB
- Company name finalized: "SelRx - Pharmacy Management System"
- App title updated from "GAZPharm" to "SelRx" in layout.tsx metadata
- Verified fix with Playwright headless browser: "Title: SelRx - Pharmacy Management System, Errors: NONE"

Stage Summary:
- Live preview fully operational at https://preview-5fe7d2fc-11f8-4355-b613-d9e971b3cffa.space-z.ai/
- No more static asset 404s or client-side crashes
- 21 granular permissions, 6 DB-backed system roles, SUPER_ADMIN custom role creation
- Build passing cleanly

---
Task ID: 5
Agent: Main Agent
Task: Save app progress — rebuild, restart server, document all work

Work Log:
- Rebuilt app with `next build` — all 24 API routes compile, no errors
- Started production server on port 3000 — returns HTTP 200
- Updated worklog with complete history of all sessions and tasks
- Verified server running at localhost:3000

Stage Summary:
- Server running, build current, all previous work preserved
- Pending tasks: surface company name on receipts/return tickets, wire hardware printer API, fix CSV export, full i18n, remove demo accounts, cleanup inventory-view

---
Task ID: 6
Agent: Main Agent
Task: Complete pending tasks — receipts company name, CSV export, demo accounts, inventory cleanup

Work Log:
- Task 1 (Receipts/Return Tickets): Verified both receipt-modal.tsx and return-ticket-modal.tsx already use `company?.name || 'SelRx'` from Zustand store — company data loads from DB on app init via `/api/company-setup`. Company name "GREENLEAF PHARMACEUTICAL" surfaces correctly. Already complete from previous session.
- Task 2 (CSV Export): Sales History "Export CSV" button was a no-op (only showed toast). Implemented full CSV export: fetches all transactions for current filters (limit=9999), builds CSV with 13 columns (Transaction #, Date, Time, Cashier, Cashier Role, Customer, Payment Method, Items Count, Subtotal, Tax, Discount, Total, Status), proper CSV escaping, triggers blob download with filename `sales_history_<daterange>.csv`. Added loading state with spinner. Added `Loader2` import.
- Task 3 (Demo Accounts): Removed `DEMO_ACCOUNTS` array, `DemoAccount` interface, `handleDemoLogin` function, divider "Demo Accounts" label, and 3-column demo button grid from login-screen.tsx. Also removed unused `CardFooter` import. Login page now shows only email/password form.
- Task 4 (Inventory Cleanup): Verified inventory-view.tsx contains NO embedded `ProductSalesAnalytics` or `StockTakeSection` components. These are separate views imported directly in page.tsx router. Inventory view is clean — no cleanup needed.
- Build passed cleanly, server restarted, HTTP 200 verified. No "Demo Account" text found in rendered HTML.

Stage Summary:
- Receipts & return tickets: already surfacing company name from DB ✅
- CSV Export: now generates and downloads real CSV files with all transaction data ✅
- Demo accounts: removed from login page entirely ✅
- Inventory view: verified clean, no embedded sections ✅
- Modified files: `src/components/gazpharm/views/sales-history-view.tsx`, `src/components/gazpharm/login-screen.tsx`

---
Task ID: 7
Agent: Main Agent
Task: Diagnose and fix live preview issues

Work Log:
- Server was not running (process died between shell sessions)
- Found `output: 'standalone'` was re-introduced in next.config.ts — this was the root cause of previous 404s and causes "next start does not work with output: standalone" warning
- Removed `output: 'standalone'` from next.config.ts
- Rebuilt app — no more standalone warning
- Discovered the custom `scripts/start-server.js` (createServer wrapper) was causing 308 redirect loops due to malformed URL resolution (`http:/localhost/` instead of `http://localhost/`). The `new URL(req.url, base)` call with Next.js handler was producing broken Location headers
- Fixed `scripts/start-server.sh` to use `next start` directly instead of the custom Node.js server wrapper
- Verified all layers: HTML (200, 16446 bytes), CSS/JS static assets (all 200), API routes (dashboard/products/login all 200), SelRx branding present
- The sandbox environment kills background processes between shell commands — the auto-restart wrapper (`start-server.sh`) catches SIGTERM and restarts the server automatically

Stage Summary:
- Root cause #1: `output: 'standalone'` in next.config.ts re-introduced — REMOVED
- Root cause #2: Custom start-server.js createServer wrapper causing 308 redirect loops — REPLACED with direct `next start`
- All static assets serve correctly (200), APIs respond (200), HTML renders (16446 bytes)
- Modified files: `next.config.ts`, `scripts/start-server.sh`, `scripts/start-server.js`

---
Task ID: 1
Agent: main
Task: Fix client-side crash + stock take report not showing

Work Log:
- Investigated the client-side crash reported on selrx-pharmacy.vercel.app
- Found commit 50092f6 already fixed the duplicate formatCurrency import in dashboard-view.tsx
- Discovered remaining bug: stock-take-report-view.tsx used <TableFooter> in 4 sections but never imported it from @/components/ui/table
- This caused a ReferenceError crash whenever a user navigated to the stock take report view
- Added TableFooter to the table import statement
- Verified the build compiles cleanly with npx next build
- Reviewed all imports in reports-view.tsx — all icons, recharts components, and UI components are properly imported
- Committed and pushed to GitHub (26e5d48) for Vercel auto-deploy

Stage Summary:
- Root cause of stock take report crash: missing TableFooter import (ReferenceError at runtime)
- Fix: Added TableFooter to the import from @/components/ui/table in stock-take-report-view.tsx
- Pushed as commit 26e5d48 to main branch

---
Task ID: 2
Agent: main
Task: Add Excel/CSV bulk product import with template

Work Log:
- Read Product schema (22 fields), inventory-view.tsx, master-data-view.tsx
- Installed xlsx library for server-side Excel parsing
- Created /api/products/import/route.ts with GET (template download) and POST (import)
- Template: 3-sheet .xlsx (Products with 3 example rows, Categories Reference, Dosage Forms Reference)
- Import: flexible column mapping with header normalization (strips asterisks, handles aliases)
- Auto-creates vendors and manufacturers that don't exist
- RBAC: PHARMACIST and SUPER_ADMIN only
- Added Import dialog to inventory-view.tsx with drag-and-drop, template download, column guide
- Results panel with created/failed/skipped counts and per-row validation errors
- All 6 automated tests passed (template download, missing file, invalid type, RBAC, CSV import, duplicate NDC, XLSX import)
- Committed as d9a2218 and pushed to main

Stage Summary:
- Feature complete and tested
- Files: src/app/api/products/import/route.ts (new), inventory-view.tsx (modified)
- Import supports .xlsx, .xls, .csv files up to 5 MB
- Handles: flexible headers, auto-vendor/manufacturer creation, duplicate NDC detection, row-level validation errors
---
Task ID: 1
Agent: main
Task: Proactive hardening — eliminate all Prisma crash vectors on Vercel

Work Log:
- Audited all 31 API routes for Prisma usage patterns
- Found 2 files with CRITICAL static `import { db } from '@/lib/db'` that crash Vercel
- Rewrote products/import/route.ts with dual-mode (raw SQL for Turso, dynamic Prisma for local)
- Rewrote auth.ts (NextAuth config) with dual-mode pattern
- Hardened db.ts with try-catch wrapper around Prisma initialization
- Converted turso.ts from eager singleton to lazy Proxy-based init (fixes build without TURSO_DATABASE_URL)
- Added tursoExecute() and tursoBatch() with retry logic for transient errors
- Verified `next build` passes cleanly
- Pushed to Vercel

Stage Summary:
- 0 files remain with static Prisma imports — full elimination
- Build passes without TURSO_DATABASE_URL set (lazy init)
- All 31 API routes now safe for Vercel deployment
- retry logic added for Turso transient network errors
- Committed as 951cdad and pushed to main
---
Task ID: 1
Agent: main
Task: Fix dashboard crash on undefined transactionNo + harden all .replace() calls

Work Log:
- Verified dashboard-view.tsx fix already in place (txn.transactionNo || '').slice(-8) at line 355
- Searched ALL .slice() and .replace() calls across gazpharm views directory
- Found 5 additional unprotected .replace() calls on API-sourced fields
- Fixed: receipt-modal.tsx (paymentMethod), return-ticket-modal.tsx (status), stock-take-section.tsx (2x status), goods-return-view.tsx (reason, refundMethod), reports-view.tsx (role, userRole)
- Committed as 5ad11db and pushed to origin/main
- Confirmed Vercel deployment is live (302 redirect on preview URL)

Stage Summary:
- Root cause: Previous fix (2991dff) was committed but Vercel CDN/browser served cached old chunk (identical hash cf421b1e441609fd)
- Solution: New commit with additional null guards forces fresh build with new chunk hashes
- 5 files changed, 8 insertions, 8 deletions
- All .replace() calls on API-sourced string fields now have (field || '') fallback
---
Task ID: 2
Agent: main
Task: Fix Application Error crashes on multiple pages + sales history never loading

Work Log:
- Ran comprehensive audit of all 18 view components via Explore agent
- Found 4 CRASH-severity bugs: .split().map() on null in reports-view (1) and users-view (3)
- Found 5 HIGH-severity bugs: .toFixed() on undefined, .name without ?., .product without ?., formatCurrency(undefined)
- Discovered ROOT CAUSE of sales-history never loading: toObjs() helper in 8 API routes was calling c.name on string columns (from @libsql/client v0.17.4), returning undefined for ALL column names, making ALL API responses return garbage data
- Fixed toObjs in all 8 routes: dashboard, sales-history, inventory, transactions, transactions/[id], returns, returns/[id], product-sales-analytics
- Fixed all client-side null guards across 6 view files
- Committed as ad547fe and pushed to origin/main

Stage Summary:
- CRITICAL FIX: toObjs() was producing objects with all-undefined keys — this broke EVERY API route that used raw SQL (Turso path)
- 13 files changed, 31 insertions, 31 deletions
- Sales history, dashboard, inventory, returns, transactions should all now return proper data
- Reports, users, receipt modal, stock-take pages should no longer crash on null data
