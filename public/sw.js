// Service Worker with Automatic Background Data Sync & Upload for PostgreSQL backend
const CACHE_NAME = 'alkarrar-pwa-cache-v7';
const SYNC_TAG = 'postgres-background-sync';
const SYNC_TAG_FALLBACK = 'alkarrar-background-sync';
const DB_NAME = 'alkarrar_sync_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_actions';

const SECONDARY_DB_NAME = 'alkarrar_offline_sync_db';
const SECONDARY_STORE_NAME = 'offline_queue';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  // Attempt immediate background flush on activate
  handleBackgroundSync().catch(() => {});
});

// Helper: Open IndexedDB for offline queue
function openSyncDatabase(dbName = DB_NAME, storeName = STORE_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let store;
      if (!db.objectStoreNames.contains(storeName)) {
        store = db.createObjectStore(storeName, { keyPath: 'id' });
      } else {
        store = event.target.transaction.objectStore(storeName);
      }
      if (!store.indexNames.contains('status')) {
        store.createIndex('status', 'status', { unique: false });
      }
      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Helper: Get all pending actions from Primary & Secondary IndexedDB
async function getPendingActionsFromIndexedDB() {
  const actions = [];
  try {
    const db = await openSyncDatabase(DB_NAME, STORE_NAME);
    const primaryItems = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    if (Array.isArray(primaryItems)) {
      const valid = primaryItems.filter((i) => i && !i.id?.startsWith('__meta_') && i.status !== 'synced');
      actions.push(...valid);
    }
  } catch (err) {
    console.warn('[SW] Primary DB read note:', err);
  }

  try {
    const db2 = await openSyncDatabase(SECONDARY_DB_NAME, SECONDARY_STORE_NAME);
    const secItems = await new Promise((resolve) => {
      const tx = db2.transaction(SECONDARY_STORE_NAME, 'readonly');
      const store = tx.objectStore(SECONDARY_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    if (Array.isArray(secItems)) {
      for (const item of secItems) {
        if (item && !item.id?.startsWith('__meta_') && item.status !== 'synced' && !actions.some((a) => a.id === item.id)) {
          actions.push(item);
        }
      }
    }
  } catch (err) {
    // ignore
  }

  return actions;
}

// Helper: Remove processed actions from IndexedDB
async function removeProcessedFromIndexedDB(processedIds) {
  if (!Array.isArray(processedIds) || processedIds.length === 0) return;
  try {
    const db = await openSyncDatabase(DB_NAME, STORE_NAME);
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const id of processedIds) {
      store.delete(id);
    }
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch (err) {}

  try {
    const db2 = await openSyncDatabase(SECONDARY_DB_NAME, SECONDARY_STORE_NAME);
    const tx2 = db2.transaction(SECONDARY_STORE_NAME, 'readwrite');
    const store2 = tx2.objectStore(SECONDARY_STORE_NAME);
    for (const id of processedIds) {
      store2.delete(id);
    }
    await new Promise((resolve) => {
      tx2.oncomplete = resolve;
      tx2.onerror = resolve;
    });
  } catch (err) {}
}

// Helper: Get candidate sync batch endpoint URLs
async function getCandidateServerOrigins() {
  const origins = [];
  if (self.location && self.location.origin && self.location.origin !== 'null') {
    origins.push(self.location.origin);
  }

  try {
    const db = await openSyncDatabase(DB_NAME, STORE_NAME);
    const meta = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('__meta_server_url__');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (meta && meta.payload) {
      if (Array.isArray(meta.payload.origins)) {
        for (const o of meta.payload.origins) {
          if (o && typeof o === 'string') {
            const clean = o.trim().replace(/\/+$/, '');
            if (clean && !origins.includes(clean)) origins.push(clean);
          }
        }
      }
      if (meta.payload.serverUrl && typeof meta.payload.serverUrl === 'string') {
        try {
          const u = new URL(meta.payload.serverUrl, self.location.origin);
          if (u && u.origin && !origins.includes(u.origin)) origins.push(u.origin);
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Fallback candidate origins for Cloud PostgreSQL server, local dev and Android
  const defaults = [
    'https://ais-dev-asc5xuvnur4hlmpl5rfxpz-655986077616.europe-west2.run.app',
    'https://ais-pre-asc5xuvnur4hlmpl5rfxpz-655986077616.europe-west2.run.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.0.2.2:3000',
    'http://72.62.158.128:3000'
  ];
  for (const d of defaults) {
    if (!origins.includes(d)) origins.push(d);
  }

  return origins;
}

// Upload a single action via individual REST endpoint as fallback
async function uploadSingleActionViaRest(action, origins) {
  const { type, payload } = action;
  let endpointPath = '';
  let method = 'POST';
  const docId = payload?.id || (typeof payload === 'string' ? payload : null);

  switch (type) {
    case 'CREATE_PAYMENT':
    case 'RECORD_PAYMENT':
      endpointPath = '/api/payments';
      method = 'POST';
      break;
    case 'UPDATE_PAYMENT':
      endpointPath = docId ? `/api/payments/${docId}` : '/api/payments';
      method = 'PUT';
      break;
    case 'DELETE_PAYMENT':
      endpointPath = docId ? `/api/payments/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_CONTRACT':
      endpointPath = '/api/contracts';
      method = 'POST';
      break;
    case 'UPDATE_CONTRACT':
      endpointPath = docId ? `/api/contracts/${docId}` : '/api/contracts';
      method = 'PUT';
      break;
    case 'DELETE_CONTRACT':
      endpointPath = docId ? `/api/contracts/${docId}` : '';
      method = 'DELETE';
      break;
    case 'UPDATE_INVENTORY':
      endpointPath = docId ? `/api/inventory/${docId}` : '/api/inventory';
      method = 'PUT';
      break;
    case 'CREATE_INVENTORY':
      endpointPath = '/api/inventory';
      method = 'POST';
      break;
    case 'DELETE_INVENTORY':
      endpointPath = docId ? `/api/inventory/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_REP':
      endpointPath = '/api/reps';
      method = 'POST';
      break;
    case 'UPDATE_REP':
      endpointPath = docId ? `/api/reps/${docId}` : '/api/reps';
      method = 'PUT';
      break;
    case 'DELETE_REP':
      endpointPath = docId ? `/api/reps/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_FUND':
      endpointPath = '/api/funds';
      method = 'POST';
      break;
    case 'UPDATE_FUND':
      endpointPath = docId ? `/api/funds/${docId}` : '/api/funds';
      method = 'PUT';
      break;
    case 'DELETE_FUND':
      endpointPath = docId ? `/api/funds/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_CUSTOMER_LIST':
      endpointPath = '/api/customer-lists';
      method = 'POST';
      break;
    case 'UPDATE_CUSTOMER_LIST':
      endpointPath = docId ? `/api/customer-lists/${docId}` : '/api/customer-lists';
      method = 'PUT';
      break;
    case 'DELETE_CUSTOMER_LIST':
      endpointPath = docId ? `/api/customer-lists/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_EMPLOYEE':
      endpointPath = '/api/employees';
      method = 'POST';
      break;
    case 'UPDATE_EMPLOYEE':
      endpointPath = docId ? `/api/employees/${docId}` : '/api/employees';
      method = 'PUT';
      break;
    case 'DELETE_EMPLOYEE':
      endpointPath = docId ? `/api/employees/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_FUND_TRANSACTION':
    case 'CREATE_FUND_TX':
      endpointPath = '/api/fund-transactions';
      method = 'POST';
      break;
    case 'UPDATE_FUND_TRANSACTION':
      endpointPath = docId ? `/api/fund-transactions/${docId}` : '/api/fund-transactions';
      method = 'PUT';
      break;
    case 'DELETE_FUND_TRANSACTION':
    case 'DELETE_FUND_TX':
      endpointPath = docId ? `/api/fund-transactions/${docId}` : '';
      method = 'DELETE';
      break;
    case 'CREATE_EMPLOYEE_TRANSACTION':
    case 'CREATE_EMPLOYEE_TX':
      endpointPath = '/api/employee-transactions';
      method = 'POST';
      break;
    case 'UPDATE_EMPLOYEE_TRANSACTION':
      endpointPath = docId ? `/api/employee-transactions/${docId}` : '/api/employee-transactions';
      method = 'PUT';
      break;
    case 'DELETE_EMPLOYEE_TRANSACTION':
    case 'DELETE_EMPLOYEE_TX':
      endpointPath = docId ? `/api/employee-transactions/${docId}` : '';
      method = 'DELETE';
      break;
    case 'RESOLVE_PAYMENT_CONFLICT':
    case 'REJECT_PAYMENT_CONFLICT':
      endpointPath = docId ? `/api/payment-conflicts/${docId}` : '';
      method = 'DELETE';
      break;
    default:
      return false;
  }

  if (!endpointPath) return false;

  for (const origin of origins) {
    try {
      const url = `${origin}${endpointPath}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'DELETE' ? JSON.stringify(typeof payload === 'object' ? payload : { id: docId, value: payload }) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res && res.ok && res.status >= 200 && res.status < 300) {
        const ct = res.headers ? res.headers.get('content-type') || '' : '';
        if (ct.includes('application/json') && !ct.includes('text/html')) {
          const data = await res.json().catch(() => null);
          if (data && !data.error) return true;
        }
      }
    } catch (e) {}
  }

  return false;
}

// Direct Hostinger PostgreSQL fallback handles background synchronization via REST and Beacon

let isSwFlushing = false;

// Flush pending actions in background when network returns (even when app is completely closed)
async function flushPendingActionsInBackground() {
  if (isSwFlushing) return;
  isSwFlushing = true;
  try {
    const rawActions = await getPendingActionsFromIndexedDB();
    const actions = (rawActions || []).filter((item) => item && !item.id?.startsWith('__meta_') && item.type !== '__META_CONFIG__');
    if (!actions || actions.length === 0) {
      isSwFlushing = false;
      return;
    }

    console.log(`[Service Worker] Auto-uploading ${actions.length} pending actions to server in background...`);
    const origins = await getCandidateServerOrigins();
    const processedIds = [];

    // Path 1: Try batch sync endpoint in chunks of 200
    const SW_BATCH_CHUNK = 200;
    for (let i = 0; i < actions.length; i += SW_BATCH_CHUNK) {
      const chunkActions = actions.slice(i, i + SW_BATCH_CHUNK);
      let chunkDone = false;

      for (const origin of origins) {
        if (chunkDone) break;
        try {
          const batchUrl = `${origin}/api/sync/batch`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const attempt = await fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions: chunkActions }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (attempt && attempt.ok && attempt.status >= 200 && attempt.status < 300) {
            const ct = attempt.headers ? attempt.headers.get('content-type') || '' : '';
            if (ct.includes('application/json') && !ct.includes('text/html')) {
              const data = await attempt.json().catch(() => ({}));
              if (Array.isArray(data.processedIds)) {
                processedIds.push(...data.processedIds);
              } else if (data.success) {
                processedIds.push(...chunkActions.map((a) => a.id));
              }
              chunkDone = true;
            }
          }
        } catch (err) {}
      }
    }

    // Path 2: Individual REST endpoints fallback for any remaining actions in parallel chunks of 8
    const remainingAfterBatch = actions.filter((a) => !processedIds.includes(a.id));
    const PARALLEL_CHUNK = 8;
    for (let i = 0; i < remainingAfterBatch.length; i += PARALLEL_CHUNK) {
      const parallelBatch = remainingAfterBatch.slice(i, i + PARALLEL_CHUNK);
      await Promise.all(
        parallelBatch.map(async (action) => {
          try {
            const ok = await uploadSingleActionViaRest(action, origins);
            if (ok) {
              processedIds.push(action.id);
            }
          } catch (err) {}
        })
      );
    }

    // Path 3: Direct PostgreSQL Beacon fallback for any remaining actions
    const remainingAfterRest = actions.filter((a) => !processedIds.includes(a.id));
    if (remainingAfterRest.length > 0) {
      for (const origin of origins) {
        try {
          const beaconUrl = `${origin}/api/sync/beacon`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const bAttempt = await fetch(beaconUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actions: remainingAfterRest }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (bAttempt && bAttempt.ok) {
            const bData = await bAttempt.json().catch(() => ({}));
            if (Array.isArray(bData.processedIds)) {
              processedIds.push(...bData.processedIds);
              break;
            } else if (bData.success) {
              processedIds.push(...remainingAfterRest.map((a) => a.id));
              break;
            }
          }
        } catch (bErr) {}
      }
    }

    if (processedIds.length > 0) {
      await removeProcessedFromIndexedDB(processedIds);
      try {
        const db = await openSyncDatabase(DB_NAME, STORE_NAME);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          id: '__meta_last_synced_ids__',
          type: '__META_CONFIG__',
          payload: { syncedIds: processedIds, timestamp: Date.now() },
          timestamp: Date.now(),
          status: 'synced'
        });
        await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; });
      } catch (e) {}
      console.log(`[Service Worker] Successfully uploaded & saved ${processedIds.length} offline actions to PostgreSQL in background!`);

      // Show background notification only when items were genuinely synced
      try {
        if (self.Notification && self.Notification.permission === 'granted') {
          self.registration.showNotification('الكرار للموبايل - تمت المزامنة', {
            body: `تم رفع ${processedIds.length} عملية وحفظها في قاعدة البيانات بنجاح في الخلفية.`,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'sync-notification',
          });
        }
      } catch (notifErr) {}
    } else {
      // Re-register background sync tag to retry when network becomes available
      if ('sync' in self.registration) {
        self.registration.sync.register(SYNC_TAG).catch(() => {});
        self.registration.sync.register(SYNC_TAG_FALLBACK).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Service Worker] Background flush notice:', err);
    if ('sync' in self.registration) {
      self.registration.sync.register(SYNC_TAG).catch(() => {});
    }
  } finally {
    isSwFlushing = false;
  }
}

let isSwReconciling = false;

function swNormName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Background Reconciliation: Reconcile datasets and recalculate contract balances (even when app is closed)
async function reconcileDatabaseInBackground() {
  if (isSwReconciling) return;
  isSwReconciling = true;
  try {
    const origins = await getCandidateServerOrigins();
    const db = await openSyncDatabase(DB_NAME, STORE_NAME);

    // 1. Read existing local snapshot from IndexedDB
    let snapshotItem = null;
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      snapshotItem = await new Promise((res) => {
        const req = store.get('__meta_local_snapshot__');
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });
    } catch (e) {}

    const localSnapshot = snapshotItem?.payload || snapshotItem?.snapshot || {};

    // 2. Fetch authoritative datasets from server (/api/sync/all)
    let serverData = null;
    for (const origin of origins) {
      if (serverData) break;
      try {
        const res = await fetch(`${origin}/api/sync/all`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (res && res.ok && res.status >= 200 && res.status < 300) {
          const ct = res.headers ? res.headers.get('content-type') || '' : '';
          if (ct.includes('application/json')) {
            const json = await res.json().catch(() => null);
            if (json && json.success) {
              serverData = json;
              break;
            }
          }
        }
      } catch (err) {}
    }

    if (!serverData) {
      isSwReconciling = false;
      return;
    }

    // 3. Ingest payments and recalculate all contract balances (including payments from other reps)
    const rawPayments = Array.isArray(serverData.payments) ? serverData.payments : (localSnapshot.payments || []);
    const rawContracts = Array.isArray(serverData.contracts) ? serverData.contracts : (localSnapshot.contracts || []);

    const deletedIds = new Set(Array.isArray(serverData.deletedRecordIds) ? serverData.deletedRecordIds : (localSnapshot.deletedIds || []));
    const activePayments = rawPayments.filter((p) => p && p.id && !deletedIds.has(String(p.id)));

    const paymentsByContractId = new Map();
    const paymentsByCustomerName = new Map();

    for (const p of activePayments) {
      const amt = Number(p.amountPaid ?? p.amount_paid ?? p.amount) || 0;
      if (amt <= 0 && !p.amountPaid && !p.amount_paid && !p.amount) continue;

      const cId = p.contractId ?? p.contract_id;
      if (cId) {
        const key = String(cId);
        const list = paymentsByContractId.get(key) || [];
        list.push(p);
        paymentsByContractId.set(key, list);
      }

      const cName = p.customerName ?? p.customer_name;
      if (cName && typeof cName === 'string') {
        const normKey = swNormName(cName);
        if (normKey) {
          const list = paymentsByCustomerName.get(normKey) || [];
          list.push(p);
          paymentsByCustomerName.set(normKey, list);
        }
      }
    }

    const recalculatedContracts = rawContracts.map((c) => {
      if (!c || !c.id) return c;

      const cPayments = [
        ...(paymentsByContractId.get(String(c.id)) || []),
        ...(c.customerName ? paymentsByCustomerName.get(swNormName(c.customerName)) || [] : []),
      ];

      const uniquePayments = Array.from(new Map(cPayments.map((p) => [String(p.id), p])).values());
      const totalPrice = Number(c.totalPrice ?? c.total_price) || 0;
      const advancePayment = Number(c.advancePayment ?? c.advance_payment) || 0;
      const netFinanced = Math.max(0, totalPrice - advancePayment);

      const serverPaid = Number(
        c.actual_total_paid !== undefined && c.actual_total_paid !== null
          ? c.actual_total_paid
          : (c.totalPaid ?? c.total_paid)
      ) || 0;

      const paymentsSum = uniquePayments.reduce(
        (acc, p) => acc + (Number(p.amountPaid ?? p.amount_paid ?? p.amount) || 0),
        0
      );

      const authoritativePaid = Math.max(paymentsSum, serverPaid);
      const remainingBalance = Math.max(0, netFinanced - authoritativePaid);
      const status = (remainingBalance === 0 && (netFinanced === 0 || authoritativePaid > 0)) ? 'completed' : 'active';

      let lastPaymentDate = c.lastPaymentDate ?? c.last_payment_date ?? null;
      if (uniquePayments.length > 0) {
        const sorted = [...uniquePayments].sort(
          (a, b) =>
            new Date(b.paymentDate || b.payment_date || b.createdAt || 0).getTime() -
            new Date(a.paymentDate || a.payment_date || a.createdAt || 0).getTime()
        );
        lastPaymentDate = sorted[0]?.paymentDate || sorted[0]?.payment_date || lastPaymentDate;
      }

      return {
        ...c,
        totalPaid: authoritativePaid,
        remainingBalance,
        status,
        lastPaymentDate,
      };
    });

    // 4. Save updated snapshot back to IndexedDB so it's ready when the app is opened
    const updatedSnapshot = {
      contracts: recalculatedContracts,
      payments: rawPayments,
      inventory: serverData.inventory || localSnapshot.inventory || [],
      reps: serverData.reps || localSnapshot.reps || [],
      funds: serverData.funds || localSnapshot.funds || [],
      customerLists: serverData.customerLists || localSnapshot.customerLists || [],
      employees: serverData.employees || localSnapshot.employees || [],
      fundTx: serverData.fundTransactions || localSnapshot.fundTx || [],
      empTx: serverData.employeeTransactions || localSnapshot.empTx || [],
      deletedIds: Array.from(deletedIds),
      timestamp: Date.now(),
    };

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: '__meta_local_snapshot__',
        type: '__META_CONFIG__',
        payload: updatedSnapshot,
        status: 'synced',
        timestamp: Date.now(),
      });
      await new Promise((r) => { tx.oncomplete = r; tx.onerror = r; });
    } catch (saveErr) {}

    // 5. Notify any connected clients to update their UI
    await notifyClientsToSync('BACKGROUND_DATA_UPDATED', { snapshot: updatedSnapshot });
  } catch (err) {
    console.warn('[Service Worker] Background reconciliation notice:', err);
  } finally {
    isSwReconciling = false;
  }
}

// Helper to notify all open windows/webviews
async function notifyClientsToSync(customType = 'TRIGGER_BACKGROUND_SYNC', extraData = {}) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients && clients.length > 0) {
      for (const client of clients) {
        client.postMessage({
          type: customType,
          timestamp: Date.now(),
          ...extraData,
        });
      }
    }
  } catch (e) {}
}

// Full background sync handler: flushes pending actions and reconciles all data
async function handleBackgroundSync() {
  await flushPendingActionsInBackground();
  await reconcileDatabaseInBackground();
  await notifyClientsToSync('TRIGGER_BACKGROUND_SYNC');
}

// Listen for Background Sync event from browser/OS (triggered even when app is closed)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Automatic Background Sync triggered by OS/Network:', event.tag);
  event.waitUntil(handleBackgroundSync());
});

// Listen for Periodic Background Sync
self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Periodic Background Sync triggered by OS:', event.tag);
  event.waitUntil(handleBackgroundSync());
});

// Receive messages from application or background triggers
self.addEventListener('message', (event) => {
  if (
    event.data &&
    (event.data.type === 'QUEUE_UPDATED' ||
      event.data.type === 'REGISTER_SYNC' ||
      event.data.type === 'NETWORK_ONLINE' ||
      event.data.type === 'FLUSH_QUEUE_IMMEDIATELY' ||
      event.data.type === 'RECONCILE_ON_CLOSE' ||
      event.data.type === 'BACKGROUND_RECONCILE_NOW')
  ) {
    if ('sync' in self.registration) {
      self.registration.sync.register(SYNC_TAG).catch(() => {});
      self.registration.sync.register(SYNC_TAG_FALLBACK).catch(() => {});
    }
    // Attempt immediate background flush and reconciliation
    handleBackgroundSync().catch(() => {});
  }

  // Handle explicit external notification requests from application
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const p = event.data.payload || {};
    const title = p.title || 'الكرار للتقسيط';
    const options = {
      body: p.body || '',
      icon: p.icon || '/pwa-192x192.png',
      badge: p.badge || '/favicon.png',
      tag: p.tag || `notif-${Date.now()}`,
      vibrate: p.vibrate || [200, 100, 200],
      data: p.data || {},
      renotify: true,
    };
    if (self.registration && typeof self.registration.showNotification === 'function') {
      self.registration.showNotification(title, options).catch((err) => {
        console.warn('[SW] showNotification error:', err);
      });
    }
  }
});

// Notification click listener: brings the window/tab to focus when clicked
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// BroadcastChannel listener for instant cross-tab & cross-context sync triggers
if (typeof BroadcastChannel !== 'undefined') {
  try {
    const swBroadcast = new BroadcastChannel('alkarrar_sync_channel');
    swBroadcast.onmessage = (event) => {
      if (
        event.data &&
        (event.data.type === 'QUEUE_UPDATED' ||
          event.data.type === 'TRIGGER_SYNC' ||
          event.data.type === 'NETWORK_ONLINE')
      ) {
        if ('sync' in self.registration) {
          self.registration.sync.register(SYNC_TAG).catch(() => {});
          self.registration.sync.register(SYNC_TAG_FALLBACK).catch(() => {});
        }
        handleBackgroundSync().catch(() => {});
      }
    };
  } catch (e) {}
}

// Clean periodic heartbeat in Service Worker (every 30s)
setInterval(() => {
  if (!isSwFlushing && !isSwReconciling) {
    handleBackgroundSync().catch(() => {});
  }
}, 30000);

// Map Tiles Offline Cache (tile.openstreetmap.org / cartocdn)
const MAP_TILES_CACHE_NAME = 'alkarrar-map-tiles-v1';
const OFFLINE_TILE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="%231e293b"/><path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256" stroke="%23334155" stroke-width="1"/><circle cx="128" cy="128" r="4" fill="%2364748b" opacity="0.4"/></svg>`;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if this request is a map tile request
  const isMapTile =
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('cartocdn.com') ||
    url.pathname.endsWith('.png') && (url.pathname.includes('/10/') || url.pathname.includes('/11/') || url.pathname.includes('/12/') || url.pathname.includes('/13/') || url.pathname.includes('/14/') || url.pathname.includes('/15/') || url.pathname.includes('/16/') || url.pathname.includes('/17/'));

  if (isMapTile) {
    event.respondWith(
      caches.open(MAP_TILES_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              cache.put(event.request, networkResponse.clone()).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback tile
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#1e293b"/><path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256" stroke="#334155" stroke-width="1"/><circle cx="128" cy="128" r="4" fill="#64748b" opacity="0.4"/></svg>',
              {
                headers: { 'Content-Type': 'image/svg+xml' },
              }
            );
          });
      })
    );
  }
});
