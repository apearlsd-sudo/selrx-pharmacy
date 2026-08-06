use rusqlite::{Connection, params, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;

/// The application's database state, wrapped in a Mutex for thread safety.
pub struct DbState(pub Mutex<Connection>);

/// Represents a row in the SyncLog table.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLogEntry {
    pub id: String,
    pub table_name: String,
    pub record_id: String,
    pub operation: String,
    pub data: String,
    pub created_at: String,
    pub synced: i32,
}

/// Represents a sync checkpoint.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncCheckpoint {
    pub workstation_id: String,
    pub table_name: String,
    pub last_sync_timestamp: String,
}

impl DbState {
    /// Open (or create) the local SQLite database and run migrations.
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        let db_path = app_data_dir.join("gazpharm.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database at {:?}: {}", db_path, e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL;")
            .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

        // Enable foreign keys
        conn.execute_batch("PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        let db = Self(Mutex::new(conn));
        db.run_migrations()?;
        Ok(db)
    }

    /// Run all database migrations to create/update tables.
    pub fn run_migrations(&self) -> Result<(), String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            r#"
            -- System Roles
            CREATE TABLE IF NOT EXISTS "SystemRole" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "label" TEXT NOT NULL,
                "description" TEXT,
                "permissions" TEXT NOT NULL,
                "color" TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-700 border-gray-200',
                "isSystem" INTEGER NOT NULL DEFAULT 0,
                "isActive" INTEGER NOT NULL DEFAULT 1,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Users
            CREATE TABLE IF NOT EXISTS "User" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "email" TEXT NOT NULL UNIQUE,
                "password" TEXT NOT NULL,
                "name" TEXT NOT NULL,
                "role" TEXT NOT NULL DEFAULT 'CLERK',
                "phone" TEXT,
                "licenseNumber" TEXT,
                "permissions" TEXT,
                "department" TEXT,
                "shift" TEXT,
                "hireDate" TEXT,
                "active" INTEGER NOT NULL DEFAULT 1,
                "lastLogin" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Customers
            CREATE TABLE IF NOT EXISTS "Customer" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "firstName" TEXT NOT NULL,
                "lastName" TEXT NOT NULL,
                "email" TEXT,
                "phone" TEXT,
                "dateOfBirth" TEXT,
                "gender" TEXT,
                "address" TEXT,
                "insuranceProvider" TEXT,
                "insurancePolicyNo" TEXT,
                "allergies" TEXT,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Dosage Forms
            CREATE TABLE IF NOT EXISTS "DosageForm" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "isActive" INTEGER NOT NULL DEFAULT 1,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Products
            CREATE TABLE IF NOT EXISTS "Product" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "ndc" TEXT UNIQUE,
                "barcode" TEXT UNIQUE,
                "name" TEXT NOT NULL,
                "genericName" TEXT,
                "manufacturer" TEXT,
                "manufacturerId" TEXT,
                "vendorId" TEXT,
                "category" TEXT NOT NULL DEFAULT 'OTC',
                "description" TEXT,
                "dosageForm" TEXT,
                "strength" TEXT,
                "unitOfMeasure" TEXT NOT NULL DEFAULT 'EA',
                "sellingUnit" TEXT NOT NULL DEFAULT 'EA',
                "itemsPerUnit" INTEGER NOT NULL DEFAULT 1,
                "requiresPrescription" INTEGER NOT NULL DEFAULT 0,
                "status" TEXT NOT NULL DEFAULT 'ACTIVE',
                "sellingPrice" REAL NOT NULL,
                "costPrice" REAL,
                "reorderPoint" INTEGER NOT NULL DEFAULT 10,
                "reorderQty" INTEGER NOT NULL DEFAULT 50,
                "maxStock" INTEGER,
                "storageLocation" TEXT,
                "batchNumber" TEXT,
                "expiryDate" TEXT,
                "controlledSubstance" INTEGER NOT NULL DEFAULT 0,
                "deaSchedule" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "vendorId" REFERENCES "Vendor"("id") ON DELETE SET NULL,
                "manufacturerId" REFERENCES "Manufacturer"("id") ON DELETE SET NULL
            );

