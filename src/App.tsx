import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Plus,
  Users,
  Boxes,
  UserPlus,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Receipt,
  Download,
  Upload,
  PackagePlus,
  Wallet,
  FolderKanban,
  Building2,
  HandCoins,
  ListFilter,
  ShoppingCart,
  Printer,
  ShieldCheck,
  Bluetooth,
  Edit3,
  Settings,
  Navigation,
  TrendingUp,
  Database
} from 'lucide-react';
import {
  InstallmentContract,
  PaymentRecord,
  InventoryItem,
  FilterStatus,
  Language,
  ActiveTab,
  SalesRepresentative,
  CashFund,
  CustomerList,
  FundTransaction,
  Employee,
  EmployeeTransaction,
  PaymentConflictRecord,
  AppointmentRecord
} from './types';
import { getLocalDateString, playNotificationSound, showBrowserNotification, isAppointmentDueForNotification } from './lib/dateUtils';
import { initCapacitorPush } from './lib/capacitorPush';
import { INITIAL_CONTRACTS, DEFAULT_REPS, INITIAL_FUNDS, INITIAL_CUSTOMER_LISTS, INITIAL_EMPLOYEES } from './data/initialContracts';
import { HeaderAndStats } from './components/HeaderAndStats';
import { ContractCard } from './components/ContractCard';
import { ContractDetailsModal } from './components/ContractDetailsModal';
import { ContractFormModal } from './components/ContractFormModal';
import { InventoryView } from './components/InventoryView';
import { InventoryModal } from './components/InventoryModal';
import { DatabaseSchemaModal } from './components/DatabaseSchemaModal';
import { PaymentsHistoryModal } from './components/PaymentsHistoryModal';
import { RepsManagementModal } from './components/RepsManagementModal';
import { FundsView } from './components/FundsView';
import { OfflinePaymentConflictsModal } from './components/OfflinePaymentConflictsModal';
import { EmployeesView } from './components/EmployeesView';
import { LoginView } from './components/LoginView';
import { SplashScreen } from './components/SplashScreen';
import { EmptyState } from './components/EmptyState';
import { AddPaymentModal } from './components/AddPaymentModal';
import { ReceiptModal, ReceiptData } from './components/ReceiptModal';
import { RepsPaymentsSummaryBox } from './components/RepsPaymentsSummaryBox';
import { openReceiptPdfWindow } from './lib/receiptPdf';
import { ReceiptPrintTemplate } from './components/ReceiptPrintTemplate';
import { CustomerStatementModal } from './components/CustomerStatementModal';
import { SalesBox } from './components/SalesBox';
import { SalesBoxModal } from './components/SalesBoxModal';
import { AddAppointmentModal } from './components/AddAppointmentModal';
import { AppointmentsBoxModal } from './components/AppointmentsBoxModal';
import { CustomerMapsModal } from './components/CustomerMapsModal';
import { precacheMapTilesForLocations } from './lib/offlineTileLayer';
import { CalendarClock, MapPinned } from 'lucide-react';
import { PrinterSettingsModal } from './components/PrinterSettingsModal';
import { BackgroundSyncModal } from './components/BackgroundSyncModal';
import { ServerQueriesModal } from './components/ServerQueriesModal';
import { executeBackAction, hasActiveBackHandlers } from './lib/backButtonManager';
import { silentAutoPrintReceipt, directPrintReceipt, openThermalPrintWindow, printOrQueueInvoice, processPrintQueue, getSavedPrinterConfig, ThermalReceiptData, Platform } from './lib/bluetoothPrinter';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { initBackgroundSync, registerBackgroundSyncWorker, sendBeaconOnExit, runBackgroundExitSync, enableForegroundService, syncToNativeAndroid, requestAllBackgroundAndSyncPermissions } from './lib/offlineQueue';
import {
  subscribeToContracts,
  subscribeToCustomers,
  subscribeToInventory,
  subscribeToPayments,
  subscribeToReps,
  subscribeToFunds,
  subscribeToCustomerLists,
  subscribeToFundTransactions,
  subscribeToEmployees,
  subscribeToEmployeeTransactions,
  addContractToFirestore,
  recordPaymentInFirestore,
  updatePaymentInFirestore,
  deletePaymentFromFirestore,
  deleteMultiplePaymentsFromFirestore,
  updateContractInFirestore,
  deleteContractFromFirestore,
  addInventoryItemToFirestore,
  updateInventoryItemInFirestore,
  deleteInventoryItemFromFirestore,
  addRepToFirestore,
  updateRepInFirestore,
  deleteRepFromFirestore,
  addFundToFirestore,
  updateFundInFirestore,
  deleteFundFromFirestore,
  addCustomerListToFirestore,
  updateCustomerListInFirestore,
  deleteCustomerListFromFirestore,
  addDepositOrWithdrawalToFund,
  transferBetweenFunds,
  deleteFundTransactionFromFirestore,
  updateFundTransactionInFirestore,
  addEmployeeToFirestore,
  updateEmployeeInFirestore,
  deleteEmployeeFromFirestore,
  processEmployeeDebtTransaction,
  deleteEmployeeDebtTransaction,
  updateEmployeeDebtTransaction,
  replaceAllDataInFirestore,
  syncAndOverwriteActiveDatabase,
  cleanupLegacyCollectionsFromFirestore,
  logoutUserAuth,
  auth,
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  addPaymentToFirestore,
  subscribeToPaymentConflicts,
  recordPaymentConflictInFirestore,
  resolvePaymentConflictInFirestore,
  rejectPaymentConflictInFirestore,
  PAYMENT_CONFLICTS_COLLECTION,
  syncAllEmployeesDebtBalances,
  silentBackgroundSync,
  forceRefreshAllDataFromPostgres,
  updateCustomerLocation,
  reconcileAllLocalWithDatabase,
  deleteAllCustomersAndPayments,
  deleteAllEmployees,
  loadSnapshotFromIndexedDbIfAvailable,
  saveCurrentRepToIndexedDb,
  generateUniqueId,
  reorderFundsInDatabase,
  reorderCustomerListsInDatabase,
  compareEntitiesByOrder,
  setLocalCache,
  fetchAppointmentsFromPostgres,
  saveAppointmentToPostgres,
  deleteAppointmentFromPostgres,
  updateAppointmentInPostgres,
  subscribeToAppointments,
  getLocalCache,
  updateLocalCacheItem,
  run5DayPruneAndPollingInspection
} from './lib/postgresClient';

import { universalApiFetch } from './lib/apiConfig';
import { subscribeToQueueChange, getPendingQueue, getPendingQueueSync, flushPendingQueue, scheduleIdleVerification, isUserActivelyTypingOrInputFocused } from './lib/offlineQueue';
import { hasDuplicateName, deduplicateEntitiesByName, normalizeEntityName } from './lib/nameHelpers';
import { normalizePin } from './lib/pinUtils';

const LANG_STORAGE_KEY = 'sami_installments_lang';
const REP_STORAGE_KEY = 'sami_installments_rep';

