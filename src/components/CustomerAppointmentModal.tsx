import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Trash2, X, CheckCircle, AlertCircle, Sparkles, User, Info } from 'lucide-react';
import { InstallmentContract, Appointment, SalesRepresentative, AppointmentType } from '../types';

interface CustomerAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: InstallmentContract | null;
  existingAppointment?: Appointment | null;
  onSave: (apptData: Partial<Appointment>) => Promise<void> | void;
  onDelete?: (apptId: string) => Promise<void> | void;
  currentRep: SalesRepresentative | null;
  isAdmin: boolean;
  isAr?: boolean;
}

const WEEKDAYS = [
  { day: 6, nameAr: 'كل سبت', nameEn: 'Every Saturday' },
  { day: 0, nameAr: 'كل أحد', nameEn: 'Every Sunday' },
  { day: 1, nameAr: 'كل اثنين', nameEn: 'Every Monday' },
  { day: 2, nameAr: 'كل ثلاثاء', nameEn: 'Every Tuesday' },
  { day: 3, nameAr: 'كل أربعاء', nameEn: 'Every Wednesday' },
  { day: 4, nameAr: 'كل خميس', nameEn: 'Every Thursday' },
  { day: 5, nameAr: 'كل جمعة', nameEn: 'Every Friday' },
];

