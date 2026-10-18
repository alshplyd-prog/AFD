import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  Receipt,
  Wifi,
  WifiOff,
  History,
  Users,
  UserPlus,
  Boxes,
  ChevronDown,
  ArrowRight,
  Download,
  Upload,
  Globe,
  LogOut,
  Shield,
  User,
  Smartphone,
  FolderKanban,
  Printer,
  Bell,
  CheckCheck,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ShieldAlert,
  Edit2,
  RefreshCw,
  Database,
  Cloud,
  ShieldCheck,
  Sparkles,
  Camera,
  Image as ImageIcon,
  Check,
  Lock,
  Zap,
  Layers,
  ListFilter,
  CalendarClock,
  BellRing
} from 'lucide-react';
import { Language, InstallmentContract, PaymentRecord, ActiveTab, SalesRepresentative, CustomerList, Employee, EmployeeTransaction, PaymentConflictRecord, AppointmentRecord } from '../types';
import { DEFAULT_REPS } from '../data/initialContracts';
import { reconcileAllLocalWithDatabase } from '../lib/postgresClient';
import { requestAllBackgroundAndSyncPermissions } from '../lib/offlineQueue';
import { isAppointmentDueForNotification, requestExternalNotificationPermission, showBrowserNotification } from '../lib/dateUtils';

interface AppNotificationItem {
  id: string;
  type: 'sale' | 'payment' | 'rep_debt' | 'rep_repay' | 'conflict_pending' | 'conflict_resolved_rep' | 'conflict_resolved_team' | 'excess_payment' | 'appointment_due';
  title: string;
  message: string;
  timestamp: string;
  dateObj: Date;
  customerName?: string;
  contractId?: string;
  repName?: string;
  amount?: number;
  listName?: string;
  conflictId?: string;
  paymentRecord?: PaymentRecord;
  contractRecord?: InstallmentContract;
  neededAmount?: number;
  expectedTotal?: number;
  totalPaidPayments?: number;
}

interface HeaderAndStatsProps {
  currentRep: SalesRepresentative | null;
  reps?: SalesRepresentative[];
  onSelectRep?: (rep: SalesRepresentative) => void;
  onLogoutRep: () => void;
  onOpenRepsModal?: () => void;
  onOpenStatementModal?: () => void;
  onOpenPrinterSettings?: () => void;
  onOpenOfflineConflictsModal?: () => void;
  paymentConflicts?: PaymentConflictRecord[];
  onRejectConflict?: (conflict: PaymentConflictRecord) => void;
  onUpdateRep?: (id: string, updates: Partial<SalesRepresentative>) => Promise<void>;
  onViewSplash?: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  contracts: InstallmentContract[];
  payments: PaymentRecord[];
  employees?: Employee[];
  employeeTransactions?: EmployeeTransaction[];
  customerLists?: CustomerList[];
  selectedListId?: string;
  onSelectListId?: (id: string) => void;
  inventoryCount: number;
  lang: Language;
  onToggleLang: () => void;
  onOpenAddModal: () => void;
  onOpenInventoryModal?: () => void;
  isSyncing: boolean;
  syncError: boolean;
  pendingCount?: number;
  onManualSync?: () => void;
  onOpenBackgroundSync?: () => void;
  onOpenPaymentsHistoryWithFilter?: (customerName: string) => void;
  onSettleExcessPayment?: (contractId: string, customerName?: string) => Promise<void> | void;
  onUpdatePayment?: (payment: PaymentRecord, newAmount: number, note?: string) => Promise<void> | void;
  onDeletePayment?: (payment: PaymentRecord) => Promise<void> | void;
  displayedContractsCount?: number;
  onOpenServerQueries?: () => void;
  appointments?: AppointmentRecord[];
  onOpenAppointmentsBox?: () => void;
}

const RepAvatarDisplay: React.FC<{ name: string; avatarUrl?: string; role?: string; size?: string }> = ({
  name,
  avatarUrl,
  role,
  size = 'w-7 h-7'
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${size} rounded-full object-cover border-2 border-indigo-500 shadow-2xs shrink-0 group-hover:scale-105 transition-transform`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-xs font-black text-white shadow-2xs shrink-0 group-hover:scale-105 transition-transform ${
        role === 'admin'
          ? 'bg-amber-500'
          : role === 'supervisor'
          ? 'bg-purple-600'
          : 'bg-sky-500'
      }`}
    >
      {name ? name.trim().charAt(0) : <User className="w-3.5 h-3.5" />}
    </div>
  );
};