            -- Inventory
            CREATE TABLE IF NOT EXISTS "Inventory" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
                "quantity" INTEGER NOT NULL DEFAULT 0,
                "lastCounted" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE("productId")
            );

            -- Batches
            CREATE TABLE IF NOT EXISTS "Batch" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
                "batchNumber" TEXT NOT NULL,
                "costPrice" REAL NOT NULL,
                "sellingPrice" REAL NOT NULL,
                "quantity" INTEGER NOT NULL DEFAULT 0,
                "expiryDate" TEXT NOT NULL,
                "supplier" TEXT,
                "notes" TEXT,
                "isActive" INTEGER NOT NULL DEFAULT 1,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Transactions
            CREATE TABLE IF NOT EXISTS "Transaction" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "transactionNo" TEXT NOT NULL UNIQUE,
                "customerId" TEXT REFERENCES "Customer"("id") ON DELETE SET NULL,
                "userId" TEXT NOT NULL REFERENCES "User"("id"),
                "workstationId" TEXT REFERENCES "Workstation"("id") ON DELETE SET NULL,
                "subtotal" REAL NOT NULL,
                "tax" REAL NOT NULL DEFAULT 0,
                "discount" REAL NOT NULL DEFAULT 0,
                "total" REAL NOT NULL,
                "paymentMethod" TEXT NOT NULL,
                "paymentAmount" REAL NOT NULL,
                "changeAmount" REAL NOT NULL DEFAULT 0,
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "prescriptionId" TEXT,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Transaction Items
            CREATE TABLE IF NOT EXISTS "TransactionItem" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "transactionId" TEXT NOT NULL REFERENCES "Transaction"("id") ON DELETE CASCADE,
                "productId" TEXT NOT NULL REFERENCES "Product"("id"),
                "productName" TEXT NOT NULL,
                "quantity" INTEGER NOT NULL,
                "unitPrice" REAL NOT NULL,
                "subtotal" REAL NOT NULL,
                "requiresRx" INTEGER NOT NULL DEFAULT 0,
                "dispensedQty" INTEGER,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Prescriptions
            CREATE TABLE IF NOT EXISTS "Prescription" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "rxNumber" TEXT NOT NULL UNIQUE,
                "customerId" TEXT NOT NULL REFERENCES "Customer"("id"),
                "patientName" TEXT NOT NULL,
                "prescriberName" TEXT NOT NULL,
                "prescriberNPI" TEXT,
                "prescriberPhone" TEXT,
                "prescriberFax" TEXT,
                "productName" TEXT NOT NULL,
                "productNdc" TEXT,
                "dosage" TEXT,
                "quantity" INTEGER NOT NULL,
                "refillsRemaining" INTEGER NOT NULL,
                "refillsTotal" INTEGER NOT NULL,
                "daysSupply" INTEGER,
                "dispenseAsWritten" INTEGER NOT NULL DEFAULT 0,
                "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "notes" TEXT,
                "filledById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
                "verifiedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
                "filledAt" TEXT,
                "expiresAt" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Returns
            CREATE TABLE IF NOT EXISTS "Return" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "returnNo" TEXT NOT NULL UNIQUE,
                "transactionId" TEXT NOT NULL REFERENCES "Transaction"("id"),
                "transactionItemId" TEXT NOT NULL REFERENCES "TransactionItem"("id"),
                "productId" TEXT NOT NULL REFERENCES "Product"("id"),
                "productName" TEXT NOT NULL,
                "quantity" INTEGER NOT NULL,
                "unitPrice" REAL NOT NULL,
                "refundAmount" REAL NOT NULL,
                "reason" TEXT NOT NULL,
                "reasonNote" TEXT,
                "customerId" TEXT,
                "customerName" TEXT,
                "userId" TEXT NOT NULL REFERENCES "User"("id"),
                "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
                "approvedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
                "approvedAt" TEXT,
                "refundMethod" TEXT NOT NULL DEFAULT 'CASH',
                "refundProcessed" INTEGER NOT NULL DEFAULT 0,
                "restocked" INTEGER NOT NULL DEFAULT 0,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Workstations
            CREATE TABLE IF NOT EXISTS "Workstation" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "description" TEXT,
                "location" TEXT,
                "isActive" INTEGER NOT NULL DEFAULT 1,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Company
            CREATE TABLE IF NOT EXISTS "Company" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "slug" TEXT NOT NULL UNIQUE,
                "logo" TEXT,
                "tagline" TEXT,
                "businessType" TEXT NOT NULL DEFAULT 'Pharmacy',
                "registrationNo" TEXT,
                "pharmacyLicense" TEXT,
                "taxId" TEXT,
                "phone" TEXT,
                "email" TEXT,
                "website" TEXT,
                "address" TEXT,
                "city" TEXT,
                "state" TEXT,
                "country" TEXT,
                "postalCode" TEXT,
                "currency" TEXT NOT NULL DEFAULT 'USD',
                "timezone" TEXT NOT NULL DEFAULT 'UTC',
                "active" INTEGER NOT NULL DEFAULT 1,
                "ownerName" TEXT,
                "ownerId" TEXT UNIQUE REFERENCES "User"("id") ON DELETE SET NULL,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Manufacturers
            CREATE TABLE IF NOT EXISTS "Manufacturer" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "contactPerson" TEXT,
                "email" TEXT,
                "phone" TEXT,
                "address" TEXT,
                "city" TEXT,
                "country" TEXT,
                "website" TEXT,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Vendors
            CREATE TABLE IF NOT EXISTS "Vendor" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "contactPerson" TEXT,
                "email" TEXT,
                "phone" TEXT,
                "address" TEXT,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Categories
            CREATE TABLE IF NOT EXISTS "Category" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "name" TEXT NOT NULL UNIQUE,
                "description" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Product-Category junction
            CREATE TABLE IF NOT EXISTS "_CategoryToProduct" (
                "A" TEXT NOT NULL REFERENCES "Category"("id") ON DELETE CASCADE,
                "B" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE
            );

            -- Audit Log
            CREATE TABLE IF NOT EXISTS "AuditLog" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "userId" TEXT NOT NULL REFERENCES "User"("id"),
                "action" TEXT NOT NULL,
                "details" TEXT,
                "ipAddress" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Product History
            CREATE TABLE IF NOT EXISTS "ProductHistory" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
                "action" TEXT NOT NULL,
                "changedFields" TEXT,
                "previousValues" TEXT,
                "newValues" TEXT,
                "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Stock Take
            CREATE TABLE IF NOT EXISTS "StockTake" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "reference" TEXT NOT NULL UNIQUE,
                "status" TEXT NOT NULL DEFAULT 'PENDING',
                "notes" TEXT,
                "countedBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
                "startedAt" TEXT,
                "completedAt" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- Stock Take Items
            CREATE TABLE IF NOT EXISTS "StockTakeItem" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "stockTakeId" TEXT NOT NULL REFERENCES "StockTake"("id") ON DELETE CASCADE,
                "productId" TEXT NOT NULL REFERENCES "Product"("id"),
                "systemQty" INTEGER NOT NULL,
                "countedQty" INTEGER,
                "variance" INTEGER,
                "notes" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE("stockTakeId", "productId")
            );

            -- Hardware Log
            CREATE TABLE IF NOT EXISTS "HardwareLog" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "transactionId" TEXT UNIQUE REFERENCES "Transaction"("id") ON DELETE SET NULL,
                "hardwareType" TEXT NOT NULL,
                "action" TEXT NOT NULL,
                "status" TEXT NOT NULL DEFAULT 'success',
                "details" TEXT,
                "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- ================================================================
            -- SYNC TABLES (not in the Prisma schema — desktop-only)
            -- ================================================================

            -- Tracks every local change for sync
            CREATE TABLE IF NOT EXISTS "SyncLog" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "table_name" TEXT NOT NULL,
                "record_id" TEXT NOT NULL,
                "operation" TEXT NOT NULL,
                "data" TEXT NOT NULL,
                "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
                "synced" INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS "idx_sync_pending"
                ON "SyncLog"("synced", "created_at");

            -- Per-table sync checkpoints
            CREATE TABLE IF NOT EXISTS "SyncCheckpoint" (
                "workstation_id" TEXT NOT NULL,
                "table_name" TEXT NOT NULL,
                "last_sync_timestamp" TEXT NOT NULL,
                PRIMARY KEY ("workstation_id", "table_name")
            );

            -- Local device identity
            CREATE TABLE IF NOT EXISTS "DeviceInfo" (
                "key" TEXT NOT NULL PRIMARY KEY,
                "value" TEXT NOT NULL
            );
            "#,
        )
        .map_err(|e| format!("Migration failed: {}", e))?;

        Ok(())
    }

    // ===================================================================
    // Generic CRUD commands called from the frontend via Tauri IPC
    // ===================================================================

    /// Execute a SELECT query and return rows as JSON array of objects.
    pub fn query(&self, sql: String, params: Vec<String>) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare failed: {}", e))?;

        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|s| s.to_string())
            .collect();

        // Build param references dynamically
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let mut obj = serde_json::Map::new();
                for (i, name) in column_names.iter().enumerate() {
                    let val: rusqlite::types::Value = row.get(i)?;
                    let json_val = match val {
                        rusqlite::types::Value::Null => serde_json::Value::Null,
                        rusqlite::types::Value::Integer(n) => serde_json::json!(n),
                        rusqlite::types::Value::Real(f) => serde_json::json!(f),
                        rusqlite::types::Value::Text(s) => serde_json::json!(s),
                        rusqlite::types::Value::Blob(b) => {
                            serde_json::json!(String::from_utf8_lossy(&b).to_string())
                        }
                    };
                    obj.insert(name.clone(), json_val);
                }
                Ok(serde_json::Value::Object(obj))
            })
            .map_err(|e| format!("Query failed: {}", e))?;

        let results: Vec<serde_json::Value> =
            rows.filter_map(|r| r.ok()).collect();

        serde_json::to_string(&results).map_err(|e| format!("Serialize failed: {}", e))
    }

    /// Execute an INSERT, UPDATE, or DELETE and return the number of affected rows.
    /// Also writes a SyncLog entry for tracking.
    pub fn execute(
        &self,
        sql: String,
        params: Vec<String>,
        table_name: String,
        operation: String,
        record_id: String,
        record_data: String,
    ) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;

        // Execute the main statement within a transaction
        let affected = {
            let tx = conn.unchecked_transaction().map_err(|e| format!("Tx begin: {}", e))?;

            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                params.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();

            let affected = tx
                .execute(&sql, param_refs.as_slice())
                .map_err(|e| format!("Execute failed: {}", e))?;

            // Log the change for sync
            if !table_name.is_empty() {
                tx.execute(
                    r#"INSERT INTO "SyncLog" (id, table_name, record_id, operation, data, created_at, synced)
                       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), 0)"#,
                    params![
                        &format!("sl_{}", uuid::Uuid::new_v4().simple()),
                        &table_name,
                        &record_id,
                        &operation,
                        &record_data,
                    ],
                )
                .map_err(|e| format!("SyncLog insert failed: {}", e))?;
            }

            tx.commit().map_err(|e| format!("Tx commit: {}", e))?;
            affected
        };

        Ok(serde_json::json!({ "affected": affected }).to_string())
    }

    /// Execute multiple statements in a single transaction.
    pub fn batch(&self, statements: Vec<BatchStmt>) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| format!("Tx begin: {}", e))?;

        let mut total_affected = 0;
        for stmt in &statements {
            let param_refs: Vec<&dyn rusqlite::types::ToSql> =
                stmt.params.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();
            total_affected += tx
                .execute(&stmt.sql, param_refs.as_slice())
                .map_err(|e| format!("Batch stmt failed: {}", e))?;
        }

        tx.commit().map_err(|e| format!("Batch commit: {}", e))?;
        Ok(serde_json::json!({ "affected": total_affected }).to_string())
    }

    // ===================================================================
    // Sync-specific commands
    // ===================================================================

    /// Get all pending (unsynced) SyncLog entries.
    pub fn get_pending_syncs(&self) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"SELECT id, table_name, record_id, operation, data, created_at, synced
                   FROM "SyncLog" WHERE synced = 0 ORDER BY created_at ASC"#,
            )
            .map_err(|e| format!("Prepare sync query: {}", e))?;

        let entries = stmt
            .query_map([], |row| {
                Ok(SyncLogEntry {
                    id: row.get(0)?,
                    table_name: row.get(1)?,
                    record_id: row.get(2)?,
                    operation: row.get(3)?,
                    data: row.get(4)?,
                    created_at: row.get(5)?,
                    synced: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query sync: {}", e))?;

        let results: Vec<SyncLogEntry> = entries.filter_map(|r| r.ok()).collect();
        serde_json::to_string(&results).map_err(|e| format!("Serialize sync: {}", e))
    }

    /// Mark sync log entries as synced.
    pub fn mark_synced(&self, ids: Vec<String>) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        for id in &ids {
            conn.execute(
                r#"UPDATE "SyncLog" SET synced = 1 WHERE id = ?"#,
                params![id],
            )
            .map_err(|e| format!("Mark synced failed for {}: {}", id, e))?;
        }
        Ok(serde_json::json!({ "marked": ids.len() }).to_string())
    }

    /// Get the last sync timestamp for a given table.
    pub fn get_checkpoint(
        &self,
        workstation_id: String,
        table_name: String,
    ) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let result: String = conn
            .query_row(
                r#"SELECT last_sync_timestamp FROM "SyncCheckpoint"
                   WHERE workstation_id = ? AND table_name = ?"#,
                params![workstation_id, table_name],
                |row| row.get(0),
            )
            .unwrap_or_default();
        Ok(result)
    }

    /// Update a sync checkpoint.
    pub fn set_checkpoint(
        &self,
        workstation_id: String,
        table_name: String,
        timestamp: String,
    ) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"INSERT INTO "SyncCheckpoint" (workstation_id, table_name, last_sync_timestamp)
               VALUES (?1, ?2, ?3)
               ON CONFLICT(workstation_id, table_name)
               DO UPDATE SET last_sync_timestamp = excluded.last_sync_timestamp"#,
            params![workstation_id, table_name, timestamp],
        )
        .map_err(|e| format!("Set checkpoint: {}", e))?;
        Ok(serde_json::json!({ "ok": true }).to_string())
    }

    /// Get or create the local device ID.
    pub fn get_device_id(&self) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;

        // Try to get existing device ID
        let result: Result<String, _> = conn.query_row(
            r#"SELECT value FROM "DeviceInfo" WHERE key = 'device_id'"#,
            [],
            |row| row.get(0),
        );

        match result {
            Ok(id) => Ok(id),
            Err(_) => {
                // Generate a new device ID
                let new_id = uuid::Uuid::new_v4().to_string();
                conn.execute(
                    r#"INSERT OR REPLACE INTO "DeviceInfo" (key, value) VALUES ('device_id', ?1)"#,
                    params![new_id],
                )
                .map_err(|e| format!("Save device_id: {}", e))?;
                Ok(new_id)
            }
        }
    }

    /// Get the database path for display.
    pub fn get_db_path(&self) -> Result<String, String> {
        let conn = self.0.lock().map_err(|e| e.to_string())?;
        let path = conn.path().to_string_lossy().to_string();
        Ok(path)
    }
}

/// A single SQL statement for batch execution.
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchStmt {
    pub sql: String,
    pub params: Vec<String>,
}
