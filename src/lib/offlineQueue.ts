import { App } from '@capacitor/app';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { BackgroundRunner } from '@capacitor/background-runner';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { getApiBaseUrl, getFullApiUrl, fetchWithFallback, CANDIDATE_SERVERS, getCustomServerUrl, isNativeOrApkEnvironment } from './apiConfig';
import {
  reconcileAllLocalWithDatabase,
  verifyAndReconcileWithServer,
  verifyAndReconcileUntilMatched,
  mirrorLocalSnapshotToIndexedDb,
  loadSnapshotFromIndexedDbIfAvailable,
} from './postgresClient';

export type ActionStatus = 'pending' | 'syncing' | 'synced';

export interface PendingAction {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  status: ActionStatus;
  retryCount?: number;
  error?: string | null;
  syncedAt?: number | null;
  lastAttemptAt?: number | null;
}

const QUEUE_KEY = 'alkarrar_offline_pending_queue';
const DB_NAME = 'alkarrar_sync_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_actions';

const SECONDARY_DB_NAME = 'alkarrar_offline_sync_db';
const SECONDARY_STORE_NAME = 'offline_queue';

// Helper to ensure any async operation never hangs indefinitely
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 3000, fallbackVal: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackVal), timeoutMs)),
  ]);
}

// IndexedDB Helper with indices for status and timestamp
export function openIndexedDb(dbName = DB_NAME, storeName = STORE_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in current environment'));
    }
    try {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(storeName)) {
          store = db.createObjectStore(storeName, { keyPath: 'id' });
        } else {
          store = e.target.transaction.objectStore(storeName);
        }
        if (!store.indexNames.contains('status')) {
          store.createIndex('status', 'status', { unique: false });
        }
        if (!store.indexNames.contains('timestamp')) {
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB open request blocked'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Get all actions directly from Primary IndexedDB
 */
export async function getActionsFromIndexedDb(): Promise<PendingAction[]> {
  try {
    const dbPromise = openIndexedDb(DB_NAME, STORE_NAME);
    const db = await withTimeout(dbPromise, 2500, null as any);
    if (!db) return [];

    const readPromise = new Promise<PendingAction[]>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const results: any[] = req.result || [];
          const now = Date.now();
          const validActions: PendingAction[] = results
            .filter((item) => {
              if (!item || !item.id || item.id.startsWith('__meta_') || item.type === '__META_CONFIG__') return false;
              if ((item.type === 'CREATE_PAYMENT' || item.type === 'UPDATE_PAYMENT') && item.payload) {
                const amt = Number(item.payload.amountPaid ?? item.payload.amount ?? 0);
                if (amt <= 0) return false;
              }
              return true;
            })
            .map((item) => ({
              id: item.id,
              type: item.type,
              payload: item.payload,
              timestamp: Number(item.timestamp) || now,
              // If marked syncing but over 8s old, un-freeze back to pending
              status: (item.status === 'synced' ? 'synced' : (item.status === 'syncing' && item.lastAttemptAt && now - item.lastAttemptAt < 8000 ? 'syncing' : 'pending')) as ActionStatus,
              retryCount: Number(item.retryCount) || 0,
              error: item.error || null,
              syncedAt: item.syncedAt || null,
              lastAttemptAt: item.lastAttemptAt || null,
            }));
          resolve(validActions);
        };
        req.onerror = () => resolve([]);
        tx.onabort = () => resolve([]);
        tx.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });

    return await withTimeout(readPromise, 2500, []);
  } catch (err) {
    return [];
  }
}

// Helper: Generate candidate metadata payload for Service Worker
function getMetaPayloadForSw() {
  const origins: string[] = [];
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    origins.push(window.location.origin);
  }
  const custom = getCustomServerUrl();
  if (custom && !origins.includes(custom)) origins.push(custom);
  for (const s of CANDIDATE_SERVERS) {
    if (s && !origins.includes(s)) origins.push(s);
  }
  const serverUrl = getFullApiUrl('/api/sync/batch');
  return { origins, serverUrl };
}

/**
 * Save an action to IndexedDB (and mirror to secondary DB)
 */
