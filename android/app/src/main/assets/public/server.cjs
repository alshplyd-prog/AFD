var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  bumpSyncVersion: () => bumpSyncVersion
});
module.exports = __toCommonJS(server_exports);
var import_dotenv2 = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/db/fileDb.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
var DATA_DIR = isNode && typeof process.cwd === "function" ? import_path.default.join(process.cwd(), "data") : "";
if (isNode && import_fs.default.existsSync && !import_fs.default.existsSync(DATA_DIR)) {
  try {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
  }
}
function getFilePath(tableName) {
  if (isNode && DATA_DIR) {
    return import_path.default.join(DATA_DIR, `${tableName}.json`);
  }
  return `${tableName}.json`;
}
function loadTable(tableName) {
  try {
    if (isNode && import_fs.default.existsSync) {
      const file = getFilePath(tableName);
      if (!import_fs.default.existsSync(file)) {
        return [];
      }
      const content = import_fs.default.readFileSync(file, "utf-8");
      return JSON.parse(content) || [];
    } else if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(`filedb_${tableName}`);
      return stored ? JSON.parse(stored) : [];
    }
  } catch {
    return [];
  }
  return [];
}
function saveTable(tableName, data) {
  try {
    if (isNode && import_fs.default.writeFileSync) {
      const file = getFilePath(tableName);
      import_fs.default.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(`filedb_${tableName}`, JSON.stringify(data));
    }
  } catch (e) {
    console.error(`Error saving table ${tableName}:`, e);
  }
}
var fileDb = {
  get: (tableName) => {
    return loadTable(tableName);
  },
  upsert: (tableName, record) => {
    const records = loadTable(tableName);
    const index = records.findIndex((r) => r.id === record.id);
    if (index >= 0) {
      records[index] = { ...records[index], ...record };
    } else {
      records.push(record);
    }
    saveTable(tableName, records);
    return record;
  },
  update: (tableName, id, updates) => {
    const records = loadTable(tableName);
    const index = records.findIndex((r) => r.id === id);
    if (index >= 0) {
      records[index] = { ...records[index], ...updates };
      saveTable(tableName, records);
      return true;
    }
    return false;
  },
  delete: (tableName, id) => {
    const records = loadTable(tableName);
    const filtered = records.filter((r) => r.id !== id);
    saveTable(tableName, filtered);
    return true;
  },
  setAll: (tableName, data) => {
    saveTable(tableName, data);
  }
};

