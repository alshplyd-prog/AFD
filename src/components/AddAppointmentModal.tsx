import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Phone, MapPin, Tag, Check, CalendarClock, Bell, RotateCw, Repeat, ShieldCheck, Sparkles } from 'lucide-react';
import { InstallmentContract, Language, SalesRepresentative, AppointmentRecord, AppointmentType } from '../types';
import { getNextDateForDayOfWeek, getNextDateForDayOfMonth, WEEK_DAYS_AR, WEEK_DAYS_EN, requestExternalNotificationPermission } from '../lib/dateUtils';
import { CircularTimePicker } from './CircularTimePicker';

interface AddAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: InstallmentContract | null;
  currentRep: SalesRepresentative | null;
  lang: Language;
  onSaveAppointment: (appt: AppointmentRecord) => Promise<void> | void;
}

const ARABIC_MONTHS = [
  'كانون الثاني (1)',
  'شباط (2)',
  'آذار (3)',
  'نيسان (4)',
  'أيار (5)',
  'حزيران (6)',
  'تموز (7)',
  'آب (8)',
  'أيلول (9)',
  'تشرين الأول (10)',
  'تشرين الثاني (11)',
  'كانون الأول (12)',
];

export const AddAppointmentModal: React.FC<AddAppointmentModalProps> = ({
  isOpen,
  onClose,
  contract,
  currentRep,
  lang,
  onSaveAppointment,
}) => {
  const isAr = lang === 'ar';

  // Appointment Type: 'recurring_day' (تنبيه أسبوعي - دائمي) | 'recurring_month' (تنبيه شهري - دائمي) | 'date' (تاريخ محدد - يحذف بعد 3 أيام)
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('recurring_day');
  // Day of week for weekly recurring reminder (0 = Sunday, 1 = Monday, 2 = Tuesday...)
  const [selectedRecurringDay, setSelectedRecurringDay] = useState<number>(2); // Default: Tuesday (الثلاثاء)
  // Day of month for monthly recurring reminder (1 to 31)
  const [selectedRecurringDayOfMonth, setSelectedRecurringDayOfMonth] = useState<number>(15); // Default: 15th of the month

  // Date states - strictly initialized to TODAY's current Day, Month, Year
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDate());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Time state - strictly fixed to 10:00 AM (10:00 ص)
  const [hour, setHour] = useState<number>(10);
  const [minute, setMinute] = useState<string>('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  // Note / Purpose
  const [note, setNote] = useState<string>('تحصيل قسط');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showClockPicker, setShowClockPicker] = useState<boolean>(false);

  // Reset to today + upcoming hour every time modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setAppointmentType('recurring_day');
      setSelectedRecurringDay(now.getDay()); // Default to today's day of week
      setSelectedRecurringDayOfMonth(now.getDate());
      setSelectedDay(now.getDate());
      setSelectedMonth(now.getMonth() + 1);
      setSelectedYear(now.getFullYear());
      
      let nextH = now.getHours() + 1;
      if (nextH >= 24) nextH = 0;
      const initialPeriod: 'AM' | 'PM' = nextH >= 12 ? 'PM' : 'AM';
      let displayH = nextH % 12;
      if (displayH === 0) displayH = 12;
      setHour(displayH);
      setMinute('00');
      setPeriod(initialPeriod);
      setNote('تحصيل قسط');
      setIsSubmitting(false);
      setShowClockPicker(false);
    }
  }, [isOpen, contract?.id]);

  if (!isOpen || !contract) return null;

  // Compute formatted YYYY-MM-DD
  const yyyy = String(selectedYear);
  const mm = String(selectedMonth).padStart(2, '0');
  const dd = String(selectedDay).padStart(2, '0');
  const formattedDateStr = `${yyyy}-${mm}-${dd}`;

  // Formatted Time: e.g. "10:00 ص" or "10:00 AM"
  const formattedTimeStr = `${hour}:${minute} ${period === 'AM' ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM')}`;

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const parts = val.split('-');
    if (parts.length === 3) {
      setSelectedYear(parseInt(parts[0], 10));
      setSelectedMonth(parseInt(parts[1], 10));
      setSelectedDay(parseInt(parts[2], 10));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const weekDays = isAr ? WEEK_DAYS_AR : WEEK_DAYS_EN;
      const dayObj = weekDays.find((w) => w.day === selectedRecurringDay);

      let targetDate = formattedDateStr;
      let finalType: AppointmentType = 'specific_date';

      if (appointmentType === 'recurring_day') {
        targetDate = getNextDateForDayOfWeek(selectedRecurringDay);
        finalType = 'weekly';
      } else if (appointmentType === 'recurring_month') {
        targetDate = getNextDateForDayOfMonth(selectedRecurringDayOfMonth);
        finalType = 'monthly';
      } else {
        finalType = 'specific_date';
      }

      const newAppt: AppointmentRecord = {
        id: `appt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        contractId: contract.id,
        customerName: contract.customerName,
        customerPhone: contract.customerPhone || '',
        customerAddress: contract.customerAddress || '',
        listId: contract.listId || '',
        listName: contract.listName || (isAr ? 'عامة' : 'General'),
        appointmentType: finalType,
        recurringDay: appointmentType === 'recurring_day' ? selectedRecurringDay : undefined,
        dayOfWeek: appointmentType === 'recurring_day' ? selectedRecurringDay : undefined,
        recurringDayName: appointmentType === 'recurring_day' ? (dayObj?.label || 'كل ثلاثاء') : undefined,
        recurringDayOfMonth: appointmentType === 'recurring_month' ? selectedRecurringDayOfMonth : undefined,
        dayOfMonth: appointmentType === 'recurring_month' ? selectedRecurringDayOfMonth : undefined,
        recurringMonthDayName: appointmentType === 'recurring_month' ? (isAr ? `يوم ${selectedRecurringDayOfMonth} من كل شهر` : `Day ${selectedRecurringDayOfMonth} of every month`) : undefined,
        appointmentDate: targetDate,
        dueDate: targetDate,
        appointmentTime: formattedTimeStr,
        dueTime: formattedTimeStr,
        note: note.trim(),
        notes: note.trim(),
        title: isAr ? `موعد ${contract.customerName}` : `Appointment ${contract.customerName}`,
        status: 'pending',
        createdByName: currentRep?.name || (isAr ? 'المدير' : 'Admin'),
        createdByRepName: currentRep?.name || (isAr ? 'المدير' : 'Admin'),
        createdByRepId: currentRep?.id || 'admin',
        createdAt: new Date().toISOString(),
      };

      // Request external notification permission if not yet decided
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        requestExternalNotificationPermission().catch(() => {});
      }

      await onSaveAppointment(newAppt);
      onClose();
    } catch (err) {
      console.error('Failed to create appointment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[96vh] text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="py-2.5 px-3.5 bg-gradient-to-r from-purple-700 to-indigo-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/15 rounded-lg shadow-2xs">
              <CalendarClock className="w-4 h-4 text-purple-200" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-white leading-tight">
                {isAr ? 'إضافة موعد لزبون' : 'Schedule Appointment'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body (Compact & fits on screen) */}
        <form id="add-appointment-form" onSubmit={handleSubmit} className="p-3 space-y-2.5 overflow-y-auto flex-1">
          {/* Customer Summary (Compact Single Bar) */}
          <div className="px-3 py-1.5 bg-purple-50/70 dark:bg-purple-950/30 rounded-xl border border-purple-200/80 dark:border-purple-800/60 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 font-black text-slate-900 dark:text-slate-100 truncate">
              <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="truncate">{contract.customerName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 shrink-0">
              <span className="px-1.5 py-0.5 rounded-md bg-purple-200/70 dark:bg-purple-900 text-purple-900 dark:text-purple-200">
                {contract.listName || (isAr ? 'عامة' : 'General')}
              </span>
              {contract.customerPhone && (
                <span className="font-mono dir-ltr text-slate-700 dark:text-slate-300">
                  {contract.customerPhone}
                </span>
              )}
            </div>
          </div>

          {/* Mode Switcher: أسبوعي | شهري | مخصص (Compact Tabs without explanation) */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl">
            {/* Option 1: أسبوعي */}
            <button
              type="button"
              onClick={() => setAppointmentType('recurring_day')}
              className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                appointmentType === 'recurring_day'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>{isAr ? 'أسبوعي' : 'Weekly'}</span>
            </button>

            {/* Option 2: شهري */}
            <button
              type="button"
              onClick={() => setAppointmentType('recurring_month')}
              className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                appointmentType === 'recurring_month'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>{isAr ? 'شهري' : 'Monthly'}</span>
            </button>

            {/* Option 3: مخصص */}
            <button
              type="button"
              onClick={() => setAppointmentType('date')}
              className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                appointmentType === 'date' || appointmentType === 'specific_date'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{isAr ? 'مخصص' : 'Custom'}</span>
            </button>
          </div>

          {/* Dynamic Content based on selected mode */}
          {appointmentType === 'recurring_day' ? (
            /* Recurring Day of the Week: 7 Compact Pills */
            <div className="p-2 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-200/80 dark:border-purple-800/60">
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1">
                {[
                  { day: 6, label: isAr ? 'السبت' : 'Sat' },
                  { day: 0, label: isAr ? 'الأحد' : 'Sun' },
                  { day: 1, label: isAr ? 'الاثنين' : 'Mon' },
                  { day: 2, label: isAr ? 'الثلاثاء' : 'Tue' },
                  { day: 3, label: isAr ? 'الأربعاء' : 'Wed' },
                  { day: 4, label: isAr ? 'الخميس' : 'Thu' },
                  { day: 5, label: isAr ? 'الجمعة' : 'Fri' },
                ].map((item) => (
                  <button
                    key={item.day}
                    type="button"
                    onClick={() => setSelectedRecurringDay(item.day)}
                    className={`py-1.5 px-1 rounded-lg text-center font-black text-xs transition-all cursor-pointer ${
                      selectedRecurringDay === item.day
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-purple-100/50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : appointmentType === 'recurring_month' ? (
            /* Recurring Day of Month: Compact 1-31 Grid */
            <div className="p-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60">
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => setSelectedRecurringDayOfMonth(dayNum)}
                    className={`py-1 rounded-md text-center font-black text-xs transition-all cursor-pointer ${
                      selectedRecurringDayOfMonth === dayNum
                        ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                        : 'bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:bg-indigo-100/70'
                    }`}
                  >
                    {dayNum}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Custom Specific Date: 3 Compact Selectors */
            <div className="p-2 bg-teal-50/50 dark:bg-teal-950/20 rounded-xl border border-teal-200/80 dark:border-teal-800/60 space-y-1">
              <div className="grid grid-cols-3 gap-1.5">
                {/* Day */}
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-black text-center focus:border-teal-500 focus:outline-none"
                >
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {isAr ? `يوم ${d}` : `Day ${d}`}
                    </option>
                  ))}
                </select>

                {/* Month */}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="w-full px-1 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-black text-center focus:border-teal-500 focus:outline-none truncate"
                >
                  {ARABIC_MONTHS.map((mName, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {mName}
                    </option>
                  ))}
                </select>

                {/* Year */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-black text-center focus:border-teal-500 focus:outline-none"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1, selectedYear + 2].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Time & Clock Row (Ultra Compact) */}
          <div
            onClick={() => setShowClockPicker(true)}
            className="p-2 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 rounded-xl border border-purple-200 dark:border-purple-800 flex items-center justify-between cursor-pointer hover:border-purple-400 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-600 text-white">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                  {isAr ? 'توقيت الموعد:' : 'Time:'}
                </span>
                <span className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                  {hour}:{minute}
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-purple-600 text-white">
                  {period === 'AM' ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM')}
                </span>
              </div>
            </div>

            <span className="text-[11px] font-black text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-800 border border-purple-200 dark:border-purple-700">
              {isAr ? 'تعديل الساعة' : 'Change'}
            </span>
          </div>

          {/* Purpose / Note (Compact) */}
          <div className="space-y-1">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isAr ? 'تحصيل قسط' : 'Purpose...'}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-bold focus:border-purple-500 focus:outline-none shadow-2xs"
            />
          </div>
        </form>

        {/* Compact Footer */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="submit"
            form="add-appointment-form"
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSubmitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الموعد' : 'Save')}</span>
          </button>
        </div>
      </div>

      {/* Pop-up Modal for Circular Clock (تظهر عند الضغط على الساعة حتى لا تطول القائمة) */}
      {showClockPicker && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150"
          onClick={() => setShowClockPicker(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full space-y-3 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-600">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                  {isAr ? 'تحديد توقيت الموعد' : 'Select Time'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClockPicker(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Circular Clock Component */}
            <CircularTimePicker
              hour={hour}
              minute={minute}
              period={period}
              isAr={isAr}
              onHourChange={setHour}
              onMinuteChange={setMinute}
              onPeriodChange={setPeriod}
              onConfirm={() => setShowClockPicker(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
