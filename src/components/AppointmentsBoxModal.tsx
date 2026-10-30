import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CalendarDays,
  CalendarRange,
  Search,
  Filter,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Bell,
  X,
  Phone,
  User,
  Plus,
  ArrowUpDown,
  RefreshCw,
  FolderKanban,
  Check,
  ChevronRight,
  ShieldCheck,
  MapPin,
  Sparkles,
  Edit2
} from 'lucide-react';
import { Appointment, CustomerList, Language, SalesRepresentative, InstallmentContract } from '../types';
import { getLocalDateString, isAppointmentDueForNotification } from '../lib/dateUtils';

interface AppointmentsBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  customerLists: CustomerList[];
  contracts: InstallmentContract[];
  currentRep: SalesRepresentative | null;
  isAdmin: boolean;
  lang: Language;
  onDeleteAppointment: (id: string) => Promise<void> | void;
  onUpdateAppointment: (id: string, updates: Partial<Appointment>) => Promise<void> | void;
  onOpenAddModal: () => void;
  onSelectCustomer?: (contract: InstallmentContract) => void;
}

export const AppointmentsBoxModal: React.FC<AppointmentsBoxModalProps> = ({
  isOpen,
  onClose,
  appointments = [],
  customerLists = [],
  contracts = [],
  currentRep,
  isAdmin,
  lang,
  onDeleteAppointment,
  onUpdateAppointment,
  onOpenAddModal,
  onSelectCustomer,
}) => {
  const isAr = lang === 'ar';
  const todayStr = getLocalDateString();

  const [activeTab, setActiveTab] = useState<'all' | 'due' | 'upcoming' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter allowed appointments based strictly on user list access permissions
  const accessibleAppointments = appointments.filter((app) => {
    if (isAdmin) return true;
    if (!currentRep) return true;
    if (currentRep.role === 'admin' || currentRep.role === 'supervisor') return true;
    if (currentRep.allowedListIds && currentRep.allowedListIds.includes('all')) return true;
    
    // Strict restriction: representative must have explicit access to this appointment's list
    const matchedContract = contracts.find((c) => c.id === app.contractId || (app.customerName && c.customerName.trim().toLowerCase() === app.customerName.trim().toLowerCase()));
    const effectiveListId = app.listId || matchedContract?.listId;
    if (!effectiveListId) {
      if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0 || currentRep.allowedListIds.includes('all')) return true;
      if (app.createdByRepId === currentRep.id || (app.createdByRepName && currentRep.name && app.createdByRepName.trim().toLowerCase() === currentRep.name.trim().toLowerCase())) return true;
      return true;
    }
    if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0) return false;
    return currentRep.allowedListIds.includes(effectiveListId);
  });

  // Calculate due status for each appointment (at its exact scheduled time only)
  const isAppointmentDue = (app: Appointment) => {
    return isAppointmentDueForNotification(app, contracts, new Date());
  };

  // Filtered list
  const filteredAppointments = accessibleAppointments.filter((app) => {
    const isDue = isAppointmentDue(app);

    // Tab filter
    if (activeTab === 'due' && !isDue) return false;
    if (activeTab === 'upcoming' && (isDue || app.status === 'completed')) return false;
    if (activeTab === 'completed' && app.status !== 'completed') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (app.customerName || '').toLowerCase().includes(q);
      const matchPhone = (app.customerPhone || '').includes(q);
      const matchTitle = (app.title || '').toLowerCase().includes(q);
      const matchNotes = (app.note || app.notes || '').toLowerCase().includes(q);
      const matchRep = (app.createdByName || app.createdByRepName || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchTitle && !matchNotes && !matchRep) {
        return false;
      }
    }

    return true;
  });

  // Count stats
  const dueCount = accessibleAppointments.filter(isAppointmentDue).length;
  const upcomingCount = accessibleAppointments.filter((a) => !isAppointmentDue(a) && a.status !== 'completed').length;
  const completedCount = accessibleAppointments.filter((a) => a.status === 'completed').length;

  // Permission helper: Manager/Admin OR Creator can delete
  const canDeleteAppointment = (app: Appointment) => {
    if (isAdmin) return true;
    if (!currentRep) return true; // Standard admin view without specific rep selected
    if (currentRep.role === 'admin') return true;
    if (app.createdByRepId && app.createdByRepId === currentRep.id) {
      return true;
    }
    if (app.createdByName && app.createdByName.trim().toLowerCase() === currentRep.name.trim().toLowerCase()) return true;
    if (app.createdByRepName && app.createdByRepName.trim().toLowerCase() === currentRep.name.trim().toLowerCase()) return true;
    return false;
  };

  const handleToggleComplete = async (app: Appointment) => {
    if (app.status === 'completed') {
      await onUpdateAppointment(app.id, { status: 'pending' });
    } else {
      if (app.appointmentType === 'specific_date') {
        await onUpdateAppointment(app.id, { status: 'completed' });
      } else if (app.appointmentType === 'weekly' || app.appointmentType === 'recurring_day') {
        // Compute next week's date
        const curDate = new Date(app.appointmentDate || app.dueDate || todayStr);
        curDate.setDate(curDate.getDate() + 7);
        await onUpdateAppointment(app.id, {
          appointmentDate: curDate.toISOString().split('T')[0],
          dueDate: curDate.toISOString().split('T')[0],
          lastNotifiedAt: new Date().toISOString()
        });
      } else if (app.appointmentType === 'monthly' || app.appointmentType === 'recurring_month') {
        // Compute next month's date
        const curDate = new Date(app.appointmentDate || app.dueDate || todayStr);
        curDate.setMonth(curDate.getMonth() + 1);
        await onUpdateAppointment(app.id, {
          appointmentDate: curDate.toISOString().split('T')[0],
          dueDate: curDate.toISOString().split('T')[0],
          lastNotifiedAt: new Date().toISOString()
        });
      }
    }
  };

  const handleDelete = async (app: Appointment) => {
    if (!canDeleteAppointment(app)) return;
    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف موعد الزبون (${app.customerName})؟`
      : `Are you sure you want to delete appointment for ${app.customerName}?`;
    if (!confirm(confirmMsg)) return;

    setDeletingId(app.id);
    try {
      await onDeleteAppointment(app.id);
    } finally {
      setDeletingId(null);
    }
  };

  const getDayOfWeekName = (day?: number) => {
    const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return day != null && day >= 0 && day <= 6 ? names[day] : '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-150 dir-rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[96vh] animate-in zoom-in-95 duration-150 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Filter and Search Bar at the very top */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800/80 space-y-3">
          {/* Top Row: Tabs + Close Button */}
          <div className="flex items-center justify-between gap-2">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none flex-1">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {isAr ? 'جميع المواعيد' : 'All'} ({accessibleAppointments.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('due')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'due'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isAr ? 'المستحقة الآن' : 'Due Now'}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-[10px]">
                  {dueCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('upcoming')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'upcoming'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{isAr ? 'القادمة' : 'Upcoming'}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-teal-500/20 text-[10px]">
                  {upcomingCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('completed')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'completed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'المكتملة' : 'Completed'}</span>
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-[10px]">
                  {completedCount}
                </span>
              </button>
            </div>

            {/* Quick Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث عن زبون، موعد، هاتف...' : 'Search appointments...'}
              className="w-full pr-9 pl-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Appointments List Body */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
          {filteredAppointments.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <Calendar className="w-7 h-7" />
              </div>
              <p className="text-sm font-black text-slate-600 dark:text-slate-400">
                {isAr ? 'لا توجد مواعيد مسجلة تطابق البحث' : 'No appointments found'}
              </p>
            </div>
          ) : (
            filteredAppointments.map((app) => {
              const isDue = isAppointmentDue(app);
              const isCompleted = app.status === 'completed';
              const canDelete = canDeleteAppointment(app);
              const matchedContract = contracts.find(
                (c) => c.id === app.contractId || c.customerName === app.customerName
              );

              return (
                <div
                  key={app.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all space-y-2.5 ${
                    isCompleted
                      ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70'
                      : isDue
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/80 shadow-xs'
                      : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700'
                  }`}
                >
                  {/* Top Bar: Badges & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Recurrence Type Badge */}
                      {(() => {
                        const isWeekly = app.appointmentType === 'weekly' || app.appointmentType === 'recurring_day';
                        const isMonthly = app.appointmentType === 'monthly' || app.appointmentType === 'recurring_month';
                        const isSpecific = !isWeekly && !isMonthly;
                        const dayOfMonthVal = app.recurringDayOfMonth ?? app.dayOfMonth ?? (app.dueDate ? parseInt(app.dueDate.split('-')[2] || '1', 10) : 1);
                        const dayOfWeekVal = app.recurringDay ?? app.dayOfWeek ?? (app.dueDate ? new Date(app.dueDate).getDay() : 0);

                        return (
                          <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center gap-1">
                            {isSpecific && <Calendar className="w-3 h-3" />}
                            {isWeekly && <CalendarRange className="w-3 h-3" />}
                            {isMonthly && <Clock className="w-3 h-3" />}
                            <span>
                              {isSpecific
                                ? (isAr ? 'تاريخ محدد' : 'Specific Date')
                                : isWeekly
                                ? `${isAr ? 'أسبوعي' : 'Weekly'} (${getDayOfWeekName(dayOfWeekVal)})`
                                : `${isAr ? 'شهري' : 'Monthly'} (يوم ${dayOfMonthVal})`}
                            </span>
                          </span>
                        );
                      })()}

                      {/* List Badge */}
                      {app.listName && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                          {app.listName}
                        </span>
                      )}

                      {/* Due Alert Badge */}
                      {isDue && !isCompleted && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-rose-500 text-white animate-pulse flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{isAr ? 'حان الموعد!' : 'Due Now!'}</span>
                        </span>
                      )}

                      {/* Completed Badge */}
                      {isCompleted && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {isAr ? 'مكتمل' : 'Completed'}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {/* Mark Complete Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(app)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        }`}
                        title={isAr ? 'تحديد كمكتمل / تجديد الدورة القادمة' : 'Toggle Completed'}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isCompleted ? (isAr ? 'منجز' : 'Done') : (isAr ? 'تم الإنجاز' : 'Mark Done')}</span>
                      </button>

                      {/* Quick Call Button */}
                      {app.customerPhone && (
                        <a
                          href={`tel:${app.customerPhone}`}
                          className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-100 hover:text-emerald-700 transition-colors"
                          title={isAr ? 'اتصال بالزبون' : 'Call Customer'}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* Delete Button (Only for Admin or Creator) */}
                      {canDelete ? (
                        <button
                          type="button"
                          disabled={deletingId === app.id}
                          onClick={() => handleDelete(app)}
                          className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                          title={isAr ? 'حذف هذا الموعد' : 'Delete Appointment'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span
                          className="p-1.5 rounded-xl text-slate-300 dark:text-slate-600 cursor-not-allowed"
                          title={isAr ? 'الحذف متاح للمدير أو لمن أضاف الموعد فقط' : 'Only Admin or Creator can delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5 opacity-40" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Customer and Title Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {app.customerName}
                        </h3>
                      </div>

                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300 pr-6">
                        {app.title}
                      </p>
                    </div>

                    {/* Due Date & Time */}
                    <div className="text-left font-mono font-bold text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-3 py-1.5 rounded-xl shrink-0">
                      <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{app.dueDate}</span>
                      </div>
                      {app.dueTime && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{app.dueTime}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes & Creator details */}
                  {(app.notes || app.createdByRepName) && (
                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      {app.notes ? (
                        <p className="italic max-w-[70%] truncate">
                          💬 {app.notes}
                        </p>
                      ) : <div />}
                      {app.createdByRepName && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          {isAr ? 'بواسطة: ' : 'By: '}
                          <span className="text-slate-600 dark:text-slate-300">{app.createdByRepName}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isAr
              ? `إجمالي المواعيد: ${accessibleAppointments.length} | المستحقة: ${dueCount}`
              : `Total: ${accessibleAppointments.length} | Due: ${dueCount}`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black hover:opacity-90 transition-opacity"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
