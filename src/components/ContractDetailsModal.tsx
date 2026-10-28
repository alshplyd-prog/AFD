import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Phone,
  MessageSquare,
  DollarSign,
  Calendar,
  User,
  MapPin,
  FileText,
  Trash2,
  Edit2,
  CheckCircle2,
  Clock,
  History,
  Send,
  Sparkles,
  Printer,
  Zap,
  ShieldAlert,
  CheckSquare,
  Navigation,
  LocateFixed,
  MapPinned,
  ExternalLink,
  MessageCircle
} from 'lucide-react';
import { InstallmentContract, PaymentRecord, Language, SalesRepresentative, CustomerList } from '../types';
import { numberToArabicWords } from '../lib/tafqeet';
import { DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';
import { formatPaymentDateTime, formatPaymentTime, getLocalDateString } from '../lib/dateUtils';
import { normalizeEntityName } from '../lib/nameHelpers';
import { getPaymentReceiptBalances } from '../lib/paymentCalculator';
import { updateCustomerLocation } from '../lib/postgresClient';
import { captureDeviceLocation } from '../lib/geolocationHelper';
import { formatIraqiPhoneForWhatsApp } from '../lib/pdfShareHelper';

interface ContractDetailsModalProps {
  contract: InstallmentContract | null;
  payments: PaymentRecord[];
  customerLists?: CustomerList[];
  isOpen: boolean;
  onClose: () => void;
  onRecordPayment: (
    contract: InstallmentContract,
    amount: number,
    note?: string,
    receiptDetails?: any,
    shouldAutoPrint?: boolean,
    locationCoords?: { latitude: number; longitude: number; address?: string }
  ) => void;
  onUpdatePayment?: (payment: PaymentRecord, newAmount: number, newNote?: string, newPaymentDate?: string, newRepName?: string) => Promise<void> | void;
  onDeletePayment?: (payment: PaymentRecord) => void;
  onPrintReceipt?: (receiptData: any) => void;
  onEdit: (contract: InstallmentContract) => void;
  onDelete: (id: string) => void;
  onMoveCustomer?: (contractId: string, newListId: string, newListName: string) => void;
  onOpenPaymentKeypad?: (contract: InstallmentContract) => void;
  onSettleExcess?: (contractId: string, customerName?: string) => void;
  onOpenCustomerMaps?: (contract: InstallmentContract) => void;
  onDrawRouteOnMap?: (contract: InstallmentContract) => void;
  lang: Language;
  currentRep?: SalesRepresentative | null;
}

export const ContractDetailsModal: React.FC<ContractDetailsModalProps> = ({
  contract,
  payments,
  customerLists = [],
  isOpen,
  onClose,
  onRecordPayment,
  onUpdatePayment,
  onDeletePayment,
  onPrintReceipt,
  onEdit,
  onDelete,
  onMoveCustomer,
  onOpenPaymentKeypad,
  onSettleExcess,
  onOpenCustomerMaps,
  onDrawRouteOnMap,
  lang,
  currentRep,
}) => {
  // Back gesture / Back button support
  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ modal: 'contract_details' }, '');
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  const prevContractIdRef = useRef<string | null>(null);
  const prevIsOpenRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      prevContractIdRef.current = null;
      return;
    }
    const isOpening = !prevIsOpenRef.current;
    const isIdChanged = prevContractIdRef.current !== contract?.id;

    if (isOpening || isIdChanged) {
      prevIsOpenRef.current = true;
      prevContractIdRef.current = contract?.id || null;
      if (contract) {
        setCustomAmount(contract.dailyInstallment ? contract.dailyInstallment.toString() : '');
        setPaymentNote('');
      }
    }
  }, [isOpen, contract?.id]);

  const [customAmount, setCustomAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<'pay' | 'history'>('pay');

  // Payment editing state for Admin
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editRepName, setEditRepName] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [isSettingGps, setIsSettingGps] = useState<boolean>(false);

  const handleSetCustomerGps = () => {
    if (!contract) return;
    if (!navigator.geolocation) {
      alert(lang === 'ar' ? 'خدمة تحديد الموقع GPS غير متوفرة في هذا الجهاز' : 'GPS not supported');
      return;
    }
    setIsSettingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await updateCustomerLocation(contract.id, latitude, longitude, contract.customerAddress || '');
        setIsSettingGps(false);
      },
      (err) => {
        setIsSettingGps(false);
        console.warn('GPS location error:', err);
        alert(lang === 'ar' ? 'فشل جلب إحداثيات GPS. تأكد من تفعيل خدمة الموقع وإعطاء الصلاحية' : 'Failed to get GPS location');
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  const handleDeleteCustomerGps = async () => {
    if (!contract) return;
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف موقع هذا الزبون نهائياً؟' : 'Are you sure you want to remove customer location?')) {
      return;
    }
    setIsSettingGps(true);
    try {
      await updateCustomerLocation(contract.id, null, null, '');
    } catch (e) {}
    setIsSettingGps(false);
  };

  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const isAdmin = currentRep?.role === 'admin';
  const canEdit = isAdmin || currentRep?.canEdit !== false;
  const canEditPayment = isAdmin;
  const canDelete = isAdmin || currentRep?.canDelete === true;
  const canMoveCustomer = isAdmin || currentRep?.canMoveCustomer !== false;

  const startEditPayment = (p: PaymentRecord) => {
    setEditingPayment(p);
    setEditAmount(String(p.amountPaid ?? p.amount ?? ''));
    setEditNote(p.note || '');
    setEditDate(p.paymentDate ? getLocalDateString(p.paymentDate) : getLocalDateString());
    setEditRepName(p.repName || '');
  };

  const handleSaveEditPayment = async () => {
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
      console.error('Failed to save payment edit:', err);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const allowedCustomerLists = customerLists.filter((l) => {
    if (!currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
      return true;
    }
    return currentRep.allowedListIds.includes(l.id);
  });

  if (!isOpen || !contract) return null;

  const isAr = lang === 'ar';
  const cleanPhone = (contract.customerPhone || '').replace(/[^0-9+]/g, '');

  const formatMoney = (val: number | undefined | null) => {
    return (Number(val) || 0).toLocaleString('en-US') + (isAr ? ' د.ع' : ' IQD');
  };

  const cNameNorm = normalizeEntityName(contract.customerName);
  const safePayments = Array.isArray(payments) ? payments.filter(Boolean) : [];
  const contractPayments = safePayments.filter((p) => {
    if (!p) return false;
    if (p.contractId && typeof p.contractId === 'string' && p.contractId.trim()) {
      return p.contractId === contract.id;
    }
    if (p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm) {
      return true;
    }
    return false;
  });

  const rawPaymentsSum = contractPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
  const netFinanced = Math.max(0, (Number(contract.totalPrice) || 0) - (Number(contract.advancePayment) || 0));
  const liveTotalPaid = netFinanced > 0 ? Math.min(netFinanced, rawPaymentsSum) : rawPaymentsSum;
  const liveRemaining = Math.max(0, netFinanced - rawPaymentsSum);
  const excessAmount = Math.max(0, rawPaymentsSum - netFinanced);
  const handleSendPaymentWhatsApp = (p: PaymentRecord) => {
    const amountNum = Number(p.amountPaid ?? (p as any).amount ?? 0);
    const amountDigits = `${amountNum.toLocaleString('en-US')} د.ع`;
    const amountWords = `فقط ${numberToArabicWords(amountNum)} لا غير`;
    const customerDisplayName = contract.customerName || p.customerName || (isAr ? 'زبون' : 'Customer');
    const dateStr = formatPaymentDateTime(p, isAr);

    let remainingInfo = '';
    try {
      const snapshot = getPaymentReceiptBalances(p, contract, safePayments);
      if (typeof snapshot.remainingBalance === 'number') {
        remainingInfo = `\n💳 *المتبقي بعد التسديد:* ${snapshot.remainingBalance.toLocaleString('en-US')} د.ع`;
      }
    } catch (err) {
      // ignore
    }

    const message = `*وصل استلام تسديد* 🧾
━━━━━━━━━━━━━━━
👤 *اسم الزبون:* ${customerDisplayName}
💵 *الواصل:* ${amountDigits}
🔢 *المبلغ رقماً:* ${amountDigits}
✍️ *المبلغ كتابة:* ${amountWords}
📅 *التاريخ:* ${dateStr}${contract.itemName ? `\n📦 *المادة:* ${contract.itemName}` : ''}${remainingInfo}
━━━━━━━━━━━━━━━
_الكرار للموبايل والتقسيط_`.trim();

    const rawPhone = contract.customerPhone || (contract as any)?.phone || (p as any)?.customerPhone;
    const cleanPhone = formatIraqiPhoneForWhatsApp(rawPhone);
    const encodedText = encodeURIComponent(message);

    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

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

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let amount = Number(customAmount) || contract.dailyInstallment;
    if (amount > 0 && amount < 1000) {
      amount = amount * 1000;
    }
    if (amount <= 0) {
      alert(isAr ? 'يرجى إدخال مبلغ تسديد صحيح أكبر من صفر' : 'Please enter a valid amount greater than zero');
      return;
    }
    if (amount > liveRemaining) {
      alert(
        isAr
          ? `المبلغ المدخل (${amount.toLocaleString('en-US')} د.ع) أكبر من الباقي على الزبون (${liveRemaining.toLocaleString('en-US')} د.ع).`
          : `Amount exceeds remaining balance.`
      );
      return;
    }

    const hasSavedCoords = Boolean(
      contract.latitude != null &&
      contract.longitude != null &&
      !isNaN(Number(contract.latitude)) &&
      !isNaN(Number(contract.longitude)) &&
      Number(contract.latitude) !== 0 &&
      Number(contract.longitude) !== 0
    );

    // إذا لم يثبت للزبون موقع سابقاً، يجب أن يكون الـ GPS مفعل للالتقاط وتثبيت موقعه
    if (!hasSavedCoords) {
      captureDeviceLocation()
        .then((res) => {
          if (res.location) {
            onRecordPayment(contract, amount, paymentNote || '', undefined, true, {
              latitude: res.location.latitude,
              longitude: res.location.longitude,
              address: contract.customerAddress || `موقع تسديد (${new Date().toLocaleDateString('ar-EG')})`
            });
            setCustomAmount('');
            setPaymentNote('');
          } else {
            alert(
              isAr
                ? '⛔ غير مسموح بإضافة دفعة: هذا الزبون لم يُثبّت له موقع على الخريطة، ونظام الـ GPS غير مفعل.\nيرجى تفعيل الـ GPS في هاتفك لتحديد موقع الزبون مع الدفعة.'
                : 'Payment blocked: Customer has no saved location and GPS is disabled. Please enable GPS first.'
            );
          }
        })
        .catch(() => {
          alert(
            isAr
              ? '⛔ غير مسموح بإضافة دفعة: هذا الزبون لم يُثبّت له موقع على الخريطة، وتعذر التقاط إشارة الـ GPS.\nيرجى تفعيل الـ GPS في هاتفك لتحديد موقع الزبون مع الدفعة.'
              : 'Payment blocked: Customer has no saved location and GPS is disabled. Please enable GPS first.'
          );
        });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          onRecordPayment(contract, amount, paymentNote || '', undefined, true, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            address: contract.customerAddress || `موقع تسديد (${new Date().toLocaleDateString('ar-EG')})`
          });
        },
        () => {
          onRecordPayment(contract, amount, paymentNote || '', undefined, true);
        },
        { timeout: 3500, enableHighAccuracy: true }
      );
    } else {
      onRecordPayment(contract, amount, paymentNote || '', undefined, true);
    }
    setCustomAmount('');
    setPaymentNote('');
  };

  const handleDelete = () => {
    onDelete(contract.id);
    setShowConfirmDelete(false);
    onClose();
  };

  const waMessage = encodeURIComponent(
    isAr
      ? `مرحباً ${contract.customerName}، تذكير بقسط اليوم لمشترياتك (${contract.itemName}) بقيمة ${formatMoney(contract.dailyInstallment)}. المتبقي: ${formatMoney(liveRemaining)}.`
      : `Hello ${contract.customerName}, payment reminder for (${contract.itemName}) - amount ${formatMoney(contract.dailyInstallment)}.`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-4xl lg:max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="relative p-6 bg-gradient-to-br from-slate-900 to-blue-950 text-white border-b border-slate-800">
          <button
            onClick={onClose}
            className="absolute ltr:right-4 rtl:left-4 top-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-1 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>{isAr ? 'عقد مبيعات بالتقسيط اليومي' : 'Daily Installment Contract'}</span>
          </div>

          <h2 className="text-xl font-extrabold text-white mb-1">{contract.customerName}</h2>
          <p className="text-sm text-slate-300 font-medium">{contract.itemName}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/10 text-center">
            <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
              <span className="text-[10px] text-slate-400 block">{isAr ? 'السعر الكلي' : 'Total Price'}</span>
              <span className="font-bold text-sm text-white">{formatMoney(contract.totalPrice)}</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
              <span className="text-[10px] text-slate-400 block">{isAr ? 'الدفعة الأولى' : 'Advance'}</span>
              <span className="font-bold text-sm text-blue-300">{formatMoney(contract.advancePayment)}</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
              <span className="text-[10px] text-slate-400 block">{isAr ? 'إجمالي الواصل' : 'Total Paid'}</span>
              <span className="font-bold text-sm text-emerald-300">{formatMoney(liveTotalPaid)}</span>
            </div>
            <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
              <span className="text-[10px] text-slate-400 block">{isAr ? 'المتبقي' : 'Remaining'}</span>
              <span className="font-bold text-sm text-amber-300">{formatMoney(liveRemaining)}</span>
            </div>
          </div>

          {excessAmount > 0 && (
            <div className="mt-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs font-bold flex items-center justify-between gap-2 animate-fadeIn">
              <div className="flex items-center gap-1.5 truncate">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">
                  {isAr
                    ? `مبلغ زائد في حوزة المندوب: ${formatMoney(excessAmount)}`
                    : `Excess amount held by rep: ${formatMoney(excessAmount)}`}
                </span>
              </div>
              {onSettleExcess && (
                <button
                  type="button"
                  onClick={() => onSettleExcess(contract.id, contract.customerName)}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs cursor-pointer shrink-0"
                >
                  {isAr ? 'تسوية وتصفير' : 'Settle'}
                </button>
              )}
            </div>
          )}

          {liveRemaining > 0 && onOpenPaymentKeypad && (
            <button
              type="button"
              onClick={() => onOpenPaymentKeypad(contract)}
              className="mt-3.5 w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40"
            >
              <Zap className="w-4 h-4" />
              <span>{isAr ? 'تسديد وصل جديد (الآلة الحاسبة السريعة)' : 'Quick Payment Keypad'}</span>
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-xs font-bold">
          <button
            onClick={() => setActiveTab('pay')}
            className={`flex-1 py-3 text-center border-b-2 transition-colors ${
              activeTab === 'pay'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isAr ? 'تحصيل قسط جديد' : 'New Collection'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-center border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isAr ? `سجل الدفعات (${contractPayments.length})` : `Payment History (${contractPayments.length})`}
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'pay' ? (
            <>
              {/* Payment Collection Form */}
              {liveRemaining > 0 ? (
                <form onSubmit={handlePaySubmit} className="space-y-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {isAr ? 'تسجيل تحصيل قسط' : 'Record Collection'}
                  </h3>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomAmount(contract.dailyInstallment ? contract.dailyInstallment.toString() : '0')}
                      className="p-2.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs font-bold hover:bg-blue-100 transition-colors"
                    >
                      {isAr ? `قسط يومي عادي (${formatMoney(contract.dailyInstallment)})` : `Normal Daily (${formatMoney(contract.dailyInstallment)})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomAmount(contract.dailyInstallment ? (contract.dailyInstallment * 2).toString() : '0')}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 transition-colors"
                    >
                      {isAr ? `قسطين (${formatMoney(contract.dailyInstallment * 2)})` : `Double (${formatMoney(contract.dailyInstallment * 2)})`}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>{isAr ? 'المبلغ المحصل (د.ع)' : 'Collected Amount'}</span>
                      {Number(customAmount) > 0 && Number(customAmount) < 1000 && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-300">
                          {isAr ? `سيصبح: ${(Number(customAmount) * 1000).toLocaleString('en-US')} د.ع` : `Will be: ${(Number(customAmount) * 1000).toLocaleString('en-US')} IQD`}
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      onBlur={() => {
                        const val = Number(customAmount);
                        if (val > 0 && val < 1000) {
                          setCustomAmount((val * 1000).toString());
                        }
                      }}
                      placeholder={contract.dailyInstallment.toString()}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dir-ltr"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all"
                  >
                    {isAr ? 'تأكيد وحفظ تحصيل القسط' : 'Confirm Payment Record'}
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-center space-y-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                    {isAr ? 'هذا العقد مكتمل ومسدد بالكامل!' : 'Contract is fully completed!'}
                  </h4>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(true)}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-black shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{isAr ? 'حذف هذا الزبون المكتمل' : 'Delete Completed Customer'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Customer Info Card */}
              <div className="space-y-3 text-xs bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="font-mono dir-ltr">{contract.customerPhone}</span>
                </div>

                {contract.customerAddress && (
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span>{contract.customerAddress}</span>
                  </div>
                )}

                {/* Customer GPS Location & Maps Actions */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs">
                      <MapPinned className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>{isAr ? 'الموقع الجغرافي للزبون:' : 'Customer Location:'}</span>
                    </div>
                    {contract.latitude != null && contract.longitude != null && !isNaN(Number(contract.latitude)) && !isNaN(Number(contract.longitude)) && Number(contract.latitude) !== 0 ? (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        {isAr ? 'محدد على الخريطة' : 'Pinned'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {isAr ? 'غير محدد بعد' : 'Not pinned'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {contract.latitude != null && contract.longitude != null && !isNaN(Number(contract.latitude)) && !isNaN(Number(contract.longitude)) && Number(contract.latitude) !== 0 ? (
                      <>
                        {onDrawRouteOnMap && (
                          <button
                            type="button"
                            onClick={() => {
                              onDrawRouteOnMap(contract);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:shadow-lg transition-all cursor-pointer ring-2 ring-blue-400/50 active:scale-95"
                            title={isAr ? 'رسم مسار الشوارع الفعلي مباشرة على الخريطة' : 'Draw street route directly on map'}
                          >
                            <Navigation className="w-3.5 h-3.5 text-blue-200" />
                            <span>{isAr ? '🚗 رسم المسار على الخريطة' : '🚗 Draw Route on Map'}</span>
                          </button>
                        )}

                        {onOpenCustomerMaps && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCustomerMaps(contract);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          >
                            <MapPinned className="w-3.5 h-3.5" />
                            <span>{isAr ? 'عرض على خرائط الزبائن' : 'View on Customer Maps'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${contract.latitude},${contract.longitude}`, '_blank');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                          title={isAr ? 'فتح في تطبيق Google Maps الخارجي' : 'Open in Google Maps App'}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
                          <span>{isAr ? 'Google Maps الخارجي' : 'External Maps'}</span>
                        </button>

                        {/* أزرار تعديل وحذف موقع الزبون - للمدير العام فقط */}
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={handleSetCustomerGps}
                              disabled={isSettingGps}
                              className="px-2 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                              title={isAr ? 'تحديث الإحداثيات لموقعك الحالي (خاص بالمدير)' : 'Update to current GPS (Admin only)'}
                            >
                              <LocateFixed className={`w-3 h-3 ${isSettingGps ? 'animate-spin' : ''}`} />
                              <span>{isSettingGps ? (isAr ? 'جارِ التحديث...' : 'Updating...') : (isAr ? 'تحديث الموقع GPS' : 'Update GPS')}</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleDeleteCustomerGps}
                              disabled={isSettingGps}
                              className="px-2 py-1.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                              title={isAr ? 'حذف موقع الزبون نهائياً (خاص بالمدير)' : 'Delete Customer Location (Admin only)'}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{isAr ? 'حذف الموقع' : 'Delete'}</span>
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={handleSetCustomerGps}
                            disabled={isSettingGps}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            <LocateFixed className={`w-3.5 h-3.5 ${isSettingGps ? 'animate-spin' : ''}`} />
                            <span>{isSettingGps ? (isAr ? 'جارِ جلب إحداثيات GPS...' : 'Locating GPS...') : (isAr ? 'تحديد موقع الزبون عبر GPS الآن' : 'Set Customer GPS Now')}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                            {isAr ? 'الموقع غير محدد (التثبيت للمدير فقط)' : 'Location not set (Admin only)'}
                          </span>
                        )}

                        {onOpenCustomerMaps && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCustomerMaps(contract);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                            <span>{isAr ? 'إسقاط وتحديد من الخريطة' : 'Drop Pin on Map'}</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span>{isAr ? 'تاريخ بداية التقسيط:' : 'Start Date:'} {contract.startDate}</span>
                </div>

                {contract.notes && (
                  <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>{contract.notes}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Payment Receipts History List */
            <div className="space-y-2.5">
              {contractPayments.length > 0 ? (
                <div className="overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xs max-h-[420px]">
                  <table className="w-full text-right text-xs min-w-[580px] border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-xs">
                      <tr className="text-slate-700 dark:text-slate-300 font-black text-xs">
                        <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                          {isAr ? 'المبلغ' : 'Amount'}
                        </th>
                        <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                          {isAr ? 'التاريخ والوقت' : 'Date & Time'}
                        </th>
                        <th className="py-3 px-3.5 sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                          {isAr ? 'المحصل' : 'Collector'}
                        </th>
                        <th className="py-3 px-3.5 text-center sticky top-0 bg-slate-100 dark:bg-slate-900 whitespace-nowrap">
                          {isAr ? 'الإجراءات' : 'Actions'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-800 dark:text-slate-200">
                      {contractPayments.map((p) => {
                        const isDeletingThis = deletingPaymentId === p.id;

                        if (isDeletingThis) {
                          return (
                            <tr
                              key={p.id}
                              className="bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800"
                            >
                              <td colSpan={4} className="p-3 text-center">
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                  <span className="font-extrabold text-xs text-rose-800 dark:text-rose-200">
                                    {isAr ? `حذف التسديد (${formatMoney(p.amountPaid)})؟` : 'Delete payment?'}
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
                                    {isAr ? 'تأكيد' : 'Confirm'}
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

                            {/* Actions: Print, Edit, Delete */}
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* WhatsApp Receipt Button */}
                                <button
                                  type="button"
                                  onClick={() => handleSendPaymentWhatsApp(p)}
                                  className="p-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center group"
                                  title={isAr ? 'إرسال وصل التسديد عبر واتساب (الاسم، الواصل، المبلغ رقماً وكتابة، التاريخ)' : 'Send payment receipt via WhatsApp'}
                                >
                                  <MessageCircle className="w-4 h-4 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                                </button>

                                {/* Print Receipt button - matches screenshot styling */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onPrintReceipt) {
                                      const dStr = p.paymentDate ? getLocalDateString(p.paymentDate) : getLocalDateString();
                                      const tStr = formatPaymentTime(p, isAr);
                                      const snapshot = getPaymentReceiptBalances(p, contract, payments);
                                      const targetListId = contract.listId || (contract as any).list_id || (p as any)?.listId || (p as any)?.list_id;
                                      const rawListName = contract.listName || (contract as any).list_name || (p as any)?.listName || (p as any)?.list_name;
                                      const normListName = rawListName ? String(rawListName).trim().toLowerCase() : '';
                                      const linkedList = customerLists.find((l) => {
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
                                        customerName: contract.customerName,
                                        itemName: receiptTemplate === 'template_2' ? '' : contract.itemName,
                                        totalPrice: snapshot.totalPrice,
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
                                    }
                                  }}
                                  className="p-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/70 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-2xs cursor-pointer inline-flex items-center justify-center"
                                  title={isAr ? 'حفظ وطباعة' : 'Save & Print'}
                                >
                                  <Printer className="w-4 h-4" />
                                </button>

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

                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => setDeletingPaymentId(p.id)}
                                    className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 transition-colors cursor-pointer inline-flex items-center justify-center"
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
                <div className="p-8 text-center text-slate-400 text-xs">
                  {isAr ? 'لا توجد دفعات مسجلة بعد لهذا العقد' : 'No payment records yet for this contract'}
                </div>
              )}
            </div>
          )}

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
                      {editingPayment.customerName || contract.customerName}
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
                      onClick={handleSaveEditPayment}
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

          {/* Action Footer (WhatsApp, Edit, Delete) */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
            <a
              href={`https://wa.me/${cleanPhone}?text=${waMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              <span>{isAr ? 'تذكير الواتساب' : 'WhatsApp'}</span>
            </a>

            <div className="flex items-center gap-2">
              {canEdit && (
                <button
                  onClick={() => {
                    onEdit(contract);
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 transition-colors"
                  title={isAdmin ? (isAr ? 'تعديل بيانات العقد' : 'Edit Contract') : (isAr ? 'تعديل قيمة القسط' : 'Edit Installment')}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}

              {canDelete && (
                <button
                  onClick={() => setShowConfirmDelete(true)}
                  className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 transition-colors flex items-center justify-center"
                  title={isAr ? 'حذف العقد' : 'Delete Contract'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Delete Confirmation */}
          {showConfirmDelete && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-2xl text-center space-y-3">
              <p className="text-xs font-bold text-rose-800 dark:text-rose-200">
                {isAr
                  ? `هل أنت تأكد أنك تريد حذف عقد "${contract.customerName}"؟`
                  : `Are you sure you want to delete contract for "${contract.customerName}"?`}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-sm"
                >
                  {isAr ? 'حذف النهائي' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