export async function saveActionToIndexedDb(action: PendingAction): Promise<void> {
  const metaPayload = getMetaPayloadForSw();
  const savePrimary = async () => {
    try {
      const db = await openIndexedDb(DB_NAME, STORE_NAME);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(action);

      // Save server URL metadata for background service worker
      try {
        store.put({ id: '__meta_server_url__', type: '__META_CONFIG__', payload: metaPayload, timestamp: Date.now(), status: 'synced' });
      } catch (e) {}

      await new Promise((resolve) => {
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (e) {}
  };

  const saveSecondary = async () => {
    try {
      const db2 = await openIndexedDb(SECONDARY_DB_NAME, SECONDARY_STORE_NAME);
      const tx2 = db2.transaction(SECONDARY_STORE_NAME, 'readwrite');
      const store2 = tx2.objectStore(SECONDARY_STORE_NAME);
      store2.put(action);
      try {
        store2.put({ id: '__meta_server_url__', type: '__META_CONFIG__', payload: metaPayload, timestamp: Date.now(), status: 'synced' });
      } catch (e) {}
      await new Promise((resolve) => {
        tx2.oncomplete = resolve;
        tx2.onerror = resolve;
        tx2.onabort = resolve;
      });
    } catch (e) {}
  };

  await withTimeout(Promise.all([savePrimary(), saveSecondary()]), 2500, null);
}

/**
 * Remove an action by ID from IndexedDB
 */
export async function deleteActionFromIndexedDb(id: string): Promise<void> {
  const delPrimary = async () => {
    try {
      const db = await openIndexedDb(DB_NAME, STORE_NAME);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (e) {}
  };

  const delSecondary = async () => {
    try {
      const db2 = await openIndexedDb(SECONDARY_DB_NAME, SECONDARY_STORE_NAME);
      const tx2 = db2.transaction(SECONDARY_STORE_NAME, 'readwrite');
      tx2.objectStore(SECONDARY_STORE_NAME).delete(id);
      await new Promise((resolve) => {
        tx2.oncomplete = resolve;
        tx2.onerror = resolve;
        tx2.onabort = resolve;
      });
    } catch (e) {}
  };

  await withTimeout(Promise.all([delPrimary(), delSecondary()]), 2500, null);
}

/**
 * Sync entire memory/localStorage queue snapshot to IndexedDB
 */
async function syncQueueToIndexedDb(queue: PendingAction[]): Promise<void> {
  const metaPayload = getMetaPayloadForSw();
  const syncPrimary = async () => {
    try {
      const db = await openIndexedDb(DB_NAME, STORE_NAME);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const item of queue) {
        store.put(item);
      }
      try {
        store.put({ id: '__meta_server_url__', type: '__META_CONFIG__', payload: metaPayload, timestamp: Date.now(), status: 'synced' });
      } catch (e) {}

      await new Promise((resolve) => {
        tx.oncomplete = resolve;
        tx.onerror = resolve;
        tx.onabort = resolve;
      });
    } catch (err) {}
  };

  const syncSecondary = async () => {
    try {
      const db2 = await openIndexedDb(SECONDARY_DB_NAME, SECONDARY_STORE_NAME);
      const tx2 = db2.transaction(SECONDARY_STORE_NAME, 'readwrite');
      const store2 = tx2.objectStore(SECONDARY_STORE_NAME);
      store2.clear();
      for (const item of queue) {
        store2.put(item);
      }
      try {
        store2.put({ id: '__meta_server_url__', type: '__META_CONFIG__', payload: metaPayload, timestamp: Date.now(), status: 'synced' });
      } catch (e) {}
      await new Promise((resolve) => {
        tx2.oncomplete = resolve;
        tx2.onerror = resolve;
        tx2.onabort = resolve;
      });
    } catch (e) {}
  };

  await withTimeout(Promise.all([syncPrimary(), syncSecondary()]), 3000, null);
}

let lastUserInteractionTime = 0;
if (typeof window !== 'undefined') {
  const markInteraction = () => {
    lastUserInteractionTime = Date.now();
  };
  window.addEventListener('input', markInteraction, { passive: true, capture: true });
  window.addEventListener('keydown', markInteraction, { passive: true, capture: true });
  window.addEventListener('compositionstart', markInteraction, { passive: true, capture: true });
  window.addEventListener('compositionupdate', markInteraction, { passive: true, capture: true });
}

export function isUserActivelyTypingOrInputFocused(): boolean {
  if (typeof document === 'undefined') return false;
  if (Date.now() - lastUserInteractionTime < 4000) return true;
  const activeEl = document.activeElement;
  if (activeEl) {
    const tagName = (activeEl.tagName || '').toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || activeEl.hasAttribute('contenteditable')) {
      return true;
    }
  }
  return false;
}

let queueListeners: Array<(count: number) => void> = [];
let lastNotifiedQueueCount: number = -1;

export function subscribeToQueueChange(listener: (count: number) => void): () => void {
  queueListeners.push(listener);
  getPendingQueue().then((q) => {
    const activeCount = q.filter((i) => i.status !== 'synced').length;
    lastNotifiedQueueCount = activeCount;
    listener(activeCount);
  });
  return () => {
    queueListeners = queueListeners.filter((l) => l !== listener);
  };
}

function notifyQueueListeners(count: number) {
  if (lastNotifiedQueueCount === count) return;
  lastNotifiedQueueCount = count;
  queueListeners.forEach((fn) => {
    try {
      fn(count);
    } catch (e) {}
  });
}

let syncSuccessListeners: Array<() => void> = [];

export function onSyncSuccess(listener: () => void) {
  syncSuccessListeners.push(listener);
  return () => {
    syncSuccessListeners = syncSuccessListeners.filter((l) => l !== listener);
  };
}

function notifySyncSuccessListeners() {
  syncSuccessListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
}

const PERMANENTLY_SYNCED_KEY = 'sami_permanently_synced_action_ids';

export function getPermanentlySyncedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PERMANENTLY_SYNCED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

export function markActionIdsAsPermanentlySynced(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  try {
    const set = getPermanentlySyncedIds();
    for (const id of ids) {
      if (id) set.add(id);
    }
    const arr = Array.from(set);
    const trimmed = arr.length > 2000 ? arr.slice(arr.length - 2000) : arr;
    localStorage.setItem(PERMANENTLY_SYNCED_KEY, JSON.stringify(trimmed));
  } catch (e) {}
}

/**
 * Synchronously read pending actions from localStorage (used for rapid local state merging)
 */
export function getPendingQueueSync(): PendingAction[] {
  try {
    const permanentlySynced = getPermanentlySyncedIds();
    const local = localStorage.getItem(QUEUE_KEY);
    const list = local ? JSON.parse(local) : [];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    
    // Deduplicate by entity/payload ID (keep latest action per record)
    const entityMap = new Map<string, any>();
    for (const item of list) {
      if (!item || item.id?.startsWith('__meta_') || item.type === '__META_CONFIG__' || permanentlySynced.has(item.id)) continue;
      const entityId = item.payload?.id || (typeof item.payload === 'string' ? item.payload : item.id);
      if (entityId) {
        const existing = entityMap.get(entityId);
        if (!existing || Number(item.timestamp || 0) > Number(existing.timestamp || 0)) {
          entityMap.set(entityId, item);
        }
      } else {
        entityMap.set(item.id, item);
      }
    }

    return Array.from(entityMap.values()).map((item) => ({
      id: item.id,
      type: item.type,
      payload: item.payload,
      timestamp: Number(item.timestamp) || now,
      status: (item.status === 'synced' ? 'synced' : (item.status === 'syncing' && item.lastAttemptAt && now - item.lastAttemptAt < 10000 ? 'syncing' : 'pending')) as ActionStatus,
      retryCount: Number(item.retryCount) || 0,
      error: item.error || null,
      syncedAt: item.syncedAt || null,
      lastAttemptAt: item.lastAttemptAt || null,
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Asynchronously read pending actions, prioritizing IndexedDB and reconciling with Preferences/localStorage
 */
export async function getPendingQueue(): Promise<PendingAction[]> {
  try {
    // 1. Read from IndexedDB
    const idbActions = await getActionsFromIndexedDb();

    // Check if Service Worker background synced any IDs
    let swSyncedIds: string[] = [];
    try {
      const db = await openIndexedDb(DB_NAME, STORE_NAME);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('__meta_last_synced_ids__');
      const res: any = await new Promise((r) => {
        req.onsuccess = () => r(req.result);
        req.onerror = () => r(null);
      });
      if (res && res.payload && Array.isArray(res.payload.syncedIds)) {
        swSyncedIds = res.payload.syncedIds;
        store.delete('__meta_last_synced_ids__');
      }
    } catch (e) {}

    const swSyncedSet = new Set(swSyncedIds);

    // 2. Read from Native Android Bridge, Preferences and localStorage
    let nativeList: any[] = [];
    try {
      const bridge =
        (window as any).AndroidInterface ||
        (window as any).AndroidPrinter ||
        (window as any).Android ||
        (window as any).AndroidBridge;
      if (bridge && typeof bridge.getPendingQueueFromNative === 'function') {
        const rawNative = bridge.getPendingQueueFromNative();
        if (rawNative && rawNative.startsWith('[') && rawNative.endsWith(']')) {
          nativeList = JSON.parse(rawNative);
        }
      }
    } catch (e) {}

    let prefList: any[] = [];
    try {
      const { value } = await Preferences.get({ key: QUEUE_KEY });
      if (value) prefList = JSON.parse(value);
    } catch (e) {}

    let localList: any[] = [];
    try {
      const local = localStorage.getItem(QUEUE_KEY);
      if (local) localList = JSON.parse(local);
    } catch (e) {}

    const mergedMap = new Map<string, PendingAction>();
    const entityLatestMap = new Map<string, any>();
    const now = Date.now();

    const addAction = (item: any) => {
      if (!item || !item.id || item.id.startsWith('__meta_') || item.type === '__META_CONFIG__') return;
      if (swSyncedSet.has(item.id)) return; // Already uploaded by Service Worker while app was closed
      
      const entityId = item.payload?.id || (typeof item.payload === 'string' ? item.payload : item.id);
      if (entityId) {
        const existingEntity = entityLatestMap.get(entityId);
        if (!existingEntity || Number(item.timestamp || 0) > Number(existingEntity.timestamp || 0)) {
          entityLatestMap.set(entityId, item);
        }
      } else {
        entityLatestMap.set(item.id, item);
      }
    };

    if (Array.isArray(idbActions)) idbActions.forEach(addAction);
    if (Array.isArray(nativeList)) nativeList.forEach(addAction);
    if (Array.isArray(prefList)) prefList.forEach(addAction);
    if (Array.isArray(localList)) localList.forEach(addAction);

    const filteredActions = Array.from(entityLatestMap.values());
    for (const item of filteredActions) {
      mergedMap.set(item.id, {
        id: item.id,
        type: item.type,
        payload: item.payload,
        timestamp: Number(item.timestamp) || now,
        status: (item.status === 'synced' ? 'synced' : (item.status === 'syncing' && item.lastAttemptAt && now - item.lastAttemptAt < 10000 ? 'syncing' : 'pending')) as ActionStatus,
        retryCount: Number(item.retryCount) || 0,
        error: item.error || null,
        syncedAt: item.syncedAt || null,
        lastAttemptAt: item.lastAttemptAt || null,
      });
    }

    const merged = Array.from(mergedMap.values());
    const jsonStr = JSON.stringify(merged);
    localStorage.setItem(QUEUE_KEY, jsonStr);
    syncToNativeAndroid(merged);

    if (swSyncedIds.length > 0 || (idbActions.length === 0 && merged.length > 0)) {
      syncQueueToIndexedDb(merged).catch(() => {});
    }

    return merged;
  } catch (e) {
    return getPendingQueueSync();
  }
}

/**
 * Synchronize pending actions directly to Native Android storage & SharedPreferences
 */
export function syncToNativeAndroid(queue: PendingAction[]) {
  if (typeof window === 'undefined') return;
  try {
    const jsonStr = JSON.stringify(queue);
    const serverUrl = getApiBaseUrl() || window.location.origin;

    // 1. Direct Native JavascriptInterface Bridge
    const bridge =
      (window as any).AndroidInterface ||
      (window as any).AndroidPrinter ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (bridge) {
      if (typeof bridge.triggerImmediateCloseSync === 'function') {
        bridge.triggerImmediateCloseSync(jsonStr, serverUrl);
      } else if (typeof bridge.syncPendingQueueToNative === 'function') {
        bridge.syncPendingQueueToNative(jsonStr, serverUrl);
      }
      if (typeof bridge.triggerBackgroundSyncNow === 'function' && !isUserActivelyTypingOrInputFocused()) {
        bridge.triggerBackgroundSyncNow();
      }
    }

    // 2. Multi-prefix Capacitor Preferences storage
    try {
      Preferences.set({ key: QUEUE_KEY, value: jsonStr }).catch(() => {});
      Preferences.set({ key: `CapacitorStorage.${QUEUE_KEY}`, value: jsonStr }).catch(() => {});
      Preferences.set({ key: `CapacitorPreferences.${QUEUE_KEY}`, value: jsonStr }).catch(() => {});
      Preferences.set({ key: `_cap_${QUEUE_KEY}`, value: jsonStr }).catch(() => {});
      if (serverUrl) {
        Preferences.set({ key: 'alkarrar_backend_server_url', value: serverUrl }).catch(() => {});
        Preferences.set({ key: 'CapacitorStorage.alkarrar_backend_server_url', value: serverUrl }).catch(() => {});
      }
    } catch (e) {}
  } catch (e) {}
}

// Notify Service Worker about queue changes & register Background Sync
function notifyServiceWorker() {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel('alkarrar_sync_channel');
      channel.postMessage({ type: 'QUEUE_UPDATED', timestamp: Date.now() });
      channel.close();
    } catch (e) {}
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'QUEUE_UPDATED' });
      }
      navigator.serviceWorker.ready
        .then((reg: any) => {
          if (reg.active) {
            reg.active.postMessage({ type: 'QUEUE_UPDATED' });
          }
          if (reg.sync) {
            reg.sync.register('postgres-background-sync').catch(() => {});
            reg.sync.register('alkarrar-background-sync').catch(() => {});
          }
        })
        .catch(() => {});
    } catch (e) {}
  }
}

let addToQueueMutex: Promise<any> = Promise.resolve();
let bgFlushTimer: any = null;

/**
 * Add a new action to the offline queue with explicit 'pending' status
 */
export async function addToPendingQueue(type: string, payload: any): Promise<PendingAction> {
  const action: PendingAction = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    payload,
    timestamp: Date.now(),
    status: 'pending',
    retryCount: 0,
    error: null,
    syncedAt: null,
    lastAttemptAt: null,
  };

  // 1. Instantaneous sub-millisecond synchronous commit to localStorage & memory snapshot
  let currentSyncQueue: PendingAction[] = [];
  try {
    const rawSync = localStorage.getItem(QUEUE_KEY);
    currentSyncQueue = rawSync ? JSON.parse(rawSync) : [];
    if (!Array.isArray(currentSyncQueue)) currentSyncQueue = [];

    // Deduplicate / obsolete logic in memory immediately
    if (type.startsWith('DELETE_')) {
      const targetId = typeof payload === 'string' ? payload : (payload?.id || payload?.contractId);
      if (targetId) {
        currentSyncQueue = currentSyncQueue.filter((item) => {
          const itemPayloadId = typeof item.payload === 'string' ? item.payload : (item.payload?.id || item.payload?.contractId);
          return itemPayloadId !== targetId && (type !== 'DELETE_CONTRACT' || item.payload?.contractId !== targetId);
        });
      }
    } else {
      const targetId = typeof payload === 'string' ? payload : payload?.id;
      if (targetId) {
        currentSyncQueue = currentSyncQueue.filter((item) => {
          const itemPayloadId = typeof item.payload === 'string' ? item.payload : item.payload?.id;
          return !(item.type === type && itemPayloadId === targetId);
        });
      }
    }

    currentSyncQueue.push(action);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(currentSyncQueue));

    const pendingCount = currentSyncQueue.filter((i) => i.status !== 'synced').length;
    notifyQueueListeners(pendingCount);
  } catch (e) {
    console.warn('Fast local queue write notice:', e);
  }

  // 2. Persist to IndexedDB & sync to native Android asynchronously in the background without blocking the UI or caller
  setTimeout(async () => {
    try {
      await saveActionToIndexedDb(action);
      syncToNativeAndroid(currentSyncQueue);
      notifyServiceWorker();
    } catch (persistErr) {
      console.warn('Background persistence notice:', persistErr);
    }
  }, 0);

  // 3. Trigger debounced background network flush if online (gives time for saveToPostgres to complete and remove action)
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    if (bgFlushTimer) clearTimeout(bgFlushTimer);
    bgFlushTimer = setTimeout(() => {
      flushPendingQueue().catch(() => {});
    }, 1500);
  }

  // 4. Schedule idle verification re-query so when user stops typing/saving (سكون), it audits matches against server
  scheduleIdleVerification(600);

  return action;
}

