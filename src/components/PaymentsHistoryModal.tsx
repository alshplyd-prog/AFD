import React, { useState, useEffect, useRef } from 'react';
import { X, Receipt, Printer, Edit2, Trash2, Calendar, Filter, Search, FolderKanban, CheckSquare, Square, Zap, Lock, ShieldCheck, ChevronDown, DownloadCloud, Loader2, FileSpreadsheet, Share2, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { exportToExcelFile, ExcelSheetData } from '../lib/excelExportHelper';
import { shareCustomerPaymentsPdf, shareCustomerPaymentsOrDirectWhatsApp, shareGeneralPaymentsPdf, formatIraqiPhoneForWhatsApp, sharePaymentReceiptWhatsApp } from '../lib/pdfShareHelper';
import { PaymentRecord, Language, SalesRepresentative, InstallmentContract, CustomerList } from '../types';
import { numberToArabicWords } from '../lib/tafqeet';
import { DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';
import { formatPaymentDateTime, formatPaymentTime, getLocalDateString, getPaymentFormattedDateAndTime } from '../lib/dateUtils';
import { normalizeEntityName } from '../lib/nameHelpers';
import { getPaymentReceiptBalances } from '../lib/paymentCalculator';

interface PaymentsHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  payments: PaymentRecord[];
  contracts?: InstallmentContract[];
  customerLists?: CustomerList[];
  customerFilterId?: string | null;
  lang: Language;
  currentRep?: SalesRepresentative | null;
  onUpdatePayment?: (payment: PaymentRecord, newAmount: number, newNote?: string, newPaymentDate?: string, newRepName?: string) => Promise<void> | void;
  onDeletePayment?: (payment: PaymentRecord) => void;
  onDeleteMultiplePayments?: (payments: PaymentRecord[]) => Promise<void> | void;
  onPrintReceipt?: (receiptData: any) => void;
  onSettleExcessPayment?: (contractId: string, customerName?: string) => Promise<void> | void;
}

export const PaymentsHistoryModal: React.FC<PaymentsHistoryModalProps> = ({
  isOpen,
  onClose,
  payments,
  contracts = [],
  customerLists = [],
  customerFilterId,
  lang,
  currentRep,
  onUpdatePayment,
  onDeletePayment,
  onDeleteMultiplePayments,
  onPrintReceipt,
  onSettleExcessPayment,
}) => {
  const prevIsOpenRef = useRef(false);
  const prevCustomerFilterIdRef = useRef<string | null | undefined>(undefined);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [filterListId, setFilterListId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(() => getLocalDateString());
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());
  const [filterQuery, setFilterQuery] = useState<string>('');

  const [serverPayments, setServerPayments] = useState<PaymentRecord[] | null>(null);
  const [isFetchingFromServer, setIsFetchingFromServer] = useState<boolean>(false);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const handleSharePdf = async (target: 'whatsapp' | 'other' = 'whatsapp') => {
    if (isExportingPdf || filtered.length === 0) return;
    setIsExportingPdf(true);
    try {
      let result;
      if (customerFilterId) {
        const targetContract =
          activeContract ||
          contracts.find(
            (c) =>
              c &&
              (String(c.id).trim() === String(customerFilterId).trim() ||
                c.customerName === customerFilterId ||
                (c.customerName && normalizeEntityName(c.customerName) === normFilterId) ||
                (filtered[0]?.customerName && normalizeEntityName(c.customerName) === normalizeEntityName(filtered[0].customerName)))
          ) ||
          null;

        result = await shareCustomerPaymentsOrDirectWhatsApp({
          contract: targetContract,
          payments: filtered,
          lang,
          targetApp: target,
          forceAppsChooser: target === 'other',
        });
      } else {
        const selectedListObj = customerLists.find((l) => l.id === filterListId);
        result = await shareGeneralPaymentsPdf({
          payments: filtered,
          startDate,
          endDate,
          listName: filterListId !== 'all' ? selectedListObj?.name : undefined,
          lang,
        });
      }

      if (result && result.success) {
        if (result.method !== 'user_cancelled') {
          showToast(
            target === 'whatsapp'
              ? (isAr
                  ? 'تم تجهيز رابط الـ PDF وفتح محادثة واتساب الزبون'
                  : 'PDF link ready - Customer WhatsApp opened')
              : (isAr
                  ? 'تم تجهيز ملف مستند الـ PDF - اختر التطبيق المطلوب للمشاركة'
                  : 'PDF document file ready - Select app to share file'),
            'success'
          );
        }
      } else if (result?.error) {
        showToast(isAr ? 'تعذر إتمام المشاركة' : 'Failed to share', 'error');
      }
    } catch (err) {
      console.error('Export/Share failed:', err);
      showToast(isAr ? 'حدث خطأ أثناء المشاركة' : 'Error sharing', 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Initialize dates and filter ONLY when modal freshly opens or customerFilterId changes
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    const isJustOpening = !prevIsOpenRef.current;
    const isCustomerFilterChanged = customerFilterId !== prevCustomerFilterIdRef.current;

    if (isJustOpening || isCustomerFilterChanged) {
      prevIsOpenRef.current = true;
      prevCustomerFilterIdRef.current = customerFilterId;
      setServerPayments(null);

      handleFetchAllFromServer();

      if (customerFilterId) {
        // When opened for a specific customer ("عرض التسديدات"), show ALL payments across all dates for this customer
        setStartDate('');
        setEndDate('');
        setFilterListId('all');
        setFilterQuery('');
      } else {
        const today = getLocalDateString();
        setStartDate(today);
        setEndDate(today);
        setFilterListId('all');
      }
    }
  }, [isOpen, customerFilterId]);

  // Mobile Back Button / Gesture support (popstate)
  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ modal: 'payments_history' }, '');
    const handlePopState = () => {
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen]);

  const handleFetchAllFromServer = async () => {
    setIsFetchingFromServer(true);
    try {
      const res = await fetch('/api/payments');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setServerPayments(data);
        }
      }
    } catch (e) {
      console.warn('Error fetching all payments from server:', e);
    } finally {
      setIsFetchingFromServer(false);
    }
  };

  // Payment editing state for Admin
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editRepName, setEditRepName] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState<boolean>(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPaymentIds([]);
      setConfirmBulkDelete(false);
      setIsBulkDeleting(false);
      setEditingPayment(null);
      setServerPayments(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isAr = lang === 'ar';
  const isAdmin = currentRep?.role === 'admin';
  const canEditPayment = isAdmin;
  const canDelete = isAdmin || currentRep?.canDelete === true;

  // Map contract to fast lookup
  const contractMap = new Map<string, InstallmentContract>();
  (contracts || []).forEach((c) => {
    if (!c) return;
    if (c.id) contractMap.set(c.id, c);
    if (c.customerName) {
      contractMap.set(c.customerName, c);
      const norm = normalizeEntityName(c.customerName);
      if (norm) contractMap.set(norm, c);
    }
  });

  const listMap = new Map<string, CustomerList>();
  (customerLists || []).forEach((l) => {
    if (l && l.id) listMap.set(l.id, l);
  });

  const activePaymentsList = serverPayments || payments;
  const safePayments = Array.isArray(activePaymentsList) ? activePaymentsList.filter(Boolean) : [];

  // Active Contract and Filter matching identifiers
  const normFilterId = normalizeEntityName(customerFilterId);
  const activeContract = customerFilterId
    ? contracts.find(
        (c) =>
          c && (
            String(c.id).trim() === String(customerFilterId).trim() ||
            c.customerName === customerFilterId ||
            (c.customerName && normalizeEntityName(c.customerName) === normFilterId)
          )
      )
    : null;

  // Build strict lookup sets for target customer
  const targetContractIds = new Set<string>();
  const targetCustomerNames = new Set<string>();
  const targetNormalizedNames = new Set<string>();

  if (customerFilterId) {
    targetContractIds.add(String(customerFilterId).trim());
    targetCustomerNames.add(String(customerFilterId).trim().toLowerCase());
    if (normFilterId) targetNormalizedNames.add(normFilterId);
  }
  if (activeContract) {
    if (activeContract.id) targetContractIds.add(String(activeContract.id).trim());
    if (activeContract.customerName) {
      targetCustomerNames.add(activeContract.customerName.trim().toLowerCase());
      const norm = normalizeEntityName(activeContract.customerName);
      if (norm) targetNormalizedNames.add(norm);
    }
  }
  if (targetNormalizedNames.size > 0) {
    contracts.forEach((c) => {
      if (!c) return;
      const cNorm = normalizeEntityName(c.customerName);
      if (cNorm && targetNormalizedNames.has(cNorm)) {
        if (c.id) targetContractIds.add(String(c.id).trim());
      }
    });
  }

  // Filter logic
  const filtered = safePayments.filter((p) => {
    if (!p) return false;

    // 0. STRICT CUSTOMER FILTER (When viewing payments for a specific customer "عرض تسديدات")
    if (customerFilterId) {
      const pContractId = p.contractId ? String(p.contractId).trim() : '';
      const pCustName = p.customerName ? String(p.customerName).trim().toLowerCase() : '';
      const normPCust = normalizeEntityName(p.customerName);

      const matchesId = Boolean(pContractId && targetContractIds.has(pContractId));
      const matchesName = Boolean(
        (pCustName && targetCustomerNames.has(pCustName)) ||
        (normPCust && targetNormalizedNames.has(normPCust))
      );

      let matchesViaContract = false;
      if (!matchesId && !matchesName && pContractId) {
        const linkedContract = contractMap.get(pContractId);
        if (linkedContract) {
          const linkedNorm = normalizeEntityName(linkedContract.customerName);
          if (
            (linkedContract.id && targetContractIds.has(String(linkedContract.id).trim())) ||
            (linkedNorm && targetNormalizedNames.has(linkedNorm))
          ) {
            matchesViaContract = true;
          }
        }
      }

      if (!matchesId && !matchesName && !matchesViaContract) {
        return false;
      }
    }

    // 1. List filter
    if (filterListId !== 'all') {
      const contract = (p.contractId ? contractMap.get(p.contractId) : null) || 
                       (p.customerName ? contractMap.get(p.customerName) : null) ||
                       (p.customerName ? contractMap.get(normalizeEntityName(p.customerName)) : null);
      if (!contract || contract.listId !== filterListId) {
        return false;
      }
    }

    // 2. Date range filter
    if (startDate || endDate) {
      if (!p.paymentDate) return false;
      const pDate = new Date(p.paymentDate);
      if (isNaN(pDate.getTime())) return false;
      if (startDate) {
        const sDate = new Date(startDate);
        sDate.setHours(0, 0, 0, 0);
        if (pDate < sDate) return false;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        eDate.setHours(23, 59, 59, 999);
        if (pDate > eDate) return false;
      }
    }

    // 3. Search query filter
    if (filterQuery && filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      const contract = (p.contractId ? contractMap.get(p.contractId) : null) || 
                       (p.customerName ? contractMap.get(p.customerName) : null) ||
                       (p.customerName ? contractMap.get(normalizeEntityName(p.customerName)) : null);
      const custName = p.customerName || contract?.customerName || '';
      const matchCustomer = custName.toLowerCase().includes(q);
      const matchNote = p.note && (p.note || '').toLowerCase().includes(q);
      const matchRep = p.repName && (p.repName || '').toLowerCase().includes(q);
      if (!matchCustomer && !matchNote && !matchRep) return false;
    }

    return true;
  });

  const startEditPayment = (p: PaymentRecord) => {
    setEditingPayment(p);
    setEditAmount(String(p.amountPaid ?? p.amount ?? ''));
    setEditNote(p.note || '');
    setEditDate(p.paymentDate ? getLocalDateString(p.paymentDate) : getLocalDateString());
    setEditRepName(p.repName || '');
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !onUpdatePayment) return;
    const num = Number(editAmount);
    if (isNaN(num) || num <= 0) {
      alert(isAr ? 'يرجى إدخال مبلغ صحيح أكبر من الصفر' : 'Please enter a valid amount greater than zero');
      return;
    }
    setIsSavingEdit(true);
    try {
      const targetDate = editDate ? editDate.trim() : (editingPayment.paymentDate || getLocalDateString());
      await onUpdatePayment(editingPayment, num, editNote.trim(), targetDate, editRepName.trim());
      setEditingPayment(null);
    } catch (err) {
      console.error('Failed to save edited payment:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const totalSum = filtered.reduce((sum, p) => sum + (Number(p.amountPaid ?? (p as any).amount ?? 0) || 0), 0);

  const todayPaymentsSum = safePayments.reduce((sum, p) => {
    if (!p) return sum;
    const today = getLocalDateString();
    const pDate = p.paymentDate ? p.paymentDate.split('T')[0] : '';
    if (pDate === today) {
      return sum + (Number(p.amountPaid ?? (p as any).amount ?? 0) || 0);
    }
    return sum;
  }, 0);

  const expectedInstallmentTotal = activeContract
    ? ((activeContract.totalPrice || 0) - (activeContract.advancePayment || 0) > 0
        ? (activeContract.totalPrice || 0) - (activeContract.advancePayment || 0)
        : (activeContract.totalPaid || 0) + (activeContract.remainingBalance || 0))
    : 0;
  const excessAmount =
    activeContract && totalSum > expectedInstallmentTotal && expectedInstallmentTotal > 0
      ? totalSum - expectedInstallmentTotal
      : 0;
  const isExcess = excessAmount > 0;

  const targetCustomerContract =
    activeContract ||
    (customerFilterId
      ? contracts.find(
          (c) =>
            c &&
            (String(c.id).trim() === String(customerFilterId).trim() ||
              c.customerName === customerFilterId ||
              (c.customerName && normalizeEntityName(c.customerName) === normFilterId) ||
              (filtered[0]?.customerName && normalizeEntityName(c.customerName) === normalizeEntityName(filtered[0].customerName)))
        )
      : null);
  const customerPhone = targetCustomerContract?.customerPhone;
  const hasCustomerPhone = Boolean(formatIraqiPhoneForWhatsApp(customerPhone));

  const formatMoney = (val: number | undefined | null) => {
    return (Number(val) || 0).toLocaleString('en-US') + (isAr ? ' د.ع' : ' IQD');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-6xl xl:max-w-7xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Top Bar without big title */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              {isAr ? 'إجمالي المقبوضات:' : 'Total Received:'}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-xs font-black dir-ltr">
              {formatMoney(totalSum)} ({filtered.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!customerFilterId && (
              <button
                type="button"
                onClick={() => handleSharePdf('other')}
                disabled={isExportingPdf || filtered.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-black text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
                title={isAr ? 'مشاركة سجل التسديدات العام كملف PDF عبر التطبيقات (واتساب، تليكرام...)' : 'Share general payments as PDF via apps'}
              >
                <Share2 className={`w-3.5 h-3.5 ${isExportingPdf ? 'animate-spin' : ''}`} />
                <span>
                  {isExportingPdf
                    ? (isAr ? 'جاري تجهيز PDF...' : 'Processing...')
                    : (isAr ? 'مشاركة التطبيقات (PDF)' : 'Share via Apps (PDF)')}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar or Customer Info Header */}
        {customerFilterId ? (
          <div className="p-3 bg-teal-50/80 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-800 flex flex-wrap items-center justify-between gap-2 text-xs font-black text-teal-900 dark:text-teal-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse" />
              <span>
                {isAr
                  ? `التسديدات الخاصة بالزبون: ${activeContract?.customerName || payments[0]?.customerName || customerFilterId || 'المحدد'}`
                  : `Payments for: ${activeContract?.customerName || payments[0]?.customerName || customerFilterId || ''}`}
              </span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {isExcess && (
                <span className="font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 text-xs">
                  {isAr ? `فائض بحوزة المندوب: ${formatMoney(excessAmount)}` : `Excess with rep: ${formatMoney(excessAmount)}`}
                </span>
              )}
              {isExcess && onSettleExcessPayment && activeContract && (
                <button
                  type="button"
                  onClick={() => onSettleExcessPayment(activeContract.id, activeContract.customerName)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                  title={isAr ? 'تسوية وتصفير الحساب فوراً وإرجاع الفائض' : 'Settle excess payment'}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isAr ? 'تسوية وتصفير الحساب' : 'Settle Account'}</span>
                </button>
              )}
              {/* Customer payments PDF share button */}
              <button
                type="button"
                onClick={() => handleSharePdf('other')}
                disabled={isExportingPdf || filtered.length === 0}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                title={isAr ? 'مشاركة كشف التسديدات كملف PDF' : 'Share payments PDF'}
              >
                <Share2 className={`w-3.5 h-3.5 ${isExportingPdf ? 'animate-spin' : ''}`} />
                <span>
                  {isExportingPdf
                    ? (isAr ? 'جاري تجهيز PDF...' : 'Generating PDF...')
                    : (isAr ? 'مشاركة الكشف' : 'Share Statement')}
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2 bg-slate-100/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 print:hidden shrink-0 space-y-1.5">
            {/* Row 1: The 3 Filter Controls (List, From Date, To Date) strictly in 1 row */}
            <div className="grid grid-cols-3 gap-1 text-[10px] sm:text-[11px] w-full">
              {/* 1. Customer List Selector */}
              <div className="relative flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs w-full min-w-0">
                <span className="font-extrabold text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] shrink-0">
                  {isAr ? 'القائمة:' : 'List:'}
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-[10px] sm:text-[11px] truncate min-w-0 flex-1 text-center">
                  {filterListId === 'all'
                    ? (isAr ? 'جميع القوائم' : 'All Lists')
                    : (customerLists.find((l) => l.id === filterListId)?.name || (isAr ? 'قائمة' : 'List'))}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 pointer-events-none" />
                <select
                  value={filterListId}
                  onChange={(e) => setFilterListId(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  title={isAr ? 'تحديد القائمة' : 'Select List'}
                >
                  <option value="all">{isAr ? 'جميع القوائم' : 'All Lists'}</option>
                  {customerLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Start Date */}
              <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs w-full min-w-0">
                <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
                  <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                  <span className="text-[8.5px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {isAr ? 'من:' : 'From:'}
                  </span>
                </div>
                <span className="font-mono font-bold text-[8px] xs:text-[9px] sm:text-[10.5px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
                  {startDate ? startDate.replace(/-/g, '/') : (isAr ? '----/--/--' : '----/--/--')}
                </span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  title={isAr ? 'من تاريخ' : 'From Date'}
                />
              </div>

              {/* 3. End Date */}
              <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs w-full min-w-0">
                <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
                  <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                  <span className="text-[8.5px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {isAr ? 'إلى:' : 'To:'}
                  </span>
                </div>
                <span className="font-mono font-bold text-[8px] xs:text-[9px] sm:text-[10.5px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
                  {endDate ? endDate.replace(/-/g, '/') : (isAr ? '----/--/--' : '----/--/--')}
                </span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  title={isAr ? 'إلى تاريخ' : 'To Date'}
                />
              </div>
            </div>

            {/* Row 2: Search Box and Bulk/Reset actions */}
            <div className="flex items-center gap-1.5 w-full">
              {/* Search Query */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-300 dark:border-slate-700 flex-1 min-w-0 shadow-2xs">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={isAr ? 'بحث عن اسم زبون، ملاحظة...' : 'Search...'}
                  className="w-full bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none placeholder:text-slate-400 text-[11px]"
                />
              </div>

              {/* Reset Filters button if active */}
              {(filterListId !== 'all' || startDate || endDate || filterQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterListId('all');
                    setStartDate('');
                    setEndDate('');
                    setFilterQuery('');
                  }}
                  className="px-2 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 text-[10px] sm:text-[11px] transition-colors shrink-0 whitespace-nowrap cursor-pointer shadow-2xs"
                >
                  {isAr ? 'إعادة ضبط' : 'Reset'}
                </button>
              )}

              {canDelete && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPaymentIds.length === filtered.length) {
                      setSelectedPaymentIds([]);
                    } else {
                      setSelectedPaymentIds(filtered.map((p) => p.id));
                    }
                  }}
                  className={`px-2 py-1 rounded-xl font-extrabold text-[10px] sm:text-[11px] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer shrink-0 whitespace-nowrap ${
                    selectedPaymentIds.length === filtered.length && filtered.length > 0
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700'
                  }`}
                >
                  {selectedPaymentIds.length === filtered.length && filtered.length > 0 ? (
                    <>
                      <CheckSquare className="w-3 h-3" />
                      <span>{isAr ? 'إلغاء الكل' : 'Deselect'}</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3 h-3" />
                      <span>{isAr ? 'تحديد الكل' : 'Select'} ({filtered.length})</span>
                    </>
                  )}
                </button>
              )}

              {canDelete && selectedPaymentIds.length > 0 && !confirmBulkDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmBulkDelete(true)}
                  className="px-2.5 py-1 rounded-xl font-black text-[10px] sm:text-[11px] bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1 shadow-2xs cursor-pointer shrink-0 whitespace-nowrap animate-in fade-in"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{isAr ? `حذف (${selectedPaymentIds.length})` : `Delete (${selectedPaymentIds.length})`}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {canDelete && selectedPaymentIds.length > 0 && (
            <div className="mb-3 p-3 bg-rose-500/10 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-800 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                <p className="text-xs font-black text-rose-800 dark:text-rose-200">
                  {isAr
                    ? `تم تحديد (${selectedPaymentIds.length}) دفعة للتسديد`
                    : `Selected (${selectedPaymentIds.length}) payments`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentIds([])}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300"
                >
                  {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                </button>
                {confirmBulkDelete ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                      {isAr ? 'تأكيد حذف الكل بشكل نهائي؟' : 'Confirm bulk deletion?'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkDelete(false)}
                      disabled={isBulkDeleting}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 border border-slate-200 dark:border-slate-700"
                    >
                      {isAr ? 'تراجع' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!onDeletePayment && !onDeleteMultiplePayments) return;
                        setIsBulkDeleting(true);
                        try {
                          const toDelete = filtered.filter((p) => selectedPaymentIds.includes(p.id));
                          if (toDelete.length > 0) {
                            if (onDeleteMultiplePayments) {
                              await onDeleteMultiplePayments(toDelete);
                            } else if (onDeletePayment) {
                              for (const p of toDelete) {
                                await onDeletePayment(p);
                              }
                            }
                          }
                          setSelectedPaymentIds([]);
                        } catch (err) {
                          console.error('Failed to bulk delete payments:', err);
                        } finally {
                          setIsBulkDeleting(false);
                          setConfirmBulkDelete(false);
                        }
                      }}
                      disabled={isBulkDeleting}
                      className="px-3 py-1.5 rounded-lg text-xs font-black bg-rose-600 text-white shadow-md flex items-center gap-1"
                    >
                      {isBulkDeleting ? (
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                      <span>{isAr ? 'نعم، حذف النهائي' : 'Yes, Delete'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-700 text-white shadow-md flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'حذف المحدد' : 'Delete Selected'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {filtered.length > 0 ? (
            <div className="overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xs max-h-[calc(88vh-200px)]">
              <table className="w-full text-right text-xs min-w-[760px] border-collapse">
                <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-xs">
                  <tr className="text-slate-700 dark:text-slate-300 font-black text-xs">
                    {canDelete && (
                      <th className="py-3 px-3 text-center w-10 sticky top-0 bg-slate-100 dark:bg-slate-900">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedPaymentIds.length === filtered.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPaymentIds(filtered.map((p) => p.id));
                            } else {
                              setSelectedPaymentIds([]);
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'الزبون' : 'Customer'}
                    </th>
                    <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'المبلغ' : 'Amount'}
                    </th>
                    <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'التاريخ والوقت' : 'Date & Time'}
                    </th>
                    <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'المحصل' : 'Collector'}
                    </th>
                    <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'القائمة' : 'List'}
                    </th>
                    <th className="py-3 px-3.5 text-center sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                      {isAr ? 'الإجراءات' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-800 dark:text-slate-200">
                  {filtered.map((p) => {
                    const isDeletingThis = deletingPaymentId === p.id;
                    const contract = (p.contractId ? contractMap.get(p.contractId) : null) || 
                                     (p.customerName ? contractMap.get(p.customerName) : null) ||
                                     (p.customerName ? contractMap.get(normalizeEntityName(p.customerName)) : null);
                    const listName = contract?.listName || (contract?.listId ? listMap.get(contract.listId)?.name : '');
                    const customerDisplayName = p.customerName || contract?.customerName || (isAr ? 'غير محدد' : 'Unassigned');

                    if (isDeletingThis) {
                      return (
                        <tr
                          key={p.id}
                          className="bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800"
                        >
                          <td colSpan={7} className="p-3 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-3">
                              <span className="font-extrabold text-xs text-rose-800 dark:text-rose-200">
                                {isAr
                                  ? `حذف الوصل للزبون "${customerDisplayName}" بمبلغ (${formatMoney(p.amountPaid)})؟`
                                  : `Delete payment for "${customerDisplayName}"?`}
                              </span>
                              <button
                                type="button"
                                onClick={() => setDeletingPaymentId(null)}
                                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                              >
                                {isAr ? 'تراجع' : 'Cancel'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onDeletePayment) {
                                    onDeletePayment(p);
                                    setDeletingPaymentId(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-2xs"
                              >
                                {isAr ? 'تأكيد الحذف' : 'Confirm'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-50/90 dark:hover:bg-slate-850 transition-colors whitespace-nowrap"
                      >
                        {canDelete && (
                          <td className="py-2.5 px-3 text-center w-10">
                            <input
                              type="checkbox"
                              checked={selectedPaymentIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPaymentIds((prev) => [...prev, p.id]);
                                } else {
                                  setSelectedPaymentIds((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Customer */}
                        <td className="py-2.5 px-3.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {customerDisplayName}
                        </td>

                        {/* Amount (NO + sign) */}
                        <td className="py-2.5 px-3.5 font-black text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap dir-ltr text-right">
                          {formatMoney(p.amountPaid)}
                        </td>

                        {/* Date & Time */}
                        <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 text-xs font-mono whitespace-nowrap dir-ltr text-right">
                          {formatPaymentDateTime(p, isAr)}
                        </td>

                        {/* Collector / Rep */}
                        <td className="py-2.5 px-3.5 font-bold text-slate-700 dark:text-slate-300 text-xs whitespace-nowrap">
                          {p.repName ? (
                            <span className="inline-flex items-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/70 px-2 py-0.5 rounded-md">
                              {p.repName}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* List Name */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {listName ? (
                            <span className="inline-block bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-200 text-[11px] font-bold px-2 py-0.5 rounded-md">
                              {listName}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Actions: WhatsApp Share, Print, Edit, Delete */}
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* WhatsApp Text Receipt Share button */}
                            <button
                              type="button"
                              onClick={async () => {
                                const ok = await sharePaymentReceiptWhatsApp({
                                  payment: p,
                                  contract,
                                  allPayments: safePayments,
                                  shopTitle: 'الكرار للموبايل والتقسيط',
                                });
                                if (ok) {
                                  showToast(
                                    isAr
                                      ? 'تم فتح الواتساب مع الوصل ورابط PDF'
                                      : 'WhatsApp opened with text receipt & PDF link',
                                    'success'
                                  );
                                }
                              }}
                              className="p-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                              title={isAr ? 'مشاركة وصل نصي للدفعة عبر واتساب' : 'Share text receipt via WhatsApp'}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>

                            {/* Print Receipt button - matches screenshot styling */}
                            {onPrintReceipt && contract && (
                              <button
                                type="button"
                                onClick={() => {
                                  const dStr = p.paymentDate ? getLocalDateString(p.paymentDate) : getLocalDateString();
                                  const tStr = formatPaymentTime(p, isAr);
                                  const snapshot = getPaymentReceiptBalances(p, contract, payments);
                                  const targetListId = (p as any)?.listId || (p as any)?.list_id || contract?.listId || (contract as any)?.list_id;
                                  const rawListName = (p as any)?.listName || (p as any)?.list_name || contract?.listName || (contract as any)?.list_name;
                                  const normListName = rawListName ? String(rawListName).trim().toLowerCase() : '';
                                  const linkedList = (targetListId ? listMap.get(targetListId) : null) || customerLists.find((l) => {
                                    const lId = l.id || (l as any)._id;
                                    const lName = l.name ? String(l.name).trim().toLowerCase() : '';
                                    if (targetListId && String(lId) === String(targetListId)) return true;
                                    if (normListName && lName === normListName) return true;
                                    return false;
                                  });
                                  const receiptTemplate = (linkedList as any)?.receiptTemplate || 
                                                          (linkedList as any)?.receipt_template || 
                                                          (contract as any)?.receiptTemplate || 
                                                          (contract as any)?.receipt_template || 
                                                          'template_1';
                                  onPrintReceipt({
                                    shopTitle: 'الكرار للموبايل',
                                    receiptNo: receiptTemplate === 'template_2' ? '' : '1',
                                    customerName: p.customerName || contract.customerName || 'زبون',
                                    itemName: receiptTemplate === 'template_2' ? '' : (contract.itemName || 'قسط'),
                                    totalPrice: snapshot.totalPrice || contract.totalPrice || 0,
                                    totalPaid: snapshot.totalPaid,
                                    remainingBalance: snapshot.remainingBalance,
                                    paidAmount: snapshot.paidAmount,
                                    amountInWords: numberToArabicWords(snapshot.paidAmount),
                                    dateStr: dStr,
                                    timeStr: tStr,
                                    isDuplicate: true,
                                    warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
                                    template: receiptTemplate,
                                  });
                                }}
                                className="p-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                                title={isAr ? 'حفظ وطباعة' : 'Save & Print'}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}

                            {/* Edit button (Admin only) */}
                            {canEditPayment && onUpdatePayment && (
                              <button
                                type="button"
                                onClick={() => startEditPayment(p)}
                                className="p-1.5 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                                title={isAr ? 'تعديل الدفعة (المدير)' : 'Edit Payment (Admin)'}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Delete button */}
                            {canDelete && onDeletePayment && (
                              <button
                                type="button"
                                onClick={() => setDeletingPaymentId(p.id)}
                                className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title={isAr ? 'حذف' : 'Delete'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 font-medium text-xs">
              {isAr ? 'لا توجد سجلات مقبوضات تطابق الفلترة المحددة' : 'No payment records found for this filter'}
            </div>
          )}
        </div>

        {/* Edit Payment Modal (Admin Only) */}
        {editingPayment && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150 dir-rtl">
            <div
              className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md shadow-2xl border border-amber-200 dark:border-amber-800/80 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 bg-amber-500 text-white">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-4 h-4" />
                  <span className="text-sm font-black">
                    {isAr ? 'تعديل الدفعة (صلاحية المدير)' : 'Edit Payment (Admin)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  disabled={isSavingEdit}
                  className="p-1 rounded-xl text-white/80 hover:text-white hover:bg-amber-600/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                {/* Customer name info badge */}
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? 'اسم الزبون:' : 'Customer:'}
                  </span>
                  <span className="font-black text-slate-800 dark:text-slate-100">
                    {editingPayment.customerName || contractMap.get(editingPayment.contractId)?.customerName || (isAr ? 'غير محدد' : 'Unassigned')}
                  </span>
                </div>

                {/* Amount Input */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                    {isAr ? 'المبلغ المستلم (د.ع)' : 'Amount Paid (IQD)'}
                  </label>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base font-black dir-ltr text-right focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  {Number(editAmount) > 0 && (
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 dir-ltr text-right">
                      {Number(editAmount).toLocaleString('en-US')} {isAr ? 'دينار عراقي' : 'IQD'}
                    </p>
                  )}
                </div>

                {/* Date Input */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                    {isAr ? 'تاريخ الدفعة' : 'Payment Date'}
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Rep / Collector Name */}
                <div>
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-200 mb-1">
                    {isAr ? 'المحصل / المندوب' : 'Collector / Rep'}
                  </label>
                  <input
                    type="text"
                    value={editRepName}
                    onChange={(e) => setEditRepName(e.target.value)}
                    placeholder={isAr ? 'اسم المحصل' : 'Collector name'}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setEditingPayment(null)}
                    disabled={isSavingEdit}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit || !Number(editAmount)}
                    className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSavingEdit ? (
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckSquare className="w-3.5 h-3.5" />
                    )}
                    <span>{isAr ? 'حفظ التعديل' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
