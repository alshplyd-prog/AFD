import React, { useState, useEffect } from 'react';
import { fetchWithFallback } from '../lib/apiConfig';
import {
  Database,
  RefreshCw,
  X,
  Users,
  UserCheck,
  Building2,
  ShoppingCart,
  Wallet,
  Boxes,
  Printer,
  Copy,
  Check,
  Server,
  TrendingUp,
  AlertCircle,
  Receipt,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  Trash2
} from 'lucide-react';
import {
  Language,
  InstallmentContract,
  PaymentRecord,
  CashFund,
  Employee,
  SalesRepresentative,
  CustomerList
} from '../types';

interface ServerQueriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  appContracts?: InstallmentContract[];
  appPayments?: PaymentRecord[];
  appFunds?: CashFund[];
  appInventory?: any[];
  appEmployees?: Employee[];
  appReps?: SalesRepresentative[];
  appCustomerLists?: CustomerList[];
  onRefreshApp?: () => Promise<any> | void;
  onDeleteAllCustomersAndPayments?: () => Promise<any> | void;
}

interface ServerTotalsData {
  success: boolean;
  database: string;
  timestamp: string;
  contracts: {
    total: number;
    active: number;
    completed: number;
    totalSalesAmount: number;
    totalPaidAmount: number;
    totalRemainingBalance: number;
    totalAdvancePayment: number;
  };
  payments: {
    totalCount: number;
    totalAmount: number;
    todayAmount: number;
    monthAmount: number;
  };
  funds: {
    count: number;
    totalBalance: number;
    transactionsCount: number;
  };
  inventory: {
    totalItems: number;
    totalQuantity: number;
    totalValue: number;
  };
  employees: {
    total: number;
    active: number;
  };
  reps: {
    total: number;
    active: number;
  };
  customers: {
    total: number;
    totalPaid: number;
    totalRemaining: number;
  };
  lists?: {
    count: number;
  };
}

