-- =========================================================
-- كود تهيئة جميع جداول قاعدة بيانات Hostinger PostgreSQL
-- قم بنسخ هذا الكود وتشغيله في قاعدة بيانات PostgreSQL على سيرفر Hostinger
-- =========================================================

-- 1. جدول العقود (contracts)
CREATE TABLE IF NOT EXISTS public.contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT,
    customer_name TEXT,
    phone TEXT,
    item_name TEXT,
    total_amount NUMERIC DEFAULT 0,
    paid_amount NUMERIC DEFAULT 0,
    remaining_amount NUMERIC DEFAULT 0,
    monthly_installment NUMERIC DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    sales_rep TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول المدفوعات (payments)
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    contract_id TEXT,
    contract_number TEXT,
    customer_name TEXT,
    amount NUMERIC DEFAULT 0,
    payment_date TEXT,
    receipt_number TEXT,
    collector TEXT,
    payment_method TEXT,
    fund_id TEXT,
    notes TEXT,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المخزون (inventory)
CREATE TABLE IF NOT EXISTS public.inventory (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT,
    category TEXT,
    quantity NUMERIC DEFAULT 0,
    cost_price NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    min_quantity NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. جدول مندوبي المبيعات (reps)
CREATE TABLE IF NOT EXISTS public.reps (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    area TEXT,
    commission_rate NUMERIC DEFAULT 0,
    target NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. جدول الصناديق والخزائن (funds)
CREATE TABLE IF NOT EXISTS public.funds (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    balance NUMERIC DEFAULT 0,
    account_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. جدول قوائم العملاء (customer_lists)
CREATE TABLE IF NOT EXISTS public.customer_lists (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    address TEXT,
    rep_name TEXT,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. جدول معاملات الصناديق (fund_transactions)
CREATE TABLE IF NOT EXISTS public.fund_transactions (
    id TEXT PRIMARY KEY,
    fund_id TEXT,
    type TEXT,
    amount NUMERIC DEFAULT 0,
    description TEXT,
    date TEXT,
    reference_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. جدول الموظفين (employees)
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    salary NUMERIC DEFAULT 0,
    phone TEXT,
    hire_date TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. جدول معاملات الموظفين (employee_transactions)
CREATE TABLE IF NOT EXISTS public.employee_transactions (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    employee_name TEXT,
    type TEXT,
    amount NUMERIC DEFAULT 0,
    date TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. جدول التعارضات المالية (payment_conflicts)
CREATE TABLE IF NOT EXISTS public.payment_conflicts (
    id TEXT PRIMARY KEY,
    payment_id TEXT,
    contract_id TEXT,
    description TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- إيقاف Row Level Security للسماح بالقراءة والكتابة المباشرة
-- =========================================================
ALTER TABLE public.contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_conflicts DISABLE ROW LEVEL SECURITY;
