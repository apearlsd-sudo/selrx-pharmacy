-- ==========================================================================
-- SelRx Pharmacy App — New Tables Migration for Turso (libsql/SQLite)
-- ==========================================================================
-- Creates all new feature tables and adds missing columns to existing tables.
-- Uses CREATE TABLE IF NOT EXISTS for safe re-runs.
-- Self-healing ALTER TABLE statements use a pragma trick to avoid errors
-- when columns already exist (Turso/SQLite ignores duplicate-column errors
-- gracefully, but we wrap them for clarity).
-- ==========================================================================

-- -------------------------------------------------------------------------
-- 1. PricingTier
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PricingTier" (
  "id"              TEXT PRIMARY KEY,
  "name"            TEXT    NOT NULL UNIQUE,
  "description"     TEXT,
  "discountPercent" REAL    NOT NULL DEFAULT 0,
  "isDefault"       INTEGER NOT NULL DEFAULT 0,
  "isActive"        INTEGER NOT NULL DEFAULT 1,
  "createdAt"       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_PricingTier_isActive" ON "PricingTier" ("isActive");
CREATE INDEX IF NOT EXISTS "idx_PricingTier_isDefault" ON "PricingTier" ("isDefault");

-- -------------------------------------------------------------------------
-- 2. CustomerCredit
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CustomerCredit" (
  "id"            TEXT PRIMARY KEY,
  "customerId"    TEXT    NOT NULL REFERENCES "Customer"("id"),
  "transactionId" TEXT    REFERENCES "Transaction"("id"),
  "amount"        REAL    NOT NULL,
  "balance"       REAL    NOT NULL DEFAULT 0,
  "description"   TEXT,
  "createdBy"     TEXT    REFERENCES "User"("id"),
  "createdAt"     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_CustomerCredit_customerId"  ON "CustomerCredit" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_CustomerCredit_transactionId" ON "CustomerCredit" ("transactionId");
CREATE INDEX IF NOT EXISTS "idx_CustomerCredit_createdAt"   ON "CustomerCredit" ("createdAt");