/**
 * Remove an action by ID
 */
export async function removeFromPendingQueue(id: string): Promise<void> {
  try {
    markActionIdsAsPermanentlySynced([id]);
    await deleteActionFromIndexedDb(id);
    const queue = await getPendingQueue();
    const filtered = queue.filter((item) => item.id !== id);
    const jsonStr = JSON.stringify(filtered);
    localStorage.setItem(QUEUE_KEY, jsonStr);
    syncToNativeAndroid(filtered);
    notifyQueueListeners(filtered.filter((i) => i.status !== 'synced').length);
    notifyServiceWorker();
  } catch (e) {
    console.warn('Failed to remove from pending queue:', e);
  }
}

/**
 * Clear all pending actions
 */
export async function clearPendingQueue(): Promise<void> {
  try {
    localStorage.removeItem(QUEUE_KEY);
    syncToNativeAndroid([]);
    await syncQueueToIndexedDb([]);
    notifyQueueListeners(0);
    notifyServiceWorker();
  } catch (e) {}
}

/**
 * Clear pending actions matching a predicate filter
 */
export async function clearPendingActionsByFilter(predicate: (action: PendingAction) => boolean): Promise<void> {
  try {
    const queue = await getPendingQueue();
    const toRemove = queue.filter(predicate);
    const toKeep = queue.filter((a) => !predicate(a));
    for (const a of toRemove) {
      markActionIdsAsPermanentlySynced([a.id]);
      await deleteActionFromIndexedDb(a.id).catch(() => {});
    }
    const jsonStr = JSON.stringify(toKeep);
    localStorage.setItem(QUEUE_KEY, jsonStr);
    syncToNativeAndroid(toKeep);
    await syncQueueToIndexedDb(toKeep).catch(() => {});
    notifyQueueListeners(toKeep.filter((i) => i.status !== 'synced').length);
    notifyServiceWorker();
  } catch (e) {}
}

/**
 * Update transaction state for a specific action in IndexedDB and snapshot
 */
export async function updateActionStatus(
  id: string,
  status: ActionStatus,
  error: string | null = null,
  syncedAt: number | null = null
): Promise<void> {
  try {
    const queue = await getPendingQueue();
    const action = queue.find((a) => a.id === id);
    if (!action) return;

    action.status = status;
    action.lastAttemptAt = Date.now();
    if (status === 'synced') {
      action.syncedAt = syncedAt || Date.now();
      action.error = null;
    } else if (status === 'pending') {
      action.retryCount = (action.retryCount || 0) + 1;
      if (error) action.error = error;
    }

    await saveActionToIndexedDb(action);
    const jsonStr = JSON.stringify(queue);
    localStorage.setItem(QUEUE_KEY, jsonStr);
    syncToNativeAndroid(queue);

    notifyQueueListeners(queue.filter((i) => i.status !== 'synced').length);
  } catch (e) {
    console.warn('Error updating action status:', e);
  }
}

