import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  X,
  Search,
  Calendar,
  Building2,
  Briefcase,
  History,
  ReceiptText,
  FileText,
  RefreshCw
} from 'lucide-react';
import { Employee, EmployeeTransaction, Language, SalesRepresentative, CashFund } from '../types';
import { ActionMenu } from './ActionMenu';
import { hasDuplicateName, deduplicateEntitiesByName } from '../lib/nameHelpers';

interface EmployeesViewProps {
  employees: Employee[];
  transactions: EmployeeTransaction[];
  funds: CashFund[];
  currentRep: SalesRepresentative | null;
  reps?: SalesRepresentative[];
  lang: Language;
  onAddEmployee: (emp: Omit<Employee, 'id'>) => void;
  onUpdateEmployee: (id: string, data: Partial<Employee>) => void;
  onDeleteEmployee: (id: string) => void;
  onDeleteAllEmployees?: () => void;
  onProcessDebtTransaction: (
    employee: Employee,
    fundId: string,
    type: 'loan' | 'repay',
    amount: number,
    notes?: string
  ) => void;
  onDeleteEmployeeTransaction?: (tx: EmployeeTransaction, employee: Employee) => void;
  onUpdateEmployeeTransaction?: (
    tx: EmployeeTransaction,
    employee: Employee,
    newAmount: number,
    newNote: string
  ) => void;
  onSyncDebtBalances?: () => void;
}

export const isMatchingEmployeeTx = (t: EmployeeTransaction, emp: Employee): boolean => {
  if (!t || !emp) return false;
  if (t.employeeId && t.employeeId === emp.id) return true;
  if (emp.repId && (t.employeeId === emp.repId || t.employeeId === `rep-emp-${emp.repId}`)) return true;
  if (t.employeeId && t.employeeId.startsWith('rep-emp-') && emp.id === t.employeeId.replace('rep-emp-', '')) return true;
  if (emp.name && t.repName && t.repName.trim().toLowerCase() === emp.name.trim().toLowerCase()) return true;
  return false;
};

export const computeEmployeeDebtBalance = (emp: Employee, txs: EmployeeTransaction[]): number => {
  const empTxs = txs.filter((t) => isMatchingEmployeeTx(t, emp));
  if (empTxs.length === 0) {
    return Number(emp.debtBalance ?? emp.totalDebt ?? 0);
  }
  const totalLoans = empTxs
    .filter((t) => t.type === 'loan' || (t.type as string) === 'debt' || (t.type as string) === 'سلفة' || (t.type as string) === 'دين')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const totalRepays = empTxs
    .filter((t) => t.type === 'repay' || (t.type as string) === 'repayment' || (t.type as string) === 'سداد' || (t.type as string) === 'راجع دين')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return Math.max(0, totalLoans - totalRepays);
};

