import React, { useState, useEffect, useCallback } from 'react';
import { X, Printer, User, Delete, RotateCcw, Zap, AlertTriangle, AlertCircle, MapPin, LocateFixed, Navigation, Check, RefreshCw, CheckCircle2 } from 'lucide-react';
import { InstallmentContract, Language } from '../types';
import { numberToArabicWords } from '../lib/tafqeet';
import { captureDeviceLocation } from '../lib/geolocationHelper';

interface AddPaymentModalProps {
  contract: InstallmentContract | null;
  isOpen: boolean;
  onClose: () => void;
  onSavePayment: (
    contract: InstallmentContract,
    amount: number,
    note?: string,
    receiptDetails?: any,
    shouldAutoPrint?: boolean,
    locationCoords?: { latitude: number; longitude: number; address?: string }
  ) => void;
  lang: Language;
  paymentCount?: number;
  isAdmin?: boolean;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  contract,
  isOpen,
  onClose,
  onSavePayment,
  lang,
  paymentCount = 1,
  isAdmin = true,
}) => {
  const [amountStr, setAmountStr] = useState<string>('');
  const [locationCoords, setLocationCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    isFromSaved?: boolean;
  } | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [locationProgressText, setLocationProgressText] = useState<string>('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [shouldUpdateCustomerMapLocation, setShouldUpdateCustomerMapLocation] = useState<boolean>(true);

  const isAr = lang === 'ar';

  const isOpenSessionRef = React.useRef(false);
  const activeContractIdRef = React.useRef<string | null>(null);

  const fetchCurrentLocation = useCallback(async () => {
    setIsLocatingGps(true);
    setLocationError(null);
    setLocationProgressText(isAr ? 'جاري التقاط إشارة GPS...' : 'Locating GPS...');

    const res = await captureDeviceLocation((stage) => {
      setLocationProgressText(isAr ? stage : 'Locating...');
    });

    setIsLocatingGps(false);
    setLocationProgressText('');

    if (res.location) {
      setLocationCoords({
        latitude: res.location.latitude,
        longitude: res.location.longitude,
        accuracy: res.location.accuracy,
        isFromSaved: false,
      });
      setLocationError(null);
    } else if (res.error) {
      const errMsg = isAr ? res.error.messageAr : res.error.message;
      setLocationError(errMsg);
    }
  }, [isAr]);

  useEffect(() => {
    if (!isOpen || !contract) {
      isOpenSessionRef.current = false;
      activeContractIdRef.current = null;
      setLocationCoords(null);
      setIsLocatingGps(false);
      setLocationError(null);
      return;
    }

    if (isOpenSessionRef.current && activeContractIdRef.current === contract.id) {
      return;
    }

    isOpenSessionRef.current = true;
    activeContractIdRef.current = contract.id;
    setAmountStr(contract.dailyInstallment ? contract.dailyInstallment.toString() : '');

    // 1. Check if customer already has a saved/established map location
    const hasValidSavedCoords =
      contract.latitude != null &&
      contract.longitude != null &&
      !isNaN(Number(contract.latitude)) &&
      !isNaN(Number(contract.longitude)) &&
      Number(contract.latitude) !== 0 &&
      Number(contract.longitude) !== 0;

    if (hasValidSavedCoords) {
      // Customer has established location: do NOT overwrite on subsequent payments
      setShouldUpdateCustomerMapLocation(false);
      setLocationCoords({
        latitude: Number(contract.latitude),
        longitude: Number(contract.longitude),
        isFromSaved: true,
      });
      setIsLocatingGps(false);
      setLocationError(null);
    } else {
      // Customer has NO location (First payment OR location was deleted):
      // Capture live GPS to pin customer to map from this payment!
      setShouldUpdateCustomerMapLocation(true);
      setLocationCoords(null);
      fetchCurrentLocation();
    }
  }, [isOpen, contract?.id, fetchCurrentLocation]);

  // Support hardware/desktop keyboard entry without opening mobile system keyboard
  useEffect(() => {
    if (!isOpen || !contract) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Backspace') {
        setAmountStr((prev) => prev.slice(0, -1));
      } else if (/^[0-9.]$/.test(e.key)) {
        setAmountStr((prev) => {
          if (e.key === '.' && prev.includes('.')) return prev;
          if (prev === '0' && e.key !== '.') return e.key;
          if (prev === '' && e.key === '.') return '0.';
          if (prev.length >= 9) return prev;
          return prev + e.key;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, contract, onClose]);

  if (!isOpen || !contract) return null;

  const currentAmount = Number(amountStr) || 0;
  const netFinanced = (contract.totalPrice || 0) - (contract.advancePayment || 0);
  const currentRemaining =
    typeof contract.remainingBalance === 'number'
      ? contract.remainingBalance
      : Math.max(0, netFinanced - (contract.totalPaid || 0));
  const isOverRemaining = currentAmount > currentRemaining;
  const newRemaining = Math.max(0, currentRemaining - currentAmount);
  const newTotalPaid = (contract.totalPaid || 0) + currentAmount;
  const amountInWords = numberToArabicWords(currentAmount);

  // Check if customer has a valid saved/pinned map location
  const hasValidSavedCoords = Boolean(
    contract.latitude != null &&
    contract.longitude != null &&
    !isNaN(Number(contract.latitude)) &&
    !isNaN(Number(contract.longitude)) &&
    Number(contract.latitude) !== 0 &&
    Number(contract.longitude) !== 0
  );

  // Check if live GPS has been successfully acquired
  const hasCapturedLiveGps = Boolean(
    locationCoords &&
    locationCoords.latitude != null &&
    locationCoords.longitude != null &&
    !locationCoords.isFromSaved
  );

  // If customer has NO pinned location, payment is strictly prohibited unless GPS is enabled and captured!
  const isGpsMissingForUnlocatedCustomer = !hasValidSavedCoords && !hasCapturedLiveGps;

  // Format date DD-MM-YYYY
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const receiptNo = paymentCount + 1;

  const getReceiptObj = () => ({
    shopTitle: 'الكرار للموبايل',
    receiptNo: receiptNo,
    customerName: contract.customerName,
    itemName: contract.itemName,
    totalPrice: contract.totalPrice,
    totalPaid: newTotalPaid,
    remainingBalance: newRemaining,
    paidAmount: currentAmount,
    amountInWords: amountInWords,
    dateStr: dateStr,
    timeStr: timeStr,
  });

  const handleKeypadPress = (key: string) => {
    if (key === 'C') {
      setAmountStr('');
      return;
    }
    if (key === 'BACKSPACE') {
      setAmountStr((prev) => {
        if (!prev) return '';
        if (prev.endsWith('000')) {
          const base = prev.slice(0, -3);
          const newBase = base.slice(0, -1);
          return newBase === '' ? '' : newBase + '000';
        }
        return prev.slice(0, -1);
      });
      return;
    }
    setAmountStr((prev) => {
      if (key === '.' && prev.includes('.')) return prev;
      if (prev === '' && key >= '1' && key <= '9') {
        return key + '000';
      }
      if (prev === '' && key === '0') {
        return '';
      }
      if (prev.length >= 9) return prev;

      if (prev.endsWith('000') && key >= '0' && key <= '9') {
        const base = prev.slice(0, -3);
        if (base.length >= 6) return prev;
        return base + key + '000';
      }

      return prev + key;
    });
  };

  const handleAddQuickAmount = (addAmount: number) => {
    const current = Number(amountStr) || 0;
    setAmountStr((current + addAmount).toString());
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let finalAmount = currentAmount;
    if (finalAmount > 0 && finalAmount < 1000) {
      finalAmount = finalAmount * 1000;
    }

    if (finalAmount <= 0) {
      alert(isAr ? 'يرجى إدخال مبلغ تسديد صحيح' : 'Please enter a valid amount');
      return;
    }

    if (finalAmount > currentRemaining) {
      alert(
        isAr
          ? `المبلغ المدخل (${finalAmount.toLocaleString('en-US')} د.ع) أكبر من المبلغ المتبقي على الزبون (${currentRemaining.toLocaleString('en-US')} د.ع).`
          : `Amount exceeds remaining balance.`
      );
      return;
    }

    // امنع إضافة دفع للزبائن الذين لم يثبت لهم موقع إذا كان الـ GPS غير مفعل
    if (isGpsMissingForUnlocatedCustomer) {
      alert(
        isAr
          ? '⛔ غير مسموح بإضافة دفعة: هذا الزبون لم يُثبّت له موقع على الخريطة سابقاً، ونظام الـ GPS غير مفعل في هاتفك.\nيجب تفعيل الـ GPS والتقاط موقعه أولاً لإتمام التسديد وتثبيت موقعه بالخريطة.'
          : 'Payment blocked: Customer has no saved map location and GPS is disabled. Please enable GPS first.'
      );
      fetchCurrentLocation();
      return;
    }

    const calculatedNewRemaining = Math.max(0, currentRemaining - finalAmount);
    const calculatedTotalPaid = (contract.totalPaid || 0) + finalAmount;

    const receiptObj = {
      shopTitle: 'الكرار للموبايل',
      receiptNo: paymentCount + 1,
      customerName: contract.customerName,
      itemName: contract.itemName,
      totalPrice: contract.totalPrice,
      totalPaid: calculatedTotalPaid,
      remainingBalance: calculatedNewRemaining,
      paidAmount: finalAmount,
      amountInWords: numberToArabicWords(finalAmount),
      dateStr: dateStr,
      timeStr: timeStr,
    };

    // 1. إغلاق النافذة فوراً عند التسديد
    onClose();

    // 2. تجهيز إحداثيات موقع التسديد لتثبيتها في خريطة الزبائن
    const passedCoords = shouldUpdateCustomerMapLocation && locationCoords
      ? {
          latitude: locationCoords.latitude,
          longitude: locationCoords.longitude,
          address: contract.customerAddress || `موقع تسديد (${dateStr})`
        }
      : undefined;

    // 3. حفظ التسديد وتحديث موقع الزبون بالخريطة وعرض وصل الطباعة المباشر
    onSavePayment(contract, finalAmount, '', receiptObj, true, passedCoords);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg sm:max-w-xl md:max-w-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - مدمج وأنيق */}
        <div className="py-2.5 px-4 bg-teal-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/10 rounded-xl">
              <Printer className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                {isAr ? 'تسديد وصل جديد' : 'Add Payment Receipt'}
              </h2>
              <p className="text-[11px] text-teal-100 font-bold opacity-90">
                {contract.customerName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-lg font-mono">
              📅 {dateStr}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body - مصمم على حجم الشاشة بدقة مع كيبورد داخلي */}
        <div className="p-3 space-y-2 overflow-y-auto flex-1 flex flex-col justify-between">
          {/* شريط معلومات الزبون والرصيد المتبقي */}
          <div className="p-2.5 bg-slate-100 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="p-1.5 bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 rounded-lg">
                <User className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  {isAr ? 'الزبون / القسط اليومي' : 'Customer / Daily'}
                </span>
                <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                  {contract.customerName} ({contract.dailyInstallment.toLocaleString('en-US')} د.ع)
                </span>
              </div>
            </div>
            <div className="text-left dir-ltr">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                {isAr ? 'المتبقي عليه' : 'Remaining'}
              </span>
              <span className="text-xs font-black text-red-600 dark:text-red-400">
                {currentRemaining.toLocaleString('en-US')} د.ع
              </span>
            </div>
          </div>

          {/* شريط تحديد موقع التسديد عبر GPS لخريطة الزبائن */}
          <div className="px-2.5 py-1.5 rounded-xl border bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div
                className={`p-1 rounded-lg shrink-0 ${
                  isLocatingGps
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 animate-pulse'
                    : locationCoords?.isFromSaved
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : locationCoords
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                {isLocatingGps ? (
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 truncate">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
                    <span>{locationProgressText || (isAr ? 'جاري التقاط إشارة GPS...' : 'Locating GPS...')}</span>
                  </span>
                ) : locationCoords ? (
                  <div className="flex items-center gap-1 min-w-0 flex-wrap sm:flex-nowrap">
                    {locationCoords.isFromSaved ? (
                      <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 truncate">
                        {isAr ? '📍 موقع الزبون مثبت بالخريطة (محفوظ)' : '📍 Saved Customer Pin'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 truncate">
                        {isAr ? '🟢 تم التقاط موقع الزبون للخريطة' : '🟢 Customer GPS Captured'}
                      </span>
                    )}
                    {locationCoords.accuracy && (
                      <span className="text-[9px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-1 py-0.5 rounded font-mono shrink-0">
                        ±{locationCoords.accuracy}م
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10.5px] font-bold text-amber-700 dark:text-amber-300 truncate block">
                    {locationError || (isAr ? '📍 اضغط (التقاط GPS) لحفظ موقع الزبون' : 'Tap GPS to pin customer')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {locationCoords?.isFromSaved ? (
                isAdmin ? (
                  <label className="flex items-center gap-1 text-[10px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={shouldUpdateCustomerMapLocation}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setShouldUpdateCustomerMapLocation(checked);
                        if (checked) {
                          fetchCurrentLocation();
                        }
                      }}
                      className="w-3 h-3 rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span>{isAr ? 'تعديل الموقع' : 'Edit Pin'}</span>
                  </label>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60 shadow-2xs">
                    🔒 {isAr ? 'الموقع مثبت' : 'Pinned'}
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  disabled={isLocatingGps}
                  className="p-1 px-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[10.5px] font-bold flex items-center gap-1 shadow-xs transition-colors active:scale-95 disabled:opacity-50"
                  title={isAr ? 'التقاط أو تحديث موقع GPS الحالي' : 'Fetch GPS'}
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>
                    {isLocatingGps
                      ? isAr
                        ? 'جاري...'
                        : 'Searching...'
                      : locationCoords
                      ? isAr
                        ? 'تحديث GPS'
                        : 'Refresh GPS'
                      : isAr
                      ? 'التقاط GPS 📍'
                      : 'Get GPS'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* تحذير منع التسديد عند عدم تثبيت موقع الزبون وتعطل الـ GPS */}
          {isGpsMissingForUnlocatedCustomer && !isLocatingGps && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-start gap-2 animate-in fade-in shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-snug flex-1">
                <span>
                  {isAr
                    ? '⚠️ الزبون لم يُثبّت له موقع على الخريطة سابقاً، والـ GPS غير مفعل. يُمنع التسديد لحين تفعيل GPS والتقاط موقعه.'
                    : 'Customer has no pinned location and GPS is disabled. Payment blocked until GPS is enabled.'}
                </span>
                <button
                  type="button"
                  onClick={fetchCurrentLocation}
                  className="mt-1.5 px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <LocateFixed className="w-3 h-3" />
                  <span>{isAr ? 'تفعيل والتقاط إشارة GPS 📍' : 'Retry GPS'}</span>
                </button>
              </div>
            </div>
          )}

          {/* مربع عرض المبلغ المدفوع (بدون كيبورد النظام) */}
          <div className="p-2 rounded-xl border-2 border-teal-500 bg-teal-50/50 dark:bg-slate-900/90 text-center relative shrink-0">
            <div className="text-[11px] font-black text-slate-600 dark:text-slate-400">
              {isAr ? 'المبلغ المدفوع (د.ع)' : 'Payment Amount (IQD)'}
            </div>
            <div className="flex items-center justify-center gap-1.5 my-0.5">
              <span className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-300 tracking-tight dir-ltr">
                {currentAmount.toLocaleString('en-US')}
              </span>
              <span className="text-xs font-black text-teal-600 dark:text-teal-400">
                د.ع
              </span>
            </div>
            {currentAmount > 0 && (
              <p className="text-[10px] font-black text-teal-800 dark:text-teal-200 leading-tight truncate">
                {amountInWords}
              </p>
            )}

            {/* زر مسح المبلغ سريعاً */}
            {amountStr !== '' && (
              <button
                type="button"
                onClick={() => setAmountStr('')}
                className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 hover:bg-red-200 transition-colors"
                title={isAr ? 'مسح المبلغ' : 'Clear'}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* أزرار الإضافة السريعة للمبلغ */}
          <div className="grid grid-cols-4 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setAmountStr(contract.dailyInstallment ? contract.dailyInstallment.toString() : '0')}
              className="py-1.5 px-1 rounded-lg bg-teal-600 text-white font-extrabold text-[11px] hover:bg-teal-700 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1"
            >
              <Zap className="w-3 h-3 shrink-0" />
              <span>قسط اليوم</span>
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickAmount(5000)}
              className="py-1.5 px-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-black text-xs active:scale-95 transition-all"
            >
              +5,000
            </button>
            <button
              type="button"
              onClick={() => handleAddQuickAmount(10000)}
              className="py-1.5 px-1 rounded-lg bg-slate-100 dark:bg-slate-700/80 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-black text-xs active:scale-95 transition-all"
            >
              +10,000
            </button>
            <button
              type="button"
              onClick={() => setAmountStr(Math.max(0, currentRemaining).toString())}
              className="py-1.5 px-1 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-black text-xs active:scale-95 transition-all truncate shadow-xs"
              title={isAr ? `تسديد كامل الباقي (${currentRemaining.toLocaleString('en-US')} د.ع)` : `Remaining: ${currentRemaining.toLocaleString('en-US')}`}
            >
              {currentRemaining > 0 ? currentRemaining.toLocaleString('en-US') : '0'}
            </button>
          </div>

          {/* الكيبورد الداخلي من التطبيق (على قد الشاشة وسهل النقر) */}
          <div className="grid grid-cols-3 gap-1 sm:gap-1.5 select-none shrink-0" dir="ltr">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeypadPress(num)}
                className="py-2 sm:py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-teal-500 active:text-white text-slate-900 dark:text-slate-100 font-black text-lg sm:text-xl shadow-sm active:scale-95 transition-all"
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={() => handleKeypadPress('.')}
              className="py-2 sm:py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-teal-500 active:text-white text-slate-900 dark:text-slate-100 font-black text-lg sm:text-xl shadow-sm active:scale-95 transition-all"
            >
              .
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="py-2 sm:py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/70 hover:bg-slate-200 dark:hover:bg-slate-600 active:bg-teal-500 active:text-white text-slate-900 dark:text-slate-100 font-black text-lg sm:text-xl shadow-sm active:scale-95 transition-all"
            >
              0
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress('C')}
              className="py-2 sm:py-2.5 rounded-xl bg-red-100 dark:bg-red-950/60 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-black text-sm sm:text-base shadow-sm active:scale-95 transition-all flex items-center justify-center"
            >
              {isAr ? 'مسح' : 'C'}
            </button>

            <button
              type="button"
              onClick={() => handleKeypadPress('BACKSPACE')}
              className="col-span-3 py-2 sm:py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-sm sm:text-base shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5"
              title={isAr ? 'حذف آخر رقم' : 'Backspace'}
            >
              <Delete className="w-4 h-4 shrink-0" />
              <span>{isAr ? 'حذف' : 'Backspace'}</span>
            </button>
          </div>

          {/* زر التسديد والإغلاق الفوري أو التحذير فقط عند تجاوز المبلغ */}
          <form onSubmit={handleFormSubmit} className="pt-1 shrink-0">
            {isOverRemaining ? (
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/60 border-2 border-red-400 dark:border-red-800 text-center flex items-center justify-center gap-2 shadow-xs animate-in fade-in duration-150">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                <p className="text-xs font-black text-red-700 dark:text-red-300 leading-snug">
                  {isAr
                    ? currentRemaining <= 0
                      ? '⚠️ حساب الزبون مسدد بالكامل (الباقي 0 د.ع). لا يمكن إضافة مبالغ جديدة.'
                      : `⚠️ المبلغ المدخل (${currentAmount.toLocaleString('en-US')} د.ع) أكبر من الباقي (${currentRemaining.toLocaleString('en-US')} د.ع). يرجى تصحيح المبلغ.`
                    : currentRemaining <= 0
                    ? '⚠️ Customer balance is fully paid (0 IQD).'
                    : `⚠️ Entered amount (${currentAmount.toLocaleString('en-US')} IQD) exceeds remaining (${currentRemaining.toLocaleString('en-US')} IQD). Please correct the amount.`}
                </p>
              </div>
            ) : isLocatingGps ? (
              <button
                type="button"
                disabled
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl text-white font-black text-sm bg-slate-600 opacity-90 flex items-center justify-center gap-2 cursor-wait"
              >
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isAr ? 'جاري التقاط إشارة GPS لتثبيت موقع الزبون...' : 'Locating GPS to pin customer...'}</span>
              </button>
            ) : isGpsMissingForUnlocatedCustomer ? (
              <button
                type="button"
                onClick={() => {
                  alert(
                    isAr
                      ? '⛔ غير مسموح بإضافة دفعة: هذا الزبون لم يُثبّت له موقع على الخريطة، والـ GPS غير مفعل.\nيرجى تفعيل الـ GPS في هاتفك ثم الضغط على (التقاط GPS) لتثبيت موقع الزبون مع الدفعة.'
                      : 'Payment blocked: Customer has no saved location and GPS is disabled. Please enable GPS and capture location.'
                  );
                  fetchCurrentLocation();
                }}
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl text-white font-black text-sm sm:text-base bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
              >
                <AlertTriangle className="w-5 h-5 text-white" />
                <span>{isAr ? '⛔ ممنوع التسديد (الـ GPS غير مفعل للزبون)' : 'Blocked: GPS Disabled'}</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={currentAmount <= 0}
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl text-white font-black text-sm sm:text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 bg-teal-600 hover:bg-teal-700 shadow-teal-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-5 h-5" />
                <span>
                  {isAr
                    ? hasValidSavedCoords
                      ? 'تسديد وطباعة'
                      : 'تسديد وطباعة (مع تثبيت موقع الزبون 📍)'
                    : 'Pay & Print'}
                </span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