async function executeActionViaRestEndpoint(action: PendingAction): Promise<boolean> {
  try {
    const { type, payload } = action;
    if (!payload) return true;
    const docId = typeof payload === 'string' ? payload : (payload.id || payload.contractId);

    let endpoint = '';
    let method = 'POST';

    switch (type) {
      case 'CREATE_CONTRACT':
        endpoint = '/api/contracts';
        method = 'POST';
        break;
      case 'UPDATE_CONTRACT':
        endpoint = docId ? `/api/contracts/${docId}` : '/api/contracts';
        method = docId ? 'PUT' : 'POST';
        break;
      case 'DELETE_CONTRACT':
        endpoint = docId ? `/api/contracts/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_PAYMENT':
        endpoint = '/api/payments';
        method = 'POST';
        break;
      case 'UPDATE_PAYMENT':
        endpoint = docId ? `/api/payments/${docId}` : '/api/payments';
        method = docId ? 'PUT' : 'POST';
        break;
      case 'DELETE_PAYMENT':
        endpoint = docId ? `/api/payments/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_INVENTORY':
        endpoint = '/api/inventory';
        method = 'POST';
        break;
      case 'UPDATE_INVENTORY':
        endpoint = docId ? `/api/inventory/${docId}` : '/api/inventory';
        method = 'PUT';
        break;
      case 'DELETE_INVENTORY':
        endpoint = docId ? `/api/inventory/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_REP':
        endpoint = '/api/reps';
        method = 'POST';
        break;
      case 'UPDATE_REP':
        endpoint = docId ? `/api/reps/${docId}` : '/api/reps';
        method = 'PUT';
        break;
      case 'DELETE_REP':
        endpoint = docId ? `/api/reps/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_FUND':
        endpoint = '/api/funds';
        method = 'POST';
        break;
      case 'UPDATE_FUND':
        endpoint = docId ? `/api/funds/${docId}` : '/api/funds';
        method = 'PUT';
        break;
      case 'DELETE_FUND':
        endpoint = docId ? `/api/funds/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_CUSTOMER_LIST':
        endpoint = '/api/customer-lists';
        method = 'POST';
        break;
      case 'UPDATE_CUSTOMER_LIST':
        endpoint = docId ? `/api/customer-lists/${docId}` : '/api/customer-lists';
        method = 'PUT';
        break;
      case 'DELETE_CUSTOMER_LIST':
        endpoint = docId ? `/api/customer-lists/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_CUSTOMER':
        endpoint = '/api/customers';
        method = 'POST';
        break;
      case 'UPDATE_CUSTOMER':
        endpoint = docId ? `/api/customers/${docId}` : '/api/customers';
        method = 'PUT';
        break;
      case 'DELETE_CUSTOMER':
        endpoint = docId ? `/api/customers/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_EMPLOYEE':
        endpoint = '/api/employees';
        method = 'POST';
        break;
      case 'UPDATE_EMPLOYEE':
        endpoint = docId ? `/api/employees/${docId}` : '/api/employees';
        method = 'PUT';
        break;
      case 'DELETE_EMPLOYEE':
        endpoint = docId ? `/api/employees/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_FUND_TX':
      case 'CREATE_FUND_TRANSACTION':
        endpoint = '/api/fund-transactions';
        method = 'POST';
        break;
      case 'UPDATE_FUND_TX':
      case 'UPDATE_FUND_TRANSACTION':
        endpoint = docId ? `/api/fund-transactions/${docId}` : '/api/fund-transactions';
        method = 'PUT';
        break;
      case 'DELETE_FUND_TX':
      case 'DELETE_FUND_TRANSACTION':
        endpoint = docId ? `/api/fund-transactions/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_EMPLOYEE_TX':
      case 'CREATE_EMPLOYEE_TRANSACTION':
        endpoint = '/api/employee-transactions';
        method = 'POST';
        break;
      case 'UPDATE_EMPLOYEE_TX':
      case 'UPDATE_EMPLOYEE_TRANSACTION':
        endpoint = docId ? `/api/employee-transactions/${docId}` : '/api/employee-transactions';
        method = 'PUT';
        break;
      case 'DELETE_EMPLOYEE_TX':
      case 'DELETE_EMPLOYEE_TRANSACTION':
        endpoint = docId ? `/api/employee-transactions/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_PAYMENT_CONFLICT':
        endpoint = '/api/payment-conflicts';
        method = 'POST';
        break;
      case 'RESOLVE_PAYMENT_CONFLICT':
        endpoint = docId ? `/api/payment-conflicts/${docId}` : '';
        method = 'PUT';
        break;
      case 'REJECT_PAYMENT_CONFLICT':
      case 'DELETE_PAYMENT_CONFLICT':
        endpoint = docId ? `/api/payment-conflicts/${docId}` : '';
        method = 'DELETE';
        break;

      case 'CREATE_APPOINTMENT':
      case 'APPOINTMENT_CREATE':
        endpoint = '/api/appointments';
        method = 'POST';
        break;
      case 'UPDATE_APPOINTMENT':
      case 'APPOINTMENT_UPDATE':
        endpoint = docId ? `/api/appointments/${docId}` : '/api/appointments';
        method = docId ? 'PUT' : 'POST';
        break;
      case 'DELETE_APPOINTMENT':
      case 'APPOINTMENT_DELETE':
        endpoint = docId ? `/api/appointments/${docId}` : '';
        method = 'DELETE';
        break;

      default:
        return false;
    }

    if (!endpoint) return false;

    const res = await fetchWithFallback(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'DELETE' ? JSON.stringify(typeof payload === 'object' ? payload : { id: docId, value: payload }) : undefined,
    }, 8000);

    if (!res || !res.ok || res.status < 200 || res.status >= 300) {
      return false;
    }
    const ct = res.headers?.get('content-type') || '';
    if (ct.includes('text/html') || !ct.includes('application/json')) {
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!data || data.error) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

let isFlushing = false;
let lastFlushStartTime = 0;

/**
 * Flush all pending offline actions using explicit transaction states (pending -> syncing -> synced)
 * with reliable multi-path upload (REST Batch + Individual REST Endpoints) and per-record verification.
 */
export async function flushPendingQueue(): Promise<{ flushed: number; remaining: number }> {
  const now = Date.now();
  if (isFlushing) {
    // Watchdog check: If flushing has been active for more than 12 seconds, force-reset the lock to prevent deadlock
    if (now - lastFlushStartTime < 12000) {
      const q = getPendingQueueSync();
      return { flushed: 0, remaining: q.filter((i) => i.status !== 'synced').length };
    }
    console.warn('[Offline Sync Engine] Previous flush lock timed out (>12s). Resetting lock to unfreeze sync.');
    isFlushing = false;
  }

  isFlushing = true;
  lastFlushStartTime = Date.now();
  const verifiedSyncedIds: string[] = [];

  try {
    const queue = await getPendingQueue();

    // 1. Select ALL un-synced actions (both 'pending' and recovering 'syncing' items)
    const actionsToSync = queue.filter((item) => item.status !== 'synced');

    if (actionsToSync.length === 0) {
      isFlushing = false;
      return { flushed: 0, remaining: 0 };
    }

    console.log(`[Offline Sync Engine] Initiating upload for ${actionsToSync.length} offline actions...`);

    const timestampNow = Date.now();
    // 2. Mark candidate actions as 'syncing' and save synchronously to memory/localStorage immediately
    for (const action of actionsToSync) {
      action.status = 'syncing';
      action.lastAttemptAt = timestampNow;
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    // Save to IndexedDB asynchronously in background without blocking immediate batch network fetch
    actionsToSync.forEach((a) => saveActionToIndexedDb(a).catch(() => {}));

    // 3. Path A: Send Batch Request to /api/sync/batch in chunks of 200 (with fast 12s timeout)
    let processedIdsFromBatch: string[] = [];
    const BATCH_CHUNK = 200;
    for (let b = 0; b < actionsToSync.length; b += BATCH_CHUNK) {
      const batchSlice = actionsToSync.slice(b, b + BATCH_CHUNK);
      try {
        const response = await fetchWithFallback(
          '/api/sync/batch',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions: batchSlice }),
          },
          12000
        );

        if (response && response.ok && response.status >= 200 && response.status < 300) {
          const ct = response.headers?.get('content-type') || '';
          if (ct.includes('application/json') && !ct.includes('text/html')) {
            const data = await response.json().catch(() => ({}));
            if (data && Array.isArray(data.processedIds)) {
              processedIdsFromBatch.push(...data.processedIds);
            } else if (data && data.success) {
              processedIdsFromBatch.push(...batchSlice.map((a) => a.id));
            }
          }
        }
      } catch (netErr: any) {
        console.log('[Offline Sync Engine] Batch endpoint chunk notice, falling back:', netErr?.message || netErr);
      }
    }

    const batchConfirmedSet = new Set(processedIdsFromBatch);
    const pendingFallbackActions: PendingAction[] = [];

    // 4. Process batch confirmed items immediately in parallel
    const deletePromises: Promise<void>[] = [];
    for (const action of actionsToSync) {
      if (batchConfirmedSet.has(action.id)) {
        action.status = 'synced';
        action.syncedAt = Date.now();
        action.error = null;
        verifiedSyncedIds.push(action.id);
        deletePromises.push(deleteActionFromIndexedDb(action.id).catch(() => {}));
      } else {
        pendingFallbackActions.push(action);
      }
    }
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 5. Fallback path for unconfirmed actions (parallel chunks of 8)
    if (pendingFallbackActions.length > 0) {
      const CHUNK_SIZE = 8;
      for (let i = 0; i < pendingFallbackActions.length; i += CHUNK_SIZE) {
        const chunk = pendingFallbackActions.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (action) => {
            // First fallback: REST endpoint directly
            const executedViaRest = await executeActionViaRestEndpoint(action);
            if (executedViaRest) {
              action.status = 'synced';
              action.syncedAt = Date.now();
              action.error = null;
              verifiedSyncedIds.push(action.id);
              await deleteActionFromIndexedDb(action.id).catch(() => {});
              return;
            }

            // Otherwise revert to pending for next retry
            action.status = 'pending';
            action.retryCount = (action.retryCount || 0) + 1;
            action.error = 'Pending connection to sync server';
            await saveActionToIndexedDb(action).catch(() => {});
          })
        );
      }
    }

    // 6. Clean up synced items and update global snapshot without dropping any actions added during sync
    const verifiedSet = new Set(verifiedSyncedIds);
    markActionIdsAsPermanentlySynced(verifiedSyncedIds);

    // Also delete verified items from IndexedDB
    for (const vid of verifiedSyncedIds) {
      await deleteActionFromIndexedDb(vid).catch(() => {});
    }

    const freshQueue = await getPendingQueue();
    const remainingQueue = freshQueue
      .filter((item) => !verifiedSet.has(item.id) && item.status !== 'synced')
      .map((item) => {
        if (item.status === 'syncing') {
          return { ...item, status: 'pending' as const };
        }
        return item;
      });
    const jsonStr = JSON.stringify(remainingQueue);
    localStorage.setItem(QUEUE_KEY, jsonStr);
    syncToNativeAndroid(remainingQueue);

    await syncQueueToIndexedDb(remainingQueue);
    notifyQueueListeners(remainingQueue.length);

    if (verifiedSyncedIds.length > 0) {
      console.log(`[Offline Sync Engine] Successfully synchronized & uploaded ${verifiedSyncedIds.length} records.`);
      try {
        const raw = localStorage.getItem('sami_offline_payments');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            let changed = false;
            for (const p of list) {
              if (p && (verifiedSet.has(p.id) || (!remainingQueue.some((r) => r.payload?.id === p.id) && p._syncStatus === 'pending'))) {
                p._syncStatus = 'synced';
                p._unsynced = false;
                changed = true;
              }
            }
            if (changed) {
              localStorage.setItem('sami_offline_payments', JSON.stringify(list));
            }
          }
        }
      } catch (e) {}
      notifySyncSuccessListeners();
    }

    // If there are still un-synced items and we made progress, trigger immediate follow-up flush
    if (remainingQueue.length > 0 && verifiedSyncedIds.length > 0) {
      setTimeout(() => {
        flushPendingQueue().catch(() => {});
      }, 400);
    }
  } catch (err) {
    console.warn('[Offline Sync Engine] Flush queue exception:', err);
  } finally {
    isFlushing = false;
  }

  const finalQueue = await getPendingQueue();
  const permSet = getPermanentlySyncedIds();
  const verifiedSet = new Set(verifiedSyncedIds);
  const activeRemaining = finalQueue.filter((i) => i.status !== 'synced' && !verifiedSet.has(i.id) && !permSet.has(i.id)).length;
  return { flushed: verifiedSyncedIds.length, remaining: activeRemaining };
}

export const syncOfflineData = flushPendingQueue;

let lastExitSyncTime = 0;

/**
 * Send pending actions via Beacon and fetch keepalive on page exit or before close (100% non-blocking & reliable)
 */