export const formatDebtDate = (dateStrOrIso: string): string => {
  if (!dateStrOrIso) return '—';
  const d = new Date(dateStrOrIso);
  if (isNaN(d.getTime())) return dateStrOrIso;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day} / ${month} / ${year}`;
};

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  employees,
  transactions,
  funds,
  currentRep,
  reps = [],
  lang,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onDeleteAllEmployees,
  onProcessDebtTransaction,
  onDeleteEmployeeTransaction,
  onUpdateEmployeeTransaction,
  onSyncDebtBalances,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = !currentRep || currentRep.role === 'admin';
  const canDelete = isAdmin || (currentRep && currentRep.canDelete === true);
  const canEdit = isAdmin || (currentRep && currentRep.canEdit === true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncingDebt, setIsSyncingDebt] = useState(false);
  const [debtError, setDebtError] = useState('');

  const handleSyncDebtClick = async () => {
    if (!onSyncDebtBalances || isSyncingDebt) return;
    setIsSyncingDebt(true);
    try {
      await onSyncDebtBalances();
    } finally {
      setIsSyncingDebt(false);
    }
  };

  // Modals state
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empPosition, setEmpPosition] = useState('');
  const [empSalary, setEmpSalary] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [isRepEmp, setIsRepEmp] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [empError, setEmpError] = useState('');

  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [selectedEmpForDebt, setSelectedEmpForDebt] = useState<Employee | null>(null);
  const [debtType, setDebtType] = useState<'loan' | 'repay'>('loan');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtFundId, setDebtFundId] = useState(funds[0]?.id || '');
  const [debtNotes, setDebtNotes] = useState('');

  // Selected employee for History Modal
  const [selectedEmpForHistory, setSelectedEmpForHistory] = useState<Employee | null>(null);
  const [editingTx, setEditingTx] = useState<EmployeeTransaction | null>(null);
  const [editTxAmount, setEditTxAmount] = useState<string>('');
  const [editTxNote, setEditTxNote] = useState<string>('');

  // Keep modal employee objects synchronized with live employees prop (so debt balance updates automatically)
  useEffect(() => {
    if (selectedEmpForHistory) {
      const updated = employees.find((e) => e.id === selectedEmpForHistory.id);
      if (updated) {
        setSelectedEmpForHistory(updated);
      }
    }
    if (selectedEmpForDebt) {
      const updated = employees.find((e) => e.id === selectedEmpForDebt.id);
      if (updated) {
        setSelectedEmpForDebt(updated);
      }
    }
    if (editingEmp) {
      const updated = employees.find((e) => e.id === editingEmp.id);
      if (updated) {
        setEditingEmp(updated);
      }
    }
  }, [employees, selectedEmpForHistory?.id, selectedEmpForDebt?.id, editingEmp?.id]);

  const handleOpenEmpModal = (emp?: Employee) => {
    setEmpError('');
    if (emp) {
      setEditingEmp(emp);
      setEmpName(emp.name);
      setEmpPosition(emp.position || '');
      setEmpSalary(emp.salary?.toString() || '');
      setEmpPhone(emp.phone || '');
      setIsRepEmp(Boolean(emp.isRep));
      setSelectedRepId(emp.repId || '');
    } else {
      setEditingEmp(null);
      setEmpName('');
      setEmpPosition('');
      setEmpSalary('');
      setEmpPhone('');
      setIsRepEmp(false);
      setSelectedRepId('');
    }
    setIsEmpModalOpen(true);
  };

  const handleEmpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalName = empName.trim();
    let finalPosition = empPosition.trim();
    if (isRepEmp && selectedRepId && reps) {
      const rep = reps.find((r) => r.id === selectedRepId);
      if (rep) {
        if (!finalName) finalName = rep.name;
        if (!finalPosition) finalPosition = isAr ? 'مندوب / محصل' : 'Sales Representative';
      }
    }
    if (!finalName) {
      setEmpError(isAr ? 'يرجى إدخال اسم الموظف' : 'Employee name is required');
      return;
    }

    if (hasDuplicateName(employees, finalName, editingEmp?.id)) {
      setEmpError(isAr ? 'عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكراره' : 'Employee name already exists');
      return;
    }

    if (editingEmp) {
      onUpdateEmployee(editingEmp.id, {
        name: finalName,
        position: finalPosition,
        salary: Number(empSalary) || 0,
        phone: empPhone.trim(),
        isRep: isRepEmp,
        repId: selectedRepId,
      });
    } else {
      onAddEmployee({
        name: finalName,
        position: finalPosition,
        salary: Number(empSalary) || 0,
        phone: empPhone.trim(),
        debtBalance: 0,
        isRep: isRepEmp,
        repId: selectedRepId,
      });
    }
    setIsEmpModalOpen(false);
  };

  const handleOpenDebtModal = (emp: Employee, defaultType: 'loan' | 'repay' = 'loan') => {
    if (!isAdmin) return;
    setSelectedEmpForDebt(emp);
    setDebtType(defaultType);
    setDebtAmount('');
    setDebtFundId(funds[0]?.id || '');
    setDebtNotes('');
    setDebtError('');
    setIsDebtModalOpen(true);
  };

  const handleDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(debtAmount);
    const selectedFund = debtFundId || funds[0]?.id;
    if (!selectedEmpForDebt || amount <= 0 || !selectedFund) return;

    if (debtType === 'repay') {
      const currentBalance = computeEmployeeDebtBalance(selectedEmpForDebt, transactions);
      if (amount > currentBalance) {
        setDebtError(
          isAr
            ? `لا يمكن إضافة راجع دين أكبر من رصيد الدين الحالي المتبقي (${currentBalance.toLocaleString('en-US')} د.ع)`
            : `Cannot repay more than current debt balance (${currentBalance.toLocaleString('en-US')} IQD)`
        );
        return;
      }
    }

    onProcessDebtTransaction(selectedEmpForDebt, selectedFund, debtType, amount, debtNotes.trim());
    setIsDebtModalOpen(false);
  };

  // قائمة الموظفين الفعلية واحتساب أرصدة الديون المباشرة بدقة من سجل الحركات
  const allEmployeesWithReps = React.useMemo(() => {
    const list: Employee[] = [];
    employees.forEach((e) => {
      const dynamicDebt = computeEmployeeDebtBalance(e, transactions);
      list.push({
        ...e,
        debtBalance: dynamicDebt,
        totalDebt: dynamicDebt,
      });
    });
    return list;
  }, [employees, transactions]);

  const filteredEmployees = allEmployeesWithReps.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.position && e.position.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!isAdmin && currentRep) {
      const isMyEmployeeRecord =
        e.repId === currentRep.id ||
        (Boolean(e.isRep) && e.name.trim().toLowerCase() === currentRep.name.trim().toLowerCase()) ||
        e.name.trim().toLowerCase() === currentRep.name.trim().toLowerCase();
      return matchesSearch && isMyEmployeeRecord;
    }

    return matchesSearch;
  });

  const totalDebtsSum = filteredEmployees.reduce((sum, e) => sum + (e.debtBalance || e.totalDebt || 0), 0);

  // If viewing as a specific representative/staff member (or only 1 staff filtered), direct access to the history log
  const isDirectSingleView = !isAdmin && currentRep && filteredEmployees.length <= 1;
  const directEmp = isDirectSingleView ? (filteredEmployees[0] || (currentRep ? { id: currentRep.id, name: currentRep.name, role: currentRep.role, isRep: true, salary: 0, debtBalance: 0 } : null)) : null;
  const directTxs = directEmp ? transactions.filter((t) => isMatchingEmployeeTx(t, directEmp as Employee)) : [];
  const directLiveBalance = directEmp ? computeEmployeeDebtBalance(directEmp as Employee, transactions) : 0;

  return (
    <div className="space-y-2.5 sm:space-y-3 dir-rtl pb-12 w-full max-w-full mx-auto">
      {/* Compact Header Bar - Hidden for single rep debts view per user request */}
      {!isDirectSingleView && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-2.5 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'صندوق وسجل الديون والسلف' : 'Employees & Reps Debts'}
                </h1>
                <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-xs font-black dir-ltr">
                  {totalDebtsSum.toLocaleString('en-US')} د.ع
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isAdmin && onDeleteAllEmployees && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(isAr ? 'هل أنت متأكد من حذف وتصفير جميع الموظفين وسجلاتهم من السيرفر والذاكرة المحلية والأوفلاين؟' : 'Are you sure you want to delete all employees from server and offline cache?')) {
                    onDeleteAllEmployees();
                  }
                }}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all whitespace-nowrap cursor-pointer"
                title={isAr ? 'حذف وتصفير جميع الموظفين المحفوظين محلياً وبالسيرفر' : 'Delete all employees offline and server'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isAr ? 'حذف الكل' : 'Delete All'}</span>
              </button>
            )}

            {onSyncDebtBalances && (
              <button
                onClick={handleSyncDebtClick}
                disabled={isSyncingDebt}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all whitespace-nowrap disabled:opacity-50"
                title={isAr ? 'إعادة احتساب ومطابقة أرصدة الديون من سجل العمليات' : 'Recalculate & sync debt balances from history'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDebt ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isAr ? 'تحديث الأرصدة' : 'Sync Debts'}</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => handleOpenEmpModal()}
                className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة موظف' : 'Add Employee'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Direct History View for Representative (Immediate Access - Name, Debt, and Count on ONE Line) */}
      {isDirectSingleView && directEmp ? (
        <div className="space-y-2.5 sm:space-y-3 w-full">
          {/* Direct Summary Card - Unified Horizontal Row */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-2.5 sm:p-3.5 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-2 w-full">
            {/* Right: Avatar, Name, Role badge & phone */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 truncate">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-2xs">
                {directEmp.name?.charAt(0) || 'م'}
              </div>
              <div className="min-w-0 truncate">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">{directEmp.name}</span>
                  <span className="text-[9px] sm:text-[10px] bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 px-1.5 sm:px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800 font-black shrink-0">
                    {currentRep?.role === 'supervisor' ? (isAr ? 'مسؤول' : 'Supervisor') : (isAr ? 'مندوب' : 'Rep')}
                  </span>
                </div>
                {'phone' in directEmp && directEmp.phone && (
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono dir-ltr truncate">
                    {(directEmp as any).phone}
                  </p>
                )}
              </div>
            </div>

            {/* Left: Debt Balance & Transactions Count & Refresh on the SAME line */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <div className="bg-amber-50 dark:bg-amber-950/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-amber-200/80 dark:border-amber-800 text-right shrink-0">
                <span className="text-[9px] sm:text-[10px] font-bold text-amber-700 dark:text-amber-300 block leading-tight">
                  {isAr ? 'رصيد الدين:' : 'Debt:'}
                </span>
                <span className="text-[11px] sm:text-xs md:text-sm font-black text-amber-800 dark:text-amber-200 whitespace-nowrap">
                  {directLiveBalance.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                </span>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/50 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-blue-200/80 dark:border-blue-800 text-right shrink-0">
                <span className="text-[9px] sm:text-[10px] font-bold text-blue-700 dark:text-blue-300 block leading-tight">
                  {isAr ? 'الحركات:' : 'Txs:'}
                </span>
                <span className="text-[11px] sm:text-xs md:text-sm font-black text-blue-800 dark:text-blue-200 whitespace-nowrap">
                  {directTxs.length} {isAr ? 'حركة' : ''}
                </span>
              </div>

              {onSyncDebtBalances && (
                <button
                  type="button"
                  onClick={handleSyncDebtClick}
                  disabled={isSyncingDebt}
                  className="p-1.5 sm:p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shadow-2xs transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  title={isAr ? 'تحديث ومطابقة رصيد الدين' : 'Sync Debt'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDebt ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Direct Transaction Table (Wide & Responsive) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
              <div className="flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'سجل حركات السلف والديون' : 'Debts & Loans History'}
                </h3>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {directTxs.length} {isAr ? 'سجل مقيد' : 'records'}
              </span>
            </div>

            {directTxs.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <table className="w-full text-center text-xs border-collapse border border-slate-200 dark:border-slate-700">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-black">
                      <th className="border border-slate-200 dark:border-slate-700 py-2.5 px-3">{isAr ? 'نوع الحركة' : 'Type'}</th>
                      <th className="border border-slate-200 dark:border-slate-700 py-2.5 px-3">{isAr ? 'المبلغ' : 'Amount'}</th>
                      <th className="border border-slate-200 dark:border-slate-700 py-2.5 px-3">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="border border-slate-200 dark:border-slate-700 py-2.5 px-3">{isAr ? 'التفاصيل / الملاحظة' : 'Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="font-semibold text-slate-700 dark:text-slate-200">
                    {directTxs.map((tx) => {
                      const isLoan = tx.type === 'loan';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                          <td className="border border-slate-200 dark:border-slate-700 py-2 px-3">
                            <span
                              className={`inline-block font-extrabold px-2.5 py-0.5 rounded-full text-[10px] ${
                                isLoan
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                              }`}
                            >
                              {isLoan ? (isAr ? 'دين (سلفة)' : 'Loan') : (isAr ? 'راجع دين' : 'Repaid')}
                            </span>
                          </td>
                          <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 font-black text-xs dir-ltr text-center">
                            <span className={isLoan ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                              {isLoan ? '+' : '-'}{tx.amount.toLocaleString('en-US')} د.ع
                            </span>
                          </td>
                          <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-600 dark:text-slate-300 text-xs font-mono font-bold dir-rtl text-center whitespace-nowrap">
                            {formatDebtDate(tx.createdAt)}
                          </td>
                          <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-600 dark:text-slate-300 text-right">
                            {tx.notes || (isLoan ? (isAr ? 'تسجيل سلفة دين' : 'Loan issued') : (isAr ? 'سداد سلفة دين' : 'Loan repaid'))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs font-bold bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                {isAr ? 'لا توجد حركات ديون أو سلف مسجلة حالياً' : 'No debt or loan records found'}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Search Bar for Multi-Employee View */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث باسم الموظف أو المسمى الوظيفي...' : 'Search employee...'}
                className="w-full pr-9 pl-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Employees Grid */}
          <div className="grid grid-cols-1 gap-3">
            {filteredEmployees.map((emp) => {
              const empTxs = transactions.filter((t) => isMatchingEmployeeTx(t, emp));
              const liveDebtBalance = computeEmployeeDebtBalance(emp, transactions);

              return (
                <div
                  key={emp.id}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Employee Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 font-black text-sm flex items-center justify-center shrink-0 mt-0.5">
                        {emp.name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5 leading-snug">
                          <span className="break-words">{emp.name}</span>
                          {emp.isRep && (
                            <span className="text-[10px] bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-800 whitespace-nowrap">
                              {isAr ? 'مندوب / محصل' : 'Rep'}
                            </span>
                          )}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          <span className="flex items-center gap-1 break-words">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {emp.position || (isAr ? 'موظف' : 'Staff')}
                          </span>
                          {emp.phone && <span className="font-mono dir-ltr">{emp.phone}</span>}
                          {emp.salary > 0 && (
                            <span className="whitespace-nowrap">
                              {isAr ? 'الراتب:' : 'Salary:'} {emp.salary.toLocaleString('en-US')} د.ع
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Balance & Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-slate-700/60">
                      {/* Current Debt Badge */}
                      <div className="bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-xl border border-amber-200/80 dark:border-amber-800 text-right">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block leading-tight">
                          {isAr ? 'رصيد الدين:' : 'Debt Balance:'}
                        </span>
                        <span className="text-xs font-black text-amber-800 dark:text-amber-200">
                          {liveDebtBalance.toLocaleString('en-US')} د.ع
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleOpenDebtModal(emp, 'loan')}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-colors flex items-center gap-1 shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{isAr ? 'دين جديد' : 'New Loan'}</span>
                            </button>

                            <button
                              onClick={() => handleOpenDebtModal(emp, 'repay')}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition-colors flex items-center gap-1 shadow-2xs"
                            >
                              <ArrowDownLeft className="w-3.5 h-3.5" />
                              <span>{isAr ? 'راجع دين' : 'Return Debt'}</span>
                            </button>
                          </>
                        )}

                        {/* History / Details Modal Button */}
                        <button
                          onClick={() => setSelectedEmpForHistory(emp)}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-black text-xs transition-colors flex items-center gap-1.5 shadow-2xs"
                          title={isAr ? 'سجل السلف والديون' : 'History'}
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          <span>{isAr ? 'السجل' : 'Log'}</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-blue-200 dark:bg-blue-800 text-[10px]">
                            {empTxs.length}
                          </span>
                        </button>

                        {(canEdit || canDelete) && (
                          <div className="flex items-center gap-1">
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(isAr ? `هل أنت تأكد من حذف الموظف "${emp.name}"؟` : 'Delete employee?')) {
                                    onDeleteEmployee(emp.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 transition-colors"
                                title={isAr ? 'حذف الموظف' : 'Delete'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            <ActionMenu
                              isAr={isAr}
                              onEdit={canEdit ? () => handleOpenEmpModal(emp) : undefined}
                              onDelete={canDelete ? () => {
                                if (confirm(isAr ? `هل أنت تأكد من حذف الموظف "${emp.name}"؟` : 'Delete employee?')) {
                                  onDeleteEmployee(emp.id);
                                }
                              } : undefined}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {searchQuery
                  ? (isAr ? 'لا توجد نتائج مطابقة لبحثك' : 'No matching employees found')
                  : (isAr ? 'لا يوجد أي موظفين حالياً - القائمة فارغة تماماً' : 'No employees currently registered')}
              </p>
            </div>
          )}
        </>
      )}

      {/* Employee Debt & Loan History Modal */}
      {selectedEmpForHistory && (() => {
        const empTxs = transactions.filter((t) => isMatchingEmployeeTx(t, selectedEmpForHistory));
        const liveCurrentBalance = computeEmployeeDebtBalance(selectedEmpForHistory, transactions);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
            <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-5xl sm:max-w-6xl xl:max-w-7xl p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-3.5 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                    <ReceiptText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                      {isAr ? `سجل الديون والمسددات: ${selectedEmpForHistory.name}` : `Debt History: ${selectedEmpForHistory.name}`}
                    </h3>
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                      {isAr ? `رصيد الدين الحالي: ${liveCurrentBalance.toLocaleString('en-US')} د.ع` : `Current Debt: ${liveCurrentBalance.toLocaleString('en-US')} IQD`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEmpForHistory(null)}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Grid-lined Table */}
              {empTxs.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs">
                  <table className="w-full text-center text-xs border-collapse border border-slate-300 dark:border-slate-700">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-black">
                        <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'نوع الدين' : 'Type'}</th>
                        <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'المبلغ' : 'Amount'}</th>
                        <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'التفاصيل / الملاحظة' : 'Details'}</th>
                        {isAdmin && (
                          <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">
                            {isAr ? 'إجراءات' : 'Actions'}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="font-semibold text-slate-700 dark:text-slate-200">
                      {empTxs.map((tx) => {
                        const isLoan = tx.type === 'loan';
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                            <td className="border border-slate-200 dark:border-slate-700 py-2 px-3">
                              <span
                                className={`inline-block font-extrabold px-2.5 py-0.5 rounded-full text-[10px] ${
                                  isLoan
                                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                                    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                                }`}
                              >
                                {isLoan ? (isAr ? 'دين (سلفة)' : 'Loan') : (isAr ? 'راجع دين' : 'Repaid')}
                              </span>
                            </td>
                            <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 font-black text-xs dir-ltr text-center">
                              <span className={isLoan ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                                {isLoan ? '+' : '-'}{tx.amount.toLocaleString('en-US')} د.ع
                              </span>
                            </td>
                            <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-600 dark:text-slate-300 text-xs font-mono font-bold dir-rtl text-center whitespace-nowrap">
                              {formatDebtDate(tx.createdAt)}
                            </td>
                            <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-600 dark:text-slate-300 text-right">
                              {tx.notes || (isLoan ? (isAr ? 'تسجيل سلفة دين' : 'Loan issued') : (isAr ? 'سداد سلفة دين' : 'Loan repaid'))}
                            </td>
                            {(canEdit || canDelete) && (
                              <td className="border border-slate-200 dark:border-slate-700 py-2 px-3">
                                <div className="flex items-center justify-center gap-1">
                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTx(tx);
                                        setEditTxAmount(tx.amount.toString());
                                        setEditTxNote(tx.notes || tx.note || '');
                                      }}
                                      className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                                      title={isAr ? 'تعديل' : 'Edit'}
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            isAr
                                              ? 'هل أنت متأكد من حذف هذه الحركة؟ سيتم تعديل رصيد الموظف والصندوق تلقائياً.'
                                              : 'Delete this transaction? Balance will be adjusted automatically.'
                                          )
                                        ) {
                                          onDeleteEmployeeTransaction?.(tx, selectedEmpForHistory);
                                        }
                                      }}
                                      className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                                      title={isAr ? 'حذف' : 'Delete'}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs font-bold bg-slate-50 dark:bg-slate-900/40 rounded-2xl">
                  {isAr ? 'لا توجد ديون أو سلف سابقة لهذا الموظف' : 'No debt history for this employee'}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedEmpForHistory(null)}
                  className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-black transition-all"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Employee Transaction Modal */}
      {editingTx && selectedEmpForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-500" />
                <span>{isAr ? 'تعديل حركة الدين' : 'Edit Debt Transaction'}</span>
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(editTxAmount);
                if (!amt || amt <= 0) return;
                onUpdateEmployeeTransaction?.(
                  editingTx,
                  selectedEmpForHistory,
                  amt,
                  editTxNote.trim()
                );
                setEditingTx(null);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المبلغ (د.ع) *' : 'Amount (IQD) *'}
                </label>
                <input
                  type="number"
                  value={editTxAmount}
                  onChange={(e) => setEditTxAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الملاحظة / التفاصيل' : 'Note / Details'}
                </label>
                <input
                  type="text"
                  value={editTxNote}
                  onChange={(e) => setEditTxNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-md"
                >
                  {isAr ? 'حفظ التعديلات' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {isEmpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-500" />
                <span>{editingEmp ? (isAr ? 'تعديل بيانات الموظف' : 'Edit Employee') : (isAr ? 'إضافة موظف جديد' : 'Add Employee')}</span>
              </h3>
              <button onClick={() => setIsEmpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {empError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {empError}
              </div>
            )}

            <form onSubmit={handleEmpSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'نوع الموظف في النظام *' : 'Employee Type *'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRepEmp(false)}
                    className={`py-2 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isRepEmp
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>{isAr ? 'موظف عادي' : 'Standard Employee'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsRepEmp(true)}
                    className={`py-2 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isRepEmp
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>{isAr ? 'مندوب (يظهر صندوقه بحسابه)' : 'Collector / Rep'}</span>
                  </button>
                </div>
              </div>

              {isRepEmp && reps && reps.length > 0 && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'اختر حساب المندوب المرتبط *' : 'Select Rep Account *'}
                  </label>
                  <select
                    value={selectedRepId}
                    onChange={(e) => {
                      setSelectedRepId(e.target.value);
                      const selectedRep = reps.find((r) => r.id === e.target.value);
                      if (selectedRep && !empName) {
                        setEmpName(selectedRep.name);
                        setEmpPhone(selectedRep.phone || '');
                        if (!empPosition) setEmpPosition(isAr ? 'مندوب / محصل' : 'Sales Representative');
                      }
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold"
                  >
                    <option value="">-- {isAr ? 'اختر المندوب' : 'Select Rep'} --</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الموظف *' : 'Employee Name *'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder={isAr ? 'اسم الموظف الكامل...' : 'Full name...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المسمى الوظيفي / الصفة' : 'Position'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={empPosition}
                  onChange={(e) => setEmpPosition(e.target.value)}
                  placeholder={isAr ? 'مثال: مندوب مبيعات، محصل، محاسب...' : 'e.g. Sales Rep'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الراتب الشهري (د.ع)' : 'Monthly Salary'}
                </label>
                <input
                  type="number"
                  value={empSalary}
                  onChange={(e) => setEmpSalary(e.target.value)}
                  placeholder="600000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <input
                  type="text"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  placeholder="07700000000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 dir-ltr text-right"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 font-black text-white text-xs"
                >
                  {editingEmp ? (isAr ? 'حفظ التعديلات' : 'Save') : (isAr ? 'إنشاء الموظف' : 'Add')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEmpModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Debt Transaction Modal */}
      {isDebtModalOpen && selectedEmpForDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <HandCoins className="w-5 h-5 text-amber-500" />
                <span>
                  {debtType === 'loan'
                    ? isAr ? `تسجيل دين (سلفة) لـ: ${selectedEmpForDebt.name}` : `New Loan for ${selectedEmpForDebt.name}`
                    : isAr ? `سداد (راجع دين) من: ${selectedEmpForDebt.name}` : `Return Debt from ${selectedEmpForDebt.name}`}
                </span>
              </h3>
              <button onClick={() => setIsDebtModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDebtSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setDebtType('loan'); setDebtError(''); }}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    debtType === 'loan'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'دين (سلفة للموظف)' : 'Loan (Debt)'}
                </button>
                <button
                  type="button"
                  onClick={() => { setDebtType('repay'); setDebtError(''); }}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    debtType === 'repay'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {isAr ? 'راجع دين (سداد من الموظف)' : 'Repay Debt'}
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المبلغ (د.ع) *' : 'Amount (IQD) *'}
                </label>
                <input
                  type="number"
                  value={debtAmount}
                  onChange={(e) => { setDebtAmount(e.target.value); setDebtError(''); }}
                  placeholder="50000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الصندوق المالي المتأثر *' : 'Cash Fund *'}
                </label>
                <select
                  value={debtFundId}
                  onChange={(e) => setDebtFundId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (رصيده: {f.balance.toLocaleString('en-US')} د.ع)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'حقل التفاصيل والملاحظات' : 'Details / Notes'}
                </label>
                <input
                  type="text"
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  placeholder={isAr ? 'تفاصيل السبب أو السلفة...' : 'Details...'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>

              {debtError && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold text-xs text-center border border-rose-200 dark:border-rose-900 animate-in fade-in duration-200">
                  {debtError}
                </div>
              )}

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl font-black text-white text-xs ${
                    debtType === 'loan' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isAr ? 'تسجيل الحركة الآن' : 'Save Transaction'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDebtModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
