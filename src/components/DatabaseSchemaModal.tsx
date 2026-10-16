import React, { useState } from 'react';
import { Database, Copy, Check, Download, X, Code, Server, ShieldCheck } from 'lucide-react';

interface DatabaseSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SQL_SCHEMA_CONTENT = `-- =========================================================
-- كود تهيئة جميع جداول قاعدة بيانات Hostinger PostgreSQL
-- قم بنسخ هذا الكود وتشغيله في PostgreSQL أو أداة إدارة السيرفر (pgAdmin / phpPgAdmin / Terminal)
-- =========================================================

-- 1. جدول المبيعات (sales) - حل محل جدول العقود
CREATE TABLE IF NOT EXISTS public.sales (
    id TEXT PRIMARY KEY,
    sale_number TEXT,
    customer_id TEXT,
    customer_name TEXT,
    phone TEXT,
    item_name TEXT,
    total_amount NUMERIC DEFAULT 0,
    monthly_installment NUMERIC DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    status TEXT DEFAULT 'active',
    sales_rep TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. جدول الزبائن (customers)
CREATE TABLE IF NOT EXISTS public.customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    list_id TEXT,
    list_name TEXT,
    notes TEXT,
    total_purchases NUMERIC DEFAULT 0,
    total_paid NUMERIC DEFAULT 0,
    remaining_balance NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. جدول المدفوعات (payments)
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    sale_id TEXT,
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

-- 4. جدول المخزون (inventory)
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

-- 5. جدول مندوبي المبيعات (reps)
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

-- 6. جدول الصناديق والخزائن (funds)
CREATE TABLE IF NOT EXISTS public.funds (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    balance NUMERIC DEFAULT 0,
    account_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. جدول قوائم العملاء (customer_lists)
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

-- 8. جدول معاملات الصناديق (fund_transactions)
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

-- 9. جدول الموظفين (employees)
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

-- 10. جدول معاملات الموظفين (employee_transactions)
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

-- 11. جدول التعارضات المالية (payment_conflicts)
CREATE TABLE IF NOT EXISTS public.payment_conflicts (
    id TEXT PRIMARY KEY,
    payment_id TEXT,
    sale_id TEXT,
    description TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- إيقاف Row Level Security للسماح بالقراءة والكتابة المباشرة
-- =========================================================
ALTER TABLE public.sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.funds DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_conflicts DISABLE ROW LEVEL SECURITY;
`;

export const DatabaseSchemaModal: React.FC<DatabaseSchemaModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_CONTENT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([SQL_SCHEMA_CONTENT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schema.sql';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 text-right" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-6xl lg:max-w-7xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">تهيئـة جداول قاعدة البيانات (Hostinger PostgreSQL)</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">انسخ هذا الكود وقم بتشغيله في سيرفر PostgreSQL في Hostinger</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions */}
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
          <Server className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>خطوات التهيئة السريعة:</strong>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>انتقل إلى لوحة تحكم سيرفر <strong>Hostinger</strong> أو مشغل <strong>PostgreSQL</strong> الخاص بك.</li>
              <li>افتح قسم <strong>SQL Editor</strong> وقم بإنشاء استعلام جديد (New Query).</li>
              <li>انسخ السكريبت أدناه ثم اضغط <strong>Run</strong> لتنشيط كافة الجداول الـ 11 وصلاحياتها مباشرة.</li>
            </ol>
          </div>
        </div>

        {/* Code View */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-950 text-slate-100 font-mono text-xs dir-ltr text-left">
          <pre className="whitespace-pre-wrap break-all">{SQL_SCHEMA_CONTENT}</pre>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>يتضمن تهيئة 11 جدولاً رئيسياً مع تعطيل RLS للمستندات</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold text-xs transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>تحميل schema.sql</span>
            </button>
            <button
              onClick={handleCopy}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>تم النسخ بنجاح!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>نسخ السكريبت بالكامل</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