const parseToTimeInputFormat = (timeStr?: string): string => {
  if (!timeStr) return '10:00';
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  if (/^\d{1}:\d{2}$/.test(timeStr)) return `0${timeStr}`;
  const isPm = timeStr.includes('م') || timeStr.toLowerCase().includes('pm');
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${m}`;
  }
  return '10:00';
};

const formatTimeForDisplay = (time24?: string, isArabic = true): string => {
  if (!time24) return '';
  if (time24.includes('ص') || time24.includes('م') || time24.includes('AM') || time24.includes('PM')) {
    return time24;
  }
  const parts = time24.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (!isNaN(hours)) {
      const isPm = hours >= 12;
      const h12 = hours % 12 || 12;
      const suffix = isArabic ? (isPm ? 'م' : 'ص') : (isPm ? 'PM' : 'AM');
      return `${h12}:${minutes} ${suffix}`;
    }
  }
  return time24;
};

const YEARS = [
  new Date().getFullYear(),
  new Date().getFullYear() + 1,
  new Date().getFullYear() + 2,
];

const ARABIC_MONTHS = [
  { value: '01', name: '01 - كانون الثاني (1)' },
  { value: '02', name: '02 - شباط (2)' },
  { value: '03', name: '03 - آذار (3)' },
  { value: '04', name: '04 - نيسان (4)' },
  { value: '05', name: '05 - أيار (5)' },
  { value: '06', name: '06 - حزيران (6)' },
  { value: '07', name: '07 - تموز (7)' },
  { value: '08', name: '08 - آب (8)' },
  { value: '09', name: '09 - أيلول (9)' },
  { value: '10', name: '10 - تشرين الأول (10)' },
  { value: '11', name: '11 - تشرين الثاني (11)' },
  { value: '12', name: '12 - كانون الأول (12)' },
];

const parseDateParts = (dateStr?: string) => {
  let target: Date;
  if (dateStr) {
    const parts = dateStr.trim().split(/[\/-]/);
    if (parts.length === 3) {
      // Handle both DD/MM/YYYY and YYYY-MM-DD
      if (parts[0].length === 4) {
        target = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        target = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
    } else {
      target = new Date(dateStr);
    }
  } else {
    target = new Date();
  }

  if (isNaN(target.getTime())) {
    target = new Date();
  }

  return {
    year: target.getFullYear(),
    month: String(target.getMonth() + 1).padStart(2, '0'),
    day: String(target.getDate()).padStart(2, '0'),
  };
};

export const CustomerAppointmentModal: React.FC<CustomerAppointmentModalProps> = ({
  isOpen,
  onClose,
  contract,
  existingAppointment,
  onSave,
  onDelete,
  currentRep,
  isAdmin,
  isAr = true,
}) => {
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('recurring_day');
  const [recurringDay, setRecurringDay] = useState<number>(6); // Saturday default
  const [recurringMonthDay, setRecurringMonthDay] = useState<number>(1);
  
  // RTL Date Components: Year / Month / Day
  const initialParts = parseDateParts(existingAppointment?.appointmentDate);
  const [selectedYear, setSelectedYear] = useState<number>(initialParts.year);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialParts.month);
  const [selectedDay, setSelectedDay] = useState<string>(initialParts.day);

  const [appointmentTime, setAppointmentTime] = useState<string>('10:00');
  const [note, setNote] = useState<string>('تحصيل قسط');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !contract) return;
    if (existingAppointment) {
      setAppointmentType(existingAppointment.appointmentType || 'date');
      if (existingAppointment.recurringDay !== undefined) {
        setRecurringDay(Number(existingAppointment.recurringDay) || 6);
      }
      if (existingAppointment.recurringMonthDay !== undefined) {
        setRecurringMonthDay(existingAppointment.recurringMonthDay);
      }
      if (existingAppointment.appointmentDate) {
        const parts = parseDateParts(existingAppointment.appointmentDate);
        setSelectedYear(parts.year);
        setSelectedMonth(parts.month);
        setSelectedDay(parts.day);
      }
      if (existingAppointment.appointmentTime) {
        setAppointmentTime(parseToTimeInputFormat(existingAppointment.appointmentTime));
      }
      if (existingAppointment.note) {
        setNote(existingAppointment.note);
      }
    } else {
      const now = new Date();
      setAppointmentType('recurring_day');
      setRecurringDay(now.getDay());
      setRecurringMonthDay(now.getDate());
      const parts = parseDateParts();
      setSelectedYear(parts.year);
      setSelectedMonth(parts.month);
      setSelectedDay(parts.day);
      setAppointmentTime('10:00');
      setNote('تحصيل قسط');
    }
  }, [existingAppointment, contract, isOpen]);

  const setDateFromOffset = (offsetDays: number) => {
    const d = new Date(Date.now() + offsetDays * 86400000);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(String(d.getMonth() + 1).padStart(2, '0'));
    setSelectedDay(String(d.getDate()).padStart(2, '0'));
  };

  const formattedDateValue = `${selectedDay}/${selectedMonth}/${selectedYear}`;

  const canDelete = Boolean(
    existingAppointment &&
    (isAdmin ||
      (currentRep && existingAppointment.createdByRepId === currentRep.id) ||
      (currentRep && existingAppointment.createdByName === currentRep.name))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsSubmitting(true);
    try {
      const selectedDayObj = WEEKDAYS.find((w) => w.day === recurringDay);
      const formattedTime = formatTimeForDisplay(appointmentTime, isAr);
      const apptData: Partial<Appointment> = {
        contractId: contract.id,
        customerName: contract.customerName,
        customerPhone: contract.customerPhone,
        customerAddress: contract.customerAddress || '',
        listId: contract.listId || '',
        listName: contract.listName || '',
        appointmentType,
        recurringDay: appointmentType === 'recurring_day' ? recurringDay : undefined,
        recurringDayName: appointmentType === 'recurring_day' ? (isAr ? selectedDayObj?.nameAr : selectedDayObj?.nameEn) : '',
        recurringMonthDay: appointmentType === 'recurring_month' ? recurringMonthDay : undefined,
        recurringMonthDayName: appointmentType === 'recurring_month' ? (isAr ? `يوم ${recurringMonthDay} من كل شهر` : `Day ${recurringMonthDay} of month`) : '',
        appointmentDate: appointmentType === 'date' ? formattedDateValue : undefined,
        appointmentTime: formattedTime,
        note: note.trim(),
        status: existingAppointment?.status || 'pending',
        createdByName: existingAppointment?.createdByName || currentRep?.name || 'المدير',
        createdByRepId: existingAppointment?.createdByRepId || currentRep?.id || 'rep-1',
      };

      await onSave(apptData);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingAppointment || !onDelete) return;
    if (confirm(isAr ? 'هل أنت متأكد من حذف هذا الموعد؟' : 'Delete appointment?')) {
      setIsSubmitting(true);
      try {
        await onDelete(existingAppointment.id);
        onClose();
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!isOpen || !contract) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn" dir="rtl">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-black">
                {existingAppointment
                  ? (isAr ? 'تعديل موعد الزبون' : 'Edit Appointment')
                  : (isAr ? 'جدولة موعد للزبون' : 'Schedule Appointment')}
              </h3>
              <p className="text-xs text-purple-100 font-bold truncate max-w-[260px]">
                {contract.customerName} ({contract.remainingBalance.toLocaleString()} د.ع متبقي)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Appointment Info Pill */}
        {existingAppointment && (
          <div className="mx-4 mt-3 p-3 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800 text-xs">
            <div className="flex items-center justify-between font-black text-purple-900 dark:text-purple-200">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-600" />
                {existingAppointment.appointmentType === 'recurring_day' && (existingAppointment.recurringDayName || 'أسبوعي')}
                {existingAppointment.appointmentType === 'recurring_month' && (existingAppointment.recurringMonthDayName || `يوم ${existingAppointment.recurringMonthDay} شهرياً`)}
                {existingAppointment.appointmentType === 'date' && `بتاريخ: ${existingAppointment.appointmentDate}`}
              </span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                بواسطة: {existingAppointment.createdByName || 'المندوب'}
              </span>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden text-xs">
          <div className="p-3 sm:p-4 space-y-3 overflow-y-auto flex-1">
            {/* Appointment Type Selector */}
            <div>
              <label className="font-extrabold text-slate-700 dark:text-slate-200 block mb-1">
                {isAr ? 'نوع الموعد المطلوب *' : 'Appointment Type *'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAppointmentType('recurring_day')}
                  className={`py-1.5 px-2 rounded-xl font-bold border transition-all text-center text-xs ${
                    appointmentType === 'recurring_day'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'أسبوعي متكرر' : 'Weekly'}
                </button>

                <button
                  type="button"
                  onClick={() => setAppointmentType('recurring_month')}
                  className={`py-1.5 px-2 rounded-xl font-bold border transition-all text-center text-xs ${
                    appointmentType === 'recurring_month'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'شهري متكرر' : 'Monthly'}
                </button>

                <button
                  type="button"
                  onClick={() => setAppointmentType('date')}
                  className={`py-1.5 px-2 rounded-xl font-bold border transition-all text-center text-xs ${
                    appointmentType === 'date'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isAr ? 'محدد بتاريخ' : 'Specific Date'}
                </button>
              </div>
            </div>

          {/* Conditional Options based on Type */}
          {appointmentType === 'recurring_day' && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="font-extrabold text-slate-700 dark:text-slate-300 block">
                {isAr ? 'اختر يوم التكرار الأسبوعي:' : 'Select weekday:'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {WEEKDAYS.map((w) => (
                  <button
                    key={w.day}
                    type="button"
                    onClick={() => setRecurringDay(w.day)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                      recurringDay === w.day
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {isAr ? w.nameAr : w.nameEn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {appointmentType === 'recurring_month' && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="font-extrabold text-slate-700 dark:text-slate-300 block">
                {isAr ? 'اختر اليوم من كل شهر (1 - 31):' : 'Select Day of Month (1 - 31):'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={recurringMonthDay}
                  onChange={(e) => setRecurringMonthDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-24 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center font-black text-sm"
                />
                <span className="text-slate-600 dark:text-slate-400 font-bold">
                  {isAr ? `يوم ${recurringMonthDay} من كل شهر ميلادي` : `Day ${recurringMonthDay} of every month`}
                </span>
              </div>
            </div>
          )}

          {appointmentType === 'date' && (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-extrabold text-slate-700 dark:text-slate-300 block text-xs">
                  {isAr ? 'تاريخ الموعد المحدد:' : 'Appointment Date:'}
                </label>
                {/* Formatted Date Preview with slashes */}
                <span className="text-[11px] font-black font-mono text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800 flex items-center gap-1" dir="ltr">
                  <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                  <span>{formattedDateValue}</span>
                </span>
              </div>

              {/* Compact RTL Segmented Date Selector: Right to Left -> Day / Month / Year */}
              <div className="flex items-center justify-center gap-1 bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-purple-200 dark:border-purple-800 shadow-2xs" dir="rtl">
                {/* 1. Day Selector (Rightmost in RTL) */}
                <div className="flex-1 min-w-[65px]">
                  <label className="text-[9px] font-black text-purple-700 dark:text-purple-300 block mb-0.5 text-center">
                    {isAr ? 'اليوم' : 'Day'}
                  </label>
                  <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="w-full bg-purple-50/70 dark:bg-slate-900 border border-purple-200 dark:border-slate-700 rounded-lg py-1 px-1 text-xs font-black text-center text-slate-800 dark:text-white focus:outline-none focus:border-purple-600 cursor-pointer"
                  >
                    {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Slash 1 */}
                <span className="font-black text-base text-purple-500 dark:text-purple-400 select-none self-end pb-1">
                  /
                </span>

                {/* 2. Month Selector (Middle in RTL) */}
                <div className="flex-1 min-w-[65px]">
                  <label className="text-[9px] font-black text-purple-700 dark:text-purple-300 block mb-0.5 text-center">
                    {isAr ? 'الشهر' : 'Month'}
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full bg-purple-50/70 dark:bg-slate-900 border border-purple-200 dark:border-slate-700 rounded-lg py-1 px-1 text-xs font-black text-center text-slate-800 dark:text-white focus:outline-none focus:border-purple-600 cursor-pointer"
                  >
                    {ARABIC_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.value}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Slash 2 */}
                <span className="font-black text-base text-purple-500 dark:text-purple-400 select-none self-end pb-1">
                  /
                </span>

                {/* 3. Year Selector (Leftmost in RTL) */}
                <div className="flex-1 min-w-[75px]">
                  <label className="text-[9px] font-black text-purple-700 dark:text-purple-300 block mb-0.5 text-center">
                    {isAr ? 'السنة' : 'Year'}
                  </label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-purple-50/70 dark:bg-slate-900 border border-purple-200 dark:border-slate-700 rounded-lg py-1 px-1 text-xs font-black text-center text-slate-800 dark:text-white focus:outline-none focus:border-purple-600 cursor-pointer"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {isAr ? 'اختيار سريع:' : 'Quick:'}
                </span>
                <button
                  type="button"
                  onClick={() => setDateFromOffset(0)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:text-purple-600 transition-colors"
                >
                  {isAr ? 'اليوم' : 'Today'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateFromOffset(1)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:text-purple-600 transition-colors"
                >
                  {isAr ? 'غداً' : 'Tomorrow'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateFromOffset(3)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:text-purple-600 transition-colors"
                >
                  {isAr ? 'بعد 3 أيام' : '+3 Days'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateFromOffset(7)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:text-purple-600 transition-colors"
                >
                  {isAr ? 'بعد أسبوع' : '+1 Week'}
                </button>
                <button
                  type="button"
                  onClick={() => setDateFromOffset(30)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-purple-500 hover:text-purple-600 transition-colors"
                >
                  {isAr ? 'بعد شهر' : '+1 Month'}
                </button>
              </div>
            </div>
          )}

          {/* Time & Note */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-extrabold text-slate-700 dark:text-slate-300">
                  {isAr ? 'ساعة الموعد' : 'Time'}
                </label>
                <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                  {formatTimeForDisplay(appointmentTime, isAr)}
                </span>
              </div>
              <div className="relative">
                <input
                  type="time"
                  required
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer hover:border-purple-400 focus:outline-none focus:border-purple-600 shadow-2xs"
                />
              </div>
            </div>
            <div>
              <label className="font-extrabold text-slate-700 dark:text-slate-300 block mb-1">
                {isAr ? 'ملاحظة الموعد' : 'Note'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'تحصيل قسط...' : 'Note...'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold focus:outline-none focus:border-purple-600 shadow-2xs"
              />
            </div>
          </div>

          {/* System Rules Notice */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200/80 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
            <div className="flex items-center gap-1.5 font-black">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{isAr ? 'شروط نظام المواعيد والتنظيف الآلي:' : 'System Rules:'}</span>
            </div>
            <p className="pr-4 leading-relaxed font-semibold">
              {isAr
                ? '• الموعد المحدد بتاريخ يُحذف تلقائياً بعد مرور 3 أيام من تاريخه المحدد.'
                : '• Specific date appointments auto-delete 3 days after their date.'}
            </p>
            <p className="pr-4 leading-relaxed font-semibold">
              {isAr
                ? '• الموعد الأسبوعي والشهري دائم ومتكرر ويُحذف تلقائياً فور تسديد الدين بالكامل (وصول المتبقي إلى 0 د.ع).'
                : '• Recurring weekly and monthly appointments auto-delete when remaining debt reaches 0 IQD.'}
            </p>
            <p className="pr-4 leading-relaxed font-semibold">
              {isAr
                ? '• الحذف اليدوي متاح فقط للمدير أو للمندوب الذي قام بإنشاء الموعد.'
                : '• Manual deletion is only allowed for the Admin or the creator.'}
            </p>
          </div>

          </div>

          {/* Sticky Footer Actions - Always visible at bottom */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0 z-10">
            <div>
              {canDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isAr ? 'حذف الموعد' : 'Delete'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold transition-colors cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                {existingAppointment ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'تأكيد وحفظ الموعد' : 'Save Appointment')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
