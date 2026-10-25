import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  UserCheck,
  RefreshCw,
  Info,
  DollarSign,
  User,
  Calendar,
  Lock,
  XCircle,
  Trash2
} from 'lucide-react';
import { PaymentConflictRecord, InstallmentContract, SalesRepresentative, Language } from '../types';
import { getPendingQueue, subscribeToQueueChange, flushPendingQueue, removeFromPendingQueue, clearPendingQueue } from '../lib/offlineQueue';

interface OfflinePaymentConflictsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: PaymentConflictRecord[];
  contracts: InstallmentContract[];
  currentRep: SalesRepresentative | null;
  onResolveConflict: (conflict: PaymentConflictRecord) => Promise<void>;
  onRejectConflict: (conflict: PaymentConflictRecord) => Promise<void>;
  lang: Language;
}

export const OfflinePaymentConflictsModal: React.FC<OfflinePaymentConflictsModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  contracts,
  currentRep,
  onResolveConflict,
  onRejectConflict,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'queue'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [modalNotification, setModalNotification] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setModalNotification({ text, type });
    setTimeout(() => {
      setModalNotification(null);
    }, 4500);
  };

  React.useEffect(() => {
    if (isOpen) {
      getPendingQueue().then(setQueueItems);
      const unsubscribe = subscribeToQueueChange((count) => {
        getPendingQueue().then(setQueueItems);
      });
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [isOpen]);

  const handleManualFlush = async () => {
    setIsSyncingQueue(true);
    try {
      const res = await flushPendingQueue();
      const updated = await getPendingQueue();
      setQueueItems(updated);
      showNotification(
        isAr ? `تمت المزامنة بنجاح! المتبقي في الطابور: ${res.remaining}` : `Synced successfully! Remaining: ${res.remaining}`,
        res.remaining === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showNotification(
        isAr ? `فشل مزامنة الطابور: ${e?.message || e}` : `Sync failed: ${e?.message || e}`,
        'error'
      );
    } finally {
      setIsSyncingQueue(false);
    }
  };

  const handleRemoveQueueItem = async (id: string) => {
    try {
      await removeFromPendingQueue(id);
      const updated = await getPendingQueue();
      setQueueItems(updated);
      showNotification(isAr ? 'تم حذف العنصر من الطابور المعلق بنجاح' : 'Item removed from queue', 'info');
    } catch (e: any) {
      showNotification(isAr ? 'فشل حذف العنصر' : 'Failed to remove item', 'error');
    }
  };

  const handleClearAllQueue = async () => {
    if (window.confirm(isAr ? 'هل أنت متأكد من رغبتك في تفريغ طابور العمليات المعلقة بالكامل؟' : 'Are you sure you want to clear all pending actions?')) {
      try {
        await clearPendingQueue();
        setQueueItems([]);
        showNotification(isAr ? 'تم تفريغ طابور العمليات المعلقة بنجاح' : 'Queue cleared successfully', 'success');
      } catch (e: any) {
        showNotification(isAr ? 'فشل تفريغ الطابور' : 'Failed to clear queue', 'error');
      }
    }
  };

  if (!isOpen) return null;

  // Check if current user is Manager/Admin ("التعديل خاص للمدير")
  const isManager = !currentRep || currentRep.role === 'admin';

  // Filter conflicts so that only users with permission on the customer's list can view settlement/conflict items ("لمن لديه صلاحية بالقائمة")
  const permittedConflicts = conflicts.filter((c) => {
    if (isManager) return true;
    if (!currentRep?.allowedListIds || currentRep.allowedListIds.includes('all')) return true;

    const targetContract = contracts.find(
      (con) => con.id === c.contractId || con.customerName === c.customerName
    );
    if (targetContract?.listId) {
      return currentRep.allowedListIds.includes(targetContract.listId);
    }
    return true; // If no list is assigned to the contract, allow visibility
  });

  const pendingConflicts = permittedConflicts.filter((c) => c.status === 'pending_review');
  const resolvedConflicts = permittedConflicts.filter((c) => c.status !== 'pending_review');

  const handleAutoAdjustClick = async (conflict: PaymentConflictRecord) => {
    if (!isManager) {
      showNotification(
        isAr ? 'صلاحية التعديل والتصفية متاحة للمدير حصراً' : 'Adjustment permission is reserved exclusively for the Manager',
        'error'
      );
      return;
    }
    setProcessingId(conflict.id);
    try {
      await onResolveConflict(conflict);
      showNotification(
        isAr ? `تمت تسوية الدفعة المعلقة للزبون "${conflict.customerName}" بنجاح` : `Conflict settled for "${conflict.customerName}"`,
        'success'
      );
    } catch (err: any) {
      showNotification(
        isAr ? `حدث خطأ أثناء التسوية: ${err?.message || err}` : `Error settling conflict: ${err?.message || err}`,
        'error'
      );
    } finally {
      setProcessingId(null);
    }
  };



  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl lg:max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="py-4 px-6 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black">
                {isAr ? 'معالجة تعارض الدفعات أوفلاين' : 'Offline Payment Conflicts Handler'}
              </h2>
              <p className="text-xs text-amber-100 font-bold mt-0.5">
                {isAr
                  ? 'إدارة الدفعات المعلقة وتحت المراجعة عند تجاوز رصيد الزبون أثناء العمل أوفلاين'
                  : 'Manage overpayment conflicts during offline synchronization'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-5 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
            {isAr ? (
              <>
                <strong>آلية العمل:</strong> عند تسديد أكثر من مندوب لنفس الزبون أوفلاين وتجاوز المبلغ للدين الحقيقي،{' '}
                <span className="underline font-black">لا يتم الخصم تلقائياً من حساب الزبون</span> بل تُحول الدفعة إلى حالة{' '}
                <span className="font-bold text-amber-900 dark:text-amber-200">"معلقة وتحت المراجعة"</span>. صلاحية التصفية والتعديل التلقائي
                متاحة <span className="font-black underline">للمدير حصراً</span> لحساب الفرق وقيد المبلغ الزائد تحت بند{' '}
                <strong>"مبلغ راجع للزبون"</strong> بحوزة المندوب، مع إشعار الجميع لضمان الشفافية.
              </>
            ) : (
              'When payments exceed customer remaining balance offline, they are placed under Pending Review. Managers exclusively can auto-adjust to settle the balance and record excess as refund.'
            )}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 pt-2 gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-4 font-black text-sm transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'pending'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{isAr ? 'دفعات معلقة وتحت المراجعة' : 'Pending Review'}</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-black">
              {pendingConflicts.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('resolved')}
            className={`pb-3 px-4 font-black text-sm transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'resolved'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isAr ? 'سجل التسويات والشفافية' : 'Resolved & Transparency Log'}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-black">
              {resolvedConflicts.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`pb-3 px-4 font-black text-sm transition-all border-b-2 flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'queue'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>{isAr ? 'طابور المزامنة مع PostgreSQL' : 'Sync Queue (Postgres)'}</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-300 text-xs font-black">
              {queueItems.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {modalNotification && (
            <div
              className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 text-sm font-bold shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${
                modalNotification.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800'
                  : modalNotification.type === 'error'
                  ? 'bg-rose-50 text-rose-900 border border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800'
                  : 'bg-indigo-50 text-indigo-900 border border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800'
              }`}
            >
              <span>{modalNotification.text}</span>
              <button
                type="button"
                onClick={() => setModalNotification(null)}
                className="text-xs px-2 py-1 rounded-lg bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          )}
          {activeTab === 'queue' ? (
            <div className="space-y-4">
              {/* Summary Dashboard Card */}
              <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm shrink-0">
                    <RefreshCw className={`w-7 h-7 text-indigo-300 ${isSyncingQueue ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black">
                      {isAr ? 'حالة طابور مزامنة البيانات أوفلاين' : 'Offline Synchronization Queue'}
                    </h3>
                    <p className="text-xs text-indigo-200 mt-1">
                      {isAr
                        ? 'العمليات والتسديدات المضافة أثناء انقطاع الإنترنت بانتظار الإرسال الآمن لقاعدة بيانات PostgreSQL'
                        : 'Operations waiting in queue to sync with PostgreSQL upon connection restoration'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end flex-wrap">
                  <div className="text-center px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm">
                    <span className="text-2xl font-black text-indigo-200 block">{queueItems.length}</span>
                    <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-bold">
                      {isAr ? 'عملية معلقة' : 'Pending Items'}
                    </span>
                  </div>
                  {queueItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllQueue}
                      disabled={isSyncingQueue}
                      className="px-3 py-3 rounded-xl bg-rose-600/80 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                      title={isAr ? 'تفريغ طابور العمليات' : 'Clear Queue'}
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isAr ? 'تفريغ' : 'Clear'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleManualFlush}
                    disabled={isSyncingQueue || queueItems.length === 0}
                    className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-md transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingQueue ? 'animate-spin' : ''}`} />
                    <span>{isAr ? 'مزامنة الآن' : 'Sync Now'}</span>
                  </button>
                </div>
              </div>

              {/* Queue Items List */}
              {queueItems.length === 0 ? (
                <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                  <h4 className="font-bold text-base text-slate-800 dark:text-slate-200 mb-1">
                    {isAr ? 'طابور المزامنة فارغ تماماً' : 'Sync Queue is Empty'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'جميع العمليات تمت مزامنتها بنجاح مع PostgreSQL ولا توجد عناصر معلقة.' : 'All operations have been successfully synchronized.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {queueItems.map((item, index) => {
                    const p = item.payload || {};
                    const customerName = p.customerName || p.customer_name || p.name || '';
                    const amount = p.amount ?? p.amountPaid ?? p.amount_paid ?? p.totalPrice ?? p.total_price;
                    const repName = p.repName || p.rep_name || '';

                    return (
                      <div
                        key={item.id || index}
                        className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                            #{index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-black">
                                {item.type}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">
                                {item.timestamp ? new Date(item.timestamp).toLocaleString('en-US') : ''}
                              </span>
                              {item.retryCount > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold">
                                  {isAr ? `محاولات: ${item.retryCount}` : `Retries: ${item.retryCount}`}
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300 flex-wrap">
                              {customerName && (
                                <span className="font-bold flex items-center gap-1">
                                  <User className="w-3.5 h-3.5 text-slate-400" />
                                  {customerName}
                                </span>
                              )}
                              {amount !== undefined && (
                                <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                  {Number(amount).toLocaleString()} د.ع
                                </span>
                              )}
                              {repName && (
                                <span className="text-slate-500 dark:text-slate-400">
                                  ({repName})
                                </span>
                              )}
                            </div>

                            {item.error && (
                              <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-1 font-mono">
                                {item.error}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.status === 'syncing'
                              ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                              : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                          }`}>
                            {item.status === 'syncing'
                              ? (isAr ? 'جاري الإرسال...' : 'Syncing...')
                              : (isAr ? 'بانتظار المزامنة' : 'Pending Online')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueueItem(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                            title={isAr ? 'حذف من الطابور' : 'Delete from queue'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'pending' ? (
            pendingConflicts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto mb-4 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? 'لا توجد دفعات معلقة حالياً' : 'No pending payment conflicts'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {isAr
                    ? 'جميع التسديدات المضافة للزبائن مطابقة للأرصدة المتبقية الحقيقية ولا توجد تعارضات أوفلاين.'
                    : 'All customer payments match remaining balances without offline conflicts.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingConflicts.map((conflict) => {
                  const targetContract = contracts.find((c) => c.id === conflict.contractId);
                  const isProcessing = processingId === conflict.id;
                  const remainingLoan =
                    targetContract && typeof targetContract.remainingBalance === 'number'
                      ? targetContract.remainingBalance
                      : conflict.actualRemainingBalance;
                  const isZeroRemaining = remainingLoan <= 0;

                  return (
                    <div
                      key={conflict.id}
                      className="bg-white dark:bg-slate-800/80 rounded-2xl border-2 border-amber-300 dark:border-amber-800/80 shadow-md p-4 sm:p-5 relative overflow-hidden transition-all"
                    >
                      {/* Top bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-700/60">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-xs font-black flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {isAr ? 'معلقة وتحت المراجعة' : 'Pending Review'}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {conflict.paymentDate || conflict.createdAt.split('T')[0]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                          <User className="w-3.5 h-3.5 text-indigo-500" />
                          <span>
                            {isAr ? 'المندوب:' : 'Rep:'} <strong className="text-indigo-600 dark:text-indigo-400">{conflict.repName}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Customer Info */}
                      <div className="mb-4">
                        <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{conflict.customerName}</span>
                          {targetContract && (
                            <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                              ({targetContract.itemName})
                            </span>
                          )}
                        </h4>
                        {conflict.note && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                            {conflict.note}
                          </p>
                        )}
                      </div>

                      {/* Financial breakdown cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                          <div className="text-[11px] text-amber-700 dark:text-amber-400 font-bold mb-1">
                            {isAr ? 'المبلغ المسجل من المندوب' : 'Attempted Amount'}
                          </div>
                          <div className="text-base sm:text-lg font-black text-amber-900 dark:text-amber-200">
                            {Number(conflict.attemptedAmount).toLocaleString('en-US')} د.ع
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold mb-1">
                            {isAr ? 'الدين المتبقي الحقيقي (المطلوب)' : 'Actual Remaining Balance'}
                          </div>
                          <div className="text-base sm:text-lg font-black text-emerald-900 dark:text-emerald-200">
                            {Number(conflict.actualRemainingBalance).toLocaleString('en-US')} د.ع
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900">
                          <div className="text-[11px] text-indigo-700 dark:text-indigo-400 font-bold mb-1">
                            {isAr ? 'المبلغ الزائد (راجع للزبون)' : 'Excess Refund Amount'}
                          </div>
                          <div className="text-base sm:text-lg font-black text-indigo-900 dark:text-indigo-200">
                            {Number(conflict.excessAmount).toLocaleString('en-US')} د.ع
                          </div>
                        </div>
                      </div>

                      {/* Action & Permission block */}
                      {isManager ? (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {isAr ? (
                              <span>
                                {isZeroRemaining ? (
                                  <span className="text-rose-700 dark:text-rose-300 font-bold block bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60">
                                    حساب الزبون مسدد بالكامل (<strong>الباقي 0 د.ع</strong>). لا يمكن إضافة تعديل أو دفعة جديدة، يمكنك فقط <strong>حذف هذه الدفعة الزائدة وإلغاء التعارض</strong>.
                                  </span>
                                ) : (
                                  <>
                                    عند النقر سيتم <strong>تعديل الدفعة وقبول المتبقي فقط ({Number(remainingLoan).toLocaleString('en-US')} د.ع)</strong> لتصفير الحساب، وإرجاع الباقي{' '}
                                    <strong className="text-indigo-600 dark:text-indigo-400">
                                      ({Number(Math.max(0, conflict.attemptedAmount - remainingLoan)).toLocaleString('en-US')} د.ع)
                                    </strong>{' '}
                                    كمبلغ راجع للزبون بحوزة المندوب ({conflict.repName}).
                                  </>
                                )}
                              </span>
                            ) : isZeroRemaining ? (
                              'Customer balance is 0. Only delete option available.'
                            ) : (
                              `Will adjust payment to remaining balance (${remainingLoan}) and refund excess.`
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {confirmRejectId === conflict.id ? (
                              <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded-xl border border-rose-200 dark:border-rose-900">
                                <span className="text-xs text-rose-800 dark:text-rose-300 font-bold px-1">
                                  {isAr ? (isZeroRemaining ? 'تأكيد الحذف؟' : 'تأكيد الرفض؟') : 'Confirm?'}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setProcessingId(conflict.id);
                                    try {
                                      await onRejectConflict(conflict);
                                    } finally {
                                      setProcessingId(null);
                                      setConfirmRejectId(null);
                                    }
                                  }}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer transition-colors"
                                >
                                  {isAr ? (isZeroRemaining ? 'نعم، حذف' : 'نعم، رفض') : 'Yes, reject'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRejectId(null)}
                                  disabled={isProcessing}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-black cursor-pointer transition-colors"
                                >
                                  {isAr ? 'تراجع' : 'Cancel'}
                                </button>
                              </div>
                            ) : isZeroRemaining ? (
                              /* Only show Delete button when remaining balance is 0 */
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isManager) return;
                                  setConfirmRejectId(conflict.id);
                                }}
                                disabled={isProcessing}
                                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>
                                  {isAr
                                    ? 'حذف الدفعة الزائدة وإلغاء التعارض'
                                    : 'Delete Surplus Payment'}
                                </span>
                              </button>
                            ) : (
                              /* When remaining balance > 0, show Reject and Auto-Adjust buttons */
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isManager) {
                                      return;
                                    }
                                    setConfirmRejectId(conflict.id);
                                  }}
                                  disabled={isProcessing}
                                  className="px-3.5 py-2.5 rounded-xl border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-black transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span>{isAr ? 'رفض وإلغاء' : 'Reject'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleAutoAdjustClick(conflict)}
                                  disabled={isProcessing}
                                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs sm:text-sm font-black transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>
                                    {isProcessing
                                      ? isAr
                                        ? 'جاري التصفية...'
                                        : 'Settling...'
                                      : isAr
                                        ? `✨ تعديل الدفعة للمتبقي (${Number(remainingLoan).toLocaleString('en-US')} د.ع)`
                                        : '✨ Adjust to Remaining Balance'}
                                  </span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-bold">
                            {isAr
                              ? 'صلاحية التعديل التلقائي والتصفية متاحة للمدير حصراً (أنت مسجل حالياً كمندوب).'
                              : 'Auto-adjustment and settlement permission is reserved exclusively for the Manager.'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Resolved Log Tab */
            resolvedConflicts.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? 'سجل التسويات فارغ' : 'No resolved conflicts'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAr ? 'ستظهر هنا جميع الدفعات التي تمت تسويتها وتصفياتها لضمان الشفافية.' : 'Resolved payment conflicts will appear here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {resolvedConflicts.map((conflict) => (
                  <div
                    key={conflict.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 ${
                            conflict.status === 'resolved'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                          }`}
                        >
                          {conflict.status === 'resolved' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          {conflict.status === 'resolved'
                            ? isAr
                              ? 'تمت التصفية والتسوية'
                              : 'Resolved'
                            : isAr
                              ? 'تم الحذف وإلغاء التعارض'
                              : 'Deleted / Rejected'}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {conflict.resolvedAt
                            ? new Date(conflict.resolvedAt).toLocaleString('en-US')
                            : ''}
                        </span>
                      </div>

                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {isAr ? 'تمت بواسطة:' : 'Resolved by:'}{' '}
                        <span className="text-emerald-600 dark:text-emerald-400">{conflict.resolvedBy || (isAr ? 'المدير' : 'Admin')}</span>
                      </div>
                    </div>

                    <div className="mb-3">
                      <h4 className="text-base font-black text-slate-900 dark:text-white">
                        {conflict.customerName}
                      </h4>
                      {conflict.resolutionNote && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          {conflict.resolutionNote}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                        <span className="text-slate-500 block mb-0.5">{isAr ? 'المبلغ الأصلي للمندوب' : 'Attempted'}</span>
                        <span className="font-black text-slate-800 dark:text-slate-200">
                          {Number(conflict.attemptedAmount).toLocaleString('en-US')} د.ع
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                        <span className="text-emerald-700 dark:text-emerald-400 block mb-0.5">
                          {isAr ? 'القيمة المقبولة لتصفية الحساب' : 'Accepted Balance'}
                        </span>
                        <span className="font-black text-emerald-900 dark:text-emerald-200">
                          {Number(typeof conflict.acceptedAmount === 'number' ? conflict.acceptedAmount : conflict.actualRemainingBalance).toLocaleString('en-US')} د.ع
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 col-span-2 sm:col-span-1">
                        <span className="text-indigo-700 dark:text-indigo-400 block mb-0.5">
                          {isAr ? 'مبلغ راجع للزبون (حوزة المندوب)' : 'Customer Refund'}
                        </span>
                        <span className="font-black text-indigo-900 dark:text-indigo-200">
                          {Number(conflict.excessAmount).toLocaleString('en-US')} د.ع ({conflict.repName})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 px-6 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            {isAr ? 'يتم إرسال إشعار تلقائي للمندوب وإشعار شفافية لبقية الفريق عند التسوية' : 'Automatic notifications are sent upon resolution'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-black transition-colors cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