export default function App() {
  const [contracts, setContracts] = useState<InstallmentContract[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [reps, setReps] = useState<SalesRepresentative[]>([]);
  const [funds, setFunds] = useState<CashFund[]>([]);
  const [customerLists, setCustomerLists] = useState<CustomerList[]>([]);
  const [fundTransactions, setFundTransactions] = useState<FundTransaction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeTransactions, setEmployeeTransactions] = useState<EmployeeTransaction[]>([]);
  const [paymentConflicts, setPaymentConflicts] = useState<PaymentConflictRecord[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>(() => {
    try {
      return localStorage.getItem('alkarrar_selected_list_id') || 'all';
    } catch (e) {
      return 'all';
    }
  });

  const handleSelectListId = useCallback((id: string) => {
    setSelectedListId(id);
    try {
      localStorage.setItem('alkarrar_selected_list_id', id);
    } catch (e) {}
  }, []);

  const [isSyncing, setIsSyncing] = useState<boolean>(true);
  const [syncError, setSyncError] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Representative session state
  const [currentRep, setCurrentRep] = useState<SalesRepresentative | null>(() => {
    try {
      const saved = localStorage.getItem(REP_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.name) {
          if (parsed.name.includes('ضياء') || parsed.id === 'rep-1') {
            return {
              ...parsed,
              role: 'admin',
              canEdit: true,
              canDelete: true,
              canMoveCustomer: true,
              canSell: true,
              allowedListIds: ['all'],
            };
          }
          return parsed;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  // Purely local PIN screen state (No blocking auth calls, persistent across restarts)
  // Ensures that on first install or when logged out, user is ALWAYS prompted for an entry passcode
  const [isPinUnlocked, setIsPinUnlocked] = useState<boolean>(() => {
    try {
      const savedRep = localStorage.getItem(REP_STORAGE_KEY);
      const persistentState = localStorage.getItem('sami_app_pin_unlocked');
      // On first install, neither savedRep nor pin unlocked flag exists -> must request PIN
      if (!savedRep || persistentState !== 'true') {
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  });

  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      return false; // Enter directly into the requested main dashboard view
    } catch (e) {
      return false;
    }
  });

  const loginTimestampRef = useRef<number>(Date.now());

  const currentRepRef = useRef<SalesRepresentative | null>(currentRep);
  useEffect(() => {
    currentRepRef.current = currentRep;
  }, [currentRep]);

  const contractsRef = useRef<InstallmentContract[]>(contracts);
  useEffect(() => {
    contractsRef.current = contracts;
  }, [contracts]);

  const isFirstContractsLoadRef = useRef(true);
  const knownContractIdsRef = useRef<Set<string>>(new Set());

  const isFirstPaymentsLoadRef = useRef(true);
  const knownPaymentIdsRef = useRef<Set<string>>(new Set());

  const isFirstEmpTxsLoadRef = useRef(true);
  const knownEmpTxIdsRef = useRef<Set<string>>(new Set());

  const isFirstApptsLoadRef = useRef(true);
  const knownApptIdsRef = useRef<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  const [lang, setLang] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
      if (savedLang === 'en' || savedLang === 'ar') return savedLang;
    } catch (e) {
      // ignore
    }
    return 'ar'; // Default to Arabic
  });

  const isAr = lang === 'ar';

  const isArRef = useRef<boolean>(isAr);
  useEffect(() => {
    isArRef.current = isAr;
  }, [isAr]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [allCardsExpanded, setAllCardsExpanded] = useState<boolean>(false);

  const handleToggleAllCards = () => {
    setAllCardsExpanded((prev) => !prev);
  };

  // Modals state
  const [selectedContract, setSelectedContract] = useState<InstallmentContract | null>(null);
  const [addPaymentModalContract, setAddPaymentModalContract] = useState<InstallmentContract | null>(null);
  const [activeReceiptData, setActiveReceiptData] = useState<ReceiptData | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [autoTriggerReceiptPrint, setAutoTriggerReceiptPrint] = useState(false);
  const [editingContract, setEditingContract] = useState<InstallmentContract | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isDatabaseSchemaOpen, setIsDatabaseSchemaOpen] = useState(false);
  const [isPaymentsHistoryOpen, setIsPaymentsHistoryOpen] = useState(false);
  const [isRepsModalOpen, setIsRepsModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isSalesBoxModalOpen, setIsSalesBoxModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>(() => getLocalCache<AppointmentRecord>('appointments'));
  const [isAppointmentsBoxModalOpen, setIsAppointmentsBoxModalOpen] = useState(false);
  const [isCustomerMapsModalOpen, setIsCustomerMapsModalOpen] = useState(false);
  const [customerMapsInitialContract, setCustomerMapsInitialContract] = useState<InstallmentContract | null>(null);
  const [customerMapsAutoDrawRoute, setCustomerMapsAutoDrawRoute] = useState<boolean>(false);
  const [isAddAppointmentModalOpen, setIsAddAppointmentModalOpen] = useState(false);
  const [selectedContractForAppointment, setSelectedContractForAppointment] = useState<InstallmentContract | null>(null);
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
  const [isBackgroundSyncOpen, setIsBackgroundSyncOpen] = useState(false);
  const [isServerQueriesOpen, setIsServerQueriesOpen] = useState(false);
  const [isRepsPaymentsSummaryOpen, setIsRepsPaymentsSummaryOpen] = useState(false);
  const [isOfflineConflictsOpen, setIsOfflineConflictsOpen] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(true);
  const [customerPaymentsFilter, setCustomerPaymentsFilter] = useState<string | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss toast notification after 2.5 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadAppointments = useCallback(async () => {
    try {
      const data = await fetchAppointmentsFromPostgres();
      if (Array.isArray(data)) {
        setAppointments(data);
      }
    } catch (e) {
      console.warn('Failed to load appointments:', e);
      const local = getLocalCache<AppointmentRecord>('appointments');
      if (local && Array.isArray(local)) {
        setAppointments(local);
      }
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleSaveAppointment = async (newAppt: any) => {
    try {
      const saved = await saveAppointmentToPostgres(newAppt);
      if (saved && saved.id) {
        knownApptIdsRef.current.add(saved.id);
      }
      // Immediately update local state so count and box reflect it without delay
      setAppointments((prev) => {
        const filtered = prev.filter((a) => a.id !== saved.id);
        return [...filtered, saved];
      });

      showBrowserNotification(
        isAr ? '📅 إشعار موعد جديد' : '📅 New Appointment Scheduled',
        isAr
          ? `"${saved.customerName || newAppt.customerName}" - بتاريخ ${saved.appointmentDate || newAppt.appointmentDate}${saved.appointmentTime ? ` الساعة ${saved.appointmentTime}` : ''}${saved.note ? ` (${saved.note})` : ''}`
          : `Appointment scheduled for "${saved.customerName || newAppt.customerName}" on ${saved.appointmentDate || newAppt.appointmentDate}`,
        { tag: `new_appt_${saved.id || Date.now()}` }
      );

      setToastMessage(isAr ? 'تم حفظ الموعد بنجاح' : 'Appointment saved successfully');
      loadAppointments();
    } catch (e) {
      console.error('Error saving appointment:', e);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      await deleteAppointmentFromPostgres(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
      setToastMessage(isAr ? 'تم حذف الموعد' : 'Appointment deleted');
      loadAppointments();
    } catch (e) {
      console.error('Error deleting appointment:', e);
    }
  };

  const handleUpdateAppointment = async (id: string, updates: any) => {
    try {
      await updateAppointmentInPostgres(id, updates);
      setAppointments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
      );
      loadAppointments();
    } catch (e) {
      console.error('Error updating appointment:', e);
    }
  };

  const knownConflictStatusRef = useRef<Set<string>>(new Set());
  const isFirstConflictsLoadRef = useRef<boolean>(true);
  const isSyncingRef = useRef<boolean>(isSyncing);
  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  // الاستماع للشبكة والمزامنة التلقائية
  useEffect(() => {
    let listenerPromise: Promise<any> | null = null;
    try {
      if (Network && typeof Network.addListener === 'function') {
        listenerPromise = Network.addListener('networkStatusChange', async (status) => {
          if (status.connected) {
            console.log("عادت الشبكة، جاري المزامنة...");
            try {
              await flushPendingQueue();
              await silentBackgroundSync();
              await forceRefreshAllDataFromPostgres();
            } catch (e) {}
          }
        });
      }
    } catch (netErr) {
      console.warn('Network listener init warning:', netErr);
    }

    return () => {
      if (listenerPromise) {
        listenerPromise.then(h => {
          if (h && typeof h.remove === 'function') {
            h.remove();
          }
        }).catch(() => {});
      }
    };
  }, []);

  // Listen for online / offline connection status, background sync, and app-closing events
  useEffect(() => {
    registerBackgroundSyncWorker(silentBackgroundSync);
    initBackgroundSync(silentBackgroundSync);
    requestAllBackgroundAndSyncPermissions().catch(() => {});

    const unsubscribeQueue = subscribeToQueueChange((count) => {
      setPendingCount((prev) => (prev === count ? prev : count));
    });

    const handleOnline = async () => {
      if (isUserActivelyTypingOrInputFocused()) return;
      setSyncError(false);
      if (isSyncingRef.current) return;
      setIsSyncing(true);
      try {
        await loadSnapshotFromIndexedDbIfAvailable().catch(() => {});
        const res = await flushPendingQueue();
        if (res && res.remaining > 0) {
          await new Promise((r) => setTimeout(r, 800));
          if (!isUserActivelyTypingOrInputFocused()) {
            await flushPendingQueue();
          }
        }
        if (!isUserActivelyTypingOrInputFocused()) {
          await silentBackgroundSync();
          await forceRefreshAllDataFromPostgres();
        }
      } catch (e) {
        console.warn('Sync on online notice:', e);
      } finally {
        setIsSyncing(false);
        processPrintQueue();
      }
    };

    const handleOffline = () => {
      setSyncError(true);
    };

    const handleAppCloseOrHide = () => {
      try {
        const queue = getPendingQueueSync();
        syncToNativeAndroid(queue);
        runBackgroundExitSync();
        const bridge =
          (window as any).AndroidInterface ||
          (window as any).AndroidPrinter ||
          (window as any).Android ||
          (window as any).AndroidBridge;
        if (bridge && typeof bridge.triggerBackgroundSyncNow === 'function') {
          bridge.triggerBackgroundSyncNow();
        }
      } catch (e) {
        console.warn('Background sync on hide notice:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleAppCloseOrHide();
      } else if (document.visibilityState === 'visible' && !isUserActivelyTypingOrInputFocused()) {
        handleOnline();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Note: Do NOT listen to 'focus' on window to prevent interrupting Android keyboard input
    window.addEventListener('pageshow', () => {
      if (!isUserActivelyTypingOrInputFocused() && !document.hidden) {
        handleOnline();
      }
    });
    window.addEventListener('beforeunload', handleAppCloseOrHide);
    window.addEventListener('pagehide', handleAppCloseOrHide);
    window.addEventListener('unload', handleAppCloseOrHide);
    window.addEventListener('freeze', handleAppCloseOrHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen to messages from Service Worker background sync
    const handleSwMessage = (event: MessageEvent) => {
      if (
        event.data &&
        (event.data.type === 'TRIGGER_BACKGROUND_SYNC' ||
          event.data.type === 'BACKGROUND_DATA_UPDATED' ||
          event.data.type === 'SYNC_COMPLETE')
      ) {
        if (!isUserActivelyTypingOrInputFocused()) {
          handleOnline();
        }
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    // Run 5-day cycle for automatic cleanup of payments older than 1 year and periodic polling
    run5DayPruneAndPollingInspection(false).catch(() => {});

    // Periodic heartbeat (every 15s) to test database connectivity & auto-flush pending queue
    const connectionHeartbeatInterval = setInterval(async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncError(true);
        return;
      }
      if (typeof document !== 'undefined' && document.hidden) return;

      // Skip refresh while user is actively typing or an input is focused to guarantee zero input loss
      if (isUserActivelyTypingOrInputFocused()) {
        return;
      }

      const queue = getPendingQueueSync();
      const hasUnsynced = queue.some((i) => i.status !== 'synced');

      if (hasUnsynced && !isSyncingRef.current) {
        try {
          const res = await flushPendingQueue();
          setSyncError(false);
          if (res && res.flushed > 0) {
            await forceRefreshAllDataFromPostgres();
          }
        } catch (e) {
          setSyncError(true);
        }
      } else {
        // Quick lightweight version verification
        try {
          const res = await fetch('/api/sync/version', { method: 'GET', cache: 'no-store' }).catch(() => null);
          if (res && res.ok) {
            setSyncError(false);
            const data = await res.json().catch(() => null);
            if (data && data.syncVersion) {
              const lastKnownVersion = localStorage.getItem('sami_last_sync_version');
              if (String(data.syncVersion) !== lastKnownVersion) {
                localStorage.setItem('sami_last_sync_version', String(data.syncVersion));
                reconcileAllLocalWithDatabase({ force: true }).catch(() => {});
              }
            }
          }
        } catch (e) {
          // ignore transient health check
        }
      }
    }, 15000);

    let capAppStateHandle: any = null;
    let capPauseHandle: any = null;
    try {
      if (CapApp && typeof CapApp.addListener === 'function') {
        CapApp.addListener('pause', () => {
          handleAppCloseOrHide();
        }).then((h) => {
          capPauseHandle = h;
        }).catch(() => {});

        CapApp.addListener('appStateChange', (state) => {
          try {
            if (!state.isActive) {
              handleAppCloseOrHide();
            } else {
              handleOnline();
            }
          } catch (stErr) {
            console.warn('App state change notice:', stErr);
          }
        }).then((h) => {
          capAppStateHandle = h;
        }).catch(() => {});
      }
    } catch (e) {
      // ignore non-Capacitor
    }

    return () => {
      clearInterval(connectionHeartbeatInterval);
      unsubscribeQueue();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleAppCloseOrHide);
      window.removeEventListener('pagehide', handleAppCloseOrHide);
      window.removeEventListener('unload', handleAppCloseOrHide);
      window.removeEventListener('freeze', handleAppCloseOrHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      if (capAppStateHandle && typeof capAppStateHandle.remove === 'function') {
        capAppStateHandle.remove();
      }
      if (capPauseHandle && typeof capPauseHandle.remove === 'function') {
        capPauseHandle.remove();
      }
    };
  }, []);

  // Push initial history state once on app boot to support popstate interception
  useEffect(() => {
    try {
      window.history.pushState({ app: 'sami_installments' }, '');
    } catch (e) {
      // ignore
    }
  }, []);

  // One-time startup sync from PostgreSQL and enable foreground service when app boots
  useEffect(() => {
    const bootSync = async () => {
      try {
        enableForegroundService().catch(() => {});
        await flushPendingQueue();
        await silentBackgroundSync();
        await forceRefreshAllDataFromPostgres();
      } catch (err) {
        console.warn('Initial boot sync from PostgreSQL warning:', err);
      }
    };
    bootSync();
  }, []);

  // Centralized hardware back button and browser gesture-back handler
  const prevModalOpenRef = React.useRef(false);

  useEffect(() => {
    const isAnyModalOpen = !!(
      isReceiptModalOpen ||
      addPaymentModalContract ||
      isAddAppointmentModalOpen ||
      isFormModalOpen ||
      selectedContract ||
      isCustomerMapsModalOpen ||
      isAppointmentsBoxModalOpen ||
      isPaymentsHistoryOpen ||
      isInventoryModalOpen ||
      isRepsModalOpen ||
      isStatementModalOpen ||
      isSalesBoxModalOpen ||
      isPrinterSettingsOpen ||
      isRepsPaymentsSummaryOpen ||
      isBackgroundSyncOpen ||
      isOfflineConflictsOpen ||
      isServerQueriesOpen ||
      isDatabaseSchemaOpen ||
      hasActiveBackHandlers()
    );

    // Push state when transitioning from "no modals open" to "at least one modal open"
    if (isAnyModalOpen && !prevModalOpenRef.current) {
      try {
        window.history.pushState({ modalOpen: true }, '');
      } catch (e) {
        // ignore
      }
      prevModalOpenRef.current = true;
    } else if (!isAnyModalOpen && prevModalOpenRef.current) {
      prevModalOpenRef.current = false;
    }

    const handleBackAction = (): boolean => {
      // 1. First, check if any registered sub-modal/sheet handles the back action
      if (executeBackAction()) {
        return true;
      }

      // 2. Close open top-level modals in reverse hierarchy order (child/nested first)
      if (isReceiptModalOpen) {
        setIsReceiptModalOpen(false);
        setActiveReceiptData(null);
        return true;
      }
      if (addPaymentModalContract) {
        setAddPaymentModalContract(null);
        return true;
      }
      if (isAddAppointmentModalOpen) {
        setIsAddAppointmentModalOpen(false);
        setSelectedContractForAppointment(null);
        return true;
      }
      if (isFormModalOpen) {
        setIsFormModalOpen(false);
        setEditingContract(null);
        return true;
      }
      if (selectedContract) {
        setSelectedContract(null);
        return true;
      }
      if (isCustomerMapsModalOpen) {
        setIsCustomerMapsModalOpen(false);
        setCustomerMapsInitialContract(null);
        setCustomerMapsAutoDrawRoute(false);
        return true;
      }
      if (isAppointmentsBoxModalOpen) {
        setIsAppointmentsBoxModalOpen(false);
        return true;
      }
      if (isPaymentsHistoryOpen) {
        setIsPaymentsHistoryOpen(false);
        setCustomerPaymentsFilter(null);
        return true;
      }
      if (isSalesBoxModalOpen) {
        setIsSalesBoxModalOpen(false);
        return true;
      }
      if (isRepsPaymentsSummaryOpen) {
        setIsRepsPaymentsSummaryOpen(false);
        return true;
      }
      if (isStatementModalOpen) {
        setIsStatementModalOpen(false);
        return true;
      }
      if (isRepsModalOpen) {
        setIsRepsModalOpen(false);
        return true;
      }
      if (isInventoryModalOpen) {
        setIsInventoryModalOpen(false);
        return true;
      }
      if (isPrinterSettingsOpen) {
        setIsPrinterSettingsOpen(false);
        return true;
      }
      if (isBackgroundSyncOpen) {
        setIsBackgroundSyncOpen(false);
        return true;
      }
      if (isOfflineConflictsOpen) {
        setIsOfflineConflictsOpen(false);
        return true;
      }
      if (isServerQueriesOpen) {
        setIsServerQueriesOpen(false);
        return true;
      }
      if (isDatabaseSchemaOpen) {
        setIsDatabaseSchemaOpen(false);
        return true;
      }

      // If no modals are open, check if activeTab is not 'home'
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }

      return false; // Let default action occur (minimize/exit)
    };

    // 1. Web/Browser Back Gesture Handling
    const handlePopState = (e: PopStateEvent) => {
      const intercepted = handleBackAction();
      if (intercepted) {
        // Restore history state so subsequent back operations can also be intercepted
        try {
          window.history.pushState({ modalOpen: true }, '');
        } catch (err) {
          // ignore
        }
      }
    };

    window.addEventListener('popstate', handlePopState);

    // 2. Capacitor Native Back Button Handling
    let capBackHandle: any = null;
    try {
      if (CapApp && typeof CapApp.addListener === 'function') {
        CapApp.addListener('backButton', () => {
          try {
            const intercepted = handleBackAction();
            if (!intercepted) {
              runBackgroundExitSync();
              const queue = getPendingQueueSync();
              const hasUnsynced = queue.some((i) => i.status !== 'synced');
              if (hasUnsynced) {
                // Give a 600ms grace window for the beacon/keepalive packets to hit the network before minimizing
                setTimeout(() => {
                  if (CapApp && typeof CapApp.minimizeApp === 'function') {
                    CapApp.minimizeApp().catch(() => {});
                  }
                }, 600);
              } else {
                if (CapApp && typeof CapApp.minimizeApp === 'function') {
                  CapApp.minimizeApp().catch(() => {});
                }
              }
            }
          } catch (btnErr) {
            console.warn('Back button action notice:', btnErr);
          }
        }).then((h) => {
          capBackHandle = h;
        }).catch(() => {});
      }
    } catch (err) {
      // ignore non-Capacitor environments
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (capBackHandle && typeof capBackHandle.remove === 'function') {
        capBackHandle.remove();
      }
    };
  }, [
    isReceiptModalOpen,
    addPaymentModalContract,
    isAddAppointmentModalOpen,
    isFormModalOpen,
    selectedContract,
    isCustomerMapsModalOpen,
    isAppointmentsBoxModalOpen,
    isPaymentsHistoryOpen,
    isSalesBoxModalOpen,
    isRepsPaymentsSummaryOpen,
    isStatementModalOpen,
    isRepsModalOpen,
    isInventoryModalOpen,
    isPrinterSettingsOpen,
    isBackgroundSyncOpen,
    isOfflineConflictsOpen,
    isServerQueriesOpen,
    isDatabaseSchemaOpen,
    activeTab,
  ]);

  // Purge any old legacy collections (such as 'contacts' from old templates) on boot
  useEffect(() => {
    cleanupLegacyCollectionsFromFirestore().catch((err) => {
      console.warn('Legacy collection cleanup non-critical error:', err);
    });
  }, []);

  // Subscribe to PostgreSQL collections
  useEffect(() => {
    // Hydrate local snapshot from IndexedDB in case Service Worker reconciled in background while app was closed
    loadSnapshotFromIndexedDbIfAvailable().catch(() => {});

    setIsSyncing(true);
    setSyncError(false);

    // Guaranteed fallback timer to clear syncing indicator
    const syncTimer = setTimeout(() => {
      setIsSyncing(false);
    }, 1500);

    const unsubContracts = subscribeToContracts(
      (updatedContracts) => {
        const list = updatedContracts || [];
        if (isFirstContractsLoadRef.current) {
          isFirstContractsLoadRef.current = false;
          list.forEach((c) => knownContractIdsRef.current.add(c.id));
        } else {
          list.forEach((c) => {
            if (!knownContractIdsRef.current.has(c.id)) {
              knownContractIdsRef.current.add(c.id);
              const rep = currentRepRef.current;
              const hasAccess =
                !rep ||
                rep.role === 'admin' ||
                (rep.name && rep.name.includes('ضياء')) ||
                rep.id === 'rep-1' ||
                (rep.allowedListIds &&
                  (rep.allowedListIds.includes('all') || (c.listId && rep.allowedListIds.includes(c.listId))));
              if (hasAccess) {
                const priceFmt = Number(c.totalPrice || 0).toLocaleString('en-US');
                const instFmt = Number(c.dailyInstallment || 0).toLocaleString('en-US');
                showBrowserNotification(
                  isArRef.current ? '🛍️ إشعار مبيع جديد' : '🛍️ New Sale Recorded',
                  isArRef.current
                    ? `"${c.customerName}" - القسط: ${instFmt} د.ع - بقيمة (${priceFmt} د.ع) - ${c.itemName || 'مادة'} (${c.repName || 'المندوب'})`
                    : `"${c.customerName}" - Installment: ${instFmt} IQD - Total: ${priceFmt} IQD by ${c.repName || 'Rep'}`,
                  { tag: `sale_${c.id}` }
                );
              }
            }
          });
        }
        setContracts(list);
        setIsSyncing(false);
        setSyncError(false);
        if (list.length > 0) {
          precacheMapTilesForLocations(list);
        }
      },
      (err) => {
        console.warn('Contracts sync notice:', err);
        setIsSyncing(false);
      }
    );

    const unsubCustomers = subscribeToCustomers((updatedCustomers) => {
      setCustomers(updatedCustomers);
    });

    const unsubInventory = subscribeToInventory(
      (updatedInventory) => {
        const valid = (updatedInventory || []).filter((i: any) => 
          i && i.id && (i.id.startsWith('item_') || (!i.id.startsWith('emp_') && !i.id.startsWith('pay_') && !i.id.startsWith('contract_') && !i.id.startsWith('ft_') && !i.id.startsWith('emptx_')))
        );
        setInventory(valid);
      },
      (err) => {
        console.warn('Inventory sync notice:', err);
      }
    );

    const unsubPayments = subscribeToPayments(
      (updatedPayments) => {
        const valid = (updatedPayments || []).filter((p: any) => 
          p && p.id && (Number(p.amountPaid ?? p.amount) > 0) && !p.id.startsWith('contract_') && !p.id.startsWith('emp_') && !p.id.startsWith('item_')
        );
        if (isFirstPaymentsLoadRef.current) {
          isFirstPaymentsLoadRef.current = false;
          valid.forEach((p) => knownPaymentIdsRef.current.add(p.id));
        } else {
          valid.forEach((p) => {
            if (!knownPaymentIdsRef.current.has(p.id)) {
              knownPaymentIdsRef.current.add(p.id);
            }
          });
        }
        setPayments(valid);
      },
      (err) => {
        console.warn('Payments sync notice:', err);
      }
    );

    const unsubReps = subscribeToReps(
      (updatedReps) => {
        const unique = deduplicateEntitiesByName(updatedReps).map((r) => {
          if (r.name && (r.name.includes('ضياء') || r.id === 'rep-1')) {
            return {
              ...r,
              role: 'admin' as const,
              canEdit: true,
              canDelete: true,
              canMoveCustomer: true,
              canSell: true,
              allowedListIds: ['all'],
            };
          }
          return r;
        });
        setReps(unique);
        setCurrentRep((prev) => {
          if (!prev) return null;
          const match = unique.find((r) => r.id === prev.id || (r.name && r.name === prev.name));
          if (!match) {
            // Rep account was removed or deleted by admin -> force logout
            setIsPinUnlocked(false);
            try {
              localStorage.removeItem('sami_app_pin_unlocked');
              sessionStorage.removeItem('sami_app_pin_unlocked');
              localStorage.removeItem(REP_STORAGE_KEY);
            } catch (e) {}
            showToast(isAr ? 'تم حذف أو إلغاء تفعيل حساب المندوب من قبل الإدارة' : 'Account was deactivated or deleted');
            return null;
          }

          // If the user recently logged in within the last 20 seconds, give grace period for synchronization
          const prevCode = normalizePin(prev.code);
          const matchCode = normalizePin(match.code);

          if (Date.now() - loginTimestampRef.current < 20000) {
            const updated = {
              ...prev,
              ...match,
              code: prevCode || matchCode || prev.code,
            };
            try {
              localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(updated));
            } catch (e) {}
            return updated;
          }

          // Check if security PIN code was changed by admin
          // Only trigger if both have valid normalized codes and they genuinely differ
          if (prevCode && matchCode && prevCode !== matchCode) {
            // PIN changed! Force immediate logout on this device
            setIsPinUnlocked(false);
            try {
              localStorage.removeItem('sami_app_pin_unlocked');
              sessionStorage.removeItem('sami_app_pin_unlocked');
              localStorage.removeItem(REP_STORAGE_KEY);
            } catch (e) {}
            // Update local cache with latest match so login screen immediately knows new PIN!
            try {
              updateLocalCacheItem('reps', match);
            } catch (e) {}
            showToast(
              isAr
                ? `تم تغيير الرمز السري لحساب (${match.name}) من قبل الإدارة. يرجى تسجيل الدخول بالرمز الجديد`
                : 'Security PIN was updated. Please log in with the new PIN'
            );
            return null;
          }

          const updated = {
            ...prev,
            ...match,
            code: matchCode ? match.code : prev.code,
          };
          try {
            localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      },
      (err) => {
        console.warn('Reps sync notice:', err);
      }
    );

    const unsubFunds = subscribeToFunds((updatedFunds) => {
      const sorted = [...updatedFunds].sort(compareEntitiesByOrder);
      const deduped = deduplicateEntitiesByName(sorted);
      setFunds(deduped);
    });

    const unsubLists = subscribeToCustomerLists((updatedLists) => {
      const sorted = [...updatedLists].sort(compareEntitiesByOrder);
      const deduped = deduplicateEntitiesByName(sorted);
      setCustomerLists(deduped);
    });

    const unsubFundTxs = subscribeToFundTransactions((updatedTxs) => {
      setFundTransactions(updatedTxs);
    });

    const unsubEmps = subscribeToEmployees((updatedEmps) => {
      setEmployees(deduplicateEntitiesByName(updatedEmps));
    });

    const unsubEmpTxs = subscribeToEmployeeTransactions((updatedTxs) => {
      const valid = updatedTxs || [];
      if (isFirstEmpTxsLoadRef.current) {
        isFirstEmpTxsLoadRef.current = false;
        valid.forEach((t) => knownEmpTxIdsRef.current.add(t.id));
      } else {
        valid.forEach((t) => {
          if (!knownEmpTxIdsRef.current.has(t.id)) {
            knownEmpTxIdsRef.current.add(t.id);
            const rep = currentRepRef.current;
            const isTargetRep = Boolean(
              !rep ||
              rep.role === 'admin' ||
              rep.role === 'supervisor' ||
              (t.employeeName && rep.name && t.employeeName.trim().toLowerCase() === rep.name.trim().toLowerCase()) ||
              t.employeeId === rep.id ||
              t.employeeId === `rep-emp-${rep.id}` ||
              t.employeeId === `rep_${rep.id}`
            );
            if (isTargetRep) {
              const amtFmt = Number(t.amount || 0).toLocaleString('en-US');
              if (t.type === 'loan') {
                showBrowserNotification(
                  isArRef.current ? '💸 إشعار دين / سلفة' : '💸 New Debt / Advance',
                  isArRef.current
                    ? `تم تسجيل سلفة/دين بمبلغ (${amtFmt} د.ع) لـ "${t.employeeName || 'الموظف'}"${t.note ? ` - ${t.note}` : ''}`
                    : `New debt of (${amtFmt} IQD) for "${t.employeeName}"`,
                  { tag: `emp_debt_${t.id}` }
                );
              } else {
                showBrowserNotification(
                  isArRef.current ? '💵 إشعار راجع دين' : '💵 Debt Repayment',
                  isArRef.current
                    ? `تم تسجيل سداد/راجع دين بمبلغ (${amtFmt} د.ع) من "${t.employeeName || 'الموظف'}"${t.note ? ` - ${t.note}` : ''}`
                    : `Repayment of (${amtFmt} IQD) from "${t.employeeName}"`,
                  { tag: `emp_repay_${t.id}` }
                );
              }
            }
          }
        });
      }
      setEmployeeTransactions(valid);
    });

    const unsubPaymentConflicts = subscribeToPaymentConflicts((updatedConflicts) => {
      if (isFirstConflictsLoadRef.current) {
        isFirstConflictsLoadRef.current = false;
        updatedConflicts.forEach((c) => knownConflictStatusRef.current.add(`${c.id}_${c.status}`));
      }
      setPaymentConflicts(updatedConflicts);
    });

    const unsubAppointments = subscribeToAppointments((updatedAppointments) => {
      if (Array.isArray(updatedAppointments)) {
        if (isFirstApptsLoadRef.current) {
          isFirstApptsLoadRef.current = false;
          updatedAppointments.forEach((a) => knownApptIdsRef.current.add(a.id));
        } else {
          updatedAppointments.forEach((a) => {
            if (!knownApptIdsRef.current.has(a.id)) {
              knownApptIdsRef.current.add(a.id);
              const matchedC = (contractsRef.current || []).find(
                (c) => c.id === a.contractId || (a.customerName && c.customerName === a.customerName)
              );
              const effectiveListId = a.listId || matchedC?.listId;
              const rep = currentRepRef.current;
              const hasAccess =
                !rep ||
                rep.role === 'admin' ||
                (rep.name && rep.name.includes('ضياء')) ||
                rep.id === 'rep-1' ||
                (rep.allowedListIds &&
                  (rep.allowedListIds.includes('all') ||
                    (effectiveListId && rep.allowedListIds.includes(effectiveListId))));
              if (hasAccess) {
                showBrowserNotification(
                  isArRef.current ? '📅 إشعار موعد جديد' : '📅 New Appointment Scheduled',
                  isArRef.current
                    ? `"${a.customerName}" - بتاريخ ${a.appointmentDate}${a.appointmentTime ? ` الساعة ${a.appointmentTime}` : ''}${a.note ? ` (${a.note})` : ''}`
                    : `Appointment scheduled for "${a.customerName}" on ${a.appointmentDate}`,
                  { tag: `new_appt_${a.id}` }
                );
              }
            }
          });
        }
        setAppointments(updatedAppointments);
      }
    });

    return () => {
      clearTimeout(syncTimer);
      unsubContracts();
      unsubCustomers();
      unsubInventory();
      unsubPayments();
      unsubReps();
      unsubFunds();
      unsubLists();
      unsubFundTxs();
      unsubEmps();
      unsubEmpTxs();
      unsubPaymentConflicts();
      unsubAppointments();
    };
  }, []);

  // Update HTML document attributes & persistence
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  useEffect(() => {
    if (currentRep) {
      localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(currentRep));
      saveCurrentRepToIndexedDb(currentRep).catch(() => {});
    } else {
      localStorage.removeItem(REP_STORAGE_KEY);
      saveCurrentRepToIndexedDb(null).catch(() => {});
    }
  }, [currentRep]);

  // External push notifications disabled per user request
  useEffect(() => {
    // Disabled external push notifications
  }, []);

  // Real-time listener for payment conflicts:
  // 1. Alerts managers when a new pending conflict appears
  // 2. Alerts are tracked via knownConflictStatusRef to prevent repeating on startup
  useEffect(() => {
    if (!paymentConflicts) return;

    paymentConflicts.forEach((c) => {
      const statusKey = `${c.id}_${c.status}`;
      if (knownConflictStatusRef.current.has(statusKey)) return;

      // Filter notification based on who has access to the list of the contract or is the assigned rep
      const associatedContract = contracts.find(
        (con) => con.id === c.contractId || con.customerName === c.customerName
      );
      const isSupervisorOrAdmin = !currentRep || currentRep.role === 'admin' || currentRep.role === 'supervisor';
      const isAssociatedRep = Boolean(currentRep && (c.repName === currentRep.name || associatedContract?.repName === currentRep.name));
      const isAllowedList = Boolean(
        isSupervisorOrAdmin ||
        (currentRep?.allowedListIds && currentRep.allowedListIds.includes('all')) ||
        (associatedContract?.listId && currentRep?.allowedListIds && currentRep.allowedListIds.includes(associatedContract.listId))
      );

      const hasConflictAccess = isSupervisorOrAdmin || isAssociatedRep || isAllowedList;

      if (!hasConflictAccess) {
        // Still add statusKey to knownConflictStatusRef so we don't process it again if permissions change dynamically
        knownConflictStatusRef.current.add(statusKey);
        return;
      }

      // New pending conflict -> Alert all authorized users ("لكل من لدية الوصول للقائمه")
      if (c.status === 'pending_review') {
        playNotificationSound();
        showToast(
          isAr
            ? `تنبيه تعارض: دفعة معلقة جديدة بقيمة ${Number(c.attemptedAmount).toLocaleString('en-US')} د.ع للزبون "${c.customerName}"`
            : `Conflict Alert: New pending payment of ${Number(c.attemptedAmount).toLocaleString('en-US')} IQD for "${c.customerName}"`
        );
        showBrowserNotification(
          isAr ? 'تنبيه تعارض الدفعات' : 'Payment Conflict Alert',
          isAr
            ? `دفعة معلقة للزبون "${c.customerName}" تتجاوز المتبقي مضافة بواسطة المندوب ${c.repName}`
            : `Pending payment for "${c.customerName}" exceeds remaining balance by ${c.repName}`
        );
      }

      // Resolved conflict -> Alert Rep & Managers/Authorized users with settlement transparency details
      if (c.status === 'resolved') {
        const acceptedAmount =
          typeof c.acceptedAmount === 'number'
            ? c.acceptedAmount
            : Math.min(c.attemptedAmount, c.actualRemainingBalance);
        const excessAmount =
          typeof c.excessAmount === 'number'
            ? c.excessAmount
            : Math.max(0, c.attemptedAmount - acceptedAmount);

        playNotificationSound();

        // If the current logged-in rep is the one who submitted the conflict
        if (currentRep && c.repName === currentRep.name) {
          showToast(
            isAr
              ? `تنبيه تسوية: تم قبول (${acceptedAmount.toLocaleString('en-US')} د.ع) لتصفير حساب "${c.customerName}" والمبلغ الواجب إرجاعه للزبون (${excessAmount.toLocaleString('en-US')} د.ع) بحوزتك`
              : `Settled: Accepted (${acceptedAmount.toLocaleString('en-US')} IQD) for "${c.customerName}". Refund to customer in your custody: (${excessAmount.toLocaleString('en-US')} IQD)`
          );
          showBrowserNotification(
            isAr ? 'تنبيه تسوية وتصفية دفعة معلقة' : 'Payment Conflict Settled',
            isAr
              ? `تمت تصفية حساب الزبون "${c.customerName}". القيمة المقبولة: (${acceptedAmount.toLocaleString('en-US')} د.ع). المبلغ الواجب إرجاعه للزبون والمقيد بحوزتك تحت بند مبلغ راجع للزبون: (${excessAmount.toLocaleString('en-US')} د.ع).`
              : `Account settled for "${c.customerName}". Accepted: (${acceptedAmount.toLocaleString('en-US')} IQD). Refund to return to customer in your custody: (${excessAmount.toLocaleString('en-US')} IQD).`
          );
        } else {
          // General transparency notification for managers / others with access
          showToast(
            isAr
              ? `تمت تصفية حساب "${c.customerName}" بنجاح (المقبول: ${acceptedAmount.toLocaleString('en-US')} د.ع | الراجع بحوزة ${c.repName}: ${excessAmount.toLocaleString('en-US')} د.ع)`
              : `Account settled successfully for "${c.customerName}" (Accepted: ${acceptedAmount.toLocaleString('en-US')} | Refund with ${c.repName}: ${excessAmount.toLocaleString('en-US')})`
          );
          showBrowserNotification(
            isAr ? 'إشعار شفافية: تصفية حساب زبون' : 'Transparency Notice: Account Settled',
            isAr
              ? `تمت تصفية حساب الزبون "${c.customerName}" بواسطة (${c.resolvedBy || 'المدير'}). المبلغ المقبول لتصفير الحساب: (${acceptedAmount.toLocaleString('en-US')} د.ع)، والمبلغ الزائد المقيد كمبلغ راجع للزبون بحوزة المندوب (${c.repName}): (${excessAmount.toLocaleString('en-US')} د.ع).`
              : `Account settled for "${c.customerName}" by (${c.resolvedBy || 'Manager'}). Accepted amount: (${acceptedAmount.toLocaleString('en-US')}), excess refund in custody of (${c.repName}): (${excessAmount.toLocaleString('en-US')}).`
          );
        }
      }

      knownConflictStatusRef.current.add(statusKey);
    });
  }, [paymentConflicts, isAr, currentRep, contracts]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5500);
  };

  const todayStr = getLocalDateString();

  const isPaymentToday = (p: PaymentRecord) => {
    if (!p) return false;
    if (p.paymentDate && getLocalDateString(p.paymentDate) === todayStr) return true;
    if (p.createdAt && getLocalDateString(p.createdAt) === todayStr) return true;
    return false;
  };

  // 1. Current logged-in representative debt & stats calculations for the home screen cards
  const currentRepEmp = useMemo(() => {
    if (!currentRep) return null;
    return employees.find(
      (e) =>
        e.repId === currentRep.id ||
        (Boolean(e.isRep) && (e.name || '').trim().toLowerCase() === (currentRep.name || '').trim().toLowerCase()) ||
        (e.name || '').trim().toLowerCase() === (currentRep.name || '').trim().toLowerCase()
    );
  }, [employees, currentRep]);

  // Dynamically reconcile contracts with live payments so deletion/update always instantly updates totalPaid, remainingBalance, and status
  const contractsWithLiveBalances = useMemo(() => {
    return contracts.map((c) => {
      const cNameNorm = normalizeEntityName(c.customerName);
      const cPayments = payments.filter((p) => {
        if (p.contractId && String(p.contractId).trim()) {
          return p.contractId === c.id;
        }
        if (p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm) {
          return true;
        }
        return false;
      });
      const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
      const net = Math.max(0, (Number(c.totalPrice) || 0) - (Number(c.advancePayment) || 0));
      const totalPaid = net > 0 ? Math.min(net, paymentsSum) : paymentsSum;
      const excessAmount = Math.max(0, paymentsSum - net);
      let remainingBalance = Math.max(0, net - paymentsSum);
      if (remainingBalance > 0 && remainingBalance <= 2 && (Number(c.remainingBalance || 0) <= 5 || paymentsSum >= net - 2)) {
        remainingBalance = 0;
      }
      const status: 'active' | 'completed' = (remainingBalance === 0 && paymentsSum > 0 && net > 0) ? 'completed' : 'active';

      return {
        ...c,
        totalPaid,
        excessAmount,
        rawTotalPaid: paymentsSum,
        remainingBalance,
        status,
      } as InstallmentContract;
    });
  }, [contracts, payments]);

  const liveSelectedContract = useMemo(() => {
    if (!selectedContract) return null;
    return contractsWithLiveBalances.find((c) => c.id === selectedContract.id) || selectedContract;
  }, [selectedContract, contractsWithLiveBalances]);

  // Rep's assigned contracts and collections
  const repContracts = useMemo(() => {
    if (!currentRep || currentRep.role === 'admin' || currentRep.role === 'supervisor') {
      return contractsWithLiveBalances;
    }
    if (currentRep.allowedListIds && currentRep.allowedListIds.includes('all')) {
      return contractsWithLiveBalances;
    }
    if (currentRep.allowedListIds && currentRep.allowedListIds.length > 0) {
      return contractsWithLiveBalances.filter((c) => {
        const matchesListId = c.listId && currentRep.allowedListIds!.includes(c.listId);
        const matchesListName = customerLists.some(
          (l) => currentRep.allowedListIds!.includes(l.id) && c.listName && c.listName.trim() === l.name.trim()
        );
        return matchesListId || matchesListName;
      });
    }
    return contractsWithLiveBalances;
  }, [contractsWithLiveBalances, currentRep, customerLists]);

  const repRemainingCustomerDebt = useMemo(() => {
    return repContracts.reduce((sum, c) => sum + (Number(c.remainingBalance) || 0), 0);
  }, [repContracts]);

  // Count of customers with locations accessible to the current user
  const accessibleContractsWithLocationCount = useMemo(() => {
    const isListAllowed = (listId?: string | null): boolean => {
      if (!currentRep || currentRep.role === 'admin' || currentRep.role === 'supervisor') return true;
      if (!currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) return true;
      if (!listId) return true;
      return currentRep.allowedListIds.includes(listId);
    };
    return contractsWithLiveBalances.filter(
      (c) =>
        isListAllowed(c.listId) &&
        c.latitude != null &&
        c.longitude != null &&
        !isNaN(Number(c.latitude)) &&
        !isNaN(Number(c.longitude)) &&
        Number(c.latitude) !== 0
    ).length;
  }, [contractsWithLiveBalances, currentRep]);

  const repPayments = useMemo(() => {
    // 1. Admin: sees all payments
    if (!currentRep || currentRep.role === 'admin') {
      return payments;
    }

    // 2. Supervisor: sees payments for all lists allowed to them
    if (currentRep.role === 'supervisor') {
      if (!currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
        return payments;
      }
      const allowedSet = new Set(currentRep.allowedListIds);
      return payments.filter((p) => {
        const c = contractsWithLiveBalances.find((con) => con.id === p.contractId);
        return c?.listId ? allowedSet.has(c.listId) : false;
      });
    }

    // 3. Regular Rep: strictly sees ONLY their own payments
    const repCleanName = currentRep.name ? (currentRep.name || '').trim().toLowerCase() : '';
    return payments.filter((p) => {
      if (p.repName && repCleanName && (p.repName || '').trim().toLowerCase() === repCleanName) {
        return true;
      }
      return false;
    });
  }, [payments, contractsWithLiveBalances, currentRep]);

  const repTotalCollected = useMemo(() => {
    return repPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  }, [repPayments]);

  const repTodayPayments = useMemo(() => {
    return repPayments.filter(isPaymentToday);
  }, [repPayments, todayStr]);

  const repTodayCollected = useMemo(() => {
    return repTodayPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  }, [repTodayPayments]);

  const todayAllPayments = useMemo(() => {
    return payments.filter(isPaymentToday);
  }, [payments, todayStr]);

  const todayAllCollected = useMemo(() => {
    return todayAllPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
  }, [todayAllPayments]);

  const notifiedAppointmentsRef = useRef<Set<string>>((() => {
    try {
      const stored = localStorage.getItem('alkarrar_notified_appts_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set<string>(parsed);
      }
    } catch {}
    return new Set<string>();
  })());
  const hasInitializedAppointmentsRef = useRef<boolean>(false);

  // Check appointments in real-time and alert ONLY AT THEIR EXACT TIME (وليس عند إضافة الموعد أو قبله)
  useEffect(() => {
    if (!appointments || appointments.length === 0) return;

    const checkDueAppointments = () => {
      const now = new Date();
      const currentToday = getLocalDateString(now);

      appointments.forEach((app) => {
        if (app.status === 'completed' || app.status === 'cancelled') return;

        // Check if representative is allowed to see this appointment's list
        const matchedContract = contractsWithLiveBalances.find((c) => c.id === app.contractId || (app.customerName && c.customerName.trim().toLowerCase() === app.customerName.trim().toLowerCase()));
        const effectiveListId = app.listId || matchedContract?.listId;

        if (currentRep && currentRep.role !== 'admin' && currentRep.role !== 'supervisor') {
          if (!currentRep.allowedListIds || currentRep.allowedListIds.length === 0) {
            return;
          }
          if (!currentRep.allowedListIds.includes('all')) {
            if (!effectiveListId || !currentRep.allowedListIds.includes(effectiveListId)) {
              return;
            }
          }
        }

        const isDue = isAppointmentDueForNotification(app, contractsWithLiveBalances, now);
        if (isDue) {
          const apptTime = app.appointmentTime || app.dueTime || '';
          const alertKey = `${app.id}_${currentToday}_${apptTime}`;

          if (!notifiedAppointmentsRef.current.has(alertKey)) {
            notifiedAppointmentsRef.current.add(alertKey);
            try {
              const arr = Array.from(notifiedAppointmentsRef.current).slice(-200);
              localStorage.setItem('alkarrar_notified_appts_v2', JSON.stringify(arr));
            } catch {}

            // If this is the initial load on app boot, record without blaring audio for old appointments
            if (!hasInitializedAppointmentsRef.current) {
              return;
            }

            // Real-time alert right when the appointment time arrives - Sound + Text ONCE
            const timeLabel = apptTime ? ` [الساعة ${apptTime}]` : '';
            showToast(
              isAr
                ? `⏰ حان موعد الزبون "${app.customerName}" الآن${timeLabel}`
                : `⏰ Appointment due now for "${app.customerName}"${timeLabel}`
            );
            showBrowserNotification(
              isAr ? 'تنبيه موعد مستحق الآن' : 'Appointment Due Now',
              isAr
                ? `حان موعد الزبون "${app.customerName}"${app.note ? ` (${app.note})` : ''}${timeLabel}`
                : `Appointment due for "${app.customerName}"${app.note ? ` (${app.note})` : ''}${timeLabel}`,
              { tag: alertKey }
            );
          }
        }
      });

      hasInitializedAppointmentsRef.current = true;
    };

    checkDueAppointments();
    const interval = setInterval(checkDueAppointments, 20000);
    return () => clearInterval(interval);
  }, [appointments, contractsWithLiveBalances, currentRep, isAr]);

  // Helper to compute live debt from all transactions (all loans minus all repayments)
  const computeDebtForPerson = (person: { id?: string; name?: string; repId?: string; debtBalance?: number; totalDebt?: number }) => {
    const txs = employeeTransactions.filter((t) => {
      if (!t) return false;
      if (person.id && t.employeeId === person.id) return true;
      if (person.repId && (t.employeeId === person.repId || t.employeeId === `rep-emp-${person.repId}`)) return true;
      if (t.employeeId && t.employeeId.startsWith('rep-emp-') && person.id === t.employeeId.replace('rep-emp-', '')) return true;
      if (person.name && t.repName && (t.repName || '').trim().toLowerCase() === (person.name || '').trim().toLowerCase()) return true;
      return false;
    });

    if (txs.length === 0) {
      return Number(person.debtBalance ?? person.totalDebt ?? 0);
    }

    const loans = txs
      .filter((t) => t.type === 'loan' || (t.type as string) === 'debt' || (t.type as string) === 'سلفة' || (t.type as string) === 'دين')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const repays = txs
      .filter((t) => t.type === 'repay' || (t.type as string) === 'repayment' || (t.type as string) === 'سداد' || (t.type as string) === 'راجع دين')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return Math.max(0, loans - repays);
  };

  const currentRepDebt = useMemo(() => {
    if (!currentRep) return 0;
    const repPerson = currentRepEmp || { id: `rep-emp-${currentRep.id}`, repId: currentRep.id, name: currentRep.name, isRep: true, debtBalance: 0 };
    return computeDebtForPerson(repPerson);
  }, [currentRep, currentRepEmp, employeeTransactions]);

  // Admin calculations across employees (cumulative debts & count)
  const { totalAllStaffDebts, totalStaffCount } = useMemo(() => {
    let sum = 0;
    employees.forEach((emp) => {
      sum += computeDebtForPerson(emp);
    });
    return {
      totalAllStaffDebts: sum,
      totalStaffCount: employees.length,
    };
  }, [employees, employeeTransactions]);

  const totalAllCollected = useMemo(() => {
    return payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
  }, [payments]);

  const totalAllCustomerDebt = useMemo(() => {
    return contractsWithLiveBalances.reduce((sum, c) => sum + (Number(c.remainingBalance) || 0), 0);
  }, [contractsWithLiveBalances]);

  const totalFundsBalance = useMemo(() => {
    return funds.reduce((sum, f) => sum + (Number(f.balance) || 0), 0);
  }, [funds]);

  // Quick Pay from Card - Opens Payment Window & Receipt Printing
  const handleQuickPay = (e: React.MouseEvent, contract: InstallmentContract) => {
    e.stopPropagation();
    setAddPaymentModalContract(contract);
  };

  // View Payments History for specific customer card
  const handleViewCustomerPayments = (e: React.MouseEvent, contract: InstallmentContract) => {
    e.stopPropagation();
    setCustomerPaymentsFilter(contract.id);
    setIsPaymentsHistoryOpen(true);
  };

  const handleClosePaymentsHistory = useCallback(() => {
    setIsPaymentsHistoryOpen(false);
    setCustomerPaymentsFilter(null);
  }, []);

  const handleCloseCustomerStatement = useCallback(() => {
    setIsStatementModalOpen(false);
  }, []);

  // Record custom payment from details modal or add payment window
  const handleRecordCustomPayment = async (
    contract: InstallmentContract,
    amount: number,
    note?: string,
    receiptDetails?: ReceiptData,
    shouldAutoPrint: boolean = true,
    locationCoords?: { latitude: number; longitude: number; address?: string }
  ) => {
    if (amount <= 0 || isNaN(amount)) {
      showToast(isAr ? 'يرجى إدخال مبلغ تسديد صالح أكبر من الصفر' : 'Please enter a valid payment amount greater than zero');
      return;
    }

    // منع إضافة دفع للزبائن الذين لم يثبت لهم موقع إذا كان الـ GPS غير مفعل
    const hasSavedCustomerCoords = Boolean(
      contract.latitude != null &&
      contract.longitude != null &&
      !isNaN(Number(contract.latitude)) &&
      !isNaN(Number(contract.longitude)) &&
      Number(contract.latitude) !== 0 &&
      Number(contract.longitude) !== 0
    );

    const hasIncomingGpsCoords = Boolean(
      locationCoords &&
      locationCoords.latitude != null &&
      locationCoords.longitude != null &&
      !isNaN(locationCoords.latitude) &&
      !isNaN(locationCoords.longitude) &&
      Number(locationCoords.latitude) !== 0 &&
      Number(locationCoords.longitude) !== 0
    );

    if (!hasSavedCustomerCoords && !hasIncomingGpsCoords) {
      showToast(
        isAr
          ? '⛔ تم منع إضافة الدفعة: هذا الزبون لم يثبت له موقع على الخريطة والـ GPS غير مفعل.'
          : 'Payment prevented: Customer has no saved location and GPS is disabled.'
      );
      return;
    }

    // Validate that payment amount does not exceed customer's remaining balance
    const netFinanced = Math.max(0, (contract.totalPrice || 0) - (contract.advancePayment || 0));
    const currentRemaining =
      typeof contract.remainingBalance === 'number'
        ? contract.remainingBalance
        : Math.max(0, netFinanced - (contract.totalPaid || 0));

    if (amount > currentRemaining && amount > 0) {
      const isOfflineMode = !navigator.onLine;

      const conflictRecord: PaymentConflictRecord = {
        id: `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        contractId: contract.id,
        customerName: contract.customerName,
        attemptedAmount: amount,
        actualRemainingBalance: currentRemaining,
        excessAmount: amount - currentRemaining,
        repName: currentRep?.name || 'مندوب',
        note: note || (isOfflineMode ? 'تسديد أوفلاين تجاوز الرصيد المتبقي' : 'تسديد تجاوز الرصيد المتبقي'),
        paymentDate: todayStr,
        createdAt: new Date().toISOString(),
        status: 'pending_review',
      };

      try {
        knownConflictStatusRef.current.add(`${conflictRecord.id}_${conflictRecord.status}`);
        await recordPaymentConflictInFirestore(conflictRecord);
        playNotificationSound();
        showBrowserNotification(
          isAr ? 'تنبيه: دفعة معلقة وتحت المراجعة' : 'Alert: Pending Payment Conflict',
          isAr
            ? `تم تسجيل دفعة بقيمة ${amount.toLocaleString('en-US')} د.ع للزبون "${contract.customerName}" تتجاوز المتبقي. تم إرسال إشعار للمدير للمراجعة والتصفية.`
            : `Payment of ${amount.toLocaleString('en-US')} IQD for "${contract.customerName}" exceeds remaining balance. Manager alerted.`
        );
        showToast(
          isAr
            ? `تم تسجيل دفعة معلقة للزبون "${contract.customerName}" وتحت مراجعة المدير لتصفيتها`
            : `Conflict recorded: Payment for "${contract.customerName}" saved for review`
        );
      } catch (err) {
        console.error('Error recording payment conflict:', err);
      }
      return;
    }

    try {
      showToast(isAr ? 'جاري حفظ الدفعة وتحديث الموقع...' : 'Saving payment & location...');

      const newTotalPaid = (Number(contract.totalPaid) || 0) + amount;
      const netFinanced = Math.max(0, (Number(contract.totalPrice) || 0) - (Number(contract.advancePayment) || 0));
      const newRemaining = Math.max(0, netFinanced - newTotalPaid);
      const newStatus = newRemaining === 0 ? 'completed' : 'active';
      const completedAtVal = newStatus === 'completed' ? (contract.completedAt || new Date().toISOString()) : undefined;

      let resolvedFundId: string | null = null;
      const targetList = customerLists.find((l) => l.id === contract.listId || l.name === contract.listName);
      if (targetList?.fundId || (targetList as any)?.fund_id) {
        resolvedFundId = targetList.fundId || (targetList as any).fund_id;
      }
      if (!resolvedFundId && funds.length > 0) {
        resolvedFundId = funds[0].id;
      }

      const hasGpsLocation = Boolean(
        locationCoords &&
        locationCoords.latitude != null &&
        locationCoords.longitude != null &&
        !isNaN(locationCoords.latitude) &&
        !isNaN(locationCoords.longitude)
      );

      const updatedContractLatitude = hasGpsLocation ? locationCoords!.latitude : contract.latitude;
      const updatedContractLongitude = hasGpsLocation ? locationCoords!.longitude : contract.longitude;
      const updatedContractLocAddress = hasGpsLocation
        ? (locationCoords!.address || contract.customerAddress || `موقع تسديد (${todayStr})`)
        : (contract.locationAddress || contract.customerAddress);
      const updatedContractLocUpdated = hasGpsLocation ? new Date().toISOString() : contract.locationUpdatedAt;

      const newPaymentId = generateUniqueId('pay');
      const newPaymentRecord: PaymentRecord = {
        id: newPaymentId,
        contractId: contract.id,
        customerName: contract.customerName,
        amountPaid: amount,
        paymentDate: todayStr,
        repName: currentRep?.name || 'مندوب',
        note: note || '',
        fundId: resolvedFundId,
        latitude: hasGpsLocation ? locationCoords!.latitude : undefined,
        longitude: hasGpsLocation ? locationCoords!.longitude : undefined,
        totalPaidSnapshot: newTotalPaid,
        remainingBalanceSnapshot: newRemaining,
        createdAt: new Date().toISOString(),
      };

      // 1. Instantly update payments state in React
      setPayments((prev) => [newPaymentRecord, ...prev]);

      // 2. Instantly reflect payment in funds and fund transactions in React
      if (resolvedFundId && amount > 0) {
        setFunds((prev) =>
          prev.map((f) =>
            f.id === resolvedFundId ? { ...f, balance: (Number(f.balance) || 0) + amount } : f
          )
        );
        const newFt: FundTransaction = {
          id: `ft_pay_${newPaymentId}`,
          fundId: resolvedFundId,
          type: 'installment',
          amount,
          note: `تسديد قسط زبون: ${contract.customerName}`,
          repName: currentRep?.name || 'مندوب',
          createdAt: new Date().toISOString(),
        };
        setFundTransactions((prev) => [newFt, ...prev]);
      }

      // Update customer contract with new totals and newly pinned GPS location for Customer Maps
      setContracts((prev) =>
        prev.map((c) =>
          c.id === contract.id
            ? {
                ...c,
                totalPaid: newTotalPaid,
                remainingBalance: newRemaining,
                status: newStatus,
                completedAt: completedAtVal,
                latitude: updatedContractLatitude,
                longitude: updatedContractLongitude,
                locationAddress: updatedContractLocAddress,
                locationUpdatedAt: updatedContractLocUpdated,
              }
            : c
        )
      );

      if (selectedContract && selectedContract.id === contract.id) {
        setSelectedContract({
          ...selectedContract,
          totalPaid: newTotalPaid,
          remainingBalance: newRemaining,
          status: newStatus,
          completedAt: completedAtVal,
          latitude: updatedContractLatitude,
          longitude: updatedContractLongitude,
          locationAddress: updatedContractLocAddress,
          locationUpdatedAt: updatedContractLocUpdated,
        });
      }

      // 3. Record in database / local cache & offline sync queue
      let res: { isConflict: boolean; conflictRecord?: PaymentConflictRecord } | undefined;
      try {
        res = await recordPaymentInFirestore(newPaymentRecord);
      } catch (dbErr) {
        console.warn('recordPaymentInFirestore offline fallback in App.tsx:', dbErr);
      }

      // Update customer location in database / offline queue if GPS location was provided
      if (hasGpsLocation && locationCoords) {
        updateCustomerLocation(
          contract.id,
          locationCoords.latitude,
          locationCoords.longitude,
          updatedContractLocAddress
        ).catch((locErr) => console.warn('updateCustomerLocation from payment notice:', locErr));
      }

      if (res && res.isConflict && res.conflictRecord) {
        // Rollback optimistic payment if it was blocked by server conflict
        setPayments((prev) => prev.filter((p) => p.id !== newPaymentId));
        playNotificationSound();
        showBrowserNotification(
          isAr ? 'تنبيه: دفعة محجوبة (تعارض تسديد)' : 'Alert: Intercepted Payment Conflict',
          isAr
            ? `تم حجب الدفعة بمبلغ ${amount.toLocaleString('en-US')} د.ع للزبون "${contract.customerName}" لأن الرصيد المتبقي الحقيقي على السيرفر هو (${Number(res.conflictRecord.actualRemainingBalance).toLocaleString('en-US')} د.ع). تم إرسال إشعار للمدير للمراجعة والتصفية.`
            : `Payment of ${amount.toLocaleString('en-US')} IQD for "${contract.customerName}" intercepted on server. Manager alerted.`
        );
        showToast(
          isAr
            ? `تم حجب الدفعة للزبون "${contract.customerName}" وتحويلها إلى دفعة معلقة تحت المراجعة`
            : `Payment blocked & saved as conflict for review`
        );
        return;
      }

      knownPaymentIdsRef.current.add(newPaymentId);

      showToast(
        hasGpsLocation
          ? (isAr ? 'تم تسديد القسط وتثبيت موقع الزبون على الخريطة 📍' : 'Payment recorded & customer location pinned on map 📍')
          : (isAr ? 'تم تسديد القسط بنجاح' : 'Payment recorded successfully')
      );

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      const normListName = contract.listName ? String(contract.listName).trim().toLowerCase() : '';
      const linkedList = customerLists.find((l) => 
        (contract.listId && String(l.id) === String(contract.listId)) ||
        (normListName && l.name && String(l.name).trim().toLowerCase() === normListName)
      );
      const receiptTemplate = (linkedList as any)?.receiptTemplate || (linkedList as any)?.receipt_template || 'template_1';

      const receiptObj: ThermalReceiptData = {
        shopTitle: 'الكرار للموبايل',
        receiptNo: String(receiptDetails?.receiptNo || (payments.length + 1)),
        customerName: contract.customerName,
        itemName: contract.itemName,
        totalPrice: contract.totalPrice,
        totalPaid: newTotalPaid,
        remainingBalance: newRemaining,
        paidAmount: amount,
        amountInWords: receiptDetails?.amountInWords || '',
        dateStr: receiptDetails?.dateStr || todayStr,
        timeStr: receiptDetails?.timeStr || timeStr,
        template: receiptTemplate,
      };

      // Direct print without preview modal (user requested: والغي معاينه وصل الطباعه)
      setActiveReceiptData(receiptObj);
      if (shouldAutoPrint !== false) {
        directPrintReceipt(receiptObj);
      }
    } catch (err) {
      console.error('Failed to record custom payment:', err);
      showToast(isAr ? 'تم تسديد القسط بنجاح (أوفلاين)' : 'Payment recorded (Offline)');
    }
  };

  // Update Payment Record
  const handleUpdatePayment = async (
    payment: PaymentRecord,
    newAmount: number,
    newNote?: string,
    newPaymentDate?: string,
    newRepName?: string
  ) => {
    // Only admin can edit payments
    if (currentRep?.role !== 'admin') {
      showToast(isAr ? 'عفواً، تعديل الدفعات متاح للمدير العام فقط' : 'Payment editing is restricted to Admin only');
      return;
    }

    try {
      const updatedPaymentObj: PaymentRecord = {
        ...payment,
        amountPaid: newAmount,
        amount: newAmount,
        note: newNote !== undefined ? newNote : payment.note,
        paymentDate: newPaymentDate || payment.paymentDate,
        repName: newRepName !== undefined ? newRepName : payment.repName,
        isEdited: true,
        updatedAt: new Date().toISOString(),
      };

      const updatedPayments = payments.map((p) =>
        p.id === payment.id ? updatedPaymentObj : p
      );
      // Optimistically update payment record in local state
      setPayments(updatedPayments);

      const targetContract = contracts.find(
        (c) =>
          (payment.contractId && c.id && payment.contractId === c.id) ||
          (!payment.contractId && payment.customerName && c.customerName && normalizeEntityName(payment.customerName) === normalizeEntityName(c.customerName))
      );
      if (targetContract) {
        const cPayments = updatedPayments.filter(
          (p) =>
            (p.contractId && targetContract.id && p.contractId === targetContract.id) ||
            (!p.contractId && p.customerName && targetContract.customerName && normalizeEntityName(p.customerName) === normalizeEntityName(targetContract.customerName))
        );
        const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
        const newTotalPaid = cPayments.length > 0 ? paymentsSum : 0;
        const netFinanced = Math.max(0, targetContract.totalPrice - targetContract.advancePayment);
        let newRemaining = Math.max(0, netFinanced - newTotalPaid);
        if (newRemaining > 0 && newRemaining <= 2 && (Number(targetContract.remainingBalance || 0) <= 5 || newTotalPaid >= netFinanced - 2)) {
          newRemaining = 0;
        }
        const newStatus = newRemaining === 0 ? 'completed' : 'active';
        
        let newLastDate: string | undefined = undefined;
        if (cPayments.length > 0) {
          const sorted = [...cPayments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
          if (sorted[0]?.paymentDate) {
            newLastDate = getLocalDateString(sorted[0].paymentDate);
          }
        }

        setContracts((prev) =>
          prev.map((c) =>
            c.id === targetContract.id
              ? {
                  ...c,
                  totalPaid: newTotalPaid,
                  remainingBalance: newRemaining,
                  status: newStatus,
                }
              : c
          )
        );

        if (
          selectedContract &&
          selectedContract.id === targetContract.id
        ) {
          setSelectedContract({
            ...selectedContract,
            totalPaid: newTotalPaid,
            remainingBalance: newRemaining,
            status: newStatus,
          });
        }
      }

      // Adjust fund in React state if amount changed
      const oldAmt = Number(payment.amountPaid ?? payment.amount) || 0;
      const diff = newAmount - oldAmt;
      let targetFundId = payment.fundId;
      if (!targetFundId && targetContract) {
        const targetList = customerLists.find((l) => l.id === targetContract.listId || l.name === targetContract.listName);
        targetFundId = targetList?.fundId || (targetList as any)?.fund_id || (funds.length > 0 ? funds[0].id : null);
      }
      if (targetFundId && diff !== 0) {
        setFunds((prev) =>
          prev.map((f) =>
            f.id === targetFundId ? { ...f, balance: Math.max(0, (Number(f.balance) || 0) + diff) } : f
          )
        );
        setFundTransactions((prev) =>
          prev.map((ft) =>
            ft.id === `ft_pay_${payment.id}`
              ? { ...ft, amount: newAmount, note: newNote !== undefined ? newNote : ft.note, repName: newRepName !== undefined ? newRepName : ft.repName }
              : ft
          )
        );
      }

      await updatePaymentInFirestore(
        payment.id,
        {
          amountPaid: newAmount,
          amount: newAmount,
          note: newNote !== undefined ? newNote : payment.note,
          paymentDate: newPaymentDate || payment.paymentDate,
          repName: newRepName !== undefined ? newRepName : payment.repName,
          fundId: targetFundId || payment.fundId,
          contractId: payment.contractId,
        },
        contracts
      );
      showToast(isAr ? 'تم تعديل الدفعة وإعادة احتساب الرصيد بنجاح' : 'Payment updated and balance recalculated successfully');
    } catch (err) {
      console.error('Failed to update payment:', err);
      showToast(isAr ? 'حدث خطأ أثناء تعديل الدفعة' : 'Error updating payment');
    }
  };

  // Delete Payment Record
  const handleDeletePayment = async (payment: PaymentRecord) => {
    try {
      setPayments((prev) => prev.filter((p) => p.id !== payment.id));

      const targetContract = contracts.find(
        (c) =>
          (payment.contractId && c.id && String(payment.contractId).trim() === String(c.id).trim()) ||
          (payment.customerName && c.customerName && normalizeEntityName(payment.customerName) === normalizeEntityName(c.customerName))
      );

      // Immediately deduct from React funds and remove from fund transactions
      let targetFundId = payment.fundId;
      if (!targetFundId && targetContract) {
        const targetList = customerLists.find((l) => l.id === targetContract.listId || l.name === targetContract.listName);
        targetFundId = targetList?.fundId || (targetList as any)?.fund_id || (funds.length > 0 ? funds[0].id : null);
      }
      const payAmt = Number(payment.amountPaid ?? payment.amount) || 0;
      if (targetFundId && payAmt > 0) {
        setFunds((prev) =>
          prev.map((f) =>
            f.id === targetFundId ? { ...f, balance: Math.max(0, (Number(f.balance) || 0) - payAmt) } : f
          )
        );
        setFundTransactions((prev) => prev.filter((ft) => ft.id !== `ft_pay_${payment.id}`));
      }

      if (targetContract) {
        const remainingPayments = payments.filter((p) => p.id !== payment.id);
        const cPayments = remainingPayments.filter(
          (p) =>
            (p.contractId && targetContract.id && String(p.contractId).trim() === String(targetContract.id).trim()) ||
            (p.customerName && targetContract.customerName && normalizeEntityName(p.customerName) === normalizeEntityName(targetContract.customerName))
        );
        const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
        const newTotalPaid = cPayments.length > 0 ? paymentsSum : 0;
        const netFinanced = Math.max(0, targetContract.totalPrice - targetContract.advancePayment);
        const newRemaining = Math.max(0, netFinanced - newTotalPaid);
        const newStatus = (newRemaining === 0 && paymentsSum > 0 && netFinanced > 0) ? 'completed' : 'active';

        setContracts((prev) =>
          prev.map((c) =>
            c.id === targetContract.id
              ? {
                  ...c,
                  totalPaid: newTotalPaid,
                  remainingBalance: newRemaining,
                  status: newStatus,
                }
              : c
          )
        );

        if (
          selectedContract &&
          selectedContract.id === targetContract.id
        ) {
          setSelectedContract({
            ...selectedContract,
            totalPaid: newTotalPaid,
            remainingBalance: newRemaining,
            status: newStatus,
          });
        }
      }

      try {
        await deletePaymentFromFirestore(payment, contracts);
      } catch (dbErr) {
        console.warn('deletePaymentFromFirestore offline fallback in App.tsx:', dbErr);
      }
      showToast(isAr ? 'تم حذف القسط وتحديث الواصل والمتبقي للزبون وصندوق القائمة' : 'Payment deleted and balances updated');
    } catch (err) {
      console.error('Failed to delete payment:', err);
      showToast(isAr ? 'حدث خطأ أثناء حذف القسط' : 'Error deleting payment');
    }
  };

  // Delete Multiple Payments (Bulk)
  const handleDeleteMultiplePayments = async (paymentsToDelete: PaymentRecord[]) => {
    if (!paymentsToDelete || paymentsToDelete.length === 0) return;
    try {
      const toDeleteIds = new Set(paymentsToDelete.map((p) => p.id));
      setPayments((prev) => prev.filter((p) => !toDeleteIds.has(p.id)));

      // Find affected contracts and recalculate balances
      const affectedContracts = contracts.filter((c) =>
        paymentsToDelete.some(
          (p) =>
            (p.contractId && c.id && String(p.contractId).trim() === String(c.id).trim()) ||
            (p.customerName && c.customerName && normalizeEntityName(p.customerName) === normalizeEntityName(c.customerName))
        )
      );

      if (affectedContracts.length > 0) {
        const remainingAll = payments.filter((p) => !toDeleteIds.has(p.id));
        setContracts((prev) =>
          prev.map((c) => {
            const isTarget = affectedContracts.some((ac) => ac.id === c.id);
            if (!isTarget) return c;

            const cPayments = remainingAll.filter(
              (p) =>
                (p.contractId && c.id && String(p.contractId).trim() === String(c.id).trim()) ||
                (p.customerName && c.customerName && normalizeEntityName(p.customerName) === normalizeEntityName(c.customerName))
            );
            const paymentsSum = cPayments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
            const newTotalPaid = cPayments.length > 0 ? paymentsSum : 0;
            const netFinanced = Math.max(0, c.totalPrice - c.advancePayment);
            const newRemaining = Math.max(0, netFinanced - newTotalPaid);
            const newStatus = (newRemaining === 0 && paymentsSum > 0 && netFinanced > 0) ? 'completed' : 'active';

            return {
              ...c,
              totalPaid: newTotalPaid,
              remainingBalance: newRemaining,
              status: newStatus,
            };
          })
        );
      }

      // Optimistically adjust funds for multiple deleted payments
      const fundDeltas = new Map<string, number>();
      for (const p of paymentsToDelete) {
        const payAmt = Number(p.amountPaid ?? p.amount) || 0;
        if (payAmt <= 0) continue;
        let tFundId = p.fundId;
        if (!tFundId && p.contractId) {
          const c = contracts.find((ct) => ct.id === p.contractId);
          const list = customerLists.find((l) => l.id === c?.listId || (l.name && c?.listName && normalizeEntityName(l.name) === normalizeEntityName(c?.listName)));
          tFundId = list?.fundId;
        }
        if (!tFundId && p.customerName) {
          const c = contracts.find((ct) => ct.customerName && normalizeEntityName(ct.customerName) === normalizeEntityName(p.customerName));
          const list = customerLists.find((l) => l.id === c?.listId || (l.name && c?.listName && normalizeEntityName(l.name) === normalizeEntityName(c?.listName)));
          tFundId = list?.fundId;
        }
        const matchedList = customerLists.find((l) => l.id === tFundId || (l.name && normalizeEntityName(l.name) === normalizeEntityName(tFundId)));
        if (matchedList?.fundId) {
          tFundId = matchedList.fundId;
        }
        if (tFundId) {
          fundDeltas.set(tFundId, (fundDeltas.get(tFundId) || 0) + payAmt);
        }
      }
      if (fundDeltas.size > 0) {
        setFunds((prev) =>
          prev.map((f) => {
            const deduction = fundDeltas.get(f.id);
            if (deduction) {
              return { ...f, balance: Math.max(0, (Number(f.balance) || 0) - deduction) };
            }
            return f;
          })
        );
        setFundTransactions((prev) => prev.filter((ft) => !toDeleteIds.has(ft.id.replace('ft_pay_', ''))));
      }

      await deleteMultiplePaymentsFromFirestore(paymentsToDelete, contracts);
      showToast(isAr ? `تم حذف (${paymentsToDelete.length}) تسديد بنجاح وتحديث الحسابات وصندوق القائمة` : `Successfully deleted ${paymentsToDelete.length} payments`);
    } catch (err) {
      console.error('Failed to delete multiple payments:', err);
      showToast(isAr ? 'حدث خطأ أثناء حذف التسديدات المحددة' : 'Error deleting selected payments');
    }
  };

  // Direct Phone Call
  const handleCall = (e: React.MouseEvent, phone: string) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = `tel:${phone}`;
    link.click();
    showToast(isAr ? `جاري الاتصال برقم ${phone}` : `Dialing ${phone}`);
  };

  // New Sale for existing Customer
  const handleNewSaleForCustomer = (e: React.MouseEvent, contract: InstallmentContract) => {
    e.stopPropagation();
    if (currentRep?.role !== 'admin' && currentRep?.canSell === false) {
      showToast(isAr ? 'عفواً، لا تملك صلاحية إجراء مبيعات جديدة' : 'You do not have permission to create sales');
      return;
    }
    setEditingContract({
      id: '',
      customerName: contract.customerName,
      customerPhone: contract.customerPhone,
      customerAddress: contract.customerAddress || '',
      listId: contract.listId || '',
      listName: contract.listName || '',
      itemName: '',
      totalPrice: 0,
      advancePayment: 0,
      dailyInstallment: 0,
      remainingBalance: 0,
      totalPaid: 0,
      startDate: getLocalDateString(),
      createdAt: new Date().toISOString(),
      status: 'active',
    });
    setIsFormModalOpen(true);
  };

  // Save Contract (Add / Edit)
  const handleSaveContract = async (
    contractData: Omit<InstallmentContract, 'id' | 'createdAt' | 'totalPaid'>,
    editingId?: string,
    quantityDeducted: number = 1
  ) => {
    try {
      const ensuredListId = contractData.listId || (selectedListId !== 'all' ? selectedListId : (customerLists[0]?.id || ''));
      const ensuredListName = contractData.listName || customerLists.find(l => l.id === ensuredListId)?.name || customerLists[0]?.name || '';

      const finalData = {
        ...contractData,
        listId: ensuredListId,
        listName: ensuredListName,
        repName: contractData.repName || currentRep?.name || 'مندوب',
      };

      if (editingId) {
        const existingContract = contracts.find((c) => c.id === editingId);
        const isAdminOrSupervisor = currentRep?.role === 'admin' || currentRep?.role === 'supervisor' || !currentRep;
        const dataToSave = (!isAdminOrSupervisor && existingContract)
          ? {
              ...existingContract,
              dailyInstallment: finalData.dailyInstallment,
            }
          : finalData;

        setContracts((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...dataToSave } : c)));
        await updateContractInFirestore(editingId, dataToSave);
        showToast(
          !isAdminOrSupervisor
            ? (isAr ? 'تم تعديل قيمة القسط بنجاح' : 'Installment rate updated successfully')
            : (isAr ? 'تم تعديل بيانات الزبون والعقد بنجاح' : 'Contract updated successfully')
        );
      } else {
        const id = `contract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newContract: InstallmentContract = {
          ...finalData,
          id,
          totalPaid: 0,
          createdAt: new Date().toISOString(),
        } as InstallmentContract;

        knownContractIdsRef.current.add(id);
        setContracts((prev) => [newContract, ...prev]);
        await addContractToFirestore(newContract, quantityDeducted);

        const priceFmt = Number(newContract.totalPrice || 0).toLocaleString('en-US');
        const advanceFmt = Number(newContract.advancePayment || 0).toLocaleString('en-US');
        const instFmt = Number(newContract.dailyInstallment || 0).toLocaleString('en-US');
        showBrowserNotification(
          isAr ? '🛍️ إشعار مبيع جديد' : '🛍️ New Sale Recorded',
          isAr
            ? `"${newContract.customerName}" - القسط: ${instFmt} د.ع - بقيمة (${priceFmt} د.ع) - ${newContract.itemName || 'مادة'}${Number(newContract.advancePayment) > 0 ? ` (المقدمة: ${advanceFmt} د.ع)` : ''} (${newContract.repName || 'المندوب'})`
            : `"${newContract.customerName}" - Installment: ${instFmt} IQD - Total: ${priceFmt} IQD by ${newContract.repName || 'Rep'}`,
          { tag: `sale_${newContract.id}` }
        );

        showToast(isAr ? 'تمت إضافة الزبون والعقد وتعديل الكمية بالمخزن بنجاح!' : 'New customer & sale recorded!');
        if (ensuredListId && selectedListId !== 'all') {
          handleSelectListId(ensuredListId);
        }
      }
      setActiveTab('customers');
    } catch (err) {
      console.error('Failed to save contract:', err);
      showToast(isAr ? 'حدث خطأ أثناء الحفظ' : 'Error saving');
    }
  };

  // Delete Contract
  const handleDeleteContract = async (id: string) => {
    try {
      setContracts((prev) => prev.filter((c) => c.id !== id));
      if (selectedContract && selectedContract.id === id) {
        setSelectedContract(null);
      }
      await deleteContractFromFirestore(id);
      showToast(isAr ? 'تم حذف الزبون والعقد بنجاح' : 'Contract deleted');
    } catch (err) {
      console.error('Failed to delete contract:', err);
      showToast(isAr ? 'حدث خطأ في الحذف' : 'Error deleting contract');
    }
  };

  const handleMoveCustomer = async (contractId: string, newListId: string, newListName: string) => {
    try {
      await updateContractInFirestore(contractId, {
        listId: newListId,
        listName: newListName,
      });
      if (selectedContract && selectedContract.id === contractId) {
        setSelectedContract({
          ...selectedContract,
          listId: newListId,
          listName: newListName,
        });
      }
      showToast(isAr ? `تم نقل الزبون إلى قائمة (${newListName}) بنجاح` : `Customer moved to ${newListName}`);
    } catch (err) {
      console.error('Failed to move customer:', err);
      showToast(isAr ? 'حدث خطأ أثناء نقل الزبون' : 'Error moving customer');
    }
  };

  // Inventory actions
  const handleAddInventoryItem = async (item: Omit<InventoryItem, 'id'>) => {
    try {
      const id = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newItem = { ...item, id };
      setInventory((prev) => [...prev, newItem]);
      await addInventoryItemToFirestore(newItem);
      showToast(isAr ? 'تمت إضافة المادة الجديدة للمخزن بنجاح!' : 'Item added to inventory');
    } catch (err) {
      console.error('Error adding inventory item:', err);
    }
  };

  const handleUpdateInventoryItem = async (id: string, data: Partial<InventoryItem>) => {
    try {
      await updateInventoryItemInFirestore(id, data);
      showToast(isAr ? 'تم تحديث المادة بالمخزن' : 'Inventory item updated');
    } catch (err) {
      console.error('Error updating inventory item:', err);
    }
  };

  const handleDeleteInventoryItem = async (id: string) => {
    try {
      await deleteInventoryItemFromFirestore(id);
      showToast(isAr ? 'تم حذف المادة من المخزن' : 'Item removed from inventory');
    } catch (err) {
      console.error('Error deleting inventory item:', err);
    }
  };

  // Import contracts
  const handleImportContracts = async (imported: InstallmentContract[]) => {
    try {
      await replaceAllDataInFirestore(imported);
      showToast(isAr ? 'تم استيراد القائمة بنجاح!' : 'Dataset restored!');
    } catch (err) {
      console.error('Failed to import data:', err);
    }
  };

  // Representative Management Handlers
  const handleAddRep = async (repData: Omit<SalesRepresentative, 'id'>) => {
    try {
      if (hasDuplicateName(reps, repData.name)) {
        showToast(isAr ? 'عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكراره' : 'Representative name already exists');
        return;
      }
      const id = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newRep = { ...repData, id };
      setReps((prev) => deduplicateEntitiesByName([...prev, newRep]));
      await addRepToFirestore(newRep);
      showToast(isAr ? 'تمت إضافة حساب المندوب بنجاح' : 'Representative added successfully');
    } catch (err: any) {
      console.error('Failed to add rep:', err);
      showToast(err?.message || (isAr ? 'فشل إضافة المندوب' : 'Failed to add representative'));
      throw err;
    }
  };

  const handleUpdateRep = async (id: string, repData: Partial<SalesRepresentative>) => {
    try {
      if (repData.name && hasDuplicateName(reps, repData.name, id)) {
        showToast(isAr ? 'عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكراره' : 'Representative name already exists');
        return;
      }
      const normalizedData = {
        ...repData,
        code: repData.code !== undefined ? normalizePin(repData.code) : undefined,
      };
      setReps((prev) => prev.map((r) => (r.id === id ? { ...r, ...normalizedData } : r)));
      await updateRepInFirestore(id, normalizedData);

      const targetRep = reps.find((r) => r.id === id);
      const isCurrentRepUpdated = currentRep && (currentRep.id === id || (targetRep && targetRep.name === currentRep.name));
      const isCodeChanged =
        normalizedData.code !== undefined &&
        currentRep &&
        normalizePin(normalizedData.code) !== normalizePin(currentRep.code || '1234');

      if (isCurrentRepUpdated) {
        if (isCodeChanged) {
          setIsPinUnlocked(false);
          setCurrentRep(null);
          try {
            localStorage.removeItem('sami_app_pin_unlocked');
            sessionStorage.removeItem('sami_app_pin_unlocked');
            localStorage.removeItem(REP_STORAGE_KEY);
            // Immediately store updated rep in cache with the new code
            updateLocalCacheItem('reps', { id, ...(targetRep || {}), ...normalizedData } as any);
          } catch (e) {
            // ignore
          }
          showToast(isAr ? 'تم تغيير الرمز السري بنجاح، تم تسجيل الخروج. يرجى الدخول بالرمز الجديد' : 'PIN updated! Log in with new PIN');
          return;
        } else {
          const updated = { ...currentRep, ...normalizedData };
          setCurrentRep(updated as SalesRepresentative);
          try {
            localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(updated));
            updateLocalCacheItem('reps', updated as any);
          } catch (e) {
            // ignore
          }
        }
      }
      showToast(isAr ? 'تم تحديث حساب المندوب والصلاحيات' : 'Representative updated successfully');
    } catch (err: any) {
      console.error('Failed to update rep:', err);
      showToast(err?.message || (isAr ? 'فشل تحديث بيانات المندوب' : 'Failed to update representative'));
      throw err;
    }
  };

  const handleDeleteRep = async (id: string) => {
    try {
      const targetRep = reps.find((r) => r.id === id);
      setReps((prev) => prev.filter((r) => r.id !== id));
      await deleteRepFromFirestore(id);
      if (currentRep && (currentRep.id === id || (targetRep && targetRep.name === currentRep.name))) {
        setIsPinUnlocked(false);
        setCurrentRep(null);
        try {
          localStorage.removeItem('sami_app_pin_unlocked');
          sessionStorage.removeItem('sami_app_pin_unlocked');
          localStorage.removeItem(REP_STORAGE_KEY);
        } catch (e) {}
      }
      showToast(isAr ? 'تم حذف المندوب بنجاح' : 'Representative deleted successfully');
    } catch (err) {
      console.error('Failed to delete rep:', err);
      showToast(isAr ? 'فشل حذف المندوب' : 'Failed to delete representative');
      throw err;
    }
  };

  // Reset sample contracts
  const handleResetContracts = async () => {
    try {
      await replaceAllDataInFirestore(INITIAL_CONTRACTS);
      showToast(isAr ? 'تمت استعادة السجلات الافتراضية' : 'Sample contracts restored');
    } catch (err) {
      console.error('Failed to reset sample data:', err);
    }
  };

  // Sync and Overwrite Entire Active Database
  const handleSyncAndOverwriteDatabase = async () => {
    try {
      setIsSyncing(true);
      await syncAndOverwriteActiveDatabase({
        contracts,
        payments,
        inventory,
        reps,
        funds,
        lists: customerLists,
        employees,
      });
      setIsSyncing(false);
      showToast(
        isAr
          ? 'تمت مزامنة وتنظيف قاعدة البيانات بالكامل وحذف أي بيانات قديمة بنجاح'
          : 'Database synchronized and cleaned successfully'
      );
    } catch (err) {
      console.error('Failed to sync and overwrite database:', err);
      setIsSyncing(false);
      showToast(isAr ? 'حدث خطأ أثناء مزامنة قاعدة البيانات' : 'Failed to sync database');
    }
  };

  const handleDeleteAllCustomersAndPayments = async () => {
    try {
      await deleteAllCustomersAndPayments();
      setContracts([]);
      setPayments([]);
      showToast(isAr ? 'تم حذف جميع الزبائن والتسديدات بنجاح' : 'All customers and payments deleted successfully');
    } catch (err) {
      console.error('Failed to delete customers and payments:', err);
      showToast(isAr ? 'حدث خطأ أثناء الحذف' : 'Error deleting customers and payments');
    }
  };

  // Filter & Search Logic
  const filteredContracts = useMemo(() => {
    const list = contractsWithLiveBalances.filter((c) => {
      // Representative list permission check: strictly respect allowedListIds for non-admin roles
      if (currentRep && currentRep.role !== 'admin' && currentRep.allowedListIds && currentRep.allowedListIds.length > 0 && !currentRep.allowedListIds.includes('all')) {
        if (!c.listId || !currentRep.allowedListIds.includes(c.listId)) {
          return false;
        }
      }

      const q = (searchQuery || '').toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.includes(q) ||
        c.itemName.toLowerCase().includes(q) ||
        (c.customerAddress && c.customerAddress.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (selectedListId !== 'all') {
        const matchesListId = c.listId === selectedListId;
        const matchingListObj = customerLists.find((l) => l.id === selectedListId);
        const matchesListName = Boolean(matchingListObj && c.listName && c.listName.trim() === matchingListObj.name.trim());
        if (!matchesListId && !matchesListName) {
          return false;
        }
      }

      if (activeFilter === 'all') return true;
      if (activeFilter === 'dueToday') return c.status !== 'completed' && !payments.some(p => (p.contractId === c.id || p.customerName === c.customerName) && p.paymentDate === todayStr);
      if (activeFilter === 'active') return c.status !== 'completed';
      if (activeFilter === 'completed') return c.status === 'completed';

      return true;
    });

    // Natural numerical sorting for contracts (e.g. karbala-1-1, karbala-1-2 ... karbala-1-411)
    return list.sort((a, b) => {
      const matchA = a.id?.match(/karbala-1-(\d+)/);
      const matchB = b.id?.match(/karbala-1-(\d+)/);
      if (matchA && matchB) {
        return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
      }
      return 0;
    });
  }, [contractsWithLiveBalances, searchQuery, activeFilter, selectedListId, todayStr, currentRep]);

  // Today's total payments amount (مبلغ تسديدات اليوم)
  const todayPaymentsTotal = useMemo(() => {
    const today = getLocalDateString();
    return payments.reduce((sum, p) => {
      if (!p) return sum;
      const pDate = p.paymentDate ? p.paymentDate.split('T')[0] : '';
      if (pDate === today) {
        return sum + (Number(p.amountPaid ?? (p as any).amount ?? 0) || 0);
      }
      return sum;
    }, 0);
  }, [payments]);

  // Funds Management Handlers
  const handleAddFund = async (fund: Omit<CashFund, 'id'>) => {
    try {
      if (hasDuplicateName(funds, fund.name)) {
        showToast(isAr ? 'عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكراره' : 'Fund name already exists');
        return;
      }
      const id = `fund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newFund = { ...fund, id, createdAt: new Date().toISOString() };
      setFunds((prev) => deduplicateEntitiesByName([...prev, newFund]));
      await addFundToFirestore(newFund);
      showToast(isAr ? 'تمت إضافة الصندوق الخزني بنجاح' : 'Cash fund added successfully');
    } catch (err: any) {
      console.error('Failed to add fund:', err);
      showToast(err?.message || (isAr ? 'فشل إضافة الصندوق' : 'Failed to add fund'));
    }
  };

  const handleUpdateFund = async (id: string, data: Partial<CashFund>) => {
    try {
      if (data.name && hasDuplicateName(funds, data.name, id)) {
        showToast(isAr ? 'عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكراره' : 'Fund name already exists');
        return;
      }
      await updateFundInFirestore(id, data);
      showToast(isAr ? 'تم تحديث بيانات الصندوق' : 'Cash fund updated');
    } catch (err: any) {
      console.error('Failed to update fund:', err);
      showToast(err?.message || (isAr ? 'فشل تحديث بيانات الصندوق' : 'Failed to update fund'));
    }
  };

  const handleDeleteFund = async (id: string) => {
    try {
      setFunds((prev) => prev.filter((f) => f.id !== id));
      await deleteFundFromFirestore(id);
      showToast(isAr ? 'تم حذف الصندوق بنجاح' : 'Fund deleted');
    } catch (err) {
      console.error('Failed to delete fund:', err);
      showToast(isAr ? 'فشل حذف الصندوق' : 'Failed to delete fund');
    }
  };

  const handleAddDepositOrWithdrawal = async (
    fundId: string,
    type: 'deposit' | 'withdraw' | 'expense',
    amount: number,
    note?: string
  ) => {
    try {
      const isDeduction = type === 'withdraw' || type === 'expense';
      const delta = isDeduction ? -amount : amount;

      // Optimistic update for funds
      setFunds((prev) =>
        prev.map((f) => (f.id === fundId ? { ...f, balance: (Number(f.balance) || 0) + delta } : f))
      );

      await addDepositOrWithdrawalToFund(fundId, type, amount, currentRep?.name || '', note);
      showToast(
        type === 'deposit'
          ? isAr ? `تم إيداع مبلغ ${amount.toLocaleString('en-US')} د.ع بالصندوق` : 'Deposit success'
          : isAr ? `تم سحب مبلغ ${amount.toLocaleString('en-US')} د.ع من الصندوق` : 'Withdraw success'
      );
    } catch (err) {
      console.error('Failed deposit/withdraw:', err);
      showToast(isAr ? 'حدث خطأ في العملية' : 'Transaction error');
    }
  };

  const handleTransferBetweenFunds = async (
    sourceFundId: string,
    targetFundId: string,
    amount: number,
    note?: string
  ) => {
    try {
      // Optimistic update for both funds
      setFunds((prev) =>
        prev.map((f) => {
          if (f.id === sourceFundId) return { ...f, balance: (Number(f.balance) || 0) - amount };
          if (f.id === targetFundId) return { ...f, balance: (Number(f.balance) || 0) + amount };
          return f;
        })
      );

      await transferBetweenFunds(sourceFundId, targetFundId, amount, currentRep?.name || '', note);
      showToast(isAr ? `تم تحويل مبلغ ${amount.toLocaleString('en-US')} د.ع بين الصندوقين بنجاح` : 'Transfer success');
    } catch (err) {
      console.error('Failed transfer:', err);
      showToast(isAr ? 'حدث خطأ أثناء التحويل' : 'Transfer error');
    }
  };

  const handleDeleteFundTransaction = async (tx: FundTransaction) => {
    try {
      const amount = Number(tx.amount) || 0;
      // Optimistic balance adjustments
      setFunds((prev) =>
        prev.map((f) => {
          if (tx.type === 'transfer') {
            if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) + amount };
            if (f.id === tx.targetFundId) return { ...f, balance: (Number(f.balance) || 0) - amount };
          } else if (tx.type === 'withdraw' || tx.type === 'expense' || tx.type === 'employee_loan') {
            if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) + amount };
          } else if (tx.type === 'deposit' || tx.type === 'employee_repay') {
            if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) - amount };
          }
          return f;
        })
      );
      setFundTransactions((prev) => prev.filter((t) => t.id !== tx.id));

      await deleteFundTransactionFromFirestore(tx.id);
      showToast(isAr ? 'تم حذف الحركة وتعديل أرصدة الصناديق بنجاح' : 'Transaction deleted and balances adjusted');
    } catch (err) {
      console.error('Failed to delete fund transaction:', err);
      showToast(isAr ? 'حدث خطأ أثناء حذف الحركة' : 'Failed to delete transaction');
    }
  };

  const handleUpdateFundTransaction = async (tx: FundTransaction, newAmount: number, newNote: string) => {
    try {
      const oldAmount = Number(tx.amount) || 0;
      const diff = newAmount - oldAmount;

      if (diff !== 0) {
        setFunds((prev) =>
          prev.map((f) => {
            if (tx.type === 'transfer') {
              if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) - diff };
              if (f.id === tx.targetFundId) return { ...f, balance: (Number(f.balance) || 0) + diff };
            } else if (tx.type === 'withdraw' || tx.type === 'expense' || tx.type === 'employee_loan') {
              if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) - diff };
            } else if (tx.type === 'deposit' || tx.type === 'employee_repay') {
              if (f.id === tx.fundId) return { ...f, balance: (Number(f.balance) || 0) + diff };
            }
            return f;
          })
        );
      }
      setFundTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, amount: newAmount, note: newNote } : t))
      );

      await updateFundTransactionInFirestore(tx.id, { amount: newAmount, note: newNote });
      showToast(isAr ? 'تم تعديل الحركة وتحديث الأرصدة بنجاح' : 'Transaction updated and balances adjusted');
    } catch (err) {
      console.error('Failed to update fund transaction:', err);
      showToast(isAr ? 'حدث خطأ أثناء تعديل الحركة' : 'Failed to update transaction');
    }
  };

  // Customer List Handlers
  const handleAddList = async (list: Omit<CustomerList, 'id'>) => {
    try {
      if (hasDuplicateName(customerLists, list.name)) {
        showToast(isAr ? 'عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكراره' : 'List name already exists');
        return;
      }
      const id = `list_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newList = { ...list, id, createdAt: new Date().toISOString() };
      setCustomerLists((prev) => deduplicateEntitiesByName([...prev, newList]));
      await addCustomerListToFirestore(newList);
      showToast(isAr ? 'تمت إضافة قائمة الزبائن بنجاح' : 'Customer list created');
    } catch (err: any) {
      console.error('Failed to add list:', err);
      showToast(err?.message || (isAr ? 'فشل إضافة القائمة' : 'Failed to add list'));
    }
  };

  const handleUpdateList = async (id: string, data: Partial<CustomerList>) => {
    try {
      if (data.name && hasDuplicateName(customerLists, data.name, id)) {
        showToast(isAr ? 'عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكراره' : 'List name already exists');
        return;
      }
      setCustomerLists((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                ...data,
                receiptTemplate:
                  (data as any).receiptTemplate ||
                  (data as any).receipt_template ||
                  l.receiptTemplate ||
                  (l as any).receipt_template ||
                  'template_1',
              }
            : l
        )
      );
      await updateCustomerListInFirestore(id, data);
      showToast(isAr ? 'تم تحديث بيانات القائمة' : 'Customer list updated');
    } catch (err: any) {
      console.error('Failed to update list:', err);
      showToast(err?.message || (isAr ? 'فشل تحديث القائمة' : 'Failed to update list'));
    }
  };

  const handleReorderFunds = async (orderedIds: string[]) => {
    try {
      setFunds((prev) => {
        const idMap = new Map(prev.map((f) => [f.id, f]));
        const reordered: CashFund[] = [];
        orderedIds.forEach((id, idx) => {
          const item = idMap.get(id);
          if (item) {
            reordered.push({ ...item, orderIndex: idx });
            idMap.delete(id);
          }
        });
        idMap.forEach((item) => {
          reordered.push({ ...item, orderIndex: reordered.length });
        });
        return reordered;
      });
      await reorderFundsInDatabase(orderedIds);
    } catch (err) {
      console.error('Failed to reorder funds:', err);
    }
  };

  const handleReorderLists = async (orderedIds: string[]) => {
    try {
      setCustomerLists((prev) => {
        const idMap = new Map(prev.map((l) => [l.id, l]));
        const reordered: CustomerList[] = [];
        orderedIds.forEach((id, idx) => {
          const item = idMap.get(id);
          if (item) {
            reordered.push({ ...item, orderIndex: idx });
            idMap.delete(id);
          }
        });
        idMap.forEach((item) => {
          reordered.push({ ...item, orderIndex: reordered.length });
        });
        return reordered;
      });
      await reorderCustomerListsInDatabase(orderedIds);
    } catch (err) {
      console.error('Failed to reorder customer lists:', err);
    }
  };

  const handleRecalculateFundBalances = async () => {
    try {
      const res = await fetch('/api/funds/recalculate', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.funds && Array.isArray(data.funds)) {
          const sorted = [...data.funds].sort(compareEntitiesByOrder);
          const deduped = deduplicateEntitiesByName(sorted);
          setFunds(deduped);
          setLocalCache('funds', deduped);
        }
      }
      await forceRefreshAllDataFromPostgres();
      showToast(isAr ? 'تم تدقيق وحساب أرصدة الصناديق بنجاح ومطابقتها مع كافة التسديدات' : 'Fund balances recalculated and matched with payments');
    } catch (err: any) {
      console.error('Failed to recalculate balances:', err);
      showToast(isAr ? 'فشل تدقيق الأرصدة' : 'Failed to recalculate balances');
    }
  };

  const handleDeleteList = async (id: string, fundId?: string) => {
    try {
      // 1. Delete associated debts/contracts if any
      const listContracts = contracts.filter((c) => c.listId === id);
      if (listContracts.length > 0) {
        setContracts((prev) => prev.filter((c) => c.listId !== id));
        for (const c of listContracts) {
          await deleteContractFromFirestore(c.id);
        }
      }

      // 2. Delete customer list
      setCustomerLists((prev) => prev.filter((l) => l.id !== id));
      await deleteCustomerListFromFirestore(id);

      // 3. Delete linked fund if specified
      let fundDeleted = false;
      if (fundId) {
        setFunds((prev) => prev.filter((f) => f.id !== fundId));
        await deleteFundFromFirestore(fundId);
        fundDeleted = true;
      }

      showToast(
        isAr
          ? fundDeleted
            ? 'تم حذف القائمة والديون والصندوق المربوط بها بنجاح'
            : 'تم حذف القائمة والديون بنجاح'
          : fundDeleted
          ? 'List, debts, and linked fund deleted'
          : 'List and associated debts deleted'
      );
    } catch (err) {
      console.error('Failed to delete list:', err);
      showToast(isAr ? 'فشل حذف القائمة' : 'Failed to delete list');
    }
  };

  // Employees Handlers
  const handleAddEmployee = async (employee: Omit<Employee, 'id'>) => {
    try {
      if (hasDuplicateName(employees, employee.name)) {
        showToast(isAr ? 'عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكراره' : 'Employee name already exists');
        return;
      }
      const id = `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newEmp = { ...employee, id, createdAt: new Date().toISOString() };
      setEmployees((prev) => deduplicateEntitiesByName([...prev, newEmp]));
      await addEmployeeToFirestore(newEmp);
      showToast(isAr ? 'تمت إضافة حساب الموظف بنجاح' : 'Employee added');
    } catch (err: any) {
      console.error('Failed to add employee:', err);
      showToast(err?.message || (isAr ? 'فشل إضافة الموظف' : 'Failed to add employee'));
    }
  };

  const handleUpdateEmployee = async (id: string, data: Partial<Employee>) => {
    try {
      if (data.name && hasDuplicateName(employees, data.name, id)) {
        showToast(isAr ? 'عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكراره' : 'Employee name already exists');
        return;
      }
      await updateEmployeeInFirestore(id, data);
      showToast(isAr ? 'تم تحديث بيانات الموظف' : 'Employee updated');
    } catch (err: any) {
      console.error('Failed to update employee:', err);
      showToast(err?.message || (isAr ? 'فشل تحديث بيانات الموظف' : 'Failed to update employee'));
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      await deleteEmployeeFromFirestore(id);
      showToast(isAr ? 'تم حذف حساب الموظف' : 'Employee deleted');
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  const handleDeleteAllEmployees = async () => {
    try {
      setEmployees([]);
      setEmployeeTransactions([]);
      await deleteAllEmployees();
      showToast(isAr ? 'تم تصفير وحذف جميع الموظفين وسجلاتهم الأوفلاين والسيرفر بنجاح' : 'All employees wiped successfully');
    } catch (err) {
      console.error('Failed to delete all employees:', err);
      showToast(isAr ? 'حدث خطأ أثناء حذف الموظفين' : 'Failed to delete all employees');
    }
  };

  const handleProcessEmployeeDebt = async (
    employee: Employee,
    fundId: string,
    type: 'loan' | 'repay',
    amount: number,
    note?: string
  ) => {
    if (currentRep && currentRep.role !== 'admin') {
      showToast(isAr ? 'عفواً، إضافة الديون وسدادها مخصص للمدير حصراً' : 'Only admin can process debt transactions');
      return;
    }

    if (fundId && type === 'loan') {
      const targetFund = funds.find((f) => f.id === fundId);
      const fundBal = Number(targetFund?.balance) || 0;
      if (amount > fundBal) {
        showToast(
          isAr
            ? `عذراً، رصيد الصندوق المحدد (${targetFund?.name || 'الصندوق'}: ${fundBal.toLocaleString('en-US')} د.ع) غير كافٍ لصرف هذا الدين!`
            : `Insufficient fund balance (${fundBal.toLocaleString('en-US')} IQD)!`
        );
        return;
      }
    }

    try {
      const now = new Date().toISOString();
      const tempId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const empName = employee.name || 'الموظف';
      const optimisticTx: EmployeeTransaction = {
        id: tempId,
        employeeId: employee.id,
        employeeName: empName,
        fundId,
        type,
        amount,
        date: now,
        recordedBy: currentRep?.name || 'الإدارة',
        note: note || (type === 'loan' ? 'سلفة / دين' : 'تسديد دين'),
        createdAt: now,
      };

      // 1. Optimistically append to employeeTransactions
      setEmployeeTransactions((prev) => [optimisticTx, ...prev]);

      // 2. Optimistically update employee debtBalance
      setEmployees((prev) => {
        const found = prev.some((e) => e.id === employee.id || (e.name || '').trim().toLowerCase() === (empName || '').trim().toLowerCase());
        if (found) {
          return prev.map((e) => {
            if (e.id === employee.id || (e.name || '').trim().toLowerCase() === (empName || '').trim().toLowerCase()) {
              const prevDebt = Number(e.debtBalance ?? e.totalDebt ?? 0);
              const newDebt = type === 'loan' ? prevDebt + amount : Math.max(0, prevDebt - amount);
              return { ...e, debtBalance: newDebt, totalDebt: newDebt };
            }
            return e;
          });
        } else {
          const newDebt = type === 'loan' ? amount : 0;
          return [
            ...prev,
            {
              ...employee,
              debtBalance: newDebt,
              totalDebt: newDebt,
              createdAt: now,
            },
          ];
        }
      });

      // 3. Optimistically update cash fund balance (loan: decreases, repay: increases)
      if (fundId) {
        setFunds((prev) =>
          prev.map((f) => {
            if (f.id === fundId) {
              const currentBal = Number(f.balance) || 0;
              const newBal = type === 'loan' ? Math.max(0, currentBal - amount) : currentBal + amount;
              return { ...f, balance: newBal };
            }
            return f;
          })
        );
      }

      // 4. Add operation to Fund Transactions (حركات الصندوق)
      const ftId = `ft_emp_${tempId}`;
      const ftNote = type === 'loan'
        ? `دين / سلفة للموظف (${empName})${note ? ` - ${note}` : ''}`
        : `راجع دين / تسديد من الموظف (${empName})${note ? ` - ${note}` : ''}`;
      const newFt: FundTransaction = {
        id: ftId,
        fundId,
        type: type === 'loan' ? 'employee_loan' : 'employee_repay',
        amount,
        note: ftNote,
        repName: currentRep?.name || empName,
        createdAt: now,
      };
      setFundTransactions((prev) => [newFt, ...prev]);

      knownEmpTxIdsRef.current.add(tempId);
      await processEmployeeDebtTransaction(optimisticTx);

      const amtFmt = Number(amount || 0).toLocaleString('en-US');
      if (type === 'loan') {
        showBrowserNotification(
          isAr ? '💸 إشعار دين جديد' : '💸 New Debt Recorded',
          isAr
            ? `تم تسجيل دين بمبلغ (${amtFmt} د.ع) على "${empName}"${note ? ` (${note})` : ''} بواسطة ${currentRep?.name || 'الإدارة'}`
            : `New loan/debt of (${amtFmt} IQD) recorded for "${empName}"`,
          { tag: `emp_debt_${optimisticTx.id}` }
        );
      } else {
        showBrowserNotification(
          isAr ? '💵 إشعار راجع دين' : '💵 Debt Repayment Recorded',
          isAr
            ? `تم تسجيل راجع دين بمبلغ (${amtFmt} د.ع) من "${empName}"${note ? ` (${note})` : ''} بواسطة ${currentRep?.name || 'الإدارة'}`
            : `Repayment of (${amtFmt} IQD) recorded from "${empName}"`,
          { tag: `emp_repay_${optimisticTx.id}` }
        );
      }

      showToast(
        type === 'loan'
          ? isAr ? `تم تسجيل سحبة دين ${amount.toLocaleString('en-US')} د.ع للموظف ${empName}` : 'Loan recorded'
          : isAr ? `تم تسجيل سداد مبلغ ${amount.toLocaleString('en-US')} د.ع من الموظف ${empName}` : 'Repay recorded'
      );
    } catch (err) {
      console.error('Failed debt tx:', err);
      showToast(isAr ? 'حدث خطأ في عملية الدين' : 'Debt transaction error');
    }
  };

  const handleDeleteEmployeeTransaction = async (tx: EmployeeTransaction, employee: Employee) => {
    try {
      // Optimistically remove from transactions
      setEmployeeTransactions((prev) => prev.filter((t) => t.id !== tx.id));

      // Optimistically revert employee debtBalance
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id === employee.id || (e.name || '').trim().toLowerCase() === (employee?.name || '').trim().toLowerCase()) {
            const prevDebt = Number(e.debtBalance ?? e.totalDebt ?? 0);
            const newDebt = tx.type === 'loan' ? Math.max(0, prevDebt - tx.amount) : prevDebt + tx.amount;
            return { ...e, debtBalance: newDebt, totalDebt: newDebt };
          }
          return e;
        })
      );

      // Optimistically revert fund balance (حذف الدين يزداد رصيد الصندوق، حذف الراجع ينقص رصيد الصندوق)
      if (tx.fundId) {
        setFunds((prev) =>
          prev.map((f) => {
            if (f.id === tx.fundId) {
              const currentBal = Number(f.balance) || 0;
              const newBal = tx.type === 'loan' ? currentBal + tx.amount : Math.max(0, currentBal - tx.amount);
              return { ...f, balance: newBal };
            }
            return f;
          })
        );
      }

      // Remove linked fund transaction from local state
      const targetFtId = `ft_emp_${tx.id}`;
      const targetFtIdAlt = `ft_emptx_${tx.id}`;
      setFundTransactions((prev) => prev.filter((ft) => ft.id !== targetFtId && ft.id !== targetFtIdAlt && ft.id !== tx.id));

      await deleteEmployeeDebtTransaction(tx, employee);
      showToast(isAr ? 'تم حذف حركة الدين وتعديل حركة ورصيد الصندوق بنجاح' : 'Debt transaction and fund movements deleted');
    } catch (err) {
      console.error('Failed to delete debt tx:', err);
      showToast(isAr ? 'حدث خطأ أثناء حذف حركة الدين' : 'Error deleting debt transaction');
    }
  };

  const handleUpdateEmployeeTransaction = async (
    tx: EmployeeTransaction,
    employee: Employee,
    newAmount: number,
    newNote: string
  ) => {
    try {
      const diff = newAmount - tx.amount;

      // Optimistically update transaction in local state
      setEmployeeTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, amount: newAmount, note: newNote, notes: newNote } : t))
      );

      // Optimistically update employee debtBalance
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id === employee.id || (e.name || '').trim().toLowerCase() === (employee?.name || '').trim().toLowerCase()) {
            const prevDebt = Number(e.debtBalance ?? e.totalDebt ?? 0);
            const newDebt = tx.type === 'loan' ? Math.max(0, prevDebt + diff) : Math.max(0, prevDebt - diff);
            return { ...e, debtBalance: newDebt, totalDebt: newDebt };
          }
          return e;
        })
      );

      // Optimistically update fund balance (loan decreases by diff, repay increases by diff)
      if (tx.fundId) {
        setFunds((prev) =>
          prev.map((f) => {
            if (f.id === tx.fundId) {
              const currentBal = Number(f.balance) || 0;
              const newBal = tx.type === 'loan' ? Math.max(0, currentBal - diff) : currentBal + diff;
              return { ...f, balance: newBal };
            }
            return f;
          })
        );
      }

      // Update linked fund transaction in local state
      const targetFtId = `ft_emp_${tx.id}`;
      const targetFtIdAlt = `ft_emptx_${tx.id}`;
      const empName = employee.name || 'الموظف';
      const ftNote = tx.type === 'loan'
        ? `دين / سلفة للموظف (${empName})${newNote ? ` - ${newNote}` : ''}`
        : `راجع دين / تسديد من الموظف (${empName})${newNote ? ` - ${newNote}` : ''}`;

      setFundTransactions((prev) =>
        prev.map((ft) => {
          if (ft.id === targetFtId || ft.id === targetFtIdAlt || ft.id === tx.id) {
            return { ...ft, amount: newAmount, note: ftNote };
          }
          return ft;
        })
      );

      await updateEmployeeDebtTransaction(tx, employee, newAmount, newNote);
      showToast(isAr ? 'تم تعديل حركة الدين وحركة الصندوق بنجاح' : 'Debt transaction updated');
    } catch (err) {
      console.error('Failed to update debt tx:', err);
      showToast(isAr ? 'حدث خطأ أثناء تعديل حركة الدين' : 'Error updating debt transaction');
    }
  };

  const handleSyncDebtBalances = async () => {
    try {
      const count = await syncAllEmployeesDebtBalances();
      showToast(
        isAr
          ? `تم تحديث ومطابقة أرصدة الديون لجميع الموظفين والمندوبين بنجاح (${count} موظف/مندوب)`
          : `Debt balances synchronized successfully (${count} updated)`
      );
    } catch (err) {
      console.error('Failed to sync debt balances:', err);
      showToast(
        isAr ? 'حدث خطأ أثناء تحديث أرصدة الديون' : 'Error synchronizing debt balances'
      );
    }
  };

  const handleResolveConflict = async (conflict: PaymentConflictRecord) => {
    if (currentRep && currentRep.role !== 'admin' && currentRep.role !== 'supervisor') {
      showToast(isAr ? 'عفواً، صلاحية التصفية والتعديل للمدير حصراً' : 'Only admin/supervisor can settle conflicts');
      return;
    }

    try {
      const contract = contractsWithLiveBalances.find(
        (c) => c.id === conflict.contractId || normalizeEntityName(c.customerName) === normalizeEntityName(conflict.customerName)
      ) || contracts.find(
        (c) => c.id === conflict.contractId || normalizeEntityName(c.customerName) === normalizeEntityName(conflict.customerName)
      );

      if (!contract) {
        showToast(isAr ? 'عفواً، لم يتم العثور على عقد الزبون المرتبط بهذا التعارض' : 'Customer contract not found for this conflict');
        return;
      }

      const netFinanced = Math.max(0, (Number(contract.totalPrice) || 0) - (Number(contract.advancePayment) || 0));
      const currentContractPayments = payments.filter((p) => p.contractId === contract.id || normalizeEntityName(p.customerName) === normalizeEntityName(contract.customerName));
      const currentPaidSum = currentContractPayments.reduce((s, p) => s + (Number(p.amountPaid ?? p.amount ?? (p as any).amount_paid) || 0), 0);
      const trueRemaining = Math.max(0, netFinanced - currentPaidSum);

      const attemptedAmt = Number(conflict.attemptedAmount) || 0;
      const acceptedAmount = typeof conflict.acceptedAmount === 'number'
        ? conflict.acceptedAmount
        : Math.min(trueRemaining, attemptedAmt);
      const excessAmount = typeof conflict.excessAmount === 'number'
        ? conflict.excessAmount
        : Math.max(0, attemptedAmt - acceptedAmount);

      // 1. If acceptedAmount > 0, create the PaymentRecord for the customer so totalPaid increases & remainingBalance becomes 0
      if (acceptedAmount > 0) {
        const newTotalPaid = currentPaidSum + acceptedAmount;
        const newRemaining = Math.max(0, netFinanced - newTotalPaid);
        const newStatus = newRemaining === 0 ? 'completed' : 'active';
        const completedAtVal = newStatus === 'completed' ? (contract.completedAt || new Date().toISOString()) : undefined;

        const newPaymentId = generateUniqueId('pay');
        const newPaymentRecord: PaymentRecord = {
          id: newPaymentId,
          contractId: contract.id,
          customerName: contract.customerName,
          amountPaid: acceptedAmount,
          paymentDate: conflict.paymentDate || todayStr,
          repName: conflict.repName,
          note: conflict.note
            ? `${conflict.note} (تسوية تعارض - قبول ${acceptedAmount.toLocaleString('en-US')} د.ع وإرجاع ${excessAmount.toLocaleString('en-US')} د.ع راجع للزبون)`
            : `تسوية تعارض - قبول ${acceptedAmount.toLocaleString('en-US')} د.ع وإرجاع ${excessAmount.toLocaleString('en-US')} د.ع راجع للزبون`,
          fundId: contract.listId || null,
          totalPaidSnapshot: newTotalPaid,
          remainingBalanceSnapshot: newRemaining,
          createdAt: new Date().toISOString(),
        };

        setPayments((prev) => [newPaymentRecord, ...prev]);

        // Update contract in state

        setContracts((prev) =>
          prev.map((c) =>
            c.id === contract.id || normalizeEntityName(c.customerName) === normalizeEntityName(contract.customerName)
              ? {
                  ...c,
                  totalPaid: newTotalPaid,
                  remainingBalance: newRemaining,
                  status: newStatus,
                  completedAt: completedAtVal,
                }
              : c
          )
        );

        try {
          await addPaymentToFirestore(newPaymentRecord, contract, {
            receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
            customerName: contract.customerName,
            customerPhone: contract.customerPhone,
            itemName: contract.itemName,
            amountPaid: acceptedAmount,
            amountInWords: '',
            remainingBalance: newRemaining,
            totalPrice: contract.totalPrice,
            advancePayment: contract.advancePayment,
            dailyInstallment: contract.dailyInstallment,
            totalPaid: newTotalPaid,
            paymentDate: conflict.paymentDate || todayStr,
            paymentTime: new Date().toLocaleTimeString('en-US'),
            repName: conflict.repName,
            contractId: contract.id,
            listName: contract.listName,
          });
        } catch (payErr) {
          console.warn('Error saving accepted payment to database:', payErr);
        }
      }

      // 2. Mark conflict as resolved
      const resolvedConflict: PaymentConflictRecord = {
        ...conflict,
        status: 'resolved',
        acceptedAmount,
        excessAmount,
        resolvedBy: currentRep?.name || 'المدير',
        resolvedAt: new Date().toISOString(),
        resolutionNote: `تمت التسوية: قبول ${acceptedAmount.toLocaleString('en-US')} د.ع وقيد ${excessAmount.toLocaleString('en-US')} د.ع راجع للزبون`,
      };

      setPaymentConflicts((prev) =>
        prev.map((c) => (c.id === conflict.id ? resolvedConflict : c))
      );

      await resolvePaymentConflictInFirestore(conflict.id, resolvedConflict);

      playNotificationSound();
      showToast(
        isAr
          ? `تمت تسوية حساب الزبون "${contract.customerName}" بنجاح! تم اعتماد (${acceptedAmount.toLocaleString('en-US')} د.ع) وتصفير الحساب، وقيد (${excessAmount.toLocaleString('en-US')} د.ع) راجع للزبون بحوزة ${conflict.repName}`
          : `Settled successfully: Accepted ${acceptedAmount} IQD, refund ${excessAmount} IQD`
      );
    } catch (err: any) {
      console.error('Error resolving payment conflict:', err);
      showToast(isAr ? `حدث خطأ أثناء التصفية: ${err?.message || err}` : `Error settling conflict: ${err?.message || err}`);
    }
  };

  const handleSettleExcessPayment = async (contractId: string, customerName?: string) => {
    if (currentRep && currentRep.role !== 'admin' && currentRep.role !== 'supervisor') {
      showToast(isAr ? 'عفواً، صلاحية التسوية والتعديل للمدير حصراً' : 'Only admin/supervisor can settle payments');
      return;
    }

    try {
      const targetContract = contractsWithLiveBalances.find(
        (c) => c.id === contractId || (customerName && normalizeEntityName(c.customerName) === normalizeEntityName(customerName))
      );

      if (!targetContract) {
        showToast(isAr ? 'لم يتم العثور على عقد الزبون' : 'Customer contract not found');
        return;
      }

      // Check if there is a pending conflict for this contract
      const pendingConflict = paymentConflicts.find(
        (c) =>
          (c.contractId === targetContract.id || normalizeEntityName(c.customerName) === normalizeEntityName(targetContract.customerName)) &&
          c.status === 'pending_review'
      );

      if (pendingConflict) {
        await handleResolveConflict(pendingConflict);
        return;
      }

      // Find all payments for this contract
      const contractPayments = payments.filter(
        (p) =>
          (p.contractId && p.contractId === targetContract.id) ||
          (p.customerName && normalizeEntityName(p.customerName) === normalizeEntityName(targetContract.customerName))
      );

      if (contractPayments.length === 0) {
        showToast(isAr ? 'لا توجد دفعات مسجلة لهذا العقد' : 'No payments found for this contract');
        return;
      }

      const netFinanced = Math.max(0, (targetContract.totalPrice || 0) - (targetContract.advancePayment || 0));

      // Accurate chronological sorting:
      // Compare calendar date first; if same day, compare createdAt timestamp
      const getPaymentTime = (p: PaymentRecord) => {
        if (p.createdAt) {
          const t = new Date(p.createdAt).getTime();
          if (!isNaN(t)) return t;
        }
        if (p.paymentDate) {
          const t = new Date(p.paymentDate).getTime();
          if (!isNaN(t)) return t;
        }
        return 0;
      };

      const sortedPayments = [...contractPayments].sort((a, b) => {
        const timeA = new Date(a.paymentDate || 0).getTime();
        const timeB = new Date(b.paymentDate || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return getPaymentTime(a) - getPaymentTime(b);
      });

      const totalPaymentsSum = sortedPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);
      const totalExcessAmount = totalPaymentsSum - netFinanced;

      if (totalExcessAmount <= 0) {
        showToast(isAr ? 'حساب الزبون لا يحتوي على دفعة زائدة، الواصل يطابق سعر البيع' : 'No excess payment found for customer');
        return;
      }

      // Reconcile payments so that the sum across all payments equals exactly netFinanced:
      let accumulated = 0;
      const paymentsToUpdate: { payment: PaymentRecord; newAmount: number; excessRefund: number; repName: string }[] = [];
      const paymentsToDelete: { payment: PaymentRecord; excessRefund: number; repName: string }[] = [];
      const repExcessMap: Record<string, number> = {};

      for (const p of sortedPayments) {
        const pAmount = Number(p.amountPaid) || 0;
        const rep = p.repName || targetContract.repName || currentRep?.name || (isAr ? 'المندوب' : 'Rep');
        const spaceLeft = Math.max(0, netFinanced - accumulated);

        if (spaceLeft >= pAmount) {
          // Fits within the allowed netFinanced
          accumulated += pAmount;
        } else if (spaceLeft > 0) {
          // Partially fits: needed = spaceLeft, excess = pAmount - spaceLeft
          const excessRefund = pAmount - spaceLeft;
          accumulated += spaceLeft; // reaches netFinanced exactly
          repExcessMap[rep] = (repExcessMap[rep] || 0) + excessRefund;
          paymentsToUpdate.push({ payment: p, newAmount: spaceLeft, excessRefund, repName: rep });
        } else {
          // Already reached netFinanced (spaceLeft === 0)! Entire payment is excess
          repExcessMap[rep] = (repExcessMap[rep] || 0) + pAmount;
          paymentsToDelete.push({ payment: p, excessRefund: pAmount, repName: rep });
        }
      }

      // Execute updates for partially excess payments
      for (const item of paymentsToUpdate) {
        const newNote = item.payment.note
          ? `${item.payment.note} (تمت التسوية: اعتماد ${item.newAmount.toLocaleString('en-US')} د.ع وفائض ${item.excessRefund.toLocaleString('en-US')} د.ع بحوزة ${item.repName})`
          : `تسوية فائض دفعة: اعتماد ${item.newAmount.toLocaleString('en-US')} د.ع وفائض ${item.excessRefund.toLocaleString('en-US')} د.ع بحوزة ${item.repName}`;
        await handleUpdatePayment(item.payment, item.newAmount, newNote);
      }

      // Execute deletions for completely redundant payments
      for (const item of paymentsToDelete) {
        await handleDeletePayment(item.payment);
      }

      // Build reps summary text stating the exact amount held by representative(s)
      const repsSummary = Object.entries(repExcessMap)
        .map(([rep, amt]) => `(${Number(amt).toLocaleString('en-US')} د.ع بحوزة المندوب "${rep}")`)
        .join(' و ');

      const totalExcess = Object.values(repExcessMap).reduce((s, v) => s + v, 0);
      const primaryRepName = Object.keys(repExcessMap)[0] || targetContract.repName || currentRep?.name || (isAr ? 'المندوب' : 'Rep');

      // 3. Create or update conflict record to resolved for transparency logs
      const resolvedConflictRecord: PaymentConflictRecord = {
        id: `conflict_settle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        contractId: targetContract.id,
        customerName: targetContract.customerName,
        attemptedAmount: totalPaymentsSum,
        actualRemainingBalance: 0,
        excessAmount: totalExcess,
        repName: primaryRepName,
        note: `تمت تسوية حساب الزبون وتصفير الحساب ليطابق سعر البيع (${netFinanced.toLocaleString('en-US')} د.ع). المبلغ الفائض في حوزة المندوب: ${repsSummary}`,
        paymentDate: todayStr,
        createdAt: new Date().toISOString(),
        status: 'resolved',
        resolvedBy: currentRep?.name || 'المدير',
        resolvedAt: new Date().toISOString(),
        acceptedAmount: netFinanced,
      };

      setPaymentConflicts((prev) => [resolvedConflictRecord, ...prev.filter((c) => c.contractId !== targetContract.id)]);
      try {
        await resolvePaymentConflictInFirestore(resolvedConflictRecord);
      } catch (e) {
        console.warn('Error saving resolved conflict:', e);
      }

      playNotificationSound();
      showToast(
        isAr
          ? `تمت تسوية حساب الزبون "${targetContract.customerName}" وتصفير الحساب. الواصل أصبح (${netFinanced.toLocaleString('en-US')} د.ع) والمبلغ الفائض في حوزة المندوب: ${repsSummary}`
          : `Customer "${targetContract.customerName}" settled. Total paid matches sale price (${netFinanced.toLocaleString('en-US')} IQD). Excess in rep custody: ${repsSummary}`
      );
      showBrowserNotification(
        isAr ? 'إشعار تسوية: تم تصفير الحساب وتحديد حوزة المندوب' : 'Settlement Notice',
        isAr
          ? `تمت تسوية وتصفير حساب "${targetContract.customerName}". الواصل يطابق سعر البيع (${netFinanced.toLocaleString('en-US')} د.ع). المبلغ الفائض في حوزة المندوب: ${repsSummary}.`
          : `Customer "${targetContract.customerName}" settled. Total paid matches price. Excess in rep custody: ${repsSummary}.`
      );
    } catch (err: any) {
      console.error('Failed to settle excess payment:', err);
      showToast(isAr ? `حدث خطأ أثناء التسوية: ${err?.message || err}` : 'Error settling excess payment');
    }
  };

  const effectiveRep = currentRep || reps[0] || DEFAULT_REPS[0];
  const isAdmin = effectiveRep.role === 'admin';
  const isSupervisor = effectiveRep.role === 'supervisor';
  const canEdit = isAdmin || effectiveRep.canEdit !== false;
  const canDelete = isAdmin || effectiveRep.canDelete === true;
  const canSell = isAdmin || effectiveRep.canSell !== false;

  // Render opening splash screen on launch
  if (showSplash) {
    return (
      <SplashScreen
        lang={lang}
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  // Render Local PIN Screen if not unlocked or no rep selected
  if (!isPinUnlocked || !currentRep) {
    return (
      <LoginView
        reps={reps}
        lang={lang}
        onViewSplash={() => setShowSplash(true)}
        onLogin={async (rep) => {
          // Save rep locally & update state
          if (!reps.some((r) => r.id === rep.id || r.name.toLowerCase() === rep.name.toLowerCase())) {
            try {
              await addRepToFirestore({
                name: rep.name,
                phone: rep.phone || '07800000000',
                code: rep.code || '1234',
                role: rep.role || 'rep',
                canEdit: rep.canEdit !== false,
                canDelete: Boolean(rep.canDelete),
                canMoveCustomer: rep.canMoveCustomer !== false,
                allowedListIds: rep.allowedListIds || ['all'],
              });
            } catch (e) {
              console.warn('Failed to save rep to database:', e);
            }
          }
          const nowIso = new Date().toISOString();
          const normalizedCode = normalizePin(rep.code);
          const loggedRep = { ...rep, code: normalizedCode || rep.code, lastSeen: nowIso, isOnline: true };
          loginTimestampRef.current = Date.now();
          setCurrentRep(loggedRep);
          setReps((prev) =>
            prev.map((r) =>
              r.id === loggedRep.id || (r.name && r.name.toLowerCase() === loggedRep.name.toLowerCase())
                ? { ...r, ...loggedRep }
                : r
            )
          );
          setIsPinUnlocked(true);
          try {
            localStorage.setItem('sami_app_pin_unlocked', 'true');
            sessionStorage.setItem('sami_app_pin_unlocked', 'true');
            localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(loggedRep));
            updateLocalCacheItem('reps', loggedRep as any);
          } catch (e) {
            // ignore
          }
          showToast(isAr ? `تم تسجيل الدخول بنجاح، أهلاً بك ${rep.name}` : `Welcome ${rep.name}`);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Top Header */}
      <HeaderAndStats
        currentRep={effectiveRep}
        reps={reps}
        customerLists={customerLists}
        selectedListId={selectedListId}
        onSelectListId={handleSelectListId}
        onOpenRepsModal={() => {
          if (effectiveRep?.role !== 'admin' && effectiveRep?.role !== 'supervisor') {
            showToast(isAr ? 'عذراً، إدارة المندوبين مقتصرة على المشرف أو المدير' : 'Reps management is restricted to Admin/Supervisor');
            return;
          }
          setIsRepsModalOpen(true);
        }}
        onOpenStatementModal={() => setIsStatementModalOpen(true)}
        onViewSplash={() => setShowSplash(true)}
        onUpdateRep={handleUpdateRep}
        onLogoutRep={async () => {
          setIsPinUnlocked(false);
          try {
            localStorage.removeItem('sami_app_pin_unlocked');
            sessionStorage.removeItem('sami_app_pin_unlocked');
          } catch (e) {
            // ignore
          }
          showToast(isAr ? 'تم قفل التطبيق وتسجيل الخروج' : 'App locked');
        }}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'customers') {
            setShowCustomerList(true);
          }
          if (tab === 'history') {
            setCustomerPaymentsFilter(null);
            setIsPaymentsHistoryOpen(true);
          }
        }}
        onOpenPaymentsHistoryWithFilter={(customerName) => {
          setCustomerPaymentsFilter(customerName);
          setIsPaymentsHistoryOpen(true);
        }}
        onSettleExcessPayment={handleSettleExcessPayment}
        onUpdatePayment={handleUpdatePayment}
        onDeletePayment={handleDeletePayment}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        contracts={contractsWithLiveBalances}
        displayedContractsCount={filteredContracts.length}
        payments={payments}
        employees={employees}
        employeeTransactions={employeeTransactions}
        inventoryCount={inventory.length}
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'ar' ? 'en' : 'ar'))}
        onOpenAddModal={() => {
          if (currentRep?.role !== 'admin' && currentRep?.canSell === false) {
            showToast(isAr ? 'عفواً، لا تملك صلاحية إجراء مبيعات جديدة' : 'You do not have permission to create sales');
            return;
          }
          setEditingContract(null);
          setIsFormModalOpen(true);
        }}
        onOpenInventoryModal={() => setIsInventoryModalOpen(true)}
        onOpenServerQueries={() => setIsServerQueriesOpen(true)}
        onOpenPrinterSettings={() => setIsPrinterSettingsOpen(true)}
        onOpenOfflineConflictsModal={() => setIsOfflineConflictsOpen(true)}
        paymentConflicts={paymentConflicts}
        onRejectConflict={async (conflict) => {
          try {
            setPaymentConflicts((prev) => prev.filter((c) => c.id !== conflict.id));
            await rejectPaymentConflictInFirestore(
              conflict,
              effectiveRep?.name || 'المدير'
            );
            showToast(isAr ? 'تم حذف الدفعة المعلقة بنجاح' : 'Conflict deleted successfully');
          } catch (err: any) {
            console.error('Error rejecting conflict:', err);
            showToast(isAr ? 'حدث خطأ أثناء حذف الدفعة' : 'Error deleting conflict');
          }
        }}
        isSyncing={isSyncing}
        syncError={syncError}
        pendingCount={pendingCount}
        appointments={appointments}
        onOpenAppointmentsBox={() => setIsAppointmentsBoxModalOpen(true)}
        onOpenBackgroundSync={() => setIsBackgroundSyncOpen(true)}
        onManualSync={async () => {
          setIsSyncing(true);
          try {
            const res = await reconcileAllLocalWithDatabase({ force: true, forcePushAll: true });
            if (res.success) {
              showToast(isAr ? 'تمت المطابقة الشاملة ورفع البيانات للسيرفر بنجاح' : 'All data reconciled and synced to server successfully');
            } else {
              showToast(isAr ? (res.message || 'تمت محاولة المزامنة') : 'Sync attempted');
            }
          } catch (e) {
            showToast(isAr ? 'تعذر الاتصال بالخادم للمزامنة' : 'Sync connection failed');
          } finally {
            setTimeout(() => setIsSyncing(false), 500);
          }
        }}
      />

      {/* View Switcher based on Active Tab */}
      <main className="w-full max-w-full sm:max-w-7xl xl:max-w-[1600px] 2xl:max-w-[1850px] mx-auto px-1.5 xs:px-2.5 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4 pb-24 sm:pb-28 dir-rtl transition-all duration-300 overflow-x-clip">
        {activeTab === 'home' && (
          <div className="space-y-4 sm:space-y-6 pt-1 sm:pt-2">
            {/* Main Menu Cards Grid */}
            {currentRep?.role !== 'admin' ? (
              /* Rep Home Screen: Responsive Grid Cards - Expands to 3-5 columns on large screens */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                {/* 1. Customers Page Card (قسم الزبائن) - Top Right */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedListId('all');
                    setShowCustomerList(false);
                    setActiveTab('customers');
                  }}
                  className="bg-sky-50/70 dark:bg-slate-800/90 border-2 border-sky-200/80 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <Users className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-xs sm:text-sm font-extrabold bg-sky-200/80 dark:bg-sky-950 text-sky-800 dark:text-sky-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap shrink-0">
                      {repContracts.length} {isAr ? 'زبون' : 'Clients'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'قسم الزبائن' : 'Customers Section'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'عرض الزبائن وإضافة المبيعات والتحصيل اليومي'
                        : 'View clients, add sales & daily collection'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-sky-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-sky-700 dark:text-sky-300">
                    <span>{isAr ? 'فتح الزبائن' : 'Open Customers'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* 2. Reps Payments Summary Box Card (صندوق تسديدات المندوبين) - Top Left */}
                <button
                  type="button"
                  onClick={() => setIsRepsPaymentsSummaryOpen(true)}
                  className="bg-emerald-50/70 dark:bg-slate-800/90 border-2 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <Wallet className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] sm:text-xs font-extrabold bg-emerald-200/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 sm:px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {repTodayPayments.length} {isAr ? 'تسديد اليوم' : 'Today'}
                      </span>
                      <span className="text-xs sm:text-sm font-black bg-emerald-700 text-white px-2 py-0.5 rounded-md shadow-2xs whitespace-nowrap">
                        {repTodayCollected.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'صندوق تسديدات المندوبين' : 'Reps Payments Box'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'عرض وحصيلة تسديدات اليوم والتصفية حسب التاريخ'
                        : 'Filter and view rep payment collections'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-emerald-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-emerald-700 dark:text-emerald-300">
                    <span>{isAr ? 'فتح الصندوق' : 'Open Box'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* 3. Appointments Box Card (صندوق المواعيد) */}
                <button
                  type="button"
                  onClick={() => setIsAppointmentsBoxModalOpen(true)}
                  className="bg-amber-50/70 dark:bg-slate-800/90 border-2 border-amber-200/80 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <CalendarClock className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-xs sm:text-sm font-extrabold bg-amber-200/80 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap shrink-0">
                      {appointments.length} {isAr ? 'موعد' : 'Appointments'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'صندوق المواعيد' : 'Appointments Box'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'عرض المواعيد المستحقة والتنبيهات المجدولة'
                        : 'View scheduled appointments and reminders'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-amber-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-amber-700 dark:text-amber-300">
                    <span>{isAr ? 'فتح المواعيد' : 'Open Appointments'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* Customer Maps Box Card (صندوق خرائط الزبائن) */}
                <button
                  type="button"
                  onClick={() => setIsCustomerMapsModalOpen(true)}
                  className="bg-emerald-50/70 dark:bg-slate-800/90 border-2 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <MapPinned className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-xs sm:text-sm font-extrabold bg-emerald-200/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap shrink-0">
                      {accessibleContractsWithLocationCount} {isAr ? 'علامة ع الخريطة' : 'on Map'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'صندوق خرائط الزبائن' : 'Customer Maps Box'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'عرض مواقع الزبائن على الخريطة وتتبعهم والتوجيه المباشر'
                        : 'View customer pins on map & direct GPS navigation'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-emerald-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-emerald-700 dark:text-emerald-300">
                    <span>{isAr ? 'فتح الخريطة' : 'Open Map'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* 4. Rep Debts & Loans Page Card (صندوق ديوني والسلف) */}
                <button
                  type="button"
                  onClick={() => setActiveTab('employees')}
                  className="bg-purple-50/70 dark:bg-slate-800/90 border-2 border-purple-200/80 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <HandCoins className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[11px] sm:text-xs font-extrabold bg-purple-200/80 dark:bg-purple-950 text-purple-800 dark:text-purple-200 px-2 sm:px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {isAr ? 'جميع ديوني' : 'My Debts'}
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-black px-2 py-0.5 rounded-md shadow-2xs whitespace-nowrap ${
                          currentRepDebt > 0
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {currentRepDebt.toLocaleString('en-US')} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'صندوق ديوني والسلف' : 'My Debts & Loans'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'عرض السلف والديون الخاصة بي وسجل السحب والتسديد'
                        : 'View your debt balance & loan transaction history'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-purple-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-purple-700 dark:text-purple-300">
                    <span>{isAr ? 'فتح ديوني' : 'Open My Debts'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>

                {/* 5. Direct Printer & Settings Card (صندوق الضبط والمزامنة الشاملة) */}
                <button
                  type="button"
                  onClick={() => setIsPrinterSettingsOpen(true)}
                  className="bg-teal-50/70 dark:bg-slate-800/90 border-2 border-teal-200/80 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-500 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer min-w-0"
                >
                  <div className="flex items-center justify-between mb-2.5 sm:mb-3 gap-1 min-w-0">
                    <div className="p-2.5 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-300 group-hover:scale-105 transition-transform shadow-2xs shrink-0">
                      <Settings className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-xs sm:text-sm font-extrabold bg-teal-200/80 dark:bg-teal-950 text-teal-800 dark:text-teal-200 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full whitespace-nowrap shrink-0">
                      {isAr ? 'الضبط والطباعة' : 'Settings'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1 min-w-0">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                      {isAr ? 'صندوق الضبط والمزامنة' : 'Settings & Sync Box'}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-semibold line-clamp-2 leading-relaxed">
                      {isAr
                        ? 'إعدادات النظام، مطابقة قاعدة البيانات، الأذونات، وطابعة البلوتوث'
                        : 'Manage system settings, database audit, permissions & Bluetooth'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-teal-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-teal-700 dark:text-teal-300">
                    <span>{isAr ? 'فتح الضبط' : 'Open Settings'}</span>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform shrink-0" />
                  </div>
                </button>
              </div>
            ) : (
              /* Admin Home Screen: Responsive Grid Cards - Expands to 3-5 columns on large screens */
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5 lg:gap-6">
                {/* 1. Customers Page Card (قسم الزبائن) - Top Right */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedListId('all');
                    setShowCustomerList(false);
                    setActiveTab('customers');
                  }}
                  className="bg-sky-50/70 dark:bg-slate-800/90 border-2 border-sky-200/80 dark:border-slate-700 hover:border-sky-400 dark:hover:border-sky-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <Users className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-sky-200/80 dark:bg-sky-950 text-sky-800 dark:text-sky-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {contracts.length} {isAr ? 'زبون' : 'Clients'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'قسم الزبائن' : 'Customers Section'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'عرض الزبائن وتحديد القوائم والتسديدات'
                        : 'View clients, choose list & daily payments'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-sky-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-sky-700 dark:text-sky-300">
                    <span>{isAr ? 'فتح الزبائن' : 'Open Clients'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 2. Reps Payments Summary Box Card (صندوق تسديدات المندوبين) - Top Left */}
                <button
                  type="button"
                  onClick={() => setIsRepsPaymentsSummaryOpen(true)}
                  className="bg-emerald-50/70 dark:bg-slate-800/90 border-2 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <Wallet className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-emerald-200/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {reps.length} {isAr ? 'مندوب' : 'Reps'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق تسديدات المندوبين' : 'Reps Payments Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'تصفية وحصيلة تسديدات المندوبين حسب التاريخ'
                        : 'Filter and view rep payment collections'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-emerald-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-emerald-700 dark:text-emerald-300">
                    <span>{isAr ? 'فتح الصندوق' : 'Open Box'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 3. Sales & Purchase Box Card (صندوق المبيعات والشراء) */}
                <button
                  type="button"
                  onClick={() => setIsSalesBoxModalOpen(true)}
                  className="bg-indigo-50/70 dark:bg-slate-800/90 border-2 border-indigo-200/80 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <ShoppingCart className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-indigo-200/80 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {contracts.length} {isAr ? 'عملية' : 'Sales'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق المبيعات والشراء' : 'Sales & Purchase Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'عرض المبيعات وتصفية القوائم والتواريخ'
                        : 'View sales, filter dates & lists'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-indigo-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-indigo-700 dark:text-indigo-300">
                    <span>{isAr ? 'فتح المبيعات' : 'Open Sales'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Appointments Box Card (صندوق المواعيد) - Visible to Admin */}
                <button
                  type="button"
                  onClick={() => setIsAppointmentsBoxModalOpen(true)}
                  className="bg-amber-50/70 dark:bg-slate-800/90 border-2 border-amber-200/80 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <CalendarClock className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-amber-200/80 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {appointments.length} {isAr ? 'موعد' : 'Appointments'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق المواعيد' : 'Appointments Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'عرض المواعيد المستحقة والتنبيهات المجدولة'
                        : 'View scheduled appointments and reminders'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-amber-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-amber-700 dark:text-amber-300">
                    <span>{isAr ? 'فتح المواعيد' : 'Open Appointments Box'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* Customer Maps Box Card (صندوق خرائط الزبائن) - Visible to Admin */}
                <button
                  type="button"
                  onClick={() => setIsCustomerMapsModalOpen(true)}
                  className="bg-emerald-50/70 dark:bg-slate-800/90 border-2 border-emerald-200/80 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <MapPinned className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-emerald-200/80 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {accessibleContractsWithLocationCount} {isAr ? 'علامة ع الخريطة' : 'on Map'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق خرائط الزبائن' : 'Customer Maps Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'عرض مواقع الزبائن على الخريطة وتتبعهم والتوجيه المباشر'
                        : 'View customer pins on map & direct GPS navigation'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-emerald-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-emerald-700 dark:text-emerald-300">
                    <span>{isAr ? 'فتح الخريطة' : 'Open Map'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 4. Payments History Card (صندوق سجل التسديدات) */}
                <button
                  type="button"
                  onClick={() => {
                    setCustomerPaymentsFilter(null);
                    setIsPaymentsHistoryOpen(true);
                  }}
                  className="bg-rose-50/70 dark:bg-slate-800/90 border-2 border-rose-200/80 dark:border-slate-700 hover:border-rose-400 dark:hover:border-rose-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <History className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-rose-200/80 dark:bg-rose-950 text-rose-800 dark:text-rose-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full dir-ltr">
                      {isAr ? `مبلغ اليوم: ${todayPaymentsTotal.toLocaleString('en-US')} د.ع` : `Today: ${todayPaymentsTotal.toLocaleString('en-US')} IQD`}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق سجل التسديدات' : 'Payments History Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'عرض سجل التسديدات وكشف الحساب الشامل'
                        : 'Review payment history & accounts'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-rose-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-rose-700 dark:text-rose-300">
                    <span>{isAr ? 'عرض التسديدات' : 'View Payments'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 5. Inventory Box Card (صندوق المخزن والمواد) */}
                <button
                  type="button"
                  onClick={() => setActiveTab('inventory')}
                  className="bg-amber-50/70 dark:bg-slate-800/90 border-2 border-amber-200/80 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <TrendingUp className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-amber-200/80 dark:bg-amber-950 text-amber-800 dark:text-amber-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {inventory.length} {isAr ? 'مادة' : 'Items'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق المخزن والمواد' : 'Inventory & Stock Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'إدارة المواد والمخزون والكميات المتوفرة'
                        : 'Stock inventory & quantities'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-amber-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-amber-700 dark:text-amber-300">
                    <span>{isAr ? 'فتح الصندوق' : 'Open Box'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 6. Representatives Management Box Card (صندوق إدارة المندوبين) */}
                <button
                  type="button"
                  onClick={() => {
                    if (effectiveRep?.role !== 'admin' && effectiveRep?.role !== 'supervisor') {
                      showToast(isAr ? 'عذراً، إدارة المندوبين مقتصرة على المشرف أو المدير فقط' : 'Reps management is restricted to Admin/Supervisor');
                      return;
                    }
                    setIsRepsModalOpen(true);
                  }}
                  className="bg-purple-50/70 dark:bg-slate-800/90 border-2 border-purple-200/80 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <Building2 className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-purple-200/80 dark:bg-purple-950 text-purple-800 dark:text-purple-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {reps.length} {isAr ? 'مندوب' : 'Reps'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق إدارة المندوبين' : 'Reps Management Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'إدارة حسابات المندوبين والصلاحيات والنسب'
                        : 'Manage representatives & permissions'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-purple-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-purple-700 dark:text-purple-300">
                    <span>{isAr ? 'فتح الصندوق' : 'Open Box'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 7. Funds Management Card (الصناديق والخزائن) */}
                <button
                  type="button"
                  onClick={() => setActiveTab('funds')}
                  className="bg-blue-50/70 dark:bg-slate-800/90 border-2 border-blue-200/80 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <Wallet className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-blue-200/80 dark:bg-blue-950 text-blue-800 dark:text-blue-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {funds.length} {isAr ? 'صندوق' : 'Funds'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'الصناديق والخزائن' : 'Funds & Treasury'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'سحب وإيداع وتحويلات مالية بين الصناديق'
                        : 'Deposit, withdraw, transfer cash'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-blue-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-blue-700 dark:text-blue-300">
                    <span>{isAr ? 'فتح الصناديق' : 'Open Funds'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 8. Employees & Debts Card (صندوق الديون والسلف) */}
                <button
                  type="button"
                  onClick={() => setActiveTab('employees')}
                  className="bg-indigo-50/70 dark:bg-slate-800/90 border-2 border-indigo-200/80 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 group-hover:scale-105 transition-transform shadow-2xs">
                      <HandCoins className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <span className="text-[11px] xs:text-xs sm:text-sm font-extrabold bg-indigo-200/80 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full">
                      {employees.length} {isAr ? 'موظف' : 'Employees'}
                    </span>
                  </div>
                  <div className="space-y-1 my-1">
                    <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                      {isAr ? 'صندوق الديون والسلف' : 'Debts & Loans Box'}
                    </h3>
                    <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-semibold line-clamp-2">
                      {isAr
                        ? 'ديون وسلف الموظفين وسحب وإرجاع الخزائن'
                        : 'Staff loans, repayments & fund entries'}
                    </p>
                  </div>
                  <div className="pt-2 sm:pt-3 border-t border-indigo-200/60 dark:border-slate-700/80 flex items-center justify-between text-xs sm:text-sm md:text-base font-black text-indigo-700 dark:text-indigo-300">
                    <span>{isAr ? 'فتح صندوق الديون' : 'Open Debts Box'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>

                {/* 9. Direct Printer & Settings Card */}
                <button
                  type="button"
                  onClick={() => setIsPrinterSettingsOpen(true)}
                  className="col-span-2 bg-teal-50/80 dark:bg-slate-800/90 border-2 border-teal-300/80 dark:border-teal-900/60 hover:border-teal-500 dark:hover:border-teal-400 rounded-2xl sm:rounded-3xl p-3 sm:p-4 md:p-5 text-right transition-all shadow-xs hover:shadow-md group flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
                    <div className="p-2 sm:p-3 md:p-3.5 rounded-xl sm:rounded-2xl bg-teal-600 text-white group-hover:scale-105 transition-transform shadow-sm shrink-0">
                      <Settings className="w-5 h-5 sm:w-7 sm:h-7 md:w-8 md:h-8" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-slate-100">
                          {isAr ? 'الإعدادات والمزامنة الشاملة' : 'System Settings & Sync'}
                        </h3>
                        <span className="text-[10px] sm:text-xs font-black bg-teal-200/80 dark:bg-teal-950 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded-full">
                          {isAr ? 'المزامنة والأذونات' : 'Sync & Permissions'}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm md:text-base text-slate-500 dark:text-slate-400 font-bold mt-0.5 line-clamp-1">
                        {isAr
                          ? 'إدارة إعدادات النظام، مطابقة قاعدة البيانات، الأذونات، وطابعة البلوتوث'
                          : 'Manage system settings, database audit, permissions & Bluetooth'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm md:text-base font-black text-teal-700 dark:text-teal-300 shrink-0">
                    <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                    <span className="hidden xs:inline">{isAr ? 'فتح الإعدادات' : 'Settings'}</span>
                    <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 rtl:rotate-0 ltr:rotate-180 group-hover:-translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
            )}

            {/* Reps Payments Summary Box Modal */}
            {isRepsPaymentsSummaryOpen && (
              <RepsPaymentsSummaryBox
                currentRep={effectiveRep}
                reps={reps}
                payments={payments}
                contracts={contractsWithLiveBalances}
                customerLists={customerLists}
                selectedListId={selectedListId}
                lang={lang}
                onClose={() => setIsRepsPaymentsSummaryOpen(false)}
              />
            )}

          </div>
        )}

        {activeTab === 'funds' && currentRep?.role === 'admin' && (
          <FundsView
            funds={funds}
            customerLists={customerLists}
            transactions={fundTransactions}
            currentRep={currentRep}
            lang={lang}
            contracts={contractsWithLiveBalances}
            onAddFund={handleAddFund}
            onUpdateFund={handleUpdateFund}
            onDeleteFund={handleDeleteFund}
            onReorderFunds={handleReorderFunds}
            onReorderLists={handleReorderLists}
            onRecalculateBalances={handleRecalculateFundBalances}
            onAddDepositOrWithdrawal={handleAddDepositOrWithdrawal}
            onTransfer={handleTransferBetweenFunds}
            onAddList={handleAddList}
            onUpdateList={handleUpdateList}
            onDeleteList={handleDeleteList}
            onDeleteFundTransaction={handleDeleteFundTransaction}
            onUpdateFundTransaction={handleUpdateFundTransaction}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeesView
            employees={employees}
            funds={funds}
            transactions={employeeTransactions}
            currentRep={currentRep}
            reps={reps}
            lang={lang}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onDeleteAllEmployees={handleDeleteAllEmployees}
            onProcessDebtTransaction={handleProcessEmployeeDebt}
            onDeleteEmployeeTransaction={handleDeleteEmployeeTransaction}
            onUpdateEmployeeTransaction={handleUpdateEmployeeTransaction}
            onSyncDebtBalances={handleSyncDebtBalances}
          />
        )}

        {activeTab === 'inventory' && currentRep?.role === 'admin' && (
          <InventoryView
            items={inventory}
            lang={lang}
            onAddItem={handleAddInventoryItem}
            onUpdateItem={handleUpdateInventoryItem}
            onDeleteItem={handleDeleteInventoryItem}
            currentRep={currentRep}
          />
        )}

        {activeTab === 'customers' && (
          <div className="space-y-3">
            {searchQuery && (
              <div className="flex items-center justify-between px-1 text-xs font-bold">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  {isAr ? `نتائج البحث عن: "${searchQuery}"` : `Search: "${searchQuery}"`}
                </span>
              </div>
            )}

            {filteredContracts.length > 0 ? (
              <div className="space-y-3">
                {filteredContracts.map((contract, index) => (
                  <ContractCard
                    key={contract.id}
                    contract={contract}
                    index={index + 1}
                    totalCount={filteredContracts.length}
                    lang={lang}
                    isExpanded={allCardsExpanded}
                    showExpandToggle={index === 0}
                    onToggleExpand={handleToggleAllCards}
                    onSelect={(c) => setSelectedContract(c)}
                    onPay={handleQuickPay}
                    onViewPayments={handleViewCustomerPayments}
                    onNewSale={handleNewSaleForCustomer}
                    onCall={handleCall}
                    onEdit={canEdit ? (e, c) => {
                      e.stopPropagation();
                      setEditingContract(c);
                      setIsFormModalOpen(true);
                    } : undefined}
                    onDelete={canDelete ? (e, c) => {
                      e.stopPropagation();
                      if (confirm(isAr ? 'هل أنت متأكد من حذف هذا العقد والزبون؟' : 'Delete contract?')) {
                        handleDeleteContract(c.id);
                      }
                    } : undefined}
                    customerLists={customerLists}
                    currentRep={currentRep}
                    isAdmin={isAdmin}
                    onMoveCustomer={handleMoveCustomer}
                    onAddAppointment={(c) => {
                      setSelectedContractForAppointment(c);
                      setIsAddAppointmentModalOpen(true);
                    }}
                    onSettleExcess={handleSettleExcessPayment}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                searchQuery={searchQuery}
                lang={lang}
                canSell={canSell}
                onOpenAddModal={() => {
                  if (!canSell) {
                    showToast(isAr ? 'عفواً، لا تملك صلاحية إجراء مبيعات جديدة' : 'You do not have permission to create sales');
                    return;
                  }
                  setEditingContract(null);
                  setIsFormModalOpen(true);
                }}
                onClearSearch={() => setSearchQuery('')}
              />
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <AddPaymentModal
        contract={addPaymentModalContract}
        isOpen={Boolean(addPaymentModalContract)}
        onClose={() => setAddPaymentModalContract(null)}
        onSavePayment={handleRecordCustomPayment}
        lang={lang}
        isAdmin={isAdmin}
        paymentCount={
          addPaymentModalContract
            ? payments.filter((p) => p.contractId === addPaymentModalContract.id).length
            : 0
        }
      />

      <ReceiptPrintTemplate receipt={activeReceiptData} />

      <ReceiptModal
        receipt={activeReceiptData}
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setAutoTriggerReceiptPrint(false);
        }}
        autoTriggerPrint={autoTriggerReceiptPrint}
      />

      <ContractDetailsModal
        contract={liveSelectedContract}
        payments={payments}
        customerLists={customerLists}
        isOpen={Boolean(selectedContract)}
        onClose={() => setSelectedContract(null)}
        onRecordPayment={handleRecordCustomPayment}
        onUpdatePayment={handleUpdatePayment}
        onDeletePayment={handleDeletePayment}
        onPrintReceipt={(receipt) => {
          setActiveReceiptData(receipt);
          directPrintReceipt(receipt);
          showToast(isAr ? 'تم إرسال الوصل للطباعة المباشرة' : 'Receipt sent to printer');
        }}
        onEdit={(c) => {
          setEditingContract(c);
          setIsFormModalOpen(true);
        }}
        onDelete={handleDeleteContract}
        onMoveCustomer={handleMoveCustomer}
        onOpenPaymentKeypad={(c) => {
          setSelectedContract(null);
          setAddPaymentModalContract(c);
        }}
        onSettleExcess={handleSettleExcessPayment}
        onOpenCustomerMaps={(c) => {
          setSelectedContract(null);
          setCustomerMapsInitialContract(c);
          setCustomerMapsAutoDrawRoute(false);
          setIsCustomerMapsModalOpen(true);
        }}
        onDrawRouteOnMap={(c) => {
          setSelectedContract(null);
          setCustomerMapsInitialContract(c);
          setCustomerMapsAutoDrawRoute(true);
          setIsCustomerMapsModalOpen(true);
        }}
        lang={lang}
        currentRep={effectiveRep}
      />

      <ContractFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingContract(null);
        }}
        onSave={handleSaveContract}
        editingContract={editingContract}
        inventory={inventory}
        customerLists={customerLists}
        defaultListId={selectedListId !== 'all' ? selectedListId : customerLists[0]?.id}
        lang={lang}
        currentRep={effectiveRep}
        reps={reps}
        onAddItemToInventory={handleAddInventoryItem}
        onUpdateInventoryItem={handleUpdateInventoryItem}
        onDeleteInventoryItem={handleDeleteInventoryItem}
      />

      <InventoryModal
        isOpen={isInventoryModalOpen}
        onClose={() => setIsInventoryModalOpen(false)}
        items={inventory}
        lang={lang}
        onAddItem={handleAddInventoryItem}
        onUpdateItem={handleUpdateInventoryItem}
        onDeleteItem={handleDeleteInventoryItem}
      />

      <DatabaseSchemaModal
        isOpen={isDatabaseSchemaOpen}
        onClose={() => setIsDatabaseSchemaOpen(false)}
      />

      <PaymentsHistoryModal
        isOpen={isPaymentsHistoryOpen}
        onClose={handleClosePaymentsHistory}
        customerFilterId={customerPaymentsFilter}
        payments={
          customerPaymentsFilter
            ? payments.filter((p) => {
                if (p.contractId && String(p.contractId).trim() === String(customerPaymentsFilter).trim()) return true;
                const normFilter = normalizeEntityName(customerPaymentsFilter);
                if (p.customerName && normFilter && normalizeEntityName(p.customerName) === normFilter) return true;
                const targetC = contractsWithLiveBalances.find(
                  (c) => c.id === customerPaymentsFilter || (c.customerName && normalizeEntityName(c.customerName) === normFilter)
                );
                if (targetC) {
                  if (p.contractId && String(p.contractId).trim() === String(targetC.id).trim()) return true;
                  if (p.customerName && targetC.customerName && (
                    normalizeEntityName(p.customerName) === normalizeEntityName(targetC.customerName) ||
                    p.customerName.trim().toLowerCase() === targetC.customerName.trim().toLowerCase()
                  )) return true;
                }
                return false;
              })
            : payments
        }
        contracts={contractsWithLiveBalances}
        customerLists={customerLists}
        lang={lang}
        currentRep={effectiveRep}
        onUpdatePayment={handleUpdatePayment}
        onDeletePayment={handleDeletePayment}
        onDeleteMultiplePayments={handleDeleteMultiplePayments}
        onSettleExcessPayment={handleSettleExcessPayment}
        onPrintReceipt={(receipt) => {
          setActiveReceiptData(receipt);
          directPrintReceipt(receipt);
          showToast(isAr ? 'تم إرسال الوصل للطباعة المباشرة' : 'Receipt sent to printer');
        }}
      />

      <RepsManagementModal
        isOpen={isRepsModalOpen}
        onClose={() => setIsRepsModalOpen(false)}
        reps={reps}
        customerLists={customerLists}
        currentRep={effectiveRep}
        onSelectRep={(rep) => {
          setCurrentRep(rep);
          try {
            localStorage.setItem(REP_STORAGE_KEY, JSON.stringify(rep));
          } catch (e) {}
          setIsRepsModalOpen(false);
          showToast(isAr ? `تم التبديل إلى حساب: ${rep.name}` : `Switched to ${rep.name}`);
        }}
        onAddRep={handleAddRep}
        onUpdateRep={handleUpdateRep}
        onDeleteRep={handleDeleteRep}
        lang={lang}
      />

      <CustomerStatementModal
        isOpen={isStatementModalOpen}
        onClose={handleCloseCustomerStatement}
        contracts={contractsWithLiveBalances}
        payments={payments}
        customerLists={customerLists}
        lang={lang}
        currentRep={currentRep}
      />

      <SalesBoxModal
        isOpen={isSalesBoxModalOpen}
        onClose={() => setIsSalesBoxModalOpen(false)}
        contracts={contractsWithLiveBalances}
        customerLists={customerLists}
        inventory={inventory}
        reps={reps}
        currentRep={currentRep}
        lang={lang}
        onOpenCustomerHistory={(contract) => {
          setSelectedContract(contract);
          setActiveTab('customers');
          setShowCustomerList(false);
        }}
      />

      <PrinterSettingsModal
        isOpen={isPrinterSettingsOpen}
        onClose={() => setIsPrinterSettingsOpen(false)}
        lang={lang}
        onOpenServerQueries={() => setIsServerQueriesOpen(true)}
        currentRep={currentRep}
        isAdmin={isAdmin}
      />

      <BackgroundSyncModal
        isOpen={isBackgroundSyncOpen}
        onClose={() => setIsBackgroundSyncOpen(false)}
        lang={lang}
      />

      <ServerQueriesModal
        isOpen={isServerQueriesOpen}
        onClose={() => setIsServerQueriesOpen(false)}
        lang={lang}
        appContracts={contractsWithLiveBalances}
        appPayments={payments}
        appFunds={funds}
        appInventory={inventory}
        appEmployees={employees}
        appReps={reps}
        appCustomerLists={customerLists}
        onRefreshApp={async () => {
          await forceRefreshAllDataFromPostgres();
        }}
        onDeleteAllCustomersAndPayments={handleDeleteAllCustomersAndPayments}
      />

      <OfflinePaymentConflictsModal
        isOpen={isOfflineConflictsOpen}
        onClose={() => setIsOfflineConflictsOpen(false)}
        conflicts={paymentConflicts}
        contracts={contractsWithLiveBalances}
        currentRep={currentRep}
        onResolveConflict={handleResolveConflict}
        onRejectConflict={async (conflict) => {
          try {
            setPaymentConflicts((prev) => prev.filter((c) => c.id !== conflict.id));
            await rejectPaymentConflictInFirestore(
              conflict,
              currentRep?.name || 'المدير'
            );
            showToast(isAr ? 'تم إلغاء الدفعة المعلقة بنجاح' : 'Payment conflict rejected');
          } catch (err: any) {
            console.error('Error rejecting payment conflict:', err);
            showToast(isAr ? `حدث خطأ أثناء الإلغاء: ${err?.message || err}` : `Error rejecting conflict: ${err?.message || err}`);
          }
        }}
        lang={lang}
      />

      {/* Add Appointment Modal */}
      <AddAppointmentModal
        isOpen={isAddAppointmentModalOpen}
        onClose={() => setIsAddAppointmentModalOpen(false)}
        contract={selectedContractForAppointment}
        currentRep={currentRep}
        lang={lang}
        onSaveAppointment={handleSaveAppointment}
      />

      {/* Appointments Box Modal */}
      <AppointmentsBoxModal
        isOpen={isAppointmentsBoxModalOpen}
        onClose={() => setIsAppointmentsBoxModalOpen(false)}
        appointments={appointments}
        customerLists={customerLists}
        contracts={contractsWithLiveBalances}
        currentRep={currentRep}
        isAdmin={isAdmin}
        lang={lang}
        onDeleteAppointment={handleDeleteAppointment}
        onUpdateAppointment={handleUpdateAppointment}
        onOpenAddModal={() => {
          if (contractsWithLiveBalances.length > 0) {
            setSelectedContractForAppointment(contractsWithLiveBalances[0]);
            setIsAddAppointmentModalOpen(true);
          }
        }}
        onSelectCustomer={(contract) => {
          setSelectedContract(contract);
          setIsAppointmentsBoxModalOpen(false);
        }}
      />

      {/* Customer Maps Modal (صندوق خرائط الزبائن) */}
      <CustomerMapsModal
        isOpen={isCustomerMapsModalOpen}
        onClose={() => {
          setIsCustomerMapsModalOpen(false);
          setCustomerMapsInitialContract(null);
          setCustomerMapsAutoDrawRoute(false);
        }}
        contracts={contractsWithLiveBalances}
        customerLists={customerLists}
        currentRep={currentRep}
        isAdmin={isAdmin}
        lang={lang}
        initialCustomer={customerMapsInitialContract}
        autoDrawRoute={customerMapsAutoDrawRoute}
        onSelectCustomer={(contract) => {
          setSelectedContract(contract);
          setIsCustomerMapsModalOpen(false);
        }}
        onViewCustomerPayments={(contract) => {
          setCustomerPaymentsFilter(contract.id);
          setIsPaymentsHistoryOpen(true);
        }}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          onClick={() => setToastMessage(null)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-extrabold shadow-2xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200 dir-rtl cursor-pointer select-none"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
