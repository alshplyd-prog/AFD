import fs from 'fs';
import path from 'path';
import { createPool } from './index.ts';
import { INITIAL_CONTRACTS } from '../data/initialContracts.ts';

export async function initializeDatabaseSchema() {
  if (!process.env.DATABASE_URL && !process.env.DB_HOST && (!process.env.SQL_HOST || !process.env.SQL_DB_NAME)) {
    console.log('PostgreSQL connection details not provided, skipping schema initialization.');
    return;
  }

  try {
    const pool = createPool();
    const client = await pool.connect();
    try {
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
              AND table_name IN (
                'sales', 'customers', 'funds', 'inventory', 'payments', 'reps',
                'installment_contracts', 'payment_records', 'sales_representatives',
                'contracts', 'invoices', 'cash_registers', 'representatives', 'cash_operations'
              )
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
        VALUES ('welcome_message', '{"title":"أهلاً بك في نظام مبيعات الأقساط","subtitle":"اختر القسم الذي تريد الدخول إليه:"}')
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

        -- جدول الزبائن (customers)
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          phone TEXT,
          address TEXT,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          location_address TEXT,
          list_id TEXT,
          list_name TEXT,
          notes TEXT,
          total_purchases DOUBLE PRECISION DEFAULT 0,
          total_paid DOUBLE PRECISION DEFAULT 0,
          remaining_balance DOUBLE PRECISION DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- جدول المبيعات (sales)
        CREATE TABLE IF NOT EXISTS sales (
          id TEXT PRIMARY KEY,
          sale_number TEXT,
          customer_id TEXT,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_address TEXT,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          location_address TEXT,
          location_updated_at TEXT,
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

        -- Ensure location columns exist on sales and customers
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS location_address TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS location_updated_at TEXT;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_address TEXT;

        -- Create compatibility view contracts -> sales so that any legacy/external calls never fail
        DROP VIEW IF EXISTS contracts CASCADE;
        CREATE VIEW contracts AS 
        SELECT 
          id, customer_id, customer_name, customer_phone, customer_address,
          latitude, longitude, location_address, location_updated_at,
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

        -- Ensure order_index column exists on customer_lists and cash_funds
        ALTER TABLE customer_lists ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
        ALTER TABLE cash_funds ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          contract_id TEXT,
          customer_name TEXT,
          customer_phone TEXT,
          customer_address TEXT,
          list_id TEXT,
          list_name TEXT,
          appointment_type TEXT DEFAULT 'specific_date',
          recurring_day INTEGER,
          recurring_day_name TEXT,
          recurring_day_of_month INTEGER,
          recurring_month_day_name TEXT,
          appointment_date TEXT,
          appointment_time TEXT,
          due_date TEXT,
          due_time TEXT,
          title TEXT,
          notes TEXT,
          note TEXT,
          status TEXT DEFAULT 'pending',
          created_by_name TEXT,
          created_by_rep_name TEXT,
          created_by_rep_id TEXT,
          created_at TEXT
        );

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

        -- A. sales_representatives -> reps (دمج المندوبين ومندوبين المبيعات وحذف الزائد)
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

        -- B. inventory -> inventory_items (المخزن والجرد متكررات - حذف جدول الجرد الزائد)
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

        -- C. payment_records -> payments (الدفعات وسجل الدفعات - حذف سجل الدفعات الزائد)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_records') THEN
            INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, rep_name, note, fund_id, created_at, updated_at, is_edited)
            SELECT id, contract_id, customer_name, COALESCE(amount_paid, 0), COALESCE(amount_paid, 0), payment_date, rep_name, note, fund_id, created_at, updated_at, COALESCE(is_edited, false)
            FROM payment_records
            ON CONFLICT (id) DO NOTHING;
            DROP TABLE payment_records CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- D. installment_contracts -> sales (المبيعات والأقساط)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='installment_contracts') THEN
            INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, last_payment_date, total_paid, rep_name, created_at, completed_at, updated_at, is_edited)
            SELECT id, customer_name, customer_phone, customer_address, item_id, item_name, COALESCE(item_quantity, 1), COALESCE(purchase_price, 0), list_id, list_name, total_price, COALESCE(advance_payment, 0), remaining_balance, daily_installment, start_date, notes, COALESCE(status, 'active'), last_payment_date, COALESCE(total_paid, 0), rep_name, created_at, completed_at, updated_at, COALESCE(is_edited, false)
            FROM installment_contracts
            ON CONFLICT (id) DO NOTHING;
            DROP TABLE installment_contracts CASCADE;
          END IF;
        EXCEPTION WHEN others THEN NULL; END $$;

        -- E. funds -> cash_funds (دمج الصناديق في جدول الصندوق المالي الموحد وحذف الجدول الزائد مع إنشاء View للتوافق)
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='funds' AND table_type='BASE TABLE') THEN
            INSERT INTO cash_funds (id, name, balance, description, created_at)
            SELECT id, name, COALESCE(balance, 0), description, created_at
            FROM funds
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              balance = EXCLUDED.balance,
              description = EXCLUDED.description;
            DROP TABLE funds CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='funds') THEN
            CREATE OR REPLACE VIEW funds AS SELECT * FROM cash_funds;
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

        -- Ensure compatibility views are clean and match latest table columns
        DROP VIEW IF EXISTS invoices CASCADE;
        CREATE VIEW invoices AS SELECT * FROM sales;

        DROP VIEW IF EXISTS cash_registers CASCADE;
        CREATE VIEW cash_registers AS SELECT * FROM cash_funds;

        DROP VIEW IF EXISTS representatives CASCADE;
        CREATE VIEW representatives AS SELECT * FROM reps;

        DROP VIEW IF EXISTS cash_operations CASCADE;
        CREATE VIEW cash_operations AS SELECT * FROM fund_transactions;

        DROP VIEW IF EXISTS funds CASCADE;
        CREATE VIEW funds AS SELECT * FROM cash_funds;

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
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
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
      console.log('PostgreSQL Database schema initialized & verified (cleaned duplicate tables)!');

      // Migrate existing local FileDB data into PostgreSQL only once on very first system initialization
      const initCheck = await client.query(`SELECT value FROM system_settings WHERE key = 'schema_init_completed' LIMIT 1`).catch(() => ({ rows: [] }));
      if (initCheck.rows.length === 0) {
        await migrateFileDbToPostgres(client);
        await client.query(`INSERT INTO system_settings (key, value) VALUES ('schema_init_completed', 'true') ON CONFLICT (key) DO NOTHING`).catch(() => {});
      }

      // Clean up any invalid sales records that originated from payments/transactions/etc.
      await client.query(
        `DELETE FROM sales WHERE id LIKE 'pay_%' OR id LIKE 'ft_%' OR id LIKE 'emptx_%' OR id LIKE 'conflict_%'`
      ).catch(() => {});

      // Clean up any historic 'unknown' deleted_records to prevent accidental customer/contract deletions
      await client.query(
        `DELETE FROM deleted_records WHERE table_name = 'unknown'`
      ).catch(() => {});

      // Sync customers table from real sales records only
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
        WHERE c.customer_name IS NOT NULL 
          AND TRIM(c.customer_name) != ''
          AND c.id NOT LIKE 'pay_%'
          AND c.id NOT LIKE 'ft_%'
          AND c.id NOT LIKE 'emptx_%'
          AND c.id NOT LIKE 'conflict_%'
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
      `).catch(() => {});

    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('PostgreSQL Schema Initialization warning:', err);
  }
}

async function migrateFileDbToPostgres(client: any) {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) return;

  const readJson = (filename: string) => {
    try {
      const p = path.join(dataDir, filename);
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8')) || [];
      }
    } catch (e) {
      // ignore
    }
    return [];
  };

  // 1. Contracts / Customers (Empty by default - contracts only added by user)
  // No test or dummy contracts are migrated or seeded

  // 2. Customer Lists
  const customerLists = readJson('customer_lists.json');
  for (const l of customerLists) {
    if (!l.id) continue;
    await client.query(
      `INSERT INTO customer_lists (id, name, fund_id, description, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fund_id = EXCLUDED.fund_id`,
      [l.id, l.name || '', l.fundId || null, l.description || '', l.createdAt || new Date().toISOString()]
    );
  }

  // 3. Inventory Items
  const inventoryItems = readJson('inventory_items.json');
  for (const item of inventoryItems) {
    if (!item.id) continue;
    const vals = [
      item.id,
      item.name || '',
      Number(item.price ?? item.sellingPrice) || 0,
      Number(item.purchasePrice) || 0,
      Number(item.quantity) || 0,
      Number(item.dailyInstallment) || 0,
      item.category || ''
    ];
    await client.query(
      `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, quantity=EXCLUDED.quantity`,
      vals
    );
  }

  // 4. Cash Funds
  const cashFunds = readJson('cash_funds.json');
  for (const f of cashFunds) {
    if (!f.id) continue;
    const vals = [f.id, f.name || '', Number(f.balance) || 0, f.description || ''];
    await client.query(
      `INSERT INTO cash_funds (id, name, balance, description) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, name = EXCLUDED.name`,
      vals
    );
  }

  // 5. Sales Representatives
  const reps = readJson('reps.json');
  for (const r of reps) {
    if (!r.id) continue;
    const allowed = Array.isArray(r.allowedListIds) ? JSON.stringify(r.allowedListIds) : JSON.stringify(['all']);
    const vals = [r.id, r.name || '', r.phone || '', r.code || '', r.role || 'rep', r.canEdit !== false, Boolean(r.canDelete), r.canMoveCustomer !== false, r.canSell !== false, allowed];
    await client.query(
      `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, code = EXCLUDED.code`,
      vals
    );
  }

  // 6. Payments (Empty by default - payments only created upon real installment collection)
  // No test or dummy payments are migrated or seeded

  console.log('Migrated all local FileDB records into PostgreSQL successfully.');
}
