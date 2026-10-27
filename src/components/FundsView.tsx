import React, { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  Plus,
  Trash2,
  Edit2,
  FolderKanban,
  Building2,
  Receipt,
  Search,
  X,
  History,
  TrendingDown,
  TrendingUp,
  ReceiptText,
  BadgeDollarSign,
  ArrowUp,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { CashFund, CustomerList, FundTransaction, InstallmentContract, Language, SalesRepresentative } from '../types';
import { ActionMenu } from './ActionMenu';
import { hasDuplicateName, deduplicateEntitiesByName, normalizeEntityName } from '../lib/nameHelpers';

interface FundsViewProps {
  funds: CashFund[];
  customerLists: CustomerList[];
  transactions: FundTransaction[];
  currentRep: SalesRepresentative | null;
  lang: Language;
  contracts?: InstallmentContract[];
  onAddFund: (fund: Omit<CashFund, 'id'>) => void;
  onUpdateFund: (id: string, data: Partial<CashFund>) => void;
  onDeleteFund: (id: string) => void;
  onReorderFunds?: (orderedIds: string[]) => void;
  onReorderLists?: (orderedIds: string[]) => void;
  onRecalculateBalances?: () => Promise<void> | void;
  onAddDepositOrWithdrawal: (
    fundId: string,
    type: 'deposit' | 'withdraw' | 'expense',
    amount: number,
    note?: string
  ) => void;
  onTransfer: (
    sourceFundId: string,
    targetFundId: string,
    amount: number,
    note?: string
  ) => void;
  onAddList: (list: Omit<CustomerList, 'id'>) => void;
  onUpdateList: (id: string, data: Partial<CustomerList>) => void;
  onDeleteList: (id: string, fundId?: string) => void;
  onDeleteFundTransaction?: (tx: FundTransaction) => Promise<void> | void;
  onUpdateFundTransaction?: (tx: FundTransaction, newAmount: number, newNote: string) => void;
}

export const FundsView: React.FC<FundsViewProps> = ({
  funds,
  customerLists,
  transactions,
  currentRep,
  lang,
  contracts = [],
  onAddFund,
  onUpdateFund,
  onDeleteFund,
  onReorderFunds,
  onReorderLists,
  onRecalculateBalances,
  onAddDepositOrWithdrawal,
  onTransfer,
  onAddList,
  onUpdateList,
  onDeleteList,
  onDeleteFundTransaction,
  onUpdateFundTransaction,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = !currentRep || currentRep.role === 'admin';
  const canDelete = true; // Enabled for deleting items as requested
  const canEdit = isAdmin || (currentRep && currentRep.canEdit === true);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleMoveFund = (index: number, direction: 'up' | 'down') => {
    if (!onReorderFunds) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= funds.length) return;
    const newFunds = [...funds];
    const temp = newFunds[index];
    newFunds[index] = newFunds[targetIndex];
    newFunds[targetIndex] = temp;
    onReorderFunds(newFunds.map((f) => f.id));
  };

  const handleMoveList = (index: number, direction: 'up' | 'down') => {
    if (!onReorderLists) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= customerLists.length) return;
    const newLists = [...customerLists];
    const temp = newLists[index];
    newLists[index] = newLists[targetIndex];
    newLists[targetIndex] = temp;
    onReorderLists(newLists.map((l) => l.id));
  };

  // Active Sub-Tab: 'funds', 'lists', or 'history'
  const [activeSubTab, setActiveSubTab] = useState<'funds' | 'lists' | 'history'>('funds');

  // Date range filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Multi-delete state
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  // Modals state
  const [isDepositWithdrawModalOpen, setIsDepositWithdrawModalOpen] = useState(false);
  const [dwType, setDwType] = useState<'deposit' | 'withdraw' | 'expense'>('deposit');
  const [dwFundId, setDwFundId] = useState<string>('');
  const [dwAmount, setDwAmount] = useState<string>('');
  const [dwNote, setDwNote] = useState<string>('');

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceId, setTransferSourceId] = useState<string>('');
  const [transferTargetId, setTransferTargetId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');

  const [editingTx, setEditingTx] = useState<FundTransaction | null>(null);
  const [editTxAmount, setEditTxAmount] = useState<string>('');
  const [editTxNote, setEditTxNote] = useState<string>('');

  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<CashFund | null>(null);
  const [fundName, setFundName] = useState('');
  const [fundBalance, setFundBalance] = useState('');
  const [fundDescription, setFundDescription] = useState('');
  const [fundError, setFundError] = useState('');

  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<CustomerList | null>(null);
  const [listName, setListName] = useState('');
  const [listFundId, setListFundId] = useState('');
  const [listDescription, setListDescription] = useState('');
  const [listReceiptTemplate, setListReceiptTemplate] = useState<'template_1' | 'template_2'>('template_1');
  const [listError, setListError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFundIdFilter, setSelectedFundIdFilter] = useState<string>('all');
  
  const categoryToTypes: Record<string, string[]> = {
    deposit: ['deposit', 'employee_repay'],
    withdraw: ['withdraw', 'employee_loan'],
    transfer: ['transfer']
  };
  const allCategories = ['deposit', 'withdraw', 'transfer'];
  const [selectedCategories, setSelectedCategories] = useState<string[]>(allCategories);

  const isAllSelected = selectedCategories.length === allCategories.length;

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(allCategories);
    }
  };

  const handleToggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSelectAllTransactions = () => {
    const currentFilteredIds = filteredTransactions.map(tx => tx.id);
    const areAllCurrentSelected = currentFilteredIds.every(id => selectedTxIds.includes(id));
    
    if (areAllCurrentSelected) {
      setSelectedTxIds(prev => prev.filter(id => !currentFilteredIds.includes(id)));
    } else {
      setSelectedTxIds(prev => {
        const otherSelected = prev.filter(id => !currentFilteredIds.includes(id));
        return [...otherSelected, ...currentFilteredIds];
      });
    }
  };

  const handleToggleSelectTransaction = (id: string) => {
    setSelectedTxIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedTransactions = async () => {
    const selectedTxs = filteredTransactions.filter(tx => selectedTxIds.includes(tx.id));
    if (selectedTxs.length === 0) return;
    
    const confirmMsg = isAr 
      ? `هل أنت متأكد من حذف ${selectedTxs.length} حركة مالية محددة؟ سيتم تعديل رصيد الصناديق تلقائياً.` 
      : `Are you sure you want to delete ${selectedTxs.length} selected transactions? Fund balances will adjust automatically.`;
      
    if (confirm(confirmMsg)) {
      for (const tx of selectedTxs) {
        if (onDeleteFundTransaction) {
          await onDeleteFundTransaction(tx);
        }
      }
      setSelectedTxIds([]);
    }
  };

  const totalFundsBalance = funds.reduce((sum, f) => sum + (f.balance || 0), 0);

  // Totals stats
  const totalDeposits = transactions
    .filter((tx) => ['deposit', 'employee_repay'].includes(tx.type))
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpenses = transactions
    .filter((tx) => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Form Handlers
  const handleOpenDWModal = (
    fundId?: string,
    defaultType: 'deposit' | 'withdraw' | 'expense' = 'deposit'
  ) => {
    setDwFundId(fundId || funds[0]?.id || '');
    setDwType(defaultType);
    setDwAmount('');
    setDwNote('');
    setIsDepositWithdrawModalOpen(true);
  };

  const handleDWSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(dwAmount);
    if (!dwFundId || amount <= 0) return;
    onAddDepositOrWithdrawal(dwFundId, dwType, amount, dwNote.trim());
    setIsDepositWithdrawModalOpen(false);
  };

  const handleOpenTransferModal = (sourceId?: string) => {
    const srcId = sourceId || funds[0]?.id || '';
    setTransferSourceId(srcId);
    const otherFund = funds.find((f) => f.id !== srcId);
    setTransferTargetId(otherFund?.id || '');
    const sourceFund = funds.find((f) => f.id === srcId);
    setTransferAmount(sourceFund && sourceFund.balance ? sourceFund.balance.toString() : '');
    setTransferNote('');
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(transferAmount);
    if (!transferSourceId || !transferTargetId || transferSourceId === transferTargetId || amount <= 0) return;
    onTransfer(transferSourceId, transferTargetId, amount, transferNote.trim());
    setIsTransferModalOpen(false);
  };

  const handleOpenFundModal = (fund?: CashFund) => {
    setFundError('');
    if (fund) {
      setEditingFund(fund);
      setFundName(fund.name);
      setFundBalance(fund.balance.toString());
      setFundDescription(fund.description || '');
    } else {
      setEditingFund(null);
      setFundName('');
      setFundBalance('0');
      setFundDescription('');
    }
    setIsFundModalOpen(true);
  };

  const handleFundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fundName.trim();
    if (!trimmedName) {
      setFundError(isAr ? 'يرجى إدخال اسم الصندوق' : 'Fund name is required');
      return;
    }

    if (hasDuplicateName(funds, trimmedName, editingFund?.id)) {
      setFundError(isAr ? 'عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكراره' : 'Fund name already exists');
      return;
    }

    if (editingFund) {
      const parsedBalance = fundBalance.trim() === '' ? editingFund.balance : Number(fundBalance);
      onUpdateFund(editingFund.id, {
        name: trimmedName,
        balance: isNaN(parsedBalance) ? editingFund.balance : parsedBalance,
        description: fundDescription.trim(),
      });
    } else {
      onAddFund({
        name: trimmedName,
        balance: Number(fundBalance) || 0,
        description: fundDescription.trim(),
      });
    }
    setIsFundModalOpen(false);
  };

  const handleOpenListModal = (list?: CustomerList) => {
    setListError('');
    if (list) {
      setEditingList(list);
      setListName(list.name);
      setListFundId(list.fundId || (list as any).fund_id || '');
      setListDescription(list.description || '');
      setListReceiptTemplate((list as any).receiptTemplate || (list as any).receipt_template || 'template_1');
    } else {
      setEditingList(null);
      setListName('');
      setListFundId(funds[0]?.id || '');
      setListDescription('');
      setListReceiptTemplate('template_1');
    }
    setIsListModalOpen(true);
  };

  const handleListSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = listName.trim();
    if (!trimmedName) {
      setListError(isAr ? 'يرجى إدخال اسم القائمة' : 'List name is required');
      return;
    }
    if (!listFundId) {
      setListError(isAr ? 'يرجى اختيار الصندوق المالي المربوط' : 'Fund is required');
      return;
    }

    if (hasDuplicateName(customerLists, trimmedName, editingList?.id)) {
      setListError(isAr ? 'عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكراره' : 'List name already exists');
      return;
    }

    if (editingList) {
      onUpdateList(editingList.id, {
        name: trimmedName,
        fundId: listFundId,
        description: listDescription.trim(),
        receiptTemplate: listReceiptTemplate,
      });
    } else {
      onAddList({
        name: trimmedName,
        fundId: listFundId,
        description: listDescription.trim(),
        receiptTemplate: listReceiptTemplate,
      });
    }
    setIsListModalOpen(false);
  };

  const getTransactionTypeName = (type: string, tx?: FundTransaction) => {
    switch (type) {
      case 'deposit':
        return isAr ? 'إيداع' : 'Deposit';
      case 'withdraw':
        return isAr ? 'سحب' : 'Withdraw';
      case 'employee_loan':
        return isAr ? 'دين' : 'Employee Loan';
      case 'employee_repay':
        return isAr ? 'راجع دين' : 'Employee Repay';
      case 'expense':
        return isAr ? 'مصروفات' : 'Expense';
      case 'transfer':
        if (tx && selectedFundIdFilter !== 'all') {
          if (tx.targetFundId === selectedFundIdFilter) {
            return isAr ? 'تحويل (مستلم)' : 'Transfer (Received)';
          } else if (tx.fundId === selectedFundIdFilter) {
            return isAr ? 'تحويل (محول)' : 'Transfer (Sent)';
          }
        }
        return isAr ? 'تحويل' : 'Transfer';
      default:
        return type;
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    // Only show specified allowed types
    const allowedTypes = ['deposit', 'withdraw', 'expense', 'transfer', 'employee_loan', 'employee_repay'];
    if (!allowedTypes.includes(tx.type)) return false;

    // 1. Search Query Filter
    const matchesSearch =
      !searchQuery.trim() ||
      tx.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.repName?.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Fund Filter
    const matchesFund =
      selectedFundIdFilter === 'all' ||
      tx.fundId === selectedFundIdFilter ||
      tx.targetFundId === selectedFundIdFilter;

    // 3. Category Filter
    let matchesCategory = false;
    selectedCategories.forEach((cat) => {
      if (cat === 'deposit') {
        if (tx.type === 'deposit' || tx.type === 'employee_repay') {
          matchesCategory = true;
        }
        // الصندوق المستلم يضيف نفس المبلغ مع الايداع
        if (tx.type === 'transfer' && selectedFundIdFilter !== 'all' && tx.targetFundId === selectedFundIdFilter) {
          matchesCategory = true;
        }
      } else if (cat === 'withdraw') {
        if (tx.type === 'withdraw' || tx.type === 'expense' || tx.type === 'employee_loan') {
          matchesCategory = true;
        }
        // التحويل الصندوق المحول يضيف مع السحب
        if (tx.type === 'transfer' && selectedFundIdFilter !== 'all' && tx.fundId === selectedFundIdFilter) {
          matchesCategory = true;
        }
      } else if (cat === 'transfer') {
        if (tx.type === 'transfer') {
          matchesCategory = true;
        }
      }
    });

    // 4. Date range filter
    let matchesDate = true;
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const txDate = new Date(tx.createdAt);
      if (txDate < start) matchesDate = false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const txDate = new Date(tx.createdAt);
      if (txDate > end) matchesDate = false;
    }

    return matchesSearch && matchesFund && matchesCategory && matchesDate;
  });

  return (
    <div className="space-y-4 dir-rtl pb-12">
      {/* Streamlined Header Bar (Directly starting with actions & subtabs) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quick Balance Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي الرصيد:' : 'Total Balance:'}
            </span>
            <span className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-black dir-ltr border border-blue-200 dark:border-slate-800">
              {totalFundsBalance.toLocaleString('en-US')} د.ع
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <button
                type="button"
                onClick={() => handleOpenFundModal()}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة صندوق جديد' : 'Add New Fund'}</span>
              </button>
            )}
            {canEdit && activeSubTab === 'lists' && (
              <button
                type="button"
                onClick={() => handleOpenListModal()}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'إضافة قائمة' : 'Add List'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleOpenDWModal(undefined, 'deposit')}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>{isAr ? 'إيداع/سحب' : 'Deposit/Withdraw'}</span>
            </button>
            {onRecalculateBalances && (
              <button
                type="button"
                disabled={isRecalculating}
                onClick={async () => {
                  if (isRecalculating) return;
                  setIsRecalculating(true);
                  try {
                    await onRecalculateBalances();
                  } finally {
                    setIsRecalculating(false);
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                title={isAr ? 'تدقيق ومطابقة أرصدة الصناديق مع جميع تسديدات الزبائن' : 'Audit and recalculate fund balances with all payments'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'تدقيق ومطابقة الأرصدة' : 'Audit & Recalculate'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/80 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('funds')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'funds'
                ? 'bg-blue-600 text-white font-black shadow-xs'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>{isAr ? 'الصناديق' : 'Funds'} ({funds.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('lists')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'lists'
                ? 'bg-blue-600 text-white font-black shadow-xs'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>{isAr ? 'قوائم الزبائن' : 'Customer Lists'} ({customerLists.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'history'
                ? 'bg-blue-600 text-white font-black shadow-xs'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>{isAr ? 'سجل الحركات' : 'Log'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab 1: Cash Funds List */}
      {activeSubTab === 'funds' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {funds.map((fund, fundIdx) => {
            const linkedLists = customerLists.filter((l) =>
              l.fundId === fund.id ||
              (l as any).fund_id === fund.id ||
              (fund.name && l.fundId && normalizeEntityName(l.fundId) === normalizeEntityName(fund.name)) ||
              (l.name && fund.name && normalizeEntityName(l.name) === normalizeEntityName(fund.name))
            );

            return (
              <div
                key={fund.id}
                className="bg-white dark:bg-slate-800 rounded-2xl p-4 border-2 border-slate-200 dark:border-slate-700 shadow-xs hover:border-blue-500 transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 shrink-0 mt-0.5">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-[15px] font-black text-slate-900 dark:text-slate-100 break-words leading-snug">
                          {fund.name}
                        </h3>
                        {fund.description && (
                          <p className="text-xs text-slate-400 font-medium break-words mt-0.5">
                            {fund.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && onReorderFunds && funds.length > 1 && (
                        <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5">
                          <button
                            type="button"
                            disabled={fundIdx === 0}
                            onClick={() => handleMoveFund(fundIdx, 'up')}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            title={isAr ? 'تحريك للأعلى' : 'Move Up'}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={fundIdx === funds.length - 1}
                            onClick={() => handleMoveFund(fundIdx, 'down')}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                            title={isAr ? 'تحريك للأسفل' : 'Move Down'}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleOpenFundModal(fund)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 transition-colors cursor-pointer"
                          title={isAr ? 'تعديل الصندوق' : 'Edit Fund'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(isAr ? 'هل أنت تأكد من حذف هذا الصندوق؟' : 'Delete fund?')) {
                              onDeleteFund(fund.id);
                            }
                          }}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300 transition-colors cursor-pointer"
                          title={isAr ? 'حذف الصندوق' : 'Delete Fund'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Fund Balance */}
                  <div className="my-2 bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-400 block mb-0.5">
                      {isAr ? 'الرصيد الحالي:' : 'Balance:'}
                    </span>
                    <span className="text-base font-black text-slate-900 dark:text-slate-100 dir-ltr text-right block">
                      {fund.balance.toLocaleString('en-US')} <span className="text-xs font-bold text-blue-600 dark:text-blue-400">د.ع</span>
                    </span>
                  </div>

                  {/* Linked Customer Lists */}
                  {linkedLists.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {linkedLists.map((l) => (
                        <span
                          key={l.id}
                          className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-md break-words"
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Action Buttons */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80 grid grid-cols-4 gap-1 text-[10px] font-bold">
                  <button
                    onClick={() => handleOpenDWModal(fund.id, 'deposit')}
                    className="py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center justify-center gap-0.5"
                    title={isAr ? 'إيداع' : 'Deposit'}
                  >
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>{isAr ? 'إيداع' : 'In'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenTransferModal(fund.id)}
                    className="py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 hover:bg-blue-100 transition-colors flex items-center justify-center gap-0.5"
                    title={isAr ? 'تحويل بين الصناديق' : 'Transfer'}
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>{isAr ? 'تحويل' : 'Transfer'}</span>
                  </button>

                  <button
                    onClick={() => handleOpenDWModal(fund.id, 'withdraw')}
                    className="py-1 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 hover:bg-rose-100 transition-colors flex items-center justify-center gap-0.5"
                    title={isAr ? 'سحب' : 'Withdraw'}
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    <span>{isAr ? 'سحب' : 'Out'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedFundIdFilter(fund.id);
                      setActiveSubTab('history');
                    }}
                    className="py-1 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors flex items-center justify-center gap-0.5"
                    title={isAr ? 'عرض حركات الصندوق' : 'Fund Log'}
                  >
                    <History className="w-3 h-3" />
                    <span>{isAr ? 'حركات' : 'Log'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sub-Tab 2: Customer Lists Management */}
      {activeSubTab === 'lists' && (() => {
        const emptyOrCompletedLists = customerLists.filter((list) => {
          const listContracts = contracts.filter((c) => c.listId === list.id);
          const hasActive = listContracts.some((c) => (Number(c.remainingBalance) || 0) > 0 && c.status !== 'completed');
          return !hasActive;
        });

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'قوائم وسجلات الزبائن' : 'Customer Lists'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr ? 'تقسيم الزبائن إلى قوائم ومجموعات وربط كل قائمة بصندوق خاص' : 'Group customers into lists and link each list to a specific cash fund'}
                </p>
              </div>
              {(canEdit || canDelete) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {canDelete && emptyOrCompletedLists.length > 0 && (
                    <button
                      onClick={() => {
                        const confirmMsg = isAr
                          ? `هل أنت متأكد من حذف ${emptyOrCompletedLists.length} قائمة لا تحتوي على أي زبون بمبلغ متبقي أكبر من 0؟`
                          : `Are you sure you want to delete ${emptyOrCompletedLists.length} lists with no remaining balance > 0?`;
                        if (confirm(confirmMsg)) {
                          emptyOrCompletedLists.forEach((l) => {
                            onDeleteList(l.id, l.fundId);
                          });
                        }
                      }}
                      className="px-4 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 font-extrabold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      title={isAr ? 'حذف القوائم التي لا تحتوي على زبون باقي أكبر من 0' : 'Delete lists with no remaining balance > 0'}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isAr ? `حذف القوائم المكتملة (${emptyOrCompletedLists.length})` : `Delete Completed Lists (${emptyOrCompletedLists.length})`}</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => handleOpenListModal()}
                      className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isAr ? 'إضافة قائمة جديدة' : 'Add New List'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customerLists.map((list, listIdx) => {
                const linkedFund = funds.find((f) =>
                  f.id === list.fundId ||
                  (list as any).fund_id === f.id ||
                  (f.name && list.fundId && normalizeEntityName(f.name) === normalizeEntityName(list.fundId)) ||
                  (list.name && f.name && normalizeEntityName(f.name) === normalizeEntityName(list.name)) ||
                  (list.name && f.id && normalizeEntityName(f.id) === normalizeEntityName(list.name))
                ) || (funds.length === 1 ? funds[0] : undefined);
                const listContracts = contracts.filter((c) => c.listId === list.id);
                const hasActive = listContracts.some((c) => (Number(c.remainingBalance) || 0) > 0 && c.status !== 'completed');

                return (
                  <div
                    key={list.id}
                    className="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-2xl ${hasActive ? 'bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300' : 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300'}`}>
                            <FolderKanban className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                                {list.name}
                              </h3>
                              {!hasActive && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                                  {isAr ? 'مكتملة / فارغة' : 'Completed'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              {list.description || (isAr ? `عدد الزبائن: ${listContracts.length}` : `${listContracts.length} clients`)}
                            </p>
                          </div>
                        </div>

                      {(canEdit || canDelete) && (
                        <div className="flex items-center gap-1">
                          {canEdit && onReorderLists && customerLists.length > 1 && (
                            <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5">
                              <button
                                type="button"
                                disabled={listIdx === 0}
                                onClick={() => handleMoveList(listIdx, 'up')}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                title={isAr ? 'تحريك للأعلى' : 'Move Up'}
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={listIdx === customerLists.length - 1}
                                onClick={() => handleMoveList(listIdx, 'down')}
                                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                title={isAr ? 'تحريك للأسفل' : 'Move Down'}
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenListModal(list)}
                              className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 transition-colors cursor-pointer"
                              title={isAr ? 'تعديل القائمة' : 'Edit List'}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => {
                                const linkedFund = funds.find((f) => f.id === list.fundId);
                                const confirmMsg = isAr
                                  ? linkedFund
                                    ? 'هل أنت متأكد من حذف هذه القائمة والديون التابعة لها والصندوق المربوط بها؟'
                                    : 'هل أنت متأكد من حذف هذه القائمة والديون التابعة لها؟'
                                  : linkedFund
                                  ? 'Are you sure you want to delete this list, its debts, and linked fund?'
                                  : 'Are you sure you want to delete this list and its debts?';

                                if (confirm(confirmMsg)) {
                                  onDeleteList(list.id, list.fundId);
                                }
                              }}
                              className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300 transition-colors cursor-pointer"
                              title={isAr ? 'حذف القائمة' : 'Delete List'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                          {isAr ? 'الصندوق المالي المربوط:' : 'Linked Cash Fund:'}
                        </span>
                        <div className="flex items-center gap-2 font-black text-slate-900 dark:text-slate-100 text-sm mt-0.5">
                          <Wallet className="w-4 h-4 text-blue-500" />
                          <span>{linkedFund ? linkedFund.name : (isAr ? 'غير مخصص' : 'Unassigned')}</span>
                          {linkedFund && (
                            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 mr-auto">
                              ({linkedFund.balance.toLocaleString('en-US')} د.ع)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-bold">
                          {isAr ? 'تصميم الوصل:' : 'Receipt Template:'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md font-black text-[11px] flex items-center gap-1 ${
                          ((list as any).receiptTemplate === 'template_2' || (list as any).receipt_template === 'template_2')
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                        }`}>
                          <Receipt className="w-3 h-3" />
                          {((list as any).receiptTemplate === 'template_2' || (list as any).receipt_template === 'template_2')
                            ? (isAr ? 'وصل 2 (جداول)' : 'Receipt 2 (Tables)')
                            : (isAr ? 'وصل 1 (افتراضي)' : 'Receipt 1 (Default)')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })()}

      {/* Sub-Tab 3: Transaction History Log */}
      {activeSubTab === 'history' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
          {/* Controls Bar: Fund selector, Search, and Category Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-700">
            {/* Filter category buttons */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto text-xs font-bold no-scrollbar py-1">
              <button
                onClick={handleToggleAll}
                className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  isAllSelected
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-black shadow-xs'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={isAllSelected}
                  onChange={() => {}}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500 w-3 h-3 cursor-pointer pointer-events-none" 
                />
                <span>{isAr ? 'تحديد الكل' : 'Select All'}</span>
              </button>

              <button
                onClick={() => handleToggleCategory('deposit')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedCategories.includes('deposit')
                    ? 'bg-emerald-600 text-white font-black shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={selectedCategories.includes('deposit')}
                  onChange={() => {}}
                  className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 w-3 h-3 cursor-pointer pointer-events-none" 
                />
                <span>{isAr ? 'إيداع' : 'Deposit'}</span>
              </button>

              <button
                onClick={() => handleToggleCategory('withdraw')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedCategories.includes('withdraw')
                    ? 'bg-rose-600 text-white font-black shadow-xs'
                    : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={selectedCategories.includes('withdraw')}
                  onChange={() => {}}
                  className="rounded border-rose-300 text-rose-600 focus:ring-rose-500 w-3 h-3 cursor-pointer pointer-events-none" 
                />
                <span>{isAr ? 'سحب' : 'Withdraw'}</span>
              </button>

              <button
                onClick={() => handleToggleCategory('transfer')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedCategories.includes('transfer')
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 hover:bg-blue-100'
                }`}
              >
                <input 
                  type="checkbox" 
                  checked={selectedCategories.includes('transfer')}
                  onChange={() => {}}
                  className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3 h-3 cursor-pointer pointer-events-none" 
                />
                <span>{isAr ? 'تحويل' : 'Transfer'}</span>
              </button>
            </div>

            {/* Fund Selector & Search input */}
            <div className="flex flex-wrap items-center gap-2">
              {canDelete && selectedTxIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedTransactions}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all animate-in fade-in slide-in-from-top-1 cursor-pointer animate-pulse"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? `حذف المحدد (${selectedTxIds.length})` : `Delete Selected (${selectedTxIds.length})`}</span>
                </button>
              )}

              <select
                value={selectedFundIdFilter}
                onChange={(e) => setSelectedFundIdFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">{isAr ? 'جميع الصناديق' : 'All Funds'}</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-40">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isAr ? 'بحث بالبيان أو المندوب...' : 'Search...'}
                  className="w-full pr-8 pl-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Date pickers */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-900 px-1.5 sm:px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 min-w-0">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold shrink-0 pointer-events-none">{isAr ? 'من:' : 'From:'}</span>
                  <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-xs text-slate-800 dark:text-slate-200 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

                <div className="relative flex items-center justify-between gap-1 bg-slate-50 dark:bg-slate-900 px-1.5 sm:px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 min-w-0">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold shrink-0 pointer-events-none">{isAr ? 'إلى:' : 'To:'}</span>
                  <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-xs text-slate-800 dark:text-slate-200 tracking-tighter whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors text-xs font-bold"
                  >
                    {isAr ? 'تفريغ التواريخ' : 'Clear Dates'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Grid-lined Transactions Table (جدول مخطط) */}
          <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700 shadow-2xs">
            <table className="w-full text-center text-xs border-collapse border border-slate-300 dark:border-slate-700">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-black">
                  {canDelete && (
                    <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredTransactions.length > 0 && filteredTransactions.every(tx => selectedTxIds.includes(tx.id))}
                        onChange={handleSelectAllTransactions}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        title={isAr ? 'تحديد الكل' : 'Select All'}
                      />
                    </th>
                  )}
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'نوع الحركة' : 'Type'}</th>
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'الصندوق' : 'Fund'}</th>
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'البيان والتفاصيل' : 'Note'}</th>
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'المندوب / المستخدم' : 'Rep'}</th>
                  <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3">{isAr ? 'التاريخ والوقت' : 'Date'}</th>
                  {(canEdit || canDelete) && (
                    <th className="border border-slate-300 dark:border-slate-700 py-2.5 px-3 w-20">{isAr ? 'العمليات' : 'Actions'}</th>
                  )}
                </tr>
              </thead>
              <tbody className="font-semibold text-slate-700 dark:text-slate-200">
                {filteredTransactions.length > 0 ? (
                  filteredTransactions.map((tx) => {
                    const fund = funds.find((f) => f.id === tx.fundId);
                    const targetFund = tx.targetFundId ? funds.find((f) => f.id === tx.targetFundId) : null;

                     let isCredit = ['deposit', 'employee_repay'].includes(tx.type);
                     let isExpense = ['withdraw', 'employee_loan'].includes(tx.type);

                     if (tx.type === 'transfer') {
                       if (selectedFundIdFilter !== 'all') {
                         if (tx.targetFundId === selectedFundIdFilter) {
                           isCredit = true;
                         } else if (tx.fundId === selectedFundIdFilter) {
                           isExpense = true;
                         }
                       }
                     }

                     return (
                       <tr key={tx.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors ${selectedTxIds.includes(tx.id) ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
                         {canDelete && (
                           <td className="border border-slate-200 dark:border-slate-700 py-2 px-3">
                             <input
                               type="checkbox"
                               checked={selectedTxIds.includes(tx.id)}
                               onChange={() => handleToggleSelectTransaction(tx.id)}
                               className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                             />
                           </td>
                         )}
                         <td className="border border-slate-200 dark:border-slate-700 py-2 px-3">
                           <span
                             className={`inline-flex items-center gap-1 font-extrabold px-2.5 py-1 rounded-full text-[10px] ${
                               isCredit
                                 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200'
                                 : isExpense
                                 ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                                 : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200'
                             }`}
                           >
                             {getTransactionTypeName(tx.type, tx)}
                           </span>
                         </td>
                        <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {fund ? fund.name : '-'}
                          {targetFund && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 block font-bold">
                              إلى: {targetFund.name}
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 font-black text-xs dir-ltr text-center">
                          <span className={isCredit ? 'text-emerald-600 dark:text-emerald-400' : isExpense ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}>
                            {isCredit ? '+' : isExpense ? '-' : ''}{tx.amount.toLocaleString('en-US')} د.ع
                          </span>
                        </td>
                        <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-600 dark:text-slate-300">
                          {tx.note || '-'}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 font-bold text-slate-600 dark:text-slate-300">
                          {tx.repName || '-'}
                        </td>
                        <td className="border border-slate-200 dark:border-slate-700 py-2 px-3 text-slate-400 text-[11px] dir-ltr text-center font-mono">
                          {new Date(tx.createdAt).toLocaleString('en-US', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                            timeZone: 'Asia/Baghdad',
                          })}
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
                                    setEditTxNote(tx.note || '');
                                  }}
                                  className="p-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300 transition-colors cursor-pointer"
                                  title={isAr ? 'تعديل الحركة' : 'Edit'}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(isAr 
                                      ? 'هل أنت متأكد من حذف هذه الحركة المالية؟ سيتم تعديل رصيد الصندوق تلقائياً.' 
                                      : 'Are you sure you want to delete this transaction? Fund balance will adjust automatically.')) {
                                      onDeleteFundTransaction?.(tx);
                                    }
                                  }}
                                  className="p-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300 transition-colors cursor-pointer"
                                  title={isAr ? 'حذف الحركة' : 'Delete'}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6 + (canEdit || canDelete ? 1 : 0) + (canDelete ? 1 : 0)} className="border border-slate-200 dark:border-slate-700 py-8 text-center text-slate-400 font-medium">
                      {isAr ? 'لا توجد حركات مالية مسجلة بعد' : 'No recorded transactions yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deposit / Withdraw / Expense Modal */}
      {isDepositWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {dwType === 'deposit' ? (
                  <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
                ) : dwType === 'expense' ? (
                  <ReceiptText className="w-5 h-5 text-amber-500" />
                ) : (
                  <ArrowUpRight className="w-5 h-5 text-rose-500" />
                )}
                <span>
                  {dwType === 'deposit'
                    ? isAr ? 'إيداع مالي / إضافة للصندوق' : 'Deposit Cash'
                    : dwType === 'expense'
                    ? isAr ? 'تسجيل مصروفات من الصندوق' : 'Add Expense'
                    : isAr ? 'سحب مالي من الصندوق' : 'Withdraw Cash'}
                </span>
              </h3>
              <button
                onClick={() => setIsDepositWithdrawModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDWSubmit} className="space-y-3 text-xs">
              {/* Type selector toggle inside modal */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDwType('deposit')}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    dwType === 'deposit'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'إيداع للصندوق' : 'Deposit'}
                </button>
                <button
                  type="button"
                  onClick={() => setDwType('expense')}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    dwType === 'expense'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'مصروفات' : 'Expense'}
                </button>
                <button
                  type="button"
                  onClick={() => setDwType('withdraw')}
                  className={`py-2 rounded-lg font-bold transition-colors ${
                    dwType === 'withdraw'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'سحب نقدي' : 'Withdraw'}
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اختيار الصندوق *' : 'Select Fund *'}
                </label>
                <select
                  value={dwFundId}
                  onChange={(e) => setDwFundId(e.target.value)}
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
                  {isAr ? 'المبلغ (د.ع) *' : 'Amount (IQD) *'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  dir="ltr"
                  value={dwAmount}
                  onChange={(e) => {
                    const converted = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                    setDwAmount(converted.replace(/[^0-9]/g, ''));
                  }}
                  placeholder="50000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none dir-ltr text-left font-mono"
                />
                {dwAmount && Number(dwAmount) > 0 && (
                  <div className="mt-1 text-xs font-black text-emerald-600 dark:text-emerald-400 dir-ltr text-left font-mono">
                    = {Number(dwAmount).toLocaleString('en-US')} د.ع
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظة / تفاصيل البيان' : 'Note / Reason'}
                </label>
                <input
                  type="text"
                  value={dwNote}
                  onChange={(e) => setDwNote(e.target.value)}
                  placeholder={
                    dwType === 'expense'
                      ? isAr ? 'مثال: أجور كهرباء، صيانة، وقود...' : 'e.g. Utilities, Maintenance...'
                      : isAr ? 'مثال: رأس مال إضافي، سحب أرباح...' : 'e.g. Capital deposit...'
                  }
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className={`flex-1 py-2.5 rounded-xl font-black text-white text-xs ${
                    dwType === 'deposit'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : dwType === 'expense'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isAr ? 'تأكيد وحفظ الحركة' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDepositWithdrawModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                <span>{isAr ? 'تحويل مالي بين الصناديق' : 'Transfer Between Funds'}</span>
              </h3>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'من صندوق (السحب من) *' : 'From Fund *'}
                </label>
                <select
                  value={transferSourceId}
                  onChange={(e) => {
                    const srcId = e.target.value;
                    setTransferSourceId(srcId);
                    const sourceFund = funds.find((f) => f.id === srcId);
                    setTransferAmount(sourceFund ? sourceFund.balance.toString() : '');
                  }}
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
                  {isAr ? 'إلى صندوق (الإيداع فيه) *' : 'To Fund *'}
                </label>
                <select
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                >
                  {funds
                    .filter((f) => f.id !== transferSourceId)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} (رصيده: {f.balance.toLocaleString('en-US')} د.ع)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'مبلغ التحويل (د.ع) *' : 'Transfer Amount (IQD) *'}
                  </label>
                  {(() => {
                    const src = funds.find((f) => f.id === transferSourceId);
                    if (!src) return null;
                    return (
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 dir-ltr font-mono">
                        {isAr ? `الرصيد المتاح: ${src.balance.toLocaleString('en-US')} د.ع` : `Available: ${src.balance.toLocaleString('en-US')} IQD`}
                      </span>
                    );
                  })()}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    dir="ltr"
                    value={transferAmount}
                    onChange={(e) => {
                      const converted = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                      setTransferAmount(converted.replace(/[^0-9]/g, ''));
                    }}
                    placeholder="250000"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none dir-ltr text-left font-mono"
                  />
                  {transferAmount && Number(transferAmount) > 0 && (
                    <div className="mt-1 text-xs font-black text-blue-600 dark:text-blue-400 dir-ltr text-left font-mono">
                      = {Number(transferAmount).toLocaleString('en-US')} د.ع
                    </div>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {isAr ? 'تم إدراج رصيد الصندوق تلقائياً بالأرقام الإنكليزية، ويمكنك تعديله لأي مبلغ ترغب بتحويله.' : 'Fund balance pre-filled automatically; you can edit it to any amount.'}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظة التحويل' : 'Note'}
                </label>
                <input
                  type="text"
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder={isAr ? 'مثال: مناقلة سيولة نقدية' : 'Transfer note...'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-black text-white text-xs"
                >
                  {isAr ? 'إجراء التحويل الآن' : 'Execute Transfer'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Fund Modal */}
      {isFundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-500" />
                <span>{editingFund ? (isAr ? 'تعديل بيانات الصندوق' : 'Edit Fund') : (isAr ? 'إضافة صندوق مالي جديد' : 'Add New Cash Fund')}</span>
              </h3>
              <button
                onClick={() => setIsFundModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {fundError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {fundError}
              </div>
            )}

            <form onSubmit={handleFundSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الصندوق الخزني *' : 'Fund Name *'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={fundName}
                  onChange={(e) => setFundName(e.target.value)}
                  placeholder={isAr ? 'مثال: صندوق الكرخ والمنصور' : 'e.g. Karkh Main Fund'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الرصيد الأولي (د.ع)' : 'Initial Balance (IQD)'}
                </label>
                <input
                  type="number"
                  value={fundBalance}
                  onChange={(e) => setFundBalance(e.target.value)}
                  placeholder="0"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الوصف' : 'Description'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={fundDescription}
                  onChange={(e) => setFundDescription(e.target.value)}
                  placeholder={isAr ? 'وصف الصندوق...' : 'Fund description...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 font-black text-white text-xs"
                >
                  {editingFund ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إنشاء الصندوق' : 'Create Fund')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsFundModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit List Modal */}
      {isListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-amber-500" />
                <span>{editingList ? (isAr ? 'تعديل القائمة' : 'Edit List') : (isAr ? 'إضافة قائمة زبائن جديدة' : 'Add New Customer List')}</span>
              </h3>
              <button
                onClick={() => setIsListModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {listError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {listError}
              </div>
            )}

            <form onSubmit={handleListSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم قائمة الزبائن *' : 'List Name *'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder={isAr ? 'مثال: قائمة الكرخ 1' : 'e.g. List Karkh 1'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ربط بالصندوق المالي *' : 'Link to Cash Fund *'}
                </label>
                <select
                  value={listFundId}
                  onChange={(e) => setListFundId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                >
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظات القائمة' : 'Description'}
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={listDescription}
                  onChange={(e) => setListDescription(e.target.value)}
                  placeholder={isAr ? 'وصف أو منطقة القائمة...' : 'List notes...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              {/* اختيار تصميم وصل الزبون */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2">
                  {isAr ? 'تصميم وصل الزبون لهذه القائمة' : 'Customer Receipt Template'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setListReceiptTemplate('template_1')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      listReceiptTemplate === 'template_1'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Receipt className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    <span className="font-black text-xs">{isAr ? 'وصل 1 (الافتراضي)' : 'Receipt 1 (Default)'}</span>
                    <span className="text-[10px] opacity-75">{isAr ? 'التصميم الكلاسيكي الحالي' : 'Current classic layout'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setListReceiptTemplate('template_2')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      listReceiptTemplate === 'template_2'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <FolderKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-black text-xs">{isAr ? 'وصل 2 (جداول)' : 'Receipt 2 (Tables)'}</span>
                    <span className="text-[10px] opacity-75">{isAr ? 'جداول وبيانات منظمة' : 'Structured tables layout'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 font-black text-white text-xs"
                >
                  {editingList ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إنشاء القائمة' : 'Create List')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsListModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-xl sm:max-w-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-500" />
                <span>{isAr ? 'تعديل الحركة المالية' : 'Edit Transaction'}</span>
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editTxAmount.trim() || isNaN(Number(editTxAmount))) return;
                onUpdateFundTransaction?.(editingTx, Number(editTxAmount), editTxNote.trim());
                setEditingTx(null);
              }}
              className="space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المبلغ *' : 'Amount *'}
                </label>
                <input
                  type="number"
                  value={editTxAmount}
                  onChange={(e) => setEditTxAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'التفاصيل / البيان *' : 'Details / Note *'}
                </label>
                <textarea
                  value={editTxNote}
                  onChange={(e) => setEditTxNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
                  rows={3}
                  required
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md transition-colors cursor-pointer"
                >
                  {isAr ? 'حفظ التغييرات' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-extrabold text-xs transition-colors cursor-pointer"
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
