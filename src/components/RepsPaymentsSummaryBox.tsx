import React, { useState, useEffect, useMemo } from 'react';
import { Wallet, UserCheck, Calendar, Filter, X, ChevronLeft, Receipt, FolderKanban, AlertCircle, Phone, CheckCircle2, Printer, FileSpreadsheet, Download, ExternalLink, FileText, Share2, MessageCircle } from 'lucide-react';
import { SalesRepresentative, PaymentRecord, InstallmentContract, CustomerList, Language } from '../types';
import { silentIframePrint, openUniversalPdfPrintWindow, directPrintReceipt, DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';
import { RepReceiptModal, RepReceiptData, directPrintRepReceipt } from './RepReceiptModal';
import { ReceiptModal, ReceiptData } from './ReceiptModal';
import { numberToArabicWords } from '../lib/tafqeet';
import { getPaymentFormattedDateAndTime } from '../lib/dateUtils';
import { getPaymentReceiptBalances } from '../lib/paymentCalculator';
import { normalizeEntityName } from '../lib/nameHelpers';
import { formatIraqiPhoneForWhatsApp } from '../lib/pdfShareHelper';

interface RepsPaymentsSummaryBoxProps {
  currentRep: SalesRepresentative | null;
  reps: SalesRepresentative[];
  payments: PaymentRecord[];
  contracts: InstallmentContract[];
  customerLists: CustomerList[];
  selectedListId?: string;
  lang: Language;
  onClose?: () => void;
}

const getLocalDateString = (d: Date = new Date()): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const RepsPaymentsSummaryBox: React.FC<RepsPaymentsSummaryBoxProps> = ({
  currentRep,
  reps,
  payments,
  contracts,
  customerLists,
  selectedListId,
  lang,
  onClose,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = !currentRep || currentRep.role === 'admin';
  const isSupervisorOrAdmin = !currentRep || currentRep.role === 'admin' || currentRep.role === 'supervisor';

  // Internal list selection state - defaults to 'all' so supervisors/admins see all their accessible lists immediately
  const [boxListId, setBoxListId] = useState<string>('all');

  // Date range state - defaults to today so today's collections are displayed and printed by default
  const [startDate, setStartDate] = useState<string>(() => getLocalDateString());
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());

  // Selected rep detail modal state
  const [selectedRepDetails, setSelectedRepDetails] = useState<SalesRepresentative | null>(null);

  // Rep Receipt Modal state
  const [activeRepReceipt, setActiveRepReceipt] = useState<RepReceiptData | null>(null);
  const [isRepReceiptModalOpen, setIsRepReceiptModalOpen] = useState<boolean>(false);

  // Single Customer Payment Receipt Modal state
  const [activePaymentReceipt, setActivePaymentReceipt] = useState<ReceiptData | null>(null);
  const [isPaymentReceiptModalOpen, setIsPaymentReceiptModalOpen] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  // Mobile Back Button / popstate handling for rep details modal
  useEffect(() => {
    if (!selectedRepDetails) return;
    window.history.pushState({ modal: 'rep_payments_details' }, '');
    const handlePopState = () => {
      setSelectedRepDetails(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedRepDetails]);

  // Date quick preset handler
  const setQuickPreset = (preset: 'today' | 'yesterday' | 'month' | 'all') => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'yesterday') {
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      const yY = yDate.getFullYear();
      const yM = String(yDate.getMonth() + 1).padStart(2, '0');
      const yD = String(yDate.getDate()).padStart(2, '0');
      const yStr = `${yY}-${yM}-${yD}`;
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'month') {
      const firstDayStr = `${yyyy}-${mm}-01`;
      setStartDate(firstDayStr);
      setEndDate(todayStr);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Filter lists based on representative permissions (strictly respected for all accounts)
  const visibleLists = customerLists.filter((list) => {
    if (!currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
      return true;
    }
    return currentRep.allowedListIds.includes(list.id);
  });

  const handlePrintRepReceipt = (
    rep: SalesRepresentative,
    totalCollected: number,
    paymentsCount: number = 0,
    rawPaymentsList: PaymentRecord[] = []
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const printDate = getLocalDateString(now);

    const fromDateDisplay = startDate ? startDate : (isAr ? 'البداية' : 'All Past');
    const toDateDisplay = endDate ? endDate : (isAr ? 'اليوم' : 'Today');

    const formattedPaymentsList = rawPaymentsList.map((p) => {
      const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);

      return {
        customerName: p.customerName || (isAr ? 'زبون' : 'Customer'),
        amount: Number(p.amountPaid ?? p.amount ?? 0),
        dateStr: dateStr,
        timeStr: timeStr,
        note: cleanNote,
      };
    });

    const repReceipt: RepReceiptData = {
      repName: rep.name,
      fromDateStr: fromDateDisplay,
      toDateStr: toDateDisplay,
      paymentsCount: paymentsCount || rawPaymentsList.length,
      totalCollected: totalCollected,
      amountInWords: numberToArabicWords(totalCollected),
      printedBy: currentRep?.name || 'المدير',
      dateStr: printDate,
      timeStr: timeStr,
      paymentsList: formattedPaymentsList,
    };

    // Direct Instant Print without preview modal (same as collection receipt)
    directPrintRepReceipt(repReceipt);
  };

  const handleSendPaymentWhatsApp = (p: PaymentRecord) => {
    const amountNum = Number(p.amountPaid ?? (p as any).amount ?? 0);
    const amountDigits = `${amountNum.toLocaleString('en-US')} د.ع`;
    const amountWords = `فقط ${numberToArabicWords(amountNum)} لا غير`;
    const customerDisplayName = p.customerName || (isAr ? 'زبون' : 'Customer');
    const { dateStr, timeStr } = getPaymentFormattedDateAndTime(p, isAr);
    const fullDate = `${dateStr} ${timeStr}`.trim();

    const targetContract = contracts.find(
      (c) =>
        c &&
        (c.id === p.contractId ||
          c.customerName === p.customerName ||
          normalizeEntityName(c.customerName) === normalizeEntityName(p.customerName))
    );

    let remainingInfo = '';
    if (targetContract) {
      try {
        const snapshot = getPaymentReceiptBalances(p, targetContract, payments);
        if (typeof snapshot.remainingBalance === 'number') {
          remainingInfo = `\n💳 *المتبقي بعد التسديد:* ${snapshot.remainingBalance.toLocaleString('en-US')} د.ع`;
        }
      } catch (err) {
        // ignore
      }
    }

    const message = `*وصل استلام تسديد* 🧾
━━━━━━━━━━━━━━━
👤 *اسم الزبون:* ${customerDisplayName}
💵 *الواصل:* ${amountDigits}
🔢 *المبلغ رقماً:* ${amountDigits}
✍️ *المبلغ كتابة:* ${amountWords}
📅 *التاريخ:* ${fullDate}${targetContract?.itemName ? `\n📦 *المادة:* ${targetContract.itemName}` : ''}${remainingInfo}
━━━━━━━━━━━━━━━
_الكرار للموبايل والتقسيط_`.trim();

    const rawPhone = targetContract?.customerPhone || (targetContract as any)?.phone || (p as any)?.customerPhone;
    const cleanPhone = formatIraqiPhoneForWhatsApp(rawPhone);
    const encodedText = encodeURIComponent(message);

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    showToast(isAr ? 'جاري فتح تطبيق واتساب لإرسال الوصل...' : 'Opening WhatsApp...', 'success');

    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (isMobile) {
      const waScheme = cleanPhone
        ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
        : `whatsapp://send?text=${encodedText}`;
      window.location.href = waScheme;
      setTimeout(() => {
        window.open(waUrl, '_blank');
      }, 500);
    } else {
      window.open(waUrl, '_blank');
    }
  };

  const handlePrintAllRepsSummary = (
    totalCollectedAll: number,
    statsList: typeof activeRepStats
  ) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const printDate = getLocalDateString(now);

    const fromDateDisplay = startDate ? startDate : (isAr ? 'البداية' : 'All Past');
    const toDateDisplay = endDate ? endDate : (isAr ? 'اليوم' : 'Today');

    const summaryReceipt: RepReceiptData = {
      shopTitle: '',
      repName: 'جميع المندوبين',
      fromDateStr: fromDateDisplay,
      toDateStr: toDateDisplay,
      paymentsCount: statsList.reduce((acc, curr) => acc + curr.paymentsCount, 0),
      totalCollected: totalCollectedAll,
      amountInWords: numberToArabicWords(totalCollectedAll),
      isAllRepsSummary: true,
      allRepsSummaryList: statsList.map((s) => ({
        repName: s.rep.name,
        paymentsCount: s.paymentsCount,
        totalCollected: s.totalCollected,
      })),
      printedBy: currentRep?.name || 'المدير',
      dateStr: printDate,
      timeStr: timeStr,
    };

    // Direct Instant Print without preview modal
    directPrintRepReceipt(summaryReceipt);
  };

  const handlePrintSinglePayment = (payment: PaymentRecord) => {
    const normName = payment.customerName ? normalizeEntityName(payment.customerName) : '';
    const contract = contracts.find((c) => c.id === payment.contractId) || (normName ? contracts.find((c) => normalizeEntityName(c.customerName) === normName) : undefined);
    const { dateStr, timeStr } = getPaymentFormattedDateAndTime(payment, isAr);
    const snapshot = getPaymentReceiptBalances(payment, contract, payments);

    const normListName = contract?.listName ? String(contract.listName).trim().toLowerCase() : '';
    const linkedList = visibleLists.find((l) => 
      (contract?.listId && String(l.id) === String(contract.listId)) ||
      (normListName && l.name && String(l.name).trim().toLowerCase() === normListName)
    );
    const receiptTemplate = (linkedList as any)?.receiptTemplate || (linkedList as any)?.receipt_template || 'template_1';

    const receipt: ReceiptData = {
      shopTitle: 'الكرار للموبايل',
      receiptNo: receiptTemplate === 'template_2' ? '' : payment.id.slice(-6),
      customerName: payment.customerName || contract?.customerName || 'زبون',
      itemName: receiptTemplate === 'template_2' ? '' : (contract?.itemName || 'قسط'),
      totalPrice: snapshot.totalPrice || Number(contract?.totalPrice || 0),
      totalPaid: snapshot.totalPaid,
      remainingBalance: snapshot.remainingBalance,
      paidAmount: snapshot.paidAmount,
      amountInWords: numberToArabicWords(snapshot.paidAmount),
      dateStr: dateStr,
      timeStr: timeStr,
      isDuplicate: true,
      warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
      template: receiptTemplate,
    };

    // Direct Instant Print for single collection receipt
    directPrintReceipt(receipt as any);
  };

  const visibleListIds = new Set(visibleLists.map((l) => l.id));

  // Filter contracts based on visible lists and boxListId
  const visibleContracts = contracts.filter((c) => {
    if (!currentRep || currentRep.role === 'admin' || (!currentRep.allowedListIds || currentRep.allowedListIds.includes('all'))) {
      if (boxListId && boxListId !== 'all' && c.listId !== boxListId) return false;
      return true;
    }
    const allowedSet = new Set(currentRep.allowedListIds);
    if (!c.listId || !allowedSet.has(c.listId)) return false;
    if (boxListId && boxListId !== 'all' && c.listId !== boxListId) return false;
    return true;
  });

  const visibleContractIds = new Set(visibleContracts.map((c) => c.id));

  // Filter payments by visible contracts AND date range
  const visiblePayments = payments.filter((p) => {
    if (!currentRep || currentRep.role === 'admin' || (!currentRep.allowedListIds || currentRep.allowedListIds.includes('all'))) {
      // allow
    } else {
      const allowedSet = new Set(currentRep.allowedListIds);
      const c = contracts.find((con) => con.id === p.contractId);
      if (!c || !c.listId || !allowedSet.has(c.listId)) return false;
    }
    if (p.contractId && !visibleContractIds.has(p.contractId)) return false;

    // Date range filter
    if (startDate || endDate) {
      const pDate = new Date(p.paymentDate);
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

    return true;
  });

  // Target reps list to display:
  // 1. Admin: all reps
  // 2. Supervisor: reps with access or activity in permitted lists
  // 3. Regular Rep: strictly own box only
  const displayReps = useMemo(() => {
    if (!currentRep || currentRep.role === 'admin') {
      return reps;
    }
    if (currentRep.role === 'supervisor') {
      if (!currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
        return reps;
      }
      return reps.filter((r) => {
        if (r.id === currentRep.id) return true;
        if (r.name && currentRep.name && r.name.trim().toLowerCase() === currentRep.name.trim().toLowerCase()) return true;
        const hasOverlap = (r.allowedListIds || []).some((lId) => lId === 'all' || visibleListIds.has(lId));
        return hasOverlap;
      });
    }
    // Regular Rep: strictly own box only
    const matched = reps.filter(
      (r) =>
        (r.id && currentRep.id && r.id === currentRep.id) ||
        (r.name && currentRep.name && r.name.trim().toLowerCase() === currentRep.name.trim().toLowerCase())
    );
    return matched.length > 0 ? matched : [currentRep];
  }, [reps, currentRep, visibleListIds]);

  // Compute total payments and remaining debts for each rep
  const repStats = displayReps.filter(Boolean).map((rep) => {
    const repCleanName = rep?.name ? rep.name.trim().toLowerCase() : '';
    const currentCleanName = currentRep?.name ? currentRep.name.trim().toLowerCase() : '';

    const repPayments = (visiblePayments || []).filter((p) => {
      if (!p) return false;
      // If regular rep, strictly require payment to belong to this rep by repName match
      if (!isSupervisorOrAdmin && currentRep) {
        return Boolean(p.repName && currentCleanName && p.repName.trim().toLowerCase() === currentCleanName);
      }

      if (p.repName && repCleanName && p.repName.trim().toLowerCase() === repCleanName) return true;
      if (!p.repName) {
        return (visibleContracts || []).some(
          (c) => c && c.id === p.contractId && c.repName && repCleanName && c.repName.trim().toLowerCase() === repCleanName
        );
      }
      return false;
    });

    const repContracts = (visibleContracts || []).filter((c) => {
      if (!c) return false;
      if (!isSupervisorOrAdmin && currentRep) {
        return Boolean(c.repName && currentCleanName && c.repName.trim().toLowerCase() === currentCleanName);
      }
      if (c.repName && repCleanName && c.repName.trim().toLowerCase() === repCleanName) return true;
      if (rep.allowedListIds && !rep.allowedListIds.includes('all') && rep.allowedListIds.includes(c.listId)) return true;
      return false;
    });

    const activeDebts = repContracts.filter((c) => (Number(c.remainingBalance) || 0) > 0);
    const totalDebt = activeDebts.reduce((sum, c) => sum + (Number(c.remainingBalance) || 0), 0);
    const totalCollected = repPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? (p as any).amount ?? 0) || 0), 0);
    const paymentsCount = repPayments.length;

    return {
      rep,
      repPayments,
      activeDebts,
      totalDebt,
      totalCollected,
      paymentsCount,
    };
  });

  // For supervisors, show all representatives who have access to the lists even if 0 collections. For admin, hide reps with 0 collections unless own box.
  const activeRepStats = repStats.filter((rs) => {
    if (!isSupervisorOrAdmin) {
      return true;
    }

    // Supervisor sees all representatives associated with their allowed lists (even if 0 collections)
    if (currentRep?.role === 'supervisor') {
      return true;
    }

    if (rs.repPayments.length === 0) {
      return Boolean(currentRep && rs.rep.id === currentRep.id);
    }

    return true;
  });

  // Calculate grand total of all visible payments and debts
  const grandTotal = activeRepStats.reduce((sum, rs) => sum + rs.totalCollected, 0);
  const grandTotalDebt = activeRepStats.reduce((sum, rs) => sum + rs.totalDebt, 0);

  // Get stats for currently selected rep in modal
  const activeRepStat = selectedRepDetails
    ? repStats.find((rs) => rs.rep.id === selectedRepDetails.id || rs.rep.name === selectedRepDetails.name)
    : null;

  const content = (
    <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl p-2 sm:p-3.5 md:p-4 shadow-2xl dir-rtl space-y-2 sm:space-y-3 h-[95vh] max-h-[95vh] flex flex-col overflow-hidden w-full max-w-full lg:max-w-7xl xl:max-w-[1600px] 2xl:max-w-[1800px] mx-auto">
      {toastMessage && (
        <div
          className={`px-3 py-1.5 text-xs font-bold flex items-center justify-between gap-2 transition-all print:hidden shrink-0 rounded-xl ${
            toastMessage.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button type="button" onClick={() => setToastMessage(null)} className="p-0.5 hover:bg-white/20 rounded cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Date & List Filter Bar - Fits strictly on a single row on all mobile screens */}
      <div className="bg-slate-50 dark:bg-slate-900/70 p-1.5 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-1.5 shrink-0">
        {/* Row 1: List selection, From Date, To Date strictly in 1 single row */}
        <div className="grid grid-cols-3 gap-1 w-full text-[10px] sm:text-xs">
          {/* Customer List Selector */}
          <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-1 shadow-2xs w-full min-w-0">
            <FolderKanban className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 shrink-0" />
            <select
              value={boxListId}
              onChange={(e) => setBoxListId(e.target.value)}
              className="bg-transparent text-[10px] sm:text-xs font-black text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer border-0 p-0 w-full truncate"
              title={isAr ? 'تصفية حسب القائمة' : 'Filter by List'}
            >
              <option value="all" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                {isAr ? `كل القوائم (${visibleLists.length})` : `All Lists (${visibleLists.length})`}
              </option>
              {visibleLists.map((l) => (
                <option key={l.id} value={l.id} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date Picker */}
          <div className="relative flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-1 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-[10px] sm:text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'من:' : 'From:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[10px] sm:text-xs text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
              {startDate ? startDate.replace(/-/g, '/') : '----/--/--'}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              title={isAr ? 'من تاريخ' : 'From Date'}
            />
          </div>

          {/* To Date Picker */}
          <div className="relative flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 py-1 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="text-[10px] sm:text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'إلى:' : 'To:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[10px] sm:text-xs text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
              {endDate ? endDate.replace(/-/g, '/') : '----/--/--'}
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

        {/* Row 2: Quick Presets, Print Report & Close Button */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full">
          <button
            type="button"
            onClick={() => setQuickPreset('today')}
            className={`flex-1 min-w-[55px] text-center py-1 px-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all cursor-pointer shadow-2xs ${
              startDate && startDate === endDate && startDate === getLocalDateString()
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {isAr ? 'اليوم' : 'Today'}
          </button>
          <button
            type="button"
            onClick={() => setQuickPreset('yesterday')}
            className="flex-1 min-w-[55px] text-center py-1 px-1.5 rounded-lg text-[10px] sm:text-xs font-black bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
          >
            {isAr ? 'أمس' : 'Yesterday'}
          </button>
          <button
            type="button"
            onClick={() => setQuickPreset('month')}
            className="flex-1 min-w-[65px] text-center py-1 px-1.5 rounded-lg text-[10px] sm:text-xs font-black bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
          >
            {isAr ? 'هذا الشهر' : 'Month'}
          </button>
          <button
            type="button"
            onClick={() => setQuickPreset('all')}
            className={`flex-1 min-w-[55px] text-center py-1 px-1.5 rounded-lg text-[10px] sm:text-xs font-black transition-all cursor-pointer shadow-2xs ${
              !startDate && !endDate
                ? 'bg-emerald-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {isAr ? 'الكل' : 'All'}
          </button>

          {activeRepStats.length > 0 && (
            <button
              type="button"
              onClick={() => handlePrintAllRepsSummary(grandTotal, activeRepStats)}
              className="py-1 px-2 rounded-lg text-[10px] sm:text-xs font-black text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-600 hover:text-white border border-teal-300 dark:border-teal-800 cursor-pointer flex items-center justify-center gap-1 shrink-0 transition-all shadow-2xs"
              title={isAr ? 'طباعة كشف إجمالي تسديدات جميع المندوبين' : 'Print All Reps Collections Summary'}
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">{isAr ? 'طباعة كشف' : 'Print'}</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shrink-0 shadow-2xs"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grid of Rep Stat Cards (كل 2 بعرض الشاشة واسعة ومريحة) */}
      <div className="overflow-y-auto flex-1 p-0.5">
        {activeRepStats.length === 0 ? (
          <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700/80 space-y-2 my-2">
            <Receipt className="w-10 h-10 mx-auto text-slate-400" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isAr
                ? 'لا توجد تسديدات لأي مندوب في هذه الفترة المحددة'
                : 'No payments recorded for any representative in this selected date range'}
            </p>
            <p className="text-xs text-slate-400">
              {isAr
                ? 'جرب اختيار فترة زمنية أخرى أو إلغاء التصفية'
                : 'Try selecting a different date range or resetting filters'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4 md:gap-5">
            {activeRepStats.map(({ rep, totalCollected, totalDebt, paymentsCount, activeDebts, repPayments }) => {
              const repListsNames = (rep.allowedListIds || []).includes('all')
                ? (isAr ? 'جميع القوائم' : 'All Lists')
                : customerLists
                    .filter((l) => (rep.allowedListIds || []).includes(l.id))
                    .map((l) => l.name)
                    .join(', ') || (isAr ? 'لا توجد قائمة' : 'No lists');

              return (
                <div
                  key={rep.id}
                  onClick={() => {
                    setSelectedRepDetails(rep);
                  }}
                  className="bg-slate-50 dark:bg-slate-900/80 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-slate-200 dark:border-slate-700/80 flex flex-col justify-between space-y-3.5 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center font-black text-sm sm:text-base shrink-0 shadow-2xs">
                        {rep.name ? rep.name.charAt(0) : 'م'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 break-words leading-tight block group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                          {rep.name}
                        </span>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 break-words block mt-0.5">
                          {rep.role === 'admin'
                            ? (isAr ? 'مدير التطبيق' : 'Admin')
                            : rep.role === 'supervisor'
                            ? (isAr ? 'مسؤول' : 'Supervisor')
                            : (isAr ? 'مندوب' : 'Rep')}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrintRepReceipt(rep, totalCollected, paymentsCount, repPayments);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 hover:text-white dark:bg-blue-950/80 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-black active:scale-95"
                        title={isAr ? 'طباعة وصل كشف تحصيلات المندوب' : 'Print Collections Receipt'}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-black">{isAr ? 'طباعة وصل' : 'Print'}</span>
                      </button>

                      <span className="text-xs sm:text-sm font-extrabold px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                        {paymentsCount} {isAr ? 'تسديد' : 'payments'}
                      </span>
                    </div>
                  </div>

                  {/* Total Collected Amount */}
                  <div className="bg-emerald-500/10 dark:bg-emerald-950/40 px-4 py-2.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-black text-slate-700 dark:text-slate-300">
                      {isAr ? 'إجمالي التحصيلات:' : 'Total Collected:'}
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-800 dark:text-emerald-300 dir-ltr">
                      {totalCollected.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                    </span>
                  </div>

                  {/* Footer action link */}
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 font-extrabold flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="break-words max-w-[220px] leading-tight truncate">{repListsNames}</span>
                    <span className="flex items-center gap-1 shrink-0 group-hover:translate-x-[-3px] transition-transform font-black">
                      {isAr ? 'عرض سجل التسديدات' : 'View Payments Log'}
                      <ChevronLeft className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const repDetailsModalContent = selectedRepDetails && activeRepStat ? (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-1 sm:p-3 dir-rtl">
      <div className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-[99vw] lg:max-w-4xl h-[96vh] max-h-[96vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header - Compact & Slim */}
        <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
              {isAr ? `صندوق المندوب: ${selectedRepDetails.name}` : `Rep Box: ${selectedRepDetails.name}`}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handlePrintRepReceipt(activeRepStat.rep, activeRepStat.totalCollected, activeRepStat.paymentsCount, activeRepStat.repPayments)}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] sm:text-xs font-black inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
              title={isAr ? 'طباعة وصل تسديدات المندوب' : 'Print Collections Receipt'}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة وصل تسديدات' : 'Print Receipt'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRepDetails(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Filter Bar - "من تاريخ" و "إلى تاريخ" مقابل بعضهما في نفس السطر */}
        <div className="p-2 sm:p-2.5 bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 space-y-1.5 shrink-0">
          <div className="grid grid-cols-2 gap-2 items-center">
            {/* من تاريخ */}
            <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 sm:px-2 py-1 shadow-2xs min-w-0">
              <span className="text-[10px] sm:text-xs font-black text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0 flex items-center gap-1 pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {isAr ? 'من تاريخ:' : 'From:'}
              </span>
              <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-[11px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none" dir="ltr">
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

            {/* إلى تاريخ */}
            <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-1.5 sm:px-2 py-1 shadow-2xs min-w-0">
              <span className="text-[10px] sm:text-xs font-black text-teal-700 dark:text-teal-400 whitespace-nowrap shrink-0 flex items-center gap-1 pointer-events-none">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                {isAr ? 'إلى تاريخ:' : 'To:'}
              </span>
              <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-[11px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none" dir="ltr">
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

          {/* أزرار الفترات السريعة */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                const today = getLocalDateString();
                setStartDate(today);
                setEndDate(today);
              }}
              className={`flex-1 min-w-[65px] text-center py-1 px-2 rounded-lg text-[11px] sm:text-xs font-black transition-all cursor-pointer shadow-2xs ${
                startDate && startDate === endDate && startDate === getLocalDateString()
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {isAr ? 'اليوم' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                const yStr = getLocalDateString(y);
                setStartDate(yStr);
                setEndDate(yStr);
              }}
              className="flex-1 min-w-[65px] text-center py-1 px-2 rounded-lg text-[11px] sm:text-xs font-black bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              {isAr ? 'أمس' : 'Yesterday'}
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                setStartDate(getLocalDateString(firstDay));
                setEndDate(getLocalDateString(now));
              }}
              className="flex-1 min-w-[75px] text-center py-1 px-2 rounded-lg text-[11px] sm:text-xs font-black bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              {isAr ? 'هذا الشهر' : 'Month'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className={`flex-1 min-w-[65px] text-center py-1 px-2 rounded-lg text-[11px] sm:text-xs font-black transition-all cursor-pointer shadow-2xs ${
                !startDate && !endDate
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {isAr ? 'الكل' : 'All'}
            </button>
          </div>
        </div>

        {/* شريط المجموع - مصغر وأنيق ومدمج لتوفير أكبر مساحة ممكنة */}
        <div className="px-3.5 py-1.5 bg-emerald-50/90 dark:bg-emerald-950/40 border-b border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400">
              {isAr ? 'إجمالي المبالغ المستلمة:' : 'Total Received:'}
            </span>
            <span className="text-xs sm:text-sm font-black text-emerald-800 dark:text-emerald-300 dir-ltr">
              {activeRepStat.totalCollected.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md bg-emerald-600 text-white font-black shadow-2xs">
            {activeRepStat.paymentsCount} {isAr ? 'تسديد' : 'payments'}
          </span>
        </div>

        {/* Modal Content Body - Expanded Scrollable List */}
        <div className="p-2 sm:p-3 overflow-y-auto space-y-2 flex-1">
          {activeRepStat.repPayments.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-bold text-xs space-y-2 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 my-2">
              <Receipt className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p>{isAr ? 'لا توجد تسديدات مسجلة للمندوب في هذه الفترة' : 'No payments found for this period'}</p>
            </div>
          ) : (
            activeRepStat.repPayments.map((p) => {
              const { cleanNote } = getPaymentFormattedDateAndTime(p, isAr);

              return (
                <div
                  key={p.id}
                  className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-400 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs sm:text-sm font-black">
                    <span className="text-slate-900 dark:text-slate-100 truncate">{p.customerName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-emerald-700 dark:text-emerald-300 dir-ltr font-black">
                        {p.amountPaid.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSendPaymentWhatsApp(p)}
                        className="p-1 rounded-lg border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center group"
                        title={isAr ? 'إرسال وصل التسديد عبر واتساب (الاسم، الواصل، المبلغ رقماً وكتابة، التاريخ)' : 'Send payment receipt via WhatsApp'}
                      >
                        <MessageCircle className="w-3.5 h-3.5 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                      </button>
                    </div>
                  </div>
                  {cleanNote && (
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-bold truncate mt-0.5">
                      {cleanNote}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => setSelectedRepDetails(null)}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer shadow-2xs"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {onClose ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 dir-rtl animate-in fade-in duration-150">
          {content}
          {repDetailsModalContent}
        </div>
      ) : (
        <div className="space-y-4">
          {content}
          {repDetailsModalContent}
        </div>
      )}

      {/* Rep Receipt Modal for thermal/PDF/image printing */}
      <RepReceiptModal
        isOpen={isRepReceiptModalOpen}
        receipt={activeRepReceipt}
        onClose={() => {
          setIsRepReceiptModalOpen(false);
          setActiveRepReceipt(null);
        }}
      />

      {/* Single Customer Payment Receipt Modal */}
      <ReceiptModal
        isOpen={isPaymentReceiptModalOpen}
        receipt={activePaymentReceipt}
        onClose={() => {
          setIsPaymentReceiptModalOpen(false);
          setActivePaymentReceipt(null);
        }}
      />
    </>
  );
};