export const HeaderAndStats: React.FC<HeaderAndStatsProps> = ({
  currentRep,
  reps = [],
  onLogoutRep,
  onOpenRepsModal,
  onOpenStatementModal,
  customerLists = [],
  selectedListId = 'all',
  onSelectListId,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  inventoryCount,
  lang,
  onToggleLang,
  onOpenAddModal,
  onOpenPrinterSettings,
  onOpenOfflineConflictsModal,
  paymentConflicts = [],
  onRejectConflict,
  isSyncing,
  syncError,
  pendingCount = 0,
  onManualSync,
  onOpenBackgroundSync,
  onOpenPaymentsHistoryWithFilter,
  onSettleExcessPayment,
  onOpenServerQueries,
  contracts = [],
  payments = [],
  employees = [],
  employeeTransactions = [],
  onUpdateRep,
  onViewSplash,
  onUpdatePayment,
  onDeletePayment,
  displayedContractsCount,
  appointments = [],
  onOpenAppointmentsBox,
}) => {
  const isAr = lang === 'ar';

  const storageKey = `sami_app_read_notifs_${currentRep?.id || 'admin'}`;

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);
  const listDropdownRef = useRef<HTMLDivElement>(null);
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (listDropdownRef.current && !listDropdownRef.current.contains(event.target as Node)) {
        setIsListDropdownOpen(false);
      }
    };
    if (isListDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isListDropdownOpen]);

  // External Device Notification Permission & Testing state
  const [isExternalNotifGranted, setIsExternalNotifGranted] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsExternalNotifGranted(Notification.permission === 'granted');
    }
  }, [isNotificationsOpen]);

  const handleEnableExternalNotifications = async () => {
    const granted = await requestExternalNotificationPermission();
    setIsExternalNotifGranted(granted);
    if (granted) {
      await showBrowserNotification(
        isAr ? 'الكرار للتقسيط' : 'Al-Karrar Installments',
        isAr
          ? 'تم تفعيل الإشعارات الخارجية على جهازك بنجاح! ستصلك تنبيهات الأقساط والتسديدات.'
          : 'External device notifications enabled successfully!'
      );
    }
  };

  const handleTestExternalNotification = async () => {
    await showBrowserNotification(
      isAr ? '🔔 إشعار خارجي تجريبي' : '🔔 Test External Notification',
      isAr
        ? 'تم استلام الإشعار الخارجي على شاشة جهازك بنجاح! نظام الإشعارات نشط ومستعد.'
        : 'External device notification received successfully!'
    );
  };

  // Dedicated Quick Edit for Excess Payment from Notification
  const [quickExcessEdit, setQuickExcessEdit] = useState<{
    notifId: string;
    contract: InstallmentContract;
    payment: PaymentRecord;
    excessAmount: number;
    neededToZero: number;
    newAmount: string;
    note: string;
  } | null>(null);
  const [isSavingExcessEdit, setIsSavingExcessEdit] = useState(false);

  // Dedicated My Profile Photo Modal state & handlers (Isolated from Reps Box)
  const [isMyPhotoModalOpen, setIsMyPhotoModalOpen] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Compress image file to compact data URL
  const compressImage = (file: File, maxSize = 240, quality = 0.82): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image decode error'));
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleDirectUploadPhoto = async (file: File) => {
    if (!currentRep || !onUpdateRep) return;
    try {
      setIsProcessingPhoto(true);
      setPhotoFeedback(null);
      const dataUrl = await compressImage(file);
      await onUpdateRep(currentRep.id, { avatarUrl: dataUrl });
      setPhotoFeedback({
        type: 'success',
        message: isAr ? 'تم تحديث صورتك الشخصية بنجاح' : 'Profile photo updated successfully',
      });
      setTimeout(() => {
        setPhotoFeedback(null);
        setIsMyPhotoModalOpen(false);
      }, 1400);
    } catch (err) {
      setPhotoFeedback({
        type: 'error',
        message: isAr ? 'فشل معالجة أو حفظ الصورة' : 'Failed to process photo',
      });
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentRep || !onUpdateRep) return;
    try {
      setIsProcessingPhoto(true);
      setPhotoFeedback(null);
      await onUpdateRep(currentRep.id, { avatarUrl: '' });
      setPhotoFeedback({
        type: 'success',
        message: isAr ? 'تمت إزالة الصورة الشخصية' : 'Photo removed',
      });
      setTimeout(() => {
        setPhotoFeedback(null);
        setIsMyPhotoModalOpen(false);
      }, 1400);
    } catch (err) {
      setPhotoFeedback({
        type: 'error',
        message: isAr ? 'فشل إزالة الصورة' : 'Failed to remove photo',
      });
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setReadNotifIds(saved ? JSON.parse(saved) : []);
    } catch (e) {
      setReadNotifIds([]);
    }
  }, [storageKey]);

  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationsOpen]);

  const saveReadNotifs = (ids: string[]) => {
    setReadNotifIds(ids);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch (e) {
      // ignore
    }
  };

  const isAdmin = !currentRep || currentRep.role === 'admin';
  const isSupervisorOrAdmin = !currentRep || currentRep.role === 'admin' || currentRep.role === 'supervisor';

  const notifications: AppNotificationItem[] = useMemo(() => {
    const listMap = new Map(customerLists.map((l) => [l.id, l.name]));
    const items: AppNotificationItem[] = [];

    const isAddedByMe = (creatorName?: string) => {
      const cleanCreator = (creatorName || '').trim().toLowerCase();
      const isAdminCreator =
        !cleanCreator ||
        cleanCreator === 'admin' ||
        cleanCreator === 'مدير' ||
        cleanCreator === 'المسؤول' ||
        cleanCreator === 'مدير النظام';

      if (!currentRep || currentRep.role === 'admin') {
        if (isAdminCreator) return true;
        if (currentRep && cleanCreator === currentRep.name.trim().toLowerCase()) return true;
        return false;
      }

      if (cleanCreator === currentRep.name.trim().toLowerCase()) {
        return true;
      }
      return false;
    };

    // 1. New sales alerts: shown to everyone who has access to the customer list
    contracts.forEach((c) => {
      const hasAccess =
        isSupervisorOrAdmin ||
        !currentRep?.allowedListIds ||
        currentRep.allowedListIds.includes('all') ||
        (c.listId && currentRep.allowedListIds.includes(c.listId));

      const displayRepName =
        c.repName === 'سيد نزار' || c.customerName?.includes('محمد خالد')
          ? 'ضياء المحاسب'
          : c.repName || (isAr ? 'المسؤول' : 'Admin');

      if (hasAccess) {
        const listName = c.listName || (c.listId ? listMap.get(c.listId) : '') || (isAr ? 'عامة' : 'General');
        items.push({
          id: `sale-${c.id}`,
          type: 'sale',
          title: isAr ? 'إشعار مبيع جديد' : 'New Sale Added',
          message: isAr
            ? `تم إضافة مبيع للزبون "${c.customerName}" في قائمة (${listName}) بمبلغ ${Number(c.totalPrice || 0).toLocaleString('en-US')} د.ع بواسطة ${displayRepName}`
            : `New sale added for "${c.customerName}" in list (${listName}) of ${Number(c.totalPrice || 0).toLocaleString('en-US')} IQD by ${displayRepName}`,
          timestamp: c.createdAt || new Date().toISOString(),
          dateObj: new Date(c.createdAt || Date.now()),
          customerName: c.customerName,
          repName: displayRepName,
          amount: c.totalPrice,
          listName,
        });
      }
    });

    // 2. Alert for employee debt (loan) or return debt (repay):
    // ONLY show to the representative himself (or to general admin view when no rep is selected)
    const empMap = new Map(employees.map((e) => [e.id, e]));
    employeeTransactions.forEach((tx) => {
      const displayTxRepName =
        tx.repName === 'سيد نزار'
          ? 'ضياء المحاسب'
          : tx.repName || (isAr ? 'المسؤول' : 'Admin');

      const emp = empMap.get(tx.employeeId);
      const empName = emp?.name || (isAr ? 'مندوب / موظف' : 'Employee');

      const isMyEmployeeRecord =
        Boolean(currentRep) &&
        (tx.employeeId === currentRep?.id ||
          emp?.id === currentRep?.id ||
          emp?.repId === currentRep?.id ||
          (Boolean(emp?.name) &&
            emp?.name.trim().toLowerCase() === currentRep?.name.trim().toLowerCase()));

      // "بالنسبة للديون والراجع بس للمنندوب نفسه"
      const shouldShowDebtOrRepay = currentRep ? isMyEmployeeRecord : true;

      if (shouldShowDebtOrRepay) {
        const isLoan = tx.type === 'loan';
        items.push({
          id: `rep-tx-${tx.id}`,
          type: isLoan ? 'rep_debt' : 'rep_repay',
          title: isLoan
            ? (isAr ? 'إشعار سلفة / دين جديد' : 'New Debt / Loan Alert')
            : (isAr ? 'إشعار سداد / راجع دين' : 'Debt Return / Repay Alert'),
          message: isLoan
            ? (isAr
              ? `تم تسجيل دين (سلفة) على المندوب/الموظف "${empName}" بمبلغ ${Number(tx.amount || 0).toLocaleString('en-US')} د.ع بواسطة ${displayTxRepName} ${tx.notes || tx.note ? `(${tx.notes || tx.note})` : ''}`
              : `Debt (Loan) of ${Number(tx.amount || 0).toLocaleString('en-US')} IQD recorded for "${empName}" by ${displayTxRepName} ${tx.notes || tx.note ? `(${tx.notes || tx.note})` : ''}`)
            : (isAr
              ? `تم استلام راجع دين (سداد) من المندوب/الموظف "${empName}" بمبلغ ${Number(tx.amount || 0).toLocaleString('en-US')} د.ع بواسطة ${displayTxRepName} ${tx.notes || tx.note ? `(${tx.notes || tx.note})` : ''}`
              : `Debt return of ${Number(tx.amount || 0).toLocaleString('en-US')} IQD received from "${empName}" by ${displayTxRepName} ${tx.notes || tx.note ? `(${tx.notes || tx.note})` : ''}`),
          timestamp: tx.createdAt || new Date().toISOString(),
          dateObj: new Date(tx.createdAt || Date.now()),
          repName: empName,
          amount: tx.amount,
        });
      }
    });

    // 3. Payment Conflicts Alerts: shown to everyone opening the list ("والباقي لكل واحد فاتح القائمه")
    paymentConflicts.forEach((conflict) => {
      const targetContract = contracts.find(
        (con) => con.id === conflict.contractId || con.customerName === conflict.customerName
      );
      const hasConflictAccess =
        isSupervisorOrAdmin ||
        !currentRep?.allowedListIds ||
        currentRep.allowedListIds.includes('all') ||
        (targetContract?.listId && currentRep.allowedListIds.includes(targetContract.listId));

      if (!hasConflictAccess) return;

      const dateVal = conflict.resolvedAt || conflict.createdAt || new Date().toISOString();
      const dateObj = new Date(dateVal);

      if (conflict.status === 'pending_review') {
        items.push({
          id: `conflict-pending-${conflict.id}`,
          type: 'conflict_pending',
          title: isAr ? 'تنبيه: دفعة معلقة وتحت المراجعة' : 'Alert: Pending Offline Payment Conflict',
          message: isAr
            ? `تم استقبال تسديد من المندوب "${conflict.repName}" للزبون "${conflict.customerName}" بمبلغ (${Number(conflict.attemptedAmount).toLocaleString('en-US')} د.ع) يتجاوز باقي الدين الحقيقي (${Number(conflict.actualRemainingBalance).toLocaleString('en-US')} د.ع). يرجى المراجعة والتصفية.`
            : `Payment of ${Number(conflict.attemptedAmount).toLocaleString('en-US')} IQD from rep "${conflict.repName}" for "${conflict.customerName}" exceeds actual remaining balance (${Number(conflict.actualRemainingBalance).toLocaleString('en-US')} IQD).`,
          timestamp: dateVal,
          dateObj: isNaN(dateObj.getTime()) ? new Date() : dateObj,
          repName: conflict.repName,
          amount: conflict.attemptedAmount,
          conflictId: conflict.id,
        });
      } else if (conflict.status === 'resolved') {
        const acceptedAmt = typeof conflict.acceptedAmount === 'number' ? conflict.acceptedAmount : conflict.actualRemainingBalance;
        const excessAmt = typeof conflict.excessAmount === 'number' ? conflict.excessAmount : Math.max(0, conflict.attemptedAmount - acceptedAmt);
        items.push({
          id: `conflict-res-team-${conflict.id}`,
          type: 'conflict_resolved_team',
          title: isAr ? 'إشعار تسوية: تم تصفير الحساب وتحديد حوزة المندوب' : 'Settlement Notice: Account Settled & Rep Custody Defined',
          message: conflict.note
            ? conflict.note
            : (isAr
                ? `تم تسوية حساب الزبون "${conflict.customerName}" وتصفير الحساب بنجاح. المبلغ الفائض في حوزة المندوب "${conflict.repName}": (${Number(excessAmt).toLocaleString('en-US')} د.ع).`
                : `Customer "${conflict.customerName}" account settled. Excess amount in custody of rep "${conflict.repName}": (${Number(excessAmt).toLocaleString('en-US')} IQD).`),
          timestamp: dateVal,
          dateObj: isNaN(dateObj.getTime()) ? new Date() : dateObj,
          repName: conflict.repName,
          amount: acceptedAmt,
          conflictId: conflict.id,
        });
      }
    });

    // 4. Excess Payments Alerts (where remaining balance is 0 but recorded sum is excess)
    contracts.forEach((c) => {
      const contractPayments = payments.filter((p) => p.contractId === c.id || p.customerName === c.customerName);
      if (contractPayments.length === 0) return;

      const expectedInstallmentTotal = Math.max(0, (c.totalPrice || 0) - (c.advancePayment || 0));
      const totalPaidPayments = contractPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

      const excessAmount = totalPaidPayments - expectedInstallmentTotal;

      if (excessAmount > 0 && expectedInstallmentTotal > 0) {
        const sortedPayments = [...contractPayments].sort(
          (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
        );
        const lastPayment = sortedPayments[0];
        if (!lastPayment) return;

        const otherPaymentsSum = totalPaidPayments - (Number(lastPayment.amountPaid) || 0);
        const neededToZero = Math.max(0, expectedInstallmentTotal - otherPaymentsSum);

        const repNameOfPayment = lastPayment.repName || c.repName || (isAr ? 'المندوب' : 'Rep');

        const hasListAccess = !currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.length === 0 || currentRep.allowedListIds.includes('all') || (c.listId && currentRep.allowedListIds.includes(c.listId));
        const isMyContract = currentRep && (c.repName === currentRep.name || lastPayment.repName === currentRep.name);
        const hasAccess = isSupervisorOrAdmin || isMyContract || hasListAccess;

        if (hasAccess) {
          items.push({
            id: `excess-payment-${c.id}-${lastPayment.id}`,
            type: 'excess_payment',
            title: isAr ? 'تنبيه: دفعة زائدة (الباقي 0)' : 'Alert: Excess Payment (Remaining 0)',
            message: isAr
              ? `الزبون "${c.customerName}" لديه دفعة زائدة بقيمة (${Number(excessAmount).toLocaleString('en-US')} د.ع). سجلها المندوب "${repNameOfPayment}". يرجى تسوية الدفعة لحذف الفائض (${Number(excessAmount).toLocaleString('en-US')} د.ع) وتصفير الحساب أو تعديلها.`
              : `Customer "${c.customerName}" has an excess payment of ${Number(excessAmount).toLocaleString('en-US')} IQD recorded by "${repNameOfPayment}". Please settle or edit this payment.`,
            timestamp: lastPayment.createdAt || lastPayment.paymentDate || new Date().toISOString(),
            dateObj: new Date(lastPayment.createdAt || lastPayment.paymentDate || Date.now()),
            customerName: c.customerName,
            contractId: c.id,
            repName: repNameOfPayment,
            amount: excessAmount,
            paymentRecord: lastPayment,
            contractRecord: c,
            neededAmount: neededToZero,
            expectedTotal: expectedInstallmentTotal,
            totalPaidPayments: totalPaidPayments,
          });
        }
      }
    });

    // 4. Appointments due alerts (المواعيد المستحقة والتنبيهات: الأسبوعي والشهري دائمي، والمخصص يحذف بعد 3 أيام، وإذا الباقي 0 يحذف أي نوع)
    if (appointments && appointments.length > 0) {
      const now = new Date();

      appointments.forEach((app) => {
        if (isAppointmentDueForNotification(app, contracts, now)) {
          const timeLabel = app.appointmentTime || app.dueTime ? ` [الساعة ${app.appointmentTime || app.dueTime}]` : '';
          items.push({
            id: `appt-due-${app.id}`,
            type: 'appointment_due',
            title: isAr ? `موعد مستحق: ${app.customerName}` : `Due Appointment: ${app.customerName}`,
            message: isAr
              ? `حان موعد الزبون "${app.customerName}"${app.note || app.notes ? ` - ${app.note || app.notes}` : ''}${timeLabel}`
              : `Appointment due for "${app.customerName}"${app.note || app.notes ? ` - ${app.note || app.notes}` : ''}${timeLabel}`,
            timestamp: app.appointmentDate || app.dueDate || new Date().toISOString(),
            dateObj: new Date(app.appointmentDate || app.dueDate || Date.now()),
            customerName: app.customerName,
            contractId: app.contractId,
            listName: app.listName,
            repName: app.createdByName || app.createdByRepName,
          });
        }
      });
    }

    // Filter out notifications older than 3 days (3 * 24 * 60 * 60 * 1000 ms), but keep all active pending conflicts & excess payments & due appointments
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const recentItems = items.filter((item) => {
      if (item.type === 'conflict_pending' || item.type === 'excess_payment' || item.type === 'appointment_due') return true;
      const itemMs = item.dateObj.getTime();
      if (isNaN(itemMs)) return true;
      return nowMs - itemMs <= threeDaysMs;
    });

    recentItems.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    return recentItems.slice(0, 40);
  }, [contracts, payments, employeeTransactions, employees, customerLists, currentRep, isSupervisorOrAdmin, isAdmin, isAr, paymentConflicts, appointments]);

  const unreadCount = notifications.filter((n) => !readNotifIds.includes(n.id)).length;
  const pendingConflictsCount = paymentConflicts.filter((c) => c.status === 'pending_review').length;

  const hasFullAccess = !currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all');

  const visibleLists = customerLists.filter((list) => {
    if (hasFullAccess) return true;
    return currentRep.allowedListIds?.includes(list.id);
  });

  const listCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const list of customerLists) {
      counts[list.id] = contracts.filter(
        (c) => c.listId === list.id || (c.listName && c.listName.trim() === list.name.trim())
      ).length;
    }
    return counts;
  }, [contracts, customerLists]);

  const selectedListObj = useMemo(() => {
    if (selectedListId === 'all') return null;
    return customerLists.find((l) => l.id === selectedListId) || null;
  }, [selectedListId, customerLists]);

  const selectedListLabel = useMemo(() => {
    if (selectedListId === 'all' || !selectedListObj) {
      return isAr ? 'جميع القوائم' : 'All Lists';
    }
    return selectedListObj.name;
  }, [selectedListId, selectedListObj, isAr]);

  return (
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-700/90 sticky top-0 z-40 shadow-xs dir-rtl">
      <div className="w-full max-w-full sm:max-w-7xl xl:max-w-[1600px] 2xl:max-w-[1850px] mx-auto px-1.5 xs:px-2.5 sm:px-4 md:px-6 lg:px-8 py-1.5 sm:py-2.5 space-y-1.5 sm:space-y-2">
        {/* Top Header Bar */}
        {activeTab !== 'customers' && (
          <div className="space-y-1.5 sm:space-y-2">
            {/* Row 1: App Logo & Current User Profile / Role */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <div
                  onClick={() => onTabChange('home')}
                  className="flex items-center gap-1.5 cursor-pointer group shrink-0"
                  title={isAr ? 'تطبيق الكرار للتقسيط للموبايل' : 'Al-Karrar Installment'}
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white shadow-xs border border-teal-500/30 overflow-hidden group-hover:scale-105 transition-transform shrink-0 relative">
                    <img
                      src="/app-logo.jpg"
                      alt="الكرار للتقسيط"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white drop-shadow-xs" />
                  </div>
                  <span className="hidden md:inline-block font-black text-xs text-slate-800 dark:text-slate-100 tracking-tight">
                    {isAr ? 'الكرار للتقسيط' : 'Al-Karrar'}
                  </span>
                </div>

                {/* Current Logged-in User Badge with Rep Photo/Avatar (Dedicated safe photo change) */}
                {currentRep && (
                  <div
                    onClick={() => setIsMyPhotoModalOpen(true)}
                    className="flex items-center gap-1 sm:gap-2 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-100 dark:bg-slate-700/80 border border-slate-200 dark:border-slate-600 text-xs font-bold shadow-xs hover:border-indigo-400 dark:hover:border-indigo-500 transition-all cursor-pointer group min-w-0"
                    title={isAr ? 'صورتي الشخصية - اضغط لتغيير صورتك' : 'My Profile Photo - Click to change photo'}
                  >
                    <div className="relative shrink-0">
                      <RepAvatarDisplay
                        name={currentRep.name}
                        avatarUrl={currentRep.avatarUrl}
                        role={currentRep.role}
                        size="w-6 h-6 sm:w-7 sm:h-7"
                      />
                      <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5 shadow-xs opacity-75 group-hover:opacity-100 group-hover:scale-110 transition-all">
                        <Camera className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                      </span>
                    </div>
                    <span className="text-slate-800 dark:text-slate-200 max-w-[100px] xs:max-w-[150px] sm:max-w-[240px] truncate font-extrabold text-xs sm:text-sm">
                      {currentRep.name}
                    </span>
                    <span
                      className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-black tracking-wide shrink-0 ${
                        currentRep.role === 'admin'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/90 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/60'
                          : currentRep.role === 'supervisor'
                          ? 'bg-purple-100 text-purple-900 dark:bg-purple-950/90 dark:text-purple-300 border border-purple-300/80 dark:border-purple-700/60'
                          : 'bg-sky-100 text-sky-900 dark:bg-sky-950/90 dark:text-sky-300 border border-sky-300/80 dark:border-sky-700/60'
                      }`}
                    >
                      {currentRep.role === 'admin'
                        ? isAr
                          ? 'المدير'
                          : 'Admin'
                        : currentRep.role === 'supervisor'
                        ? isAr
                          ? 'مسؤول'
                          : 'Supervisor'
                        : isAr
                        ? 'مندوب'
                        : 'Rep'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Action Toolbar (Status, Statement, Add New, Notifications, Logout) - Locked Single Row */}
            <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-2.5 w-full pt-0.5 flex-nowrap overflow-x-auto no-scrollbar">
              {/* Network / Sync Status Pill */}
              <div
                className="select-none inline-flex items-center cursor-pointer shrink-0"
                onClick={() => {
                  if (onOpenBackgroundSync) {
                    onOpenBackgroundSync();
                  } else if (onManualSync) {
                    onManualSync();
                  }
                }}
                title={isAr ? 'المزامنة بالخلفية وحالة الاتصال - اضغط للإعدادات والفحص' : 'Background Sync & Connection - Click for settings & test'}
              >
                {pendingCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] xs:text-[11px] sm:text-xs font-extrabold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white animate-pulse shadow-xs transition-all whitespace-nowrap">
                    <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span className="leading-tight">{isAr ? `معلق (${pendingCount})` : `${pendingCount} P.`}</span>
                  </span>
                ) : syncError ? (
                  <span className="inline-flex items-center gap-1 text-[10px] xs:text-[11px] sm:text-xs font-extrabold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs hover:bg-rose-200 transition-all whitespace-nowrap">
                    <WifiOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600" />
                    <span className="leading-tight">{isAr ? 'محلي' : 'Offline'}</span>
                  </span>
                ) : isSyncing ? (
                  <span className="inline-flex items-center gap-1 text-[10px] xs:text-[11px] sm:text-xs font-extrabold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 animate-pulse border border-sky-300 dark:border-sky-800 shadow-2xs whitespace-nowrap">
                    <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 animate-spin" />
                    <span className="leading-tight">{isAr ? 'مزامنة...' : 'Sync...'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] xs:text-[11px] sm:text-xs font-extrabold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-2xs hover:bg-emerald-200 dark:hover:bg-emerald-900 transition-all whitespace-nowrap">
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="leading-tight">{isAr ? 'متصل' : 'Live'}</span>
                  </span>
                )}
              </div>

              {/* Statement Modal Button (كشف الحساب) - Compact & Fixed Size */}
              {activeTab === 'home' && onOpenStatementModal && (
                <button
                  type="button"
                  onClick={onOpenStatementModal}
                  className="shrink-0 px-2.5 xs:px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] xs:text-xs sm:text-sm font-black flex items-center justify-center gap-1 xs:gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  title={isAr ? 'فتح كشف الحسابات' : 'Open Statement'}
                >
                  <FolderKanban className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>{isAr ? 'كشف الحساب' : 'Statement'}</span>
                </button>
              )}

              {/* Add New Sale Modal Button (إضافة جديد) - Compact & Fixed Size */}
              {activeTab === 'home' && (currentRep?.role === 'admin' || currentRep?.canSell !== false) && (
                <button
                  type="button"
                  onClick={onOpenAddModal}
                  className="shrink-0 px-2.5 xs:px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-[11px] xs:text-xs sm:text-sm font-black flex items-center justify-center gap-1 xs:gap-1.5 shadow-xs transition-all cursor-pointer whitespace-nowrap"
                  title={isAr ? 'إضافة جديد' : 'Add New'}
                >
                  <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span>{isAr ? 'إضافة جديد' : 'Add New'}</span>
                </button>
              )}

              {/* Prominent Offline Payment Conflicts Alert Badge for Managers */}
              {pendingConflictsCount > 0 && onOpenOfflineConflictsModal && (
                <button
                  type="button"
                  onClick={onOpenOfflineConflictsModal}
                  className="shrink-0 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] xs:text-xs sm:text-sm font-black flex items-center gap-1 shadow-md animate-pulse transition-all cursor-pointer whitespace-nowrap"
                  title={isAr ? 'يوجد دفعات معلقة تتطلب المراجعة والتصفية' : 'Pending payment conflicts require review'}
                >
                  <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="hidden xs:inline">
                    {isAr ? `معلقة (${pendingConflictsCount})` : `Conflicts (${pendingConflictsCount})`}
                  </span>
                  <span className="xs:hidden">({pendingConflictsCount})</span>
                </button>
              )}

              {/* Notifications Bell Icon & Dropdown */}
              <div className="relative shrink-0" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setIsNotificationsOpen((prev) => !prev)}
                  className={`relative p-1.5 xs:p-2 sm:p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center shadow-2xs hover:scale-105 ${
                    unreadCount > 0
                      ? 'border-rose-400 dark:border-rose-600 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                  title={isAr ? 'الإشعارات والتنبيهات' : 'Notifications & Alerts'}
                >
                  <Bell className={`w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 ${unreadCount > 0 ? 'animate-bounce' : ''}`} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] sm:min-w-[18px] sm:h-[18px] px-0.5 sm:px-1 rounded-full bg-rose-600 text-white text-[8.5px] sm:text-[10px] font-black flex items-center justify-center shadow-xs">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown Modal / Popover */}
                {isNotificationsOpen && (
                  <div className="fixed sm:absolute inset-x-2 top-14 sm:inset-x-auto sm:top-full sm:mt-2 sm:right-0 sm:w-80 md:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[480px]">
                    {/* Dropdown Header */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-xs font-black text-slate-900 dark:text-slate-100">
                            {isAr ? 'الإشعارات والتنبيهات' : 'Notifications & Alerts'}
                          </h3>
                          <p className="text-[10px] text-slate-500">
                            {unreadCount > 0
                              ? isAr
                                ? `${unreadCount} إشعار جديد غير مقروء`
                                : `${unreadCount} unread alerts`
                              : isAr
                                ? 'جميع الإشعارات مقروءة'
                                : 'All notifications read'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = notifications.map((n) => n.id);
                              saveReadNotifs([...new Set([...readNotifIds, ...allIds])]);
                            }}
                            className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/80 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 text-[10px] font-extrabold flex items-center gap-1 transition-all cursor-pointer"
                            title={isAr ? 'تحديد الكل كمقروء' : 'Mark all as read'}
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>{isAr ? 'قراءة الكل' : 'Mark all read'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsNotificationsOpen(false)}
                          className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* External Notification Status Bar (تنبيهات شاشة الجهاز وقفل الشاشة) */}
                    <div className="px-3 py-2 bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isExternalNotifGranted ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        <span className="font-bold truncate text-slate-700 dark:text-slate-300">
                          {isExternalNotifGranted
                            ? (isAr ? 'الإشعارات الخارجية (الجهاز): نشطة' : 'Device alerts: Active')
                            : (isAr ? 'الإشعارات الخارجية: غير مفعلة' : 'Device alerts: Inactive')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isExternalNotifGranted ? (
                          <button
                            type="button"
                            onClick={handleTestExternalNotification}
                            className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                            title={isAr ? 'إرسال إشعار تجريبي للجهاز للتأكد من عمله' : 'Send test notification to device'}
                          >
                            <BellRing className="w-3 h-3" />
                            <span>{isAr ? 'تجربة إشعار' : 'Test'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleEnableExternalNotifications}
                            className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-black text-[10px] inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer animate-pulse"
                            title={isAr ? 'تفعيل ظهور الإشعارات على شاشة الجهاز' : 'Enable device notifications'}
                          >
                            <Bell className="w-3 h-3" />
                            <span>{isAr ? 'تفعيل الآن' : 'Enable'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Notifications List */}
                    <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60 p-2 space-y-1">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs font-bold space-y-2">
                          <Bell className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                          <p>{isAr ? 'لا توجد إشعارات جديدة' : 'No new notifications'}</p>
                        </div>
                      ) : (
                        notifications.map((notif) => {
                          const isUnread = !readNotifIds.includes(notif.id);
                          const dateFormatted = notif.dateObj.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <div
                              key={notif.id}
                              onClick={() => {
                                if (isUnread) {
                                  saveReadNotifs([...readNotifIds, notif.id]);
                                }
                                if (notif.type === 'conflict_pending' && onOpenOfflineConflictsModal) {
                                  onOpenOfflineConflictsModal();
                                  setIsNotificationsOpen(false);
                                } else if (notif.type === 'excess_payment' && onOpenPaymentsHistoryWithFilter && (notif.contractId || notif.customerName)) {
                                  onOpenPaymentsHistoryWithFilter(notif.contractId || notif.customerName!);
                                  setIsNotificationsOpen(false);
                                } else if (notif.type === 'appointment_due' && onOpenAppointmentsBox) {
                                  onOpenAppointmentsBox();
                                  setIsNotificationsOpen(false);
                                }
                              }}
                              className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                                isUnread
                                  ? 'bg-teal-500/10 dark:bg-teal-950/50 border border-teal-300/60 dark:border-teal-800/80 font-bold'
                                  : 'bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-800/60 opacity-80'
                              }`}
                            >
                              {/* Icon badge */}
                              <div
                                className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
                                  notif.type === 'sale'
                                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                    : notif.type === 'rep_debt'
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                    : notif.type === 'appointment_due'
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                    : notif.type === 'conflict_pending' || notif.type === 'excess_payment'
                                    ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                    : notif.type === 'conflict_resolved_rep' || notif.type === 'conflict_resolved_team'
                                    ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                    : 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                                }`}
                              >
                                {notif.type === 'sale' && <Receipt className="w-4 h-4" />}
                                {notif.type === 'rep_debt' && <AlertCircle className="w-4 h-4" />}
                                {notif.type === 'appointment_due' && <CalendarClock className="w-4 h-4 text-amber-600" />}
                                {notif.type === 'rep_repay' && <CheckCircle2 className="w-4 h-4" />}
                                {(notif.type === 'conflict_pending' || notif.type === 'excess_payment') && <ShieldAlert className="w-4 h-4" />}
                                {(notif.type === 'conflict_resolved_rep' || notif.type === 'conflict_resolved_team') && (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                              </div>

                              {/* Text content */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                                    {notif.title}
                                  </span>
                                  {isUnread && (
                                    <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold leading-relaxed break-words">
                                  {notif.message}
                                </p>
                                {/* excess or conflict buttons */}
                                {notif.type === 'conflict_pending' && (
                                  <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                                    {onOpenOfflineConflictsModal && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isUnread) {
                                            saveReadNotifs([...readNotifIds, notif.id]);
                                          }
                                          onOpenOfflineConflictsModal();
                                          setIsNotificationsOpen(false);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                      >
                                        <ShieldAlert className="w-3.5 h-3.5" />
                                        <span>{isAr ? 'تعديل وتصفية' : 'Edit & Settle'}</span>
                                      </button>
                                    )}
                                    {onRejectConflict && notif.conflictId && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const targetConflict = paymentConflicts.find((c) => c.id === notif.conflictId);
                                          if (targetConflict) {
                                            if (isUnread) {
                                              saveReadNotifs([...readNotifIds, notif.id]);
                                            }
                                            onRejectConflict(targetConflict);
                                          }
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>{isAr ? 'حذف' : 'Delete'}</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                                {notif.type === 'excess_payment' && (
                                  <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                                    {isSupervisorOrAdmin ? (
                                      <>
                                        {onSettleExcessPayment && (notif.contractId || notif.customerName) && (
                                          <button
                                            type="button"
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              if (isUnread) {
                                                saveReadNotifs([...readNotifIds, notif.id]);
                                              }
                                              setIsNotificationsOpen(false);
                                              await onSettleExcessPayment(notif.contractId || '', notif.customerName);
                                            }}
                                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                            title={isAr ? 'تسوية الفائض وتصفير الحساب فوراً' : 'Settle excess and zero balance immediately'}
                                          >
                                            <Zap className="w-3.5 h-3.5 fill-current" />
                                            <span>{isAr ? 'تسوية وتصفير الحساب' : 'Settle Payment'}</span>
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-[10px] text-amber-700 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-900/60 flex items-center gap-1">
                                        <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                                        <span>{isAr ? 'للاطلاع فقط - صلاحية التسوية للمدير حصراً' : 'Read-only - Settlement reserved for Manager'}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-extrabold pt-0.5">
                                  <span>{dateFormatted}</span>
                                  {notif.repName && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                      {notif.repName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Dropdown Footer */}
                    {notifications.length > 0 && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = notifications.map((n) => n.id);
                            saveReadNotifs([...new Set([...readNotifIds, ...allIds])]);
                          }}
                          className="text-teal-700 dark:text-teal-400 font-extrabold hover:underline cursor-pointer"
                        >
                          {isAr ? 'تحديد كل الإشعارات كمقروءة' : 'Mark all read'}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveReadNotifs([])}
                          className="text-slate-500 dark:text-slate-400 font-bold hover:text-slate-700 cursor-pointer"
                        >
                          {isAr ? 'إعادة ضبط' : 'Reset read state'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Switch Account / Logout Button */}
              <button
                type="button"
                onClick={onLogoutRep}
                className="p-1.5 xs:p-2 sm:p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0"
                title={isAr ? 'خروج / تبديل الحساب (المدير والمندوبين)' : 'Logout / Switch Account'}
              >
                <LogOut className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
                <span className="hidden sm:inline text-xs mr-1">{isAr ? 'خروج' : 'Logout'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Controls when inside Customers tab */}
        {activeTab === 'customers' && (
          <div className="space-y-2">
            {/* Top Row: Customer List Selector (اختيار قائمة) */}
            {onSelectListId && (
              <div className="relative w-full" ref={listDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsListDropdownOpen((prev) => !prev)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-black transition-all cursor-pointer shadow-2xs ${
                    selectedListId !== 'all'
                      ? 'bg-teal-50/70 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 border-teal-200 dark:border-teal-800'
                      : 'bg-slate-50/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border-slate-200/90 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Layers className="w-4 h-4 text-teal-600/80 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">{isAr ? 'اختيار قائمة:' : 'Select List:'}</span>
                    <span className="font-black text-slate-900 dark:text-white truncate">{selectedListLabel}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold">
                      {selectedListId === 'all' ? contracts.length : (listCounts[selectedListId] || 0)}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isListDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Dropdown Menu */}
                {isListDropdownOpen && (
                  <div className="absolute top-full right-0 left-0 mt-1.5 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-1.5 max-h-72 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-2.5 py-1 text-[10px] font-black text-slate-400 border-b border-slate-100 dark:border-slate-700/60 mb-1">
                      {isAr ? 'اختيار قائمة الزبائن' : 'Select Customer List'}
                    </div>

                    {/* All Lists Option */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectListId('all');
                        setIsListDropdownOpen(false);
                      }}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-right cursor-pointer transition-colors ${
                        selectedListId === 'all'
                          ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-black border border-teal-200 dark:border-teal-800/80'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Layers className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>{isAr ? 'جميع القوائم' : 'All Lists'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-extrabold">
                          {contracts.length}
                        </span>
                        {selectedListId === 'all' && <Check className="w-3.5 h-3.5 text-teal-600" />}
                      </div>
                    </button>

                    <div className="h-px bg-slate-100 dark:bg-slate-700 my-1" />

                    {/* Individual Lists */}
                    {visibleLists.length === 0 ? (
                      <div className="px-3 py-2 text-center text-xs text-slate-400 font-bold">
                        {isAr ? 'لا توجد قوائم مخصصة' : 'No lists available'}
                      </div>
                    ) : (
                      visibleLists.map((list) => {
                        const isSelected = selectedListId === list.id;
                        const count = listCounts[list.id] || 0;
                        return (
                          <button
                            key={list.id}
                            type="button"
                            onClick={() => {
                              onSelectListId(list.id);
                              setIsListDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs text-right cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-black border border-teal-200 dark:border-teal-800/80'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                              <span className="truncate">{list.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-extrabold">
                                {count}
                              </span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Row: Search Input */}
            <div className="relative">
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none flex items-center justify-center">
                <Search className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={localSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalSearch(val);
                  onSearchChange(val);
                }}
                placeholder={isAr ? 'البحث عن زبون أو رقم هاتف...' : 'Search customer or phone...'}
                className="w-full pr-8 pl-8 py-2 rounded-xl border border-slate-300/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/60 hover:bg-white/80 dark:hover:bg-slate-900/80 backdrop-blur-md text-slate-900 dark:text-slate-100 text-xs font-bold focus:outline-none focus:border-teal-500 text-center sm:text-right shadow-xs transition-all"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    onSearchChange('');
                  }}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Safe My Profile Photo Modal (No Reps List Exposure) */}
      {isMyPhotoModalOpen && currentRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm overflow-hidden text-right">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {isAr ? 'الصورة الشخصية للحساب' : 'Profile Photo'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                    {currentRep.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMyPhotoModalOpen(false);
                  setPhotoFeedback(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col items-center text-center space-y-4">
              {/* Large Avatar Preview */}
              <div className="relative group">
                {currentRep.avatarUrl ? (
                  <img
                    src={currentRep.avatarUrl}
                    alt={currentRep.name}
                    referrerPolicy="no-referrer"
                    className="w-28 h-28 rounded-3xl object-cover border-4 border-indigo-500 shadow-lg"
                  />
                ) : (
                  <div
                    className={`w-28 h-28 rounded-3xl flex items-center justify-center font-black text-4xl text-white shadow-lg border-4 border-indigo-300 dark:border-indigo-700 ${
                      currentRep.role === 'admin'
                        ? 'bg-amber-500'
                        : currentRep.role === 'supervisor'
                        ? 'bg-purple-600'
                        : 'bg-sky-500'
                    }`}
                  >
                    {currentRep.name ? currentRep.name.trim().charAt(0) : <User className="w-12 h-12" />}
                  </div>
                )}

                {isProcessingPhoto && (
                  <div className="absolute inset-0 bg-black/60 rounded-3xl flex items-center justify-center">
                    <span className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-black text-base text-slate-900 dark:text-slate-100">
                  {currentRep.name}
                </h4>
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-black ${
                      currentRep.role === 'admin'
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300'
                        : currentRep.role === 'supervisor'
                        ? 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-300 border border-purple-300'
                        : 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300 border border-sky-300'
                    }`}
                  >
                    {currentRep.role === 'admin'
                      ? (isAr ? 'المدير العام' : 'Admin')
                      : currentRep.role === 'supervisor'
                      ? (isAr ? 'مسؤول النظام' : 'Supervisor')
                      : (isAr ? 'مندوب مبيعات' : 'Sales Rep')}
                  </span>
                </div>
              </div>

              {/* Status/Feedback Message */}
              {photoFeedback && (
                <div
                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in ${
                    photoFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200'
                  }`}
                >
                  {photoFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{photoFeedback.message}</span>
                </div>
              )}

              {/* Actions */}
              <div className="w-full space-y-2 pt-1">
                <label className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all">
                  <Camera className="w-4 h-4" />
                  <span>{isAr ? 'التقاط بالكاميرا / اختيار صورة' : 'Take / Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isProcessingPhoto}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDirectUploadPhoto(file);
                    }}
                  />
                </label>

                {currentRep.avatarUrl && (
                  <button
                    type="button"
                    disabled={isProcessingPhoto}
                    onClick={handleRemovePhoto}
                    className="w-full py-2 px-4 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إزالة صورتي والرجوع للافتراضي' : 'Remove Photo'}</span>
                  </button>
                )}
              </div>

              {/* Security Privacy Notice */}
              <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                {isAr
                  ? '🔒 تغيير الصورة يتم مباشرة على حسابك الشخصي فقط دون الحاجة للدخول إلى إدارة المندوبين.'
                  : '🔒 Profile photo is updated directly on your personal account safely.'}
              </p>

              {/* Discreet Link for Admins/Supervisors ONLY */}
              {(currentRep.role === 'admin' || currentRep.role === 'supervisor') && onOpenRepsModal && (
                <div className="w-full pt-3 border-t border-slate-100 dark:border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMyPhotoModalOpen(false);
                      onOpenRepsModal();
                    }}
                    className="text-[11px] font-extrabold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center justify-center gap-1.5 w-full py-1.5 cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إدارة جميع المندوبين (خاص بالمدير)' : 'Manage Representatives (Admin)'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Quick Edit Modal for Excess Payment directly from Notification */}
      {quickExcessEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 dir-rtl animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-white/20 backdrop-blur-xs">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    {isAr ? 'تعديل الدفعة الزائدة وتصفية الحساب' : 'Edit Excess Payment & Settle'}
                  </h3>
                  <p className="text-[11px] text-amber-100 font-medium">
                    {isAr ? 'إجراء فوري وتعديل مباشر من قائمة الإشعارات' : 'Direct action from notification'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickExcessEdit(null)}
                className="p-1.5 rounded-xl hover:bg-white/20 transition-colors text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Customer & Rep Details */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {isAr ? 'اسم الزبون:' : 'Customer:'}
                  </div>
                  <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {quickExcessEdit.contract.customerName}
                  </div>
                </div>
                {quickExcessEdit.payment.repName && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-500 dark:text-slate-400">{isAr ? 'المندوب المسجل:' : 'Recorded by:'}</span>
                    <span className="font-black text-slate-700 dark:text-slate-300">{quickExcessEdit.payment.repName}</span>
                  </div>
                )}
                {quickExcessEdit.payment.paymentDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-500 dark:text-slate-400">{isAr ? 'تاريخ الدفعة:' : 'Payment Date:'}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{quickExcessEdit.payment.paymentDate}</span>
                  </div>
                )}
              </div>

              {/* Balance Breakdown Cards */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-700/60 border border-slate-200 dark:border-slate-600 text-center">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{isAr ? 'الدفعة المسجلة الحالية' : 'Current Payment'}</div>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                    {Number(quickExcessEdit.payment.amountPaid || 0).toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-center">
                  <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{isAr ? 'الفائض الزائد المطلوب حذفه' : 'Excess to Deduct'}</div>
                  <div className="text-sm font-black text-rose-600 dark:text-rose-400">
                    +{Number(quickExcessEdit.excessAmount || 0).toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                  </div>
                </div>
              </div>

              {/* Fast 1-Click Settlement Button */}
              {onSettleExcessPayment && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-200">
                    <span>{isAr ? 'المبلغ المطلوب لتصفير الحساب تماماً:' : 'Exact needed to reach 0 balance:'}</span>
                    <span className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {Number(quickExcessEdit.neededToZero || 0).toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingExcessEdit}
                    onClick={async () => {
                      setIsSavingExcessEdit(true);
                      try {
                        await onSettleExcessPayment(quickExcessEdit.contract.id, quickExcessEdit.contract.customerName);
                        setQuickExcessEdit(null);
                      } finally {
                        setIsSavingExcessEdit(false);
                      }
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4 fill-current" />
                    <span>
                      {isAr
                        ? `تسوية وتصفير الحساب (حذف الفائض ${Number(quickExcessEdit.excessAmount).toLocaleString('en-US')} د.ع وإرجاعه بحوزة المندوب "${quickExcessEdit.payment.repName || quickExcessEdit.contract.repName || 'المندوب'}")`
                        : `Settle & Zero Balance (Deduct ${quickExcessEdit.excessAmount} IQD to rep "${quickExcessEdit.payment.repName || quickExcessEdit.contract.repName || 'Rep'}")`}
                    </span>
                  </button>
                </div>
              )}

              {/* Manual Edit Form */}
              <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-black text-slate-700 dark:text-slate-300">
                  {isAr ? 'أو تعديل قيمة الدفعة يدوياً:' : 'Or manually edit payment:'}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'المبلغ الجديد (د.ع):' : 'New Amount (IQD):'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={quickExcessEdit.newAmount}
                      onChange={(e) =>
                        setQuickExcessEdit((prev) => (prev ? { ...prev, newAmount: e.target.value } : null))
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-slate-100"
                      placeholder="المبلغ"
                    />
                    {quickExcessEdit.neededToZero > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuickExcessEdit((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  newAmount: String(prev.neededToZero),
                                  note: `تسوية فائض (تم تسديد ${prev.neededToZero.toLocaleString('en-US')} د.ع وفائض ${prev.excessAmount.toLocaleString('en-US')} د.ع راجع للزبون)`,
                                }
                              : null
                          )
                        }
                        className="px-2.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black shrink-0 cursor-pointer"
                        title={isAr ? 'تعبئة المبلغ المطلوب لتصفير الحساب' : 'Fill exact amount'}
                      >
                        {isAr ? `تطبيق (${Number(quickExcessEdit.neededToZero).toLocaleString('en-US')})` : 'Set Exact'}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isAr ? 'الملاحظة:' : 'Note:'}
                  </label>
                  <input
                    type="text"
                    value={quickExcessEdit.note}
                    onChange={(e) =>
                      setQuickExcessEdit((prev) => (prev ? { ...prev, note: e.target.value } : null))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-slate-100"
                    placeholder="ملاحظة عن التسوية أو التعديل"
                  />
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  {onDeletePayment && (
                    <button
                      type="button"
                      disabled={isSavingExcessEdit}
                      onClick={async () => {
                        if (
                          window.confirm(
                            isAr
                              ? `هل أنت متأكد من حذف هذه الدفعة نهائياً للزبون "${quickExcessEdit.contract.customerName}"؟`
                              : `Are you sure you want to delete this payment for "${quickExcessEdit.contract.customerName}"?`
                          )
                        ) {
                          setIsSavingExcessEdit(true);
                          try {
                            await onDeletePayment(quickExcessEdit.payment);
                            setQuickExcessEdit(null);
                          } finally {
                            setIsSavingExcessEdit(false);
                          }
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'حذف الدفعة' : 'Delete'}</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2 ltr:ml-auto rtl:mr-auto">
                    <button
                      type="button"
                      disabled={isSavingExcessEdit}
                      onClick={() => setQuickExcessEdit(null)}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-black cursor-pointer"
                    >
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    {onUpdatePayment && (
                      <button
                        type="button"
                        disabled={isSavingExcessEdit || !Number(quickExcessEdit.newAmount)}
                        onClick={async () => {
                          const amt = Number(quickExcessEdit.newAmount);
                          if (amt > 0) {
                            setIsSavingExcessEdit(true);
                            try {
                              await onUpdatePayment(quickExcessEdit.payment, amt, quickExcessEdit.note);
                              setQuickExcessEdit(null);
                            } finally {
                              setIsSavingExcessEdit(false);
                            }
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md cursor-pointer"
                      >
                        {isAr ? 'حفظ التعديل' : 'Save Changes'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


