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

---
Task ID: 3
Agent: main
Task: Fix dosage form dropdown showing no items on both inventory and drug catalog pages

Work Log:
- Root cause: API queried `SELECT DISTINCT dosageForm FROM Product` but DB had 0 products → empty dropdown
- No dedicated DosageForm table existed — forms were derived from product data (chicken-and-egg problem)
- Added `DosageForm` model to `prisma/schema.prisma` with `name` (unique), `isActive`, timestamps
- Ran `prisma db push` to create the table in SQLite
- Rewrote `/api/products/dosage-forms/route.ts` with full CRUD:
  - GET: reads active forms from DosageForm table
  - POST: creates new form (with duplicate check, 409 response)
  - PUT: renames form + updates any products using old name
  - DELETE: soft-deletes (sets isActive=false)
- Seeded 41 common pharmacy dosage forms (TABLET, CAPSULE, SYRUP, INJECTION, etc.)
- Updated inventory-view.tsx:
  - Removed localStorage-based dosage form logic
  - `fetchDosageForms` now reads directly from DB API
  - `handleAddDosageForm` now POSTs to DB API
  - Added `fetchDosageForms()` call to inventoryVersion listener for cross-page sync
- Updated master-data-view.tsx:
  - Removed `customDosageForms`, `dbDosageForms`, `allDosageForms`, `loadDosageForms`, `saveDosageForms`, `STORAGE_KEY_DOSAGE`
  - DrugSection now uses single `dosageFormsList` state fetched from DB
  - DosageFormModal now POSTs to DB API with loading state
  - DosageFormSection (standalone page) now fetches from DB, creates/renames/deletes via API
  - Added loading skeleton to DosageFormSection table
  - Both DrugSection and DosageFormSection refetch on inventoryVersion bump

Stage Summary:
- New table: `DosageForm` in SQLite with 41 pre-seeded forms
- API: `/api/products/dosage-forms` now supports GET/POST/PUT/DELETE
- Both pages show all dosage forms from the DB — no more empty dropdowns
- Forms added from either page persist in the DB and sync across pages
- Modified: `prisma/schema.prisma`, `src/app/api/products/dosage-forms/route.ts`, `src/components/gazpharm/views/inventory-view.tsx`, `src/components/gazpharm/views/master-data-view.tsx`
