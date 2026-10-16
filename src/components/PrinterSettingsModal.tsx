import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Bluetooth,
  CheckCircle2,
  RefreshCw,
  Trash2,
  AlertCircle,
  ShieldCheck,
  Lock,
  Settings,
  Wifi,
  Bell,
  Server,
  Globe,
  Database,
  Sparkles,
  FileText,
  Zap,
  Power,
  Radio,
  Layers,
  Smartphone,
  ExternalLink,
  Eye,
} from 'lucide-react';
import { Language } from '../types';
import {
  getSavedPrinterConfig,
  savePrinterConfig,
  scanAndSaveBluetoothPrinter,
  listPairedBluetoothDevices,
  requestWebBluetoothDevice,
  requestAndroidBluetoothPermissions,
  ensureBluetoothEnabled,
  BluetoothDevice,
  directPrintReceipt,
  ThermalReceiptData,
  PrinterConfig,
  PrintMethod,
  getSavedPrintersList,
  removePrinterProfile,
  switchActivePrinter,
  SavedPrinterProfile,
  openNativeBluetoothSettings,
} from '../lib/bluetoothPrinter';
import { initCapacitorPush } from '../lib/capacitorPush';
import {
  flushPendingQueue,
  requestAllBackgroundAndSyncPermissions,
  setFieldKeepAliveMode,
  isKeepAliveModeEnabled,
  requestDisplayOverAppsPermission,
  openBatteryOptimizationSettings,
  openAutoStartSettings,
} from '../lib/offlineQueue';
import { checkServerHealth } from '../lib/apiConfig';
import { forceRefreshAllDataFromPostgres, reconcileAllLocalWithDatabase } from '../lib/postgresClient';

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onOpenServerQueries?: () => void;
  currentRep?: any;
  isAdmin?: boolean;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  onOpenServerQueries,
  currentRep,
  isAdmin,
}) => {
  const isAr = lang === 'ar';
  const [config, setConfig] = useState<PrinterConfig>({
    deviceId: null,
    deviceName: null,
    autoPrintOnPayment: true,
    printMethod: 'direct_bluetooth',
    networkIp: '',
    networkPort: 9100,
  });
  const [printerProfiles, setPrinterProfiles] = useState<SavedPrinterProfile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRequestingPerms, setIsRequestingPerms] = useState(false);
  const [isEnablingBackground, setIsEnablingBackground] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[] | null>(null);
  const [showDevicePicker, setShowDevicePicker] = useState<boolean>(false);

  // Keep-Alive & Anti-Sleep states
  const [isKeepAliveOn, setIsKeepAliveOn] = useState<boolean>(false);
  const [isTogglingKeepAlive, setIsTogglingKeepAlive] = useState<boolean>(false);
  const [isRequestingOverlay, setIsRequestingOverlay] = useState<boolean>(false);
  const [isRequestingBattery, setIsRequestingBattery] = useState<boolean>(false);
  const [isRequestingAutoStart, setIsRequestingAutoStart] = useState<boolean>(false);
  const [showLockGuide, setShowLockGuide] = useState<boolean>(false);

  // Server & Database connection state
  const [isTestingServer, setIsTestingServer] = useState<boolean>(false);
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [reconcileResult, setReconcileResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [serverHealth, setServerHealth] = useState<{
    tested: boolean;
    ok: boolean;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleRunReconciliation = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const res = await reconcileAllLocalWithDatabase({ force: true, forcePushAll: true });
      setReconcileResult({
        success: res.success,
        message: res.message,
        count: res.totalInserted,
      });
      setStatusMessage({ text: res.message, type: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setReconcileResult({
        success: false,
        message: e?.message || 'حدث خطأ أثناء مطابقة قاعدة البيانات',
      });
      setStatusMessage({ text: e?.message || 'خطأ أثناء المطابقة', type: 'error' });
    } finally {
      setIsReconciling(false);
    }
  };

  const loadSavedData = () => {
    const saved = getSavedPrinterConfig();
    setConfig(saved);
    setPrinterProfiles(getSavedPrintersList());
    setIsKeepAliveOn(isKeepAliveModeEnabled());
  };

  const handleToggleKeepAlive = async () => {
    setIsTogglingKeepAlive(true);
    try {
      const next = !isKeepAliveOn;
      await setFieldKeepAliveMode(next);
      setIsKeepAliveOn(next);
      setStatusMessage({
        text: isAr
          ? next
            ? '⚡ تم تفعيل وضع العمل الميداني المستمر (مانع النوم + النبض الصامت + إبقاء الشاشة حية) بنجاح!'
            : 'تم إيقاف وضع العمل الميداني المستمر.'
          : next
            ? 'Field Keep-Alive mode activated!'
            : 'Field Keep-Alive mode deactivated.',
        type: 'success',
      });
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'خطأ في تفعيل وضع البقاء مستيقظاً', type: 'error' });
    } finally {
      setIsTogglingKeepAlive(false);
    }
  };

  const handleRequestOverlay = async () => {
    setIsRequestingOverlay(true);
    try {
      const res = await requestDisplayOverAppsPermission();
      setStatusMessage({ text: res.message, type: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'خطأ أثناء طلب صلاحية الظهور فوق التطبيقات', type: 'error' });
    } finally {
      setIsRequestingOverlay(false);
    }
  };

  const handleOpenBattery = async () => {
    setIsRequestingBattery(true);
    try {
      const res = await openBatteryOptimizationSettings();
      setStatusMessage({ text: res.message, type: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'خطأ أثناء فتح إعدادات البطارية', type: 'error' });
    } finally {
      setIsRequestingBattery(false);
    }
  };

  const handleOpenAutoStart = async () => {
    setIsRequestingAutoStart(true);
    try {
      const res = await openAutoStartSettings();
      setStatusMessage({ text: res.message, type: res.success ? 'success' : 'error' });
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'خطأ أثناء فتح إعدادات التشغيل التلقائي', type: 'error' });
    } finally {
      setIsRequestingAutoStart(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSavedData();
      flushPendingQueue().catch(() => {});
      setStatusMessage(null);
      setPairedDevices(null);
      setShowDevicePicker(false);
      setServerHealth(null);
    }
  }, [isOpen]);

  const handleTestServerConnection = async () => {
    setIsTestingServer(true);
    setServerHealth(null);
    try {
      const res = await checkServerHealth();
      if (res.ok) {
        setServerHealth({
          tested: true,
          ok: true,
          latencyMs: res.latencyMs,
          message: isAr
            ? `متصل بنجاح بقاعدة بيانات السيرفر (${res.latencyMs}ms)`
            : `Connected to Cloud PostgreSQL DB (${res.latencyMs}ms)`,
        });
        // Also trigger fresh data pull
        await forceRefreshAllDataFromPostgres().catch(() => {});
      } else {
        setServerHealth({
          tested: true,
          ok: false,
          latencyMs: res.latencyMs,
          message: res.error || (isAr ? 'تعذر الاتصال بالخادم' : 'Failed to connect to server'),
        });
      }
    } catch (e: any) {
      setServerHealth({
        tested: true,
        ok: false,
        message: e?.message || (isAr ? 'خطأ في الاتصال' : 'Connection error'),
      });
    } finally {
      setIsTestingServer(false);
    }
  };


  if (!isOpen) return null;

  const handleSwitchPrinter = (profile: SavedPrinterProfile) => {
    const updated = switchActivePrinter(profile);
    setConfig(updated);
    setPrinterProfiles(getSavedPrintersList());
    const targetName = profile.type === 'system_default' || profile.name === 'طابعة النظام الافتراضية' || profile.name === 'طابعة النظام' ? 'PDF' : profile.name;
    setStatusMessage({
      text: isAr ? `تم تغيير الطابعة بنجاح إلى: ${targetName}` : `Switched printer to: ${targetName}`,
      type: 'success',
    });
  };

  const handleSavePrinter = (nameToSave: string, idToSave: string, method?: PrintMethod) => {
    const cleanName = (nameToSave || 'طابعة البلوتوث').trim();
    const cleanId = (idToSave || cleanName).trim();

    const updated = savePrinterConfig({
      deviceId: cleanId,
      deviceName: cleanName,
      printMethod: method || 'direct_bluetooth',
      autoPrintOnPayment: true,
    });

    if (updated) {
      setConfig(updated);
      setPrinterProfiles(getSavedPrintersList());
      setShowDevicePicker(false);
      setStatusMessage({
        text: isAr ? `تم الاتصال واعتماد الطابعة: ${cleanName}` : `Connected and set printer: ${cleanName}`,
        type: 'success',
      });
    }
  };

  const handleRequestAllPermissions = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsRequestingPerms(true);
    setStatusMessage({
      text: isAr ? 'جاري فحص وتفعيل اتصال البلوتوث والمزامنة في الخلفية...' : 'Requesting Bluetooth & background sync...',
      type: 'info',
    });

    try {
      // Trigger native Android bridge & background permissions
      const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
      if (androidBridge && typeof androidBridge.requestPermissions === 'function') {
        androidBridge.requestPermissions();
      }

      await requestAllBackgroundAndSyncPermissions();
      await requestAndroidBluetoothPermissions();
      await ensureBluetoothEnabled();
      await flushPendingQueue();
    } catch (e) {
      console.warn('Permissions check error:', e);
    }

    try {
      await initCapacitorPush();
    } catch (e) {}

    try {
      localStorage.setItem('alkarrar_all_perms_granted', 'true');
      localStorage.setItem('sami_app_pin_unlocked', 'true');
      sessionStorage.setItem('sami_app_pin_unlocked', 'true');
    } catch (e) {}

    setIsRequestingPerms(false);
    setStatusMessage({
      text: isAr
        ? 'تم تفعيل اتصال البلوتوث والمزامنة الحية في الخلفية بنجاح.'
        : 'Bluetooth & background live sync enabled successfully.',
      type: 'success',
    });
  };

  const handleScanAndSave = async () => {
    setIsScanning(true);
    setStatusMessage({
      text: isAr ? 'جاري البحث عن طابعات البلوتوث المقترنة والمحيطة...' : 'Scanning for Bluetooth printers...',
      type: 'info',
    });

    try {
      // 1. Native paired devices list (Android APK or bridge)
      const devices = await listPairedBluetoothDevices();

      if (devices && devices.length > 0) {
        setIsScanning(false);
        setPairedDevices(devices);
        setShowDevicePicker(true);
        setStatusMessage({
          text: isAr ? `تم العثور على ${devices.length} جهاز بلوتوث. اضغط للاعتماد:` : `Found ${devices.length} Bluetooth devices. Select one:`,
          type: 'info',
        });
        return;
      }

      // 2. Web Bluetooth Dialog (Web browser on mobile or desktop)
      if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
        const webRes = await requestWebBluetoothDevice();
        setIsScanning(false);
        if (webRes.success && webRes.deviceName) {
          const updated = getSavedPrinterConfig();
          setConfig(updated);
          setPrinterProfiles(getSavedPrintersList());
          setStatusMessage({
            text: isAr ? `تم الاتصال بنجاح مع: ${webRes.deviceName}` : `Connected to: ${webRes.deviceName}`,
            type: 'success',
          });
          return;
        } else if (webRes.message && !webRes.message.includes('غير مدعومة')) {
          setStatusMessage({
            text: webRes.message,
            type: 'info',
          });
          return;
        }
      }

      // 3. Fallback scan via serial / bridge
      const res = await scanAndSaveBluetoothPrinter();
      setIsScanning(false);

      if (res.success && res.deviceName) {
        const updated = getSavedPrinterConfig();
        setConfig(updated);
        setPrinterProfiles(getSavedPrintersList());
        setStatusMessage({
          text: isAr ? `تم الاقتران بالطابعة: ${res.deviceName}` : `Connected to: ${res.deviceName}`,
          type: 'success',
        });
      } else {
        setStatusMessage({
          text: isAr
            ? 'لم يتم العثور على طابعة مقترنة. يرجى الاقتران بالطابعة من إعدادات بلوتوث الهاتف ثم الضغط على بحث مجدداً.'
            : 'No paired printer found. Please pair in phone settings and scan again.',
          type: 'info',
        });
      }
    } catch (err: any) {
      setIsScanning(false);
      setStatusMessage({
        text: isAr ? `تنبيه: ${err.message || 'يرجى التأكد من تشغيل البلوتوث واقتران الطابعة.'}` : `Notice: ${err.message || 'Please check Bluetooth.'}`,
        type: 'info',
      });
    }
  };

  const handleSelectDevice = (dev: BluetoothDevice) => {
    const deviceId = dev.address || dev.id || dev.name;
    const deviceName = dev.name || 'طابعة البلوتوث';
    handleSavePrinter(deviceName, deviceId);
  };

  const handleOpenPhoneBluetooth = () => {
    const opened = openNativeBluetoothSettings();
    if (opened) {
      setStatusMessage({
        text: isAr ? 'تم فتح إعدادات البلوتوث للهاتف. قم باقتران الطابعة ثم عد للتطبيق.' : 'Bluetooth settings opened. Pair your printer and return.',
        type: 'info',
      });
    } else {
      setStatusMessage({
        text: isAr ? 'يرجى فتح تطبيق "الإعدادات" في هاتفك ثم البلوتوث للاقتران بالطابعة.' : 'Please open Phone Settings -> Bluetooth to pair your printer.',
        type: 'info',
      });
    }
  };

  const handleTestPrint = async () => {
    setIsTesting(true);
    const targetPrinterName = config.deviceName || 'طابعة البلوتوث';

    setStatusMessage({
      text: isAr ? `جاري إرسال وصل الفحص إلى ${targetPrinterName}...` : `Testing print to ${targetPrinterName}...`,
      type: 'info',
    });

    const now = new Date();
    const testData: ThermalReceiptData = {
      shopTitle: 'الكرار للموبايل',
      receiptNo: '0000',
      customerName: 'فحص الطابعة المباشرة',
      itemName: 'وصل اختبار النظام المباشر',
      totalPrice: 100000,
      totalPaid: 100000,
      remainingBalance: 0,
      paidAmount: 100000,
      amountInWords: 'مائة ألف دينار عراقي لا غير',
      dateStr: `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`,
      timeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      template: 'template_1',
    };

    const res = await directPrintReceipt(testData, (progressMsg) => {
      setStatusMessage({
        text: progressMsg,
        type: 'info',
      });
    });

    setIsTesting(false);

    if (res.success) {
      setStatusMessage({
        text: isAr ? 'تم إرسال الطباعة المباشرة بنجاح' : 'Direct print sent successfully',
        type: 'success',
      });
    } else {
      setStatusMessage({
        text: res.message || (isAr ? 'تعذر إرسال وصل الفحص' : 'Test print failed'),
        type: 'error',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-3xl lg:max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 bg-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Settings className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white">
                {isAr ? 'الإعدادات والمزامنة الشاملة' : 'Application Settings & Sync'}
              </h2>
              <p className="text-[11px] text-teal-100 font-bold opacity-90">
                {isAr ? 'إدارة الإعدادات، مطابقة قاعدة البيانات، الأذونات، وطابعة البلوتوث' : 'Manage settings, database audit, permissions & Bluetooth'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Status Alert Banner */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                  : 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <RefreshCw className="w-4 h-4 text-sky-600 animate-spin shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* 1. الطابعة المعتمدة حالياً (Bluetooth Printer at Top) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border-2 border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 rounded-xl">
                  <Bluetooth className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                    {isAr ? 'الطابعة المعتمدة حالياً للطباعة:' : 'Active Connected Printer:'}
                  </span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {config.printMethod === 'system_default'
                      ? 'PDF'
                      : (config.deviceName === 'طابعة النظام الافتراضية' || config.deviceName === 'طابعة النظام'
                          ? 'PDF'
                          : (config.deviceName || (isAr ? 'طابعة البلوتوث المباشرة' : 'Direct Bluetooth Printer')))}
                  </span>
                  {config.deviceId && (
                    <span className="text-[10px] font-mono text-slate-400 block dir-ltr text-right">
                      ID / MAC: {config.deviceId}
                    </span>
                  )}
                </div>
              </div>

              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                {isAr ? 'معتمدة للطباعة' : 'Active'}
              </span>
            </div>

            {/* طريقة الطباعة السريعة: بلوتوث مباشر / تطبيق RawBT / PDF */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700/80">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 block mb-1.5">
                {isAr ? '🎯 نمط وطريقة إرسال الطباعة:' : 'Print Method:'}
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const updated = savePrinterConfig({ printMethod: 'direct_bluetooth' });
                    if (updated) {
                      setConfig(updated);
                      setStatusMessage({
                        text: isAr ? 'تم تفعيل نمط الطباعة المباشرة عبر البلوتوث (ESC/POS)' : 'Switched to Direct Bluetooth ESC/POS',
                        type: 'success',
                      });
                    }
                  }}
                  className={`py-2 px-1.5 rounded-xl border text-[11px] font-black flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    config.printMethod === 'direct_bluetooth' || !config.printMethod
                      ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-400'
                  }`}
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span className="truncate">{isAr ? 'بلوتوث مباشر' : 'Direct BT'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated = savePrinterConfig({ printMethod: 'rawbt', deviceName: 'تطبيق RawBT للأندرويد' });
                    if (updated) {
                      setConfig(updated);
                      setStatusMessage({
                        text: isAr ? 'تم تفعيل الطباعة عبر تطبيق RawBT للأندرويد' : 'Switched to RawBT Android App',
                        type: 'success',
                      });
                    }
                  }}
                  className={`py-2 px-1.5 rounded-xl border text-[11px] font-black flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    config.printMethod === 'rawbt'
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                  }`}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="truncate">{isAr ? 'تطبيق RawBT' : 'RawBT App'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated = savePrinterConfig({ printMethod: 'system_default', deviceName: 'PDF' });
                    if (updated) {
                      setConfig(updated);
                      setStatusMessage({
                        text: isAr ? 'تم تفعيل طباعة PDF' : 'Switched to PDF',
                        type: 'success',
                      });
                    }
                  }}
                  className={`py-2 px-1.5 rounded-xl border text-[11px] font-black flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    config.printMethod === 'system_default'
                      ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-400'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">PDF</span>
                </button>
              </div>
            </div>

            {/* قائمة الطابعات المحفوظة */}
            {printerProfiles && printerProfiles.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80 space-y-2">
                <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">
                  {isAr ? '📋 الطابعات المحفوظة (اضغط للتبديل الفوري):' : 'Saved Printers (Tap to switch):'}
                </span>
                <div className="grid grid-cols-1 gap-1.5">
                  {printerProfiles.map((p) => {
                    const isActive =
                      (config.deviceId && p.address === config.deviceId) ||
                      (config.deviceName && p.name === config.deviceName);

                    return (
                      <div
                        key={p.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                          isActive
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-400 dark:border-teal-700'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Printer className={`w-4 h-4 ${isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'}`} />
                          <div>
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 block">
                              {p.type === 'system_default' || p.name === 'طابعة النظام الافتراضية' || p.id === 'system_default_printer'
                                ? 'PDF'
                                : p.name}
                            </span>
                            {p.address && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                {p.address}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isActive ? (
                            <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-teal-600 text-white flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              {isAr ? 'الحالية' : 'Current'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSwitchPrinter(p)}
                              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold cursor-pointer transition-all shadow-sm active:scale-95"
                            >
                              {isAr ? 'تغيير واعتماد' : 'Switch'}
                            </button>
                          )}

                          {printerProfiles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                removePrinterProfile(p.id);
                                setPrinterProfiles(getSavedPrintersList());
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors cursor-pointer"
                              title={isAr ? 'حذف من القائمة' : 'Delete'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* زر البحث عن طابعة عبر البلوتوث */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleScanAndSave}
                disabled={isScanning}
                className="py-3 px-4 rounded-2xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isScanning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Bluetooth className="w-4 h-4" />
                )}
                <span>
                  {isScanning
                    ? (isAr ? 'جاري فحص وبحث البلوتوث...' : 'Scanning...')
                    : (isAr ? '🔍 البحث عن طابعة البلوتوث' : 'Search for Bluetooth')}
                </span>
              </button>

              <button
                type="button"
                onClick={handleOpenPhoneBluetooth}
                className="py-3 px-4 rounded-2xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-98 text-slate-800 dark:text-slate-100 font-black text-xs sm:text-sm border border-slate-300 dark:border-slate-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{isAr ? 'إعدادات بلوتوث الهاتف' : 'Phone BT Settings'}</span>
              </button>
            </div>

            {/* قائمة الأجهزة المقترنة */}
            {showDevicePicker && pairedDevices && pairedDevices.length > 0 && (
              <div className="p-4 bg-teal-50/90 dark:bg-slate-900/90 rounded-2xl border-2 border-teal-300 dark:border-teal-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-teal-200 dark:border-teal-800">
                  <span className="text-xs font-black text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                    <Bluetooth className="w-4 h-4 text-teal-600" />
                    {isAr ? 'الأجهزة المتاحة (اضغط للاختيار):' : 'Available Devices:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowDevicePicker(false)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {isAr ? 'إغلاق' : 'Close'}
                  </button>
                </div>

                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {pairedDevices.map((dev, idx) => {
                    const devMac = dev.address || dev.id || '';
                    const isSelected =
                      config.deviceId === devMac ||
                      (config.deviceName && dev.name && config.deviceName.toLowerCase() === dev.name.toLowerCase());

                    return (
                      <button
                        key={devMac || idx}
                        type="button"
                        onClick={() => handleSelectDevice(dev)}
                        className={`w-full p-3 rounded-xl border transition-all text-right flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-700 shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-teal-500'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Printer className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-teal-600'}`} />
                          <div>
                            <div className="text-xs font-black">{dev.name || 'طابعة البلوتوث'}</div>
                            {devMac && (
                              <div className={`text-[10px] font-mono dir-ltr text-right ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                                MAC: {devMac}
                              </div>
                            )}
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-white/20 text-white flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {isAr ? 'معتمدة' : 'Active'}
                          </span>
                        ) : (
                          <span className="text-[11px] font-extrabold text-teal-600 dark:text-teal-400">
                            {isAr ? 'تغيير واعتماد' : 'Select'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* اختبار طباعة */}
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={isTesting}
              className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span>{isAr ? '⚡ اختبار طباعة وصل تجريبي الآن' : 'Test Print Receipt Now'}</span>
            </button>
          </div>

          {/* 2. قسم جميع الأذونات والمزامنة والعمل في الخلفية */}
          <div className="p-3.5 bg-indigo-50/80 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-200 dark:border-indigo-900 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 block">
                  {isAr ? 'جميع الأذونات وإعدادات المزامنة الشاملة' : 'All Permissions & Sync Settings'}
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                  {isAr ? 'تفعيل الصلاحيات، تشغيل الخلفية، ومطابقة البيانات' : 'Grant permissions, background sync & database audit'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleRequestAllPermissions}
                disabled={isRequestingPerms}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm disabled:opacity-50"
              >
                {isRequestingPerms && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isAr ? 'منح كافة الصلاحيات' : 'All Permissions'}</span>
              </button>
            </div>

            {/* أزرار سريعة لصلاحيات الأندرويد المتقدمة واستثناء البطارية */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={openBatteryOptimizationSettings}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                title={isAr ? 'استثناء من توفير البطارية لضمان المزامنة الدائمة' : 'Disable battery optimization'}
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span>{isAr ? 'استثناء البطارية' : 'No Battery Saver'}</span>
              </button>

              <button
                type="button"
                onClick={openAutoStartSettings}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1 transition-all cursor-pointer"
                title={isAr ? 'تشغيل تلقائي في الخلفية بدون توقف' : 'Allow auto-start'}
              >
                <Power className="w-3 h-3 text-emerald-500" />
                <span>{isAr ? 'تشغيل تلقائي' : 'Auto-Start'}</span>
              </button>

              <button
                type="button"
                onClick={requestDisplayOverAppsPermission}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-[10px] font-black text-indigo-700 dark:text-indigo-300 flex items-center justify-center gap-1 transition-all cursor-pointer col-span-2 sm:col-span-1"
                title={isAr ? 'السماح بالظهور فوق التطبيقات' : 'Display over other apps'}
              >
                <ExternalLink className="w-3 h-3 text-blue-500" />
                <span>{isAr ? 'الظهور بالأعلى' : 'Overlay Perm'}</span>
              </button>
            </div>

            {reconcileResult && (
              <div className={`p-2.5 rounded-xl text-[11px] font-medium flex items-center gap-2 ${
                reconcileResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}>
                <div>
                  <p className="font-bold">{reconcileResult.message}</p>
                  {reconcileResult.count !== undefined && reconcileResult.count > 0 && (
                    <p className="text-[10px] mt-0.5 opacity-90">
                      {isAr ? `تمت مزامنة وإدراج ${reconcileResult.count} سجل جديد بنجاح` : `Successfully reconciled ${reconcileResult.count} records`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* مؤشر الفحص والمطابقة التلقائية في الخلفية */}
            <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {isAr ? 'الفحص والمطابقة والمزامنة بالخلفية:' : 'Background Audit & Sync:'}
                </span>
              </div>
              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                {isAr ? 'تعمل تلقائياً 100%' : '100% Automatic'}
              </span>
            </div>

            {serverHealth?.message && (
              <p
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl ${
                  serverHealth.ok
                    ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'text-sky-700 bg-sky-50 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                }`}
              >
                {serverHealth.message}
              </p>
            )}

            {/* حالة خادم السحاب المباشر التلقائي */}
            <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/60 flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-600 dark:text-slate-400">
                {isAr ? 'خادم المزامنة التلقائي:' : 'Auto Sync Server:'}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                {isAr ? 'مربوط ومفعل تلقائياً (100%)' : 'Auto-Connected (100%)'}
              </span>
            </div>

            {/* قسم استعلامات السيرفر المباشرة - خاص بالمدير فقط */}
            {((currentRep ? currentRep.role === 'admin' : true) || isAdmin) && onOpenServerQueries && (
              <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-emerald-900/10 via-teal-900/10 to-indigo-900/10 border-2 border-emerald-300 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 shadow-xs mt-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
                    <Database className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {isAr ? 'استعلامات السيرفر المباشرة' : 'Direct Server Queries'}
                      </span>
                      <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700">
                        {isAr ? 'خاص بالمدير' : 'Admin Only'}
                      </span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {isAr
                        ? 'جدول المجاميع المباشرة للزبائن، المندوبين، الموظفين، المبيعات، الصناديق والقوائم'
                        : 'Live server database totals table'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenServerQueries();
                  }}
                  className="w-full sm:w-auto justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-md cursor-pointer transition-all shrink-0"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{isAr ? 'الاستعلامات' : 'Queries'}</span>
                </button>
              </div>
            )}
          </div>







        </div>
      </div>
    </div>
  );
};