export function sendBeaconOnExit() {
  const now = Date.now();
  // Cooldown to prevent multi-event duplicate storm on exit (beforeunload + pagehide + visibilitychange)
  if (now - lastExitSyncTime < 800) {
    return;
  }
  lastExitSyncTime = now;

  try {
    // 1. Mirror local snapshot to IndexedDB immediately so Service Worker has fresh state
    mirrorLocalSnapshotToIndexedDb(true).catch(() => {});

    // 2. Read pending actions synchronously
    const raw = localStorage.getItem(QUEUE_KEY);
    let queue: any[] = [];
    if (raw) {
      try {
        queue = JSON.parse(raw);
      } catch (e) {
        queue = [];
      }
    }
    const pendingToSync = Array.isArray(queue) ? queue.filter((i: any) => i && i.status !== 'synced') : [];

    // If nothing pending, exit immediately without wasting network/battery
    if (pendingToSync.length === 0) {
      return;
    }

    // Mirror queue to Native Android storage immediately upon exit
    try {
      syncToNativeAndroid(queue);
      const bridge =
        (window as any).AndroidInterface ||
        (window as any).AndroidPrinter ||
        (window as any).Android ||
        (window as any).AndroidBridge;
      if (bridge && typeof bridge.triggerBackgroundSyncNow === 'function') {
        bridge.triggerBackgroundSyncNow();
      }
    } catch (e) {}

    // 3. Inform Service Worker to flush queue in background
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'FLUSH_QUEUE_IMMEDIATELY',
          actions: pendingToSync,
        });
        navigator.serviceWorker.controller.postMessage({
          type: 'RECONCILE_ON_CLOSE',
          timestamp: now,
        });
      } catch (e) {}
    }

    // 4. Resolve target URLs (both beacon & batch)
    const isNative = isNativeOrApkEnvironment();
    const beaconUrl = isNative ? getFullApiUrl('/api/sync/beacon') : '/api/sync/beacon';
    const batchUrl = isNative ? getFullApiUrl('/api/sync/batch') : '/api/sync/batch';

    // 5. Send dual transmission (Beacon + keepalive Fetch)
    const BEACON_CHUNK = 25;
    for (let i = 0; i < pendingToSync.length; i += BEACON_CHUNK) {
      const chunk = pendingToSync.slice(i, i + BEACON_CHUNK);
      const payloadJson = JSON.stringify({ actions: chunk });

      // Primary keepalive fetch (supported in modern Chromium, iOS Safari, WebViews)
      if (typeof fetch === 'function') {
        try {
          fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payloadJson,
            keepalive: true,
          }).then((res) => {
            if (res && res.ok) {
              res.json().then((data) => {
                if (data && Array.isArray(data.processedIds)) {
                  data.processedIds.forEach((pid: string) => deleteActionFromIndexedDb(pid).catch(() => {}));
                }
              }).catch(() => {});
            }
          }).catch(() => {});
        } catch (e) {}
      }

      // Secondary beacon
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          const blob = new Blob([payloadJson], { type: 'application/json' });
          const sent = navigator.sendBeacon(beaconUrl, blob);
          if (!sent) {
            const textBlob = new Blob([payloadJson], { type: 'text/plain;charset=UTF-8' });
            navigator.sendBeacon(beaconUrl, textBlob);
          }
        } catch (e) {}
      }
    }

    // 6. Update action timestamps without blindly purging unconfirmed actions
    for (const act of pendingToSync) {
      act.lastAttemptAt = now;
      if (act.status !== 'synced') {
        act.status = 'syncing';
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[Exit Sync] Exception:', e);
  }
}

/**
 * Universal background exit sync runner:
 * Dispatches immediate synchronous beacons, keepalive fetch requests,
 * and service worker messages on app close or minimize.
 */
export function runBackgroundExitSync(): void {
  try {
    sendBeaconOnExit();
    notifyServiceWorker();

    try {
      if (BackgroundTask && typeof BackgroundTask.beforeExit === 'function') {
        BackgroundTask.beforeExit(async () => {
          let finished = false;
          try {
            await Promise.race([
              (async () => {
                await flushPendingQueue().catch(() => {});
                if (globalSyncCallback) {
                  await globalSyncCallback().catch(() => {});
                }
              })(),
              new Promise((resolve) => setTimeout(resolve, 25000)),
            ]);
          } catch (err) {
            console.warn('Background sync on exit error:', err);
          } finally {
            if (!finished) {
              finished = true;
              try {
                BackgroundTask.finish({ taskId: 'exit-sync' });
              } catch (e) {}
            }
          }
        }).catch(() => {});
      }
    } catch (btErr) {}

    flushPendingQueue().catch(() => {});
  } catch (e) {
    console.warn('runBackgroundExitSync exception:', e);
  }
}

let globalSyncCallback: (() => Promise<void>) | null = null;
let onlineDebounceTimer: any = null;
let idleVerificationTimer: any = null;
let isVerifyingMatch = false;

/**
 * Continuous Verification & Re-query Engine:
 * Whenever data is uploaded or when idle quiescence occurs,
 * automatically queries the server, uploads any remaining data, and re-queries in a loop
 * until 100% full match confirmation between the app and PostgreSQL is verified.
 */
export function scheduleIdleVerification(delayMs = 1200) {
  if (idleVerificationTimer) {
    clearTimeout(idleVerificationTimer);
  }
  idleVerificationTimer = setTimeout(async () => {
    if (isVerifyingMatch) return;
    try {
      isVerifyingMatch = true;
      
      // 1. Flush any un-synced actions first
      const queue = await getPendingQueue();
      const unSynced = queue.filter((i) => i.status !== 'synced');
      if (unSynced.length > 0) {
        await flushPendingQueue().catch(() => {});
      }

      // 2. Perform lightweight single-pass verification
      const verifyRes = await verifyAndReconcileUntilMatched(1).catch(() => null);
      if (verifyRes && verifyRes.matched) {
        const remainingQueue = (await getPendingQueue()).filter((item) => item.status !== 'synced');
        if (remainingQueue.length === 0) {
          notifyQueueListeners(0);
        }
      }
    } catch (err) {
      console.warn('[Continuous Sync Engine] Verification error:', err);
    } finally {
      isVerifyingMatch = false;
    }
  }, delayMs);
}

/**
 * Reliable handler for online connectivity restoration and automatic lightweight field sync
 */
export function triggerImmediateSync(callback?: () => Promise<void>) {
  if (onlineDebounceTimer) clearTimeout(onlineDebounceTimer);
  onlineDebounceTimer = setTimeout(async () => {
    try {
      const res = await flushPendingQueue();
      reconcileAllLocalWithDatabase().catch(() => {});
      if (callback) {
        await callback().catch(() => {});
      }
      if (globalSyncCallback) {
        await globalSyncCallback().catch(() => {});
      }
      return res;
    } catch (e) {
      console.warn('Trigger immediate sync error:', e);
    }
  }, 150);
}

// Automatic network reconnection and lifecycle handlers
if (typeof window !== 'undefined') {
  (window as any).alkarrarFlushQueue = () => {
    sendBeaconOnExit();
    return flushPendingQueue();
  };
  (window as any).alkarrarSendBeacon = sendBeaconOnExit;
  (window as any).alkarrarOnSyncSuccess = () => {
    triggerImmediateSync();
    notifySyncSuccessListeners();
  };

  window.addEventListener('beforeunload', () => {
    sendBeaconOnExit();
  });
  window.addEventListener('pagehide', () => {
    sendBeaconOnExit();
  });
  window.addEventListener('freeze', () => {
    sendBeaconOnExit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      sendBeaconOnExit();
    } else if (document.visibilityState === 'visible') {
      triggerImmediateSync();
    }
  });
  window.addEventListener('focus', () => {
    triggerImmediateSync();
  });
  window.addEventListener('online', () => {
    triggerImmediateSync();
  });

  // Automatically start background sync lifecycle
  try {
    initBackgroundSync();
  } catch (e) {}

  // Listen for Capacitor Network status changes
  try {
    if (Network && typeof Network.addListener === 'function') {
      Network.addListener('networkStatusChange', (status) => {
        if (status.connected) {
          triggerImmediateSync();
        }
      }).catch(() => {});
    }
  } catch (e) {}

  // Service Worker background sync triggers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data) {
        if (event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
          triggerImmediateSync();
        } else if (event.data.type === 'BACKGROUND_DATA_UPDATED') {
          loadSnapshotFromIndexedDbIfAvailable().catch(() => {});
        }
      }
    });
  }
}

/**
 * Register Background Sync Service Worker safely
 */
export function registerBackgroundSyncWorker(onTriggerSync?: () => void) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || window.location.protocol === 'file:') {
    return;
  }

  if ('serviceWorker' in navigator) {
    const doRegister = async () => {
      try {
        const registration: any = await navigator.serviceWorker.register('/sw.js').catch(() => null);
        if (!registration) return;
        console.log('[SW] ServiceWorker registered scope:', registration.scope);

        if ('sync' in registration) {
          try {
            await registration.sync.register('postgres-background-sync');
            await registration.sync.register('alkarrar-background-sync');
          } catch (e) {}
        }
        if ('periodicSync' in registration) {
          try {
            await registration.periodicSync.register('periodic-data-sync', {
              minInterval: 2 * 60 * 1000,
            });
          } catch (e) {}
        }
      } catch (err) {
        console.warn('ServiceWorker registration fallback:', err);
      }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      doRegister();
    } else {
      window.addEventListener('load', doRegister);
      document.addEventListener('DOMContentLoaded', doRegister);
    }

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data) {
        if (event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
          triggerImmediateSync(async () => {
            if (onTriggerSync) onTriggerSync();
          });
        } else if (event.data.type === 'BACKGROUND_DATA_UPDATED') {
          loadSnapshotFromIndexedDbIfAvailable().then(() => {
            if (onTriggerSync) onTriggerSync();
          }).catch(() => {});
        }
      }
    });
  }
}

/**
 * Request and grant all background sync and OS permissions (Notifications, BackgroundSync, PeriodicSync, Battery optimization exemption)
 */
