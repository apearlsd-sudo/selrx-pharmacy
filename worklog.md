---
Task ID: 1
Agent: Main
Task: Add 5 advanced reporting features to the pharmacy POS system

Work Log:
- Explored full codebase structure: 43 API routes, 7 existing report views, 52 shadcn/ui components, recharts library
- Analyzed existing /api/reports/advanced endpoint with 6 report types (revenue, profit, customers, expiry, payments, comparison)
- Added 5 new report type handlers to the API: stock-velocity, returns-analysis, user-performance, prescription-analytics, inventory-valuation
- Added Prisma fallback stubs for all 5 new types
- Built 5 new UI tab components in advanced-reports-view.tsx with KPI cards, charts, tables, and CSV export
- Added new lucide icons: Zap, RotateCcw, Award, FileText, Package, Clock, Activity, TrendingDown, CheckCircle2
- Verified build passes successfully
- Committed and pushed to Vercel

Stage Summary:
- 5 new advanced report types added (from 6 to 11 total)
- Stock Velocity: classifies products as Fast/Moderate/Slow/Dead with daily sell rate and days-of-stock remaining
- Returns Analysis: tracks return rate by reason, daily refund trend, most returned products
- Staff Performance: per-user sales, transactions, discount rate, void rate comparison
- Prescription Analytics: Rx status breakdown, prescriber rankings, avg fulfillment time
- Inventory Valuation: cost vs retail value by category, potential profit bar, below-reorder-point items
- All reports include CSV export, date range filtering, and RBAC support
- Files modified: src/app/api/reports/advanced/route.ts (+470 lines), src/components/gazpharm/views/advanced-reports-view.tsx (+520 lines)
