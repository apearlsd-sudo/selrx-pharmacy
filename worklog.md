# Work Log

---
Task ID: 1
Agent: main
Task: Add Data Backup & Restore feature to Other Settings page

Work Log:
- Explored Other Settings page structure (4 existing cards: Regional, Currency, Receipt, System Info)
- Analyzed Prisma schema (21 tables including runtime-only Batch table)
- Studied Turso/Prisma dual-path patterns from existing API routes
- Created `/api/backup` route.ts with GET (export) and POST (import)
- Export covers all 21 tables in foreign-key-safe order with boolean conversion
- Import uses INSERT OR REPLACE (upsert mode) or full REPLACE mode with batched operations
- Built full Backup & Restore UI card with download, file upload, confirmation dialog, progress states, and per-table error reporting
- Build succeeded, pushed to production

Stage Summary:
- New file: `src/app/api/backup/route.ts` (combined GET/POST endpoint)
- Modified: `src/components/gazpharm/views/other-settings-view.tsx` (added Backup & Restore card)
- Both Turso (production) and Prisma (local dev) code paths supported
- SUPER_ADMIN role required for both backup and restore operations
- Commit: d22be45 pushed to main

---
Task ID: 2
Agent: main
Task: Fix Sell As (Unit Sales) cross-page sync between inventory and drug catalog

Work Log:
- Diagnosed root cause: both views used `method: 'PATCH'` but `/api/products/[id]/route.ts` only exports GET/PUT/DELETE — PATCH was returning 405 silently
- Fixed `handleSaveSellAs` in inventory-view.tsx: changed PATCH → PUT, added optimistic local state update
- Fixed `handleSaveSellAs` in master-data-view.tsx: changed PATCH → PUT, added optimistic form state update
- Added `inventoryVersion` subscription to inventory-view.tsx (with `useRef` + `useEffect`) so drug catalog mutations trigger inventory refetch
- Drug catalog already had `inventoryVersion` listener for the reverse direction
- Added `useRef` import to inventory-view.tsx
- Both files pass TypeScript type check with zero errors

Stage Summary:
- Bug: Sell As save was silently failing (405 Method Not Allowed) because no PATCH handler existed
- Fix: Changed to PUT (which supports partial updates) + added optimistic UI updates
- Cross-page sync: inventory-view now listens to `inventoryVersion` changes from drug catalog
- Modified: `src/components/gazpharm/views/inventory-view.tsx`, `src/components/gazpharm/views/master-data-view.tsx`