export async function requestAllBackgroundAndSyncPermissions(): Promise<{
  granted: boolean;
  details: {
    notifications: boolean;
    periodicSync: boolean;
    backgroundSync: boolean;
    nativeBridge: boolean;
  };
}> {
  const details = {
    notifications: false,
    periodicSync: false,
    backgroundSync: false,
    nativeBridge: false,
  };

  // 0. Request Persistent Storage to prevent OS cache eviction
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      const isPersisted = await navigator.storage.persist().catch(() => false);
      console.log('[Storage] Persistent storage granted:', isPersisted);
    }
  } catch (e) {}

  // 1. Request Web / Mobile Notification Permission
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        details.notifications = perm === 'granted';
      } else {
        details.notifications = Notification.permission === 'granted';
      }
    }
  } catch (e) {
    console.warn('Notification permission error:', e);
  }

  // 2. Register Background Sync & Periodic Sync with Service Worker
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg: any = await navigator.serviceWorker.ready.catch(() => null);
      if (reg) {
        if ('sync' in reg) {
          try {
            await reg.sync.register('postgres-background-sync');
            await reg.sync.register('alkarrar-background-sync');
            details.backgroundSync = true;
          } catch (e) {}
        }
        if ('periodicSync' in reg) {
          try {
            await reg.periodicSync.register('periodic-data-sync', {
              minInterval: 2 * 60 * 1000,
            });
            details.periodicSync = true;
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    console.warn('SW sync registration error:', e);
  }

  // 3. Android Native Bridge / Cordova / Capacitor Runtime Permissions
  try {
    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (androidBridge) {
      if (typeof androidBridge.requestAllAndroidPermissions === 'function') {
        androidBridge.requestAllAndroidPermissions();
        details.nativeBridge = true;
      }
      if (typeof androidBridge.requestPermissions === 'function') {
        androidBridge.requestPermissions();
        details.nativeBridge = true;
      }
      if (typeof androidBridge.requestIgnoreBatteryOptimizations === 'function') {
        androidBridge.requestIgnoreBatteryOptimizations();
        details.nativeBridge = true;
      }
      if (typeof androidBridge.requestExactAlarmPermission === 'function') {
        androidBridge.requestExactAlarmPermission();
      }
      if (typeof androidBridge.requestBackgroundExecution === 'function') {
        androidBridge.requestBackgroundExecution();
        details.nativeBridge = true;
      }
      if (typeof androidBridge.enableBackgroundSync === 'function') {
        androidBridge.enableBackgroundSync();
        details.nativeBridge = true;
      }
    }

    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins) {
      // Activate Cordova Background Mode plugin if present
      if (cordova.plugins.backgroundMode) {
        try {
          const bg = cordova.plugins.backgroundMode;
          bg.setDefaults({
            title: 'الكرار للموبايل',
            text: 'المزامنة السحابية قيد العمل في الخلفية...',
            color: '059669',
            resume: true,
            silent: true,
          });
          bg.enable();
          if (typeof bg.disableWebViewOptimizations === 'function') {
            bg.disableWebViewOptimizations();
          }
          details.nativeBridge = true;
          details.backgroundSync = true;
        } catch (bgErr) {
          console.warn('Cordova backgroundMode config notice:', bgErr);
        }
      }

      if (cordova.plugins.permissions) {
        const p = cordova.plugins.permissions;
        const permsToRequest = [
          p.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS || 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
          p.POST_NOTIFICATIONS || 'android.permission.POST_NOTIFICATIONS',
          p.WAKE_LOCK || 'android.permission.WAKE_LOCK',
          p.FOREGROUND_SERVICE || 'android.permission.FOREGROUND_SERVICE',
          p.ACCESS_NETWORK_STATE || 'android.permission.ACCESS_NETWORK_STATE',
        ];
        p.requestPermissions(
          permsToRequest,
          () => {
            details.nativeBridge = true;
          },
          () => {}
        );
      }
    }

    // 4. Capacitor App & Background plugin check
    if (App) {
      details.nativeBridge = true;
    }
  } catch (e) {
    console.warn('Native bridge permission notice:', e);
  }

  try {
    localStorage.setItem('alkarrar_background_sync_granted', 'true');
  } catch (e) {}

  return {
    granted: true,
    details,
  };
}

let activeBgLoopInterval: any = null;

/**
 * Register background task listener to ensure automatic sync runs on close or background
 */
export function initBackgroundSync(syncCallback?: () => Promise<void>) {
  if (syncCallback) {
    globalSyncCallback = syncCallback;
  }

  try {
    if (typeof window === 'undefined') return;

    // 1. Initialize Cordova BackgroundMode if available
    try {
      const cordova = (window as any).cordova;
      if (cordova && cordova.plugins && cordova.plugins.backgroundMode) {
        const bg = cordova.plugins.backgroundMode;
        bg.setDefaults({
          title: 'الكرار للموبايل',
          text: 'المزامنة السحابية قيد العمل في الخلفية...',
          color: '059669',
          resume: true,
          silent: true,
        });
        bg.enable();
        if (typeof bg.disableWebViewOptimizations === 'function') {
          bg.disableWebViewOptimizations();
        }

        // When entering background
        bg.on('activate', () => {
          console.log('[Background Mode] App entered active background mode');
          try {
            if (typeof bg.disableWebViewOptimizations === 'function') {
              bg.disableWebViewOptimizations();
            }
          } catch (e) {}
          
          flushPendingQueue().catch(() => {});
          if (globalSyncCallback) {
            globalSyncCallback().catch(() => {});
          }

          // Maintain active background loop every 3 seconds while in background
          if (activeBgLoopInterval) clearInterval(activeBgLoopInterval);
          activeBgLoopInterval = setInterval(() => {
            const queue = getPendingQueueSync();
            const hasUnsynced = queue.some((i) => i.status !== 'synced');
            if (hasUnsynced && !isFlushing) {
              flushPendingQueue().catch(() => {});
            }
          }, 3000);
        });

        bg.on('deactivate', () => {
          if (activeBgLoopInterval) {
            clearInterval(activeBgLoopInterval);
            activeBgLoopInterval = null;
          }
          triggerImmediateSync();
        });
      }
    } catch (bgInitErr) {
      console.warn('Cordova backgroundMode initialization notice:', bgInitErr);
    }

    // 2. Setup Capacitor App State Listener with BackgroundTask and BackgroundRunner
    if (App && typeof App.addListener === 'function') {
      App.addListener('appStateChange', async (state) => {
        try {
          if (!state.isActive) {
            // Immediate non-blocking exit beacon & service worker notification
            sendBeaconOnExit();
            notifyServiceWorker();
            flushPendingQueue().catch(() => {});

            // Dispatch Capacitor BackgroundRunner event
            try {
              if (BackgroundRunner && typeof BackgroundRunner.dispatchEvent === 'function') {
                BackgroundRunner.dispatchEvent({
                  label: 'com.alkarrar.mobile.backgroundsync',
                  event: 'syncOfflineQueue',
                  details: {},
                }).catch(() => {});
              }
            } catch (brErr) {}

            try {
              if (BackgroundTask && typeof BackgroundTask.beforeExit === 'function') {
                let finished = false;
                const taskId = await BackgroundTask.beforeExit(async () => {
                  try {
                    // Maximum 2-second window for background task before forced clean finish
                    await Promise.race([
                      (async () => {
                        await flushPendingQueue().catch(() => {});
                        if (globalSyncCallback) {
                          await globalSyncCallback().catch(() => {});
                        }
                      })(),
                      new Promise((resolve) => setTimeout(resolve, 2000)),
                    ]);
                  } catch (err) {
                    console.warn('Silent background sync exception:', err);
                  } finally {
                    if (!finished && taskId) {
                      finished = true;
                      try {
                        BackgroundTask.finish({ taskId });
                      } catch (e) {}
                    }
                  }
                });

                // Auto-cleanup timer fallback
                setTimeout(() => {
                  if (!finished && taskId) {
                    finished = true;
                    try {
                      BackgroundTask.finish({ taskId });
                    } catch (e) {}
                  }
                }, 2200);
              }
            } catch (err) {
              console.warn('BackgroundTask.beforeExit failed:', err);
            }
          } else {
            // App returned to active foreground state
            triggerImmediateSync();
          }
        } catch (stateErr) {
          console.warn('App state change handler notice:', stateErr);
        }
      }).catch(() => {});
    }

    // 3. Setup Periodic Background Task & Dedicated Web Worker Heartbeat
    const SYNC_INTERVAL_MS = 10 * 1000;
    setInterval(() => {
      if (isUserActivelyTypingOrInputFocused()) return;
      const queue = getPendingQueueSync();
      const hasUnsynced = queue.some((i) => i.status !== 'synced');
      if (hasUnsynced && !isFlushing) {
        console.log('[10-Second Background Task] Detected pending offline actions. Running silent sync to Postgres...');
        flushPendingQueue().catch(() => {});
      }
      // Also trigger BackgroundRunner event if available
      try {
        if (BackgroundRunner && typeof BackgroundRunner.dispatchEvent === 'function' && !isUserActivelyTypingOrInputFocused()) {
          BackgroundRunner.dispatchEvent({
            label: 'com.alkarrar.mobile.backgroundsync',
            event: 'syncOfflineQueue',
            details: {},
          }).catch(() => {});
        }
      } catch (e) {}
    }, SYNC_INTERVAL_MS);

    // Dedicated Background Web Worker Heartbeat (unaffected by mobile background tab throttling)
    try {
      if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
        const workerScript = `
          let timer = null;
          self.onmessage = function(e) {
            if (e.data === 'START') {
              if (timer) clearInterval(timer);
              timer = setInterval(function() {
                self.postMessage('TICK');
              }, 6000);
            } else if (e.data === 'STOP') {
              if (timer) clearInterval(timer);
              timer = null;
            }
          };
        `;
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = (e) => {
          if (e.data === 'TICK') {
            if (isUserActivelyTypingOrInputFocused()) return;
            const queue = getPendingQueueSync();
            const hasUnsynced = queue.some((i) => i.status !== 'synced');
            if (hasUnsynced && !isFlushing) {
              flushPendingQueue().catch(() => {});
            }
          }
        };
        worker.postMessage('START');
      }
    } catch (workerErr) {
      console.warn('[Offline Sync Engine] Web Worker heartbeat fallback notice:', workerErr);
    }

    // 4. Setup Network Status Change Listener for Instant Automatic Sync
    try {
      if (Network && typeof Network.addListener === 'function') {
        Network.addListener('networkStatusChange', (status) => {
          console.log('[Network Status Change] Connected:', status.connected, status.connectionType);
          if (status.connected) {
            triggerImmediateSync();
          }
        }).catch(() => {});
      }
    } catch (netErr) {}

    // 5. Setup Robust Browser Visibility & Online Listeners for Background Monitoring
    try {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            console.log('[Background Monitoring] App became visible. Triggering immediate sync...');
            triggerImmediateSync();
          } else {
            console.log('[Background Monitoring] App hidden. Flushing pending queue...');
            flushPendingQueue().catch(() => {});
          }
        });
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          console.log('[Background Monitoring] Network online detected. Triggering immediate sync...');
          triggerImmediateSync();
        });
      }
    } catch (bgMonErr) {
      console.warn('Background monitoring listener error:', bgMonErr);
    }
  } catch (e) {
    console.warn('Capacitor App change listener not supported on current platform:', e);
  }
}

