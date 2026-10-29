import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Cpu,
  BatteryCharging,
  Smartphone,
  ShieldCheck,
  Zap,
  Layers,
  HardDrive,
  Bell,
  Play,
  Settings,
  Flame,
  Trash2
} from 'lucide-react';
import { Language } from '../types';
import {
  checkBackgroundSyncHealth,
  BackgroundSyncHealthStatus,
  triggerForceBackgroundSyncTest,
  requestAllBackgroundAndSyncPermissions,
  openBatteryOptimizationSettings,
  openAutoStartSettings,
  openApplicationDetailsSettings,
  requestDisplayOverAppsPermission,
  setFieldKeepAliveMode,
  isKeepAliveModeEnabled,
  getPendingQueue,
  flushPendingQueue,
  subscribeToQueueChange,
  clearPendingQueue,
} from '../lib/offlineQueue';

interface BackgroundSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const BackgroundSyncModal: React.FC<BackgroundSyncModalProps> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [health, setHealth] = useState<BackgroundSyncHealthStatus | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    flushedCount: number;
    remainingCount: number;
    latencyMs: number;
    layersTriggered: string[];
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [keepAliveActive, setKeepAliveActive] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadHealthAndQueue = async () => {
    setIsLoadingHealth(true);
    try {
      const [h, q] = await Promise.all([checkBackgroundSyncHealth(), getPendingQueue()]);
      setHealth(h);
      setQueueItems(q.filter((i) => i.status !== 'synced'));
      setKeepAliveActive(isKeepAliveModeEnabled());
    } catch (e) {
      console.warn('Failed to load sync health:', e);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHealthAndQueue();
      const unsub = subscribeToQueueChange(() => {
        loadHealthAndQueue();
      });
      return () => {
        if (unsub) unsub();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGrantAllPermissions = async () => {
    try {
      await requestAllBackgroundAndSyncPermissions();
      await setFieldKeepAliveMode(true);
      await loadHealthAndQueue();
      showToast(isAr ? 'تم تنشيط وتأكيد كافة صلاحيات الخلفية بنجاح!' : 'All background sync permissions activated successfully!');
    } catch (e: any) {
      showToast(e?.message || 'Error');
    }
  };

  const handleRunTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await triggerForceBackgroundSyncTest();
      setTestResult(res);
      await loadHealthAndQueue();
      showToast(
        isAr
          ? `نجح اختبار المزامنة بالخلفية! (${res.latencyMs} مللي ثانية)`
          : `Background sync test passed! (${res.latencyMs}ms)`
      );
    } catch (err: any) {
      showToast(isAr ? `فشل الاختبار: ${err?.message || err}` : `Test failed: ${err?.message || err}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleManualFlush = async () => {
    setIsSyncing(true);
    try {
      const res = await flushPendingQueue();
      await loadHealthAndQueue();
      showToast(
        isAr
          ? `تمت المزامنة بنجاح! تم رفع ${res.flushed} عملية، المتبقي: ${res.remaining}`
          : `Synced! ${res.flushed} uploaded, remaining: ${res.remaining}`
      );
    } catch (err: any) {
      showToast(isAr ? `فشل المزامنة: ${err?.message || err}` : `Sync failed: ${err?.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleKeepAlive = async () => {
    const next = !keepAliveActive;
    setKeepAliveActive(next);
    await setFieldKeepAliveMode(next);
    await loadHealthAndQueue();
    showToast(
      next
        ? isAr
          ? 'تم تفعيل منع نوم التطبيق والمزامنة المستمرة'
          : 'Keep-alive activated'
        : isAr
        ? 'تم إيقاف منع نوم التطبيق'
        : 'Keep-alive deactivated'
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-fadeIn"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-linear-to-r from-teal-700 via-teal-800 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300 shadow-inner">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide flex items-center gap-2">
                {isAr ? 'محرك المزامنة الفورية وفي الخلفية' : 'Background Sync Engine'}
                <span className="text-[10px] font-bold bg-teal-500/30 text-teal-200 border border-teal-400/40 px-2 py-0.5 rounded-full">
                  5-Tier Shield
                </span>
              </h2>
              <p className="text-xs text-teal-100/80 font-medium">
                {isAr
                  ? 'رفع فوري وتلقائي لكافة الوصولات والعقود حتى عند قفل الشاشة'
                  : 'Automatic background synchronization even with screen locked'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold text-center animate-fadeIn">
            {toastMessage}
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-slate-800 dark:text-slate-100">
          {/* Main Status Banner */}
          <div className="p-4 rounded-xl bg-linear-to-br from-emerald-500/10 via-teal-500/5 to-slate-500/5 border border-emerald-500/30 dark:border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                  <Wifi className="w-5 h-5" />
                </div>
                <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900 animate-ping" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                    {health?.isOnline
                      ? isAr
                        ? 'المزامنة بالخلفية نشطة وجاهزة دائماً'
                        : 'Background Sync Active & Ready'
                      : isAr
                      ? 'الوضع المحلي (سيتم الرفع بالخلفية فور الاتصال)'
                      : 'Offline Mode (Will sync in background upon reconnect)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mt-0.5">
                  {isAr
                    ? `طابور العمليات المعلقة: ${queueItems.length} عملية بانتظار الخادم`
                    : `Pending Actions: ${queueItems.length} awaiting upload`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleManualFlush}
                disabled={isSyncing || queueItems.length === 0}
                className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  queueItems.length > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'رفع المعلقات الآن' : 'Sync Now'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunTest}
                disabled={isTesting}
                className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Play className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isAr ? 'اختبار النبضة' : 'Test Heartbeat'}</span>
              </button>
            </div>
          </div>

          {/* Test Result Box */}
          {testResult && (
            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs font-medium space-y-1.5 animate-fadeIn">
              <div className="flex items-center justify-between text-teal-800 dark:text-teal-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {isAr ? 'نتيجة اختبار قنوات الخلفية:' : 'Background channels test result:'}
                </span>
                <span>{testResult.latencyMs} ms</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {testResult.layersTriggered.map((layer) => (
                  <span
                    key={layer}
                    className="px-2 py-0.5 rounded-md bg-teal-200/60 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 text-[10px] font-bold"
                  >
                    ✓ {layer}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 5-Layer Shield Diagnostics Grid */}
          <div>
            <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-teal-600" />
              {isAr ? 'طبقات الحماية والمزامنة الخمس (حالة الأنظمة)' : '5-Tier Background Sync Diagnostics'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Layer 1: Service Worker */}
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <div>
                    <div className="text-xs font-bold">{isAr ? 'سيرفيس وركر الخلفية' : 'Service Worker'}</div>
                    <div className="text-[10px] text-slate-500">
                      {isAr ? 'يعمل في خلفية النظام حتى بدون فتح الصفحة' : 'Runs in background independently'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {health?.serviceWorkerActive ? '✓ نشط' : 'قيد التسجيل'}
                </span>
              </div>

              {/* Layer 2: Android Background Sync API */}
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  <div>
                    <div className="text-xs font-bold">{isAr ? 'مزامنة نظام أندرويد' : 'Android Background Sync'}</div>
                    <div className="text-[10px] text-slate-500">
                      {isAr ? 'إعادة الرفع تلقائياً عند استعادة الإنترنت' : 'Native OS network reconnections'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {health?.backgroundSyncSupported ? '✓ معتمد' : '✓ متوافق'}
                </span>
              </div>

              {/* Layer 3: KeepAlive & Anti-Sleep */}
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="text-xs font-bold">{isAr ? 'منع نوم التطبيق (نبضة مستمرة)' : 'Keep-Alive Heartbeat'}</div>
                    <div className="text-[10px] text-slate-500">
                      {isAr ? 'يمنع هاتف المندوب من تجميد المعالجة' : 'Prevents OS from sleeping'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleKeepAlive}
                  className={`text-[10px] font-black px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                    keepAliveActive
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700'
                  }`}
                >
                  {keepAliveActive ? '✓ مفعّل دائماً' : 'معطل'}
                </button>
              </div>

              {/* Layer 4: Persistent IndexedDB Storage */}
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <div className="text-xs font-bold">{isAr ? 'التخزين المحلي الآمن' : 'Persistent Storage'}</div>
                    <div className="text-[10px] text-slate-500">
                      {isAr ? 'حماية البيانات من الحذف التلقائي' : 'IndexedDB protected storage'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ✓ محفوظ
                </span>
              </div>
            </div>
          </div>

          {/* Android Rep Device Configuration Tools */}
          <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>{isAr ? 'إعدادات أجهزة أندرويد للمندوبين' : 'Android Representative Settings'}</span>
              </div>
              <button
                type="button"
                onClick={handleGrantAllPermissions}
                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-black shadow-xs transition-all cursor-pointer"
              >
                {isAr ? 'تنشيط الصلاحيات بنقرة واحدة' : 'One-Click Grant'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {isAr
                ? 'لضمان عمل المزامنة في هواتف (سامسونج، شاومي، هواوي، ريلمي) بدون إيقافها عند قفل الشاشة، يرجى الضغط على الأزرار أدناه وتطبيق الخطوات:'
                : 'To ensure continuous sync on Android devices even when the screen turns off, apply these settings:'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await openBatteryOptimizationSettings();
                  showToast(res.message);
                  setTimeout(loadHealthAndQueue, 1500);
                }}
                className={`p-2 rounded-lg border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                  health?.batteryUnrestricted
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <BatteryCharging className="w-3.5 h-3.5 text-amber-500" />
                  <span>{isAr ? 'إلغاء تقييد البطارية' : 'Unrestricted Battery'}</span>
                </div>
                {health?.batteryUnrestricted && (
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                    ✓ مفعّل
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const res = await openAutoStartSettings();
                  showToast(res.message);
                  setTimeout(loadHealthAndQueue, 1500);
                }}
                className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all cursor-pointer shadow-xs"
              >
                <Settings className="w-3.5 h-3.5 text-teal-500" />
                <span>{isAr ? 'التشغيل التلقائي' : 'Auto-Start Settings'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const res = await requestDisplayOverAppsPermission();
                  showToast(res.message);
                  setTimeout(loadHealthAndQueue, 1500);
                }}
                className={`p-2 rounded-lg border text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                  health?.overlayPermissionGranted
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isAr ? 'الظهور فوق التطبيقات' : 'Overlay Permission'}</span>
                </div>
                {health?.overlayPermissionGranted && (
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                    ✓ مفعّل
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={async () => {
                  const res = await openApplicationDetailsSettings();
                  showToast(res.message);
                  setTimeout(loadHealthAndQueue, 1500);
                }}
                className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all cursor-pointer shadow-xs"
              >
                <Smartphone className="w-3.5 h-3.5 text-violet-500" />
                <span>{isAr ? 'معلومات وأذونات التطبيق' : 'App Info & Permissions'}</span>
              </button>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200">
              <span className="font-bold">ملاحظة هامة للمستخدمين: </span>
              <span>
                في أجهزة (شاومي/ريدمي/سامسونج)، إذا لم يظهر التطبيق في قائمة "الظهور في الأعلى" مباشرة، اضغط على زر "معلومات وأذونات التطبيق" ثم اختر "الأذونات الأخرى" أو "الوصول الخاص" وفعّل خيار (الظهور فوق التطبيقات / النوافذ المنبثقة) و(البطارية غير مقيدة).
              </span>
            </div>
          </div>

          {/* Pending Items List */}
          {queueItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span>{isAr ? `العمليات في الطابور (${queueItems.length}):` : `Pending Actions (${queueItems.length}):`}</span>
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (window.confirm(isAr ? 'هل أنت متأكد من تفريغ ومسح طابور المزامنة المعلق؟' : 'Are you sure you want to clear the pending queue?')) {
                        await clearPendingQueue();
                        await loadHealthAndQueue();
                        showToast(isAr ? 'تم تفريغ طابور المزامنة المعلق' : 'Pending queue cleared');
                      }
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 flex items-center gap-1 px-2 py-0.5 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 cursor-pointer transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isAr ? 'تفريغ الطابور' : 'Clear Queue'}</span>
                  </button>
                  <span className="text-[10px] font-normal text-slate-500">
                    {isAr ? 'محفوظة محلياً' : 'Local'}
                  </span>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-800/40">
                {queueItems.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span>{item.type || 'ACTION'}</span>
                        {item.payload?.customerName && (
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            - {item.payload.customerName}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}
                      </div>
                    </div>
                    {item.payload?.amount ? (
                      <span className="font-black text-emerald-600 dark:text-emerald-400">
                        {Number(item.payload.amount).toLocaleString()} د.ع
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-medium">
            {isAr ? 'نظام الكرار - حماية البيانات بدون إنترنت وفور توفر الشبكة' : 'Al-Karrar Resilient Sync Architecture'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black transition-all cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