// src/db/index.ts
var import_dotenv = __toESM(require("dotenv"), 1);
var import_node_postgres = require("drizzle-orm/node-postgres");
var import_pg = require("pg");

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  cashFunds: () => cashFunds,
  customerLists: () => customerLists,
  customers: () => customers,
  deletedRecords: () => deletedRecords,
  employeeTransactions: () => employeeTransactions,
  employees: () => employees,
  fundTransactions: () => fundTransactions,
  inventoryItems: () => inventoryItems,
  paymentConflicts: () => paymentConflicts,
  payments: () => payments,
  reps: () => reps,
  sales: () => sales,
  systemSettings: () => systemSettings,
  users: () => users,
  usersRelations: () => usersRelations
});
var import_drizzle_orm = require("drizzle-orm");
var import_pg_core = require("drizzle-orm/pg-core");
var users = (0, import_pg_core.pgTable)("users", {
  id: (0, import_pg_core.serial)("id").primaryKey(),
  uid: (0, import_pg_core.text)("uid").notNull().unique(),
  // User Auth UID
  email: (0, import_pg_core.text)("email").notNull(),
  displayName: (0, import_pg_core.text)("display_name"),
  role: (0, import_pg_core.text)("role").default("user"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var inventoryItems = (0, import_pg_core.pgTable)("inventory_items", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  price: (0, import_pg_core.doublePrecision)("price").notNull(),
  purchasePrice: (0, import_pg_core.doublePrecision)("purchase_price").default(0),
  quantity: (0, import_pg_core.integer)("quantity").notNull().default(0),
  dailyInstallment: (0, import_pg_core.doublePrecision)("daily_installment").default(0),
  category: (0, import_pg_core.text)("category"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var customerLists = (0, import_pg_core.pgTable)("customer_lists", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  fundId: (0, import_pg_core.text)("fund_id").notNull(),
  description: (0, import_pg_core.text)("description"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var cashFunds = (0, import_pg_core.pgTable)("cash_funds", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  balance: (0, import_pg_core.doublePrecision)("balance").notNull().default(0),
  description: (0, import_pg_core.text)("description"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var customers = (0, import_pg_core.pgTable)("customers", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  phone: (0, import_pg_core.text)("phone"),
  address: (0, import_pg_core.text)("address"),
  listId: (0, import_pg_core.text)("list_id"),
  listName: (0, import_pg_core.text)("list_name"),
  notes: (0, import_pg_core.text)("notes"),
  totalPurchases: (0, import_pg_core.doublePrecision)("total_purchases").default(0),
  totalPaid: (0, import_pg_core.doublePrecision)("total_paid").default(0),
  remainingBalance: (0, import_pg_core.doublePrecision)("remaining_balance").default(0),
  status: (0, import_pg_core.text)("status").default("active"),
  createdAt: (0, import_pg_core.timestamp)("created_at").defaultNow()
});
var sales = (0, import_pg_core.pgTable)("sales", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  saleNumber: (0, import_pg_core.text)("sale_number"),
  customerId: (0, import_pg_core.text)("customer_id"),
  customerName: (0, import_pg_core.text)("customer_name").notNull(),
  customerPhone: (0, import_pg_core.text)("customer_phone").notNull(),
  customerAddress: (0, import_pg_core.text)("customer_address"),
  itemId: (0, import_pg_core.text)("item_id"),
  itemName: (0, import_pg_core.text)("item_name").notNull(),
  itemQuantity: (0, import_pg_core.integer)("item_quantity").default(1),
  purchasePrice: (0, import_pg_core.doublePrecision)("purchase_price").default(0),
  listId: (0, import_pg_core.text)("list_id"),
  listName: (0, import_pg_core.text)("list_name"),
  totalPrice: (0, import_pg_core.doublePrecision)("total_price").notNull(),
  advancePayment: (0, import_pg_core.doublePrecision)("advance_payment").default(0),
  remainingBalance: (0, import_pg_core.doublePrecision)("remaining_balance").notNull(),
  dailyInstallment: (0, import_pg_core.doublePrecision)("daily_installment").notNull(),
  startDate: (0, import_pg_core.text)("start_date").notNull(),
  notes: (0, import_pg_core.text)("notes"),
  status: (0, import_pg_core.text)("status").notNull().default("active"),
  lastPaymentDate: (0, import_pg_core.text)("last_payment_date"),
  totalPaid: (0, import_pg_core.doublePrecision)("total_paid").default(0),
  repName: (0, import_pg_core.text)("rep_name"),
  createdAt: (0, import_pg_core.text)("created_at").notNull(),
  completedAt: (0, import_pg_core.text)("completed_at"),
  updatedAt: (0, import_pg_core.text)("updated_at"),
  isEdited: (0, import_pg_core.boolean)("is_edited").default(false)
});
var payments = (0, import_pg_core.pgTable)("payments", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  contractId: (0, import_pg_core.text)("contract_id").notNull(),
  customerName: (0, import_pg_core.text)("customer_name").notNull(),
  amount: (0, import_pg_core.doublePrecision)("amount").default(0),
  amountPaid: (0, import_pg_core.doublePrecision)("amount_paid").default(0),
  paymentDate: (0, import_pg_core.text)("payment_date").notNull(),
  repName: (0, import_pg_core.text)("rep_name"),
  note: (0, import_pg_core.text)("note"),
  fundId: (0, import_pg_core.text)("fund_id"),
  updatedAt: (0, import_pg_core.text)("updated_at"),
  createdAt: (0, import_pg_core.text)("created_at"),
  isEdited: (0, import_pg_core.boolean)("is_edited").default(false)
});
var fundTransactions = (0, import_pg_core.pgTable)("fund_transactions", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  fundId: (0, import_pg_core.text)("fund_id").notNull(),
  targetFundId: (0, import_pg_core.text)("target_fund_id"),
  type: (0, import_pg_core.text)("type").notNull(),
  amount: (0, import_pg_core.doublePrecision)("amount").notNull(),
  note: (0, import_pg_core.text)("note"),
  repName: (0, import_pg_core.text)("rep_name"),
  createdAt: (0, import_pg_core.text)("created_at").notNull()
});
var employees = (0, import_pg_core.pgTable)("employees", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  phone: (0, import_pg_core.text)("phone"),
  jobTitle: (0, import_pg_core.text)("job_title"),
  position: (0, import_pg_core.text)("position"),
  salary: (0, import_pg_core.doublePrecision)("salary").default(0),
  debtBalance: (0, import_pg_core.doublePrecision)("debt_balance").default(0),
  totalDebt: (0, import_pg_core.doublePrecision)("total_debt").default(0),
  isRep: (0, import_pg_core.boolean)("is_rep").default(false),
  repId: (0, import_pg_core.text)("rep_id"),
  createdAt: (0, import_pg_core.text)("created_at")
});
var employeeTransactions = (0, import_pg_core.pgTable)("employee_transactions", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  employeeId: (0, import_pg_core.text)("employee_id").notNull(),
  fundId: (0, import_pg_core.text)("fund_id").notNull(),
  type: (0, import_pg_core.text)("type").notNull(),
  amount: (0, import_pg_core.doublePrecision)("amount").notNull(),
  notes: (0, import_pg_core.text)("notes"),
  repName: (0, import_pg_core.text)("rep_name"),
  createdAt: (0, import_pg_core.text)("created_at").notNull()
});
var reps = (0, import_pg_core.pgTable)("reps", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  name: (0, import_pg_core.text)("name").notNull(),
  phone: (0, import_pg_core.text)("phone").notNull(),
  code: (0, import_pg_core.text)("code").notNull(),
  role: (0, import_pg_core.text)("role").default("rep"),
  canEdit: (0, import_pg_core.boolean)("can_edit").default(true),
  canDelete: (0, import_pg_core.boolean)("can_delete").default(false),
  canMoveCustomer: (0, import_pg_core.boolean)("can_move_customer").default(true),
  canSell: (0, import_pg_core.boolean)("can_sell").default(true),
  allowedListIds: (0, import_pg_core.text)("allowed_list_ids"),
  avatarUrl: (0, import_pg_core.text)("avatar_url")
});
var paymentConflicts = (0, import_pg_core.pgTable)("payment_conflicts", {
  id: (0, import_pg_core.text)("id").primaryKey(),
  contractId: (0, import_pg_core.text)("contract_id"),
  customerName: (0, import_pg_core.text)("customer_name"),
  attemptedAmount: (0, import_pg_core.doublePrecision)("attempted_amount").default(0),
  actualRemainingBalance: (0, import_pg_core.doublePrecision)("actual_remaining_balance").default(0),
  excessAmount: (0, import_pg_core.doublePrecision)("excess_amount").default(0),
  repName: (0, import_pg_core.text)("rep_name"),
  note: (0, import_pg_core.text)("note"),
  paymentDate: (0, import_pg_core.text)("payment_date"),
  createdAt: (0, import_pg_core.text)("created_at"),
  status: (0, import_pg_core.text)("status").default("pending_review"),
  resolvedBy: (0, import_pg_core.text)("resolved_by"),
  resolvedAt: (0, import_pg_core.text)("resolved_at"),
  resolutionNote: (0, import_pg_core.text)("resolution_note"),
  acceptedAmount: (0, import_pg_core.doublePrecision)("accepted_amount").default(0)
});
var systemSettings = (0, import_pg_core.pgTable)("system_settings", {
  key: (0, import_pg_core.text)("key").primaryKey(),
  value: (0, import_pg_core.text)("value").notNull()
});
var deletedRecords = (0, import_pg_core.pgTable)("deleted_records", {
  recordId: (0, import_pg_core.text)("record_id").primaryKey(),
  tableName: (0, import_pg_core.text)("table_name").notNull(),
  deletedAt: (0, import_pg_core.timestamp)("deleted_at").defaultNow()
});
var usersRelations = (0, import_drizzle_orm.relations)(users, ({ many }) => ({
  sales: many(sales)
}));

// src/db/index.ts
import_dotenv.default.config({ override: true });
var createPool = () => {
  if (global._postgresPool) {
    return global._postgresPool;
  }
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("[YOUR-PASSWORD]") || dbUrl.includes("YOUR-PASSWORD")) {
    if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
      dbUrl = `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
    } else {
      dbUrl = "postgresql://app_user:vOY9)hN0)5egF3cL@72.62.158.128:5432/app_database";
    }
  }
  global._postgresPool = new import_pg.Pool({
    connectionString: dbUrl,
    ssl: false,
    max: 10,
    idleTimeoutMillis: 3e4,
    connectionTimeoutMillis: 2e4,
    statement_timeout: 3e4
  });
  global._postgresPool.on("error", (err) => {
    console.error("Unexpected error on Hostinger PostgreSQL pool client:", err?.message || err);
  });
  return global._postgresPool;
};
var pool = createPool();
var db = (0, import_node_postgres.drizzle)(pool, { schema: schema_exports });

// src/db/init.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);

// src/data/initialContracts.ts
var INITIAL_CONTRACTS = [];

// src/db/init.ts
async function initializeDatabaseSchema() {
  if (!process.env.DATABASE_URL && (!process.env.SQL_HOST || !process.env.SQL_DB_NAME)) {
    console.log("PostgreSQL connection details not provided, skipping schema initialization.");
    return;
  }
  try {
    const pool3 = createPool();
    const client = await pool3.connect();
    let hasLock = false;
    try {
      const lockRes = await client.query(`SELECT pg_try_advisory_lock(987654321) as acquired`).catch(() => ({ rows: [] }));
      hasLock = lockRes.rows?.[0]?.acquired === true;
      if (!hasLock) {
        console.log("PostgreSQL schema initialization already in progress or completed by another worker, skipping.");
        return;
      }
      await client.query(`
        -- 1. Drop conflicting views if any exist before creating or altering tables
        DO $$ 
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN 
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('sales', 'customers', 'funds', 'inventory', 'payments', 'reps', 'installment_contracts', 'payment_records', 'sales_representatives')
              AND table_type = 'VIEW'
          LOOP
            EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE';
          END LOOP;
        END $$;

        -- Migrate old contracts table into sales if contracts exists, then drop contracts
        DO $$ 
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contracts' AND table_type = 'BASE TABLE') THEN
            -- Create sales table if not exists first
            CREATE TABLE IF NOT EXISTS sales (
              id TEXT PRIMARY KEY,
              customer_id TEXT,
              customer_name TEXT NOT NULL,
              customer_phone TEXT NOT NULL,
              customer_address TEXT,
              item_id TEXT,
              item_name TEXT NOT NULL,
              item_quantity INTEGER DEFAULT 1,
              purchase_price DOUBLE PRECISION DEFAULT 0,
              list_id TEXT,
              list_name TEXT,
              total_price DOUBLE PRECISION NOT NULL,
              advance_payment DOUBLE PRECISION DEFAULT 0,
              remaining_balance DOUBLE PRECISION NOT NULL,
              daily_installment DOUBLE PRECISION NOT NULL,
              start_date TEXT NOT NULL,
              notes TEXT,
              status TEXT NOT NULL DEFAULT 'active',
              last_payment_date TEXT,
              total_paid DOUBLE PRECISION DEFAULT 0,
              rep_name TEXT,
              created_at TEXT NOT NULL,
              completed_at TEXT,
              updated_at TEXT,
              is_edited BOOLEAN DEFAULT FALSE
            );

            INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, last_payment_date, total_paid, rep_name, created_at, completed_at, updated_at, is_edited)
            SELECT id, customer_name, customer_phone, customer_address, item_id, item_name, COALESCE(item_quantity, 1), COALESCE(purchase_price, 0), list_id, list_name, total_price, COALESCE(advance_payment, 0), remaining_balance, daily_installment, start_date, notes, COALESCE(status, 'active'), last_payment_date, COALESCE(total_paid, 0), rep_name, created_at, completed_at, updated_at, COALESCE(is_edited, false)
            FROM contracts
            ON CONFLICT (id) DO NOTHING;

            DROP TABLE IF EXISTS contracts CASCADE;
          END IF;
        EXCEPTION WHEN others THEN
          NULL;
        END $$;

        -- 2. CREATE CORE UNIFIED TABLES IF NOT EXIST
        CREATE TABLE IF NOT EXISTS inventory_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price DOUBLE PRECISION NOT NULL DEFAULT 0,
          purchase_price DOUBLE PRECISION DEFAULT 0,
          quantity INTEGER NOT NULL DEFAULT 0,
          daily_installment DOUBLE PRECISION DEFAULT 0,
          category TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        INSERT INTO system_settings (key, value)
        VALUES ('welcome_message', '{"title":"\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0646\u0638\u0627\u0645 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0642\u0633\u0627\u0637","subtitle":"\u0627\u062E\u062A\u0631 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0630\u064A \u062A\u0631\u064A\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u064A\u0647:"}')
        ON CONFLICT (key) DO NOTHING;

        CREATE TABLE IF NOT EXISTS deleted_records (
          record_id TEXT PRIMARY KEY,
          table_name TEXT NOT NULL,
          deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customer_lists (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          fund_id TEXT,
          description TEXT,
          color TEXT DEFAULT '#3b82f6',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        DO $$ BEGIN
          ALTER TABLE customer_lists ALTER COLUMN fund_id DROP NOT NULL;
        EXCEPTION WHEN others THEN NULL; END $$;

        CREATE TABLE IF NOT EXISTS cash_funds (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          balance DOUBLE PRECISION NOT NULL DEFAULT 0,
          description TEXT,
          initial_capital DOUBLE PRECISION DEFAULT 0,
          remaining_capital DOUBLE PRECISION DEFAULT 0,
          total_spent DOUBLE PRECISION DEFAULT 0,
          total_collected DOUBLE PRECISION DEFAULT 0,
          notes TEXT,
          rep_names TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- \u062C\u062F\u0648\u0644 \u0627\u0644\u0632\u0628\u0627\u0626\u0646 (customers)
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          address TEXT,
          list_id TEXT,
          list_name TEXT,
          notes TEXT,
          total_purchases DOUBLE PRECISION DEFAULT 0,
          total_paid DOUBLE PRECISION DEFAULT 0,
          remaining_balance DOUBLE PRECISION DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- \u062C\u062F\u0648\u0644 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A (sales)
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          sale_number TEXT,
          customer_id TEXT,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_address TEXT,
          item_id TEXT,
          item_name TEXT NOT NULL,
          item_quantity INTEGER DEFAULT 1,
          purchase_price DOUBLE PRECISION DEFAULT 0,
          list_id TEXT,
          list_name TEXT,
          total_price DOUBLE PRECISION NOT NULL,
          advance_payment DOUBLE PRECISION DEFAULT 0,
          remaining_balance DOUBLE PRECISION NOT NULL,
          daily_installment DOUBLE PRECISION NOT NULL,
          start_date TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          last_payment_date TEXT,
          total_paid DOUBLE PRECISION DEFAULT 0,
          rep_name TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          updated_at TEXT,
          is_edited BOOLEAN DEFAULT FALSE
        );

        -- Create compatibility view contracts -> sales so that any legacy/external calls never fail
        CREATE OR REPLACE VIEW contracts AS 
        SELECT 
          id, customer_id, customer_name, customer_phone, customer_address,
          item_id, item_name, item_quantity, purchase_price,
          list_id, list_name, total_price, advance_payment,
          remaining_balance, daily_installment, start_date, notes,
          status, last_payment_date, total_paid, rep_name,
          created_at, completed_at, updated_at, is_edited
        FROM sales;

        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          contract_id TEXT NOT NULL,
          customer_name TEXT NOT NULL,
          amount DOUBLE PRECISION DEFAULT 0,
          amount_paid DOUBLE PRECISION DEFAULT 0,
          payment_date TEXT NOT NULL,
          rep_name TEXT,
          note TEXT,
          fund_id TEXT,
          updated_at TEXT,
          created_at TEXT,
          is_edited BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE IF NOT EXISTS fund_transactions (
          id TEXT PRIMARY KEY,
          fund_id TEXT NOT NULL,
          target_fund_id TEXT,
          type TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          note TEXT,
          description TEXT,
          rep_name TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS employees (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          job_title TEXT,
          position TEXT,
          salary DOUBLE PRECISION DEFAULT 0,
          debt_balance DOUBLE PRECISION DEFAULT 0,
          total_debt DOUBLE PRECISION DEFAULT 0,
          is_rep BOOLEAN DEFAULT FALSE,
          rep_id TEXT,
          created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS employee_transactions (
          id TEXT PRIMARY KEY,
          employee_id TEXT NOT NULL,
          fund_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          notes TEXT,
          note TEXT,
          date TEXT,
          rep_name TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reps (
          id TEXT PRIMARY KEY,
          name TEXT,
          phone TEXT,
          code TEXT,
          role TEXT DEFAULT 'rep',
          can_edit BOOLEAN DEFAULT TRUE,
          can_delete BOOLEAN DEFAULT FALSE,
          can_move_customer BOOLEAN DEFAULT TRUE,
          can_sell BOOLEAN DEFAULT TRUE,
          allowed_list_ids TEXT,
          avatar_url TEXT
        );

        -- Ensure avatar_url column exists on reps table unconditionally
        ALTER TABLE reps ADD COLUMN IF NOT EXISTS avatar_url TEXT;

        CREATE TABLE IF NOT EXISTS payment_conflicts (
          id TEXT PRIMARY KEY,
          contract_id TEXT,
          customer_name TEXT,
          attempted_amount DOUBLE PRECISION DEFAULT 0,
          actual_remaining_balance DOUBLE PRECISION DEFAULT 0,
          excess_amount DOUBLE PRECISION DEFAULT 0,
          rep_name TEXT,
          note TEXT,
          payment_date TEXT,
          created_at TEXT,
          status TEXT DEFAULT 'pending_review',
          resolved_by TEXT,
          resolved_at TEXT,
          resolution_note TEXT,
          accepted_amount DOUBLE PRECISION DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rep_locations (
          rep_id TEXT PRIMARY KEY,
          rep_name TEXT,
          latitude DOUBLE PRECISION NOT NULL,
          longitude DOUBLE PRECISION NOT NULL,
          accuracy DOUBLE PRECISION,
          speed DOUBLE PRECISION,
          battery INTEGER,
          address TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rep_location_logs (
          id TEXT PRIMARY KEY,
          rep_id TEXT NOT NULL,
          rep_name TEXT,
          latitude DOUBLE PRECISION NOT NULL,
          longitude DOUBLE PRECISION NOT NULL,
          accuracy DOUBLE PRECISION,
          speed DOUBLE PRECISION,
          battery INTEGER,
          created_at TEXT NOT NULL
        );

        -- Ensure Row Level Security is disabled across all tables for direct sync
        ALTER TABLE IF EXISTS sales DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS customers DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS payments DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS inventory_items DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS reps DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS cash_funds DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS customer_lists DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS fund_transactions DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS employees DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS employee_transactions DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS payment_conflicts DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS deleted_records DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS system_settings DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS rep_locations DISABLE ROW LEVEL SECURITY;
        ALTER TABLE IF EXISTS rep_location_logs DISABLE ROW LEVEL SECURITY;

        -- Create High-Performance Indexes for Ultra-Fast Synchronization and Calculations
        CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments (contract_id);
        CREATE INDEX IF NOT EXISTS idx_payments_customer_name ON payments (customer_name);
        CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date);
        CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales (customer_name);
        CREATE INDEX IF NOT EXISTS idx_sales_list_id ON sales (list_id);
        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
        CREATE INDEX IF NOT EXISTS idx_deleted_records_lookup ON deleted_records (record_id, table_name);

        -- 3. MIGRATE & DEDUPLICATE FROM OLD/REDUNDANT TABLES, THEN DROP OLD TABLES

        -- A. sales_representatives -> reps (\u062F\u0645\u062C \u0627\u0644\u0645\u0646\u062F\u0648\u0628\u064A\u0646 \u0648\u0645\u0646\u062F\u0648\u0628\u064A\u0646 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u062D\u0630\u0641 \u0627\u0644\u0632\u0627\u0626\u062F)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales_representatives') THEN
            INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
            SELECT id, name, COALESCE(phone, ''), COALESCE(code, '0000'), COALESCE(role, 'rep'), COALESCE(can_edit, true), COALESCE(can_delete, false), COALESCE(can_move_customer, true), COALESCE(can_sell, true), allowed_list_ids
            FROM sales_representatives
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              phone = EXCLUDED.phone,
              code = EXCLUDED.code,
              role = EXCLUDED.role;
            DROP TABLE sales_representatives CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- B. inventory -> inventory_items (\u0627\u0644\u0645\u062E\u0632\u0646 \u0648\u0627\u0644\u062C\u0631\u062F \u0645\u062A\u0643\u0631\u0631\u0627\u062A - \u062D\u0630\u0641 \u062C\u062F\u0648\u0644 \u0627\u0644\u062C\u0631\u062F \u0627\u0644\u0632\u0627\u0626\u062F)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory') THEN
            INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category, created_at)
            SELECT id, name, price, COALESCE(purchase_price, 0), COALESCE(quantity, 0), COALESCE(daily_installment, 0), category, created_at
            FROM inventory
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              price = EXCLUDED.price,
              quantity = EXCLUDED.quantity;
            DROP TABLE inventory CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- C. payment_records -> payments (\u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0648\u0633\u062C\u0644 \u0627\u0644\u062F\u0641\u0639\u0627\u062A - \u062D\u0630\u0641 \u0633\u062C\u0644 \u0627\u0644\u062F\u0641\u0639\u0627\u062A \u0627\u0644\u0632\u0627\u0626\u062F)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_records') THEN
            INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, rep_name, note, fund_id, created_at, updated_at, is_edited)
            SELECT id, contract_id, customer_name, COALESCE(amount_paid, 0), COALESCE(amount_paid, 0), payment_date, rep_name, note, fund_id, created_at, updated_at, COALESCE(is_edited, false)
            FROM payment_records
            ON CONFLICT (id) DO NOTHING;
            DROP TABLE payment_records CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- D. installment_contracts -> sales (\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0627\u0644\u0623\u0642\u0633\u0627\u0637)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='installment_contracts') THEN
            INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, last_payment_date, total_paid, rep_name, created_at, completed_at, updated_at, is_edited)
            SELECT id, customer_name, customer_phone, customer_address, item_id, item_name, COALESCE(item_quantity, 1), COALESCE(purchase_price, 0), list_id, list_name, total_price, COALESCE(advance_payment, 0), remaining_balance, daily_installment, start_date, notes, COALESCE(status, 'active'), last_payment_date, COALESCE(total_paid, 0), rep_name, created_at, completed_at, updated_at, COALESCE(is_edited, false)
            FROM installment_contracts
            ON CONFLICT (id) DO NOTHING;
            DROP TABLE installment_contracts CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- E. funds -> cash_funds (\u062F\u0645\u062C \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u0641\u064A \u062C\u062F\u0648\u0644 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0648\u062D\u062F \u0648\u062D\u0630\u0641 \u0627\u0644\u062C\u062F\u0648\u0644 \u0627\u0644\u0632\u0627\u0626\u062F)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='funds') THEN
            INSERT INTO cash_funds (id, name, balance, description, created_at)
            SELECT id, name, COALESCE(balance, 0), description, created_at
            FROM funds
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              balance = EXCLUDED.balance,
              description = EXCLUDED.description;
            DROP TABLE funds CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- 4. ENSURE ALL COLUMNS AND CONSTRAINTS ARE CONSISTENT FOR SALES & CUSTOMERS
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_phone TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_address TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS item_id TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS item_name TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS item_quantity INTEGER DEFAULT 1;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS purchase_price DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS list_id TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS list_name TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_price DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS advance_payment DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS remaining_balance DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS daily_installment DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS start_date TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS last_payment_date TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_paid DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS rep_name TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_at TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS completed_at TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS updated_at TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

        ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS list_id TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS list_name TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_purchases DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_paid DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS remaining_balance DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount_paid DOUBLE PRECISION DEFAULT 0;
        ALTER TABLE payments ALTER COLUMN amount_paid DROP NOT NULL;
        ALTER TABLE payments ALTER COLUMN amount DROP NOT NULL;
        ALTER TABLE payments ALTER COLUMN amount_paid SET DEFAULT 0;
        ALTER TABLE payments ALTER COLUMN amount SET DEFAULT 0;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_at TEXT;
        UPDATE payments SET amount = COALESCE(amount, amount_paid, 0) WHERE amount IS NULL OR amount = 0;
        UPDATE payments SET amount_paid = COALESCE(amount_paid, amount, 0) WHERE amount_paid IS NULL OR amount_paid = 0;

        -- 5. FUNCTION AND TRIGGERS ON PAYMENTS & SALES
        CREATE OR REPLACE FUNCTION recalc_contract_balance_on_payment_change()
        RETURNS TRIGGER AS $$
        DECLARE
          v_cid_old TEXT := NULL;
          v_cname_old TEXT := NULL;
          v_cid_new TEXT := NULL;
          v_cname_new TEXT := NULL;
        BEGIN
          IF TG_OP = 'DELETE' THEN
            v_cid_old := OLD.contract_id;
            v_cname_old := OLD.customer_name;
          ELSIF TG_OP = 'UPDATE' THEN
            v_cid_old := OLD.contract_id;
            v_cname_old := OLD.customer_name;
            v_cid_new := NEW.contract_id;
            v_cname_new := NEW.customer_name;
          ELSE
            v_cid_new := NEW.contract_id;
            v_cname_new := NEW.customer_name;
          END IF;

          -- Update sales for all affected sales
          UPDATE sales c
          SET 
            total_paid = CASE
              WHEN EXISTS (SELECT 1 FROM payments p WHERE p.contract_id = c.id OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
              THEN COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE (p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))
              ), 0)
              ELSE COALESCE(c.total_paid, 0)
            END,
            remaining_balance = GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - CASE
              WHEN EXISTS (SELECT 1 FROM payments p WHERE p.contract_id = c.id OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
              THEN COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE (p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))
              ), 0)
              ELSE COALESCE(c.total_paid, 0)
            END),
            last_payment_date = COALESCE(
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE (p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))
              ),
              c.last_payment_date
            ),
            status = CASE 
              WHEN GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - CASE
                WHEN EXISTS (SELECT 1 FROM payments p WHERE p.contract_id = c.id OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                THEN COALESCE((
                  SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                  FROM payments p
                  WHERE (p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))
                ), 0)
                ELSE COALESCE(c.total_paid, 0)
              END) = 0 THEN 'completed'
              ELSE 'active'
            END
          WHERE (v_cid_old IS NOT NULL AND v_cid_old != '' AND c.id = v_cid_old)
             OR ((v_cid_old IS NULL OR v_cid_old = '') AND v_cname_old IS NOT NULL AND (TRIM(LOWER(c.customer_name)) = TRIM(LOWER(v_cname_old)) OR c.customer_name = v_cname_old))
             OR (v_cid_new IS NOT NULL AND v_cid_new != '' AND c.id = v_cid_new)
             OR ((v_cid_new IS NULL OR v_cid_new = '') AND v_cname_new IS NOT NULL AND (TRIM(LOWER(c.customer_name)) = TRIM(LOWER(v_cname_new)) OR c.customer_name = v_cname_new));

          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_payments_change ON payments;
        CREATE TRIGGER trg_payments_change
        AFTER INSERT OR UPDATE OR DELETE ON payments
        FOR EACH ROW EXECUTE FUNCTION recalc_contract_balance_on_payment_change();

        CREATE OR REPLACE FUNCTION recalc_contract_on_contract_change()
        RETURNS TRIGGER AS $$
        DECLARE
          v_paid DOUBLE PRECISION := 0;
          v_last_d TEXT := NULL;
        BEGIN
          SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
          INTO v_paid, v_last_d
          FROM payments
          WHERE (contract_id = NEW.id) OR ((contract_id IS NULL OR contract_id = '') AND customer_name = NEW.customer_name);

          IF v_paid > 0 OR NEW.total_paid IS NULL THEN
            NEW.total_paid := v_paid;
          END IF;

          NEW.remaining_balance := GREATEST(0, (COALESCE(NEW.total_price, 0) - COALESCE(NEW.advance_payment, 0)) - COALESCE(NEW.total_paid, 0));
          
          IF v_last_d IS NOT NULL AND v_last_d != '' THEN
            NEW.last_payment_date := v_last_d;
          END IF;

          IF NEW.remaining_balance <= 0 THEN
            NEW.status := 'completed';
          ELSE
            NEW.status := 'active';
          END IF;

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_sales_recalc ON sales;
        CREATE TRIGGER trg_sales_recalc
        BEFORE INSERT OR UPDATE OF total_price, advance_payment ON sales
        FOR EACH ROW EXECUTE FUNCTION recalc_contract_on_contract_change();
      `);
      console.log("PostgreSQL Database schema initialized & verified (cleaned duplicate tables)!");
      const initCheck = await client.query(`SELECT value FROM system_settings WHERE key = 'schema_init_completed' LIMIT 1`).catch(() => ({ rows: [] }));
      if (initCheck.rows.length === 0) {
        await migrateFileDbToPostgres(client);
        await client.query(`INSERT INTO system_settings (key, value) VALUES ('schema_init_completed', 'true') ON CONFLICT (key) DO NOTHING`).catch(() => {
        });
      }
      await client.query(
        `INSERT INTO customer_lists (id, name, fund_id, description, created_at)
         VALUES ('list-1', '\u0643\u0631\u0628\u0644\u0627\u0621 \u0627\u0644\u0623\u0648\u0644\u0649', 'fund-1', '\u0642\u0627\u0626\u0645\u0629 \u0643\u0631\u0628\u0644\u0627\u0621 \u0627\u0644\u0623\u0648\u0644\u0649 \u0644\u0644\u0632\u0628\u0627\u0626\u0646 \u0648\u0627\u0644\u0639\u0642\u0648\u062F', NOW())
         ON CONFLICT (id) DO UPDATE SET name = '\u0643\u0631\u0628\u0644\u0627\u0621 \u0627\u0644\u0623\u0648\u0644\u0649'`
      ).catch(() => {
      });
      await client.query(
        `DELETE FROM sales WHERE id LIKE 'contract-%' OR id LIKE 'imported-list1-%'`
      ).catch(() => {
      });
      const countRes = await client.query(`SELECT COUNT(*) FROM sales`).catch(() => ({ rows: [{ count: "1" }] }));
      const currentContractCount = parseInt(countRes.rows?.[0]?.count || "0", 10);
      const wasClearedRes = await client.query(`SELECT 1 FROM deleted_records WHERE record_id = '__all_contracts_cleared__' LIMIT 1`).catch(() => ({ rows: [] }));
      const wasExplicitlyCleared = (wasClearedRes.rows?.length || 0) > 0;
      if (currentContractCount === 0 && !wasExplicitlyCleared && INITIAL_CONTRACTS && INITIAL_CONTRACTS.length > 0) {
        for (const c of INITIAL_CONTRACTS) {
          await client.query(
            `INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, total_paid, rep_name, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
             ON CONFLICT (id) DO NOTHING`,
            [
              c.id,
              c.customerName,
              c.customerPhone || "",
              c.customerAddress || "",
              c.itemId || null,
              c.itemName || "",
              c.itemQuantity || 1,
              c.purchasePrice || 0,
              c.listId || "list-1",
              c.listName || "\u0643\u0631\u0628\u0644\u0627\u0621 \u0627\u0644\u0623\u0648\u0644\u0649",
              c.totalPrice || 0,
              c.advancePayment || 0,
              c.remainingBalance || c.totalPrice || 0,
              c.dailyInstallment || 0,
              c.startDate || "",
              c.notes || "",
              c.status || "active",
              c.totalPaid || 0,
              c.repName || "",
              c.createdAt || (/* @__PURE__ */ new Date()).toISOString()
            ]
          ).catch(() => {
          });
        }
        console.log(`[DatabaseInit] Seeded ${INITIAL_CONTRACTS.length} Karbala Al-Oula contracts into empty PostgreSQL.`);
      }
      await client.query(`
        INSERT INTO customers (id, name, phone, address, list_id, list_name, remaining_balance, total_paid, total_purchases, status)
        SELECT 
          COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))) as id,
          c.customer_name as name,
          MAX(c.customer_phone) as phone,
          MAX(c.customer_address) as address,
          MAX(c.list_id) as list_id,
          MAX(c.list_name) as list_name,
          SUM(COALESCE(c.remaining_balance, 0)) as remaining_balance,
          SUM(COALESCE(c.total_paid, 0)) as total_paid,
          SUM(COALESCE(c.total_price, 0)) as total_purchases,
          'active' as status
        FROM sales c
        WHERE c.customer_name IS NOT NULL AND TRIM(c.customer_name) != ''
        GROUP BY COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))), c.customer_name
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = COALESCE(EXCLUDED.phone, customers.phone),
          address = COALESCE(EXCLUDED.address, customers.address),
          list_id = COALESCE(EXCLUDED.list_id, customers.list_id),
          list_name = COALESCE(EXCLUDED.list_name, customers.list_name),
          remaining_balance = EXCLUDED.remaining_balance,
          total_paid = EXCLUDED.total_paid,
          total_purchases = EXCLUDED.total_purchases;
      `).catch(() => {
      });
    } finally {
      if (hasLock) {
        await client.query(`SELECT pg_advisory_unlock(987654321)`).catch(() => {
        });
      }
      client.release();
    }
  } catch (err) {
    console.warn("PostgreSQL Schema Initialization warning:", err);
  }
}
async function migrateFileDbToPostgres(client) {
  const dataDir = import_path2.default.join(process.cwd(), "data");
  if (!import_fs2.default.existsSync(dataDir)) return;
  const readJson = (filename) => {
    try {
      const p = import_path2.default.join(dataDir, filename);
      if (import_fs2.default.existsSync(p)) {
        return JSON.parse(import_fs2.default.readFileSync(p, "utf-8")) || [];
      }
    } catch (e) {
    }
    return [];
  };
  const customerLists2 = readJson("customer_lists.json");
  for (const l of customerLists2) {
    if (!l.id) continue;
    await client.query(
      `INSERT INTO customer_lists (id, name, fund_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fund_id = EXCLUDED.fund_id`,
      [l.id, l.name || "", l.fundId || null, l.description || "", l.createdAt || (/* @__PURE__ */ new Date()).toISOString()]
    );
  }
  const inventoryItems2 = readJson("inventory_items.json");
  for (const item of inventoryItems2) {
    if (!item.id) continue;
    const vals = [
      item.id,
      item.name || "",
      Number(item.price ?? item.sellingPrice) || 0,
      Number(item.purchasePrice) || 0,
      Number(item.quantity) || 0,
      Number(item.dailyInstallment) || 0,
      item.category || ""
    ];
    await client.query(
      `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, quantity=EXCLUDED.quantity`,
      vals
    );
  }
  const cashFunds2 = readJson("cash_funds.json");
  for (const f of cashFunds2) {
    if (!f.id) continue;
    const vals = [f.id, f.name || "", Number(f.balance) || 0, f.description || ""];
    await client.query(
      `INSERT INTO cash_funds (id, name, balance, description) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, name = EXCLUDED.name`,
      vals
    );
  }
  const reps2 = readJson("reps.json");
  for (const r of reps2) {
    if (!r.id) continue;
    const allowed = Array.isArray(r.allowedListIds) ? JSON.stringify(r.allowedListIds) : JSON.stringify(["all"]);
    const vals = [r.id, r.name || "", r.phone || "", r.code || "", r.role || "rep", r.canEdit !== false, Boolean(r.canDelete), r.canMoveCustomer !== false, r.canSell !== false, allowed];
    await client.query(
      `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, code = EXCLUDED.code`,
      vals
    );
  }
  console.log("Migrated all local FileDB records into PostgreSQL successfully.");
}

// src/db/dbExecutor.ts
var pool2 = createPool();
var isPgConfigured = () => {
  return true;
};
var AsyncSemaphore = class {
  constructor(max) {
    this.tasks = [];
    this.count = 0;
    this.max = max;
  }
  async acquire() {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    await new Promise((resolve) => this.tasks.push(resolve));
    this.count++;
  }
  release() {
    this.count--;
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) next();
    }
  }
};
var pgSemaphore = new AsyncSemaphore(5);
async function executePg(sql, params = []) {
  await pgSemaphore.acquire();
  try {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const currentPool = createPool();
        const res = await currentPool.query(sql, params);
        return res.rows || [];
      } catch (e) {
        attempts++;
        const errStr = (e?.message || "").toLowerCase();
        const isConnError = errStr.includes("econnreset") || errStr.includes("etimedout") || errStr.includes("timeout") || errStr.includes("terminated") || errStr.includes("closed") || errStr.includes("connection");
        const isMaxConn = errStr.includes("emaxconnsession") || errStr.includes("too many clients") || errStr.includes("connection limit");
        if ((isConnError || isMaxConn) && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempts * 800 + Math.random() * 400));
          continue;
        }
        if (e.message && e.message.includes("does not exist")) {
          try {
            if (e.message.includes("avatar_url") && e.message.includes("reps")) {
              const currentPool2 = createPool();
              await currentPool2.query("ALTER TABLE reps ADD COLUMN IF NOT EXISTS avatar_url TEXT;").catch(() => {
              });
              const resRetry = await currentPool2.query(sql, params);
              return resRetry.rows || [];
            }
            await initializeDatabaseSchema();
            const currentPool = createPool();
            const res2 = await currentPool.query(sql, params);
            return res2.rows || [];
          } catch (innerErr) {
          }
        }
        if (attempts >= maxAttempts) {
          console.error("PostgreSQL query error after retries:", e.message, "SQL:", sql);
          throw e;
        }
      }
    }
    return [];
  } finally {
    pgSemaphore.release();
  }
}

// src/lib/nameHelpers.ts
var normalizeEntityName = (name) => {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ").toLowerCase();
};

// src/db/cleanupDuplicates.ts
async function cleanupDuplicateEntities() {
  console.log("[Deduplication] Starting cleanup for reps, employees, funds, and customer lists...");
  try {
    let allReps = fileDb.get("reps") || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg("SELECT * FROM reps");
        if (pgRows && pgRows.length > 0) {
          allReps = pgRows;
        }
      } catch (err) {
        console.warn("[Deduplication] Could not fetch reps from PG:", err);
      }
    }
    const repGroups = /* @__PURE__ */ new Map();
    for (const r of allReps) {
      const key = normalizeEntityName(r.name);
      if (!key) continue;
      if (!repGroups.has(key)) repGroups.set(key, []);
      repGroups.get(key).push(r);
    }
    for (const [key, reps2] of repGroups) {
      if (reps2.length > 1) {
        console.log(`[Deduplication] Found ${reps2.length} duplicate reps for "${key}"`);
        reps2.sort((a, b) => {
          if (a.role === "admin" && b.role !== "admin") return -1;
          if (b.role === "admin" && a.role !== "admin") return 1;
          if (a.role === "supervisor" && b.role !== "supervisor") return -1;
          if (b.role === "supervisor" && a.role !== "supervisor") return 1;
          return (a.id || "").localeCompare(b.id || "");
        });
        const primary = reps2[0];
        const duplicates = reps2.slice(1);
        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate rep ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg("UPDATE employees SET rep_id = $1 WHERE rep_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("DELETE FROM reps WHERE id = $1", [dup.id]).catch(() => {
            });
            await executePg("INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING", [dup.id, "reps"]).catch(() => {
            });
          }
          fileDb.delete("reps", dup.id);
        }
      }
    }
  } catch (err) {
    console.error("[Deduplication] Error cleaning reps:", err);
  }
  try {
    let allEmps = fileDb.get("employees") || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg("SELECT * FROM employees");
        if (pgRows && pgRows.length > 0) {
          allEmps = pgRows;
        }
      } catch (err) {
        console.warn("[Deduplication] Could not fetch employees from PG:", err);
      }
    }
    const empGroups = /* @__PURE__ */ new Map();
    for (const e of allEmps) {
      const key = normalizeEntityName(e.name);
      if (!key) continue;
      if (!empGroups.has(key)) empGroups.set(key, []);
      empGroups.get(key).push(e);
    }
    for (const [key, emps] of empGroups) {
      if (emps.length > 1) {
        console.log(`[Deduplication] Found ${emps.length} duplicate employees for "${key}"`);
        emps.sort((a, b) => {
          if (a.repId && !b.repId) return -1;
          if (b.repId && !a.repId) return 1;
          return Number(b.salary || 0) + Number(b.totalDebt || 0) - (Number(a.salary || 0) + Number(a.totalDebt || 0));
        });
        const primary = emps[0];
        const duplicates = emps.slice(1);
        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate employee ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg("UPDATE employee_transactions SET employee_id = $1 WHERE employee_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("DELETE FROM employees WHERE id = $1", [dup.id]).catch(() => {
            });
            await executePg("INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING", [dup.id, "employees"]).catch(() => {
            });
          }
          fileDb.delete("employees", dup.id);
        }
      }
    }
  } catch (err) {
    console.error("[Deduplication] Error cleaning employees:", err);
  }
  try {
    let allFunds = fileDb.get("cash_funds") || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg("SELECT * FROM cash_funds");
        if (pgRows && pgRows.length > 0) {
          allFunds = pgRows;
        }
      } catch (err) {
        console.warn("[Deduplication] Could not fetch funds from PG:", err);
      }
    }
    const fundGroups = /* @__PURE__ */ new Map();
    for (const f of allFunds) {
      const key = normalizeEntityName(f.name);
      if (!key) continue;
      if (!fundGroups.has(key)) fundGroups.set(key, []);
      fundGroups.get(key).push(f);
    }
    for (const [key, funds] of fundGroups) {
      if (funds.length > 1) {
        console.log(`[Deduplication] Found ${funds.length} duplicate funds for "${key}"`);
        funds.sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));
        const primary = funds[0];
        const duplicates = funds.slice(1);
        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate fund ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg("UPDATE contracts SET fund_id = $1 WHERE fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE payments SET fund_id = $1 WHERE fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE sales SET fund_id = $1 WHERE fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE customer_lists SET fund_id = $1 WHERE fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE fund_transactions SET fund_id = $1 WHERE fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE fund_transactions SET target_fund_id = $1 WHERE target_fund_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("DELETE FROM cash_funds WHERE id = $1", [dup.id]).catch(() => {
            });
            await executePg("DELETE FROM funds WHERE id = $1", [dup.id]).catch(() => {
            });
            await executePg("INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING", [dup.id, "funds"]).catch(() => {
            });
            await executePg("INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING", [dup.id, "cash_funds"]).catch(() => {
            });
          }
          fileDb.delete("cash_funds", dup.id);
          fileDb.delete("funds", dup.id);
        }
      }
    }
  } catch (err) {
    console.error("[Deduplication] Error cleaning funds:", err);
  }
  try {
    let allLists = fileDb.get("customer_lists") || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg("SELECT * FROM customer_lists");
        if (pgRows && pgRows.length > 0) {
          allLists = pgRows;
        }
      } catch (err) {
        console.warn("[Deduplication] Could not fetch customer lists from PG:", err);
      }
    }
    const listGroups = /* @__PURE__ */ new Map();
    for (const l of allLists) {
      const key = normalizeEntityName(l.name);
      if (!key) continue;
      if (!listGroups.has(key)) listGroups.set(key, []);
      listGroups.get(key).push(l);
    }
    for (const [key, lists] of listGroups) {
      if (lists.length > 1) {
        console.log(`[Deduplication] Found ${lists.length} duplicate customer lists for "${key}"`);
        lists.sort((a, b) => {
          if (a.fund_id && !b.fund_id) return -1;
          if (b.fund_id && !a.fund_id) return 1;
          return (a.id || "").localeCompare(b.id || "");
        });
        const primary = lists[0];
        const duplicates = lists.slice(1);
        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate customer list ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg("UPDATE contracts SET list_id = $1 WHERE list_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("UPDATE sales SET list_id = $1 WHERE list_id = $2", [primary.id, dup.id]).catch(() => {
            });
            await executePg("DELETE FROM customer_lists WHERE id = $1", [dup.id]).catch(() => {
            });
            await executePg("INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING", [dup.id, "customer_lists"]).catch(() => {
            });
          }
          fileDb.delete("customer_lists", dup.id);
        }
      }
    }
  } catch (err) {
    console.error("[Deduplication] Error cleaning customer lists:", err);
  }
  console.log("[Deduplication] Deduplication cleanup finished successfully.");
}

// server.ts
import_dotenv2.default.config({ override: true });
var globalSyncVersion = Date.now();
function bumpSyncVersion() {
  globalSyncVersion = Date.now();
  try {
    if (isPgConfigured()) {
      executePg(
        `INSERT INTO system_settings (key, value) VALUES ('sync_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(globalSyncVersion)]
      ).catch(() => {
      });
    }
  } catch (e) {
  }
}
function mapContractRow(r) {
  const totalPrice = Number(r.total_price ?? r.totalPrice) || 0;
  const advancePayment = Number(r.advance_payment ?? r.advancePayment) || 0;
  const actualPaid = Number(r.actual_total_paid);
  const storedPaid = Number(r.total_paid ?? r.totalPaid) || 0;
  const rawTotalPaid = r.actual_total_paid !== void 0 && r.actual_total_paid !== null && !isNaN(actualPaid) ? actualPaid : storedPaid;
  const netFinanced = Math.max(0, totalPrice - advancePayment);
  const totalPaid = netFinanced > 0 ? Math.min(netFinanced, rawTotalPaid) : rawTotalPaid;
  const excessAmount = Math.max(0, rawTotalPaid - netFinanced);
  const remainingBalance = Math.max(0, netFinanced - rawTotalPaid);
  const status = remainingBalance === 0 && (netFinanced === 0 || rawTotalPaid > 0) ? "completed" : "active";
  const lastPaymentDate = r.actual_last_payment_date !== void 0 ? r.actual_last_payment_date : r.last_payment_date ?? r.lastPaymentDate ?? null;
  return {
    id: r.id,
    customerName: r.customer_name ?? r.customerName ?? "",
    customerPhone: r.customer_phone ?? r.customerPhone ?? "",
    customerAddress: r.customer_address ?? r.customerAddress ?? "",
    itemId: r.item_id ?? r.itemId ?? null,
    itemName: r.item_name ?? r.itemName ?? "",
    itemQuantity: Number(r.item_quantity ?? r.itemQuantity) || 1,
    purchasePrice: Number(r.purchase_price ?? r.purchasePrice) || 0,
    listId: r.list_id ?? r.listId ?? null,
    listName: r.list_name ?? r.listName ?? null,
    totalPrice,
    advancePayment,
    remainingBalance,
    dailyInstallment: Number(r.daily_installment ?? r.dailyInstallment) || 0,
    startDate: r.start_date ?? r.startDate ?? "",
    notes: r.notes ?? "",
    status,
    lastPaymentDate,
    totalPaid,
    excessAmount,
    rawTotalPaid,
    repName: r.rep_name ?? r.repName ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    completedAt: r.completed_at ?? r.completedAt ?? null,
    updatedAt: r.updated_at ?? r.updatedAt ?? null,
    isEdited: Boolean(r.is_edited ?? r.isEdited)
  };
}
function mapInventoryRow(r) {
  return {
    id: r.id,
    name: r.name ?? "",
    price: Number(r.price) || 0,
    purchasePrice: Number(r.purchase_price ?? r.purchasePrice) || 0,
    quantity: Number(r.quantity) || 0,
    dailyInstallment: Number(r.daily_installment ?? r.dailyInstallment) || 0,
    category: r.category ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapPaymentRow(r) {
  const amt = Number(r.amountPaid ?? r.amount_paid ?? r.amount) || 0;
  return {
    id: r.id,
    contractId: r.contract_id ?? r.contractId ?? "",
    customerName: r.customer_name ?? r.customerName ?? "",
    amountPaid: amt,
    paymentDate: r.payment_date ?? r.paymentDate ?? "",
    repName: r.rep_name ?? r.repName ?? "",
    note: r.note ?? "",
    fundId: r.fund_id ?? r.fundId ?? null,
    updatedAt: r.updated_at ?? r.updatedAt ?? null,
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    isEdited: Boolean(r.is_edited ?? r.isEdited)
  };
}
function mapRepRow(r) {
  let allowed = r.allowed_list_ids ?? r.allowedListIds;
  if (typeof allowed === "string") {
    try {
      allowed = JSON.parse(allowed);
    } catch (e) {
      allowed = ["all"];
    }
  }
  if (!Array.isArray(allowed)) allowed = ["all"];
  const isDhia = Boolean(r.name && (r.name.includes("\u0636\u064A\u0627\u0621") || r.id === "rep-1"));
  return {
    id: r.id,
    name: r.name ?? "",
    phone: r.phone ?? "",
    code: r.code ?? "",
    role: isDhia ? "admin" : r.role ?? "rep",
    canEdit: isDhia ? true : r.can_edit !== false && r.canEdit !== false,
    canDelete: isDhia ? true : Boolean(r.can_delete ?? r.canDelete),
    canMoveCustomer: isDhia ? true : r.can_move_customer !== false && r.canMoveCustomer !== false,
    canSell: isDhia ? true : r.can_sell !== false && r.canSell !== false,
    allowedListIds: isDhia ? ["all"] : allowed,
    avatarUrl: r.avatar_url ?? r.avatarUrl ?? ""
  };
}
async function adjustFundBalance(fundId, delta) {
  if (!fundId || delta === 0) return;
  try {
    for (const key of ["cash_funds", "funds"]) {
      const funds = fileDb.get(key) || [];
      const fund = funds.find((f) => f.id === fundId);
      if (fund) {
        const newBal = Math.max(0, (Number(fund.balance) || 0) + delta);
        fileDb.update(key, fundId, { ...fund, balance: newBal });
      }
    }
    await executePg(`UPDATE cash_funds SET balance = GREATEST(0, COALESCE(balance, 0) + $1) WHERE id = $2`, [delta, fundId]).catch(() => {
    });
    await executePg(`UPDATE funds SET balance = GREATEST(0, COALESCE(balance, 0) + $1) WHERE id = $2`, [delta, fundId]).catch(() => {
    });
  } catch (err) {
    console.warn("adjustFundBalance error:", fundId, delta, err);
  }
}
async function resolveFundIdForPayment(fundId, contractId, customerName) {
  try {
    const lists = fileDb.get("customer_lists") || [];
    const funds = fileDb.get("cash_funds") || fileDb.get("funds") || [];
    if (fundId) {
      if (funds.some((f) => f.id === fundId)) return fundId;
      const listMatch = lists.find((l) => l.id === fundId || l.name && normalizeEntityName(l.name) === normalizeEntityName(fundId));
      if (listMatch?.fundId || listMatch?.fund_id) {
        return listMatch.fundId || listMatch.fund_id;
      }
      if (isPgConfigured()) {
        const pgFund = await executePg("SELECT id FROM cash_funds WHERE id = $1 LIMIT 1", [fundId]).catch(() => []);
        if (pgFund && pgFund.length > 0) return pgFund[0].id;
        const pgList = await executePg("SELECT fund_id FROM customer_lists WHERE id = $1 OR name = $1 LIMIT 1", [fundId]).catch(() => []);
        if (pgList && pgList.length > 0 && pgList[0].fund_id) return pgList[0].fund_id;
      }
    }
    if (contractId) {
      const contracts = fileDb.get("contracts") || [];
      const contract = contracts.find((c) => c.id === contractId);
      const listId = contract?.listId || contract?.list_id;
      if (listId) {
        const l = lists.find((item) => item.id === listId || item.name && normalizeEntityName(item.name) === normalizeEntityName(listId));
        if (l?.fundId || l?.fund_id) return l.fundId || l.fund_id;
      }
      if (isPgConfigured()) {
        const rows = await executePg(`
          SELECT cl.fund_id 
          FROM sales s 
          JOIN customer_lists cl ON (s.list_id = cl.id OR s.list_name = cl.name) 
          WHERE s.id = $1 
          LIMIT 1
        `, [contractId]).catch(() => []);
        if (rows && rows.length > 0 && rows[0].fund_id) {
          return rows[0].fund_id;
        }
      }
    }
    if (customerName) {
      const contracts = fileDb.get("contracts") || [];
      const contract = contracts.find((c) => c.customerName && normalizeEntityName(c.customerName) === normalizeEntityName(customerName));
      const listId = contract?.listId || contract?.list_id;
      if (listId) {
        const l = lists.find((item) => item.id === listId || item.name && normalizeEntityName(item.name) === normalizeEntityName(listId));
        if (l?.fundId || l?.fund_id) return l.fundId || l.fund_id;
      }
      if (isPgConfigured()) {
        const rows = await executePg(`
          SELECT cl.fund_id 
          FROM sales s 
          JOIN customer_lists cl ON (s.list_id = cl.id OR s.list_name = cl.name) 
          WHERE LOWER(TRIM(REGEXP_REPLACE(s.customer_name, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE($1, '\\s+', ' ', 'g')))
          LIMIT 1
        `, [customerName]).catch(() => []);
        if (rows && rows.length > 0 && rows[0].fund_id) {
          return rows[0].fund_id;
        }
      }
    }
  } catch (err) {
    console.warn("resolveFundIdForPayment error:", err);
  }
  return null;
}
async function recordPaymentFundAdjustment(paymentId, fundId, amount, customerName, repName, paymentDate, isReversal = false) {
  if (!fundId || amount === 0) return;
  const ftId = `ft_pay_${paymentId}`;
  let existingFt = (fileDb.get("fund_transactions") || []).find((f) => f.id === ftId);
  if (!existingFt && isPgConfigured()) {
    const rows = await executePg("SELECT * FROM fund_transactions WHERE id = $1 LIMIT 1", [ftId]).catch(() => []);
    if (rows && rows.length > 0) {
      existingFt = {
        id: rows[0].id,
        fundId: rows[0].fund_id ?? rows[0].fundId,
        amount: Number(rows[0].amount) || 0,
        type: rows[0].type,
        note: rows[0].note,
        repName: rows[0].rep_name ?? rows[0].repName,
        createdAt: rows[0].created_at ?? rows[0].createdAt
      };
    }
  }
  if (isReversal) {
    const recordedAmt = existingFt ? Number(existingFt.amount) || amount : amount;
    const targetFundId = existingFt?.fundId || fundId;
    if (targetFundId && recordedAmt > 0) {
      await adjustFundBalance(targetFundId, -recordedAmt);
    }
    await executePg("DELETE FROM fund_transactions WHERE id = $1", [ftId]).catch(() => {
    });
    fileDb.delete("fund_transactions", ftId);
  } else {
    if (existingFt) {
      const oldAmt = Number(existingFt.amount) || 0;
      const oldFundId = existingFt.fundId || fundId;
      if (oldFundId !== fundId) {
        await adjustFundBalance(oldFundId, -oldAmt);
        await adjustFundBalance(fundId, +amount);
      } else {
        const diff = amount - oldAmt;
        if (diff !== 0) {
          await adjustFundBalance(fundId, diff);
        }
      }
      const note = `\u062A\u0633\u062F\u064A\u062F \u0642\u0633\u0637 \u0632\u0628\u0648\u0646: ${customerName || ""}`;
      const createdAt = paymentDate ? new Date(paymentDate).toISOString() : existingFt.createdAt || (/* @__PURE__ */ new Date()).toISOString();
      await executePg(`
        UPDATE fund_transactions SET fund_id = $1, amount = $2, note = $3, rep_name = $4
        WHERE id = $5
      `, [fundId, amount, note, repName || "", ftId]).catch(() => {
      });
      fileDb.update("fund_transactions", ftId, {
        id: ftId,
        fundId,
        type: "installment",
        amount,
        note,
        repName: repName || "",
        createdAt
      });
    } else {
      await adjustFundBalance(fundId, +amount);
      const note = `\u062A\u0633\u062F\u064A\u062F \u0642\u0633\u0637 \u0632\u0628\u0648\u0646: ${customerName || ""}`;
      const createdAt = paymentDate ? new Date(paymentDate).toISOString() : (/* @__PURE__ */ new Date()).toISOString();
      await executePg(`
        INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
        VALUES ($1, $2, 'installment', $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET fund_id = EXCLUDED.fund_id, amount = EXCLUDED.amount, note = EXCLUDED.note, rep_name = EXCLUDED.rep_name
      `, [ftId, fundId, amount, note, repName || "", createdAt]).catch(() => {
      });
      fileDb.upsert("fund_transactions", {
        id: ftId,
        fundId,
        type: "installment",
        amount,
        note,
        repName: repName || "",
        createdAt
      });
    }
  }
}
function mapFundRow(r) {
  return {
    id: r.id,
    name: r.name ?? "",
    balance: Number(r.balance) || 0,
    description: r.description ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapCustomerListRow(r) {
  return {
    id: r.id,
    name: r.name ?? "",
    fundId: r.fund_id ?? r.fundId ?? "",
    description: r.description ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapFundTxRow(r) {
  return {
    id: r.id,
    fundId: r.fund_id ?? r.fundId ?? "",
    targetFundId: r.target_fund_id ?? r.targetFundId ?? null,
    type: r.type ?? "deposit",
    amount: Number(r.amount) || 0,
    note: r.note ?? "",
    repName: r.rep_name ?? r.repName ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapEmployeeRow(r) {
  return {
    id: r.id,
    name: r.name ?? "",
    phone: r.phone ?? "",
    jobTitle: r.job_title ?? r.jobTitle ?? "",
    position: r.position ?? "",
    salary: Number(r.salary) || 0,
    debtBalance: Number(r.debt_balance ?? r.debtBalance) || 0,
    totalDebt: Number(r.total_debt ?? r.totalDebt) || 0,
    isRep: Boolean(r.is_rep ?? r.isRep),
    repId: r.rep_id ?? r.repId ?? null,
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapEmpTxRow(r) {
  return {
    id: r.id,
    employeeId: r.employee_id ?? r.employeeId ?? "",
    fundId: r.fund_id ?? r.fundId ?? "",
    type: r.type ?? "debt",
    amount: Number(r.amount) || 0,
    notes: r.notes ?? "",
    repName: r.rep_name ?? r.repName ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function mapConflictRow(r) {
  return {
    id: r.id,
    contractId: r.contract_id ?? r.contractId ?? "",
    customerName: r.customer_name ?? r.customerName ?? "",
    attemptedAmount: Number(r.attempted_amount ?? r.attemptedAmount) || 0,
    actualRemainingBalance: Number(r.actual_remaining_balance ?? r.actualRemainingBalance) || 0,
    excessAmount: Number(r.excess_amount ?? r.excessAmount) || 0,
    repName: r.rep_name ?? r.repName ?? "",
    note: r.note ?? "",
    paymentDate: r.payment_date ?? r.paymentDate ?? "",
    createdAt: r.created_at ?? r.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    status: r.status ?? "pending_review"
  };
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  initializeDatabaseSchema().then(async () => {
    if (isPgConfigured()) {
      await executePg(`
          CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments (contract_id);
          CREATE INDEX IF NOT EXISTS idx_payments_customer_name ON payments (customer_name);
          CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date);
          CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales (customer_name);
          CREATE INDEX IF NOT EXISTS idx_sales_list_id ON sales (list_id);
          CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
          CREATE INDEX IF NOT EXISTS idx_deleted_records_lookup ON deleted_records (record_id, table_name);
          ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `).catch(() => {
      });
    }
    await cleanupDuplicateEntities().catch((e) => console.warn("Deduplication cleanup notice:", e));
    return;
  }).catch((err) => console.warn("Background DB initialization notice:", err));
  console.log("SERVER DB CONFIG:", isPgConfigured() ? "PostgreSQL + FileDB" : "Local FileDB Engine");
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Range");
    res.header("Access-Control-Expose-Headers", "Content-Length, Content-Range");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
  app.use(import_express.default.text({ type: ["text/*", "text/plain", "application/json"], limit: "50mb" }));
  app.use((req, res, next) => {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      try {
        const rawStr = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
        if (rawStr && (rawStr.trim().startsWith("{") || rawStr.trim().startsWith("["))) {
          req.body = JSON.parse(rawStr);
        }
      } catch (e) {
      }
    }
    next();
  });
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/customer_lists") || req.url.startsWith("/api/lists")) {
      req.url = req.url.replace(/^\/api\/(customer_lists|lists)/, "/api/customer-lists");
    } else if (req.url.startsWith("/api/representatives")) {
      req.url = req.url.replace(/^\/api\/representatives/, "/api/reps");
    } else if (req.url.startsWith("/api/fund_transactions")) {
      req.url = req.url.replace("/api/fund_transactions", "/api/fund-transactions");
    } else if (req.url.startsWith("/api/employee_transactions")) {
      req.url = req.url.replace("/api/employee_transactions", "/api/employee-transactions");
    } else if (req.url.startsWith("/api/payment_conflicts")) {
      req.url = req.url.replace("/api/payment_conflicts", "/api/payment-conflicts");
    }
    next();
  });
  app.get("/api/health", async (req, res) => {
    let deletedCount = 0;
    try {
      if (isPgConfigured()) {
        const dRes = await executePg("SELECT COUNT(*) as count FROM deleted_records").catch(() => []);
        if (dRes && dRes[0]?.count) deletedCount = Number(dRes[0].count);
      }
    } catch (e) {
    }
    res.json({
      status: "ok",
      database: isPgConfigured() ? "postgresql" : "filedb",
      persistent: true,
      syncVersion: globalSyncVersion,
      deletedCount,
      timestamp: Date.now()
    });
  });
  app.get("/api/settings/welcome", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT value FROM system_settings WHERE key = 'welcome_message'");
          if (rows.length > 0 && rows[0].value) {
            try {
              return res.json(JSON.parse(rows[0].value));
            } catch (e) {
            }
          }
        } catch (pgErr) {
          try {
            await executePg("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
            const rows = await executePg("SELECT value FROM system_settings WHERE key = 'welcome_message'");
            if (rows.length > 0 && rows[0].value) {
              return res.json(JSON.parse(rows[0].value));
            }
          } catch (e2) {
          }
        }
      }
      const items = fileDb.get("system_settings");
      const val = items.find((i) => i.id === "welcome_message") || items[0];
      if (val && val.value) {
        try {
          return res.json(typeof val.value === "string" ? JSON.parse(val.value) : val.value);
        } catch (e) {
        }
      }
      res.json({ title: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0646\u0638\u0627\u0645 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0642\u0633\u0627\u0637", subtitle: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0630\u064A \u062A\u0631\u064A\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u064A\u0647:" });
    } catch (err) {
      res.json({ title: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0646\u0638\u0627\u0645 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0642\u0633\u0627\u0637", subtitle: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0630\u064A \u062A\u0631\u064A\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u064A\u0647:" });
    }
  });
  app.post("/api/settings/welcome", async (req, res) => {
    try {
      const { title, subtitle } = req.body;
      const data = {
        title: title || "\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0646\u0638\u0627\u0645 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0642\u0633\u0627\u0637",
        subtitle: subtitle || "\u0627\u062E\u062A\u0631 \u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0630\u064A \u062A\u0631\u064A\u062F \u0627\u0644\u062F\u062E\u0648\u0644 \u0625\u0644\u064A\u0647:"
      };
      const jsonStr = JSON.stringify(data);
      fileDb.upsert("system_settings", { id: "welcome_message", key: "welcome_message", value: jsonStr });
      if (isPgConfigured()) {
        try {
          await executePg(
            `INSERT INTO system_settings (key, value) VALUES ('welcome_message', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [jsonStr]
          );
        } catch (pgErr) {
          await executePg("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
          await executePg(
            `INSERT INTO system_settings (key, value) VALUES ('welcome_message', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [jsonStr]
          );
        }
      }
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/seed", async (req, res) => {
    try {
      res.json({ success: true, message: "Database ready" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/inventory", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM inventory_items ORDER BY name ASC");
          const items = (rows || []).map(mapInventoryRow);
          fileDb.setAll("inventory_items", items);
          return res.json(items);
        } catch (pgErr) {
          console.warn("Postgres fetch inventory error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("inventory_items"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/inventory", async (req, res) => {
    try {
      const item = req.body;
      const id = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("inventory_items", {
        id,
        name: item.name && item.name.trim() ? item.name : "\u0645\u0627\u062F\u0629",
        price: Number(item.price ?? item.sellingPrice ?? item.unitPrice) || 0,
        purchasePrice: Number(item.purchasePrice ?? item.costPrice) || 0,
        quantity: Number(item.quantity) || 0,
        dailyInstallment: Number(item.dailyInstallment) || 0,
        category: item.category || "",
        createdAt: item.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      });
      const query1 = `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, purchase_price=EXCLUDED.purchase_price, quantity=EXCLUDED.quantity, daily_installment=EXCLUDED.daily_installment, category=EXCLUDED.category`;
      const vals = [id, saved.name, saved.price, saved.purchasePrice, saved.quantity, saved.dailyInstallment, saved.category];
      await executePg(query1, vals);
      bumpSyncVersion();
      res.json({ success: true, item: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      fileDb.update("inventory_items", id, updates);
      const fieldMap = {
        name: "name",
        price: "price",
        sellingPrice: "price",
        purchasePrice: "purchase_price",
        costPrice: "purchase_price",
        purchase_price: "purchase_price",
        quantity: "quantity",
        dailyInstallment: "daily_installment",
        daily_installment: "daily_installment",
        category: "category"
      };
      const setClauses = [];
      const values = [];
      let idx = 1;
      const addedCols = /* @__PURE__ */ new Set();
      for (const [k, v] of Object.entries(updates)) {
        if (k === "id") continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }
      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE inventory_items SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
      }
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      console.error(`[PUT /api/inventory/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("inventory_items", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'inventory_items') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM inventory_items WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  const syncCustomersTableInPg = async () => {
    if (!isPgConfigured()) return;
    try {
      await executePg(`
        INSERT INTO customers (id, name, phone, address, list_id, list_name, notes, total_purchases, total_paid, remaining_balance, status)
        SELECT 
          COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))) as id,
          TRIM(c.customer_name) as name,
          MAX(c.customer_phone) as phone,
          MAX(c.customer_address) as address,
          MAX(c.list_id) as list_id,
          MAX(c.list_name) as list_name,
          MAX(c.notes) as notes,
          COALESCE(SUM(c.total_price), 0) as total_purchases,
          COALESCE(SUM(c.total_paid), 0) as total_paid,
          COALESCE(SUM(c.remaining_balance), 0) as remaining_balance,
          'active' as status
        FROM sales c
        WHERE c.customer_name IS NOT NULL AND TRIM(c.customer_name) != ''
          AND NOT EXISTS (
            SELECT 1 FROM deleted_records dr 
            WHERE (dr.record_id = c.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts'))
               OR (dr.record_id = COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))) AND dr.table_name = 'customers')
          )
        GROUP BY COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))), TRIM(c.customer_name)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = COALESCE(EXCLUDED.phone, customers.phone),
          address = COALESCE(EXCLUDED.address, customers.address),
          list_id = COALESCE(EXCLUDED.list_id, customers.list_id),
          list_name = COALESCE(EXCLUDED.list_name, customers.list_name),
          notes = COALESCE(EXCLUDED.notes, customers.notes),
          total_purchases = EXCLUDED.total_purchases,
          total_paid = EXCLUDED.total_paid,
          remaining_balance = EXCLUDED.remaining_balance
      `).catch(() => {
      });
    } catch (e) {
      console.warn("syncCustomersTableInPg error:", e);
    }
  };
  const syncContractBalancesInPgAndFileDb = async (specificContractIds) => {
    const hasSpecific = Array.isArray(specificContractIds) && specificContractIds.length > 0;
    const targetIds = hasSpecific ? specificContractIds.filter(Boolean) : [];
    if (isPgConfigured()) {
      try {
        const whereClause = hasSpecific ? `WHERE c.id = ANY($1)` : ``;
        const params = hasSpecific ? [targetIds] : [];
        await executePg(`
          UPDATE sales c
          SET 
            total_paid = LEAST(
              GREATEST(0, COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)),
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ), 0)
            ),
            remaining_balance = GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - COALESCE((
              SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
              FROM payments p
              WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ), 0)),
            last_payment_date = (
              SELECT MAX(p.payment_date)
              FROM payments p
              WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ),
            status = CASE 
              WHEN GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ), 0)) = 0 AND (
                COALESCE((
                  SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                  FROM payments p
                  WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                    AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
                ), 0) > 0 OR (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) = 0
              ) THEN 'completed' 
              ELSE 'active' 
            END
          ${whereClause}
        `, params);
        if (!hasSpecific) {
          const pgContracts = await executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts' OR dr.table_name = 'unknown'))
            ORDER BY c.created_at ASC, c.id ASC
          `).catch(() => []);
          if (Array.isArray(pgContracts)) {
            fileDb.setAll("contracts", pgContracts.map(mapContractRow));
          }
          const pgPayments = await executePg(`
            SELECT * FROM payments
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ORDER BY payment_date DESC, created_at DESC
          `).catch(() => []);
          if (Array.isArray(pgPayments)) {
            fileDb.setAll("payments", pgPayments.map(mapPaymentRow));
          }
          await syncCustomersTableInPg().catch(() => {
          });
        }
      } catch (err) {
        console.warn("syncContractBalancesInPg error:", err);
      }
    } else {
      try {
        const allContracts = fileDb.get("contracts") || [];
        const allPayments = fileDb.get("payments") || [];
        const updated = allContracts.map((c) => {
          const cNameNorm = normalizeEntityName(c.customerName);
          const cPayments = allPayments.filter(
            (p) => p.contractId && p.contractId.trim() ? p.contractId === c.id : p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm
          );
          const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
          const net = Math.max(0, (Number(c.totalPrice) || 0) - (Number(c.advancePayment) || 0));
          const totalPaid = net > 0 ? Math.min(net, paymentsSum) : paymentsSum;
          const excessAmount = Math.max(0, paymentsSum - net);
          const remainingBalance = Math.max(0, net - paymentsSum);
          const status = remainingBalance === 0 && (net === 0 || paymentsSum > 0) ? "completed" : "active";
          const sorted = [...cPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
          const lastPaymentDate = sorted[0]?.paymentDate || null;
          return {
            ...c,
            totalPaid,
            excessAmount,
            rawTotalPaid: paymentsSum,
            remainingBalance,
            status,
            lastPaymentDate
          };
        });
        fileDb.setAll("contracts", updated);
      } catch (e) {
      }
    }
  };
  app.get(["/api/contracts", "/api/sales"], async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const sql = `
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts' OR dr.table_name = 'unknown'))
            ORDER BY c.created_at ASC, c.id ASC
          `;
          const rows = await executePg(sql);
          let contracts2 = (rows || []).map(mapContractRow);
          fileDb.setAll("contracts", contracts2);
          return res.json(contracts2);
        } catch (pgErr) {
          console.warn("Postgres fetch contracts error, fallback to fileDb:", pgErr);
        }
      }
      let allContracts = fileDb.get("contracts") || [];
      const allPayments = fileDb.get("payments") || [];
      const contracts = allContracts.map((c) => {
        const cNameNorm = normalizeEntityName(c.customerName);
        const cPayments = allPayments.filter(
          (p) => p.contractId && p.contractId.trim() ? p.contractId === c.id : p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm
        );
        const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
        const net = Math.max(0, (Number(c.totalPrice) || 0) - (Number(c.advancePayment) || 0));
        const totalPaid = net > 0 ? Math.min(net, paymentsSum) : paymentsSum;
        const excessAmount = Math.max(0, paymentsSum - net);
        const remainingBalance = Math.max(0, net - paymentsSum);
        const status = remainingBalance === 0 && (net === 0 || paymentsSum > 0) ? "completed" : "active";
        const sorted = [...cPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        const lastPaymentDate = sorted[0]?.paymentDate || null;
        return {
          ...c,
          totalPaid,
          excessAmount,
          rawTotalPaid: paymentsSum,
          remainingBalance,
          status,
          lastPaymentDate
        };
      });
      res.json(contracts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post(["/api/contracts", "/api/sales"], async (req, res) => {
    try {
      const c = req.body;
      const id = c.id || `contract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("contracts", {
        id,
        customerName: c.customerName || "",
        customerPhone: c.customerPhone || "",
        customerAddress: c.customerAddress || "",
        itemId: c.itemId || null,
        itemName: c.itemName || "",
        itemQuantity: Number(c.itemQuantity) || 1,
        purchasePrice: Number(c.purchasePrice) || 0,
        listId: c.listId || null,
        listName: c.listName || null,
        totalPrice: Number(c.totalPrice) || 0,
        advancePayment: Number(c.advancePayment) || 0,
        remainingBalance: Number(c.remainingBalance) || 0,
        dailyInstallment: Number(c.dailyInstallment) || 0,
        startDate: c.startDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        notes: c.notes || "",
        status: c.status || "active",
        lastPaymentDate: c.lastPaymentDate || null,
        totalPaid: Number(c.totalPaid) || 0,
        repName: c.repName || "",
        createdAt: c.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        completedAt: c.completedAt || null,
        updatedAt: c.updatedAt || null,
        isEdited: Boolean(c.isEdited)
      });
      const sql1 = `INSERT INTO sales (
          id, customer_name, customer_phone, customer_address, item_id, item_name,
          item_quantity, purchase_price, list_id, list_name, total_price, advance_payment,
          remaining_balance, daily_installment, start_date, notes, status, last_payment_date,
          total_paid, rep_name, created_at, completed_at, updated_at, is_edited
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
        ON CONFLICT (id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          customer_address = EXCLUDED.customer_address,
          list_id = EXCLUDED.list_id,
          list_name = EXCLUDED.list_name,
          total_price = EXCLUDED.total_price,
          advance_payment = EXCLUDED.advance_payment,
          remaining_balance = EXCLUDED.remaining_balance,
          daily_installment = EXCLUDED.daily_installment,
          status = EXCLUDED.status,
          total_paid = EXCLUDED.total_paid,
          last_payment_date = EXCLUDED.last_payment_date,
          updated_at = EXCLUDED.updated_at,
          is_edited = EXCLUDED.is_edited`;
      const vals = [
        id,
        saved.customerName,
        saved.customerPhone,
        saved.customerAddress,
        saved.itemId,
        saved.itemName,
        saved.itemQuantity,
        saved.purchasePrice,
        saved.listId,
        saved.listName,
        saved.totalPrice,
        saved.advancePayment,
        saved.remainingBalance,
        saved.dailyInstallment,
        saved.startDate,
        saved.notes,
        saved.status,
        saved.lastPaymentDate,
        saved.totalPaid,
        saved.repName,
        saved.createdAt,
        saved.completedAt,
        saved.updatedAt,
        saved.isEdited
      ];
      console.log(`[POST /api/contracts] Inserting contract ${id} for customer ${saved.customerName}...`);
      await executePg(sql1, vals);
      console.log(`[POST /api/contracts] Inserted ${id} into PostgreSQL successfully.`);
      bumpSyncVersion();
      res.json({ success: true, contract: saved });
    } catch (err) {
      console.error(`[POST /api/contracts] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post(["/api/contracts/import", "/api/sales/import"], async (req, res) => {
    try {
      const body = req.body || {};
      const contractsList = Array.isArray(body) ? body : Array.isArray(body.contracts) ? body.contracts : [];
      const overwrite = Boolean(body.overwrite);
      if (contractsList.length === 0) {
        return res.json({ success: true, count: 0, message: "No contracts provided to import" });
      }
      if (overwrite) {
        await executePg(`DELETE FROM payments WHERE contract_id IS NOT NULL`).catch(() => {
        });
        await executePg(`DELETE FROM sales`).catch(() => {
        });
        fileDb.setAll("contracts", []);
      }
      const savedList = [];
      const CHUNK_SIZE = 50;
      for (let i = 0; i < contractsList.length; i += CHUNK_SIZE) {
        const chunk = contractsList.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (c) => {
            if (!c) return;
            const id = c.id || `contract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const saved = fileDb.upsert("contracts", {
              id,
              customerName: c.customerName || c.customer_name || "",
              customerPhone: c.customerPhone || c.customer_phone || "",
              customerAddress: c.customerAddress || c.customer_address || "",
              itemId: c.itemId || c.item_id || null,
              itemName: c.itemName || c.item_name || "",
              itemQuantity: Number(c.itemQuantity ?? c.item_quantity ?? 1) || 1,
              purchasePrice: Number(c.purchasePrice ?? c.purchase_price ?? 0) || 0,
              listId: c.listId || c.list_id || null,
              listName: c.listName || c.list_name || null,
              totalPrice: Number(c.totalPrice ?? c.total_price ?? 0) || 0,
              advancePayment: Number(c.advancePayment ?? c.advance_payment ?? 0) || 0,
              remainingBalance: Number(c.remainingBalance ?? c.remaining_balance ?? c.totalPrice ?? 0) || 0,
              dailyInstallment: Number(c.dailyInstallment ?? c.daily_installment ?? 0) || 0,
              startDate: c.startDate || c.start_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
              notes: c.notes || "",
              status: c.status || "active",
              lastPaymentDate: c.lastPaymentDate || c.last_payment_date || null,
              totalPaid: Number(c.totalPaid ?? c.total_paid ?? 0) || 0,
              repName: c.repName || c.rep_name || "",
              createdAt: c.createdAt || c.created_at || (/* @__PURE__ */ new Date()).toISOString(),
              completedAt: c.completedAt || c.completed_at || null,
              updatedAt: c.updatedAt || c.updated_at || null,
              isEdited: Boolean(c.isEdited ?? c.is_edited)
            });
            savedList.push(saved);
            const sql = `INSERT INTO sales (
                id, customer_name, customer_phone, customer_address, item_id, item_name,
                item_quantity, purchase_price, list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes, status, last_payment_date,
                total_paid, rep_name, created_at, completed_at, updated_at, is_edited
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                customer_address = EXCLUDED.customer_address,
                item_id = EXCLUDED.item_id,
                item_name = EXCLUDED.item_name,
                item_quantity = EXCLUDED.item_quantity,
                purchase_price = EXCLUDED.purchase_price,
                list_id = EXCLUDED.list_id,
                list_name = EXCLUDED.list_name,
                total_price = EXCLUDED.total_price,
                advance_payment = EXCLUDED.advance_payment,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = EXCLUDED.daily_installment,
                start_date = EXCLUDED.start_date,
                notes = EXCLUDED.notes,
                status = EXCLUDED.status,
                total_paid = EXCLUDED.total_paid,
                last_payment_date = EXCLUDED.last_payment_date,
                rep_name = EXCLUDED.rep_name,
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited`;
            const vals = [
              saved.id,
              saved.customerName,
              saved.customerPhone,
              saved.customerAddress,
              saved.itemId,
              saved.itemName,
              saved.itemQuantity,
              saved.purchasePrice,
              saved.listId,
              saved.listName,
              saved.totalPrice,
              saved.advancePayment,
              saved.remainingBalance,
              saved.dailyInstallment,
              saved.startDate,
              saved.notes,
              saved.status,
              saved.lastPaymentDate,
              saved.totalPaid,
              saved.repName,
              saved.createdAt,
              saved.completedAt,
              saved.updatedAt,
              saved.isEdited
            ];
            await executePg(sql, vals).catch((e) => console.warn("Bulk contract insert error:", e));
          })
        );
      }
      bumpSyncVersion();
      res.json({ success: true, count: savedList.length, message: `Successfully imported ${savedList.length} contracts` });
    } catch (err) {
      console.error("[POST /api/contracts/import] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.put(["/api/contracts/:id", "/api/sales/:id"], async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      fileDb.update("contracts", id, updates);
      fileDb.update("contracts", id, updates);
      const fieldMap = {
        customerName: "customer_name",
        customerPhone: "customer_phone",
        customerAddress: "customer_address",
        itemId: "item_id",
        itemName: "item_name",
        itemQuantity: "item_quantity",
        purchasePrice: "purchase_price",
        listId: "list_id",
        listName: "list_name",
        totalPrice: "total_price",
        advancePayment: "advance_payment",
        remainingBalance: "remaining_balance",
        dailyInstallment: "daily_installment",
        startDate: "start_date",
        notes: "notes",
        status: "status",
        lastPaymentDate: "last_payment_date",
        totalPaid: "total_paid",
        repName: "rep_name",
        createdAt: "created_at",
        completedAt: "completed_at",
        updatedAt: "updated_at",
        isEdited: "is_edited",
        // Also support snake_case keys if passed directly
        customer_name: "customer_name",
        customer_phone: "customer_phone",
        customer_address: "customer_address",
        item_id: "item_id",
        item_name: "item_name",
        item_quantity: "item_quantity",
        purchase_price: "purchase_price",
        list_id: "list_id",
        list_name: "list_name",
        total_price: "total_price",
        advance_payment: "advance_payment",
        remaining_balance: "remaining_balance",
        daily_installment: "daily_installment",
        start_date: "start_date",
        last_payment_date: "last_payment_date",
        total_paid: "total_paid",
        rep_name: "rep_name",
        created_at: "created_at",
        completed_at: "completed_at",
        updated_at: "updated_at",
        is_edited: "is_edited"
      };
      const setClauses = [];
      const values = [];
      let idx = 1;
      const addedCols = /* @__PURE__ */ new Set();
      for (const [k, v] of Object.entries(updates)) {
        if (k === "id") continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }
      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE sales SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
        await executePg(`UPDATE sales SET ${setClauses.join(", ")} WHERE id = $${idx}`, values).catch(() => {
        });
      }
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      console.error(`[PUT /api/contracts/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete(["/api/contracts", "/api/sales"], async (req, res) => {
    try {
      fileDb.setAll("contracts", []);
      fileDb.setAll("payments", []);
      fileDb.setAll("payment_conflicts", []);
      if (isPgConfigured()) {
        await executePg(`DELETE FROM payments`).catch(() => {
        });
        await executePg(`DELETE FROM payment_conflicts`).catch(() => {
        });
        await executePg(`DELETE FROM sales`).catch(() => {
        });
        await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ('__all_contracts_cleared__', 'sales') ON CONFLICT (record_id) DO NOTHING`).catch(() => {
        });
      }
      bumpSyncVersion();
      res.json({ success: true, message: "All contracts and payments deleted successfully" });
    } catch (err) {
      console.error("[DELETE /api/contracts] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete(["/api/contracts/:id", "/api/sales/:id"], async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("contracts", id);
      const allPay = fileDb.get("payments") || [];
      fileDb.setAll("payments", allPay.filter((p) => p.contractId !== id));
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      const relPayments = await executePg(`SELECT id FROM payments WHERE contract_id = $1`, [id]).catch(() => []);
      if (Array.isArray(relPayments) && relPayments.length > 0) {
        for (const rp of relPayments) {
          if (rp?.id) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {
            });
          }
        }
      }
      await executePg(`DELETE FROM sales WHERE id = $1`, [id]);
      await executePg(`DELETE FROM payments WHERE contract_id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/payments", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT * FROM payments p
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
          `);
          const payments2 = (rows || []).map(mapPaymentRow);
          fileDb.setAll("payments", payments2);
          return res.json(payments2);
        } catch (pgErr) {
          console.warn("Postgres fetch payments error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("payments"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/payments", async (req, res) => {
    try {
      const p = req.body;
      const id = p.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const amountVal = Number(p.amount ?? p.amountPaid) || 0;
      const contractId = p.contractId || "";
      const customerName = p.customerName || "";
      const paymentDate = p.paymentDate || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const repName = p.repName || "";
      const note = p.note || "";
      const createdAt = p.createdAt || (/* @__PURE__ */ new Date()).toISOString();
      const isEdited = Boolean(p.isEdited);
      const resolvedFundId = await resolveFundIdForPayment(p.fundId, contractId);
      const saved = fileDb.upsert("payments", {
        id,
        contractId,
        customerName,
        amount: amountVal,
        amountPaid: amountVal,
        paymentDate,
        repName,
        note,
        fundId: resolvedFundId,
        updatedAt: p.updatedAt || null,
        createdAt,
        isEdited
      });
      const sql1 = `INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, rep_name, note, fund_id, updated_at, created_at, is_edited)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           contract_id = EXCLUDED.contract_id,
           customer_name = EXCLUDED.customer_name,
           amount = EXCLUDED.amount,
           amount_paid = EXCLUDED.amount_paid,
           payment_date = EXCLUDED.payment_date,
           rep_name = EXCLUDED.rep_name,
           note = EXCLUDED.note,
           fund_id = EXCLUDED.fund_id,
           updated_at = EXCLUDED.updated_at,
           is_edited = EXCLUDED.is_edited`;
      const vals = [id, contractId, customerName, amountVal, amountVal, paymentDate, repName, note, resolvedFundId, p.updatedAt || null, createdAt, isEdited];
      await executePg(sql1, vals);
      if (resolvedFundId && amountVal > 0) {
        await recordPaymentFundAdjustment(id, resolvedFundId, amountVal, customerName, repName, paymentDate, false);
      }
      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : void 0);
      bumpSyncVersion();
      res.json({ success: true, payment: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      let existingPayment = (fileDb.get("payments") || []).find((p) => p.id === id);
      if (!existingPayment && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
      }
      const oldAmt = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
      const rawAmt = updates.amount !== void 0 ? updates.amount : updates.amountPaid !== void 0 ? updates.amountPaid : updates.amount_paid;
      const newAmt = rawAmt !== void 0 && rawAmt !== null && rawAmt !== "" && !isNaN(Number(rawAmt)) ? Number(rawAmt) : oldAmt;
      const diff = newAmt - oldAmt;
      const contractId = updates.contractId || updates.contract_id || existingPayment?.contractId;
      const resolvedFundId = await resolveFundIdForPayment(updates.fundId || existingPayment?.fundId, contractId);
      if (resolvedFundId) {
        const cName = updates.customerName || updates.customer_name || existingPayment?.customerName || "";
        const rName = updates.repName || updates.rep_name || existingPayment?.repName || "";
        const pDate = updates.paymentDate || updates.payment_date || existingPayment?.paymentDate || "";
        await recordPaymentFundAdjustment(id, resolvedFundId, newAmt, cName, rName, pDate, false);
      }
      fileDb.update("payments", id, { ...updates, amount: newAmt, amountPaid: newAmt, fundId: resolvedFundId || updates.fundId });
      const fieldMap = {
        contractId: "contract_id",
        contract_id: "contract_id",
        customerName: "customer_name",
        customer_name: "customer_name",
        amountPaid: "amount",
        amount: "amount",
        paymentDate: "payment_date",
        payment_date: "payment_date",
        repName: "rep_name",
        rep_name: "rep_name",
        note: "note",
        fundId: "fund_id",
        fund_id: "fund_id",
        updatedAt: "updated_at",
        updated_at: "updated_at",
        createdAt: "created_at",
        created_at: "created_at",
        isEdited: "is_edited",
        is_edited: "is_edited"
      };
      const setClauses = [];
      const values = [];
      let idx = 1;
      const addedCols = /* @__PURE__ */ new Set();
      if (updates.amount !== void 0 || updates.amountPaid !== void 0 || updates.amount_paid !== void 0) {
        setClauses.push(`amount = $${idx++}`);
        values.push(newAmt);
        setClauses.push(`amount_paid = $${idx++}`);
        values.push(newAmt);
        addedCols.add("amount");
        addedCols.add("amount_paid");
      }
      if (resolvedFundId && !updates.fundId && !updates.fund_id) {
        setClauses.push(`fund_id = $${idx++}`);
        values.push(resolvedFundId);
        addedCols.add("fund_id");
      }
      for (const [k, v] of Object.entries(updates)) {
        if (k === "id" || k === "amount" || k === "amountPaid" || k === "amount_paid") continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }
      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE payments SET ${setClauses.join(", ")} WHERE id = $${idx}`, values).catch(() => {
        });
      }
      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : void 0);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      console.error(`[PUT /api/payments/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/payments", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length > 0) {
        let paymentsToDelete = [];
        if (isPgConfigured()) {
          const rows = await executePg("SELECT * FROM payments WHERE id = ANY($1)", [ids]).catch(() => []);
          if (rows && rows.length > 0) paymentsToDelete = rows.map(mapPaymentRow);
        }
        if (paymentsToDelete.length === 0) {
          paymentsToDelete = (fileDb.get("payments") || []).filter((p) => ids.includes(p.id));
        }
        const affectedContractIds = /* @__PURE__ */ new Set();
        for (const p of paymentsToDelete) {
          const cId = p.contractId || p.contract_id;
          if (cId) affectedContractIds.add(cId);
          const amountVal = Number(p.amountPaid ?? p.amount) || 0;
          const resolvedFundId = await resolveFundIdForPayment(p.fundId, cId);
          if (resolvedFundId && amountVal > 0) {
            await recordPaymentFundAdjustment(
              p.id,
              resolvedFundId,
              amountVal,
              p.customerName || "",
              p.repName || "",
              p.paymentDate || "",
              true
            ).catch(() => {
            });
          }
          fileDb.delete("payments", p.id);
        }
        if (isPgConfigured()) {
          await executePg(
            `INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'payments' ON CONFLICT (record_id) DO NOTHING`,
            [ids]
          ).catch(() => {
          });
          await executePg(`DELETE FROM payments WHERE id = ANY($1)`, [ids]).catch(() => {
          });
          if (affectedContractIds.size > 0) {
            await syncContractBalancesInPgAndFileDb(Array.from(affectedContractIds));
          }
        }
        bumpSyncVersion();
        return res.json({ success: true, deletedCount: ids.length });
      }
      fileDb.setAll("payments", []);
      fileDb.setAll("payment_conflicts", []);
      if (isPgConfigured()) {
        await executePg(`DELETE FROM payments`).catch(() => {
        });
        await executePg(`DELETE FROM payment_conflicts`).catch(() => {
        });
        await syncContractBalancesInPgAndFileDb();
      }
      bumpSyncVersion();
      res.json({ success: true, message: "All payments deleted successfully" });
    } catch (err) {
      console.error("[DELETE /api/payments] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/payments/delete-batch", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return res.json({ success: true, deletedCount: 0 });
      }
      let paymentsToDelete = [];
      if (isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = ANY($1)", [ids]).catch(() => []);
        if (rows && rows.length > 0) paymentsToDelete = rows.map(mapPaymentRow);
      }
      if (paymentsToDelete.length === 0) {
        paymentsToDelete = (fileDb.get("payments") || []).filter((p) => ids.includes(p.id));
      }
      const affectedContractIds = /* @__PURE__ */ new Set();
      for (const p of paymentsToDelete) {
        const cId = p.contractId || p.contract_id;
        if (cId) affectedContractIds.add(cId);
        const amountVal = Number(p.amountPaid ?? p.amount) || 0;
        const resolvedFundId = await resolveFundIdForPayment(p.fundId, cId, p.customerName);
        if (resolvedFundId && amountVal > 0) {
          await recordPaymentFundAdjustment(
            p.id,
            resolvedFundId,
            amountVal,
            p.customerName || "",
            p.repName || "",
            p.paymentDate || "",
            true
          ).catch(() => {
          });
        }
        fileDb.delete("payments", p.id);
      }
      if (isPgConfigured()) {
        await executePg(
          `INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'payments' ON CONFLICT (record_id) DO NOTHING`,
          [ids]
        ).catch(() => {
        });
        await executePg(`DELETE FROM payments WHERE id = ANY($1)`, [ids]).catch(() => {
        });
        if (affectedContractIds.size > 0) {
          await syncContractBalancesInPgAndFileDb(Array.from(affectedContractIds));
        }
      }
      bumpSyncVersion();
      res.json({ success: true, deletedCount: ids.length });
    } catch (err) {
      console.error("[POST /api/payments/delete-batch] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let existingPayment = (fileDb.get("payments") || []).find((p) => p.id === id);
      if (!existingPayment && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
      }
      const contractId = existingPayment?.contractId || existingPayment?.contract_id;
      const amountVal = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
      const resolvedFundId = await resolveFundIdForPayment(existingPayment?.fundId, contractId, existingPayment?.customerName);
      if (resolvedFundId && amountVal > 0) {
        await recordPaymentFundAdjustment(
          id,
          resolvedFundId,
          amountVal,
          existingPayment?.customerName || "",
          existingPayment?.repName || "",
          existingPayment?.paymentDate || "",
          true
        );
      }
      fileDb.delete("payments", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM payments WHERE id = $1`, [id]);
      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : void 0);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/funds", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          await cleanupDuplicateEntities().catch(() => {
          });
          const rows = await executePg("SELECT * FROM cash_funds ORDER BY name ASC");
          const funds = (rows || []).map(mapFundRow);
          fileDb.setAll("cash_funds", funds);
          return res.json(funds);
        } catch (pgErr) {
          console.warn("Postgres fetch funds error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("cash_funds"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/funds", async (req, res) => {
    try {
      const f = req.body;
      const fundName = (f.name || "").trim();
      if (!fundName) {
        return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0637\u0644\u0648\u0628" });
      }
      const normName = normalizeEntityName(fundName);
      const existingFunds = fileDb.get("cash_funds") || [];
      if (existingFunds.some((item) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642" });
      }
      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM cash_funds WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642" });
        }
      }
      const id = f.id || `fund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("cash_funds", {
        id,
        name: f.name || "",
        balance: Number(f.balance) || 0,
        description: f.description || "",
        createdAt: f.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      });
      const sql1 = `INSERT INTO cash_funds (id, name, balance, description) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, name = EXCLUDED.name`;
      const vals = [id, saved.name, saved.balance, saved.description];
      await executePg(sql1, vals);
      bumpSyncVersion();
      res.json({ success: true, fund: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/funds/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.name !== void 0) {
        const fundName = (updates.name || "").trim();
        if (!fundName) {
          return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0637\u0644\u0648\u0628" });
        }
        const normName = normalizeEntityName(fundName);
        const existingFunds = fileDb.get("cash_funds") || [];
        if (existingFunds.some((item) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642" });
        }
        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM cash_funds WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642" });
          }
        }
      }
      fileDb.update("cash_funds", id, updates);
      await executePg(`UPDATE cash_funds SET name = COALESCE($1, name), balance = COALESCE($2, balance), description = COALESCE($3, description) WHERE id = $4`, [updates.name, updates.balance, updates.description, id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/funds/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("cash_funds", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'cash_funds') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM cash_funds WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/customer-lists", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          await cleanupDuplicateEntities().catch(() => {
          });
          const rows = await executePg("SELECT * FROM customer_lists cl WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cl.id AND (dr.table_name = 'customer_lists' OR dr.table_name = 'unknown')) ORDER BY cl.name ASC");
          const lists = (rows || []).map(mapCustomerListRow);
          fileDb.setAll("customer_lists", lists);
          return res.json(lists);
        } catch (pgErr) {
          console.warn("Postgres fetch customer-lists error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("customer_lists"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/customer-lists", async (req, res) => {
    try {
      const l = req.body;
      const listName = (l.name || "").trim();
      if (!listName) {
        return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0637\u0644\u0648\u0628" });
      }
      const normName = normalizeEntityName(listName);
      const existingLists = fileDb.get("customer_lists") || [];
      if (existingLists.some((item) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0642\u0648\u0627\u0626\u0645" });
      }
      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM customer_lists WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0642\u0648\u0627\u0626\u0645" });
        }
      }
      const id = l.id || `list_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("customer_lists", {
        id,
        name: l.name || "",
        fundId: l.fundId || "",
        description: l.description || "",
        createdAt: l.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      });
      await executePg(
        `INSERT INTO customer_lists (id, name, fund_id, description) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fund_id = EXCLUDED.fund_id`,
        [id, saved.name, saved.fundId || null, saved.description]
      );
      bumpSyncVersion();
      res.json({ success: true, list: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/customer-lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.name !== void 0) {
        const listName = (updates.name || "").trim();
        if (!listName) {
          return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0637\u0644\u0648\u0628" });
        }
        const normName = normalizeEntityName(listName);
        const existingLists = fileDb.get("customer_lists") || [];
        if (existingLists.some((item) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0642\u0648\u0627\u0626\u0645" });
        }
        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM customer_lists WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0642\u0648\u0627\u0626\u0645" });
          }
        }
      }
      fileDb.update("customer_lists", id, updates);
      await executePg(`UPDATE customer_lists SET name = COALESCE($1, name), fund_id = COALESCE($2, fund_id), description = COALESCE($3, description) WHERE id = $4`, [updates.name, updates.fundId, updates.description, id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/customer-lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("customer_lists", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customer_lists') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM customer_lists WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/customers", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM sales s WHERE s.customer_name = c.name OR s.customer_id = c.id) as sales_count
            FROM customers c
            WHERE NOT EXISTS (
              SELECT 1 FROM deleted_records dr 
              WHERE dr.record_id = c.id AND (dr.table_name = 'customers' OR dr.table_name = 'unknown')
            )
            ORDER BY c.name ASC
          `);
          if (rows && rows.length > 0) {
            return res.json(rows);
          }
          const derived = await executePg(`
            SELECT 
              COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))) as id,
              c.customer_name as name,
              MAX(c.customer_phone) as phone,
              MAX(c.customer_address) as address,
              MAX(c.list_id) as list_id,
              MAX(c.list_name) as list_name,
              MAX(c.notes) as notes,
              SUM(COALESCE(c.total_price, 0)) as total_purchases,
              SUM(COALESCE(c.total_paid, 0)) as total_paid,
              SUM(COALESCE(c.remaining_balance, 0)) as remaining_balance,
              'active' as status,
              COUNT(*) as sales_count
            FROM sales c
            WHERE c.customer_name IS NOT NULL AND TRIM(c.customer_name) != ''
            GROUP BY COALESCE(c.customer_id, 'cust-' || md5(TRIM(c.customer_name))), c.customer_name
            ORDER BY c.customer_name ASC
          `).catch(() => []);
          return res.json(derived);
        } catch (pgErr) {
          console.warn("Postgres fetch customers error:", pgErr);
        }
      }
      res.json([]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/customers", async (req, res) => {
    try {
      const b = req.body;
      const id = b.id || `cust-${Date.now()}`;
      const name = b.name || b.customerName || "";
      const phone = b.phone || b.customerPhone || "";
      const address = b.address || b.customerAddress || "";
      const listId = b.listId || b.list_id || null;
      const listName = b.listName || b.list_name || null;
      const notes = b.notes || "";
      const totalPurchases = Number(b.totalPurchases ?? b.total_purchases) || 0;
      const totalPaid = Number(b.totalPaid ?? b.total_paid) || 0;
      const remainingBalance = Number(b.remainingBalance ?? b.remaining_balance) || 0;
      const status = b.status || "active";
      await executePg(`
        INSERT INTO customers (id, name, phone, address, list_id, list_name, notes, total_purchases, total_paid, remaining_balance, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          list_id = EXCLUDED.list_id,
          list_name = EXCLUDED.list_name,
          notes = EXCLUDED.notes,
          total_purchases = EXCLUDED.total_purchases,
          total_paid = EXCLUDED.total_paid,
          remaining_balance = EXCLUDED.remaining_balance,
          status = EXCLUDED.status
      `, [id, name, phone, address, listId, listName, notes, totalPurchases, totalPaid, remainingBalance, status]).catch(() => {
      });
      res.json({ success: true, customer: { id, name, phone, address, listId, listName, notes, totalPurchases, totalPaid, remainingBalance, status } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      await executePg(`
        UPDATE customers SET
          name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          list_id = COALESCE($4, list_id),
          list_name = COALESCE($5, list_name),
          notes = COALESCE($6, notes),
          status = COALESCE($7, status)
        WHERE id = $8
      `, [b.name, b.phone, b.address, b.listId ?? b.list_id, b.listName ?? b.list_name, b.notes, b.status, id]).catch(() => {
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customers') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/reps", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          await executePg("DELETE FROM deleted_records WHERE record_id = 'rep-1' OR record_id IN (SELECT id FROM reps WHERE name LIKE '%\u0636\u064A\u0627\u0621%')").catch(() => {
          });
          await executePg(`
            INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
            VALUES ('rep-1', '\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628', '07801112233', '4444', 'admin', true, true, true, true, '["all"]')
            ON CONFLICT (id) DO UPDATE SET name = '\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628', code = '4444', role = 'admin', can_edit = true, can_delete = true, can_move_customer = true, can_sell = true, allowed_list_ids = '["all"]'
          `).catch(() => {
          });
          const rows = await executePg("SELECT * FROM reps r WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = r.id AND dr.record_id != 'rep-1' AND (dr.table_name = 'reps' OR dr.table_name = 'unknown')) ORDER BY r.name ASC");
          if (rows && rows.length > 0) {
            const reps3 = rows.map(mapRepRow);
            if (!reps3.some((r) => r.id === "rep-1" || r.name && r.name.includes("\u0636\u064A\u0627\u0621"))) {
              reps3.unshift({
                id: "rep-1",
                name: "\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628",
                phone: "07801112233",
                code: "4444",
                role: "admin",
                canEdit: true,
                canDelete: true,
                canMoveCustomer: true,
                canSell: true,
                allowedListIds: ["all"],
                avatarUrl: ""
              });
            }
            fileDb.setAll("reps", reps3);
            return res.json(reps3);
          }
        } catch (pgErr) {
          console.warn("Postgres fetch reps error, fallback to fileDb:", pgErr);
        }
      }
      let reps2 = fileDb.get("reps");
      if (!reps2.some((r) => r.id === "rep-1" || r.name && r.name.includes("\u0636\u064A\u0627\u0621"))) {
        reps2.unshift({
          id: "rep-1",
          name: "\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628",
          phone: "07801112233",
          code: "4444",
          role: "admin",
          canEdit: true,
          canDelete: true,
          canMoveCustomer: true,
          canSell: true,
          allowedListIds: ["all"]
        });
      }
      res.json(reps2);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/reps", async (req, res) => {
    try {
      const r = req.body;
      const repName = (r.name || "").trim();
      if (!repName) {
        return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0637\u0644\u0648\u0628" });
      }
      const normName = normalizeEntityName(repName);
      const existingReps = fileDb.get("reps") || [];
      if (existingReps.some((item) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062F\u0648\u0628\u064A\u0646" });
      }
      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM reps WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062F\u0648\u0628\u064A\u0646" });
        }
      }
      const id = r.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("reps", {
        id,
        name: r.name || "",
        phone: r.phone || "",
        code: r.code || "",
        role: r.role || "rep",
        canEdit: r.canEdit !== false,
        canDelete: Boolean(r.canDelete),
        canMoveCustomer: r.canMoveCustomer !== false,
        canSell: r.canSell !== false,
        allowedListIds: Array.isArray(r.allowedListIds) ? r.allowedListIds : ["all"],
        avatarUrl: r.avatarUrl || r.avatar_url || ""
      });
      const sql1 = `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids, avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, code = EXCLUDED.code, role = EXCLUDED.role, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, can_move_customer = EXCLUDED.can_move_customer, can_sell = EXCLUDED.can_sell, allowed_list_ids = EXCLUDED.allowed_list_ids, avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), reps.avatar_url)`;
      const vals = [id, saved.name, saved.phone, saved.code, saved.role, saved.canEdit, saved.canDelete, saved.canMoveCustomer, saved.canSell, JSON.stringify(saved.allowedListIds), saved.avatarUrl || null];
      await executePg(sql1, vals);
      bumpSyncVersion();
      res.json({ success: true, rep: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/reps/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.name !== void 0) {
        const repName = (updates.name || "").trim();
        if (!repName) {
          return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0637\u0644\u0648\u0628" });
        }
        const normName = normalizeEntityName(repName);
        const existingReps = fileDb.get("reps") || [];
        if (existingReps.some((item) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062F\u0648\u0628\u064A\u0646" });
        }
        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM reps WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0646\u062F\u0648\u0628\u064A\u0646" });
          }
        }
      }
      fileDb.update("reps", id, updates);
      await executePg(
        `UPDATE reps SET name = COALESCE($1, name), phone = COALESCE($2, phone), code = COALESCE($3, code), role = COALESCE($4, role), can_edit = COALESCE($5, can_edit), can_delete = COALESCE($6, can_delete), can_move_customer = COALESCE($7, can_move_customer), can_sell = COALESCE($8, can_sell), allowed_list_ids = COALESCE($9, allowed_list_ids), avatar_url = COALESCE($10, avatar_url) WHERE id = $11`,
        [updates.name, updates.phone, updates.code, updates.role, updates.canEdit, updates.canDelete, updates.canMoveCustomer, updates.canSell, updates.allowedListIds ? JSON.stringify(updates.allowedListIds) : null, updates.avatarUrl ?? updates.avatar_url ?? null, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/reps/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("reps", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'reps') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM reps WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/reps/locations", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          await executePg(`
            CREATE TABLE IF NOT EXISTS rep_locations (
              rep_id TEXT PRIMARY KEY,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              address TEXT,
              updated_at TEXT NOT NULL
            );
          `).catch(() => {
          });
          const rows = await executePg(`
            SELECT rl.*, r.name as current_rep_name, r.phone as rep_phone, r.avatar_url 
            FROM rep_locations rl
            LEFT JOIN reps r ON r.id = rl.rep_id
            ORDER BY rl.updated_at DESC
          `);
          return res.json(rows || []);
        } catch (pgErr) {
          console.warn("Postgres fetch rep_locations error:", pgErr);
        }
      }
      const locs = fileDb.get("rep_locations") || [];
      res.json(locs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/reps/location", async (req, res) => {
    try {
      const { repId, repName, latitude, longitude, accuracy, speed, battery, address } = req.body;
      if (!repId || latitude === void 0 || longitude === void 0) {
        return res.status(400).json({ error: "Missing required coordinates or repId" });
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const locationData = {
        id: String(repId),
        rep_id: String(repId),
        rep_name: repName || "\u0645\u0646\u062F\u0648\u0628",
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        speed: speed != null ? Number(speed) : null,
        battery: battery != null ? Number(battery) : null,
        address: address || null,
        updated_at: now
      };
      fileDb.upsert("rep_locations", locationData);
      if (isPgConfigured()) {
        try {
          await executePg(`
            CREATE TABLE IF NOT EXISTS rep_locations (
              rep_id TEXT PRIMARY KEY,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              address TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rep_location_logs (
              id TEXT PRIMARY KEY,
              rep_id TEXT NOT NULL,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              created_at TEXT NOT NULL
            );
          `).catch(() => {
          });
          await executePg(`
            INSERT INTO rep_locations (rep_id, rep_name, latitude, longitude, accuracy, speed, battery, address, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (rep_id) DO UPDATE SET
              rep_name = EXCLUDED.rep_name,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              accuracy = EXCLUDED.accuracy,
              speed = EXCLUDED.speed,
              battery = EXCLUDED.battery,
              address = EXCLUDED.address,
              updated_at = EXCLUDED.updated_at
          `, [
            locationData.rep_id,
            locationData.rep_name,
            locationData.latitude,
            locationData.longitude,
            locationData.accuracy,
            locationData.speed,
            locationData.battery,
            locationData.address,
            now
          ]);
          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await executePg(`
            INSERT INTO rep_location_logs (id, rep_id, rep_name, latitude, longitude, accuracy, speed, battery, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            logId,
            locationData.rep_id,
            locationData.rep_name,
            locationData.latitude,
            locationData.longitude,
            locationData.accuracy,
            locationData.speed,
            locationData.battery,
            now
          ]).catch(() => {
          });
        } catch (pgErr) {
          console.warn("Postgres save rep_location error:", pgErr);
        }
      }
      res.json({ success: true, location: locationData });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/reps/locations/:repId/logs", async (req, res) => {
    try {
      const { repId } = req.params;
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT * FROM rep_location_logs 
            WHERE rep_id = $1 
            ORDER BY created_at DESC 
            LIMIT 100
          `, [repId]);
          return res.json(rows || []);
        } catch (pgErr) {
          console.warn("Postgres fetch rep_location_logs error:", pgErr);
        }
      }
      res.json([]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/fund-transactions", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM fund_transactions ORDER BY created_at DESC");
          const txs = (rows || []).map(mapFundTxRow);
          fileDb.setAll("fund_transactions", txs);
          return res.json(txs);
        } catch (pgErr) {
          console.warn("Postgres fetch fund-transactions error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("fund_transactions"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/fund-transactions", async (req, res) => {
    try {
      const t = req.body;
      const id = t.id || `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("fund_transactions", {
        id,
        fundId: t.fundId || t.fund_id || "",
        targetFundId: t.targetFundId || t.target_fund_id || null,
        type: t.type || "deposit",
        amount: Number(t.amount) || 0,
        note: t.note || t.description || "",
        repName: t.repName || t.rep_name || "",
        createdAt: t.createdAt || t.created_at || (/* @__PURE__ */ new Date()).toISOString()
      });
      await executePg(
        `INSERT INTO fund_transactions (id, fund_id, target_fund_id, type, amount, note, rep_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           fund_id = EXCLUDED.fund_id, target_fund_id = EXCLUDED.target_fund_id, type = EXCLUDED.type,
           amount = EXCLUDED.amount, note = EXCLUDED.note, rep_name = EXCLUDED.rep_name`,
        [id, saved.fundId, saved.targetFundId, saved.type, saved.amount, saved.note, saved.repName, saved.createdAt]
      );
      const amount = Number(saved.amount) || 0;
      if (saved.type === "transfer") {
        if (saved.fundId) await adjustFundBalance(saved.fundId, -amount);
        if (saved.targetFundId) await adjustFundBalance(saved.targetFundId, +amount);
      } else if (saved.type === "withdraw" || saved.type === "expense" || saved.type === "employee_loan") {
        if (saved.fundId) await adjustFundBalance(saved.fundId, -amount);
      } else if (saved.type === "deposit" || saved.type === "employee_repay") {
        if (saved.fundId) await adjustFundBalance(saved.fundId, +amount);
      }
      bumpSyncVersion();
      res.json({ success: true, transaction: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/fund-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const existing = (fileDb.get("fund_transactions") || []).find((x) => x.id === id);
      const oldAmount = existing ? Number(existing.amount) || 0 : 0;
      const newAmount = updates.amount !== void 0 ? Number(updates.amount) || 0 : oldAmount;
      const diff = newAmount - oldAmount;
      const type = updates.type || existing?.type || "deposit";
      const fundId = updates.fundId || existing?.fundId || updates.fund_id;
      const targetFundId = updates.targetFundId || existing?.targetFundId || updates.target_fund_id;
      const note = updates.note !== void 0 ? updates.note : existing?.note || "";
      fileDb.update("fund_transactions", id, updates);
      await executePg(
        `UPDATE fund_transactions SET amount = COALESCE($1, amount), note = COALESCE($2, note) WHERE id = $3`,
        [updates.amount, updates.note, id]
      );
      if (diff !== 0) {
        if (type === "transfer") {
          if (fundId) await adjustFundBalance(fundId, -diff);
          if (targetFundId) await adjustFundBalance(targetFundId, +diff);
        } else if (type === "withdraw" || type === "expense" || type === "employee_loan") {
          if (fundId) await adjustFundBalance(fundId, -diff);
        } else if (type === "deposit" || type === "employee_repay") {
          if (fundId) await adjustFundBalance(fundId, +diff);
        }
      }
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/fund-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = (fileDb.get("fund_transactions") || []).find((x) => x.id === id);
      if (existing && existing.amount) {
        const amount = Number(existing.amount) || 0;
        const type = existing.type;
        const fundId = existing.fundId || existing.fund_id;
        const targetFundId = existing.targetFundId || existing.target_fund_id;
        if (type === "transfer") {
          if (fundId) await adjustFundBalance(fundId, +amount);
          if (targetFundId) await adjustFundBalance(targetFundId, -amount);
        } else if (type === "withdraw" || type === "expense" || type === "employee_loan") {
          if (fundId) await adjustFundBalance(fundId, +amount);
        } else if (type === "deposit" || type === "employee_repay") {
          if (fundId) await adjustFundBalance(fundId, -amount);
        }
      }
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      fileDb.delete("fund_transactions", id);
      await executePg(`DELETE FROM fund_transactions WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/employees", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM employees ORDER BY name ASC");
          const emps = (rows || []).map(mapEmployeeRow);
          fileDb.setAll("employees", emps);
          return res.json(emps);
        } catch (pgErr) {
          console.warn("Postgres fetch employees error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("employees"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/employees", async (req, res) => {
    try {
      const e = req.body;
      const empName = (e.name || "").trim();
      if (!empName) {
        return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0637\u0644\u0648\u0628" });
      }
      const normName = normalizeEntityName(empName);
      const existingEmps = fileDb.get("employees") || [];
      if (existingEmps.some((item) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646" });
      }
      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM employees WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646" });
        }
      }
      const id = e.id || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("employees", {
        id,
        name: e.name || "",
        phone: e.phone || "",
        jobTitle: e.jobTitle || "",
        position: e.position || "",
        salary: Number(e.salary) || 0,
        debtBalance: Number(e.debtBalance) || 0,
        totalDebt: Number(e.totalDebt) || 0,
        isRep: Boolean(e.isRep),
        repId: e.repId || null,
        createdAt: e.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      });
      await executePg(
        `INSERT INTO employees (id, name, phone, job_title, position, salary, debt_balance, total_debt, is_rep, rep_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, salary = EXCLUDED.salary, debt_balance = EXCLUDED.debt_balance`,
        [id, saved.name, saved.phone, saved.jobTitle, saved.position, saved.salary, saved.debtBalance, saved.totalDebt, saved.isRep, saved.repId, saved.createdAt]
      );
      bumpSyncVersion();
      res.json({ success: true, employee: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (updates.name !== void 0) {
        const empName = (updates.name || "").trim();
        if (!empName) {
          return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0637\u0644\u0648\u0628" });
        }
        const normName = normalizeEntityName(empName);
        const existingEmps = fileDb.get("employees") || [];
        if (existingEmps.some((item) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646" });
        }
        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM employees WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "\u0639\u0630\u0631\u0627\u064B\u060C \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B \u0648\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0643\u0631\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646" });
          }
        }
      }
      fileDb.update("employees", id, updates);
      await executePg(
        `UPDATE employees SET name = COALESCE($1, name), phone = COALESCE($2, phone), job_title = COALESCE($3, job_title), position = COALESCE($4, position), salary = COALESCE($5, salary), debt_balance = COALESCE($6, debt_balance), total_debt = COALESCE($7, total_debt) WHERE id = $8`,
        [updates.name, updates.phone, updates.jobTitle, updates.position, updates.salary, updates.debtBalance, updates.totalDebt, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/cleanup-duplicates", async (req, res) => {
    try {
      await cleanupDuplicateEntities();
      res.json({ success: true, message: "\u062A\u0645 \u062A\u0646\u0638\u064A\u0641 \u0627\u0644\u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0645\u0643\u0631\u0631\u0629 \u0628\u0646\u062C\u0627\u062D" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("employees", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employees') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
      });
      await executePg(`DELETE FROM employees WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/employee-transactions", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM employee_transactions ORDER BY created_at DESC");
          const txs = (rows || []).map(mapEmpTxRow);
          fileDb.setAll("employee_transactions", txs);
          return res.json(txs);
        } catch (pgErr) {
          console.warn("Postgres fetch employee-transactions error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("employee_transactions"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/employee-transactions", async (req, res) => {
    try {
      const et = req.body;
      const id = et.id || `emptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("employee_transactions", {
        id,
        employeeId: et.employeeId || "",
        fundId: et.fundId || "",
        type: et.type || "debt",
        amount: Number(et.amount) || 0,
        notes: et.notes || "",
        repName: et.repName || "",
        createdAt: et.createdAt || (/* @__PURE__ */ new Date()).toISOString()
      });
      await executePg(
        `INSERT INTO employee_transactions (id, employee_id, fund_id, type, amount, notes, rep_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [id, saved.employeeId, saved.fundId, saved.type, saved.amount, saved.notes, saved.repName, saved.createdAt]
      );
      bumpSyncVersion();
      res.json({ success: true, transaction: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/employee-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      fileDb.update("employee_transactions", id, updates);
      await executePg(
        `UPDATE employee_transactions SET amount = COALESCE($1, amount), notes = COALESCE($2, notes) WHERE id = $3`,
        [updates.amount, updates.notes, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/employee-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("employee_transactions", id);
      await executePg(`DELETE FROM employee_transactions WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/payment-conflicts", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM payment_conflicts ORDER BY created_at DESC");
          const conflicts = (rows || []).map(mapConflictRow);
          fileDb.setAll("payment_conflicts", conflicts);
          return res.json(conflicts);
        } catch (pgErr) {
          console.warn("Postgres fetch payment-conflicts error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("payment_conflicts"));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/payment-conflicts", async (req, res) => {
    try {
      const pc = req.body;
      const id = pc.id || `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("payment_conflicts", {
        id,
        contractId: pc.contractId || "",
        customerName: pc.customerName || "",
        attemptedAmount: Number(pc.attemptedAmount) || 0,
        actualRemainingBalance: Number(pc.actualRemainingBalance) || 0,
        excessAmount: Number(pc.excessAmount) || 0,
        acceptedAmount: Number(pc.acceptedAmount) || 0,
        repName: pc.repName || "",
        note: pc.note || "",
        paymentDate: pc.paymentDate || "",
        createdAt: pc.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        status: pc.status || "pending_review",
        resolvedBy: pc.resolvedBy || null,
        resolvedAt: pc.resolvedAt || null,
        resolutionNote: pc.resolutionNote || null
      });
      await executePg(
        `INSERT INTO payment_conflicts (id, contract_id, customer_name, attempted_amount, actual_remaining_balance, excess_amount, accepted_amount, rep_name, note, payment_date, created_at, status, resolved_by, resolved_at, resolution_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           excess_amount = EXCLUDED.excess_amount,
           accepted_amount = EXCLUDED.accepted_amount,
           resolved_by = EXCLUDED.resolved_by,
           resolved_at = EXCLUDED.resolved_at,
           resolution_note = EXCLUDED.resolution_note`,
        [id, saved.contractId, saved.customerName, saved.attemptedAmount, saved.actualRemainingBalance, saved.excessAmount, saved.acceptedAmount, saved.repName, saved.note, saved.paymentDate, saved.createdAt, saved.status, saved.resolvedBy, saved.resolvedAt, saved.resolutionNote]
      ).catch((err) => {
        console.warn("Postgres insert payment_conflict warning:", err?.message || err);
      });
      bumpSyncVersion();
      res.json({ success: true, conflict: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.put("/api/payment-conflicts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};
      fileDb.update("payment_conflicts", id, updates);
      await executePg(
        `UPDATE payment_conflicts SET
           status = COALESCE($1, status),
           resolved_by = COALESCE($2, resolved_by),
           resolved_at = COALESCE($3, resolved_at),
           resolution_note = COALESCE($4, resolution_note),
           accepted_amount = COALESCE($5, accepted_amount),
           excess_amount = COALESCE($6, excess_amount)
         WHERE id = $7`,
        [
          updates.status || null,
          updates.resolvedBy ?? updates.resolved_by ?? null,
          updates.resolvedAt ?? updates.resolved_at ?? null,
          updates.resolutionNote ?? updates.resolution_note ?? null,
          updates.acceptedAmount !== void 0 ? Number(updates.acceptedAmount) : null,
          updates.excessAmount !== void 0 ? Number(updates.excessAmount) : null,
          id
        ]
      ).catch((err) => {
        console.warn("Postgres update payment_conflict warning:", err?.message || err);
      });
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.delete("/api/payment-conflicts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("payment_conflicts", id);
      await executePg(`DELETE FROM payment_conflicts WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/debug/tables", async (req, res) => {
    try {
      if (!isPgConfigured()) {
        return res.json({ success: false, message: "PostgreSQL is not configured" });
      }
      const tablesToCheck = [
        "sales",
        "contracts",
        "payments",
        "cash_funds",
        "inventory_items",
        "employees",
        "reps",
        "customer_lists",
        "customers",
        "fund_transactions",
        "employee_transactions",
        "payment_conflicts"
      ];
      const report = {};
      for (const table of tablesToCheck) {
        try {
          const countRes = await executePg(`SELECT COUNT(*)::int AS count FROM ${table}`);
          const sampleRes = await executePg(`SELECT * FROM ${table} LIMIT 1`);
          const columns = sampleRes[0] ? Object.keys(sampleRes[0]) : [];
          report[table] = {
            exists: true,
            rowCount: countRes[0]?.count ?? 0,
            columns
          };
        } catch (err) {
          report[table] = {
            exists: false,
            error: err.message
          };
        }
      }
      res.json({
        success: true,
        database: "postgresql",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        tables: report
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/reports/totals", async (req, res) => {
    try {
      if (isPgConfigured()) {
        const todayStr2 = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
        const monthPrefix2 = todayStr2.substring(0, 7);
        const queryErrors = {};
        const [
          salesStatsRes,
          paymentStatsRes,
          fundsStatsRes,
          inventoryStatsRes,
          employeesStatsRes,
          repsStatsRes
        ] = await Promise.all([
          // 1. العقود والمبيعات (sales مع fallback إلى contracts)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_contracts,
              COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_contracts,
              COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_contracts,
              COALESCE(SUM(total_price), 0)::float AS total_sales_amount,
              COALESCE(SUM(total_paid), 0)::float AS total_paid_amount,
              COALESCE(SUM(remaining_balance), 0)::float AS total_remaining_balance,
              COALESCE(SUM(advance_payment), 0)::float AS total_advance_payment
            FROM sales
          `).catch(async (err) => {
            queryErrors["sales"] = err.message;
            console.warn("Notice: sales table query failed, trying contracts view/table:", err.message);
            return executePg(`
              SELECT 
                COUNT(*)::int AS total_contracts,
                COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_contracts,
                COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_contracts,
                COALESCE(SUM(total_price), 0)::float AS total_sales_amount,
                COALESCE(SUM(total_paid), 0)::float AS total_paid_amount,
                COALESCE(SUM(remaining_balance), 0)::float AS total_remaining_balance,
                COALESCE(SUM(advance_payment), 0)::float AS total_advance_payment
              FROM contracts
            `).catch((err2) => {
              queryErrors["contracts"] = err2.message;
              console.error("Error querying sales/contracts:", err2.message);
              return [{}];
            });
          }),
          // 2. التسديدات والمقبوضات (تحويل payment_date::text لضمان التوافق مع Text/Date/Timestamp)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_payments_count,
              COALESCE(SUM(amount), 0)::float AS total_payments_amount,
              COALESCE(SUM(CASE WHEN payment_date::text LIKE $1 || '%' THEN amount ELSE 0 END), 0)::float AS today_payments_amount,
              COALESCE(SUM(CASE WHEN payment_date::text LIKE $2 THEN amount ELSE 0 END), 0)::float AS month_payments_amount
            FROM payments
          `, [todayStr2, `${monthPrefix2}%`]).catch((err) => {
            queryErrors["payments"] = err.message;
            console.error("Error querying payments:", err.message);
            return [{}];
          }),
          // 3. الصناديق (استعلام يدعم balance أو current_balance تلقائياً)
          executePg(`
            SELECT 
              COUNT(*)::int AS funds_count,
              COALESCE(SUM(balance), 0)::float AS total_funds_balance
            FROM cash_funds
          `).catch(async () => {
            return executePg(`
              SELECT 
                COUNT(*)::int AS funds_count,
                COALESCE(SUM(current_balance), 0)::float AS total_funds_balance
              FROM cash_funds
            `).catch((err) => {
              queryErrors["cash_funds"] = err.message;
              console.error("Error querying cash_funds:", err.message);
              return [{}];
            });
          }),
          // 4. المخزن والمواد
          executePg(`
            SELECT 
              COUNT(*)::int AS total_inventory_items,
              COALESCE(SUM(quantity), 0)::int AS total_inventory_quantity,
              COALESCE(SUM(quantity * purchase_price), 0)::float AS total_inventory_value
            FROM inventory_items
          `).catch((err) => {
            queryErrors["inventory_items"] = err.message;
            console.error("Error querying inventory_items:", err.message);
            return [{}];
          }),
          // 5. الموظفين (متوافق مع جدول employees بدون افتراض وجود عمود is_active)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_employees,
              COUNT(CASE WHEN salary >= 0 THEN 1 END)::int AS active_employees
            FROM employees
          `).catch((err) => {
            queryErrors["employees"] = err.message;
            console.error("Error querying employees:", err.message);
            return [{}];
          }),
          // 6. المندوبين (متوافق مع جدول reps حيث العمود هو role وليس status)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_reps,
              COUNT(CASE WHEN role IS NOT NULL THEN 1 END)::int AS active_reps
            FROM reps
          `).catch((err) => {
            queryErrors["reps"] = err.message;
            console.error("Error querying reps:", err.message);
            return [{}];
          })
        ]);
        const salesStats = salesStatsRes[0] || {};
        const paymentStats = paymentStatsRes[0] || {};
        const fundsStats = fundsStatsRes[0] || {};
        const inventoryStats = inventoryStatsRes[0] || {};
        const employeesStats = employeesStatsRes[0] || {};
        const repsStats = repsStatsRes[0] || {};
        return res.json({
          success: true,
          database: "postgresql",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          contracts: {
            total: salesStats.total_contracts || 0,
            active: salesStats.active_contracts || 0,
            completed: salesStats.completed_contracts || 0,
            totalSalesAmount: salesStats.total_sales_amount || 0,
            totalPaidAmount: salesStats.total_paid_amount || 0,
            totalRemainingBalance: salesStats.total_remaining_balance || 0,
            totalAdvancePayment: salesStats.total_advance_payment || 0
          },
          payments: {
            totalCount: paymentStats.total_payments_count || 0,
            totalAmount: paymentStats.total_payments_amount || 0,
            todayAmount: paymentStats.today_payments_amount || 0,
            monthAmount: paymentStats.month_payments_amount || 0
          },
          funds: {
            count: fundsStats.funds_count || 0,
            totalBalance: fundsStats.total_funds_balance || 0
          },
          inventory: {
            totalItems: inventoryStats.total_inventory_items || 0,
            totalQuantity: inventoryStats.total_inventory_quantity || 0,
            totalValue: inventoryStats.total_inventory_value || 0
          },
          employees: {
            total: employeesStats.total_employees || 0,
            active: employeesStats.active_employees || 0
          },
          reps: {
            total: repsStats.total_reps || 0,
            active: repsStats.active_reps || 0
          },
          diagnostics: {
            hasErrors: Object.keys(queryErrors).length > 0,
            queryErrors: Object.keys(queryErrors).length > 0 ? queryErrors : void 0
          }
        });
      }
      const allContracts = fileDb.get("contracts") || [];
      const allPayments = fileDb.get("payments") || [];
      const allFunds = fileDb.get("funds") || [];
      const allInventory = fileDb.get("inventory") || [];
      const allEmployees = fileDb.get("employees") || [];
      const allReps = fileDb.get("reps") || [];
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
      const monthPrefix = todayStr.substring(0, 7);
      const totalSalesAmount = allContracts.reduce((sum, c) => sum + (Number(c.totalPrice) || 0), 0);
      const totalPaidAmount = allContracts.reduce((sum, c) => sum + (Number(c.totalPaid) || 0), 0);
      const totalRemainingBalance = allContracts.reduce((sum, c) => sum + (Number(c.remainingBalance) || 0), 0);
      const totalAdvancePayment = allContracts.reduce((sum, c) => sum + (Number(c.advancePayment) || 0), 0);
      const totalPaymentsAmount = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const todayPaymentsAmount = allPayments.filter((p) => (p.paymentDate || "").startsWith(todayStr)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const monthPaymentsAmount = allPayments.filter((p) => (p.paymentDate || "").startsWith(monthPrefix)).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const totalFundsBalance = allFunds.reduce((sum, f) => sum + (Number(f.currentBalance) || 0), 0);
      const totalInventoryQuantity = allInventory.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
      const totalInventoryValue = allInventory.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.purchasePrice) || 0), 0);
      res.json({
        success: true,
        database: "filedb",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        contracts: {
          total: allContracts.length,
          active: allContracts.filter((c) => c.status === "active").length,
          completed: allContracts.filter((c) => c.status === "completed").length,
          totalSalesAmount,
          totalPaidAmount,
          totalRemainingBalance,
          totalAdvancePayment
        },
        payments: {
          totalCount: allPayments.length,
          totalAmount: totalPaymentsAmount,
          todayAmount: todayPaymentsAmount,
          monthAmount: monthPaymentsAmount
        },
        funds: {
          count: allFunds.length,
          totalBalance: totalFundsBalance
        },
        inventory: {
          totalItems: allInventory.length,
          totalQuantity: totalInventoryQuantity,
          totalValue: totalInventoryValue
        },
        employees: {
          total: allEmployees.length,
          active: allEmployees.filter((e) => e.isActive !== false).length
        },
        reps: {
          total: allReps.length,
          active: allReps.filter((r) => r.status === "active").length
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  async function processSingleSyncAction(action, skipBalanceRecalc = false) {
    if (!action || !action.type) return true;
    try {
      const { type, payload } = action;
      if (payload?.id && (type.startsWith("CREATE_") || type.startsWith("UPDATE_"))) {
        const deletedCheck = await executePg(
          `SELECT 1 FROM deleted_records WHERE record_id = $1 LIMIT 1`,
          [payload.id]
        ).catch(() => []);
        if (deletedCheck && deletedCheck.length > 0) {
          console.log(`[Sync] Record ${payload.id} is marked as deleted. Skipping ${type}.`);
          return true;
        }
      }
      switch (type) {
        case "CREATE_CONTRACT": {
          if (!payload?.id) return true;
          const cName = payload.customerName ?? payload.customer_name ?? "";
          const cPhone = payload.customerPhone ?? payload.customer_phone ?? "";
          const cAddress = payload.customerAddress ?? payload.customer_address ?? "";
          const iId = payload.itemId ?? payload.item_id ?? null;
          const iName = payload.itemName ?? payload.item_name ?? "\u0645\u0627\u062F\u0629";
          const iQty = Number(payload.itemQuantity ?? payload.item_quantity ?? 1) || 1;
          const pPrice = Number(payload.purchasePrice ?? payload.purchase_price ?? 0) || 0;
          const lId = payload.listId ?? payload.list_id ?? null;
          const lName = payload.listName ?? payload.list_name ?? null;
          const tPrice = Number(payload.totalPrice ?? payload.total_price ?? 0) || 0;
          const advPay = Number(payload.advancePayment ?? payload.advance_payment ?? 0) || 0;
          const remBal = Number(payload.remainingBalance ?? payload.remaining_balance ?? tPrice - advPay) || 0;
          const dInst = Number(payload.dailyInstallment ?? payload.daily_installment ?? 0) || 0;
          const sDate = payload.startDate ?? payload.start_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const notes = payload.notes ?? "";
          const status = payload.status ?? "active";
          const lastPayDate = payload.lastPaymentDate ?? payload.last_payment_date ?? null;
          const tPaid = Number(payload.totalPaid ?? payload.total_paid ?? 0) || 0;
          const rName = payload.repName ?? payload.rep_name ?? "";
          const cAt = payload.createdAt ?? payload.created_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const compAt = payload.completedAt ?? payload.completed_at ?? null;
          const upAt = payload.updatedAt ?? payload.updated_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const isEd = Boolean(payload.isEdited ?? payload.is_edited);
          const contractObj = {
            ...payload,
            id: payload.id,
            customerName: cName,
            customerPhone: cPhone,
            customerAddress: cAddress,
            itemId: iId,
            itemName: iName,
            itemQuantity: iQty,
            purchasePrice: pPrice,
            listId: lId,
            listName: lName,
            totalPrice: tPrice,
            advancePayment: advPay,
            remainingBalance: remBal,
            dailyInstallment: dInst,
            startDate: sDate,
            notes,
            status,
            lastPaymentDate: lastPayDate,
            totalPaid: tPaid,
            repName: rName,
            createdAt: cAt,
            completedAt: compAt,
            updatedAt: upAt,
            isEdited: isEd
          };
          fileDb.upsert("contracts", contractObj);
          const vals = [
            payload.id,
            cName,
            cPhone,
            cAddress,
            iId,
            iName,
            iQty,
            pPrice,
            lId,
            lName,
            tPrice,
            advPay,
            remBal,
            dInst,
            sDate,
            notes,
            status,
            lastPayDate,
            tPaid,
            rName,
            cAt,
            compAt,
            upAt,
            isEd
          ];
          await executePg(
            `INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, last_payment_date, total_paid, rep_name, created_at, completed_at, updated_at, is_edited)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
             ON CONFLICT (id) DO UPDATE SET
               customer_name=EXCLUDED.customer_name, customer_phone=EXCLUDED.customer_phone, customer_address=EXCLUDED.customer_address,
               item_id=EXCLUDED.item_id, item_name=EXCLUDED.item_name, item_quantity=EXCLUDED.item_quantity, purchase_price=EXCLUDED.purchase_price,
               list_id=EXCLUDED.list_id, list_name=EXCLUDED.list_name, total_price=EXCLUDED.total_price,
               advance_payment=EXCLUDED.advance_payment, remaining_balance=EXCLUDED.remaining_balance, daily_installment=EXCLUDED.daily_installment,
               start_date=EXCLUDED.start_date, notes=EXCLUDED.notes, status=EXCLUDED.status, last_payment_date=EXCLUDED.last_payment_date,
               total_paid=EXCLUDED.total_paid, rep_name=EXCLUDED.rep_name, completed_at=EXCLUDED.completed_at,
               updated_at=EXCLUDED.updated_at, is_edited=EXCLUDED.is_edited`,
            vals
          );
          return true;
        }
        case "UPDATE_CONTRACT": {
          if (!payload?.id) return true;
          fileDb.update("contracts", payload.id, payload);
          const fields = [];
          const vals = [];
          let idx = 1;
          const colMap = {
            customerName: "customer_name",
            customerPhone: "customer_phone",
            customerAddress: "customer_address",
            itemId: "item_id",
            itemName: "item_name",
            itemQuantity: "item_quantity",
            purchasePrice: "purchase_price",
            listId: "list_id",
            listName: "list_name",
            totalPrice: "total_price",
            advancePayment: "advance_payment",
            remainingBalance: "remaining_balance",
            dailyInstallment: "daily_installment",
            startDate: "start_date",
            notes: "notes",
            status: "status",
            lastPaymentDate: "last_payment_date",
            totalPaid: "total_paid",
            repName: "rep_name",
            completedAt: "completed_at",
            updatedAt: "updated_at",
            isEdited: "is_edited",
            customer_name: "customer_name",
            customer_phone: "customer_phone",
            customer_address: "customer_address",
            item_id: "item_id",
            item_name: "item_name",
            item_quantity: "item_quantity",
            purchase_price: "purchase_price",
            list_id: "list_id",
            list_name: "list_name",
            total_price: "total_price",
            advance_payment: "advance_payment",
            remaining_balance: "remaining_balance",
            daily_installment: "daily_installment",
            start_date: "start_date",
            last_payment_date: "last_payment_date",
            total_paid: "total_paid",
            rep_name: "rep_name",
            completed_at: "completed_at",
            updated_at: "updated_at",
            is_edited: "is_edited"
          };
          const addedCols = /* @__PURE__ */ new Set();
          for (const [k, v] of Object.entries(payload)) {
            if (k === "id") continue;
            const mappedCol = colMap[k];
            if (mappedCol && !addedCols.has(mappedCol)) {
              addedCols.add(mappedCol);
              fields.push(`${mappedCol} = $${idx++}`);
              vals.push(v);
            }
          }
          if (fields.length > 0) {
            vals.push(payload.id);
            await executePg(`UPDATE sales SET ${fields.join(", ")} WHERE id = $${idx}`, vals).catch(() => {
            });
          }
          return true;
        }
        case "DELETE_CONTRACT": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          const relPayments = await executePg(`SELECT id FROM payments WHERE contract_id = $1`, [id]).catch(() => []);
          if (Array.isArray(relPayments) && relPayments.length > 0) {
            for (const rp of relPayments) {
              if (rp?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {
                });
              }
            }
          }
          fileDb.delete("contracts", id);
          const allPay = fileDb.get("payments") || [];
          fileDb.setAll("payments", allPay.filter((p) => p.contractId !== id));
          await executePg(`DELETE FROM sales WHERE id = $1`, [id]).catch(() => {
          });
          await executePg(`DELETE FROM payments WHERE contract_id = $1`, [id]).catch(() => {
          });
          bumpSyncVersion();
          return true;
        }
        case "CREATE_PAYMENT": {
          if (!payload?.id) return true;
          const amt = Number(payload.amount ?? payload.amountPaid ?? payload.amount_paid) || 0;
          const cId = payload.contractId ?? payload.contract_id ?? "";
          const cName = payload.customerName ?? payload.customer_name ?? "";
          const pDate = payload.paymentDate ?? payload.payment_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const pNote = payload.note ?? payload.notes ?? "";
          const rName = payload.repName ?? payload.rep_name ?? "";
          const cAt = payload.createdAt ?? payload.created_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const isEd = Boolean(payload.isEdited ?? payload.is_edited);
          const resolvedFundId = await resolveFundIdForPayment(payload.fundId ?? payload.fund_id, cId);
          const saved = fileDb.upsert("payments", {
            ...payload,
            id: payload.id,
            contractId: cId,
            customerName: cName,
            amount: amt,
            amountPaid: amt,
            paymentDate: pDate,
            note: pNote,
            repName: rName,
            fundId: resolvedFundId,
            createdAt: cAt,
            isEdited: isEd
          });
          await executePg(
            `INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, note, rep_name, fund_id, created_at, is_edited)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               contract_id = EXCLUDED.contract_id,
               customer_name = EXCLUDED.customer_name,
               amount = EXCLUDED.amount,
               amount_paid = EXCLUDED.amount_paid,
               payment_date = EXCLUDED.payment_date,
               note = EXCLUDED.note,
               rep_name = EXCLUDED.rep_name,
               fund_id = EXCLUDED.fund_id,
               is_edited = EXCLUDED.is_edited`,
            [saved.id, cId, cName, amt, amt, pDate, pNote, rName, resolvedFundId, cAt, isEd]
          );
          if (resolvedFundId && amt > 0) {
            await recordPaymentFundAdjustment(saved.id, resolvedFundId, amt, cName, rName, pDate, false);
          }
          if (cId && !skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb([cId]);
          }
          return true;
        }
        case "UPDATE_PAYMENT": {
          if (!payload?.id) return true;
          let existingPayment = (fileDb.get("payments") || []).find((p) => p.id === payload.id);
          if (!existingPayment && isPgConfigured()) {
            const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [payload.id]).catch(() => []);
            if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
          }
          const oldAmt = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
          const amt = Number(payload.amount ?? payload.amountPaid ?? payload.amount_paid ?? oldAmt) || 0;
          const diff = amt - oldAmt;
          const cId = payload.contractId ?? payload.contract_id ?? existingPayment?.contractId;
          const resolvedFundId = await resolveFundIdForPayment(payload.fundId ?? payload.fund_id ?? existingPayment?.fundId, cId);
          if (resolvedFundId) {
            const cName = payload.customerName || payload.customer_name || existingPayment?.customerName || "";
            const rName = payload.repName || payload.rep_name || existingPayment?.repName || "";
            const pDate = payload.paymentDate || payload.payment_date || existingPayment?.paymentDate || "";
            await recordPaymentFundAdjustment(payload.id, resolvedFundId, amt, cName, rName, pDate, false);
          }
          fileDb.update("payments", payload.id, { ...payload, amount: amt, amountPaid: amt, fundId: resolvedFundId || payload.fundId });
          await executePg(
            `UPDATE payments SET amount = COALESCE($1, amount), amount_paid = COALESCE($1, amount_paid), note = COALESCE($2, note), payment_date = COALESCE($3, payment_date), rep_name = COALESCE($4, rep_name), fund_id = COALESCE($5, fund_id) WHERE id = $6`,
            [amt, payload.note ?? payload.notes, payload.paymentDate ?? payload.payment_date, payload.repName ?? payload.rep_name, resolvedFundId, payload.id]
          );
          if (cId && !skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb([cId]);
          }
          return true;
        }
        case "DELETE_PAYMENT": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          let existingPayment = (fileDb.get("payments") || []).find((p) => p.id === id);
          if (!existingPayment && isPgConfigured()) {
            const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
            if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
          }
          const contractId = payload?.contractId || payload?.contract_id || existingPayment?.contractId || existingPayment?.contract_id;
          const amt = Number(payload?.amountPaid ?? payload?.amount ?? existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
          const fundId = payload?.fundId || payload?.fund_id || existingPayment?.fundId;
          const resolvedFundId = await resolveFundIdForPayment(fundId, contractId, payload?.customerName || existingPayment?.customerName);
          if (resolvedFundId && amt > 0) {
            await recordPaymentFundAdjustment(
              id,
              resolvedFundId,
              amt,
              existingPayment?.customerName || payload?.customerName || "",
              existingPayment?.repName || payload?.repName || "",
              existingPayment?.paymentDate || payload?.paymentDate || "",
              true
            );
          }
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("payments", id);
          await executePg(`DELETE FROM payments WHERE id = $1`, [id]).catch(() => {
          });
          if (contractId) {
            await syncContractBalancesInPgAndFileDb([contractId]);
          } else if (!skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb();
          }
          return true;
        }
        case "CREATE_INVENTORY":
        case "UPDATE_INVENTORY": {
          if (!payload?.id) return true;
          const items = fileDb.get("inventory_items");
          const existing = items.find((i) => i.id === payload.id) || {};
          const merged = { ...existing, ...payload };
          const saved = fileDb.upsert("inventory_items", merged);
          const itemName = saved.name && saved.name.trim() ? saved.name : merged.name && merged.name.trim() ? merged.name : "\u0645\u0627\u062F\u0629";
          await executePg(
            `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, price = EXCLUDED.price, purchase_price = EXCLUDED.purchase_price,
               quantity = EXCLUDED.quantity, daily_installment = EXCLUDED.daily_installment, category = EXCLUDED.category`,
            [saved.id, itemName, saved.price ?? 0, saved.purchasePrice ?? 0, saved.quantity ?? 0, saved.dailyInstallment ?? 0, saved.category || "", saved.createdAt || (/* @__PURE__ */ new Date()).toISOString()]
          );
          return true;
        }
        case "DELETE_INVENTORY": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'inventory') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("inventory_items", id);
          await executePg(`DELETE FROM inventory_items WHERE id = $1`, [id]).catch(() => {
          });
          await executePg(`DELETE FROM inventory WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_REP":
        case "UPDATE_REP": {
          if (!payload?.id) return true;
          const id = payload.id;
          let existing = (fileDb.get("reps") || []).find((r) => r.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM reps WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = mapRepRow(rows[0]);
              }
            } catch (e) {
            }
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const repName = merged.name || payload.name || existing?.name || payload.repName || id || "\u0645\u0646\u062F\u0648\u0628";
          const saved = fileDb.upsert("reps", { ...merged, name: repName });
          if (isPgConfigured()) {
            await executePg(
              `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids, avatar_url)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (id) DO UPDATE SET
                 name = COALESCE(NULLIF(EXCLUDED.name, ''), reps.name),
                 phone = COALESCE(NULLIF(EXCLUDED.phone, ''), reps.phone),
                 code = COALESCE(NULLIF(EXCLUDED.code, ''), reps.code),
                 role = COALESCE(NULLIF(EXCLUDED.role, ''), reps.role),
                 can_edit = COALESCE(EXCLUDED.can_edit, reps.can_edit),
                 can_delete = COALESCE(EXCLUDED.can_delete, reps.can_delete),
                 can_move_customer = COALESCE(EXCLUDED.can_move_customer, reps.can_move_customer),
                 can_sell = COALESCE(EXCLUDED.can_sell, reps.can_sell),
                 allowed_list_ids = COALESCE(EXCLUDED.allowed_list_ids, reps.allowed_list_ids),
                 avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), reps.avatar_url)`,
              [
                saved.id,
                repName,
                saved.phone || "",
                saved.code || "0000",
                saved.role || "rep",
                saved.canEdit !== false,
                saved.canDelete !== false,
                saved.canMoveCustomer !== false,
                saved.canSell !== false,
                Array.isArray(saved.allowedListIds) ? JSON.stringify(saved.allowedListIds) : saved.allowedListIds || '["all"]',
                saved.avatarUrl || ""
              ]
            ).catch((err) => console.warn("Error upserting rep in PG sync:", err));
          }
          return true;
        }
        case "DELETE_REP": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'reps') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("reps", id);
          await executePg(`DELETE FROM reps WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_FUND":
        case "UPDATE_FUND": {
          if (!payload?.id) return true;
          const id = payload.id;
          const name = payload.name || "";
          const balance = Number(payload.balance ?? payload.remainingCapital ?? 0);
          const description = payload.description || payload.notes || "";
          const createdAt = payload.createdAt || (/* @__PURE__ */ new Date()).toISOString();
          fileDb.upsert("cash_funds", { id, name, balance, description, createdAt });
          await executePg(
            `INSERT INTO cash_funds (id, name, balance, description, created_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, balance = EXCLUDED.balance, description = EXCLUDED.description`,
            [id, name, balance, description, createdAt]
          ).catch(() => {
          });
          return true;
        }
        case "DELETE_FUND": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'cash_funds') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("cash_funds", id);
          await executePg(`DELETE FROM cash_funds WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_CUSTOMER_LIST":
        case "UPDATE_CUSTOMER_LIST": {
          if (!payload?.id) return true;
          const id = payload.id;
          let existing = (fileDb.get("customer_lists") || []).find((l) => l.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM customer_lists WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = rows[0];
              }
            } catch (e) {
            }
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const listName = (merged.name || payload.name || existing?.name || payload.listName || payload.list_name || payload.title || "").trim() || "\u0642\u0627\u0626\u0645\u0629 \u0628\u062F\u0648\u0646 \u0627\u0633\u0645";
          const fundId = merged.fundId || payload.fundId || merged.fund_id || payload.fund_id || null;
          const description = merged.description || payload.description || "";
          const color = merged.color || payload.color || "#3b82f6";
          const createdAt = merged.createdAt || payload.createdAt || (/* @__PURE__ */ new Date()).toISOString();
          const saved = fileDb.upsert("customer_lists", { ...merged, id, name: listName, fundId, description, color, createdAt });
          await executePg(
            `INSERT INTO customer_lists (id, name, description, color, fund_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET
               name = COALESCE(NULLIF(EXCLUDED.name, ''), customer_lists.name),
               description = COALESCE(EXCLUDED.description, customer_lists.description),
               color = COALESCE(EXCLUDED.color, customer_lists.color),
               fund_id = COALESCE(EXCLUDED.fund_id, customer_lists.fund_id)`,
            [id, listName, description, color, fundId, createdAt]
          ).catch((err) => console.warn("Error upserting customer list in PG sync:", err));
          return true;
        }
        case "DELETE_CUSTOMER_LIST": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customer_lists') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("customer_lists", id);
          await executePg(`DELETE FROM customer_lists WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_EMPLOYEE":
        case "UPDATE_EMPLOYEE": {
          if (!payload?.id) return true;
          const id = payload.id;
          let existing = (fileDb.get("employees") || []).find((e) => e.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM employees WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = rows[0];
              }
            } catch (e) {
            }
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const empName = (merged.name || payload.name || existing?.name || payload.employeeName || payload.empName || payload.repName || "").trim() || "\u0645\u0648\u0638\u0641 \u0628\u062F\u0648\u0646 \u0627\u0633\u0645";
          const phone = merged.phone || payload.phone || "";
          const jobTitle = merged.jobTitle || payload.jobTitle || merged.job_title || payload.job_title || merged.position || payload.position || "";
          const position = merged.position || payload.position || jobTitle;
          const salary = Number(merged.salary ?? payload.salary ?? 0) || 0;
          const debtBalance = Number(merged.debtBalance ?? payload.debtBalance ?? merged.debt_balance ?? payload.debt_balance ?? 0) || 0;
          const totalDebt = Number(merged.totalDebt ?? payload.totalDebt ?? merged.total_debt ?? payload.total_debt ?? 0) || 0;
          const isRep = Boolean(merged.isRep ?? payload.isRep ?? merged.is_rep ?? payload.is_rep);
          const repId = merged.repId || payload.repId || merged.rep_id || payload.rep_id || null;
          const createdAt = merged.createdAt || payload.createdAt || (/* @__PURE__ */ new Date()).toISOString();
          const saved = fileDb.upsert("employees", {
            ...merged,
            id,
            name: empName,
            phone,
            jobTitle,
            position,
            salary,
            debtBalance,
            totalDebt,
            isRep,
            repId,
            createdAt
          });
          await executePg(
            `INSERT INTO employees (id, name, phone, job_title, position, salary, debt_balance, total_debt, is_rep, rep_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               name = COALESCE(NULLIF(EXCLUDED.name, ''), employees.name),
               phone = COALESCE(EXCLUDED.phone, employees.phone),
               job_title = COALESCE(EXCLUDED.job_title, employees.job_title),
               position = COALESCE(EXCLUDED.position, employees.position),
               salary = COALESCE(EXCLUDED.salary, employees.salary),
               debt_balance = COALESCE(EXCLUDED.debt_balance, employees.debt_balance),
               total_debt = COALESCE(EXCLUDED.total_debt, employees.total_debt),
               is_rep = COALESCE(EXCLUDED.is_rep, employees.is_rep),
               rep_id = COALESCE(EXCLUDED.rep_id, employees.rep_id)`,
            [id, empName, phone, jobTitle, position, salary, debtBalance, totalDebt, isRep, repId, createdAt]
          ).catch((err) => console.warn("Error upserting employee in PG sync:", err));
          return true;
        }
        case "DELETE_EMPLOYEE": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employees') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("employees", id);
          await executePg(`DELETE FROM employees WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_FUND_TX":
        case "CREATE_FUND_TRANSACTION": {
          if (!payload?.id) return true;
          const id = payload.id;
          const fundId = payload.fundId || payload.fund_id || "";
          const targetFundId = payload.targetFundId || payload.target_fund_id || null;
          const type2 = payload.type || "deposit";
          const amount = Number(payload.amount) || 0;
          const note = payload.note || payload.description || "";
          const repName = payload.repName || payload.rep_name || "";
          const createdAt = payload.createdAt || payload.created_at || (/* @__PURE__ */ new Date()).toISOString();
          fileDb.upsert("fund_transactions", { id, fundId, targetFundId, type: type2, amount, note, repName, createdAt });
          await executePg(
            `INSERT INTO fund_transactions (id, fund_id, target_fund_id, type, amount, note, rep_name, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               fund_id = EXCLUDED.fund_id, target_fund_id = EXCLUDED.target_fund_id, type = EXCLUDED.type,
               amount = EXCLUDED.amount, note = EXCLUDED.note, rep_name = EXCLUDED.rep_name`,
            [id, fundId, targetFundId, type2, amount, note, repName, createdAt]
          );
          if (!skipBalanceRecalc) {
            if (type2 === "transfer") {
              if (fundId) await adjustFundBalance(fundId, -amount);
              if (targetFundId) await adjustFundBalance(targetFundId, +amount);
            } else if (type2 === "withdraw" || type2 === "expense" || type2 === "employee_loan") {
              if (fundId) await adjustFundBalance(fundId, -amount);
            } else if (type2 === "deposit" || type2 === "employee_repay") {
              if (fundId) await adjustFundBalance(fundId, +amount);
            }
          }
          return true;
        }
        case "UPDATE_FUND_TRANSACTION": {
          if (!payload?.id) return true;
          const id = payload.id;
          const existing = (fileDb.get("fund_transactions") || []).find((x) => x.id === id);
          const oldAmount = existing ? Number(existing.amount) || 0 : 0;
          const newAmount = payload.amount !== void 0 ? Number(payload.amount) || 0 : oldAmount;
          const diff = newAmount - oldAmount;
          const type2 = payload.type || existing?.type || "deposit";
          const fundId = payload.fundId || existing?.fundId || payload.fund_id;
          const targetFundId = payload.targetFundId || existing?.targetFundId || payload.target_fund_id;
          const note = payload.note !== void 0 ? payload.note : existing?.note || "";
          fileDb.update("fund_transactions", id, { ...existing, ...payload, amount: newAmount, note });
          await executePg(
            `UPDATE fund_transactions SET amount = COALESCE($1, amount), note = COALESCE($2, note) WHERE id = $3`,
            [newAmount, note, id]
          ).catch(() => {
          });
          if (diff !== 0 && !skipBalanceRecalc) {
            if (type2 === "transfer") {
              if (fundId) await adjustFundBalance(fundId, -diff);
              if (targetFundId) await adjustFundBalance(targetFundId, +diff);
            } else if (type2 === "withdraw" || type2 === "expense" || type2 === "employee_loan") {
              if (fundId) await adjustFundBalance(fundId, -diff);
            } else if (type2 === "deposit" || type2 === "employee_repay") {
              if (fundId) await adjustFundBalance(fundId, +diff);
            }
          }
          return true;
        }
        case "DELETE_FUND_TX":
        case "DELETE_FUND_TRANSACTION": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          const existing = (fileDb.get("fund_transactions") || []).find((x) => x.id === id);
          if (existing && existing.amount && !skipBalanceRecalc) {
            const amount = Number(existing.amount) || 0;
            const type2 = existing.type;
            const fundId = existing.fundId || existing.fund_id;
            const targetFundId = existing.targetFundId || existing.target_fund_id;
            if (type2 === "transfer") {
              if (fundId) await adjustFundBalance(fundId, +amount);
              if (targetFundId) await adjustFundBalance(targetFundId, -amount);
            } else if (type2 === "withdraw" || type2 === "expense" || type2 === "employee_loan") {
              if (fundId) await adjustFundBalance(fundId, +amount);
            } else if (type2 === "deposit" || type2 === "employee_repay") {
              if (fundId) await adjustFundBalance(fundId, -amount);
            }
          }
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("fund_transactions", id);
          await executePg(`DELETE FROM fund_transactions WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_EMPLOYEE_TX":
        case "CREATE_EMPLOYEE_TRANSACTION":
        case "UPDATE_EMPLOYEE_TRANSACTION": {
          if (!payload?.id) return true;
          const id = payload.id;
          const empId = payload.employeeId || payload.employee_id || "";
          const fundId = payload.fundId || payload.fund_id || "fund-1";
          const repName = payload.repName || payload.rep_name || "";
          const type2 = payload.type || "loan";
          const amount = Number(payload.amount) || 0;
          const notes = payload.notes || payload.note || "";
          const txDate = payload.date || payload.createdAt?.split("T")[0] || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const createdAt = payload.createdAt || payload.created_at || (/* @__PURE__ */ new Date()).toISOString();
          const saved = fileDb.upsert("employee_transactions", {
            ...payload,
            id,
            employeeId: empId,
            fundId,
            repName,
            type: type2,
            amount,
            notes,
            note: notes,
            date: txDate,
            createdAt
          });
          await executePg(
            `INSERT INTO employee_transactions (id, employee_id, rep_name, type, amount, notes, note, date, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (id) DO UPDATE SET
               amount = EXCLUDED.amount, type = EXCLUDED.type, notes = EXCLUDED.notes`,
            [id, empId, repName, type2, amount, notes, notes, txDate, createdAt]
          ).catch((err) => console.warn("Error inserting employee_tx in PG sync:", err));
          return true;
        }
        case "DELETE_EMPLOYEE_TX":
        case "DELETE_EMPLOYEE_TRANSACTION": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employee_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {
          });
          fileDb.delete("employee_transactions", id);
          await executePg(`DELETE FROM employee_transactions WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        case "CREATE_PAYMENT_CONFLICT": {
          if (!payload?.id) return true;
          fileDb.upsert("payment_conflicts", payload);
          await executePg(
            `INSERT INTO payment_conflicts (id, contract_id, customer_name, attempted_amount, actual_remaining_balance, excess_amount, accepted_amount, rep_name, note, payment_date, created_at, status, resolved_by, resolved_at, resolution_note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               excess_amount = EXCLUDED.excess_amount,
               accepted_amount = EXCLUDED.accepted_amount,
               resolved_by = EXCLUDED.resolved_by,
               resolved_at = EXCLUDED.resolved_at,
               resolution_note = EXCLUDED.resolution_note`,
            [
              payload.id,
              payload.contractId || payload.contract_id || "",
              payload.customerName || payload.customer_name || "",
              Number(payload.attemptedAmount || payload.attempted_amount) || 0,
              Number(payload.actualRemainingBalance || payload.actual_remaining_balance) || 0,
              Number(payload.excessAmount || payload.excess_amount) || 0,
              Number(payload.acceptedAmount || payload.accepted_amount) || 0,
              payload.repName || payload.rep_name || "",
              payload.note || "",
              payload.paymentDate || payload.payment_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
              payload.createdAt || payload.created_at || (/* @__PURE__ */ new Date()).toISOString(),
              payload.status || "pending_review",
              payload.resolvedBy || payload.resolved_by || null,
              payload.resolvedAt || payload.resolved_at || null,
              payload.resolutionNote || payload.resolution_note || null
            ]
          ).catch((err) => console.warn("Error inserting payment_conflict in sync:", err));
          return true;
        }
        case "RESOLVE_PAYMENT_CONFLICT": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          const status = payload?.status || "resolved";
          const resolvedBy = payload?.resolvedBy || payload?.resolved_by || "\u0627\u0644\u0645\u062F\u064A\u0631";
          const resolvedAt = payload?.resolvedAt || payload?.resolved_at || (/* @__PURE__ */ new Date()).toISOString();
          const resolutionNote = payload?.resolutionNote || payload?.resolution_note || "";
          const acceptedAmount = Number(payload?.acceptedAmount || payload?.accepted_amount) || 0;
          const excessAmount = Number(payload?.excessAmount || payload?.excess_amount) || 0;
          fileDb.update("payment_conflicts", id, { ...payload, status, resolvedBy, resolvedAt, resolutionNote, acceptedAmount, excessAmount });
          await executePg(
            `UPDATE payment_conflicts SET
               status = $1,
               resolved_by = $2,
               resolved_at = $3,
               resolution_note = $4,
               accepted_amount = $5,
               excess_amount = $6
             WHERE id = $7`,
            [status, resolvedBy, resolvedAt, resolutionNote, acceptedAmount, excessAmount, id]
          ).catch(() => {
          });
          return true;
        }
        case "REJECT_PAYMENT_CONFLICT":
        case "DELETE_PAYMENT_CONFLICT": {
          const id = typeof payload === "string" ? payload : payload?.id;
          if (!id) return true;
          fileDb.delete("payment_conflicts", id);
          await executePg(`DELETE FROM payment_conflicts WHERE id = $1`, [id]).catch(() => {
          });
          return true;
        }
        default:
          return true;
      }
    } catch (e) {
      console.warn("Process sync action error:", action?.type, e);
      return false;
    }
  }
  app.get("/api/deleted-records", async (req, res) => {
    try {
      if (isPgConfigured()) {
        const rows = await executePg("SELECT record_id, table_name, deleted_at FROM deleted_records ORDER BY deleted_at DESC LIMIT 5000").catch(() => []);
        return res.json(rows || []);
      }
      res.json([]);
    } catch (e) {
      res.json([]);
    }
  });
  app.get("/api/sync/all", async (req, res) => {
    try {
      if (isPgConfigured()) {
        await cleanupDuplicateEntities().catch(() => {
        });
        if (req.query.audit === "true" || req.query.force_recalc === "true") {
          await syncContractBalancesInPgAndFileDb().catch(() => {
          });
        }
        await executePg("DELETE FROM deleted_records WHERE record_id = 'rep-1' OR record_id IN (SELECT id FROM reps WHERE name LIKE '%\u0636\u064A\u0627\u0621%')").catch(() => {
        });
        await executePg(`
          INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
          VALUES ('rep-1', '\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628', '07801112233', '4444', 'admin', true, true, true, true, '["all"]')
          ON CONFLICT (id) DO UPDATE SET name = '\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628', code = '4444', role = 'admin', can_edit = true, can_delete = true, can_move_customer = true, can_sell = true, allowed_list_ids = '["all"]'
        `).catch(() => {
        });
        const [
          contractsRows,
          paymentsRows,
          inventoryRows,
          repsRows,
          fundsRows,
          customerListsRows,
          employeesRows,
          fundTxRows,
          employeeTxRows,
          conflictsRows,
          deletedRows
        ] = await Promise.all([
          executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts' OR dr.table_name = 'unknown'))
            ORDER BY c.created_at ASC, c.id ASC
          `).catch(() => []),
          executePg(`
            SELECT p.*
            FROM payments p
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
          `).catch(() => []),
          executePg(`
            SELECT * FROM inventory_items
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'inventory_items' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM reps
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND dr.record_id != 'rep-1' AND (dr.table_name = 'reps' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM cash_funds
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'cash_funds' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM customer_lists
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'customer_lists' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM employees
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'employees' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM fund_transactions
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'fund_transactions' OR dr.table_name = 'unknown'))
            ORDER BY created_at DESC
          `).catch(() => []),
          executePg(`
            SELECT * FROM employee_transactions
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'employee_transactions' OR dr.table_name = 'unknown'))
            ORDER BY created_at DESC
          `).catch(() => []),
          executePg(`SELECT * FROM payment_conflicts WHERE status = 'pending_review' ORDER BY created_at DESC`).catch(() => []),
          executePg(`SELECT record_id FROM deleted_records ORDER BY deleted_at DESC LIMIT 5000`).catch(() => [])
        ]);
        const contracts = (contractsRows || []).map(mapContractRow);
        const payments2 = (paymentsRows || []).map(mapPaymentRow);
        const inventory = (inventoryRows || []).map(mapInventoryRow);
        const reps2 = (repsRows || []).map(mapRepRow);
        if (!reps2.some((r) => r.id === "rep-1" || r.name && r.name.includes("\u0636\u064A\u0627\u0621"))) {
          reps2.unshift({
            id: "rep-1",
            name: "\u0636\u064A\u0627\u0621 \u0627\u0644\u0645\u062D\u0627\u0633\u0628",
            phone: "07801112233",
            code: "4444",
            role: "admin",
            canEdit: true,
            canDelete: true,
            canMoveCustomer: true,
            canSell: true,
            allowedListIds: ["all"],
            avatarUrl: ""
          });
        }
        const funds = (fundsRows || []).map((r) => ({
          id: r.id,
          name: r.name,
          balance: Number(r.balance) || 0,
          description: r.description || "",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        const customerLists2 = (customerListsRows || []).map((r) => ({
          id: r.id,
          name: r.name,
          fundId: r.fund_id || "",
          description: r.description || "",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        const employees2 = (employeesRows || []).map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone || "",
          jobTitle: r.job_title || "",
          position: r.position || "",
          salary: Number(r.salary) || 0,
          debtBalance: Number(r.debt_balance) || 0,
          totalDebt: Number(r.total_debt) || 0,
          isRep: Boolean(r.is_rep),
          repId: r.rep_id || null,
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        const fundTransactions2 = (fundTxRows || []).map((r) => ({
          id: r.id,
          fundId: r.fund_id,
          targetFundId: r.target_fund_id || null,
          type: r.type,
          amount: Number(r.amount) || 0,
          note: r.note || "",
          repName: r.rep_name || "",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        const employeeTransactions2 = (employeeTxRows || []).map((r) => ({
          id: r.id,
          employeeId: r.employee_id,
          fundId: r.fund_id || "",
          type: r.type,
          amount: Number(r.amount) || 0,
          notes: r.notes || "",
          repName: r.rep_name || "",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString()
        }));
        const paymentConflicts2 = (conflictsRows || []).map((r) => ({
          id: r.id,
          contractId: r.contract_id,
          customerName: r.customer_name || "",
          attemptedAmount: Number(r.attempted_amount) || 0,
          actualRemainingBalance: Number(r.actual_remaining_balance) || 0,
          excessAmount: Number(r.excess_amount) || 0,
          repName: r.rep_name || "",
          note: r.note || "",
          paymentDate: r.payment_date || "",
          createdAt: r.created_at || (/* @__PURE__ */ new Date()).toISOString(),
          status: r.status || "pending_review"
        }));
        const deletedRecordIds = (deletedRows || []).map((r) => r.record_id);
        return res.json({
          success: true,
          serverTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
          contracts,
          payments: payments2,
          inventory,
          reps: reps2,
          funds,
          customerLists: customerLists2,
          employees: employees2,
          fundTransactions: fundTransactions2,
          employeeTransactions: employeeTransactions2,
          paymentConflicts: paymentConflicts2,
          deletedRecordIds
        });
      }
      res.json({
        success: true,
        serverTimestamp: (/* @__PURE__ */ new Date()).toISOString(),
        contracts: fileDb.get("contracts") || [],
        payments: fileDb.get("payments") || [],
        inventory: fileDb.get("inventory") || [],
        reps: fileDb.get("reps") || [],
        funds: fileDb.get("funds") || [],
        customerLists: fileDb.get("customer_lists") || [],
        employees: fileDb.get("employees") || [],
        fundTransactions: fileDb.get("fund_transactions") || [],
        employeeTransactions: fileDb.get("employee_transactions") || [],
        paymentConflicts: fileDb.get("payment_conflicts") || [],
        deletedRecordIds: []
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/sync/batch", async (req, res) => {
    try {
      const actions = Array.isArray(req.body?.actions) ? req.body.actions : Array.isArray(req.body) ? req.body : [];
      if (actions.length === 0) {
        return res.json({ success: true, processedIds: [], totalCount: 0 });
      }
      const candidateIds = actions.map((a) => a?.payload?.id || (typeof a?.payload === "string" ? a.payload : null)).filter(Boolean);
      let deletedSet = /* @__PURE__ */ new Set();
      if (candidateIds.length > 0) {
        const deletedRows = await executePg(
          `SELECT record_id FROM deleted_records WHERE record_id = ANY($1)`,
          [candidateIds]
        ).catch(() => []);
        if (Array.isArray(deletedRows)) {
          deletedSet = new Set(deletedRows.map((r) => r.record_id));
        }
      }
      const processedIds = [];
      const affectedContractIds = /* @__PURE__ */ new Set();
      const paymentActions = [];
      const contractActions = [];
      const otherActions = [];
      for (const act of actions) {
        const targetId = act?.payload?.id || (typeof act?.payload === "string" ? act?.payload : null);
        const isDelete = act?.type?.startsWith("DELETE_");
        if (!isDelete && targetId && deletedSet.has(targetId)) {
          if (act?.id) processedIds.push(act.id);
          continue;
        }
        if (act?.type === "CREATE_PAYMENT" || act?.type === "UPDATE_PAYMENT") {
          paymentActions.push(act);
        } else if (act?.type === "CREATE_CONTRACT") {
          contractActions.push(act);
        } else {
          otherActions.push(act);
        }
      }
      if (paymentActions.length > 0) {
        const paymentRows = paymentActions.map((act) => {
          const p = act.payload || {};
          const amt = Number(p.amount ?? p.amountPaid ?? p.amount_paid) || 0;
          const cId = p.contractId ?? p.contract_id ?? "";
          const cName = p.customerName ?? p.customer_name ?? "";
          const pDate = p.paymentDate ?? p.payment_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const pNote = p.note ?? p.notes ?? "";
          const rName = p.repName ?? p.rep_name ?? "";
          const fId = p.fundId ?? p.fund_id ?? null;
          const cAt = p.createdAt ?? p.created_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const isEd = Boolean(p.isEdited ?? p.is_edited);
          if (cId) affectedContractIds.add(cId);
          try {
            fileDb.upsert("payments", {
              id: p.id,
              contractId: cId,
              customerName: cName,
              amount: amt,
              amountPaid: amt,
              paymentDate: pDate,
              note: pNote,
              repName: rName,
              fundId: fId,
              createdAt: cAt,
              isEdited: isEd
            });
          } catch (e) {
          }
          return {
            id: String(p.id),
            contract_id: String(cId),
            customer_name: String(cName),
            amount: amt,
            amount_paid: amt,
            payment_date: String(pDate),
            note: String(pNote),
            rep_name: String(rName),
            fund_id: fId ? String(fId) : null,
            created_at: String(cAt),
            is_edited: isEd
          };
        }).filter((r) => r.id);
        const uniquePaymentRowsMap = /* @__PURE__ */ new Map();
        for (const row of paymentRows) {
          if (row && row.id) {
            uniquePaymentRowsMap.set(row.id, row);
          }
        }
        const dedupedPaymentRows = Array.from(uniquePaymentRowsMap.values());
        if (dedupedPaymentRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO payments (
                id, contract_id, customer_name, amount, amount_paid,
                payment_date, note, rep_name, fund_id, created_at, is_edited
              )
              SELECT
                x.id,
                x.contract_id,
                x.customer_name,
                COALESCE(x.amount, 0),
                COALESCE(x.amount_paid, x.amount, 0),
                x.payment_date,
                x.note,
                x.rep_name,
                x.fund_id,
                COALESCE(x.created_at, NOW()::text),
                COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text,
                contract_id text,
                customer_name text,
                amount double precision,
                amount_paid double precision,
                payment_date text,
                note text,
                rep_name text,
                fund_id text,
                created_at text,
                is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                contract_id = EXCLUDED.contract_id,
                customer_name = EXCLUDED.customer_name,
                amount = EXCLUDED.amount,
                amount_paid = EXCLUDED.amount_paid,
                payment_date = EXCLUDED.payment_date,
                note = EXCLUDED.note,
                rep_name = EXCLUDED.rep_name,
                fund_id = EXCLUDED.fund_id,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedPaymentRows)]);
            for (const row of dedupedPaymentRows) {
              if (row.amount > 0) {
                const targetFundId = await resolveFundIdForPayment(row.fund_id, row.contract_id);
                if (targetFundId) {
                  await recordPaymentFundAdjustment(
                    row.id,
                    targetFundId,
                    row.amount,
                    row.customer_name || "",
                    row.rep_name || "",
                    row.payment_date || "",
                    false
                  ).catch(() => {
                  });
                }
              }
            }
            for (const act of paymentActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkPayErr) {
            console.warn("[Batch Sync] Bulk payment upsert error, running per-item fallback:", bulkPayErr);
            for (const act of paymentActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {
              }
            }
          }
        }
      }
      if (contractActions.length > 0) {
        const contractRows = contractActions.map((act) => {
          const c = act.payload || {};
          const totalPrice = Number(c.totalPrice ?? c.total_price) || 0;
          const adv = Number(c.advancePayment ?? c.advance_payment) || 0;
          const paid = Number(c.totalPaid ?? c.total_paid) || 0;
          const rem = Math.max(0, totalPrice - adv - paid);
          const daily = Number(c.dailyInstallment ?? c.daily_installment) || 0;
          const stat = rem <= 0 ? "completed" : c.status || "active";
          if (c.id) affectedContractIds.add(c.id);
          try {
            fileDb.upsert("contracts", {
              ...c,
              totalPrice,
              advancePayment: adv,
              totalPaid: paid,
              remainingBalance: rem,
              dailyInstallment: daily,
              status: stat
            });
          } catch (e) {
          }
          return {
            id: String(c.id),
            customer_name: String(c.customerName ?? c.customer_name ?? ""),
            customer_phone: String(c.customerPhone ?? c.customer_phone ?? ""),
            customer_address: c.customerAddress ?? c.customer_address ?? null,
            item_id: c.itemId ?? c.item_id ?? null,
            item_name: String(c.itemName ?? c.item_name ?? ""),
            item_quantity: Number(c.itemQuantity ?? c.item_quantity) || 1,
            purchase_price: Number(c.purchasePrice ?? c.purchase_price) || 0,
            list_id: c.listId ?? c.list_id ?? null,
            list_name: c.listName ?? c.list_name ?? null,
            total_price: totalPrice,
            advance_payment: adv,
            remaining_balance: rem,
            daily_installment: daily,
            start_date: String(c.startDate ?? c.start_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0]),
            notes: c.notes ?? null,
            status: stat,
            last_payment_date: c.lastPaymentDate ?? c.last_payment_date ?? null,
            total_paid: paid,
            rep_name: c.repName ?? c.rep_name ?? null,
            created_at: String(c.createdAt ?? c.created_at ?? (/* @__PURE__ */ new Date()).toISOString()),
            completed_at: c.completedAt ?? c.completed_at ?? null,
            updated_at: c.updatedAt ?? c.updated_at ?? (/* @__PURE__ */ new Date()).toISOString(),
            is_edited: Boolean(c.isEdited ?? c.is_edited)
          };
        }).filter((r) => r.id);
        const uniqueContractRowsMap = /* @__PURE__ */ new Map();
        for (const row of contractRows) {
          if (row && row.id) {
            uniqueContractRowsMap.set(row.id, row);
          }
        }
        const dedupedContractRows = Array.from(uniqueContractRowsMap.values());
        if (dedupedContractRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO sales (
                id, customer_name, customer_phone, customer_address,
                item_id, item_name, item_quantity, purchase_price,
                list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes,
                status, last_payment_date, total_paid, rep_name,
                created_at, completed_at, updated_at, is_edited
              )
              SELECT
                x.id, x.customer_name, x.customer_phone, x.customer_address,
                x.item_id, x.item_name, COALESCE(x.item_quantity, 1), COALESCE(x.purchase_price, 0),
                x.list_id, x.list_name, COALESCE(x.total_price, 0), COALESCE(x.advance_payment, 0),
                COALESCE(x.remaining_balance, 0), COALESCE(x.daily_installment, 0), COALESCE(x.start_date, NOW()::date::text), x.notes,
                COALESCE(x.status, 'active'), x.last_payment_date, COALESCE(x.total_paid, 0), x.rep_name,
                COALESCE(x.created_at, NOW()::text), x.completed_at, x.updated_at, COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text, customer_name text, customer_phone text, customer_address text,
                item_id text, item_name text, item_quantity integer, purchase_price double precision,
                list_id text, list_name text, total_price double precision, advance_payment double precision,
                remaining_balance double precision, daily_installment double precision, start_date text, notes text,
                status text, last_payment_date text, total_paid double precision, rep_name text,
                created_at text, completed_at text, updated_at text, is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), sales.customer_name),
                customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), sales.customer_phone),
                customer_address = COALESCE(EXCLUDED.customer_address, sales.customer_address),
                item_id = COALESCE(EXCLUDED.item_id, sales.item_id),
                item_name = COALESCE(NULLIF(EXCLUDED.item_name, ''), sales.item_name),
                item_quantity = CASE WHEN EXCLUDED.item_quantity > 0 THEN EXCLUDED.item_quantity ELSE sales.item_quantity END,
                purchase_price = CASE WHEN EXCLUDED.purchase_price > 0 THEN EXCLUDED.purchase_price ELSE sales.purchase_price END,
                list_id = COALESCE(EXCLUDED.list_id, sales.list_id),
                list_name = COALESCE(EXCLUDED.list_name, sales.list_name),
                total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE sales.total_price END,
                advance_payment = CASE WHEN EXCLUDED.advance_payment > 0 THEN EXCLUDED.advance_payment ELSE sales.advance_payment END,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = CASE WHEN EXCLUDED.daily_installment > 0 THEN EXCLUDED.daily_installment ELSE sales.daily_installment END,
                start_date = COALESCE(NULLIF(EXCLUDED.start_date, ''), sales.start_date),
                notes = COALESCE(EXCLUDED.notes, sales.notes),
                status = EXCLUDED.status,
                last_payment_date = COALESCE(EXCLUDED.last_payment_date, sales.last_payment_date),
                total_paid = EXCLUDED.total_paid,
                rep_name = COALESCE(NULLIF(EXCLUDED.rep_name, ''), sales.rep_name),
                completed_at = COALESCE(EXCLUDED.completed_at, sales.completed_at),
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedContractRows)]);
            for (const act of contractActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkContractErr) {
            console.warn("[Batch Sync] Bulk contract upsert error, running per-item fallback:", bulkContractErr);
            for (const act of contractActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {
              }
            }
          }
        }
      }
      if (otherActions.length > 0) {
        for (const act of otherActions) {
          try {
            if (act?.type === "DELETE_PAYMENT") {
              const pContractId = act.payload?.contractId || act.payload?.contract_id;
              if (pContractId) affectedContractIds.add(pContractId);
            }
            const ok = await processSingleSyncAction(act, true);
            if (ok && act?.id) {
              processedIds.push(act.id);
            }
          } catch (actErr) {
            console.warn("[Batch Sync] Other action error:", act?.id, actErr);
          }
        }
      }
      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        try {
          await executePg(`
            UPDATE sales c
            SET
              total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
              status = CASE
                WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
                ELSE 'active'
              END
            FROM (
              SELECT contract_id, SUM(COALESCE(amount_paid, amount, 0)) as sum_paid
              FROM payments
              WHERE contract_id = ANY($1)
              GROUP BY contract_id
            ) p
            WHERE c.id = p.contract_id AND c.id = ANY($1)
          `, [cIds]).catch(() => {
          });
          await executePg(`
            UPDATE sales c
            SET
              total_paid = 0,
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment),
              status = CASE WHEN (c.total_price - c.advance_payment) <= 0 THEN 'completed' ELSE 'active' END
            WHERE c.id = ANY($1) AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE p.contract_id = c.id OR ((p.contract_id IS NULL OR p.contract_id = '') AND p.customer_name = c.customer_name)
            )
          `, [cIds]).catch(() => {
          });
        } catch (balErr) {
          console.warn("Batch balance recalc notice:", balErr);
        }
        await syncContractBalancesInPgAndFileDb(cIds).catch(() => {
        });
      }
      bumpSyncVersion();
      res.json({ success: true, processedIds, totalCount: actions.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/sync/reconcile", async (req, res) => {
    try {
      const payload = req.body || {};
      let totalInserted = 0;
      const affectedContractIds = /* @__PURE__ */ new Set();
      if (Array.isArray(payload.deletedIds) && payload.deletedIds.length > 0) {
        const delIds = payload.deletedIds.filter(Boolean);
        if (delIds.length > 0) {
          await executePg(`INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'unknown' ON CONFLICT (record_id) DO NOTHING`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM sales WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM payments WHERE id = ANY($1) OR contract_id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM inventory_items WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM reps WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM cash_funds WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM customer_lists WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          await executePg(`DELETE FROM employees WHERE id = ANY($1)`, [delIds]).catch(() => {
          });
          for (const dId of delIds) {
            fileDb.delete("contracts", dId);
            fileDb.delete("payments", dId);
          }
        }
      }
      const processBulk = async (items, type) => {
        if (!Array.isArray(items) || items.length === 0) return;
        const CHUNK = 20;
        for (let i = 0; i < items.length; i += CHUNK) {
          const slice = items.slice(i, i + CHUNK);
          await Promise.all(
            slice.map(async (item) => {
              if (!item?.id) return;
              const ok = await processSingleSyncAction({ type, payload: item }, true);
              if (ok) {
                const relatedContractId = item?.contractId || item?.contract_id || (type.includes("CONTRACT") ? item?.id : null);
                if (relatedContractId) affectedContractIds.add(relatedContractId);
                totalInserted++;
              }
            })
          );
        }
      };
      await processBulk(payload.contracts, "CREATE_CONTRACT");
      await processBulk(payload.payments, "CREATE_PAYMENT");
      await processBulk(payload.inventory, "CREATE_INVENTORY");
      await processBulk(payload.reps, "CREATE_REP");
      await processBulk(payload.funds, "CREATE_FUND");
      await processBulk(payload.customer_lists, "CREATE_CUSTOMER_LIST");
      await processBulk(payload.employees, "CREATE_EMPLOYEE");
      await processBulk(payload.fund_transactions, "CREATE_FUND_TRANSACTION");
      await processBulk(payload.employee_transactions, "CREATE_EMPLOYEE_TRANSACTION");
      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        await executePg(`
          UPDATE sales c
          SET
            total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
            remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
            status = CASE
              WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
              ELSE 'active'
            END
          FROM (
            SELECT contract_id, SUM(COALESCE(amount_paid, amount, 0)) as sum_paid
            FROM payments
            WHERE contract_id = ANY($1)
            GROUP BY contract_id
          ) p
          WHERE c.id = p.contract_id AND c.id = ANY($1)
        `, [cIds]).catch(() => {
        });
      }
      await syncContractBalancesInPgAndFileDb().catch(() => {
      });
      bumpSyncVersion();
      res.json({ success: true, totalInserted, message: "Reconciliation complete" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/sync/verify-match", async (req, res) => {
    try {
      const payload = req.body || {};
      const clientContractIds = Array.isArray(payload.contractIds) ? payload.contractIds.filter(Boolean).map(String) : [];
      const clientPaymentIds = Array.isArray(payload.paymentIds) ? payload.paymentIds.filter(Boolean).map(String) : [];
      const clientInventoryIds = Array.isArray(payload.inventoryIds) ? payload.inventoryIds.filter(Boolean).map(String) : [];
      const clientRepIds = Array.isArray(payload.repIds) ? payload.repIds.filter(Boolean).map(String) : [];
      const clientFundIds = Array.isArray(payload.fundIds) ? payload.fundIds.filter(Boolean).map(String) : [];
      const clientCustomerListIds = Array.isArray(payload.customerListIds) ? payload.customerListIds.filter(Boolean).map(String) : [];
      const clientEmployeeIds = Array.isArray(payload.employeeIds) ? payload.employeeIds.filter(Boolean).map(String) : [];
      const [
        existingContracts,
        existingPayments,
        existingInventory,
        existingReps,
        existingFunds,
        existingCustomerLists,
        existingEmployees,
        deletedRecordsRows
      ] = await Promise.all([
        clientContractIds.length > 0 ? executePg(`SELECT id FROM sales WHERE id = ANY($1)`, [clientContractIds]).catch(() => []) : Promise.resolve([]),
        clientPaymentIds.length > 0 ? executePg(`SELECT id FROM payments WHERE id = ANY($1)`, [clientPaymentIds]).catch(() => []) : Promise.resolve([]),
        clientInventoryIds.length > 0 ? executePg(`SELECT id FROM inventory_items WHERE id = ANY($1)`, [clientInventoryIds]).catch(() => []) : Promise.resolve([]),
        clientRepIds.length > 0 ? executePg(`SELECT id FROM reps WHERE id = ANY($1)`, [clientRepIds]).catch(() => []) : Promise.resolve([]),
        clientFundIds.length > 0 ? executePg(`SELECT id FROM cash_funds WHERE id = ANY($1)`, [clientFundIds]).catch(() => []) : Promise.resolve([]),
        clientCustomerListIds.length > 0 ? executePg(`SELECT id FROM customer_lists WHERE id = ANY($1)`, [clientCustomerListIds]).catch(() => []) : Promise.resolve([]),
        clientEmployeeIds.length > 0 ? executePg(`SELECT id FROM employees WHERE id = ANY($1)`, [clientEmployeeIds]).catch(() => []) : Promise.resolve([]),
        executePg(`SELECT record_id FROM deleted_records`).catch(() => [])
      ]);
      const deletedSet = new Set((deletedRecordsRows || []).map((r) => String(r.record_id)));
      const foundContractSet = new Set((existingContracts || []).map((r) => String(r.id)));
      const foundPaymentSet = new Set((existingPayments || []).map((r) => String(r.id)));
      const foundInventorySet = new Set((existingInventory || []).map((r) => String(r.id)));
      const foundRepSet = new Set((existingReps || []).map((r) => String(r.id)));
      const foundFundSet = new Set((existingFunds || []).map((r) => String(r.id)));
      const foundCustomerListSet = new Set((existingCustomerLists || []).map((r) => String(r.id)));
      const foundEmployeeSet = new Set((existingEmployees || []).map((r) => String(r.id)));
      const fileDbContracts = new Set((fileDb.get("contracts") || []).map((c) => String(c.id)));
      const fileDbPayments = new Set((fileDb.get("payments") || []).map((p) => String(p.id)));
      const fileDbInventory = new Set((fileDb.get("inventory") || []).map((i) => String(i.id)));
      const fileDbReps = new Set((fileDb.get("reps") || []).map((r) => String(r.id)));
      const fileDbFunds = new Set((fileDb.get("funds") || []).map((f) => String(f.id)));
      const fileDbCustomerLists = new Set((fileDb.get("customer_lists") || []).map((cl) => String(cl.id)));
      const fileDbEmployees = new Set((fileDb.get("employees") || []).map((e) => String(e.id)));
      for (const id of clientContractIds) {
        if (!foundContractSet.has(id) && fileDbContracts.has(id)) {
          foundContractSet.add(id);
        }
      }
      for (const id of clientPaymentIds) {
        if (!foundPaymentSet.has(id) && fileDbPayments.has(id)) {
          foundPaymentSet.add(id);
        }
      }
      for (const id of clientInventoryIds) {
        if (!foundInventorySet.has(id) && fileDbInventory.has(id)) {
          foundInventorySet.add(id);
        }
      }
      for (const id of clientRepIds) {
        if (!foundRepSet.has(id) && fileDbReps.has(id)) {
          foundRepSet.add(id);
        }
      }
      for (const id of clientFundIds) {
        if (!foundFundSet.has(id) && fileDbFunds.has(id)) {
          foundFundSet.add(id);
        }
      }
      for (const id of clientCustomerListIds) {
        if (!foundCustomerListSet.has(id) && fileDbCustomerLists.has(id)) {
          foundCustomerListSet.add(id);
        }
      }
      for (const id of clientEmployeeIds) {
        if (!foundEmployeeSet.has(id) && fileDbEmployees.has(id)) {
          foundEmployeeSet.add(id);
        }
      }
      const missingContractIds = clientContractIds.filter((id) => !foundContractSet.has(id) && !deletedSet.has(id));
      const missingPaymentIds = clientPaymentIds.filter((id) => !foundPaymentSet.has(id) && !deletedSet.has(id));
      const missingInventoryIds = clientInventoryIds.filter((id) => !foundInventorySet.has(id) && !deletedSet.has(id));
      const missingRepIds = clientRepIds.filter((id) => !foundRepSet.has(id) && !deletedSet.has(id));
      const missingFundIds = clientFundIds.filter((id) => !foundFundSet.has(id) && !deletedSet.has(id));
      const missingCustomerListIds = clientCustomerListIds.filter((id) => !foundCustomerListSet.has(id) && !deletedSet.has(id));
      const missingEmployeeIds = clientEmployeeIds.filter((id) => !foundEmployeeSet.has(id) && !deletedSet.has(id));
      const totalMissing = missingContractIds.length + missingPaymentIds.length + missingInventoryIds.length + missingRepIds.length + missingFundIds.length + missingCustomerListIds.length + missingEmployeeIds.length;
      const matched = totalMissing === 0;
      let serverContractCount = foundContractSet.size;
      let serverPaymentCount = foundPaymentSet.size;
      try {
        const [cCountRes, pCountRes] = await Promise.all([
          executePg(`SELECT COUNT(*) as count FROM sales WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = sales.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts' OR dr.table_name = 'unknown'))`).catch(() => []),
          executePg(`SELECT COUNT(*) as count FROM payments WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = payments.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))`).catch(() => [])
        ]);
        if (cCountRes?.[0]?.count) serverContractCount = Math.max(serverContractCount, Number(cCountRes[0].count));
        if (pCountRes?.[0]?.count) serverPaymentCount = Math.max(serverPaymentCount, Number(pCountRes[0].count));
      } catch (cntErr) {
      }
      const hasNewServerData = serverContractCount > clientContractIds.length || serverPaymentCount > clientPaymentIds.length;
      res.json({
        success: true,
        matched,
        totalMissing,
        missingContractIds,
        missingPaymentIds,
        missingInventoryIds,
        missingRepIds,
        missingFundIds,
        missingCustomerListIds,
        missingEmployeeIds,
        confirmedContractCount: foundContractSet.size,
        confirmedPaymentCount: foundPaymentSet.size,
        serverContractCount,
        serverPaymentCount,
        hasNewServerData,
        deletedRecordIds: Array.from(deletedSet),
        syncVersion: globalSyncVersion,
        timestamp: Date.now()
      });
    } catch (err) {
      res.status(500).json({ error: err.message, matched: false });
    }
  });
  app.get("/api/sync/version", async (req, res) => {
    try {
      if (isPgConfigured()) {
        const rows = await executePg("SELECT value FROM system_settings WHERE key = 'sync_version' LIMIT 1").catch(() => []);
        if (rows && rows.length > 0 && rows[0].value) {
          const v = Number(rows[0].value);
          if (v > globalSyncVersion) {
            globalSyncVersion = v;
          }
        }
      }
    } catch (e) {
    }
    res.json({
      success: true,
      syncVersion: globalSyncVersion,
      timestamp: Date.now()
    });
  });
  app.post("/api/sync/beacon", async (req, res) => {
    try {
      let actions = [];
      if (Buffer.isBuffer(req.body)) {
        try {
          const parsed = JSON.parse(req.body.toString("utf8"));
          actions = Array.isArray(parsed?.actions) ? parsed.actions : Array.isArray(parsed) ? parsed : [];
        } catch (e) {
        }
      } else if (typeof req.body === "string") {
        try {
          const parsed = JSON.parse(req.body);
          actions = Array.isArray(parsed?.actions) ? parsed.actions : Array.isArray(parsed) ? parsed : [];
        } catch (e) {
        }
      } else if (req.body && typeof req.body === "object") {
        actions = Array.isArray(req.body?.actions) ? req.body.actions : Array.isArray(req.body) ? req.body : [];
      }
      if (actions.length === 0) {
        return res.json({ success: true, count: 0, processedIds: [] });
      }
      const candidateIds = actions.map((a) => a?.payload?.id || (typeof a?.payload === "string" ? a.payload : null)).filter(Boolean);
      let deletedSet = /* @__PURE__ */ new Set();
      if (candidateIds.length > 0) {
        const deletedRows = await executePg(
          `SELECT record_id FROM deleted_records WHERE record_id = ANY($1)`,
          [candidateIds]
        ).catch(() => []);
        if (Array.isArray(deletedRows)) {
          deletedSet = new Set(deletedRows.map((r) => r.record_id));
        }
      }
      const affectedContractIds = /* @__PURE__ */ new Set();
      const processedIds = [];
      const paymentActions = [];
      const contractActions = [];
      const otherActions = [];
      for (const act of actions) {
        const targetId = act?.payload?.id || (typeof act?.payload === "string" ? act?.payload : null);
        const isDelete = act?.type?.startsWith("DELETE_");
        if (!isDelete && targetId && deletedSet.has(targetId)) {
          if (act?.id) processedIds.push(act.id);
          continue;
        }
        if (act?.type === "CREATE_PAYMENT" || act?.type === "UPDATE_PAYMENT") {
          paymentActions.push(act);
        } else if (act?.type === "CREATE_CONTRACT") {
          contractActions.push(act);
        } else {
          otherActions.push(act);
        }
      }
      if (paymentActions.length > 0) {
        const paymentRows = paymentActions.map((act) => {
          const p = act.payload || {};
          const amt = Number(p.amount ?? p.amountPaid ?? p.amount_paid) || 0;
          const cId = p.contractId ?? p.contract_id ?? "";
          const cName = p.customerName ?? p.customer_name ?? "";
          const pDate = p.paymentDate ?? p.payment_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
          const pNote = p.note ?? p.notes ?? "";
          const rName = p.repName ?? p.rep_name ?? "";
          const fId = p.fundId ?? p.fund_id ?? null;
          const cAt = p.createdAt ?? p.created_at ?? (/* @__PURE__ */ new Date()).toISOString();
          const isEd = Boolean(p.isEdited ?? p.is_edited);
          if (cId) affectedContractIds.add(cId);
          try {
            fileDb.upsert("payments", {
              id: p.id,
              contractId: cId,
              customerName: cName,
              amount: amt,
              amountPaid: amt,
              paymentDate: pDate,
              note: pNote,
              repName: rName,
              fundId: fId,
              createdAt: cAt,
              isEdited: isEd
            });
          } catch (e) {
          }
          return {
            id: String(p.id),
            contract_id: String(cId),
            customer_name: String(cName),
            amount: amt,
            amount_paid: amt,
            payment_date: String(pDate),
            note: String(pNote),
            rep_name: String(rName),
            fund_id: fId ? String(fId) : null,
            created_at: String(cAt),
            is_edited: isEd
          };
        }).filter((r) => r.id);
        const uniquePaymentRowsMap = /* @__PURE__ */ new Map();
        for (const row of paymentRows) {
          if (row && row.id) {
            uniquePaymentRowsMap.set(row.id, row);
          }
        }
        const dedupedPaymentRows = Array.from(uniquePaymentRowsMap.values());
        if (dedupedPaymentRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO payments (
                id, contract_id, customer_name, amount, amount_paid,
                payment_date, note, rep_name, fund_id, created_at, is_edited
              )
              SELECT
                x.id,
                x.contract_id,
                x.customer_name,
                COALESCE(x.amount, 0),
                COALESCE(x.amount_paid, x.amount, 0),
                x.payment_date,
                x.note,
                x.rep_name,
                x.fund_id,
                COALESCE(x.created_at, NOW()::text),
                COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text,
                contract_id text,
                customer_name text,
                amount double precision,
                amount_paid double precision,
                payment_date text,
                note text,
                rep_name text,
                fund_id text,
                created_at text,
                is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                contract_id = EXCLUDED.contract_id,
                customer_name = EXCLUDED.customer_name,
                amount = EXCLUDED.amount,
                amount_paid = EXCLUDED.amount_paid,
                payment_date = EXCLUDED.payment_date,
                note = EXCLUDED.note,
                rep_name = EXCLUDED.rep_name,
                fund_id = EXCLUDED.fund_id,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedPaymentRows)]);
            for (const row of dedupedPaymentRows) {
              if (row.amount > 0) {
                const targetFundId = await resolveFundIdForPayment(row.fund_id, row.contract_id);
                if (targetFundId) {
                  await recordPaymentFundAdjustment(
                    row.id,
                    targetFundId,
                    row.amount,
                    row.customer_name || "",
                    row.rep_name || "",
                    row.payment_date || "",
                    false
                  ).catch(() => {
                  });
                }
              }
            }
            for (const act of paymentActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkPayErr) {
            console.warn("[Beacon Sync] Bulk payment upsert error, running fallback:", bulkPayErr);
            for (const act of paymentActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {
              }
            }
          }
        }
      }
      if (contractActions.length > 0) {
        const contractRows = contractActions.map((act) => {
          const c = act.payload || {};
          const totalPrice = Number(c.totalPrice ?? c.total_price) || 0;
          const adv = Number(c.advancePayment ?? c.advance_payment) || 0;
          const paid = Number(c.totalPaid ?? c.total_paid) || 0;
          const rem = Math.max(0, totalPrice - adv - paid);
          const daily = Number(c.dailyInstallment ?? c.daily_installment) || 0;
          const stat = rem <= 0 ? "completed" : c.status || "active";
          if (c.id) affectedContractIds.add(c.id);
          try {
            fileDb.upsert("contracts", {
              ...c,
              totalPrice,
              advancePayment: adv,
              totalPaid: paid,
              remainingBalance: rem,
              dailyInstallment: daily,
              status: stat
            });
          } catch (e) {
          }
          return {
            id: String(c.id),
            customer_name: String(c.customerName ?? c.customer_name ?? ""),
            customer_phone: String(c.customerPhone ?? c.customer_phone ?? ""),
            customer_address: c.customerAddress ?? c.customer_address ?? null,
            item_id: c.itemId ?? c.item_id ?? null,
            item_name: String(c.itemName ?? c.item_name ?? ""),
            item_quantity: Number(c.itemQuantity ?? c.item_quantity) || 1,
            purchase_price: Number(c.purchasePrice ?? c.purchase_price) || 0,
            list_id: c.listId ?? c.list_id ?? null,
            list_name: c.listName ?? c.list_name ?? null,
            total_price: totalPrice,
            advance_payment: adv,
            remaining_balance: rem,
            daily_installment: daily,
            start_date: String(c.startDate ?? c.start_date ?? (/* @__PURE__ */ new Date()).toISOString().split("T")[0]),
            notes: c.notes ?? null,
            status: stat,
            last_payment_date: c.lastPaymentDate ?? c.last_payment_date ?? null,
            total_paid: paid,
            rep_name: c.repName ?? c.rep_name ?? null,
            created_at: String(c.createdAt ?? c.created_at ?? (/* @__PURE__ */ new Date()).toISOString()),
            completed_at: c.completedAt ?? c.completed_at ?? null,
            updated_at: c.updatedAt ?? c.updated_at ?? (/* @__PURE__ */ new Date()).toISOString(),
            is_edited: Boolean(c.isEdited ?? c.is_edited)
          };
        }).filter((r) => r.id);
        const uniqueContractRowsMap = /* @__PURE__ */ new Map();
        for (const row of contractRows) {
          if (row && row.id) {
            uniqueContractRowsMap.set(row.id, row);
          }
        }
        const dedupedContractRows = Array.from(uniqueContractRowsMap.values());
        if (dedupedContractRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO sales (
                id, customer_name, customer_phone, customer_address,
                item_id, item_name, item_quantity, purchase_price,
                list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes,
                status, last_payment_date, total_paid, rep_name,
                created_at, completed_at, updated_at, is_edited
              )
              SELECT
                x.id, x.customer_name, x.customer_phone, x.customer_address,
                x.item_id, x.item_name, COALESCE(x.item_quantity, 1), COALESCE(x.purchase_price, 0),
                x.list_id, x.list_name, COALESCE(x.total_price, 0), COALESCE(x.advance_payment, 0),
                COALESCE(x.remaining_balance, 0), COALESCE(x.daily_installment, 0), COALESCE(x.start_date, NOW()::date::text), x.notes,
                COALESCE(x.status, 'active'), x.last_payment_date, COALESCE(x.total_paid, 0), x.rep_name,
                COALESCE(x.created_at, NOW()::text), x.completed_at, x.updated_at, COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text, customer_name text, customer_phone text, customer_address text,
                item_id text, item_name text, item_quantity integer, purchase_price double precision,
                list_id text, list_name text, total_price double precision, advance_payment double precision,
                remaining_balance double precision, daily_installment double precision, start_date text, notes text,
                status text, last_payment_date text, total_paid double precision, rep_name text,
                created_at text, completed_at text, updated_at text, is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), sales.customer_name),
                customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), sales.customer_phone),
                customer_address = COALESCE(EXCLUDED.customer_address, sales.customer_address),
                item_id = COALESCE(EXCLUDED.item_id, sales.item_id),
                item_name = COALESCE(NULLIF(EXCLUDED.item_name, ''), sales.item_name),
                item_quantity = CASE WHEN EXCLUDED.item_quantity > 0 THEN EXCLUDED.item_quantity ELSE sales.item_quantity END,
                purchase_price = CASE WHEN EXCLUDED.purchase_price > 0 THEN EXCLUDED.purchase_price ELSE sales.purchase_price END,
                list_id = COALESCE(EXCLUDED.list_id, sales.list_id),
                list_name = COALESCE(EXCLUDED.list_name, sales.list_name),
                total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE sales.total_price END,
                advance_payment = CASE WHEN EXCLUDED.advance_payment > 0 THEN EXCLUDED.advance_payment ELSE sales.advance_payment END,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = CASE WHEN EXCLUDED.daily_installment > 0 THEN EXCLUDED.daily_installment ELSE sales.daily_installment END,
                start_date = COALESCE(NULLIF(EXCLUDED.start_date, ''), sales.start_date),
                notes = COALESCE(EXCLUDED.notes, sales.notes),
                status = EXCLUDED.status,
                last_payment_date = COALESCE(EXCLUDED.last_payment_date, sales.last_payment_date),
                total_paid = EXCLUDED.total_paid,
                rep_name = COALESCE(NULLIF(EXCLUDED.rep_name, ''), sales.rep_name),
                completed_at = COALESCE(EXCLUDED.completed_at, sales.completed_at),
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedContractRows)]);
            for (const act of contractActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkContractErr) {
            console.warn("[Beacon Sync] Bulk contract upsert error, running fallback:", bulkContractErr);
            for (const act of contractActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {
              }
            }
          }
        }
      }
      if (otherActions.length > 0) {
        for (const act of otherActions) {
          try {
            const ok = await processSingleSyncAction(act, true);
            if (ok && act?.id) processedIds.push(act.id);
            const relatedContractId = act?.payload?.contractId || act?.payload?.contract_id || (act?.type?.includes("CONTRACT") ? act?.payload?.id : null);
            if (relatedContractId) affectedContractIds.add(relatedContractId);
          } catch (actErr) {
            console.warn("Beacon action item warning:", act?.id, actErr);
          }
        }
      }
      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        try {
          await executePg(`
            UPDATE sales c
            SET
              total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
              status = CASE
                WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
                ELSE 'active'
              END
            FROM (
              SELECT contract_id, SUM(amount_paid) as sum_paid
              FROM payments
              WHERE contract_id = ANY($1)
              GROUP BY contract_id
            ) p
            WHERE c.id = p.contract_id AND c.id = ANY($1)
          `, [cIds]).catch(() => {
          });
          await executePg(`
            UPDATE sales
            SET
              total_paid = 0,
              remaining_balance = GREATEST(0, total_price - advance_payment),
              status = CASE WHEN (total_price - advance_payment) <= 0 THEN 'completed' ELSE 'active' END
            WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM payments WHERE contract_id = sales.id)
          `, [cIds]).catch(() => {
          });
        } catch (balErr) {
        }
      }
      bumpSyncVersion();
      res.json({ success: true, count: processedIds.length, processedIds });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true, hmr: false },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path3.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path3.default.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} in use, exiting cleanly for supervisor restart.`);
      process.exit(1);
    } else {
      console.error("Server error:", err);
    }
  });
  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}
startServer();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  bumpSyncVersion
});
//# sourceMappingURL=server.cjs.map