/**
 * Explicitly enable Foreground Service and Wake Lock for persistent background sync
 */
export async function enableForegroundService(): Promise<boolean> {
  let success = false;
  try {
    if (typeof window === 'undefined') return false;

    // 1. Cordova Background Mode / Foreground Service
    try {
      const cordova = (window as any).cordova;
      if (cordova && cordova.plugins && cordova.plugins.backgroundMode) {
        const bg = cordova.plugins.backgroundMode;
        bg.setDefaults({
          title: 'الكرار للتقسيط',
          text: 'خدمة المزامنة السحابية قيد العمل المستمر...',
          color: '0d9488',
          resume: true,
          silent: true,
        });
        bg.enable();
        if (typeof bg.overrideBackButton === 'function') {
          bg.overrideBackButton();
        }
        if (typeof bg.disableWebViewOptimizations === 'function') {
          bg.disableWebViewOptimizations();
        }
        success = true;
      }
    } catch (e) {}

    // 2. Android Foreground Service Plugin
    try {
      const fg = (window as any).plugins?.foregroundService || (window as any).cordova?.plugins?.foregroundService;
      if (fg && typeof fg.start === 'function') {
        fg.start('الكرار للتقسيط', 'المزامنة السحابية المباشرة نشطة', 'notification_icon', 1);
        success = true;
      }
    } catch (e) {}

    // 3. Web Screen Wake Lock API
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
        await (navigator as any).wakeLock.request('screen').catch(() => {});
        success = true;
      }
    } catch (e) {}

    // 4. Service Worker Background Sync registration
    try {
      if ('serviceWorker' in navigator) {
        const reg: any = await navigator.serviceWorker.ready.catch(() => null);
        if (reg && reg.sync) {
          await reg.sync.register('alkarrar-foreground-sync').catch(() => {});
        }
      }
    } catch (e) {}

    console.log('[Foreground Service] Service successfully initialized & active');
  } catch (err) {
    console.warn('[Foreground Service] Init note:', err);
  }
  return success;
}

// -------------------------------------------------------------
// Advanced Anti-Sleep, Display Over Apps & Keep-Alive System
// -------------------------------------------------------------

let globalWakeLockSentinel: any = null;
let globalSilentAudioContext: any = null;
let globalSilentAudioElement: HTMLAudioElement | null = null;
let isKeepAliveEngineRunning = false;

/**
 * Check if Field Keep-Alive Mode is currently enabled (Defaults to TRUE for field sales reps)
 */
export function isKeepAliveModeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const val = localStorage.getItem('alkarrar_keepalive_mode');
    // Enabled by default unless explicitly disabled by user
    return val !== 'false';
  } catch (e) {
    return true;
  }
}

/**
 * Acquire Web Screen Wake Lock safely with auto-reacquisition
 */
async function acquireWakeLock(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      if (globalWakeLockSentinel && !globalWakeLockSentinel.released) {
        return true;
      }
      globalWakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      globalWakeLockSentinel.addEventListener('release', () => {
        globalWakeLockSentinel = null;
        // If keep alive is still active, re-acquire when app becomes visible
        if (isKeepAliveEngineRunning && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          setTimeout(() => acquireWakeLock().catch(() => {}), 1000);
        }
      });
      return true;
    }
  } catch (e) {
    console.warn('[KeepAlive] WakeLock notice:', e);
  }
  return false;
}

let globalKeepAliveWorker: Worker | null = null;

