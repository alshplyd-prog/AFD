import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Printer, Filter, Calendar, FolderKanban, Download, Search, FileText, ArrowUpRight, ArrowDownLeft, RotateCcw, ChevronDown, Check, RefreshCw, CheckCircle2, AlertCircle, DownloadCloud, Loader2, Share2, MessageCircle } from 'lucide-react';
import { InstallmentContract, PaymentRecord, CustomerList, Language, CustomerTransaction, SalesRepresentative } from '../types';
import { calculateCustomerStatement, fetchCustomerSubCollectionStatement, SubCollectionStatementResult } from '../lib/statementCalculator';
import { getLocalDateString, isZeroBalanceExpired24h, formatZeroBalanceCountdown, calculateAccumulatedInstallment } from '../lib/dateUtils';
import { ZeroBalanceCountdown } from './ZeroBalanceCountdown';
import { openUniversalPdfPrintWindow } from '../lib/bluetoothPrinter';
import { exportToExcelFile, ExcelSheetData } from '../lib/excelExportHelper';
import { shareCustomerPaymentsPdf, shareCustomerPaymentsOrDirectWhatsApp, formatIraqiPhoneForWhatsApp } from '../lib/pdfShareHelper';

interface CustomerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  contracts: InstallmentContract[];
  payments: PaymentRecord[];
  customerLists: CustomerList[];
  lang: Language;
  currentRep?: SalesRepresentative;
}

