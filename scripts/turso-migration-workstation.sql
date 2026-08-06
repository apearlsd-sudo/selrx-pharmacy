-- Turso migration: Add Workstation table and Transaction.workstationId

CREATE TABLE IF NOT EXISTS "Workstation" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- Add workstationId to Transaction table
ALTER TABLE "Transaction" ADD COLUMN "workstationId" TEXT REFERENCES "Workstation"(id);
