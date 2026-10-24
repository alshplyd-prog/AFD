import React, { useState } from 'react';
import { UserCheck, Shield, KeyRound, ArrowRight, UserPlus, Sparkles, Building2, Lock, Delete, X, User } from 'lucide-react';
import { SalesRepresentative, Language } from '../types';
import { DEFAULT_REPS } from '../data/initialContracts';
import { normalizePin, isPinMatching } from '../lib/pinUtils';
import { fetchWithFallback } from '../lib/apiConfig';
import { getLocalCache } from '../lib/postgresClient';

interface LoginViewProps {
  onLogin: (rep: SalesRepresentative) => void;
  reps: SalesRepresentative[];
  lang: Language;
  onViewSplash?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, reps, lang, onViewSplash }) => {
  const isAr = lang === 'ar';
  const activeRepsList = React.useMemo(() => {
    let list = reps && Array.isArray(reps) && reps.length > 0 ? [...reps] : [...DEFAULT_REPS];
    if (!list.some(r => r.id === 'rep-1' || (r.name && r.name.includes('ضياء')))) {
      list.unshift({
        id: 'rep-1',
        name: 'ضياء المحاسب',
        phone: '07801112233',
        code: '4444',
        role: 'admin',
        canEdit: true,
        canDelete: true,
        canMoveCustomer: true,
        canSell: true,
        allowedListIds: ['all']
      });
    }
    // Sort so admin/supervisor is at the top
    return list.sort((a, b) => {
      if (a.id === 'rep-1' || a.role === 'admin') return -1;
      if (b.id === 'rep-1' || b.role === 'admin') return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [reps]);

  const [loginMode, setLoginMode] = useState<'list' | 'direct'>('list');
  
  // Selected account for PIN popup modal
  const [pinModalRep, setPinModalRep] = useState<SalesRepresentative | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [error, setError] = useState('');

  // Direct login state
  const [inputName, setInputName] = useState('');
  const [directPin, setDirectPin] = useState('');

  // Open PIN Modal for chosen rep account
  const handleSelectRep = (rep: SalesRepresentative) => {
    setPinModalRep(rep);
    setPinCode('');
    setError('');
  };

  // Submit PIN for Modal
  const handlePinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    if (!pinModalRep) return;

    const normalizedEnteredPin = normalizePin(pinCode);
    if (!normalizedEnteredPin) {
      setError(isAr ? 'يرجى إدخال الرمز السري الخاص بالحساب' : 'Please enter PIN code');
      return;
    }

    // 1. Check against latest rep from props
    const currentFromProps = reps.find(
      (r) => r.id === pinModalRep.id || (r.name && r.name.toLowerCase() === pinModalRep.name.toLowerCase())
    );
    const targetRep = currentFromProps || pinModalRep;

    if (isPinMatching(normalizedEnteredPin, targetRep.code) || isPinMatching(normalizedEnteredPin, pinModalRep.code)) {
      onLogin({ ...targetRep, code: normalizedEnteredPin });
      return;
    }

    // 2. Check local storage cache in case reps were updated in background
    try {
      const cachedReps = getLocalCache<SalesRepresentative>('reps');
      const cachedMatch = cachedReps.find(
        (r) => r.id === pinModalRep.id || (r.name && r.name.toLowerCase() === pinModalRep.name.toLowerCase())
      );
      if (cachedMatch && isPinMatching(normalizedEnteredPin, cachedMatch.code)) {
        onLogin({ ...cachedMatch, code: normalizedEnteredPin });
        return;
      }
    } catch (cacheErr) {}

    // 3. Fallback: Quick live verification with remote PostgreSQL server via fetchWithFallback (works on APK & Web)
    try {
      const res = await fetchWithFallback('reps', undefined, 3500);
      if (res && res.ok) {
        const freshReps: SalesRepresentative[] = await res.json();
        if (Array.isArray(freshReps)) {
          const freshMatch = freshReps.find(
            (r) => r.id === pinModalRep.id || (r.name && r.name.toLowerCase() === pinModalRep.name.toLowerCase())
          );
          if (freshMatch && isPinMatching(normalizedEnteredPin, freshMatch.code)) {
            onLogin({ ...freshMatch, code: normalizedEnteredPin });
            return;
          }
        }
      }
    } catch (fetchErr) {
      // offline or network error, proceed to show error
    }

    setError(isAr ? `رمز الأمان غير صحيح لحساب (${pinModalRep.name})!` : 'Incorrect PIN code!');
  };

  // Handle Keypad button press
  const handleKeypadPress = (val: string) => {
    setError('');
    if (val === 'back') {
      setPinCode((prev) => prev.slice(0, -1));
    } else if (val === 'clear') {
      setPinCode('');
    } else {
      if (pinCode.length < 8) {
        setPinCode((prev) => prev + normalizePin(val));
      }
    }
  };

  // Listen to keyboard input for PIN modal (supports both English and Arabic numerals)
  React.useEffect(() => {
    if (!pinModalRep) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      let digit: string | null = null;
      if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      } else if ('٠١٢٣٤٥٦٧٨٩'.includes(e.key)) {
        digit = String('٠١٢٣٤٥٦٧٨٩'.indexOf(e.key));
      } else if ('۰۱۲۳۴۵۶۷۸۹'.includes(e.key)) {
        digit = String('۰۱۲۳۴۵۶۷۸۹'.indexOf(e.key));
      }

      if (digit !== null) {
        setError('');
        setPinCode((prev) => (prev.length < 8 ? prev + digit : prev));
      } else if (e.key === 'Backspace') {
        setError('');
        setPinCode((prev) => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        setPinModalRep(null);
        setError('');
      } else if (e.key === 'Enter') {
        handlePinSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinModalRep, pinCode, reps]);

  // Handle Direct Login Submit
  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = inputName.trim();
    const normalizedEnteredPin = normalizePin(directPin);

    if (!trimmedName) {
      setError(isAr ? 'يرجى كتابة الاسم' : 'Please enter name');
      return;
    }

    if (!normalizedEnteredPin) {
      setError(isAr ? 'يرجى كتابة الرمز السري' : 'Please enter PIN code');
      return;
    }

    // Check if account exists in current activeRepsList or reps
    const matched =
      reps.find(
        (r) =>
          r.name.toLowerCase() === trimmedName.toLowerCase() ||
          r.name.toLowerCase().includes(trimmedName.toLowerCase())
      ) ||
      activeRepsList.find(
        (r) =>
          r.name.toLowerCase() === trimmedName.toLowerCase() ||
          r.name.toLowerCase().includes(trimmedName.toLowerCase())
      );

    if (matched) {
      if (isPinMatching(normalizedEnteredPin, matched.code)) {
        onLogin({ ...matched, code: normalizedEnteredPin });
        return;
      }

      // Check local cache
      try {
        const cachedReps = getLocalCache<SalesRepresentative>('reps');
        const cachedMatch = cachedReps.find(
          (r) =>
            r.id === matched.id ||
            r.name.toLowerCase() === trimmedName.toLowerCase() ||
            r.name.toLowerCase().includes(trimmedName.toLowerCase())
        );
        if (cachedMatch && isPinMatching(normalizedEnteredPin, cachedMatch.code)) {
          onLogin({ ...cachedMatch, code: normalizedEnteredPin });
          return;
        }
      } catch (e) {}

      // Live verification with server before rejecting (works on APK via fetchWithFallback)
      try {
        const res = await fetchWithFallback('reps', undefined, 3500);
        if (res && res.ok) {
          const freshReps: SalesRepresentative[] = await res.json();
          if (Array.isArray(freshReps)) {
            const freshMatch = freshReps.find(
              (r) =>
                r.id === matched.id ||
                (r.name && r.name.toLowerCase() === matched.name.toLowerCase())
            );
            if (freshMatch && isPinMatching(normalizedEnteredPin, freshMatch.code)) {
              onLogin({ ...freshMatch, code: normalizedEnteredPin });
              return;
            }
          }
        }
      } catch (e) {
        // network issue
      }

      setError(isAr ? `رمز الأمان غير صحيح لحساب (${matched.name})` : 'Incorrect PIN code');
    } else {
      setError(
        isAr
          ? 'هذا الحساب غير مسجل! إضافة الحسابات الجديدة تتم فقط من قبل المدير من داخل التطبيق.'
          : 'Account not found! New accounts can only be created by the Manager inside the app.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden dir-rtl">
      {/* Background Decorative Blur Gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex flex-col items-center justify-center mb-3">
            <button
              type="button"
              onClick={onViewSplash}
              title={isAr ? 'عرض الشاشة الافتتاحية' : 'View Splash Screen'}
              className="relative group cursor-pointer transition-transform active:scale-95"
            >
              <img
                src="/app-logo.jpg"
                alt="الكرار للتقسيط للموبايل"
                referrerPolicy="no-referrer"
                className="w-24 h-24 rounded-3xl object-cover shadow-2xl border-2 border-teal-500/40 p-0.5 bg-slate-800 group-hover:border-teal-400 transition-colors"
              />
              <span className="absolute -bottom-2 px-2 py-0.5 rounded-full bg-teal-500/90 text-slate-950 font-black text-[10px] shadow-md flex items-center gap-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <Sparkles className="w-2.5 h-2.5" />
                {isAr ? 'افتتاحية التطبيق' : 'Splash'}
              </span>
            </button>
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide mb-1">
            {isAr ? 'الكرار للتقسيط للموبايل' : 'Al-Karrar Installment'}
          </h1>
          <p className="text-xs text-teal-300 font-bold tracking-wider uppercase mb-0.5">
            Taqseetak Financial Solutions
          </p>
          <p className="text-xs text-slate-400 font-medium">
            {isAr ? 'تسجيل الدخول للنظام (المدير والمندوبين)' : 'Manager & Sales Representative Login'}
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-3xl p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-extrabold text-slate-300 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-400" />
                {isAr ? 'اختر الحساب لفتح نافذة الرمز السري:' : 'Select Account to Enter PIN:'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                {isAr ? 'مربوط بـ PostgreSQL' : 'Synced with PostgreSQL'}
              </span>
            </div>

            {/* Accounts Cards Grid */}
            <div className="grid grid-cols-1 gap-2.5 max-h-80 overflow-y-auto pr-1">
              {activeRepsList.map((rep) => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => handleSelectRep(rep)}
                  className={`flex items-center justify-between p-4 rounded-2xl text-right transition-all group cursor-pointer active:scale-98 shadow-sm border ${
                    rep.role === 'admin'
                      ? 'bg-amber-950/20 hover:bg-amber-950/30 border-amber-500/40 hover:border-amber-400'
                      : rep.role === 'supervisor'
                      ? 'bg-red-950/20 hover:bg-red-950/30 border-red-500/40 hover:border-red-400'
                      : 'bg-slate-900/60 hover:bg-blue-950/50 border-slate-700/80 hover:border-blue-500/80'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {rep.avatarUrl ? (
                      <img src={rep.avatarUrl} alt={rep.name} className="w-11 h-11 rounded-2xl object-cover border-2 border-teal-500/50 shadow-sm shrink-0" />
                    ) : (
                      <div
                        className={`p-2.5 rounded-2xl border ${
                          rep.role === 'admin'
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : rep.role === 'supervisor'
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        }`}
                      >
                        {rep.role === 'admin' ? (
                          <Shield className="w-5 h-5" />
                        ) : rep.role === 'supervisor' ? (
                          <Shield className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-black transition-colors ${
                            rep.role === 'admin'
                              ? 'text-amber-300 group-hover:text-amber-200'
                              : rep.role === 'supervisor'
                              ? 'text-red-300 group-hover:text-red-200'
                              : 'text-white group-hover:text-blue-300'
                          }`}
                        >
                          {rep.name}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                            rep.role === 'admin'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : rep.role === 'supervisor'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {rep.role === 'admin'
                            ? isAr
                              ? 'مدير التطبيق'
                              : 'Admin'
                            : rep.role === 'supervisor'
                            ? isAr
                              ? 'مسؤول'
                              : 'Supervisor'
                            : isAr
                            ? 'مندوب'
                            : 'Rep'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span>{isAr ? 'انقر للرقم السري' : 'Click to enter PIN'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-slate-800 text-slate-300 group-hover:bg-blue-600 group-hover:text-white transition-all">
                      <KeyRound className="w-4 h-4" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 mt-6">
          {isAr ? 'تطبيق مبيعات بالتقسيط اليومي • إدارة التحصيل والمخزن' : 'Daily Sales & Collection Management System'}
        </p>
      </div>

      {/* Dedicated PIN Code Popup Modal Window (نافذة الرمز السري) */}
      {pinModalRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 xs:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/90 rounded-2xl xs:rounded-3xl w-full max-w-sm shadow-2xl overflow-y-auto max-h-[96vh] p-3.5 xs:p-5 sm:p-6 relative dir-rtl">
            <button
              type="button"
              onClick={() => {
                setPinModalRep(null);
                setError('');
              }}
              className="absolute top-3 left-3 p-1.5 xs:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 xs:w-5 xs:h-5" />
            </button>

            {/* Account Info Header */}
            <div className="text-center mb-3 xs:mb-5 mt-1">
              {pinModalRep.avatarUrl ? (
                <div className="inline-block relative mb-2 xs:mb-3">
                  <img
                    src={pinModalRep.avatarUrl}
                    alt={pinModalRep.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 xs:w-20 xs:h-20 rounded-3xl object-cover border-4 border-amber-500/60 shadow-xl"
                  />
                </div>
              ) : (
                <div
                  className={`inline-flex p-2.5 xs:p-3 sm:p-3.5 rounded-xl xs:rounded-2xl mb-2 xs:mb-3 border ${
                    pinModalRep.role === 'admin'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      : pinModalRep.role === 'supervisor'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {pinModalRep.role === 'admin' ? (
                    <Shield className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8" />
                  ) : pinModalRep.role === 'supervisor' ? (
                    <Shield className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8" />
                  ) : (
                    <UserCheck className="w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8" />
                  )}
                </div>
              )}
              <h3 className="text-base xs:text-lg font-black text-white">{pinModalRep.name}</h3>
              <p className="text-[11px] xs:text-xs text-amber-400 font-bold mt-0.5 flex items-center justify-center gap-1">
                <Lock className="w-3 h-3 xs:w-3.5 xs:h-3.5" />
                <span>{isAr ? 'أدخل الرمز السري للدخول:' : 'Enter PIN Code to unlock:'}</span>
              </p>
            </div>

            {/* PIN Dots / Display */}
            <form onSubmit={handlePinSubmit} className="space-y-2.5 xs:space-y-4">
              <div className="relative">
                <input
                  type="password"
                  readOnly
                  inputMode="none"
                  maxLength={10}
                  value={pinCode}
                  placeholder="••••"
                  className="w-full py-2 xs:py-3 sm:py-3.5 px-3 xs:px-4 rounded-xl xs:rounded-2xl bg-slate-950 border-2 border-amber-500/60 text-amber-300 placeholder-slate-600 text-lg xs:text-xl font-mono focus:outline-none text-center tracking-widest font-black dir-ltr cursor-default select-none"
                />
              </div>

              {error && (
                <div className="p-2 xs:p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold text-center">
                  {error}
                </div>
              )}

              {/* On-screen Keypad with LTR ordering so '1' is on the left */}
              <div className="grid grid-cols-3 gap-1.5 xs:gap-2 py-1 xs:py-2" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="py-2 xs:py-2.5 sm:py-3.5 rounded-xl xs:rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-white font-black text-lg xs:text-xl shadow-xs border border-slate-700/60 transition-all cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('clear')}
                  className="py-2 xs:py-2.5 sm:py-3.5 rounded-xl xs:rounded-2xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-extrabold text-[11px] xs:text-xs border border-rose-800/60 transition-all cursor-pointer"
                >
                  {isAr ? 'مسح' : 'Clear'}
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-2 xs:py-2.5 sm:py-3.5 rounded-xl xs:rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-blue-600 text-white font-black text-lg xs:text-xl shadow-xs border border-slate-700/60 transition-all cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('back')}
                  className="py-2 xs:py-2.5 sm:py-3.5 rounded-xl xs:rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs flex items-center justify-center border border-slate-700/60 transition-all cursor-pointer"
                >
                  <Delete className="w-4 h-4 xs:w-5 xs:h-5" />
                </button>
              </div>

              <div className="flex gap-2 pt-0.5 xs:pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalRep(null);
                    setError('');
                  }}
                  className="w-1/3 py-2.5 xs:py-3 rounded-xl xs:rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-xs transition-all cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 xs:py-3 rounded-xl xs:rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs xs:text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>{isAr ? 'تأكيد الدخول' : 'Confirm'}</span>
                  <ArrowRight className="w-3.5 h-3.5 xs:w-4 xs:h-4 rtl:rotate-180" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