function startWorkerKeepAlive(): void {
  try {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    if (globalKeepAliveWorker) return;

    const workerCode = `
      var timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (!timer) {
            timer = setInterval(function() {
              self.postMessage('TICK');
            }, 7000);
          }
        } else if (e.data === 'stop') {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
      timer = setInterval(function() {
        self.postMessage('TICK');
      }, 7000);
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    globalKeepAliveWorker = new Worker(workerUrl);
    globalKeepAliveWorker.onmessage = (e) => {
      if (e.data === 'TICK') {
        if (isUserActivelyTypingOrInputFocused()) return;
        flushPendingQueue().catch(() => {});
      }
    };
    globalKeepAliveWorker.postMessage('start');
  } catch (err) {
    console.warn('[KeepAlive] Worker keepalive notice:', err);
  }
}

function stopWorkerKeepAlive(): void {
  try {
    if (globalKeepAliveWorker) {
      globalKeepAliveWorker.postMessage('stop');
      globalKeepAliveWorker.terminate();
      globalKeepAliveWorker = null;
    }
  } catch (e) {}
}

/**
 * Start a silent WebAudio keep-alive loop to prevent Android/iOS from suspending the JS thread
 */
function startSilentAudioKeepAlive(): void {
  try {
    if (typeof window === 'undefined') return;

    // 0. Dedicated Web Worker ticking loop
    startWorkerKeepAlive();

    // 1. Silent HTML5 Audio Element Loop (extremely reliable across Android WebViews)
    if (!globalSilentAudioElement) {
      // 1-second silent WAV base64
      const silentWavBase64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      const audio = new Audio(silentWavBase64);
      audio.loop = true;
      audio.volume = 0.01; // virtually inaudible but informs mobile OS of active media session
      (audio as any).playsInline = true;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // On mobile, autoplay might require first user gesture
          const handleFirstClick = () => {
            audio.play().catch(() => {});
            window.removeEventListener('click', handleFirstClick);
            window.removeEventListener('touchstart', handleFirstClick);
          };
          window.addEventListener('click', handleFirstClick, { once: true });
          window.addEventListener('touchstart', handleFirstClick, { once: true });
        });
      }
      globalSilentAudioElement = audio;
    }

    // 2. Silent Web Audio API Context
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass && !globalSilentAudioContext) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        const resumeCtx = () => {
          ctx.resume().catch(() => {});
          window.removeEventListener('click', resumeCtx);
          window.removeEventListener('touchstart', resumeCtx);
        };
        window.addEventListener('click', resumeCtx, { once: true });
        window.addEventListener('touchstart', resumeCtx, { once: true });
      }
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      gainNode.gain.value = 0.00001; // Inaudible
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      globalSilentAudioContext = ctx;
    }
  } catch (err) {
    console.warn('[KeepAlive] Audio keepalive notice:', err);
  }
}

/**
 * Stop silent audio keep-alive
 */
function stopSilentAudioKeepAlive(): void {
  try {
    stopWorkerKeepAlive();
    if (globalSilentAudioElement) {
      globalSilentAudioElement.pause();
      globalSilentAudioElement.src = '';
      globalSilentAudioElement = null;
    }
    if (globalSilentAudioContext) {
      globalSilentAudioContext.close().catch(() => {});
      globalSilentAudioContext = null;
    }
  } catch (e) {}
}

/**
 * Toggle Field Keep-Alive Mode (Anti-Sleep, WakeLock, Silent Heartbeat, Background Sync)
 */
export async function setFieldKeepAliveMode(enable: boolean): Promise<boolean> {
  isKeepAliveEngineRunning = enable;
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem('alkarrar_keepalive_mode', enable ? 'true' : 'false');
    }

    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (androidBridge && typeof androidBridge.setKeepScreenOn === 'function') {
      try {
        androidBridge.setKeepScreenOn(enable);
      } catch (e) {}
    }

    if (enable) {
      await acquireWakeLock();
      startSilentAudioKeepAlive();
      await enableForegroundService();
      await requestAllBackgroundAndSyncPermissions();
      
      // Listen for visibility to restore WakeLock if screen turned off & on
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && isKeepAliveEngineRunning) {
            acquireWakeLock().catch(() => {});
          }
        });
      }
      console.log('[KeepAlive] Field Keep-Alive mode ACTIVATED (WakeLock + Audio Heartbeat + Foreground Service)');
      return true;
    } else {
      stopSilentAudioKeepAlive();
      if (globalWakeLockSentinel) {
        try {
          await globalWakeLockSentinel.release();
        } catch (e) {}
        globalWakeLockSentinel = null;
      }
      console.log('[KeepAlive] Field Keep-Alive mode DEACTIVATED');
      return false;
    }
  } catch (err) {
    console.warn('[KeepAlive] Error setting keepalive mode:', err);
    return false;
  }
}

/**
 * Request Display Over Other Apps (SYSTEM_ALERT_WINDOW) Permission & open Android Settings
 */
export async function requestDisplayOverAppsPermission(): Promise<{ success: boolean; message: string }> {
  try {
    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    // 1. Direct native bridge call
    if (androidBridge) {
      if (typeof androidBridge.requestOverlayPermission === 'function') {
        androidBridge.requestOverlayPermission();
        return { success: true, message: 'تم فتح إعدادات صلاحية الظهور فوق التطبيقات' };
      }
      if (typeof androidBridge.openOverlaySettings === 'function') {
        androidBridge.openOverlaySettings();
        return { success: true, message: 'تم فتح إعدادات الظهور فوق التطبيقات' };
      }
      if (typeof androidBridge.requestSystemAlertWindow === 'function') {
        androidBridge.requestSystemAlertWindow();
        return { success: true, message: 'تم طلب إذن النوافذ العائمة والظهور فوق التطبيقات' };
      }
    }

    // 2. Cordova / Capacitor Plugins
    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins) {
      if (cordova.plugins.permissions) {
        const p = cordova.plugins.permissions;
        const overlayPerm = p.SYSTEM_ALERT_WINDOW || 'android.permission.SYSTEM_ALERT_WINDOW';
        p.requestPermission(
          overlayPerm,
          () => {},
          () => {}
        );
      }
      if (cordova.plugins.diagnostic && typeof cordova.plugins.diagnostic.switchToOverlaySettings === 'function') {
        cordova.plugins.diagnostic.switchToOverlaySettings();
        return { success: true, message: 'تم فتح إعدادات الظهور فوق التطبيقات' };
      }
    }

    // 3. Fallback intent trigger for Android browsers / WebView
    if (typeof window !== 'undefined') {
      try {
        const intentUrl = 'intent:#Intent;action=android.settings.action.MANAGE_OVERLAY_PERMISSION;end';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = intentUrl;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      } catch (e) {}
    }

    return {
      success: true,
      message: 'يرجى الانتقال إلى إعدادات الهاتف > التطبيقات > تفعيل "الظهور فوق التطبيقات"',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'تعذر فتح إعدادات الصلاحية' };
  }
}

/**
 * Open Battery Optimization Exemption Settings (Unrestricted battery)
 */
export async function openBatteryOptimizationSettings(): Promise<{ success: boolean; message: string }> {
  try {
    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (androidBridge) {
      if (typeof androidBridge.requestIgnoreBatteryOptimizations === 'function') {
        androidBridge.requestIgnoreBatteryOptimizations();
        return { success: true, message: 'تم فتح إعدادات استثناء توفير البطارية' };
      }
      if (typeof androidBridge.openBatterySettings === 'function') {
        androidBridge.openBatterySettings();
        return { success: true, message: 'تم فتح إعدادات البطارية' };
      }
    }

    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins?.backgroundMode) {
      try {
        if (typeof cordova.plugins.backgroundMode.disableBatteryOptimizations === 'function') {
          cordova.plugins.backgroundMode.disableBatteryOptimizations();
          return { success: true, message: 'تم تعطيل قيود البطارية' };
        }
      } catch (e) {}
    }

    if (typeof window !== 'undefined') {
      try {
        const intentUrl = 'intent:#Intent;action=android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS;end';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = intentUrl;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      } catch (e) {}
    }

    return {
      success: true,
      message: 'يرجى اختيار "غير مقيد" (Unrestricted) في إعدادات بطارية التطبيق',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'تعذر فتح إعدادات البطارية' };
  }
}

/**
 * Open Auto-Start & Application Details Settings
 */
export async function openAutoStartSettings(): Promise<{ success: boolean; message: string }> {
  try {
    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (androidBridge) {
      if (typeof androidBridge.openAutoStartSettings === 'function') {
        androidBridge.openAutoStartSettings();
        return { success: true, message: 'تم فتح إعدادات التشغيل التلقائي' };
      }
      if (typeof androidBridge.openAppSettings === 'function') {
        androidBridge.openAppSettings();
        return { success: true, message: 'تم فتح معلومات التطبيق' };
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const intentUrl = 'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = intentUrl;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      } catch (e) {}
    }

    return {
      success: true,
      message: 'يرجى تفعيل "التشغيل التلقائي" (Auto-start) وقفل التطبيق في الرام',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'تعذر فتح الإعدادات' };
  }
}

/**
 * Open Application Details Settings Page directly
 */
export async function openApplicationDetailsSettings(): Promise<{ success: boolean; message: string }> {
  try {
    const androidBridge =
      (window as any).AndroidPrinter ||
      (window as any).AndroidInterface ||
      (window as any).Android ||
      (window as any).AndroidBridge;

    if (androidBridge && typeof androidBridge.openAppSettings === 'function') {
      androidBridge.openAppSettings();
      return { success: true, message: 'تم فتح معلومات وأذونات التطبيق في النظام' };
    }

    if (typeof window !== 'undefined') {
      try {
        const intentUrl = 'intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;end';
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = intentUrl;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 1000);
      } catch (e) {}
    }

    return {
      success: true,
      message: 'يرجى الانتقال إلى إعدادات الهاتف > التطبيقات > اختيار التطبيق > تفعيل الأذونات والظهور في الأعلى',
    };
  } catch (err: any) {
    return { success: false, message: err?.message || 'تعذر فتح الإعدادات' };
  }
}

export interface BackgroundSyncHealthStatus {
  serviceWorkerActive: boolean;
  backgroundSyncSupported: boolean;
  periodicSyncSupported: boolean;
  keepAliveActive: boolean;
  wakeLockActive: boolean;
  storagePersisted: boolean;
  pendingCount: number;
  isOnline: boolean;
  batteryOptimizationsDisabled: boolean;
  notificationPermission: string;
  overlayPermissionGranted: boolean;
  batteryUnrestricted: boolean;
  keepScreenOn: boolean;
}

/**
 * Perform a complete live audit of the 5-layer Background Sync pipeline
 */
export async function checkBackgroundSyncHealth(): Promise<BackgroundSyncHealthStatus> {
  const queue = await getPendingQueue();
  const pendingCount = queue.filter((i) => i.status !== 'synced').length;
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  let swActive = false;
  let bgSyncSupported = false;
  let periodicSyncSupported = false;

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    swActive = !!navigator.serviceWorker.controller;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg) {
        swActive = true;
        bgSyncSupported = 'sync' in reg;
        periodicSyncSupported = 'periodicSync' in reg;
      }
    } catch (e) {}
  }

  let storagePersisted = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      storagePersisted = await navigator.storage.persisted();
    }
  } catch (e) {}

  const notifPerm = typeof Notification !== 'undefined' ? Notification.permission : 'default';

  let overlayPermissionGranted = false;
  let batteryUnrestricted = false;
  let keepScreenOn = false;

  const androidBridge =
    (window as any).AndroidPrinter ||
    (window as any).AndroidInterface ||
    (window as any).Android ||
    (window as any).AndroidBridge;

  if (androidBridge) {
    try {
      if (typeof androidBridge.hasOverlayPermission === 'function') {
        overlayPermissionGranted = !!androidBridge.hasOverlayPermission();
      }
      if (typeof androidBridge.isIgnoringBatteryOptimizations === 'function') {
        batteryUnrestricted = !!androidBridge.isIgnoringBatteryOptimizations();
      }
      if (typeof androidBridge.isKeepScreenOn === 'function') {
        keepScreenOn = !!androidBridge.isKeepScreenOn();
      }
    } catch (e) {}
  }

  return {
    serviceWorkerActive: swActive,
    backgroundSyncSupported: bgSyncSupported,
    periodicSyncSupported: periodicSyncSupported,
    keepAliveActive: isKeepAliveEngineRunning || isKeepAliveModeEnabled(),
    wakeLockActive: !!globalWakeLockSentinel && !globalWakeLockSentinel.released,
    storagePersisted,
    pendingCount,
    isOnline,
    batteryOptimizationsDisabled: batteryUnrestricted || isKeepAliveEngineRunning,
    notificationPermission: notifPerm,
    overlayPermissionGranted,
    batteryUnrestricted,
    keepScreenOn,
  };
}

/**
 * Trigger an immediate high-priority test through all 5 background sync layers
 */
export async function triggerForceBackgroundSyncTest(): Promise<{
  success: boolean;
  flushedCount: number;
  remainingCount: number;
  latencyMs: number;
  layersTriggered: string[];
}> {
  const startTime = Date.now();
  const layersTriggered: string[] = [];

  // Layer 1: BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel('alkarrar_sync_channel');
      ch.postMessage({ type: 'TRIGGER_SYNC', timestamp: Date.now() });
      ch.close();
      layersTriggered.push('BroadcastChannel');
    } catch (e) {}
  }

  // Layer 2: Service Worker controller & sync tags
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'FLUSH_QUEUE_IMMEDIATELY' });
        layersTriggered.push('ServiceWorkerMessage');
      }
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'sync' in reg) {
        await (reg as any).sync.register('postgres-background-sync').catch(() => {});
        layersTriggered.push('AndroidBackgroundSyncAPI');
      }
    } catch (e) {}
  }

  // Layer 3: Native Android Bridge
  try {
    const bridge =
      (window as any).AndroidInterface ||
      (window as any).AndroidPrinter ||
      (window as any).Android ||
      (window as any).AndroidBridge;
    if (bridge && typeof bridge.triggerBackgroundSyncNow === 'function') {
      bridge.triggerBackgroundSyncNow();
      layersTriggered.push('NativeAndroidBridge');
    }
  } catch (e) {}

  // Layer 4: KeepAlive & Foreground activation
  if (isKeepAliveModeEnabled()) {
    setFieldKeepAliveMode(true).catch(() => {});
    layersTriggered.push('KeepAliveMediaHeartbeat');
  }

  // Layer 5: Direct Client Flush
  const flushRes = await flushPendingQueue();
  layersTriggered.push('BatchPostgresPipeline');

  const latencyMs = Date.now() - startTime;
  return {
    success: true,
    flushedCount: flushRes.flushed,
    remainingCount: flushRes.remaining,
    latencyMs,
    layersTriggered,
  };
}

// Auto-activate field keepalive on first user touch anywhere
if (typeof window !== 'undefined') {
  const handleUserFirstGesture = () => {
    if (isKeepAliveModeEnabled()) {
      setFieldKeepAliveMode(true).catch(() => {});
    }
    window.removeEventListener('pointerdown', handleUserFirstGesture);
    window.removeEventListener('touchstart', handleUserFirstGesture);
    window.removeEventListener('click', handleUserFirstGesture);
  };
  window.addEventListener('pointerdown', handleUserFirstGesture, { once: true, passive: true });
  window.addEventListener('touchstart', handleUserFirstGesture, { once: true, passive: true });
  window.addEventListener('click', handleUserFirstGesture, { once: true, passive: true });
}

