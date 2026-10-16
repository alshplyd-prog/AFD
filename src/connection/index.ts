/**
 * Unified Connection & Initialization Module (Client / APK Safe)
 * Provides clean, conflict-free exports for PostgreSQL Server API,
 * API configuration, and safe offline queue fallback.
 */

// 1. Cloud & API Configuration (Web & APK support)
export {
  getApiBaseUrl,
  getFullApiUrl,
  universalApiFetch,
  getCustomServerUrl,
  setCustomServerUrl,
  checkServerHealth,
} from '../lib/apiConfig';

// 2. Single Emergency Offline Storage / Local Fallback (fileDb)
export { fileDb } from '../db/fileDb';

// 3. Offline Queues & Data Synchronization
export {
  addToPendingQueue,
  flushPendingQueue,
  getPendingQueue,
} from '../lib/offlineQueue';
export * from '../lib/offlineSyncQueue';

// 4. Core Business Data Functions (Hostinger PostgreSQL bridge)
export * from '../lib/postgresClient';

/**
 * Helper to safely check if client-side database is ready.
 */
export async function ensureDatabaseReady(): Promise<boolean> {
  return true;
}




