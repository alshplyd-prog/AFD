import { openDB, IDBPDatabase } from 'idb';

// Service Worker Registration for Background Sync (WorkManager / Web BackgroundSync)
export function registerBackgroundSyncWorker(onTriggerSync?: () => void) {
  if ('serviceWorker' in navigator && typeof window !== 'undefined' && window.location.protocol !== 'file:') {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js').catch(() => null);
        if (!registration) return;
        console.log('ServiceWorker registered with scope:', registration.scope);

        // Register Background Sync if supported (WorkManager / Background Sync API)
        if ('sync' in registration) {
          try {
            await (registration as any).sync.register('postgres-background-sync');
            console.log('Background Sync registered successfully');
          } catch (syncErr) {
            console.log('Background Sync registration fallback:', syncErr);
          }
        }
      } catch (err) {
        console.warn('ServiceWorker registration failed:', err);
      }
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'TRIGGER_BACKGROUND_SYNC') {
        console.log('Received TRIGGER_BACKGROUND_SYNC from ServiceWorker');
        if (onTriggerSync) {
          onTriggerSync();
        }
      }
    });
  }
}

export interface QueuedOperation {
  id: string;
  type: 'ADD_SALE' | 'UPDATE_SALE' | 'DELETE_SALE' | 'ADD_PAYMENT' | 'DELETE_PAYMENT' | 'UPDATE_INVENTORY' | 'UPDATE_LIST';
  collectionName: string;
  payload: any;
  timestamp: number;
  attempts: number;
}

const DB_NAME = 'alkarrar_offline_sync_db';
const STORE_NAME = 'offline_queue';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getSyncDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueOfflineOp(op: Omit<QueuedOperation, 'id' | 'timestamp' | 'attempts'>) {
  try {
    const db = await getSyncDB();
    const queuedOp: QueuedOperation = {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      attempts: 0,
    };
    await db.put(STORE_NAME, queuedOp);

    // Notify Service Worker background sync if available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'QUEUE_UPDATED',
        op: queuedOp,
      });

      navigator.serviceWorker.ready.then((reg: any) => {
        if ('sync' in reg) {
          reg.sync.register('postgres-background-sync').catch(() => {});
        }
      });
    }

    return queuedOp.id;
  } catch (err) {
    console.error('Failed to enqueue offline operation:', err);
    return null;
  }
}

export async function getPendingOfflineOps(): Promise<QueuedOperation[]> {
  try {
    const db = await getSyncDB();
    return await db.getAll(STORE_NAME);
  } catch (err) {
    console.error('Failed to read pending offline ops:', err);
    return [];
  }
}

export async function removeOfflineOp(id: string) {
  try {
    const db = await getSyncDB();
    await db.delete(STORE_NAME, id);
  } catch (err) {
    console.error('Failed to delete offline op:', err);
  }
}

export async function clearAllOfflineOps() {
  try {
    const db = await getSyncDB();
    await db.clear(STORE_NAME);
  } catch (err) {
    console.error('Failed to clear offline queue:', err);
  }
}