export const ServerQueriesModal: React.FC<ServerQueriesModalProps> = ({
  isOpen,
  onClose,
  lang,
  appContracts = [],
  appPayments = [],
  appFunds = [],
  appInventory = [],
  appEmployees = [],
  appReps = [],
  appCustomerLists = [],
  onRefreshApp,
  onDeleteAllCustomersAndPayments
}) => {
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<ServerTotalsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeletingAll, setIsDeletingAll] = useState<boolean>(false);

  const handleExecuteDeleteAll = async () => {
    if (!onDeleteAllCustomersAndPayments) return;
    setIsDeletingAll(true);
    try {
      await Promise.resolve(onDeleteAllCustomersAndPayments());
      await fetchServerTotals();
      setShowDeleteConfirm(false);
    } catch (e: any) {
      console.error('Failed to delete all customers:', e);
      setError(e.message || 'حدث خطأ أثناء حذف وتصفير الزبائن');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const fetchServerTotals = async (retryCount = 2) => {
    setLoading(true);
    setError(null);
    try {
      if (onRefreshApp) {
        await Promise.resolve(onRefreshApp()).catch(() => {});
      }

      let lastErr: any = null;
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          const res = await fetchWithFallback('/api/reports/totals', {
            headers: { 'Cache-Control': 'no-cache' }
          }, 12000);

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          const text = await res.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
              throw new Error('استجابة السيرفر غير صالحة (يبدو أن الخادم أعمل إعادة توجيه أو يعرض صفحة خطأ HTML بدلاً من بيانات JSON)');
            }
            throw new Error('خطأ في قراءة رد السيرفر (بيانات غير صالحة)');
          }

          if (json && json.success) {
            setData(json);
            return;
          } else {
            throw new Error(json?.message || 'فشل جلب الاستعلامات من السيرفر');
          }
        } catch (err: any) {
          lastErr = err;
          if (attempt < retryCount) {
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
          }
        }
      }

      throw lastErr || new Error('تعذر الاتصال بالسيرفر المباشر Hostinger');
    } catch (err: any) {
      console.error('fetchServerTotals error:', err);
      setError(err?.message || 'تعذر الاتصال بالسيرفر المباشر Hostinger. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchServerTotals();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Local App Calculated Metrics for side-by-side comparison
  const localFundsCount = appFunds.length;
  const localFundsBalance = appFunds.reduce((sum, f) => sum + (Number(f.balance) || 0), 0);

  const localContractsCount = appContracts.length;
  const localSalesAmount = appContracts.reduce((sum, c) => sum + (Number(c.totalPrice) || 0), 0);
  const localPaidAmount = appContracts.reduce((sum, c) => sum + (Number(c.totalPaid) || 0), 0);
  const localRemainingAmount = appContracts.reduce((sum, c) => sum + (Number(c.remainingBalance) || 0), 0);

  const uniqueLocalCustomersCount = new Set(appContracts.map(c => c.customerName?.trim()).filter(Boolean)).size;
  const displayLocalCustomersCount = Math.max(uniqueLocalCustomersCount, localContractsCount);

  const cleanAppPayments = appPayments.filter(p => p && p.id && (Number(p.amountPaid ?? p.amount) > 0) && !p.id.startsWith('contract_') && !p.id.startsWith('emp_') && !p.id.startsWith('item_'));
  const localPaymentsCount = cleanAppPayments.length;
  const localPaymentsAmount = cleanAppPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);

  const localRepsCount = appReps.length;
  const localEmployeesCount = appEmployees.filter(e => e.id && !e.id.startsWith('item_') && !e.id.startsWith('contract_') && !e.id.startsWith('pay_') && !e.id.startsWith('ft_')).length;

  const cleanAppInventory = appInventory.filter(i => i && i.id && (i.id.startsWith('item_') || (!i.id.startsWith('emp_') && !i.id.startsWith('pay_') && !i.id.startsWith('contract_') && !i.id.startsWith('ft_') && !i.id.startsWith('emptx_'))));
  const localInventoryQuantity = cleanAppInventory.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const localInventoryItems = cleanAppInventory.length;

  const handleCopyTable = () => {
    if (!data) return;
    const text = `
=== استعلامات سيرفر Hostinger المباشرة ومقارنة التطبيق ===
تاريخ الاستعلام: ${new Date(data.timestamp).toLocaleString('en-US')}

1. الصناديق المالية (الصندوق):
- السيرفر (Hostinger): ${data.funds.totalBalance.toLocaleString('en-US')} د.ع (${data.funds.count} صندوق)
- التطبيق (محلياً): ${localFundsBalance.toLocaleString('en-US')} د.ع (${localFundsCount} صندوق)

2. الزبائن:
- السيرفر (Hostinger): ${data.customers.total} زبون (الواصل: ${data.customers.totalPaid.toLocaleString('en-US')} | الباقي: ${data.customers.totalRemaining.toLocaleString('en-US')})
- التطبيق (محلياً): ${uniqueLocalCustomersCount} زبون (الواصل: ${localPaidAmount.toLocaleString('en-US')} | الباقي: ${localRemainingAmount.toLocaleString('en-US')})

3. التسديدات والمقبوضات:
- السيرفر (Hostinger): ${data.payments.totalAmount.toLocaleString('en-US')} د.ع (${data.payments.totalCount} عملية)
- التطبيق (محلياً): ${localPaymentsAmount.toLocaleString('en-US')} د.ع (${localPaymentsCount} عملية)

4. القوائم والمبيعات:
- السيرفر (Hostinger): ${data.contracts.totalSalesAmount.toLocaleString('en-US')} د.ع (${data.contracts.total} قائمة)
- التطبيق (محلياً): ${localSalesAmount.toLocaleString('en-US')} د.ع (${localContractsCount} قائمة)

5. المندوبين:
- السيرفر: ${data.reps.total} | التطبيق: ${localRepsCount}

6. الموظفين:
- السيرفر: ${data.employees.total} | التطبيق: ${localEmployeesCount}

7. المخزن والمواد:
- السيرفر: ${data.inventory.totalQuantity} قطعة | التطبيق: ${localInventoryQuantity} قطعة
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderStatusBadge = (serverVal: number, appVal: number, isCurrency = false) => {
    const diff = serverVal - appVal;
    if (Math.abs(diff) < 0.01) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          مطابق 100%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        اختلاف: {diff > 0 ? '+' : ''}{isCurrency ? diff.toLocaleString('en-US') + ' د.ع' : diff.toLocaleString('en-US')}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2 md:p-3 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-[99vw] xl:max-w-[1550px] 2xl:max-w-[1680px] h-[97vh] sm:h-auto sm:max-h-[96vh] flex flex-col overflow-hidden text-right dir-rtl">
        
        {/* Header - Compact, clean, and neatly aligned */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0 gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-emerald-600 text-white shadow-sm shrink-0">
              <Database className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-black tracking-wide text-white truncate">
                  {isAr ? 'استعلامات سيرفر Hostinger ومطابقة التطبيق' : 'Hostinger Server & App Comparison'}
                </h2>
                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Hostinger Direct
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons in header - organized and neat */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchServerTotals()}
              disabled={loading}
              className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
              title={isAr ? 'إعادة الاستعلام والمزامنة المباشرة من سيرفر Hostinger' : 'Refresh Server Query'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-[11px] sm:text-xs font-bold">{loading ? (isAr ? 'جاري الاستعلام...' : 'Loading...') : (isAr ? 'استعلام وتحديث' : 'Refresh')}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Information Notice Banner */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-[11px] sm:text-xs font-bold text-indigo-950 dark:text-indigo-200">
            <ArrowLeftRight className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <span className="font-black text-indigo-900 dark:text-indigo-100">تأكيد مطابقة البيانات:</span>{' '}
              بيانات عمود <span className="text-emerald-700 dark:text-emerald-400 font-black underline">السيرفر</span> مسحوبة مباشرة عبر استعلامات SQL حية من سيرفر Hostinger، بينما يعرض عمود <span className="text-indigo-700 dark:text-indigo-400 font-black underline">التطبيق</span> السجلات المحملة حالياً في ذاكرة التطبيق للتطابق الفوري.
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !data && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto animate-spin">
                <RefreshCw className="w-6 h-6" />
              </div>
              <p className="text-xs font-black text-slate-600 dark:text-slate-300">
                {isAr ? 'جاري الاتصال بسيرفر Hostinger وجلب البيانات حياً...' : 'Fetching live Hostinger server records...'}
              </p>
            </div>
          )}

          {data && (
            <>
              {/* Top Highlights Grid (First item = Cash Funds / Box on the right) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                {/* 1. Cash Funds / Box (الصندوق - أول خيار من اليمين) */}
                <div className="p-2.5 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border-2 border-teal-300 dark:border-teal-800/80 text-right shadow-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-teal-800 dark:text-teal-300">الصناديق (الصندوق)</span>
                    <Wallet className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.funds.totalBalance.toLocaleString('en-US')} د.ع
                  </div>
                  <div className="text-[10px] font-bold text-teal-700 dark:text-teal-400 mt-0.5">
                    سيرفر: {data.funds.count} | تطبيق: {localFundsCount}
                  </div>
                </div>

                {/* 2. Customers (الزبائن) */}
                <div className="p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-sky-700 dark:text-sky-300">الزبائن</span>
                    <Users className="w-4 h-4 text-sky-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.customers.total.toLocaleString('en-US')} زبون
                  </div>
                  <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mt-0.5 truncate">
                    واصل: {data.customers.totalPaid.toLocaleString('en-US')}
                  </div>
                </div>

                {/* 3. Payments (التسديدات) */}
                <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">التسديدات</span>
                    <Receipt className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.payments.totalAmount.toLocaleString('en-US')} د.ع
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {data.payments.totalCount} عملية تسديد
                  </div>
                </div>

                {/* 4. Sales & Lists (القوائم والمبيعات) */}
                <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300">القوائم والمبيعات</span>
                    <FileText className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.contracts.total.toLocaleString('en-US')} قائمة/عقد
                  </div>
                  <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                    إجمالي: {data.contracts.totalSalesAmount.toLocaleString('en-US')} د.ع
                  </div>
                </div>

                {/* 5. Reps (المندوبين) */}
                <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-blue-700 dark:text-blue-300">المندوبين</span>
                    <UserCheck className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.reps.total.toLocaleString('en-US')}
                  </div>
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">مندوب بالسيرفر</div>
                </div>

                {/* 6. Employees (الموظفين) */}
                <div className="p-2.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-purple-700 dark:text-purple-300">الموظفين</span>
                    <Building2 className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.employees.total.toLocaleString('en-US')}
                  </div>
                  <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 mt-0.5">موظف بالكادر</div>
                </div>

                {/* 7. Inventory (المخزن والمواد) */}
                <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-right">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black text-amber-700 dark:text-amber-300">المخزن</span>
                    <Boxes className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                    {data.inventory.totalQuantity.toLocaleString('en-US')}
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">{data.inventory.totalItems} نوع مادة</div>
                </div>
              </div>

              {/* Side-By-Side Comparison Table */}
              <div className="rounded-2xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                <div className="p-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                      جدول التدقيق والمقارنة (سيرفر Hostinger ↔ بيانات التطبيق)
                    </h3>
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 dir-ltr">
                    {new Date(data.timestamp).toLocaleTimeString('en-US')}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 font-black border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3">القسم / البيان</th>
                        <th className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-x border-emerald-200 dark:border-emerald-800/60">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            بيانات سيرفر Hostinger المباشرة (PostgreSQL)
                          </span>
                        </th>
                        <th className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 border-l border-indigo-200 dark:border-indigo-800/60">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            بيانات التطبيق الحالي (ذاكرة الجهاز)
                          </span>
                        </th>
                        <th className="p-3 text-center">حالة التطابق / الفارق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                      
                      {/* 1. Cash Funds Row - الصناديق المالية أولاً */}
                      <tr className="hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-colors">
                        <td className="p-3 font-black text-teal-800 dark:text-teal-300">
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-teal-600" />
                            <span>الصناديق المالية (الصندوق)</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي الرصيد: <span className="text-emerald-700 dark:text-emerald-400">{data.funds.totalBalance.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                            العدد: {data.funds.count} صندوق | {data.funds.transactionsCount} حركة
                          </div>
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي الرصيد: <span className="text-indigo-700 dark:text-indigo-400">{localFundsBalance.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                            العدد: {localFundsCount} صندوق
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.funds.totalBalance, localFundsBalance, true)}
                        </td>
                      </tr>

                      {/* 2. Customers Row - الزبائن */}
                      <tr className="hover:bg-sky-50/30 dark:hover:bg-sky-950/20 transition-colors">
                        <td className="p-3 font-black text-sky-700 dark:text-sky-300">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-sky-600" />
                            <span>الزبائن</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            عدد الزبائن: <span className="text-slate-900 dark:text-slate-100">{data.customers.total.toLocaleString('en-US')} زبون</span>
                          </div>
                          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                            الواصل: {data.customers.totalPaid.toLocaleString('en-US')} د.ع | الباقي: {data.customers.totalRemaining.toLocaleString('en-US')} د.ع
                          </div>
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            عدد الزبائن: <span className="text-slate-900 dark:text-slate-100">{displayLocalCustomersCount.toLocaleString('en-US')} زبون</span>
                          </div>
                          <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">
                            الواصل: {localPaidAmount.toLocaleString('en-US')} د.ع | الباقي: {localRemainingAmount.toLocaleString('en-US')} د.ع
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.customers.total, displayLocalCustomersCount)}
                        </td>
                      </tr>

                      {/* 3. Payments Row - التسديدات والمقبوضات */}
                      <tr className="hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors">
                        <td className="p-3 font-black text-emerald-800 dark:text-emerald-300">
                          <div className="flex items-center gap-2">
                            <Receipt className="w-4 h-4 text-emerald-600" />
                            <span>التسديدات والمقبوضات</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي التسديدات: <span className="text-emerald-700 dark:text-emerald-400">{data.payments.totalAmount.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                            عدد التسديدات: {data.payments.totalCount} عملية | تسديدات اليوم: {data.payments.todayAmount.toLocaleString('en-US')} د.ع
                          </div>
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي التسديدات: <span className="text-indigo-700 dark:text-indigo-400">{localPaymentsAmount.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                            عدد التسديدات: {localPaymentsCount} عملية
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.payments.totalAmount, localPaymentsAmount, true)}
                        </td>
                      </tr>

                      {/* 4. Sales & Contracts Row - القوائم والمبيعات */}
                      <tr className="hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors">
                        <td className="p-3 font-black text-indigo-700 dark:text-indigo-300">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-600" />
                            <span>القوائم والمبيعات (العقود)</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي المبيعات: <span className="text-emerald-700 dark:text-emerald-400">{data.contracts.totalSalesAmount.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-bold mt-0.5">
                            عدد القوائم والعقود: {data.contracts.total} | الباقي: {data.contracts.totalRemainingBalance.toLocaleString('en-US')} د.ع
                          </div>
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي المبيعات: <span className="text-indigo-700 dark:text-indigo-400">{localSalesAmount.toLocaleString('en-US')} د.ع</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-bold mt-0.5">
                            عدد القوائم والعقود: {localContractsCount} | الباقي: {localRemainingAmount.toLocaleString('en-US')} د.ع
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.contracts.totalSalesAmount, localSalesAmount, true)}
                        </td>
                      </tr>

                      {/* 5. Reps Row - المندوبين */}
                      <tr className="hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-colors">
                        <td className="p-3 font-black text-blue-700 dark:text-blue-300">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-blue-600" />
                            <span>المندوبين</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          {data.reps.total} مندوب مسجل بالسيرفر
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          {localRepsCount} مندوب في التطبيق
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.reps.total, localRepsCount)}
                        </td>
                      </tr>

                      {/* 6. Employees Row - الموظفين */}
                      <tr className="hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-colors">
                        <td className="p-3 font-black text-purple-700 dark:text-purple-300">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-purple-600" />
                            <span>الموظفين</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          {data.employees.total} موظف مسجل بالسيرفر
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          {localEmployeesCount} موظف في التطبيق
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.employees.total, localEmployeesCount)}
                        </td>
                      </tr>

                      {/* 7. Inventory Row - المخزن والمواد */}
                      <tr className="hover:bg-amber-50/30 dark:hover:bg-amber-950/20 transition-colors">
                        <td className="p-3 font-black text-amber-700 dark:text-amber-300">
                          <div className="flex items-center gap-2">
                            <Boxes className="w-4 h-4 text-amber-600" />
                            <span>المخزن والمواد</span>
                          </div>
                        </td>
                        <td className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 border-x border-emerald-100 dark:border-emerald-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي الكمية: {data.inventory.totalQuantity.toLocaleString('en-US')} قطعة
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                            عدد الأصناف: {data.inventory.totalItems} صنف
                          </div>
                        </td>
                        <td className="p-3 bg-indigo-50/30 dark:bg-indigo-950/10 border-l border-indigo-100 dark:border-indigo-900/40 font-black text-slate-900 dark:text-slate-100">
                          <div>
                            إجمالي الكمية: {localInventoryQuantity.toLocaleString('en-US')} قطعة
                          </div>
                          <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                            عدد الأصناف: {localInventoryItems} صنف
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {renderStatusBadge(data.inventory.totalQuantity, localInventoryQuantity)}
                        </td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyTable}
              disabled={!data}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم نسخ التقرير' : 'نسخ التقرير'}</span>
            </button>

            {onDeleteAllCustomersAndPayments && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeletingAll || loading}
                className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                title="تصفير وحذف جميع الزبائن والتسديدات للبدء من جديد"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>{isAr ? 'تصفير وحذف كل الزبائن' : 'Reset All Customers'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchServerTotals()}
              disabled={loading}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'جاري الاستعلام...' : 'تحديث استعلامات السيرفر'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[11px] sm:text-xs font-black transition-all cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

        {/* Delete All Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-right">
              <div className="flex items-center gap-3 text-rose-600 mb-3">
                <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60">
                  <AlertTriangle className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr ? 'تأكيد تصفير وحذف جميع الزبائن' : 'Confirm Reset All Customers'}
                </h3>
              </div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                {isAr
                  ? 'هل أنت متأكد تماماً من رغبتك في حذف وتصفير جميع الزبائن والمبيعات والتسديدات نهائياً من السيرفر والتطبيق للبدء من جديد وتنزيل ملف الزبائن؟'
                  : 'Are you sure you want to permanently delete all customers, sales, and payments from the server and app to start fresh and re-import?'}
              </p>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 mb-5 text-[11px] text-amber-800 dark:text-amber-300 font-bold">
                {isAr
                  ? '⚠️ ملاحظة: الصناديق المالية والمخزن وحسابات الموظفين والمندوبين لن تتأثر ولن يتم حذفها.'
                  : 'Note: Funds, inventory, employees, and reps will not be affected.'}
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingAll}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black transition-all cursor-pointer disabled:opacity-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDeleteAll}
                  disabled={isDeletingAll}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-black inline-flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDeletingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{isAr ? 'جاري التصفير والحذف...' : 'Resetting...'}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'نعم، حذف وتصفير الكل' : 'Yes, Delete All'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