-- -------------------------------------------------------------------------
-- 3. InsuranceClaim
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "InsuranceClaim" (
  "id"               TEXT PRIMARY KEY,
  "claimNo"          TEXT    NOT NULL UNIQUE,
  "prescriptionId"   TEXT    REFERENCES "Prescription"("id"),
  "transactionId"    TEXT    REFERENCES "Transaction"("id"),
  "customerId"       TEXT    NOT NULL REFERENCES "Customer"("id"),
  "insuranceProvider" TEXT    NOT NULL,
  "policyNumber"     TEXT,
  "totalAmount"      REAL    NOT NULL,
  "approvedAmount"   REAL    NOT NULL DEFAULT 0,
  "coPayAmount"      REAL    NOT NULL DEFAULT 0,
  "status"           TEXT    NOT NULL DEFAULT 'PENDING',
  "submittedAt"      TEXT,
  "approvedAt"        TEXT,
  "paidAt"           TEXT,
  "rejectionReason"  TEXT,
  "notes"            TEXT,
  "createdAt"        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_claimNo"          ON "InsuranceClaim" ("claimNo");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_customerId"       ON "InsuranceClaim" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_prescriptionId"   ON "InsuranceClaim" ("prescriptionId");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_transactionId"    ON "InsuranceClaim" ("transactionId");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_status"           ON "InsuranceClaim" ("status");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_insuranceProvider" ON "InsuranceClaim" ("insuranceProvider");
CREATE INDEX IF NOT EXISTS "idx_InsuranceClaim_submittedAt"      ON "InsuranceClaim" ("submittedAt");

-- -------------------------------------------------------------------------
-- 4. SupplierPriceList
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SupplierPriceList" (
  "id"        TEXT PRIMARY KEY,
  "vendorId"  TEXT    NOT NULL REFERENCES "Vendor"("id"),
  "vendorName" TEXT,
  "validFrom" TEXT,
  "validTo"   TEXT,
  "notes"     TEXT,
  "createdAt" TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt" TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_SupplierPriceList_vendorId"   ON "SupplierPriceList" ("vendorId");
CREATE INDEX IF NOT EXISTS "idx_SupplierPriceList_validFrom"  ON "SupplierPriceList" ("validFrom");
CREATE INDEX IF NOT EXISTS "idx_SupplierPriceList_validTo"    ON "SupplierPriceList" ("validTo");

-- -------------------------------------------------------------------------
-- 5. SupplierPriceListItem
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SupplierPriceListItem" (
  "id"          TEXT PRIMARY KEY,
  "priceListId" TEXT    NOT NULL REFERENCES "SupplierPriceList"("id") ON DELETE CASCADE,
  "productId"   TEXT    NOT NULL REFERENCES "Product"("id"),
  "productName" TEXT,
  "unitCost"    REAL    NOT NULL,
  "packSize"    INTEGER NOT NULL DEFAULT 1,
  "minOrderQty" INTEGER NOT NULL DEFAULT 1,
  "createdAt"   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_SupplierPriceListItem_priceListId" ON "SupplierPriceListItem" ("priceListId");
CREATE INDEX IF NOT EXISTS "idx_SupplierPriceListItem_productId"   ON "SupplierPriceListItem" ("productId");
CREATE INDEX IF NOT EXISTS "idx_SupplierPriceListItem_productName" ON "SupplierPriceListItem" ("productName");

-- -------------------------------------------------------------------------
-- 6. Notification  (existing table — add missing columns)
--    We only ALTER; the table itself is assumed to already exist.
-- -------------------------------------------------------------------------

-- Self-healing column additions for Notification.
-- In Turso/SQLite a duplicate ADD COLUMN raises an error, so we guard
-- each with a pragma check wrapped in a temporary view trick.
-- However, Turso supports PRAGMA table_info() reads, and the simplest
-- portable pattern for libsql is to attempt the ALTER inside a script
-- that is tolerant of errors.  We use the common SQLite idiom:
--   CREATE TABLE _ignore_ AS SELECT 1 WHERE 0 = (SELECT count(*)
--     FROM pragma_table_info('Notification') WHERE name = '<col>');
-- Because that's not directly executable, we instead provide raw ALTER
-- statements that the migration runner should execute with
-- error-tolerance (ignore duplicate-column errors).
--
-- For Turso CLI (`turso db shell`) these will fail silently on re-run.
-- For programmatic runners, wrap each in a try/catch.

ALTER TABLE "Notification" ADD COLUMN "entityType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "entityId"   TEXT;
ALTER TABLE "Notification" ADD COLUMN "readAt"     TEXT;
ALTER TABLE "Notification" ADD COLUMN "userId"      TEXT REFERENCES "User"("id");

CREATE INDEX IF NOT EXISTS "idx_Notification_userId"     ON "Notification" ("userId");
CREATE INDEX IF NOT EXISTS "idx_Notification_entityType"  ON "Notification" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "idx_Notification_readAt"      ON "Notification" ("readAt");

-- -------------------------------------------------------------------------
-- 7. LoyaltyTransaction
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "LoyaltyTransaction" (
  "id"            TEXT PRIMARY KEY,
  "customerId"    TEXT    NOT NULL REFERENCES "Customer"("id"),
  "transactionId" TEXT    REFERENCES "Transaction"("id"),
  "points"        INTEGER NOT NULL,
  "action"        TEXT    NOT NULL,
  "description"   TEXT,
  "createdBy"     TEXT    REFERENCES "User"("id"),
  "createdAt"     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_customerId"    ON "LoyaltyTransaction" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_transactionId" ON "LoyaltyTransaction" ("transactionId");
CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_action"        ON "LoyaltyTransaction" ("action");
CREATE INDEX IF NOT EXISTS "idx_LoyaltyTransaction_createdAt"    ON "LoyaltyTransaction" ("createdAt");

-- -------------------------------------------------------------------------
-- 8. UserTarget
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "UserTarget" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT    NOT NULL REFERENCES "User"("id"),
  "period"     TEXT    NOT NULL,
  "targetType" TEXT    NOT NULL,
  "targetValue" REAL   NOT NULL DEFAULT 0,
  "createdAt"  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updatedAt"  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_UserTarget_userId"     ON "UserTarget" ("userId");
CREATE INDEX IF NOT EXISTS "idx_UserTarget_period"     ON "UserTarget" ("period");
CREATE INDEX IF NOT EXISTS "idx_UserTarget_targetType" ON "UserTarget" ("targetType");
CREATE INDEX IF NOT EXISTS "idx_UserTarget_userId_period" ON "UserTarget" ("userId", "period");

-- -------------------------------------------------------------------------
-- 9. ApprovalLog
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ApprovalLog" (
  "id"         TEXT PRIMARY KEY,
  "action"     TEXT    NOT NULL,
  "entityType" TEXT    NOT NULL,
  "entityId"   TEXT    NOT NULL,
  "requesterId" TEXT    REFERENCES "User"("id"),
  "approverId"  TEXT    REFERENCES "User"("id"),
  "details"    TEXT,
  "approved"   INTEGER NOT NULL DEFAULT 1,
  "createdAt"  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "idx_ApprovalLog_entityType_entityId" ON "ApprovalLog" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "idx_ApprovalLog_requesterId"          ON "ApprovalLog" ("requesterId");
CREATE INDEX IF NOT EXISTS "idx_ApprovalLog_approverId"           ON "ApprovalLog" ("approverId");
CREATE INDEX IF NOT EXISTS "idx_ApprovalLog_action"               ON "ApprovalLog" ("action");
CREATE INDEX IF NOT EXISTS "idx_ApprovalLog_createdAt"            ON "ApprovalLog" ("createdAt");

-- ==========================================================================
-- ALTER TABLE: Add missing columns to existing tables
-- ==========================================================================
-- SQLite does not support ALTER TABLE … ADD COLUMN IF NOT EXISTS.
-- Each statement below will error if the column already exists.
-- Migration runners should execute these with error-tolerance.
-- The Turso CLI (`turso db shell < file.sql`) will print the error but
-- continue executing subsequent statements.
-- ==========================================================================

-- Product: wholesalePrice
ALTER TABLE "Product" ADD COLUMN "wholesalePrice" REAL;

-- Product: pricingTierId
ALTER TABLE "Product" ADD COLUMN "pricingTierId" TEXT REFERENCES "PricingTier"("id");

-- Product: barcode
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;

-- Customer: loyaltyPoints
ALTER TABLE "Customer" ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- Customer: loyaltyTier
ALTER TABLE "Customer" ADD COLUMN "loyaltyTier" TEXT NOT NULL DEFAULT 'BRONZE';

-- ==========================================================================
-- Indexes for newly-added columns on existing tables
-- ==========================================================================

CREATE INDEX IF NOT EXISTS "idx_Product_pricingTierId" ON "Product" ("pricingTierId");
CREATE INDEX IF NOT EXISTS "idx_Product_barcode"       ON "Product" ("barcode");
CREATE INDEX IF NOT EXISTS "idx_Customer_loyaltyTier"  ON "Customer" ("loyaltyTier");
CREATE INDEX IF NOT EXISTS "idx_Customer_loyaltyPoints" ON "Customer" ("loyaltyPoints");

-- ==========================================================================
-- Done. Run with:  turso db shell < scripts/migrate-new-tables.sql
-- Or programmatically execute each statement, catching duplicate-column
-- errors on the ALTER TABLE statements.
-- ==========================================================================