export const CustomerStatementModal: React.FC<CustomerStatementModalProps> = ({
  isOpen,
  onClose,
  contracts,
  payments,
  customerLists,
  lang,
  currentRep,
}) => {
  const prevIsOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [selectedListIds, setSelectedListIds] = useState<string[]>(['all']);
  const [isListDropdownOpen, setIsListDropdownOpen] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>(() => getLocalDateString());
  const [endDate, setEndDate] = useState<string>(() => getLocalDateString());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [numDaysToShow, setNumDaysToShow] = useState<number>(5);
  const [viewMode, setViewMode] = useState<'transactions' | 'customer_summaries' | 'matrix'>('matrix');
  const [historyModalContract, setHistoryModalContract] = useState<InstallmentContract | null>(null);
  const [subColResult, setSubColResult] = useState<SubCollectionStatementResult | null>(null);
  const [loadingSubCol, setLoadingSubCol] = useState<boolean>(false);

  const [serverPayments, setServerPayments] = useState<PaymentRecord[] | null>(null);
  const [isFetchingServerPayments, setIsFetchingServerPayments] = useState<boolean>(false);

  // Initialize dates ONLY on first modal open - never override user's date selection on re-render!
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current) {
      prevIsOpenRef.current = true;
      const today = getLocalDateString();
      setStartDate(today);
      setEndDate(today);
      // Fetch server records automatically in background without requiring user to press any button
      handleFetchAllFromServer();
    }
  }, [isOpen]);

  // Back gesture / Back button support
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: 'customer_statement' }, '');
    const handlePopState = () => {
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen]);

  const handleFetchAllFromServer = async () => {
    setIsFetchingServerPayments(true);
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
      setIsFetchingServerPayments(false);
    }
  };

  const isAr = lang === 'ar';

  const safeContracts = Array.isArray(contracts) ? contracts : [];
  const activePaymentsList = serverPayments || payments;
  const safePayments = Array.isArray(activePaymentsList) ? activePaymentsList : [];
  const safeCustomerLists = Array.isArray(customerLists) ? customerLists : [];

  // 0. Filter lists allowed for the current rep
  const availableCustomerLists = useMemo(() => {
    if (!currentRep || currentRep.role === 'admin') {
      return safeCustomerLists;
    }
    if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0 || currentRep.allowedListIds.includes('all')) {
      return safeCustomerLists;
    }
    const allowedSet = new Set(currentRep.allowedListIds);
    return safeCustomerLists.filter((list) => allowedSet.has(list.id));
  }, [safeCustomerLists, currentRep]);

  // Filter contracts accessible by rep's allowed lists
  const accessibleContracts = useMemo(() => {
    if (!currentRep || currentRep.role === 'admin') {
      return safeContracts;
    }
    if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0 || currentRep.allowedListIds.includes('all')) {
      return safeContracts;
    }
    const allowedSet = new Set(currentRep.allowedListIds);
    return safeContracts.filter((c) => !c.listId || allowedSet.has(c.listId));
  }, [safeContracts, currentRep]);

  useEffect(() => {
    if (historyModalContract) {
      setLoadingSubCol(true);
      fetchCustomerSubCollectionStatement(
        historyModalContract.id,
        startDate,
        endDate,
        historyModalContract,
        safePayments
      ).then((res) => {
        setSubColResult(res);
        setLoadingSubCol(false);
      });
    } else {
      setSubColResult(null);
    }
  }, [historyModalContract, startDate, endDate, safePayments]);

  // Toggle list selection for multi-list support
  const toggleListId = (listId: string) => {
    if (listId === 'all') {
      setSelectedListIds(['all']);
      return;
    }
    let newIds = selectedListIds.filter((id) => id !== 'all');
    if (newIds.includes(listId)) {
      newIds = newIds.filter((id) => id !== listId);
    } else {
      newIds = [...newIds, listId];
    }
    if (newIds.length === 0 || newIds.length === availableCustomerLists.length) {
      setSelectedListIds(['all']);
    } else {
      setSelectedListIds(newIds);
    }
  };

  const getSelectedListsLabel = () => {
    if (selectedListIds.includes('all') || selectedListIds.length === 0) {
      return isAr ? 'جميع القوائم' : 'All Lists';
    }
    if (selectedListIds.length === 1) {
      const found = availableCustomerLists.find((l) => l.id === selectedListIds[0]);
      return found ? found.name : selectedListIds[0];
    }
    return isAr ? `${selectedListIds.length} قوائم` : `${selectedListIds.length} Lists`;
  };

  // 1. Filter base contracts by customer list & search query
  const filteredContracts = accessibleContracts.filter((c) => {
    if (!c) return false;
    if (isZeroBalanceExpired24h(c)) {
      return false;
    }
    const isAll = selectedListIds.includes('all') || selectedListIds.length === 0;
    if (!isAll && (!c.listId || !selectedListIds.includes(c.listId))) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (c.customerName || '').toLowerCase().includes(q);
    }
    return true;
  });

  const filteredContractIds = useMemo(() => new Set(filteredContracts.map((c) => c.id)), [filteredContracts]);

  // 2. Build full transactions list (Invoices & Payments) for filtered customers
  const allTransactions = useMemo(() => {
    const list: (CustomerTransaction & { customerPhone?: string; itemName?: string })[] = [];

    filteredContracts.forEach((c) => {
      // Invoice Transaction
      const invDate = c.startDate || (c.createdAt ? getLocalDateString(c.createdAt) : getLocalDateString());
      list.push({
        id: `inv-${c.id}`,
        customerId: c.id,
        contractId: c.id,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
        itemName: c.itemName,
        type: 'invoice',
        amount: c.totalPrice || 0,
        date: invDate,
        description: c.itemName ? `فاتورة بيع بالتقسيط: ${c.itemName}` : 'فاتورة عقد جديد',
        repName: c.repName || 'مندوب',
        createdAt: c.createdAt || new Date().toISOString(),
      });

      // Advance payment if present
      if (c.advancePayment && c.advancePayment > 0) {
        list.push({
          id: `adv-${c.id}`,
          customerId: c.id,
          contractId: c.id,
          customerName: c.customerName,
          customerPhone: c.customerPhone,
          itemName: c.itemName,
          type: 'payment',
          amount: c.advancePayment,
          date: invDate,
          description: 'دفعة مقدمة عند البيع',
          repName: c.repName || 'مندوب',
          createdAt: c.createdAt || new Date().toISOString(),
        });
      }
    });

    safePayments.forEach((p) => {
      if (!p || !p.contractId || !filteredContractIds.has(p.contractId)) return;
      const contract = safeContracts.find((c) => c.id === p.contractId);
      const payDate = p.paymentDate ? getLocalDateString(p.paymentDate) : getLocalDateString();
      list.push({
        id: p.id || `pay-${Math.random()}`,
        customerId: p.contractId,
        contractId: p.contractId,
        customerName: p.customerName || (contract ? contract.customerName : 'زبون'),
        customerPhone: contract?.customerPhone,
        itemName: contract?.itemName,
        type: 'payment',
        amount: p.amountPaid || 0,
        date: payDate,
        description: p.note || 'تسديد قسط يومي',
        repName: p.repName || contract?.repName || 'مندوب',
        createdAt: p.paymentDate || new Date().toISOString(),
      });
    });

    // Sort by date descending
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [filteredContracts, filteredContractIds, safePayments, safeContracts]);

  // 3. Filter transactions by Date Range [startDate, endDate]
  const dateFilteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (startDate && tx.date < startDate) return false;
      if (endDate && tx.date > endDate) return false;
      return true;
    });
  }, [allTransactions, startDate, endDate]);

  // 4. Calculate Summary KPIs for the selected Date Range
  const periodStats = useMemo(() => {
    let periodSales = 0;
    let periodPayments = 0;

    dateFilteredTransactions.forEach((tx) => {
      if (tx.type === 'invoice') {
        periodSales += tx.amount || 0;
      } else if (tx.type === 'payment') {
        periodPayments += tx.amount || 0;
      }
    });

    const netPeriodDue = periodSales - periodPayments; // (مجموع المبيعات - مجموع المقبوضات = الصافي المطلوب)

    const totalOutstanding = filteredContracts.reduce(
      (sum, c) => sum + Math.max(0, (c.totalPrice || 0) - (c.advancePayment || 0) - (c.totalPaid || 0)),
      0
    );

    return {
      periodSales,
      periodPayments,
      netPeriodDue,
      totalOutstanding,
      count: dateFilteredTransactions.length,
    };
  }, [dateFilteredTransactions, filteredContracts]);

  // 5. Per-Customer Summaries within Date Range using calculateCustomerStatement
  const customerSummaries = useMemo(() => {
    return filteredContracts.map((c) => {
      const netFinanced = (c.totalPrice || 0) - (c.advancePayment || 0);
      const statement = calculateCustomerStatement(
        c.id,
        startDate,
        endDate,
        safePayments,
        netFinanced
      );

      // Calculate period sales
      const custInvoices = dateFilteredTransactions.filter((tx) => tx.contractId === c.id && tx.type === 'invoice');
      const sales = custInvoices.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const paymentsCount = statement.paymentsCount;
      const periodPayments = statement.totalPaid;
      const net = sales - periodPayments;
      const totalRemaining = statement.remaining;

      return {
        contract: c,
        sales,
        payments: periodPayments,
        net,
        totalRemaining,
        txCount: custInvoices.length + paymentsCount,
      };
    });
  }, [filteredContracts, startDate, endDate, safePayments, dateFilteredTransactions]);

  // Quick Preset Handlers
  const handleSetPreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = getLocalDateString();
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(getLocalDateString(d));
      setEndDate(today);
    } else if (preset === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(getLocalDateString(d));
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Matrix lookup (includes installment payments and advance payments)
  const paymentMatrix = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    // 1. Advance payments on contract start date
    safeContracts.forEach((c) => {
      if (c && c.advancePayment && c.advancePayment > 0) {
        const dateStr = c.startDate || (c.createdAt ? c.createdAt.split('T')[0] : '');
        if (dateStr) {
          if (!map[c.id]) map[c.id] = {};
          map[c.id][dateStr] = (map[c.id][dateStr] || 0) + c.advancePayment;
        }
      }
    });
    // 2. Installment payments
    safePayments.forEach((p) => {
      if (!p || !p.contractId || !p.paymentDate) return;
      const dateStr = p.paymentDate.split('T')[0];
      if (!map[p.contractId]) {
        map[p.contractId] = {};
      }
      map[p.contractId][dateStr] = (map[p.contractId][dateStr] || 0) + (p.amountPaid || 0);
    });
    return map;
  }, [safeContracts, safePayments]);

  // Matrix Available Dates
  const availableDates = useMemo(() => {
    try {
      // 1. Extract all unique dates where payments exist for filtered contracts
      const paymentDatesSet = new Set<string>();
      filteredContracts.forEach((c) => {
        const custPayments = paymentMatrix[c.id];
        if (custPayments) {
          Object.keys(custPayments).forEach((d) => paymentDatesSet.add(d));
        }
      });

      // 2. If user selected an explicit date range filter
      if (startDate || endDate) {
        let startD = startDate ? new Date(startDate) : new Date();
        let endD = endDate ? new Date(endDate) : new Date();

        if (isNaN(startD.getTime())) startD = new Date();
        if (isNaN(endD.getTime())) endD = new Date();

        if (startD > endD) {
          const temp = startD;
          startD = endD;
          endD = temp;
        }

        const dates: string[] = [];
        const current = new Date(startD);
        let guard = 0;
        while (current <= endD && guard < 180) {
          dates.push(getLocalDateString(current));
          current.setDate(current.getDate() + 1);
          guard++;
        }
        return dates.sort((a, b) => a.localeCompare(b));
      }

      // 3. Default (no date filter): show all unique payment dates across all customers!
      const sortedPaymentDates = Array.from(paymentDatesSet).sort((a, b) => a.localeCompare(b));

      if (sortedPaymentDates.length > 0) {
        return sortedPaymentDates;
      }

      // Fallback if no payments exist yet: show last 5 days
      const dates: string[] = [];
      const current = new Date();
      current.setDate(current.getDate() - 4);
      for (let i = 0; i < 5; i++) {
        dates.push(getLocalDateString(current));
        current.setDate(current.getDate() + 1);
      }
      return dates;
    } catch (e) {
      return [getLocalDateString()];
    }
  }, [startDate, endDate, filteredContracts, paymentMatrix]);

  const openMatrixPdfWindow = () => {
    try {
      const listName = getSelectedListsLabel();

      const dateSubtitle = startDate || endDate
        ? `الفترة من: ${startDate || 'البداية'} إلى: ${endDate || 'اليوم'}`
        : 'الكشف الشامل لجميع التواريخ المسجلة';

      const totalAccumulatedSum = filteredContracts.reduce((sum, c) => {
        const acc = calculateAccumulatedInstallment(c, endDate || undefined);
        return sum + (acc.accumulated > 0 ? acc.accumulated : 0);
      }, 0);
      const totalInstallment = filteredContracts.reduce((sum, c) => sum + (c.dailyInstallment || 0), 0);
      const totalPaidSum = filteredContracts.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
      const totalRemainingSum = filteredContracts.reduce((sum, c) => sum + Math.max(0, (c.totalPrice - c.advancePayment) - (c.totalPaid || 0)), 0);

      const dateHeaders = availableDates.map((d) => `<th class="date-col">${d}</th>`).join('');

      let rowsHtml = '';
      filteredContracts.forEach((c) => {
        const custPayments = paymentMatrix[c.id] || {};
        const netFinanced = c.totalPrice - c.advancePayment;
        const totalPaid = c.totalPaid || 0;
        const remaining = Math.max(0, netFinanced - totalPaid);
        const accInfo = calculateAccumulatedInstallment(c, endDate || undefined);

        const dateCells = availableDates.map((d) => {
          const paid = custPayments[d] || 0;
          return `<td class="${paid > 0 ? 'paid-cell' : 'zero-cell'}">${paid > 0 ? paid.toLocaleString('en-US') : '0'}</td>`;
        }).join('');

        rowsHtml += `
          <tr>
            <td class="cust-name">
              ${c.customerName}
              ${((c.remainingBalance || 0) <= 0 || c.status === 'completed' || remaining <= 0) ? `<br/><span style="font-size:8px;color:#d97706;font-weight:bold;">${formatZeroBalanceCountdown(c, isAr)}</span>` : ''}
            </td>
            <td class="num-cell" style="font-weight:900;color:${accInfo.isOverdueDueAll ? '#b91c1c' : '#b45309'};background:${accInfo.isOverdueDueAll ? '#fee2e2' : 'transparent'};">
              ${accInfo.isOverdueDueAll ? '<b style="color:#b91c1c;padding:2px 6px;border-radius:4px;font-size:11px;">منتهي</b>' : (accInfo.accumulated > 0 ? accInfo.accumulated.toLocaleString('en-US') : '0')}
            </td>
            <td class="num-cell inst-cell">${(c.dailyInstallment || 0).toLocaleString('en-US')}</td>
            <td class="num-cell paid-cell">${totalPaid.toLocaleString('en-US')}</td>
            <td class="num-cell rem-cell">${remaining.toLocaleString('en-US')}</td>
            ${dateCells}
          </tr>
        `;
      });

      const dateTotalsCells = availableDates.map((d) => {
        const daySum = filteredContracts.reduce((sum, c) => {
          const custPayments = paymentMatrix[c.id] || {};
          return sum + (custPayments[d] || 0);
        }, 0);
        return `<td class="${daySum > 0 ? 'day-total-active' : 'day-total-zero'}">${daySum > 0 ? daySum.toLocaleString('en-US') : '0'}</td>`;
      }).join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="UTF-8">
          <title>كشف أقساط الزبائن والتحصيلات اليومية (PDF)</title>
          <style>
            @page {
              size: landscape;
              margin: 8mm;
            }
            body {
              font-family: system-ui, -apple-system, sans-serif;
              direction: rtl;
              text-align: right;
              background: #fff;
              color: #000;
              margin: 0;
              padding: 10px;
              font-size: 11px;
            }
            .header-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 12px;
            }
            .shop-title {
              font-size: 18px;
              font-weight: 900;
              color: #0f172a;
            }
            .doc-title {
              font-size: 13px;
              font-weight: 800;
              color: #2563eb;
            }
            .sub-info {
              font-size: 11px;
              font-weight: 700;
              color: #475569;
            }
            .stats-grid {
              display: flex;
              gap: 12px;
              margin-bottom: 12px;
            }
            .stat-box {
              flex: 1;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 6px 10px;
              background: #f8fafc;
            }
            .stat-label {
              font-size: 9px;
              color: #64748b;
              font-weight: 700;
            }
            .stat-val {
              font-size: 13px;
              font-weight: 900;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
            }
            th, td {
              border: 1px solid #94a3b8;
              padding: 5px 6px;
              text-align: center;
              white-space: nowrap;
            }
            th {
              background-color: #f1f5f9;
              font-weight: 900;
              color: #0f172a;
            }
            .cust-name {
              text-align: right;
              font-weight: 900;
              min-width: 130px;
            }
            .num-cell {
              font-weight: 800;
            }
            .inst-cell { color: #1d4ed8; }
            .paid-cell { color: #047857; background-color: #ecfdf5; font-weight: 800; }
            .rem-cell { color: #b91c1c; font-weight: 800; }
            .zero-cell { color: #94a3b8; }
            .date-col { min-width: 65px; font-weight: 800; }
            tfoot tr td {
              background-color: #e2e8f0;
              font-weight: 900;
              font-size: 11px;
            }
            .day-total-active { background-color: #d1fae5; color: #065f46; font-weight: 900; }
            .day-total-zero { color: #64748b; }
            .no-print {
              margin-bottom: 12px;
              text-align: left;
            }
            .btn-print {
              background: #2563eb;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 6px;
              font-weight: bold;
              cursor: pointer;
            }
            @media print {
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="header-bar">
            <div>
              <div class="shop-title">الكرار للموبايل والتقسيط</div>
              <div class="doc-title">كشف حركات وتحصيلات الزبائن الأفقية (Matrix Ledger)</div>
            </div>
            <div style="text-align: left;">
              <div class="sub-info">${dateSubtitle}</div>
              <div class="sub-info">القائمة: ${listName} | عدد الزبائن: ${filteredContracts.length}</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-box">
              <div class="stat-label">مجموع القسط اليومي</div>
              <div class="stat-val" style="color:#1d4ed8;">${totalInstallment.toLocaleString('en-US')} د.ع</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">إجمالي الواصل الكلي</div>
              <div class="stat-val" style="color:#047857;">${totalPaidSum.toLocaleString('en-US')} د.ع</div>
            </div>
            <div class="stat-box">
              <div class="stat-label">إجمالي الباقي المطلوب</div>
              <div class="stat-val" style="color:#b91c1c;">${totalRemainingSum.toLocaleString('en-US')} د.ع</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 140px; text-align: right;">اسم الزبون</th>
                <th style="width: 80px; color: #b45309; background-color: #fef3c7;">المتراكم</th>
                <th style="width: 80px;">مبلغ القسط</th>
                <th style="width: 90px;">إجمالي الواصل</th>
                <th style="width: 90px;">المتبقي الباقي</th>
                ${dateHeaders}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td style="text-align: right; font-weight: 900;">المجموع الكلي</td>
                <td style="color: #b45309; font-weight: 900; background-color: #fef3c7;">${totalAccumulatedSum.toLocaleString('en-US')}</td>
                <td>${totalInstallment.toLocaleString('en-US')}</td>
                <td>${totalPaidSum.toLocaleString('en-US')}</td>
                <td>${totalRemainingSum.toLocaleString('en-US')}</td>
                ${dateTotalsCells}
              </tr>
            </tfoot>
          </table>

        </body>
        </html>
      `;

      openUniversalPdfPrintWindow(htmlContent, false, 'كشف حسابات الأقساط');
    } catch (e) {
      console.error('Error opening PDF window:', e);
      window.print();
    }
  };

  const handleExportPdf = () => {
    if (viewMode === 'matrix') {
      openMatrixPdfWindow();
    } else {
      window.print();
    }
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  const [isExportingSubColPdf, setIsExportingSubColPdf] = useState(false);

  const handleShareHistoryModalPdf = async (target: 'whatsapp' | 'other' = 'whatsapp') => {
    if (!historyModalContract || isExportingSubColPdf) return;
    setIsExportingSubColPdf(true);
    try {
      const custPayments = safePayments.filter((p) => p && p.contractId === historyModalContract.id);
      const result = await shareCustomerPaymentsOrDirectWhatsApp({
        contract: historyModalContract,
        payments: custPayments,
        lang,
        targetApp: target,
        forceAppsChooser: target === 'other',
      });
      if (result && result.success) {
        if (result.method !== 'user_cancelled') {
          showToast(
            target === 'whatsapp'
              ? (isAr
                  ? 'تم فتح محادثة واتساب الزبون - اضغط (لصق / Paste) أو إرسال لنشر صورة الكشف'
                  : 'Customer WhatsApp opened - Tap Paste or Send for statement image')
              : (isAr
                  ? 'تم تجهيز ملف الـ PDF - اختر التطبيق المطلوب للمشاركة'
                  : 'PDF ready - Select app to share file'),
            'success'
          );
        }
      } else if (result?.error) {
        showToast(isAr ? 'تعذر إتمام المشاركة' : 'Failed to share', 'error');
      }
    } catch (e) {
      console.error('Error sharing customer statement:', e);
      showToast(isAr ? 'حدث خطأ أثناء المشاركة' : 'Error sharing', 'error');
    } finally {
      setIsExportingSubColPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      const sheets: ExcelSheetData[] = [];

      // Sheet 1: Matrix View (كشف المصفوفة)
      const matrixHeaders = [
        isAr ? 'اسم الزبون' : 'Customer Name',
        isAr ? 'المتراكم' : 'Accrued',
        isAr ? 'مبلغ القسط (د.ع)' : 'Installment (IQD)',
        isAr ? 'إجمالي الواصل (د.ع)' : 'Total Paid (IQD)',
        isAr ? 'المتبقي الباقي (د.ع)' : 'Remaining (IQD)',
        ...availableDates,
      ];

      const matrixRows: (string | number)[][] = [];
      filteredContracts.forEach((c) => {
        const custPayments = paymentMatrix[c.id] || {};
        const netFinanced = c.totalPrice - c.advancePayment;
        const totalPaid = c.totalPaid || 0;
        const remaining = Math.max(0, netFinanced - totalPaid);
        const dateValues = availableDates.map((d) => custPayments[d] || 0);
        const accInfo = calculateAccumulatedInstallment(c, endDate || undefined);

        matrixRows.push([
          c.customerName || '',
          accInfo.displayValue,
          c.dailyInstallment || 0,
          totalPaid,
          remaining,
          ...dateValues,
        ]);
      });

      // Totals Row for Matrix
      const totalAccumulatedSum = filteredContracts.reduce((sum, c) => {
        const acc = calculateAccumulatedInstallment(c, endDate || undefined);
        return sum + (acc.accumulated > 0 ? acc.accumulated : 0);
      }, 0);
      const totalInstallment = filteredContracts.reduce((sum, c) => sum + (c.dailyInstallment || 0), 0);
      const totalPaidSum = filteredContracts.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
      const totalRemainingSum = filteredContracts.reduce(
        (sum, c) => sum + Math.max(0, (c.totalPrice - c.advancePayment) - (c.totalPaid || 0)),
        0
      );
      const dateTotals = availableDates.map((d) =>
        filteredContracts.reduce((sum, c) => {
          const custPayments = paymentMatrix[c.id] || {};
          return sum + (custPayments[d] || 0);
        }, 0)
      );

      matrixRows.push([
        isAr ? 'المجموع الكلي' : 'Total',
        totalAccumulatedSum,
        totalInstallment,
        totalPaidSum,
        totalRemainingSum,
        ...dateTotals,
      ]);

      const matrixColWidths = [28, 14, 16, 16, 16, ...availableDates.map(() => 14)];

      // Sheet 2: Transactions List (سجل الحركات)
      const txHeaders = [
        isAr ? 'التاريخ' : 'Date',
        isAr ? 'اسم الزبون' : 'Customer Name',
        isAr ? 'نوع الحركة' : 'Type',
        isAr ? 'المبلغ (د.ع)' : 'Amount (IQD)',
        isAr ? 'الوصف والتفاصيل' : 'Description',
        isAr ? 'المندوب' : 'Rep',
      ];

      const txRows: (string | number)[][] = dateFilteredTransactions.map((tx) => [
        tx.date,
        tx.customerName || '',
        tx.type === 'invoice' ? (isAr ? 'فاتورة بيع' : 'Invoice') : (isAr ? 'تسديد قسط' : 'Payment'),
        tx.amount || 0,
        tx.description || '',
        tx.repName || '',
      ]);

      const txColWidths = [18, 28, 14, 16, 30, 18];

      // Sheet 3: Customer Summaries (ملخص الزبائن)
      const summaryHeaders = [
        isAr ? 'اسم الزبون' : 'Customer Name',
        isAr ? 'مبيعات الفترة (د.ع)' : 'Period Sales (IQD)',
        isAr ? 'مقبوضات الفترة (د.ع)' : 'Period Payments (IQD)',
        isAr ? 'الصافي للفترة (د.ع)' : 'Net Period (IQD)',
        isAr ? 'المتبقي الكلي (د.ع)' : 'Total Outstanding (IQD)',
      ];

      const summaryRows: (string | number)[][] = customerSummaries.map((cs) => [
        cs.contract.customerName || '',
        cs.sales || 0,
        cs.payments || 0,
        cs.net || 0,
        cs.totalRemaining || 0,
      ]);

      const summaryColWidths = [28, 20, 20, 20, 20];

      // Order sheets according to the current viewMode
      if (viewMode === 'matrix') {
        sheets.push({
          sheetName: isAr ? 'كشف المصفوفة' : 'Matrix',
          headers: matrixHeaders,
          rows: matrixRows,
          colWidths: matrixColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'سجل الحركات' : 'Transactions',
          headers: txHeaders,
          rows: txRows,
          colWidths: txColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'ملخص الزبائن' : 'Customer Summary',
          headers: summaryHeaders,
          rows: summaryRows,
          colWidths: summaryColWidths,
        });
      } else if (viewMode === 'transactions') {
        sheets.push({
          sheetName: isAr ? 'سجل الحركات' : 'Transactions',
          headers: txHeaders,
          rows: txRows,
          colWidths: txColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'ملخص الزبائن' : 'Customer Summary',
          headers: summaryHeaders,
          rows: summaryRows,
          colWidths: summaryColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'كشف المصفوفة' : 'Matrix',
          headers: matrixHeaders,
          rows: matrixRows,
          colWidths: matrixColWidths,
        });
      } else {
        sheets.push({
          sheetName: isAr ? 'ملخص الزبائن' : 'Customer Summary',
          headers: summaryHeaders,
          rows: summaryRows,
          colWidths: summaryColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'سجل الحركات' : 'Transactions',
          headers: txHeaders,
          rows: txRows,
          colWidths: txColWidths,
        });
        sheets.push({
          sheetName: isAr ? 'كشف المصفوفة' : 'Matrix',
          headers: matrixHeaders,
          rows: matrixRows,
          colWidths: matrixColWidths,
        });
      }

      const filename = `كشف_حسابات_${startDate || 'بداية'}_إلى_${endDate || 'اليوم'}`;
      const result = await exportToExcelFile({
        filename,
        sheets,
        title: isAr ? 'كشف الحسابات وسجل الحركات' : 'Customer Statements Ledger',
        text: isAr ? 'كشف الحسابات وسجل الحركات المالي' : 'Customer financial statements and transactions',
      });

      if (result.success) {
        if (result.method === 'user_cancelled') {
          // user cancelled the native share sheet
        } else if (result.method === 'clipboard_copy') {
          showToast(isAr ? 'تم نسخ بيانات الكشف إلى الحافظة بنجاح، يمكنك لصقها في Excel' : 'Statement copied to clipboard', 'success');
        } else {
          showToast(isAr ? 'تم تجهيز ملف Excel - اختر التطبيق المطلوب للمشاركة' : 'Excel statement ready for sharing', 'success');
        }
      } else {
        showToast(isAr ? `تعذر تصدير الملف: ${result.error}` : `Export failed: ${result.error}`, 'error');
      }
    } catch (err: any) {
      console.error('Export Excel failed:', err);
      showToast(isAr ? 'حدث خطأ أثناء تصدير ملف Excel' : 'Error exporting Excel file', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handlePrint = () => {
    if (viewMode === 'matrix') {
      openMatrixPdfWindow();
    } else {
      window.print();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .statement-printable-container, .statement-printable-container * {
            visibility: visible !important;
          }
          .statement-printable-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
        }
      `}</style>
      <div
        className="bg-white dark:bg-slate-800 rounded-none sm:rounded-3xl w-full max-w-7xl shadow-2xl border-0 sm:border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col h-[98vh] max-h-[98vh] statement-printable-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header - Ultra Compact */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 print:hidden shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
              <FolderKanban className="w-4 h-4" />
            </div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
              {isAr ? 'كشف الحركات وسجل الحسابات' : 'Transactions Ledger'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              title={isAr ? 'مشاركة وتصدير كشف الزبون كملف Excel' : 'Share & Export Excel'}
            >
              {isExportingExcel ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span>{isExportingExcel ? (isAr ? 'جاري...' : 'Exporting...') : (isAr ? 'مشاركة Excel' : 'Share Excel')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toast Notification for Excel Export */}
        {toastMessage && (
          <div
            className={`px-3 py-1.5 text-xs font-bold flex items-center justify-between gap-2 transition-all print:hidden shrink-0 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {toastMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{toastMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="p-0.5 hover:bg-white/20 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Date Range, List Filter & Search Toolbar */}
        <div className="p-2 bg-slate-100/90 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 print:hidden shrink-0 space-y-1.5">
          {/* Row 1: The 3 Filter Controls (List, From Date, To Date) strictly in 1 row */}
          <div className="grid grid-cols-3 gap-1 text-[10px] sm:text-[11px] w-full">
            {/* 1. Multi-List Selector Dropdown */}
            <div className="relative w-full min-w-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsListDropdownOpen((prev) => !prev);
                }}
                className="flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 px-1.5 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-750 w-full"
              >
                <span className="font-extrabold text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] shrink-0">
                  {isAr ? 'القائمة:' : 'List:'}
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-[10px] sm:text-[11px] truncate min-w-0">
                  {getSelectedListsLabel()}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {isListDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[60]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsListDropdownOpen(false);
                    }}
                  />
                  <div
                    className="absolute top-full right-0 mt-1 z-[70] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-2 min-w-[200px] max-w-[260px] space-y-1 font-sans dir-rtl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200 dark:border-slate-700 px-1">
                      <span className="text-[11px] font-black text-slate-800 dark:text-slate-200">
                        {isAr ? 'تحديد القوائم المتاحة' : 'Select Allowed Lists'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsListDropdownOpen(false)}
                        className="p-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleListId('all')}
                      className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-xs text-right cursor-pointer transition-colors ${
                        selectedListIds.includes('all')
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                      }`}
                    >
                      <span>{isAr ? 'جميع القوائم المتاحة' : 'All Allowed Lists'}</span>
                      {selectedListIds.includes('all') && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>

                    <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />

                    <div className="max-h-48 overflow-y-auto space-y-0.5 no-scrollbar">
                      {availableCustomerLists.length === 0 ? (
                        <div className="p-2 text-center text-xs text-slate-400">
                          {isAr ? 'لا توجد قوائم مخصصة' : 'No lists assigned'}
                        </div>
                      ) : (
                        availableCustomerLists.map((list) => {
                          const isSelected = !selectedListIds.includes('all') && selectedListIds.includes(list.id);
                          return (
                            <button
                              key={list.id}
                              type="button"
                              onClick={() => toggleListId(list.id)}
                              className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-xl text-xs text-right cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black'
                                  : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                              }`}
                            >
                              <span className="truncate">{list.name}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 2. Date From */}
            <div className="relative flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 px-1 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs w-full min-w-0">
              <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
                <Calendar className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                <span className="text-[8px] sm:text-[9px] font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">{isAr ? 'من:' : 'From:'}</span>
              </div>
              <span className="font-mono font-bold text-[7.5px] xs:text-[8px] sm:text-[9px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

            {/* 3. Date To */}
            <div className="relative flex items-center justify-between gap-0.5 bg-white dark:bg-slate-800 px-1 py-1 rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs w-full min-w-0">
              <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
                <Calendar className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                <span className="text-[8px] sm:text-[9px] font-black text-slate-600 dark:text-slate-300 whitespace-nowrap">{isAr ? 'إلى:' : 'To:'}</span>
              </div>
              <span className="font-mono font-bold text-[7.5px] xs:text-[8px] sm:text-[9px] text-slate-800 dark:text-slate-100 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

          {/* Row 2: Search Box */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-300 dark:border-slate-700 w-full">
            <Search className="w-3.5 h-3.5 scale-75 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث عن اسم زبون...' : 'Search customer...'}
              className="w-full bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none placeholder:text-slate-400 text-[11px]"
            />
          </div>
        </div>

        {/* Ledger Data Table View */}
        <div className="p-1 sm:p-3 overflow-auto flex-1 font-sans w-full">
          {/* Printable Header Info */}
          <div className="mb-3 hidden print:block text-center border-b pb-3">
            <h1 className="text-xl font-black">{isAr ? 'كشف حركة الحسابات والأقساط' : 'Transaction Account Ledger'}</h1>
            <p className="text-xs text-slate-600 font-bold mt-1">
              {startDate || endDate ? `الفترة المحددة: من ${startDate || 'البداية'} إلى ${endDate || 'اليوم'}` : 'الكشف الشامل لجميع التواريخ'}
            </p>
            <div className="mt-2 text-xs grid grid-cols-3 gap-2 border p-2 rounded-lg bg-slate-50">
              <div>مجموع المبيعات: <strong>{periodStats.periodSales.toLocaleString('en-US')} د.ع</strong></div>
              <div>مجموع المقبوضات: <strong>{periodStats.periodPayments.toLocaleString('en-US')} د.ع</strong></div>
              <div>الصافي المطلوب: <strong>{periodStats.netPeriodDue.toLocaleString('en-US')} د.ع</strong></div>
            </div>
          </div>

          {viewMode === 'transactions' && (
            /* 1. Transactions Ledger View */
            <div className="w-full max-h-[60vh] overflow-auto relative rounded-xl border border-slate-900 dark:border-slate-700">
              <table className="w-full text-right border-collapse border border-slate-900 dark:border-slate-700">
                <thead className="sticky top-0 z-30 shadow-xs">
                  <tr className="bg-[#b8cce4] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black border-b border-slate-900 dark:border-slate-600 text-xs sm:text-sm">
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'التاريخ' : 'Date'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right">
                      {isAr ? 'اسم الزبون' : 'Customer Name'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'نوع الحركة' : 'Transaction Type'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right">
                      {isAr ? 'الوصف والتفاصيل' : 'Description'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'فاتورة (+)' : 'Invoice (+)'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'تسديد (-)' : 'Payment (-)'}
                    </th>
                    <th className="sticky top-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'المندوب' : 'Rep'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 dark:divide-slate-700 font-extrabold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                  {dateFilteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400 font-bold text-xs sm:text-sm">
                        {isAr ? 'لا توجد حركات مسجلة لهذا النطاق الزمني أو الفلتر' : 'No transactions recorded for this date range'}
                      </td>
                    </tr>
                  ) : (
                    dateFilteredTransactions.map((tx) => {
                      const isInvoice = tx.type === 'invoice';
                      const contract = safeContracts.find((c) => c.id === tx.contractId || (tx.customerName && c.customerName.trim().toLowerCase() === tx.customerName.trim().toLowerCase()));
                      const customerPhone = contract?.customerPhone;

                      return (
                        <tr key={tx.id} className="hover:bg-blue-50/70 dark:hover:bg-slate-700/60 transition-colors">
                          {/* 1. Date */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                            {tx.date}
                          </td>

                          {/* 2. Customer Name (Click goes to Phone Contacts / Dialer) */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 font-black">
                            {customerPhone ? (
                              <a
                                href={`tel:${customerPhone}`}
                                title={isAr ? `اتصال بجهات الاتصال: ${customerPhone}` : `Dial: ${customerPhone}`}
                                className="text-blue-700 dark:text-blue-400 hover:underline font-black cursor-pointer text-right block w-full text-xs sm:text-sm"
                              >
                                <span className="block truncate">{tx.customerName}</span>
                                {contract && <ZeroBalanceCountdown contract={contract} isAr={isAr} />}
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => contract && setHistoryModalContract(contract)}
                                className="text-blue-700 dark:text-blue-400 hover:underline font-black cursor-pointer text-right block w-full text-xs sm:text-sm"
                              >
                                <span className="block truncate">{tx.customerName}</span>
                                {contract && <ZeroBalanceCountdown contract={contract} isAr={isAr} />}
                              </button>
                            )}
                          </td>

                          {/* 3. Transaction Type Badge */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                            {isInvoice ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-black text-xs">
                                <ArrowUpRight className="w-3 h-3 text-blue-600" />
                                {isAr ? 'فاتورة / بيع' : 'Invoice'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black text-xs">
                                <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                {isAr ? 'تسديد / قبض' : 'Payment'}
                              </span>
                            )}
                          </td>

                          {/* 4. Description */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm">
                            {tx.description}
                          </td>

                          {/* 5. Invoice Amount (+ Sales) */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-800 dark:text-blue-300 text-xs sm:text-sm">
                            {isInvoice ? (tx.amount || 0).toLocaleString('en-US') : '—'}
                          </td>

                          {/* 6. Payment Amount (- Collections) */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
                            {!isInvoice ? (tx.amount || 0).toLocaleString('en-US') : '—'}
                          </td>

                          {/* 7. Representative */}
                          <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-800 dark:text-slate-300 font-bold text-xs sm:text-sm">
                            {tx.repName || '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {dateFilteredTransactions.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100 border-t-2 border-slate-900 dark:border-slate-500 shadow-md">
                    <tr>
                      <td colSpan={4} className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right font-black text-xs sm:text-sm">
                        {isAr ? 'المجموع للفترة المحددة' : 'Period Totals'}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-900 dark:text-blue-300 text-xs sm:text-sm">
                        {periodStats.periodSales.toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-emerald-900 dark:text-emerald-300 text-xs sm:text-sm">
                        {periodStats.periodPayments.toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black text-purple-900 dark:text-purple-300 text-xs sm:text-sm">
                        {isAr ? `الصافي: ${periodStats.netPeriodDue.toLocaleString('en-US')}` : `Net: ${periodStats.netPeriodDue.toLocaleString('en-US')}`}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {viewMode === 'customer_summaries' && (
            /* 2. Customer Summaries View */
            <div className="w-full max-h-[60vh] overflow-auto relative rounded-xl border border-slate-900 dark:border-slate-700">
              <table className="w-full text-right border-collapse border border-slate-900 dark:border-slate-700">
                <thead className="sticky top-0 z-30 shadow-xs">
                  <tr className="bg-[#b8cce4] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black border-b border-slate-900 dark:border-slate-600 text-xs sm:text-sm">
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right">
                      {isAr ? 'اسم العميل' : 'Customer Name'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center text-amber-950 dark:text-amber-200">
                      {isAr ? 'المتراكم' : 'Accrued'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right">
                      {isAr ? 'المادة / السلعة' : 'Item'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'مبيعات الفترة' : 'Period Sales'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'مقبوضات الفترة' : 'Period Payments'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'الصافي للفترة' : 'Net Period'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'المتبقي الكلي' : 'Total Outstanding'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                      {isAr ? 'السجل التفصيلي' : 'Detail'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 dark:divide-slate-700 font-extrabold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                  {customerSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400 font-bold text-xs sm:text-sm">
                        {isAr ? 'لا يوجد زبائن مطبقون لهذا الفلتر' : 'No matching customers found'}
                      </td>
                    </tr>
                  ) : (
                    customerSummaries.map(({ contract, sales, payments, net, totalRemaining, txCount }) => {
                      const accInfo = calculateAccumulatedInstallment(contract, endDate || undefined);
                      return (
                      <tr key={contract.id} className="hover:bg-blue-50/70 dark:hover:bg-slate-700/60 transition-colors">
                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 font-black text-slate-900 dark:text-slate-100">
                          {contract.customerPhone ? (
                            <a
                              href={`tel:${contract.customerPhone}`}
                              title={isAr ? `اتصال بجهات الاتصال: ${contract.customerPhone}` : `Dial: ${contract.customerPhone}`}
                              className="text-blue-700 dark:text-blue-400 hover:underline font-black text-right block w-full cursor-pointer text-xs sm:text-sm"
                            >
                              <span className="block truncate">{contract.customerName}</span>
                              <ZeroBalanceCountdown contract={contract} isAr={isAr} />
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setHistoryModalContract(contract)}
                              className="text-blue-700 dark:text-blue-400 hover:underline font-black text-right block w-full cursor-pointer text-xs sm:text-sm"
                            >
                              <span className="block truncate">{contract.customerName}</span>
                              <ZeroBalanceCountdown contract={contract} isAr={isAr} />
                            </button>
                          )}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-xs sm:text-sm">
                          {accInfo.isOverdueDueAll ? (
                            <span className="inline-block px-1.5 py-0.5 rounded font-black text-rose-700 bg-rose-100 dark:bg-rose-950/80 dark:text-rose-300 text-xs">
                              منتهي
                            </span>
                          ) : (
                            accInfo.accumulated > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400 font-black">
                                {accInfo.accumulated.toLocaleString('en-US')}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-bold">0</span>
                            )
                          )}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right text-slate-900 dark:text-slate-200 font-bold text-xs sm:text-sm">
                          {contract.itemName || '—'}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-800 dark:text-blue-300 text-xs sm:text-sm">
                          {sales.toLocaleString('en-US')}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
                          {payments.toLocaleString('en-US')}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-purple-800 dark:text-purple-300 text-xs sm:text-sm">
                          {net.toLocaleString('en-US')}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-rose-800 dark:text-rose-300 text-xs sm:text-sm">
                          {totalRemaining.toLocaleString('en-US')}
                        </td>

                        <td className="px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center">
                          <button
                            type="button"
                            onClick={() => setHistoryModalContract(contract)}
                            className="px-1.5 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-black text-xs cursor-pointer"
                          >
                            {isAr ? 'عرض الدفعات' : 'View'} ({txCount})
                          </button>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
                {customerSummaries.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100 border-t-2 border-slate-900 dark:border-slate-500 shadow-md">
                    <tr>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right font-black text-xs sm:text-sm">
                        {isAr ? 'المجموع الكلي' : 'Grand Totals'}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-amber-950 dark:text-amber-200 text-xs sm:text-sm">
                        {customerSummaries.reduce((s, c) => {
                          const acc = calculateAccumulatedInstallment(c.contract, endDate || undefined);
                          return s + (acc.accumulated > 0 ? acc.accumulated : 0);
                        }, 0).toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-400">
                        —
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-900 dark:text-blue-300 text-xs sm:text-sm">
                        {customerSummaries.reduce((s, c) => s + c.sales, 0).toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-emerald-900 dark:text-emerald-300 text-xs sm:text-sm">
                        {customerSummaries.reduce((s, c) => s + c.payments, 0).toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-purple-900 dark:text-purple-300 text-xs sm:text-sm">
                        {customerSummaries.reduce((s, c) => s + c.net, 0).toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-rose-900 dark:text-rose-300 text-xs sm:text-sm">
                        {customerSummaries.reduce((s, c) => s + c.totalRemaining, 0).toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-400">
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {viewMode === 'matrix' && (
            /* 3. Daily Installment Matrix View - Exact Match to User Screenshot */
            <div className="w-full max-h-[60vh] overflow-auto relative rounded-xl border border-slate-900 dark:border-slate-700">
              <table className="w-full text-right border-collapse border border-slate-900 dark:border-slate-700">
                <thead className="sticky top-0 z-30 shadow-xs">
                  <tr className="bg-[#b8cce4] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black border-b border-slate-900 dark:border-slate-600 text-[10px] sm:text-xs md:text-sm">
                    <th className="sticky top-0 right-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1 sm:px-1.5 py-1 border border-slate-900 dark:border-slate-600 text-right whitespace-nowrap shadow-sm min-w-[90px] sm:min-w-[120px]">
                      {isAr ? 'اسم العميل' : 'Customer Name'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1 py-1 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap text-amber-950 dark:text-amber-200">
                      {isAr ? 'المتراكم' : 'Accrued'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1 py-1 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                      {isAr ? 'القسط' : 'Rate'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1 py-1 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                      {isAr ? 'الواصل' : 'Paid'}
                    </th>
                    <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-1 py-1 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                      {isAr ? 'الباقي' : 'Balance'}
                    </th>
                    {availableDates.map((dateStr) => (
                      <th
                        key={dateStr}
                        className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-0.5 sm:px-1 py-1 border border-slate-900 dark:border-slate-600 text-center dir-ltr text-[9px] sm:text-[11px] md:text-xs whitespace-nowrap"
                      >
                        {dateStr}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 dark:divide-slate-700 font-black text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs md:text-sm">
                  {filteredContracts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5 + availableDates.length}
                        className="p-4 text-center text-slate-400 font-bold text-xs sm:text-sm"
                      >
                        {isAr ? 'لا يوجد زبائن مطبقون لهذا الفلتر' : 'No matching customers found'}
                      </td>
                    </tr>
                  ) : (
                    filteredContracts.map((c) => {
                      const custPayments = paymentMatrix[c.id] || {};
                      const netFinanced = c.totalPrice - c.advancePayment;
                      const totalPaid = c.totalPaid || 0;
                      const remaining = Math.max(0, netFinanced - totalPaid);
                      const accInfo = calculateAccumulatedInstallment(c, endDate || undefined);

                      return (
                        <tr key={c.id} className="hover:bg-blue-50/70 dark:hover:bg-slate-700/50 transition-colors">
                          <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-blue-50 dark:group-hover:bg-slate-800 px-1 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 font-black text-slate-900 dark:text-slate-100 shadow-sm min-w-[90px] sm:min-w-[120px]">
                            {c.customerPhone ? (
                              <a
                                href={`tel:${c.customerPhone}`}
                                title={isAr ? `اتصال بجهات الاتصال: ${c.customerPhone}` : `Dial: ${c.customerPhone}`}
                                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-[10px] sm:text-xs md:text-sm font-black text-right block w-full"
                              >
                                <span className="block truncate">{c.customerName}</span>
                                <ZeroBalanceCountdown contract={c} isAr={isAr} />
                              </a>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setHistoryModalContract(c)}
                                className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer text-[10px] sm:text-xs md:text-sm font-black text-right block w-full"
                              >
                                <span className="block truncate">{c.customerName}</span>
                                <ZeroBalanceCountdown contract={c} isAr={isAr} />
                              </button>
                            )}
                          </td>

                          <td className="px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                            {accInfo.isOverdueDueAll ? (
                              <span className="inline-block px-1.5 py-0.5 rounded font-black text-rose-700 bg-rose-100 dark:bg-rose-950/80 dark:text-rose-300 text-[10px] sm:text-xs">
                                منتهي
                              </span>
                            ) : (
                              accInfo.accumulated > 0 ? (
                                <span className="text-amber-700 dark:text-amber-400 font-black">
                                  {accInfo.accumulated.toLocaleString('en-US')}
                                </span>
                              ) : (
                                <span className="text-slate-500 font-bold">0</span>
                              )
                            )}
                          </td>

                          <td className="px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-900 dark:text-slate-100 font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                            {(c.dailyInstallment || 0).toLocaleString('en-US')}
                          </td>

                          <td className="px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-900 dark:text-slate-100 font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                            {totalPaid.toLocaleString('en-US')}
                          </td>

                          <td className="px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center text-slate-900 dark:text-slate-100 font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                            {remaining.toLocaleString('en-US')}
                          </td>

                          {availableDates.map((dateStr) => {
                            const paidOnDate = custPayments[dateStr] || 0;
                            return (
                              <td
                                key={dateStr}
                                className={`px-0.5 sm:px-1 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap ${
                                  paidOnDate > 0
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-200'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {paidOnDate > 0 ? paidOnDate.toLocaleString('en-US') : '0'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredContracts.length > 0 && (
                  <tfoot className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100 border-t-2 border-slate-900 dark:border-slate-600 shadow-md">
                    <tr>
                      <td className="sticky bottom-0 right-0 z-30 bg-[#b8cce4] dark:bg-slate-800 px-1 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-right font-black text-[10px] sm:text-xs md:text-sm shadow-sm min-w-[90px] sm:min-w-[120px]">
                        {isAr ? 'الإجمالي' : 'Total'}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-amber-950 dark:text-amber-200 text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        {filteredContracts
                          .reduce((sum, c) => {
                            const acc = calculateAccumulatedInstallment(c, endDate || undefined);
                            return sum + (acc.accumulated > 0 ? acc.accumulated : 0);
                          }, 0)
                          .toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        {filteredContracts
                          .reduce((sum, c) => sum + (c.dailyInstallment || 0), 0)
                          .toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        {filteredContracts
                          .reduce((sum, c) => sum + (c.totalPaid || 0), 0)
                          .toLocaleString('en-US')}
                      </td>
                      <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-0.5 sm:px-1.5 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        {filteredContracts
                          .reduce((sum, c) => sum + Math.max(0, (c.totalPrice - c.advancePayment) - (c.totalPaid || 0)), 0)
                          .toLocaleString('en-US')}
                      </td>
                      {availableDates.map((dateStr) => {
                        const daySum = filteredContracts.reduce((sum, c) => {
                          const custPayments = paymentMatrix[c.id] || {};
                          return sum + (custPayments[dateStr] || 0);
                        }, 0);
                        return (
                          <td
                            key={`sum-${dateStr}`}
                            className={`sticky bottom-0 z-20 px-0.5 sm:px-1 py-0.5 sm:py-1 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-[10px] sm:text-xs md:text-sm whitespace-nowrap ${
                              daySum > 0 ? 'text-emerald-950 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/90' : 'bg-[#b8cce4] dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {daySum > 0 ? daySum.toLocaleString('en-US') : '0'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs font-bold text-slate-500 print:hidden">
          <span>
            {isAr
              ? `عدد الحركات بالفترة: ${dateFilteredTransactions.length} | عدد الزبائن: ${filteredContracts.length}`
              : `Transactions: ${dateFilteredTransactions.length} | Customers: ${filteredContracts.length}`}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-all cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>

      {/* Customer Payment History Detail Modal */}
      {historyModalContract && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {isAr ? `سجل دفعات العميل: ${historyModalContract.customerName}` : `Payment History: ${historyModalContract.customerName}`}
                  </h3>
                  <p className="text-[11px] font-bold text-slate-500">
                    {isAr ? `المادة: ${historyModalContract.itemName || '—'}` : `Item: ${historyModalContract.itemName || '—'}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {/* Subcollection customer sharing buttons: واتساب الزبون and تطبيقات أخرى بشكل انفرادي */}
                {Boolean(formatIraqiPhoneForWhatsApp(historyModalContract.customerPhone)) ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleShareHistoryModalPdf('whatsapp')}
                      disabled={isExportingSubColPdf}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      title={isAr ? 'إرسال كشف التسديدات كملف PDF إلى واتساب الزبون' : 'Send payments PDF to Customer WhatsApp'}
                    >
                      <MessageCircle className={`w-3.5 h-3.5 ${isExportingSubColPdf ? 'animate-spin' : ''}`} />
                      <span>
                        {isExportingSubColPdf
                          ? (isAr ? 'جاري تجهيز PDF...' : 'Generating PDF...')
                          : (isAr ? 'واتساب الزبون' : 'Customer WhatsApp')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareHistoryModalPdf('other')}
                      disabled={isExportingSubColPdf}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      title={isAr ? 'مشاركة ملف PDF عبر التطبيقات الأخرى (تليكرام، ماسنجر...)' : 'Share PDF via Other Apps'}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'تطبيقات أخرى' : 'Other Apps'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleShareHistoryModalPdf('other')}
                    disabled={isExportingSubColPdf}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title={isAr ? 'الزبون ليس لديه رقم - فتح قائمة التطبيقات لمشاركة ملف PDF' : 'Customer has no phone - Open apps chooser to share PDF'}
                  >
                    <Share2 className={`w-3.5 h-3.5 ${isExportingSubColPdf ? 'animate-spin' : ''}`} />
                    <span>
                      {isExportingSubColPdf
                        ? (isAr ? 'جاري تجهيز PDF...' : 'Generating PDF...')
                        : (isAr ? 'مشاركة التطبيقات' : 'Share via Apps')}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryModalContract(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'مبيعات الفترة' : 'Period Sales'}</span>
                <span className="font-black text-blue-700 dark:text-blue-300 dir-ltr">
                  {(subColResult ? subColResult.totalSales : historyModalContract.totalPrice || 0).toLocaleString('en-US')}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'تسديدات الفترة (المجموع)' : 'Total Paid'}</span>
                <span className="font-black text-emerald-700 dark:text-emerald-300 dir-ltr">
                  {(subColResult ? subColResult.totalPayments : historyModalContract.totalPaid || 0).toLocaleString('en-US')}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'المتبقي المطلوب' : 'Remaining'}</span>
                <span className="font-black text-rose-700 dark:text-rose-300 dir-ltr">
                  {(subColResult
                    ? subColResult.remaining
                    : Math.max(0, historyModalContract.totalPrice - historyModalContract.advancePayment - (historyModalContract.totalPaid || 0))
                  ).toLocaleString('en-US')}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-500 block font-bold">{isAr ? 'عدد الحركات' : 'Tx Count'}</span>
                <span className="font-black text-slate-800 dark:text-slate-200">
                  {subColResult ? subColResult.transactions.length : safePayments.filter((p) => p && p.contractId === historyModalContract.id).length}
                </span>
              </div>
            </div>

            <div className="p-4 overflow-auto flex-1 text-xs">
              {loadingSubCol ? (
                <div className="py-12 text-center text-slate-400 font-bold">
                  {isAr ? 'جاري تحميل حركة الحساب من قاعدة البيانات...' : 'Loading transactions...'}
                </div>
              ) : (() => {
                const txList = subColResult ? subColResult.transactions : [];

                if (txList.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 font-bold">
                      {isAr ? 'لا توجد حركات تسديد أو مبيعات مسجلة في هذه الفترة' : 'No recorded transactions in this date range'}
                    </div>
                  );
                }

                return (
                  <table className="w-full text-right border-collapse border border-slate-300 dark:border-slate-700">
                    <thead>
                      <tr className="bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-black border-b border-slate-300 dark:border-slate-600">
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-center w-12">#</th>
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-center">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-center">{isAr ? 'نوع الحركة' : 'Type'}</th>
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-center">{isAr ? 'المبلغ' : 'Amount'}</th>
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-right">{isAr ? 'التفاصيل والوصف' : 'Description'}</th>
                        <th className="p-2 border border-slate-300 dark:border-slate-600 text-center">{isAr ? 'المندوب' : 'Rep'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-bold">
                      {txList.map((tx, idx) => (
                        <tr key={tx.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-center font-black text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-center dir-ltr text-slate-800 dark:text-slate-200 font-black">
                            {tx.date}
                          </td>
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-center">
                            {tx.type === 'invoice' ? (
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-extrabold text-[11px]">
                                {isAr ? 'فاتورة بيع' : 'Invoice'}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-extrabold text-[11px]">
                                {isAr ? 'تسديد قسط' : 'Payment'}
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-center dir-ltr font-black text-slate-900 dark:text-slate-100">
                            {tx.amount.toLocaleString('en-US')}
                          </td>
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-right text-slate-600 dark:text-slate-300">
                            {tx.description || '—'}
                          </td>
                          <td className="p-2 border border-slate-300 dark:border-slate-600 text-center text-slate-500 font-normal">
                            {tx.repName || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryModalContract(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-all cursor-pointer text-xs"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
