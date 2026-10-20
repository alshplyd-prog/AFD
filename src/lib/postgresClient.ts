// PostgreSQL client wrapper (With bulletproof offline cache & persistence for APK)
import { addToPendingQueue, removeFromPendingQueue, flushPendingQueue, getPendingQueueSync, onSyncSuccess, clearPendingQueue, clearPendingActionsByFilter, scheduleIdleVerification } from './offlineQueue';
import { getFullApiUrl, fetchWithFallback } from './apiConfig';
import {
  DEFAULT_REPS,
  INITIAL_FUNDS,
  INITIAL_CUSTOMER_LISTS,
  INITIAL_INVENTORY,
  INITIAL_EMPLOYEES,
  INITIAL_CONTRACTS,
} from '../data/initialContracts';
import { AppointmentRecord } from '../types';

export function generateUniqueId(prefix = 'pay') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`;
}

export const PAYMENT_CONFLICTS_COLLECTION = 'payment_conflicts';

export const auth = {
  currentUser: null,
};
export const googleAuthProvider = {};
export const db = {};

export const onAuthStateChanged = (_authObj: any, callback: (user: any) => void) => {
  callback(null);
  return () => {};
};

export const signInAnonymously = async (_authObj?: any) => {
  return { data: { user: null }, error: null };
};

export const signOut = async (_authObj?: any) => {
  return { error: null };
};

export const logoutUserAuth = async () => {
  return { error: null };
};

const refreshListeners: Set<() => void> = new Set();
let notifyTimeout: any = null;

function normName(s: string) {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function notifySubscribersRefresh() {
  if (notifyTimeout) clearTimeout(notifyTimeout);
  notifyTimeout = setTimeout(() => {
    refreshListeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        // ignore
      }
    });
  }, 120);
}

// Auto-trigger subscriber refresh whenever offline queue successfully flushes to server
try {
  onSyncSuccess(() => {
    notifySubscribersRefresh();
  });
} catch (e) {}

// Auto-clear old customer cache once to match current server state
try {
  if (typeof window !== 'undefined' && localStorage) {
    const CLEARED_KEY = 'alkarrar_cust_cleared_v5_empty';
    if (!localStorage.getItem(CLEARED_KEY)) {
      localStorage.removeItem('sami_cache_contracts');
      localStorage.removeItem('sami_cache_payments');
      localStorage.removeItem('sami_cache_installment_contracts');
      localStorage.removeItem('sami_cache_payment_conflicts');
      localStorage.removeItem('alkarrar_cache_contracts');
      localStorage.removeItem('alkarrar_cache_payments');
      localStorage.setItem('sami_cache_contracts', '[]');
      localStorage.setItem('sami_cache_payments', '[]');
      localStorage.setItem(CLEARED_KEY, 'true');
    }
  }
} catch (e) {}

// Helper to track and persist deleted record IDs locally to avoid resurrecting deleted entities
const DELETED_RECORD_IDS_KEY = 'sami_deleted_record_ids';

const PROTECTED_EMPLOYEE_IDS = new Set([
  'rep-1', 'rep-2', 'rep-emp-rep-1', 'rep-emp-rep-2',
  'rep-emp-rep_1786620296205_ae0e2', 'rep-emp-rep_1787351248238_bgr70',
  'rep-emp-rep_1787351289887_620kg', 'rep-emp-rep_1787351318939_bysbs',
  'rep-emp-rep_1787351361675_xp56x', 'rep-emp-rep_1787351151276_4k6lg'
]);

export function pruneDeletedIds(activeIds: string[]) {
  if (!Array.isArray(activeIds) || activeIds.length === 0) return;
  try {
    const raw = localStorage.getItem(DELETED_RECORD_IDS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return;
    const activeSet = new Set(activeIds.map(String));
    const filtered = arr.filter((id) => !activeSet.has(String(id)) && !PROTECTED_EMPLOYEE_IDS.has(String(id)));
    if (filtered.length !== arr.length) {
      localStorage.setItem(DELETED_RECORD_IDS_KEY, JSON.stringify(filtered));
    }
  } catch (e) {}
}

export function getDeletedRecordIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_RECORD_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const contracts = getLocalCache<any>('contracts') || [];
        const payments = getLocalCache<any>('payments') || [];
        const activeSet = new Set<string>();
        for (const c of contracts) if (c?.id) activeSet.add(String(c.id));
        for (const p of payments) if (p?.id) activeSet.add(String(p.id));

        return new Set(
          arr.filter((id) => Boolean(id) && !PROTECTED_EMPLOYEE_IDS.has(String(id)) && !activeSet.has(String(id)))
        );
      }
    }
  } catch (e) {}
  return new Set();
}

export function getSafeDeletedIds(): string[] {
  try {
    const deletedSet = getDeletedRecordIds();
    if (deletedSet.size === 0) return [];
    
    const contracts = getLocalCache<any>('contracts') || [];
    const payments = getLocalCache<any>('payments') || [];
    const installmentContracts = getLocalCache<any>('installment_contracts') || [];
    
    const activeIds = new Set<string>();
    for (const c of contracts) {
      if (c && c.id) activeIds.add(String(c.id));
    }
    for (const c of installmentContracts) {
      if (c && c.id) activeIds.add(String(c.id));
    }
    for (const p of payments) {
      if (p && p.id) activeIds.add(String(p.id));
    }
    
    const safeIds: string[] = [];
    for (const id of deletedSet) {
      if (id && !activeIds.has(String(id))) {
        safeIds.push(String(id));
      }
    }
    return safeIds;
  } catch (e) {
    return [];
  }
}

export function unmarkRecordAsDeleted(id: string | string[]) {
  if (!id) return;
  try {
    const set = getDeletedRecordIds();
    const ids = Array.isArray(id) ? id : [id];
    let changed = false;
    for (const d of ids) {
      if (d && typeof d === 'string' && set.has(d)) {
        set.delete(d);
        changed = true;
      }
    }
    if (changed) {
      const arr = Array.from(set);
      localStorage.setItem(DELETED_RECORD_IDS_KEY, JSON.stringify(arr));
    }
  } catch (e) {}
}

export function markRecordAsDeleted(id: string | string[], tableName?: string) {
  if (!id) return;
  try {
    const set = getDeletedRecordIds();
    const ids = Array.isArray(id) ? id : [id];
    let changed = false;
    const toDeleteSet = new Set<string>();
    for (const d of ids) {
      if (d && typeof d === 'string') {
        set.add(d);
        toDeleteSet.add(d);
        changed = true;
      }
    }
    if (changed) {
      const arr = Array.from(set).slice(-5000);
      localStorage.setItem(DELETED_RECORD_IDS_KEY, JSON.stringify(arr));

      // Instantly purge from client local memory & storage so deletions match 100% across devices
      if (tableName) {
        const cached = getLocalCache<any>(tableName);
        if (Array.isArray(cached) && cached.length > 0) {
          const filtered = cached.filter((item: any) => {
            if (!item || !item.id) return false;
            if (toDeleteSet.has(String(item.id))) return false;
            if (tableName === 'payments' && item.contractId && toDeleteSet.has(String(item.contractId))) return false;
            return true;
          });
          if (filtered.length !== cached.length) {
            setLocalCache(tableName, filtered);
            try {
              mirrorLocalSnapshotToIndexedDb().catch(() => {});
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('sami_data_updated', { detail: { type: 'DELETIONS_PURGED' } }));
              }
            } catch (e) {}
          }
        }
      }
    }
  } catch (e) {}
}

export function isRecordDeleted(id: string): boolean {
  if (!id) return false;
  if (id === 'rep-1') return false;
  return getDeletedRecordIds().has(id);
}

export function compareEntitiesByOrder(a: any, b: any): number {
  const oA = Number(a?.orderIndex ?? a?.order_index ?? 0);
  const oB = Number(b?.orderIndex ?? b?.order_index ?? 0);
  if (oA !== oB) return oA - oB;
  const timeA = String(a?.createdAt ?? a?.created_at ?? '');
  const timeB = String(b?.createdAt ?? b?.created_at ?? '');
  const tCmp = timeA.localeCompare(timeB);
  if (tCmp !== 0) return tCmp;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

// Helper to merge fresh remote server data with pending offline modifications and preserve local cache
function mergeRemoteWithPendingLocal<T extends { id?: string; name?: string }>(tableName: string, serverData: T[]): T[] {
  try {
    const pendingActions = getPendingQueueSync().filter(act => act.status !== 'synced');
    const existingLocal = getLocalCache<T>(tableName);
    const deletedSet = getDeletedRecordIds();
    
    // Identify IDs that are pending deletion or pending creation in the offline queue
    const pendingDeleteIds = new Set<string>();
    const pendingCreateIds = new Set<string>();
    for (const act of pendingActions) {
      if (act.type?.startsWith('DELETE_')) {
        const docId = typeof act.payload === 'string' ? act.payload : act.payload?.id;
        if (docId && docId !== 'rep-1') pendingDeleteIds.add(docId);
      } else if (act.type?.startsWith('CREATE_') || act.type === 'ADD_PAYMENT') {
        const docId = act.payload?.id;
        if (docId) pendingCreateIds.add(docId);
      }
    }
    
    const map = new Map<string, any>();
    const hasServerData = Array.isArray(serverData);

    if (hasServerData) {
      // 1. Authoritative remote server data directly from PostgreSQL
      const unmarkIds: string[] = [];
      for (const item of serverData) {
        if (item && item.id) {
          // If the record exists on the PostgreSQL server, it is authoritative unless pending local offline deletion
          if (item.id === 'rep-1' || !pendingDeleteIds.has(item.id)) {
            map.set(item.id, item);
            if (deletedSet.has(item.id)) {
              unmarkIds.push(item.id);
            }
          }
        }
      }
      if (unmarkIds.length > 0) {
        unmarkRecordAsDeleted(unmarkIds);
      }

      // 2. Preserve genuine pending local items (created offline awaiting upload)
      if (Array.isArray(existingLocal)) {
        for (const item of existingLocal) {
          if (item && item.id && (item.id === 'rep-1' || (!pendingDeleteIds.has(item.id) && !deletedSet.has(item.id)))) {
            if (pendingCreateIds.has(item.id) && !map.has(item.id)) {
              // Valid pending offline item waiting to sync to server
              map.set(item.id, item);
            }
          }
        }
      }
    } else {
      // Fallback only if serverData failed to load (offline / network error)
      if (Array.isArray(existingLocal)) {
        for (const item of existingLocal) {
          if (item && item.id && (item.id === 'rep-1' || (!pendingDeleteIds.has(item.id) && !deletedSet.has(item.id)))) {
            map.set(item.id, item);
          }
        }
      }
    }

    if (tableName === 'reps') {
      // Ensure rep-1 is ALWAYS present in reps
      const hasDhia = Array.from(map.values()).some((r: any) => r.id === 'rep-1' || (r.name && r.name.includes('ضياء')));
      if (!hasDhia) {
        map.set('rep-1', {
          id: 'rep-1',
          name: 'ضياء المحاسب',
          phone: '07801112233',
          code: '4444',
          role: 'admin',
          canEdit: true,
          canDelete: true,
          canMoveCustomer: true,
          canSell: true,
          allowedListIds: ['all']
        });
      }
    }

    // Apply un-synced pending offline actions on top (new offline additions or edits)
    for (const act of pendingActions) {
      const { type, payload } = act;
      if (!payload) continue;
      const docId = typeof payload === 'string' ? payload : payload.id;

      if (type.startsWith('DELETE_') && docId) {
        map.delete(docId);
        continue;
      }

      if (tableName === 'contracts' && (type === 'CREATE_CONTRACT' || type === 'UPDATE_CONTRACT')) {
        const cName = (payload.customerName || payload.customer_name || '').trim();
        const pId = String(payload.id || '');
        if (pId && cName && !pId.startsWith('pay_') && !pId.startsWith('fund_') && !pId.startsWith('emp_') && !pId.startsWith('item_') && !pId.startsWith('ft_') && !pId.startsWith('emptx_') && !pId.startsWith('conflict_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'payments' && (type === 'CREATE_PAYMENT' || type === 'UPDATE_PAYMENT')) {
        const pId = String(payload.id || '');
        const amt = Number(payload.amountPaid ?? payload.amount_paid ?? payload.amount) || 0;
        if (pId && amt > 0 && !pId.startsWith('contract_') && !pId.startsWith('emp_') && !pId.startsWith('item_') && !pId.startsWith('fund_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'inventory' && (type === 'CREATE_INVENTORY' || type === 'UPDATE_INVENTORY')) {
        const pId = String(payload.id || '');
        const iName = (payload.name || '').trim();
        if (pId && iName && !pId.startsWith('emp_') && !pId.startsWith('pay_') && !pId.startsWith('contract_') && !pId.startsWith('ft_') && !pId.startsWith('emptx_') && !pId.startsWith('fund_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'reps' && (type === 'CREATE_REP' || type === 'UPDATE_REP')) {
        const pId = String(payload.id || '');
        const rName = (payload.name || '').trim();
        if (pId && rName && !pId.startsWith('pay_') && !pId.startsWith('contract_') && !pId.startsWith('item_') && !pId.startsWith('fund_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'funds' && (type === 'CREATE_FUND' || type === 'UPDATE_FUND')) {
        const pId = String(payload.id || '');
        const fName = (payload.name || '').trim();
        if (pId && fName && !pId.startsWith('pay_') && !pId.startsWith('contract_') && !pId.startsWith('emp_') && !pId.startsWith('item_') && !pId.startsWith('ft_') && !pId.startsWith('emptx_') && !pId.startsWith('conflict_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'funds' && type === 'REORDER_FUNDS' && Array.isArray(payload?.orderedIds)) {
        payload.orderedIds.forEach((id: string, idx: number) => {
          const item = map.get(id);
          if (item) {
            map.set(id, { ...item, orderIndex: idx, order_index: idx });
          }
        });
      } else if (tableName === 'customer_lists' && (type === 'CREATE_CUSTOMER_LIST' || type === 'UPDATE_CUSTOMER_LIST')) {
        const pId = String(payload.id || '');
        if (pId && !pId.startsWith('pay_') && !pId.startsWith('contract_') && !pId.startsWith('emp_') && !pId.startsWith('item_') && !pId.startsWith('fundtx_')) {
          const existing = map.get(pId) || {};
          const tpl = payload.receiptTemplate || payload.receipt_template || existing.receiptTemplate || existing.receipt_template || 'template_1';
          const mergedItem = {
            ...existing,
            ...payload,
            receiptTemplate: tpl,
            receipt_template: tpl,
          };
          const effectiveName = (mergedItem.name || '').trim();
          if (effectiveName && effectiveName !== 'قائمة بدون اسم') {
            map.set(pId, mergedItem);
          }
        }
      } else if (tableName === 'customer_lists' && type === 'REORDER_CUSTOMER_LISTS' && Array.isArray(payload?.orderedIds)) {
        payload.orderedIds.forEach((id: string, idx: number) => {
          const item = map.get(id);
          if (item) {
            map.set(id, { ...item, orderIndex: idx, order_index: idx });
          }
        });
      } else if (tableName === 'fund_transactions' && (type === 'CREATE_FUND_TRANSACTION' || type === 'UPDATE_FUND_TRANSACTION' || type === 'CREATE_FUND_TX' || type === 'UPDATE_FUND_TX')) {
        if (payload.id) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'employees' && (type === 'CREATE_EMPLOYEE' || type === 'UPDATE_EMPLOYEE')) {
        const pId = String(payload.id || '');
        const eName = (payload.name || '').trim();
        if (pId && eName && !pId.startsWith('pay_') && !pId.startsWith('contract_') && !pId.startsWith('item_') && !pId.startsWith('fund_')) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'employee_transactions' && (type === 'CREATE_EMPLOYEE_TRANSACTION' || type === 'UPDATE_EMPLOYEE_TRANSACTION' || type === 'CREATE_EMPLOYEE_TX' || type === 'UPDATE_EMPLOYEE_TX')) {
        if (payload.id) {
          const existing = map.get(payload.id) || {};
          map.set(payload.id, { ...existing, ...payload });
        }
      } else if (tableName === 'payment_conflicts' && (type === 'CREATE_PAYMENT_CONFLICT' || type === 'RESOLVE_PAYMENT_CONFLICT' || type === 'REJECT_PAYMENT_CONFLICT')) {
        if (type === 'CREATE_PAYMENT_CONFLICT' && payload.id) {
          map.set(payload.id, payload);
        }
      }
      // Strictly NO fallback else block: never cross-insert actions into unrelated tables!
    }

    let items = (Array.from(map.values()) as any[]).filter((item: any) => item && item.id && !pendingDeleteIds.has(item.id));

    if (tableName === 'funds') {
      items = items.filter((f: any) => 
        f && f.id && typeof f.name === 'string' && f.name.trim().length > 0 &&
        !String(f.id).startsWith('pay_') && !String(f.id).startsWith('contract_') && !String(f.id).startsWith('emp_') && !String(f.id).startsWith('item_') && !String(f.id).startsWith('ft_') && !String(f.id).startsWith('emptx_') && !String(f.id).startsWith('conflict_')
      );
      items.sort(compareEntitiesByOrder);
      return items as unknown as T[];
    }

    if (tableName === 'customer_lists') {
      items = items.filter((l: any) => 
        l && l.id && typeof l.name === 'string' && l.name.trim().length > 0 && l.name.trim() !== 'قائمة بدون اسم' &&
        !String(l.id).startsWith('pay_') && !String(l.id).startsWith('contract_') && !String(l.id).startsWith('emp_') && !String(l.id).startsWith('item_') && !String(l.id).startsWith('fundtx_')
      );
      items.sort(compareEntitiesByOrder);
      return items as unknown as T[];
    }

    if (tableName === 'contracts') {
      items = items.filter((c: any) => 
        c && c.id && ((c.customerName && c.customerName.trim().length > 0) || (c.customer_name && c.customer_name.trim().length > 0)) &&
        !String(c.id).startsWith('pay_') && !String(c.id).startsWith('fund_') && !String(c.id).startsWith('emp_') && !String(c.id).startsWith('item_') && !String(c.id).startsWith('ft_') && !String(c.id).startsWith('emptx_') && !String(c.id).startsWith('conflict_')
      );
      const allPayments = getLocalCache<any>('payments');
      const recalculated = recalculateAllContractsFromPayments(items, allPayments, false);
      recalculated.sort((a: any, b: any) => new Date(a.createdAt || a.created_at || 0).getTime() - new Date(b.createdAt || b.created_at || 0).getTime());
      return recalculated as unknown as T[];
    }

    if (tableName === 'payments') {
      items = items.filter((p: any) => 
        p && p.id && (Number(p.amountPaid ?? p.amount) > 0) &&
        !String(p.id).startsWith('contract_') && !String(p.id).startsWith('emp_') && !String(p.id).startsWith('item_') && !String(p.id).startsWith('fund_')
      );
      items.sort((a: any, b: any) => {
        const dateA = new Date(a.paymentDate || a.payment_date || a.createdAt || 0).getTime();
        const dateB = new Date(b.paymentDate || b.payment_date || b.createdAt || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
      // Proactively update contract balances with the newly merged payments (including those from other reps)
      try {
        setTimeout(() => {
          recalculateAllContractsFromPayments(undefined, items, true);
        }, 10);
      } catch (e) {}
      return items as unknown as T[];
    }

    return items;
  } catch (e) {
    console.warn(`[mergeRemoteWithPendingLocal] Error merging table ${tableName}:`, e);
    const currentLocal = getLocalCache<T>(tableName);
    return currentLocal.length > 0 ? currentLocal : serverData;
  }
}

/**
 * Authoritative recalculation of totalPaid (الواصل), remainingBalance (الباقي), status, and lastPaymentDate
 * for contracts based on all payments in the system (including payments from other representatives).
 */
export function recalculateAllContractsFromPayments(
  contractsInput?: any[],
  paymentsInput?: any[],
  persistToCache = true
): any[] {
  try {
    const contracts = contractsInput ? [...contractsInput] : getLocalCache<any>('contracts');
    const payments = paymentsInput ? [...paymentsInput] : getLocalCache<any>('payments');
    if (!Array.isArray(contracts) || contracts.length === 0) {
      return [];
    }

    const deletedIds = getDeletedRecordIds();
    const activePayments = Array.isArray(payments)
      ? payments.filter((p: any) => p && p.id && !deletedIds.has(String(p.id)))
      : [];

    const paymentsByContractId = new Map<string, any[]>();
    const paymentsByCustomerName = new Map<string, any[]>();

    for (const p of activePayments) {
      const amt = Number(p.amountPaid ?? p.amount_paid ?? p.amount) || 0;
      if (amt <= 0) continue;

      const cId = p.contractId ?? p.contract_id;
      if (cId) {
        const key = String(cId);
        const list = paymentsByContractId.get(key) || [];
        list.push(p);
        paymentsByContractId.set(key, list);
      }

      const cName = p.customerName ?? p.customer_name;
      if (cName && typeof cName === 'string') {
        const normKey = normName(cName);
        if (normKey) {
          const list = paymentsByCustomerName.get(normKey) || [];
          list.push(p);
          paymentsByCustomerName.set(normKey, list);
        }
      }
    }

    let modifiedCount = 0;
    const updatedContracts = contracts.map((c: any) => {
      if (!c || !c.id) return c;

      const cPayments: any[] = [
        ...(paymentsByContractId.get(String(c.id)) || []),
        ...(c.customerName ? paymentsByCustomerName.get(normName(c.customerName)) || [] : []),
      ];

      // De-duplicate payments by id
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

      // Authoritative total paid: calculated directly from active payments
      const rawAuthoritativePaid = paymentsSum;
      const authoritativePaid = netFinanced > 0 ? Math.min(netFinanced, rawAuthoritativePaid) : rawAuthoritativePaid;
      const excessAmount = Math.max(0, rawAuthoritativePaid - netFinanced);
      // The authoritative remaining balance (الباقي)
      const remainingBalance = Math.max(0, netFinanced - rawAuthoritativePaid);
      const status = (remainingBalance === 0 && (netFinanced === 0 || rawAuthoritativePaid > 0)) ? 'completed' : 'active';

      let lastPaymentDate = c.lastPaymentDate ?? c.last_payment_date ?? null;
      if (uniquePayments.length > 0) {
        const sorted = [...uniquePayments].sort(
          (a, b) =>
            new Date(b.paymentDate || b.payment_date || b.createdAt || 0).getTime() -
            new Date(a.paymentDate || a.payment_date || a.createdAt || 0).getTime()
        );
        lastPaymentDate = sorted[0]?.paymentDate || sorted[0]?.payment_date || lastPaymentDate;
      }

      const completedAt = status === 'completed' ? (c.completedAt || c.completed_at || new Date().toISOString()) : null;

      if (
        c.totalPaid !== authoritativePaid ||
        c.remainingBalance !== remainingBalance ||
        c.status !== status ||
        c.lastPaymentDate !== lastPaymentDate ||
        c.completedAt !== completedAt
      ) {
        modifiedCount++;
      }

      return {
        ...c,
        totalPaid: authoritativePaid,
        excessAmount,
        rawTotalPaid: rawAuthoritativePaid,
        remainingBalance,
        status,
        lastPaymentDate,
        completedAt,
      };
    });

    if (persistToCache && modifiedCount > 0) {
      try {
        localStorage.setItem(`sami_cache_contracts`, JSON.stringify(updatedContracts));
        mirrorLocalSnapshotToIndexedDb(false);
      } catch (e) {}
    }

    return updatedContracts;
  } catch (err) {
    console.warn('[recalculateAllContractsFromPayments] Error:', err);
    return contractsInput || [];
  }
}

// Local Cache Helpers to guarantee immediate persistence in Android APK & Offline Mode
export function getLocalCache<T>(tableName: string): T[] {
  try {
    const raw = localStorage.getItem(`sami_cache_${tableName}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

let mirrorDbDebounceTimer: any = null;

export async function mirrorLocalSnapshotToIndexedDb(immediate = false): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  const performMirror = async () => {
    try {
      const rawContracts = getLocalCache<any>('contracts');
      const payments = getLocalCache<any>('payments');
      const contracts = recalculateAllContractsFromPayments(rawContracts, payments, false);
      const inventory = getLocalCache<any>('inventory');
      const reps = getLocalCache<any>('reps');
      const funds = getLocalCache<any>('funds');
      const customerLists = getLocalCache<any>('customer_lists');
      const employees = getLocalCache<any>('employees');
      const fundTx = getLocalCache<any>('fund_transactions');
      const empTx = getLocalCache<any>('employee_transactions');
      const deletedIds = getLocalCache<string>('deleted_record_ids');

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('alkarrar_sync_db', 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      if (db.objectStoreNames.contains('pending_actions')) {
        const tx = db.transaction('pending_actions', 'readwrite');
        const store = tx.objectStore('pending_actions');
        store.put({
          id: '__meta_local_snapshot__',
          type: '__META_CONFIG__',
          payload: {
            contracts,
            payments,
            inventory,
            reps,
            funds,
            customerLists,
            employees,
            fundTx,
            empTx,
            deletedIds,
            timestamp: Date.now(),
          },
          status: 'synced',
          timestamp: Date.now(),
        });
        await new Promise((resolve) => {
          tx.oncomplete = resolve;
          tx.onerror = resolve;
        });
      }
    } catch (err) {
      // ignore non-blocking
    }
  };

  if (immediate) {
    if (mirrorDbDebounceTimer) clearTimeout(mirrorDbDebounceTimer);
    return performMirror();
  }

  if (mirrorDbDebounceTimer) clearTimeout(mirrorDbDebounceTimer);
  mirrorDbDebounceTimer = setTimeout(() => {
    performMirror().catch(() => {});
  }, 400);
}

/**
 * Persists current sales rep to IndexedDB so the Service Worker can access it when the app is closed
 */
export async function saveCurrentRepToIndexedDb(rep: any): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('alkarrar_sync_db', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (db.objectStoreNames.contains('pending_actions')) {
      const tx = db.transaction('pending_actions', 'readwrite');
      const store = tx.objectStore('pending_actions');
      store.put({
        id: '__meta_current_rep__',
        type: '__META_CONFIG__',
        payload: rep || null,
        status: 'synced',
        timestamp: Date.now(),
      });
      await new Promise((r) => {
        tx.oncomplete = r;
        tx.onerror = r;
      });
    }
  } catch (e) {}
}

/**
 * Loads snapshot from IndexedDB into localStorage safely without overwriting pending local modifications
 */
export async function loadSnapshotFromIndexedDbIfAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('alkarrar_sync_db', 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (!db.objectStoreNames.contains('pending_actions')) return false;

    const item = await new Promise<any>((resolve) => {
      const tx = db.transaction('pending_actions', 'readonly');
      const store = tx.objectStore('pending_actions');
      const req = store.get('__meta_local_snapshot__');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    const snapshot = item?.payload || item?.snapshot;
    if (snapshot && typeof snapshot === 'object') {
      if (Array.isArray(snapshot.payments)) {
        const merged = mergeRemoteWithPendingLocal('payments', snapshot.payments);
        setLocalCache('payments', merged);
      }
      if (Array.isArray(snapshot.contracts)) {
        const merged = mergeRemoteWithPendingLocal('contracts', snapshot.contracts);
        const currentPayments = getLocalCache<any>('payments');
        const recalculated = recalculateAllContractsFromPayments(merged, currentPayments, false);
        setLocalCache('contracts', recalculated);
      }
      if (Array.isArray(snapshot.inventory)) setLocalCache('inventory', mergeRemoteWithPendingLocal('inventory', snapshot.inventory));
      if (Array.isArray(snapshot.reps)) setLocalCache('reps', mergeRemoteWithPendingLocal('reps', snapshot.reps));
      if (Array.isArray(snapshot.funds)) setLocalCache('funds', mergeRemoteWithPendingLocal('funds', snapshot.funds));
      if (Array.isArray(snapshot.customerLists)) setLocalCache('customer_lists', mergeRemoteWithPendingLocal('customer_lists', snapshot.customerLists));
      if (Array.isArray(snapshot.employees)) setLocalCache('employees', mergeRemoteWithPendingLocal('employees', snapshot.employees));
      if (Array.isArray(snapshot.fundTx)) setLocalCache('fund_transactions', mergeRemoteWithPendingLocal('fund_transactions', snapshot.fundTx));
      if (Array.isArray(snapshot.empTx)) setLocalCache('employee_transactions', mergeRemoteWithPendingLocal('employee_transactions', snapshot.empTx));

      notifySubscribersRefresh();
      return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Audits all local payments and guarantees any unsynced offline payment is in the pending queue
 */
export async function auditAndRequeueUnsyncedPayments(): Promise<number> {
  try {
    const localPayments = getLocalCache<any>('payments');
    if (!Array.isArray(localPayments) || localPayments.length === 0) return 0;

    const pendingQueue = getPendingQueueSync();
    const queuedIds = new Set(
      pendingQueue
        .filter((act) => act.type === 'CREATE_PAYMENT' || act.type === 'RECORD_PAYMENT' || act.type === 'UPDATE_PAYMENT')
        .map((act) => act.payload?.id || (typeof act.payload === 'string' ? act.payload : null))
        .filter(Boolean)
    );

    const deletedSet = getDeletedRecordIds();
    let count = 0;

    for (const payment of localPayments) {
      if (!payment || !payment.id) continue;
      if (deletedSet.has(payment.id)) continue;
      if (queuedIds.has(payment.id)) continue;

      // Only requeue payments that are genuinely unsynced or explicitly pending
      if (payment._unsynced === true || payment._syncStatus === 'pending') {
        await addToPendingQueue('CREATE_PAYMENT', payment);
        count++;
      }
    }

    return count;
  } catch (e) {
    return 0;
  }
}

// Auto-check on initialization
if (typeof window !== 'undefined') {
  setTimeout(() => {
    loadSnapshotFromIndexedDbIfAvailable().catch(() => {});
  }, 100);
}

export function setLocalCache<T>(tableName: string, data: T[]) {
  try {
    let cleanData = data;
    if (Array.isArray(data) && tableName === 'contracts') {
      cleanData = (data as any[]).filter((c: any) => 
        c && c.id && ((c.customerName && c.customerName.trim().length > 0) || (c.customer_name && c.customer_name.trim().length > 0)) &&
        !String(c.id).startsWith('pay_') && !String(c.id).startsWith('fund_') && !String(c.id).startsWith('emp_') && !String(c.id).startsWith('item_') && !String(c.id).startsWith('ft_') && !String(c.id).startsWith('emptx_') && !String(c.id).startsWith('conflict_')
      ) as any;
    }
    if (Array.isArray(data) && tableName === 'funds') {
      cleanData = (data as any[]).filter((f: any) => 
        f && f.id && typeof f.name === 'string' && f.name.trim().length > 0 &&
        !String(f.id).startsWith('pay_') && !String(f.id).startsWith('contract_') && !String(f.id).startsWith('emp_') && !String(f.id).startsWith('item_') && !String(f.id).startsWith('ft_') && !String(f.id).startsWith('emptx_') && !String(f.id).startsWith('conflict_')
      ) as any;
    }
    if (Array.isArray(data) && tableName === 'customer_lists') {
      cleanData = (data as any[]).filter((l: any) => 
        l && l.id && typeof l.name === 'string' && l.name.trim().length > 0 && l.name.trim() !== 'قائمة بدون اسم' &&
        !String(l.id).startsWith('pay_') && !String(l.id).startsWith('contract_') && !String(l.id).startsWith('emp_') && !String(l.id).startsWith('item_') && !String(l.id).startsWith('fundtx_')
      ) as any;
    }
    if (Array.isArray(data) && tableName === 'inventory') {
      cleanData = (data as any[]).filter((i: any) => 
        i && i.id && (i.id.startsWith('item_') || (!i.id.startsWith('emp_') && !i.id.startsWith('pay_') && !i.id.startsWith('contract_') && !i.id.startsWith('ft_') && !i.id.startsWith('emptx_') && !i.id.startsWith('conflict_') && !i.id.startsWith('fund_')))
      ) as any;
    }
    if (Array.isArray(data) && tableName === 'payments') {
      cleanData = (data as any[]).filter((p: any) => 
        p && p.id && (Number(p.amountPaid ?? p.amount) > 0) && !String(p.id).startsWith('contract_') && !String(p.id).startsWith('emp_') && !String(p.id).startsWith('item_') && !String(p.id).startsWith('fund_')
      ) as any;
    }
    if (Array.isArray(data) && (tableName === 'funds' || tableName === 'customer_lists' || tableName === 'reps' || tableName === 'employees')) {
      const seenNames = new Set<string>();
      const seenIds = new Set<string>();
      const deduplicated: T[] = [];
      for (const item of cleanData as any[]) {
        if (!item || !item.id) continue;
        if (seenIds.has(item.id)) continue;
        const normalized = normName(item.name || '');
        if (normalized) {
          if (seenNames.has(normalized)) continue;
          seenNames.add(normalized);
        }
        seenIds.add(item.id);
        deduplicated.push(item);
      }
      if (tableName === 'funds' || tableName === 'customer_lists') {
        deduplicated.sort(compareEntitiesByOrder);
      }
      cleanData = deduplicated;
    }
    localStorage.setItem(`sami_cache_${tableName}`, JSON.stringify(cleanData));
    mirrorLocalSnapshotToIndexedDb(false);
  } catch (e) {}
}

export function updateLocalCacheItem<T extends { id: string }>(tableName: string, item: T) {
  if (tableName === 'contracts' && item && item.id && (
    String(item.id).startsWith('pay_') || String(item.id).startsWith('fund_') || String(item.id).startsWith('emp_') || String(item.id).startsWith('item_') || String(item.id).startsWith('ft_') || String(item.id).startsWith('emptx_') || String(item.id).startsWith('conflict_') ||
    !((item as any).customerName?.trim() || (item as any).customer_name?.trim())
  )) {
    return;
  }
  if (tableName === 'funds' && item && item.id && (
    String(item.id).startsWith('pay_') || String(item.id).startsWith('contract_') || String(item.id).startsWith('emp_') || String(item.id).startsWith('item_') || String(item.id).startsWith('ft_') || String(item.id).startsWith('emptx_') || String(item.id).startsWith('conflict_') ||
    !(item as any).name?.trim()
  )) {
    return;
  }
  if (tableName === 'customer_lists' && item && item.id && (
    String(item.id).startsWith('pay_') || String(item.id).startsWith('contract_') || String(item.id).startsWith('emp_') || String(item.id).startsWith('item_') || String(item.id).startsWith('fundtx_') ||
    !(item as any).name?.trim() || (item as any).name?.trim() === 'قائمة بدون اسم'
  )) {
    return;
  }
  if (tableName === 'inventory' && item && item.id && (String(item.id).startsWith('emp_') || String(item.id).startsWith('pay_') || String(item.id).startsWith('contract_') || String(item.id).startsWith('fund_') || String(item.id).startsWith('ft_') || String(item.id).startsWith('emptx_') || String(item.id).startsWith('conflict_'))) {
    return;
  }
  if (tableName === 'payments' && item && item.id && (Number((item as any).amountPaid ?? (item as any).amount) <= 0 || String(item.id).startsWith('contract_') || String(item.id).startsWith('emp_') || String(item.id).startsWith('item_') || String(item.id).startsWith('fund_'))) {
    return;
  }
  const current = getLocalCache<T>(tableName);
  const idx = current.findIndex((x) => x.id === item.id);
  let updated: T[];
  if (idx >= 0) {
    updated = current.map((x, i) => (i === idx ? { ...x, ...item } : x));
  } else {
    // Append to the end to keep existing ordering fixed and never displace existing items
    updated = [...current, item];
  }
  if (tableName === 'funds' || tableName === 'customer_lists') {
    updated.sort((a: any, b: any) => {
      const orderA = a.orderIndex !== undefined ? Number(a.orderIndex) : (a.order_index !== undefined ? Number(a.order_index) : 999999);
      const orderB = b.orderIndex !== undefined ? Number(b.orderIndex) : (b.order_index !== undefined ? Number(b.order_index) : 999999);
      if (orderA !== orderB) return orderA - orderB;
      const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
      const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
  }
  setLocalCache(tableName, updated);
  notifySubscribersRefresh();
}

export function removeLocalCacheItem<T extends { id: string }>(tableName: string, id: string) {
  const current = getLocalCache<T>(tableName);
  const filtered = current.filter((x) => x.id !== id);
  setLocalCache(tableName, filtered);
  notifySubscribersRefresh();
}

// Column mappers to convert PostgreSQL snake_case rows to App frontend camelCase objects
function mapRow(tableName: string, r: any): any {
  if (!r || typeof r !== 'object') return r;
  
  if (tableName === 'contracts') {
    const totalPrice = Number(r.total_price ?? r.totalPrice) || 0;
    const advancePayment = Number(r.advance_payment ?? r.advancePayment) || 0;
    const actualPaid = Number(r.actual_total_paid);
    const storedPaid = Number(r.total_paid ?? r.totalPaid) || 0;
    const rawTotalPaid = (r.actual_total_paid !== undefined && r.actual_total_paid !== null && !isNaN(actualPaid)) ? actualPaid : storedPaid;
    const netFinanced = Math.max(0, totalPrice - advancePayment);
    const totalPaid = netFinanced > 0 ? Math.min(netFinanced, rawTotalPaid) : rawTotalPaid;
    const excessAmount = Math.max(0, rawTotalPaid - netFinanced);
    const remainingBalance = Math.max(0, netFinanced - rawTotalPaid);
    const status = (remainingBalance === 0 && (netFinanced === 0 || rawTotalPaid > 0)) ? 'completed' : 'active';
    const lastPaymentDate = r.actual_last_payment_date !== undefined ? r.actual_last_payment_date : (r.last_payment_date ?? r.lastPaymentDate ?? null);

    return {
      id: r.id,
      customerName: r.customer_name ?? r.customerName ?? '',
      customerPhone: r.customer_phone ?? r.customerPhone ?? '',
      customerAddress: r.customer_address ?? r.customerAddress ?? '',
      itemId: r.item_id ?? r.itemId ?? null,
      itemName: r.item_name ?? r.itemName ?? '',
      itemQuantity: Number(r.item_quantity ?? r.itemQuantity) || 1,
      purchasePrice: Number(r.purchase_price ?? r.purchasePrice) || 0,
      listId: r.list_id ?? r.listId ?? null,
      listName: r.list_name ?? r.listName ?? null,
      totalPrice,
      advancePayment,
      remainingBalance,
      dailyInstallment: Number(r.daily_installment ?? r.dailyInstallment) || 0,
      startDate: r.start_date ?? r.startDate ?? '',
      notes: r.notes ?? '',
      status,
      lastPaymentDate,
      totalPaid,
      excessAmount,
      rawTotalPaid,
      repName: r.rep_name ?? r.repName ?? '',
      latitude: r.latitude != null ? Number(r.latitude) : (r.lat != null ? Number(r.lat) : undefined),
      longitude: r.longitude != null ? Number(r.longitude) : (r.lng != null ? Number(r.lng) : undefined),
      locationAddress: r.location_address ?? r.locationAddress ?? '',
      locationUpdatedAt: r.location_updated_at ?? r.locationUpdatedAt ?? undefined,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
      completedAt: r.completed_at ?? r.completedAt ?? null,
      updatedAt: r.updated_at ?? r.updatedAt ?? null,
      isEdited: Boolean(r.is_edited ?? r.isEdited)
    };
  }

  if (tableName === 'inventory') {
    return {
      id: r.id,
      name: r.name ?? '',
      price: Number(r.price) || 0,
      purchasePrice: Number(r.purchase_price ?? r.purchasePrice) || 0,
      quantity: Number(r.quantity) || 0,
      dailyInstallment: Number(r.daily_installment ?? r.dailyInstallment) || 0,
      category: r.category ?? '',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'payments') {
    const amt = Number(r.amountPaid ?? r.amount_paid ?? r.amount) || 0;
    let custName = r.customer_name ?? r.customerName ?? r.resolved_customer_name ?? '';
    if (!custName && (r.contract_id || r.contractId)) {
      const contracts = getLocalCache<any>('contracts');
      const c = contracts.find((ct: any) => ct.id === (r.contract_id || r.contractId));
      if (c?.customerName) custName = c.customerName;
    }
    return {
      id: r.id,
      contractId: r.contract_id ?? r.contractId ?? '',
      customerName: custName,
      amountPaid: amt,
      paymentDate: r.payment_date ?? r.paymentDate ?? '',
      repName: r.rep_name ?? r.repName ?? '',
      note: r.note ?? '',
      fundId: r.fund_id ?? r.fundId ?? null,
      totalPaidSnapshot: r.total_paid_snapshot !== undefined && r.total_paid_snapshot !== null ? Number(r.total_paid_snapshot) : undefined,
      remainingBalanceSnapshot: r.remaining_balance_snapshot !== undefined && r.remaining_balance_snapshot !== null ? Number(r.remaining_balance_snapshot) : undefined,
      updatedAt: r.updated_at ?? r.updatedAt ?? null,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
      isEdited: Boolean(r.is_edited ?? r.isEdited)
    };
  }

  if (tableName === 'reps') {
    let allowed = r.allowed_list_ids ?? r.allowedListIds;
    if (typeof allowed === 'string') {
      try { allowed = JSON.parse(allowed); } catch (e) { allowed = ['all']; }
    }
    if (!Array.isArray(allowed)) allowed = ['all'];
    const isDhia = Boolean(r.name && (r.name.includes('ضياء') || r.id === 'rep-1'));
    return {
      id: r.id,
      name: r.name ?? '',
      phone: r.phone ?? '',
      code: r.code ?? '',
      role: isDhia ? 'admin' : (r.role ?? 'rep'),
      canEdit: isDhia ? true : (r.can_edit !== false && r.canEdit !== false),
      canDelete: isDhia ? true : Boolean(r.can_delete ?? r.canDelete),
      canMoveCustomer: isDhia ? true : (r.can_move_customer !== false && r.canMoveCustomer !== false),
      canSell: isDhia ? true : (r.can_sell !== false && r.canSell !== false),
      allowedListIds: isDhia ? ['all'] : allowed,
    };
  }

  if (tableName === 'funds') {
    return {
      id: r.id,
      name: r.name ?? '',
      balance: Number(r.balance) || 0,
      description: r.description ?? '',
      orderIndex: Number(r.order_index ?? r.orderIndex ?? 0),
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'customer_lists') {
    return {
      id: r.id,
      name: r.name ?? '',
      fundId: r.fund_id ?? r.fundId ?? '',
      description: r.description ?? '',
      orderIndex: Number(r.order_index ?? r.orderIndex ?? 0),
      receiptTemplate: r.receipt_template ?? r.receiptTemplate ?? 'template_1',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'fund_transactions') {
    return {
      id: r.id,
      fundId: r.fund_id ?? r.fundId ?? '',
      targetFundId: r.target_fund_id ?? r.targetFundId ?? null,
      type: r.type ?? 'deposit',
      amount: Number(r.amount) || 0,
      note: r.note ?? '',
      repName: r.rep_name ?? r.repName ?? '',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'employees') {
    return {
      id: r.id,
      name: r.name ?? '',
      phone: r.phone ?? '',
      jobTitle: r.job_title ?? r.jobTitle ?? '',
      position: r.position ?? '',
      salary: Number(r.salary) || 0,
      debtBalance: Number(r.debt_balance ?? r.debtBalance) || 0,
      totalDebt: Number(r.total_debt ?? r.totalDebt) || 0,
      isRep: Boolean(r.is_rep ?? r.isRep),
      repId: r.rep_id ?? r.repId ?? null,
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'employee_transactions') {
    return {
      id: r.id,
      employeeId: r.employee_id ?? r.employeeId ?? '',
      fundId: r.fund_id ?? r.fundId ?? '',
      type: r.type ?? 'debt',
      amount: Number(r.amount) || 0,
      notes: r.notes ?? '',
      repName: r.rep_name ?? r.repName ?? '',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
    };
  }

  if (tableName === 'payment_conflicts') {
    return {
      id: r.id,
      contractId: r.contract_id ?? r.contractId ?? '',
      customerName: r.customer_name ?? r.customerName ?? '',
      attemptedAmount: Number(r.attempted_amount ?? r.attemptedAmount) || 0,
      actualRemainingBalance: Number(r.actual_remaining_balance ?? r.actualRemainingBalance) || 0,
      excessAmount: Number(r.excess_amount ?? r.excessAmount) || 0,
      repName: r.rep_name ?? r.repName ?? '',
      note: r.note ?? '',
      paymentDate: r.payment_date ?? r.paymentDate ?? '',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
      status: r.status ?? 'pending_review'
    };
  }

  if (tableName === 'appointments') {
    return {
      id: r.id,
      contractId: r.contract_id ?? r.contractId ?? '',
      customerName: r.customer_name ?? r.customerName ?? '',
      customerPhone: r.customer_phone ?? r.customerPhone ?? '',
      customerAddress: r.customer_address ?? r.customerAddress ?? '',
      listId: r.list_id ?? r.listId ?? '',
      listName: r.list_name ?? r.listName ?? '',
      appointmentType: r.appointment_type ?? r.appointmentType ?? 'specific_date',
      recurringDay: r.recurring_day != null ? Number(r.recurring_day) : (r.recurringDay != null ? Number(r.recurringDay) : undefined),
      recurringDayName: r.recurring_day_name ?? r.recurringDayName ?? '',
      recurringDayOfMonth: r.recurring_day_of_month != null ? Number(r.recurring_day_of_month) : (r.recurringDayOfMonth != null ? Number(r.recurringDayOfMonth) : undefined),
      recurringMonthDayName: r.recurring_month_day_name ?? r.recurringMonthDayName ?? '',
      appointmentDate: r.appointment_date ?? r.appointmentDate ?? '',
      appointmentTime: r.appointment_time ?? r.appointmentTime ?? '',
      dueDate: r.due_date ?? r.dueDate ?? '',
      dueTime: r.due_time ?? r.dueTime ?? '',
      title: r.title ?? '',
      notes: r.notes ?? r.note ?? '',
      note: r.note ?? r.notes ?? '',
      status: r.status ?? 'pending',
      createdByName: r.created_by_name ?? r.createdByName ?? '',
      createdByRepName: r.created_by_rep_name ?? r.createdByRepName ?? '',
      createdByRepId: r.created_by_rep_id ?? r.createdByRepId ?? '',
      createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    };
  }

  return r;
}

// Convert camelCase object to PostgreSQL snake_case table columns
export function toDbRow(tableName: string, data: any): any {
  if (!data || typeof data !== 'object') return data;
  const row: any = { ...data };
  const nowIso = new Date().toISOString();

  if (tableName === 'contracts' || tableName === 'sales') {
    if (data.customerName !== undefined || data.customer_name !== undefined) row.customer_name = data.customerName ?? data.customer_name;
    if (data.customerPhone !== undefined || data.customer_phone !== undefined) row.customer_phone = data.customerPhone ?? data.customer_phone;
    if (data.customerAddress !== undefined || data.customer_address !== undefined) row.customer_address = data.customerAddress ?? data.customer_address;
    if (data.itemId !== undefined || data.item_id !== undefined) row.item_id = data.itemId ?? data.item_id;
    if (data.itemName !== undefined || data.item_name !== undefined) row.item_name = data.itemName ?? data.item_name;
    if (data.itemQuantity !== undefined || data.item_quantity !== undefined) row.item_quantity = Number(data.itemQuantity ?? data.item_quantity) || 1;
    if (data.purchasePrice !== undefined || data.purchase_price !== undefined) row.purchase_price = Number(data.purchasePrice ?? data.purchase_price) || 0;
    if (data.listId !== undefined || data.list_id !== undefined) row.list_id = data.listId ?? data.list_id;
    if (data.listName !== undefined || data.list_name !== undefined) row.list_name = data.listName ?? data.list_name;
    if (data.totalPrice !== undefined || data.total_price !== undefined) row.total_price = Number(data.totalPrice ?? data.total_price) || 0;
    if (data.advancePayment !== undefined || data.advance_payment !== undefined) row.advance_payment = Number(data.advancePayment ?? data.advance_payment) || 0;
    if (data.remainingBalance !== undefined || data.remaining_balance !== undefined) row.remaining_balance = Number(data.remainingBalance ?? data.remaining_balance) || 0;
    if (data.dailyInstallment !== undefined || data.daily_installment !== undefined) row.daily_installment = Number(data.dailyInstallment ?? data.daily_installment) || 0;
    if (data.startDate !== undefined || data.start_date !== undefined) row.start_date = data.startDate ?? data.start_date;
    if (data.lastPaymentDate !== undefined || data.last_payment_date !== undefined) row.last_payment_date = data.lastPaymentDate ?? data.last_payment_date;
    if (data.totalPaid !== undefined || data.total_paid !== undefined) row.total_paid = Number(data.totalPaid ?? data.total_paid) || 0;
    if (data.repName !== undefined || data.rep_name !== undefined) row.rep_name = data.repName ?? data.rep_name;
    row.created_at = data.createdAt || data.created_at || nowIso;
    if (data.completedAt !== undefined || data.completed_at !== undefined) row.completed_at = data.completedAt ?? data.completed_at;
    if (data.updatedAt !== undefined || data.updated_at !== undefined) row.updated_at = data.updatedAt ?? data.updated_at;
    if (data.isEdited !== undefined || data.is_edited !== undefined) row.is_edited = data.isEdited ?? data.is_edited;
    if (data.latitude !== undefined) row.latitude = data.latitude != null ? Number(data.latitude) : null;
    if (data.longitude !== undefined) row.longitude = data.longitude != null ? Number(data.longitude) : null;
    if (data.locationAddress !== undefined || data.location_address !== undefined) row.location_address = data.locationAddress ?? data.location_address;
    if (data.locationUpdatedAt !== undefined || data.location_updated_at !== undefined) row.location_updated_at = data.locationUpdatedAt ?? data.location_updated_at;

    delete row.customerName;
    delete row.customerPhone;
    delete row.customerAddress;
    delete row.itemId;
    delete row.itemName;
    delete row.itemQuantity;
    delete row.purchasePrice;
    delete row.listId;
    delete row.listName;
    delete row.totalPrice;
    delete row.advancePayment;
    delete row.remainingBalance;
    delete row.dailyInstallment;
    delete row.startDate;
    delete row.lastPaymentDate;
    delete row.totalPaid;
    delete row.repName;
    delete row.createdAt;
    delete row.completedAt;
    delete row.updatedAt;
    delete row.isEdited;
  }

  if (tableName === 'payments') {
    if (data.contractId !== undefined || data.contract_id !== undefined) row.contract_id = data.contractId ?? data.contract_id;
    if (data.customerName !== undefined || data.customer_name !== undefined) row.customer_name = data.customerName ?? data.customer_name;
    const payAmt = Number(data.amountPaid ?? data.amount_paid ?? data.amount) || 0;
    row.amount = payAmt;
    row.amount_paid = payAmt;
    if (data.paymentDate !== undefined || data.payment_date !== undefined) row.payment_date = data.paymentDate ?? data.payment_date;
    if (data.repName !== undefined || data.rep_name !== undefined) row.rep_name = data.repName ?? data.rep_name;
    if (data.fundId !== undefined || data.fund_id !== undefined) row.fund_id = data.fundId ?? data.fund_id;
    if (data.totalPaidSnapshot !== undefined || data.total_paid_snapshot !== undefined) row.total_paid_snapshot = data.totalPaidSnapshot ?? data.total_paid_snapshot;
    if (data.remainingBalanceSnapshot !== undefined || data.remaining_balance_snapshot !== undefined) row.remaining_balance_snapshot = data.remainingBalanceSnapshot ?? data.remaining_balance_snapshot;
    if (data.updatedAt !== undefined || data.updated_at !== undefined) row.updated_at = data.updatedAt ?? data.updated_at;
    row.created_at = data.createdAt || data.created_at || nowIso;
    if (data.isEdited !== undefined || data.is_edited !== undefined) row.is_edited = data.isEdited ?? data.is_edited;

    delete row.contractId;
    delete row.customerName;
    delete row.amountPaid;
    delete row.paymentDate;
    delete row.repName;
    delete row.fundId;
    delete row.totalPaidSnapshot;
    delete row.remainingBalanceSnapshot;
    delete row.updatedAt;
    delete row.createdAt;
    delete row.isEdited;
  }

  if (tableName === 'inventory' || tableName === 'inventory_items') {
    if (data.purchasePrice !== undefined || data.purchase_price !== undefined) row.purchase_price = Number(data.purchasePrice ?? data.purchase_price) || 0;
    if (data.dailyInstallment !== undefined || data.daily_installment !== undefined) row.daily_installment = Number(data.dailyInstallment ?? data.daily_installment) || 0;
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.purchasePrice;
    delete row.dailyInstallment;
    delete row.createdAt;
  }

  if (tableName === 'funds' || tableName === 'cash_funds') {
    if (data.orderIndex !== undefined || data.order_index !== undefined) {
      row.order_index = Number(data.orderIndex ?? data.order_index);
      delete row.orderIndex;
    }
  }

  if (tableName === 'customer_lists') {
    if (data.fundId !== undefined) row.fund_id = data.fundId;
    if (data.orderIndex !== undefined || data.order_index !== undefined) {
      row.order_index = Number(data.orderIndex ?? data.order_index);
      delete row.orderIndex;
    }
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.fundId;
    delete row.createdAt;
  }

  if (tableName === 'reps') {
    if (Array.isArray(data.allowedListIds)) row.allowed_list_ids = JSON.stringify(data.allowedListIds);
    if (data.canEdit !== undefined) row.can_edit = data.canEdit;
    if (data.canDelete !== undefined) row.can_delete = data.canDelete;
    if (data.canMoveCustomer !== undefined) row.can_move_customer = data.canMoveCustomer;
    if (data.canSell !== undefined) row.can_sell = data.canSell;
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.allowedListIds;
    delete row.canEdit;
    delete row.canDelete;
    delete row.canMoveCustomer;
    delete row.canSell;
    delete row.createdAt;
  }

  if (tableName === 'fund_transactions') {
    if (data.fundId !== undefined) row.fund_id = data.fundId;
    if (data.targetFundId !== undefined) row.target_fund_id = data.targetFundId;
    if (data.repName !== undefined) row.rep_name = data.repName;
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.fundId;
    delete row.targetFundId;
    delete row.repName;
    delete row.createdAt;
  }

  if (tableName === 'employees') {
    if (data.jobTitle !== undefined) row.job_title = data.jobTitle;
    if (data.debtBalance !== undefined) row.debt_balance = data.debtBalance;
    if (data.totalDebt !== undefined) row.total_debt = data.totalDebt;
    if (data.isRep !== undefined) row.is_rep = data.isRep;
    if (data.repId !== undefined) row.rep_id = data.repId;
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.jobTitle;
    delete row.debtBalance;
    delete row.totalDebt;
    delete row.isRep;
    delete row.repId;
    delete row.createdAt;
  }

  if (tableName === 'employee_transactions') {
    if (data.employeeId !== undefined) row.employee_id = data.employeeId;
    if (data.fundId !== undefined) row.fund_id = data.fundId;
    if (data.repName !== undefined) row.rep_name = data.repName;
    row.created_at = data.createdAt || data.created_at || nowIso;

    delete row.employeeId;
    delete row.fundId;
    delete row.repName;
    delete row.createdAt;
  }

  return row;
}

// Helper for backend REST API PostgreSQL database mutations
async function saveToPostgres(endpoint: string, method: string = 'POST', data?: any, pendingActionRef?: string | Promise<any>) {
  try {
    // 1. Primary: Server API route call (PostgreSQL database)
    const res = await fetchWithFallback(`/api/${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      keepalive: true,
    }, 8000).catch(() => null);

    // 2. Table resolution and verification
    const rawTable = endpoint.split('/')[0].replace('-', '_');
    const tableName = rawTable === 'funds' ? 'cash_funds' : rawTable === 'inventory' ? 'inventory_items' : rawTable;
    const docId = endpoint.split('/')[1] || data?.id;
    const dbPayload = data ? toDbRow(rawTable, data) : undefined;

    let writeSucceeded = false;
    const ct = res?.headers?.get('content-type') || '';
    if (res && res.ok && res.status >= 200 && res.status < 300 && !ct.includes('text/html')) {
      writeSucceeded = true;
    }

    // Primary REST call status check

    if (writeSucceeded && pendingActionRef) {
      if (typeof pendingActionRef === 'string') {
        removeFromPendingQueue(pendingActionRef).catch(() => {});
      } else if (typeof pendingActionRef.then === 'function') {
        pendingActionRef.then((act) => {
          if (act?.id) removeFromPendingQueue(act.id).catch(() => {});
        }).catch(() => {});
      }
    }

    if (res && res.ok) {
      return await res.json().catch(() => ({}));
    }
  } catch (e) {
    console.warn(`Database write notice for ${endpoint}:`, e);
  } finally {
    notifySubscribersRefresh();
  }
}

// Module-level cached server sync version to avoid redundant heavy downloads
let cachedServerSyncVersion: number | string | null = null;

export function resetServerSyncVersionCache() {
  cachedServerSyncVersion = null;
}

// Reconcile and audit all client local datasets against PostgreSQL to ensure 0 missing records
export async function reconcileAllLocalWithDatabase(options?: {
  force?: boolean;
  forcePushAll?: boolean;
}): Promise<{ success: boolean; totalInserted: number; message: string }> {
  try {
    // Skip non-forced reconciliation if user is currently typing in an input/textarea/select
    if (!options?.force && typeof document !== 'undefined' && document.activeElement) {
      const tag = (document.activeElement.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.hasAttribute('contenteditable')) {
        return { success: true, totalInserted: 0, message: 'مؤجل أثناء الكتابة' };
      }
    }

    // 0. Audit local cache and ensure any offline payments are queued
    try {
      await auditAndRequeueUnsyncedPayments();
    } catch (e) {}

    // 1. Flush any pending offline queue first
    try {
      await flushPendingQueue();
    } catch (e) {}

    // 1.2. Lightweight version check: ONLY if not forced
    if (!options?.force) {
      try {
        const vRes = await fetchWithFallback('/api/sync/version', undefined, 4000).catch(() => null);
        if (vRes && vRes.ok) {
          const vData = await vRes.json().catch(() => null);
          if (vData && vData.syncVersion !== undefined) {
            if (cachedServerSyncVersion !== null && String(vData.syncVersion) === String(cachedServerSyncVersion)) {
              // Version is completely identical — server hasn't changed. Return instantly!
              return { success: true, totalInserted: 0, message: 'البيانات مطابقة تماماً' };
            }
            cachedServerSyncVersion = vData.syncVersion;
          }
        }
      } catch (verErr) {}
    }

    // 1.5. Push entire local cache whenever force is true or forcePushAll is true
    // This ensures that when the user clicks 'Sync' or does a reconciliation, the server
    // database (contracts, payments, customers, etc.) is directly updated with local records!
    if (options?.force || options?.forcePushAll) {
      try {
        const localContracts = getLocalCache<any>('contracts');
        const localPayments = getLocalCache<any>('payments');
        const localInventory = getLocalCache<any>('inventory');
        const localReps = getLocalCache<any>('reps');
        const localFunds = getLocalCache<any>('funds');
        const localCustomerLists = getLocalCache<any>('customer_lists');
        const localEmployees = getLocalCache<any>('employees');
        const localFundTx = getLocalCache<any>('fund_transactions');
        const localEmpTx = getLocalCache<any>('employee_transactions');
        const localAppointments = getLocalCache<any>('appointments');
        const deletedIds = getSafeDeletedIds();

        if (localContracts.length > 0 || localPayments.length > 0 || localAppointments.length > 0) {
          await fetchWithFallback(
            '/api/sync/reconcile',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contracts: localContracts,
                payments: localPayments,
                inventory: localInventory,
                reps: localReps,
                funds: localFunds,
                customer_lists: localCustomerLists,
                employees: localEmployees,
                fund_transactions: localFundTx,
                employee_transactions: localEmpTx,
                appointments: localAppointments,
                deletedIds,
              }),
            },
            20000
          ).catch(() => {});
        }
      } catch (pushErr) {
        console.warn('Reconcile local push warning:', pushErr);
      }
    }

    // 2. Fetch atomic full snapshot from server with robust timeout
    const res = await fetchWithFallback('/api/sync/all', undefined, 25000).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        // Sync deleted IDs
        if (Array.isArray(data.deletedRecordIds)) {
          markRecordAsDeleted(data.deletedRecordIds);
        }

        // Apply authoritative datasets from server cleanly
        // 1. Process payments first so incoming payments from other reps are saved
        if (Array.isArray(data.payments)) {
          const mergedPayments = mergeRemoteWithPendingLocal('payments', data.payments);
          setLocalCache('payments', mergedPayments);
        }

        // 2. Process contracts and recalculate totalPaid (الواصل) and remainingBalance (الباقي)
        if (Array.isArray(data.contracts)) {
          const mergedContracts = mergeRemoteWithPendingLocal('contracts', data.contracts);
          const currentPayments = getLocalCache<any>('payments');
          const recalculated = recalculateAllContractsFromPayments(mergedContracts, currentPayments, false);
          setLocalCache('contracts', recalculated);
        } else {
          recalculateAllContractsFromPayments(undefined, undefined, true);
        }

        if (Array.isArray(data.inventory)) {
          setLocalCache('inventory', mergeRemoteWithPendingLocal('inventory', data.inventory));
        }
        if (Array.isArray(data.reps)) {
          setLocalCache('reps', mergeRemoteWithPendingLocal('reps', data.reps));
        }
        if (Array.isArray(data.funds)) {
          setLocalCache('funds', mergeRemoteWithPendingLocal('funds', data.funds));
        }
        if (Array.isArray(data.customerLists)) {
          setLocalCache('customer_lists', mergeRemoteWithPendingLocal('customer_lists', data.customerLists));
        }
        if (Array.isArray(data.employees)) {
          setLocalCache('employees', mergeRemoteWithPendingLocal('employees', data.employees));
        }
        if (Array.isArray(data.fundTransactions)) {
          setLocalCache('fund_transactions', mergeRemoteWithPendingLocal('fund_transactions', data.fundTransactions));
        }
        if (Array.isArray(data.employeeTransactions)) {
          setLocalCache('employee_transactions', mergeRemoteWithPendingLocal('employee_transactions', data.employeeTransactions));
        }
        if (Array.isArray(data.paymentConflicts)) {
          setLocalCache('payment_conflicts', mergeRemoteWithPendingLocal('payment_conflicts', data.paymentConflicts));
        }
        if (Array.isArray(data.appointments)) {
          setLocalCache('appointments', mergeRemoteWithPendingLocal('appointments', data.appointments));
        }

        mirrorLocalSnapshotToIndexedDb(true);
        notifySubscribersRefresh();
        const cCount = data.contracts?.length || 0;
        const pCount = data.payments?.length || 0;
        return {
          success: true,
          totalInserted: cCount + pCount,
          message: `تمت المطابقة الشاملة بنجاح (${cCount} عقد، ${pCount} دفعة)`,
        };
      }
    }

    // Fallback: Individual endpoint refresh
    const refreshed = await forceRefreshAllDataFromPostgres();
    if (refreshed) {
      const cCount = getLocalCache('contracts').length;
      const pCount = getLocalCache('payments').length;
      return {
        success: true,
        totalInserted: cCount + pCount,
        message: `تمت المطابقة والتحديث بنجاح (${cCount} عقد، ${pCount} دفعة)`,
      };
    }

    // Check if local cache has data to provide reassuring status
    const cCount = getLocalCache('contracts').length;
    const pCount = getLocalCache('payments').length;
    return {
      success: false,
      totalInserted: 0,
      message: 'تعذر الاتصال بالسيرفر للمطابقة حالياً (البيانات محفوظة ومحمية محلياً وسيتم استئناف المزامنة فور توفر الاتصال)',
    };
  } catch (e: any) {
    return { success: false, totalInserted: 0, message: e.message || 'خطأ أثناء المطابقة' };
  }
}

/**
 * Automatically audits and verifies that all application records match the PostgreSQL server.
 * If any records are missing on the server, it immediately uploads them.
 */
export async function verifyAndReconcileWithServer(): Promise<{
  matched: boolean;
  totalMissing: number;
  confirmedContracts: number;
  confirmedPayments: number;
  message: string;
}> {
  try {
    const localContracts = getLocalCache<any>('contracts');
    const localPayments = getLocalCache<any>('payments');
    const localInventory = getLocalCache<any>('inventory');
    const localReps = getLocalCache<any>('reps');
    const localFunds = getLocalCache<any>('funds');
    const localCustomerLists = getLocalCache<any>('customer_lists');
    const localEmployees = getLocalCache<any>('employees');
    const deletedSet = getDeletedRecordIds();

    const contractIds = localContracts.map((c: any) => String(c.id)).filter((id) => id && !deletedSet.has(id));
    const paymentIds = localPayments.map((p: any) => String(p.id)).filter((id) => id && !deletedSet.has(id));
    const inventoryIds = localInventory.map((i: any) => String(i.id)).filter((id) => id && !deletedSet.has(id));
    const repIds = localReps.map((r: any) => String(r.id)).filter((id) => id && !deletedSet.has(id));
    const fundIds = localFunds.map((f: any) => String(f.id)).filter((id) => id && !deletedSet.has(id));
    const customerListIds = localCustomerLists.map((cl: any) => String(cl.id)).filter((id) => id && !deletedSet.has(id));
    const employeeIds = localEmployees.map((e: any) => String(e.id)).filter((id) => id && !deletedSet.has(id));

    const response = await fetchWithFallback(
      '/api/sync/verify-match',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractIds,
          paymentIds,
          inventoryIds,
          repIds,
          fundIds,
          customerListIds,
          employeeIds,
        }),
      },
      15000
    ).catch(() => null);

    if (!response || !response.ok) {
      return {
        matched: false,
        totalMissing: -1,
        confirmedContracts: 0,
        confirmedPayments: 0,
        message: 'فشل الاتصال بنقطة التحقق من المطابقة',
      };
    }

    const resData = await response.json().catch(() => null);
    if (!resData) {
      return {
        matched: false,
        totalMissing: -1,
        confirmedContracts: 0,
        confirmedPayments: 0,
        message: 'استجابة غير صالحة من السيرفر',
      };
    }

    // Process deleted records reported by the server to guarantee 100% bi-directional deletion parity
    if (Array.isArray(resData.deletedRecordIds) && resData.deletedRecordIds.length > 0) {
      markRecordAsDeleted(resData.deletedRecordIds);
    }

    if (resData.matched) {
      console.log(
        `[Auto Match Verification] 100% matched with PostgreSQL! (${resData.confirmedContractCount} contracts, ${resData.confirmedPaymentCount} payments)`
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sync:verified-matched', {
            detail: {
              matched: true,
              totalMissing: 0,
              confirmedContractCount: resData.confirmedContractCount,
              confirmedPaymentCount: resData.confirmedPaymentCount,
              timestamp: Date.now(),
            },
          })
        );
      }
      return {
        matched: true,
        totalMissing: 0,
        confirmedContracts: resData.confirmedContractCount,
        confirmedPayments: resData.confirmedPaymentCount,
        message: 'جميع البيانات مطابقة 100% مع السيرفر',
      };
    }

    // Discrepancy found! Immediately upload missing records to the server
    console.warn(
      `[Auto Match Verification] Discrepancy detected: ${resData.totalMissing} records missing on server! Uploading missing data immediately...`
    );

    const missingContractSet = new Set<string>(resData.missingContractIds || []);
    const missingPaymentSet = new Set<string>(resData.missingPaymentIds || []);
    const missingInventorySet = new Set<string>(resData.missingInventoryIds || []);
    const missingRepSet = new Set<string>(resData.missingRepIds || []);
    const missingFundSet = new Set<string>(resData.missingFundIds || []);
    const missingCustomerListSet = new Set<string>(resData.missingCustomerListIds || []);
    const missingEmployeeSet = new Set<string>(resData.missingEmployeeIds || []);

    const missingContracts = localContracts.filter((c: any) => missingContractSet.has(String(c.id)));
    const missingPayments = localPayments.filter((p: any) => missingPaymentSet.has(String(p.id)));
    const missingInventory = localInventory.filter((i: any) => missingInventorySet.has(String(i.id)));
    const missingReps = localReps.filter((r: any) => missingRepSet.has(String(r.id)));
    const missingFunds = localFunds.filter((f: any) => missingFundSet.has(String(f.id)));
    const missingCustomerLists = localCustomerLists.filter((cl: any) => missingCustomerListSet.has(String(cl.id)));
    const missingEmployees = localEmployees.filter((e: any) => missingEmployeeSet.has(String(e.id)));

    await fetchWithFallback(
      '/api/sync/reconcile',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contracts: missingContracts,
          payments: missingPayments,
          inventory: missingInventory,
          reps: missingReps,
          funds: missingFunds,
          customer_lists: missingCustomerLists,
          employees: missingEmployees,
          deletedIds: getSafeDeletedIds(),
        }),
      },
      25000
    ).catch(() => {});

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('sync:verified-matched', {
          detail: {
            matched: false,
            totalMissing: resData.totalMissing,
            reconciledNow: resData.totalMissing,
            timestamp: Date.now(),
          },
        })
      );
    }

    return {
      matched: false,
      totalMissing: resData.totalMissing,
      confirmedContracts: resData.confirmedContractCount || 0,
      confirmedPayments: resData.confirmedPaymentCount || 0,
      message: `تم رفع ${resData.totalMissing} سجل غير مطابق`,
    };
  } catch (err: any) {
    console.warn('[Auto Match Verification] Error:', err);
    return {
      matched: false,
      totalMissing: -1,
      confirmedContracts: 0,
      confirmedPayments: 0,
      message: err.message || 'خطأ أثناء التحقق من المطابقة',
    };
  }
}

/**
 * Continuous Verification & Reconciliation Loop:
 * Whenever data is uploaded, immediately queries the server, uploads any remaining data,
 * and then re-queries in a loop until 100% full match confirmation is reached.
 */
export async function verifyAndReconcileUntilMatched(maxRetries = 1): Promise<{
  matched: boolean;
  attempts: number;
  totalMissing: number;
  confirmedContracts: number;
  confirmedPayments: number;
}> {
  let attempt = 0;
  let lastResult: any = { matched: false, totalMissing: -1, confirmedContracts: 0, confirmedPayments: 0 };

  while (attempt < maxRetries) {
    attempt++;
    lastResult = await verifyAndReconcileWithServer();
    
    if (lastResult.matched) {
      return {
        matched: true,
        attempts: attempt,
        totalMissing: 0,
        confirmedContracts: lastResult.confirmedContracts,
        confirmedPayments: lastResult.confirmedPayments,
      };
    }

    if (lastResult.totalMissing > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } else {
      break;
    }
  }

  return {
    matched: lastResult.matched,
    attempts: attempt,
    totalMissing: lastResult.totalMissing,
    confirmedContracts: lastResult.confirmedContracts,
    confirmedPayments: lastResult.confirmedPayments,
  };
}

// Centralized, unified polling coordinator to eliminate multiple duplicate HTTP poll loops and maximize sync speed
let activeSubscriberCount = 0;
let unifiedPollingTimer: any = null;
let unifiedDebounceTimer: any = null;

export function triggerImmediateDataSync() {
  if (unifiedDebounceTimer) clearTimeout(unifiedDebounceTimer);
  reconcileAllLocalWithDatabase({ force: true }).catch(() => {});
}

function scheduleUnifiedDataSync(delayMs = 50) {
  if (unifiedDebounceTimer) clearTimeout(unifiedDebounceTimer);
  unifiedDebounceTimer = setTimeout(() => {
    reconcileAllLocalWithDatabase().catch(() => {});
  }, delayMs);
}

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000; // 5 days in ms
export const LAST_5DAY_PRUNE_POLL_KEY = 'alkarrar_last_5day_prune_poll';

/**
 * Prunes payments older than 1 year (365 days) from local cache (localStorage/IndexedDB) ONLY.
 * Kept strictly intact on PostgreSQL database and server files.
 * Pending offline payments are protected and never discarded.
 */
export function prunePaymentsOlderThanOneYearFromLocalCache(): {
  prunedCount: number;
  remainingCount: number;
  cutoffDate: string;
} {
  try {
    const rawPayments = getLocalCache<any>('payments');
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoffDate = oneYearAgo.toISOString().split('T')[0];

    if (!Array.isArray(rawPayments) || rawPayments.length === 0) {
      return { prunedCount: 0, remainingCount: 0, cutoffDate };
    }

    // Pending offline payments must NEVER be pruned
    const pendingIds = new Set<string>();
    try {
      const qRaw = localStorage.getItem('sami_pending_queue') || '[]';
      const q = JSON.parse(qRaw);
      if (Array.isArray(q)) {
        for (const item of q) {
          if (item?.payload?.id) pendingIds.add(String(item.payload.id));
        }
      }
    } catch (e) {}

    const kept: any[] = [];
    let prunedCount = 0;

    for (const p of rawPayments) {
      if (!p || !p.id) continue;
      if (pendingIds.has(String(p.id))) {
        kept.push(p);
        continue;
      }
      const pDate = p.paymentDate || (p.createdAt ? String(p.createdAt).split('T')[0] : '');
      if (pDate && pDate < cutoffDate) {
        prunedCount++;
      } else {
        kept.push(p);
      }
    }

    if (prunedCount > 0) {
      setLocalCache('payments', kept);
      mirrorLocalSnapshotToIndexedDb(true).catch(() => {});
      console.log(`[5-Day Pruning] Pruned ${prunedCount} payments older than 1 year from local cache. Kept ${kept.length} payments.`);
    }

    return { prunedCount, remainingCount: kept.length, cutoffDate };
  } catch (err) {
    console.warn('Error in prunePaymentsOlderThanOneYearFromLocalCache:', err);
    return { prunedCount: 0, remainingCount: 0, cutoffDate: '' };
  }
}

/**
 * Runs the 5-day cycle for automatic cleanup of payments older than 1 year and periodic polling.
 * If force=true or if 5 days have elapsed since last check, runs pruning & background reconcile.
 */
export async function run5DayPruneAndPollingInspection(force = false): Promise<{
  executed: boolean;
  prunedCount: number;
  remainingCount: number;
  lastRun: number;
  nextRun: number;
}> {
  try {
    const lastRun = Number(localStorage.getItem(LAST_5DAY_PRUNE_POLL_KEY) || 0);
    const now = Date.now();
    const shouldRun = force || !lastRun || now - lastRun >= FIVE_DAYS_MS;

    if (!shouldRun) {
      return {
        executed: false,
        prunedCount: 0,
        remainingCount: getLocalCache('payments').length,
        lastRun,
        nextRun: lastRun + FIVE_DAYS_MS,
      };
    }

    const pruneRes = prunePaymentsOlderThanOneYearFromLocalCache();
    localStorage.setItem(LAST_5DAY_PRUNE_POLL_KEY, String(now));

    // Run clean reconciliation check
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      await reconcileAllLocalWithDatabase({ force: false }).catch(() => {});
    }

    return {
      executed: true,
      prunedCount: pruneRes.prunedCount,
      remainingCount: pruneRes.remainingCount,
      lastRun: now,
      nextRun: now + FIVE_DAYS_MS,
    };
  } catch (err) {
    console.warn('run5DayPruneAndPollingInspection error:', err);
    return {
      executed: false,
      prunedCount: 0,
      remainingCount: 0,
      lastRun: 0,
      nextRun: 0,
    };
  }
}

export function get5DayPruneAndPollStatus() {
  const lastRun = Number(localStorage.getItem(LAST_5DAY_PRUNE_POLL_KEY) || 0);
  const now = Date.now();
  const nextRun = lastRun ? lastRun + FIVE_DAYS_MS : now;
  const isDue = !lastRun || now >= nextRun;
  const daysRemaining = Math.max(0, Math.ceil((nextRun - now) / (24 * 60 * 60 * 1000)));

  return {
    lastRun,
    nextRun,
    isDue,
    daysRemaining: isDue ? 0 : daysRemaining,
    cycleDays: 5,
  };
}

function startUnifiedPollingLoop() {
  if (unifiedPollingTimer) return;
  // Background version poller runs smoothly every 60s
  // Skips execution if user is editing in inputs or has modal open
  unifiedPollingTimer = setInterval(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    
    // Check if user is typing
    if (typeof document !== 'undefined' && document.activeElement) {
      const tag = (document.activeElement.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement.hasAttribute('contenteditable')) {
        return;
      }
    }

    // Skip disruptive background polling if user has an interactive modal open (e.g. Payments History, Statements)
    if (typeof document !== 'undefined') {
      const hasOpenModal = Boolean(
        document.querySelector('[role="dialog"]') ||
        document.querySelector('.fixed.inset-0.z-50')
      );
      if (hasOpenModal) {
        return;
      }
    }

    // Check 5-day automatic prune & polling interval
    run5DayPruneAndPollingInspection(false).catch(() => {});

    if (activeSubscriberCount > 0) {
      reconcileAllLocalWithDatabase().catch(() => {});
    }
  }, 60000);
}

function stopUnifiedPollingLoop() {
  if (activeSubscriberCount <= 0 && unifiedPollingTimer) {
    clearInterval(unifiedPollingTimer);
    unifiedPollingTimer = null;
  }
}

// Universal subscriber with Hostinger PostgreSQL REST polling and local storage fallback cache
function createSubscriber<T extends { id?: string }>(tableName: string, apiEndpoint?: string) {
  return (callback: (data: T[]) => void, onError?: (err: any) => void) => {
    let isCancelled = false;
    activeSubscriberCount++;
    startUnifiedPollingLoop();

    // 1. Immediately emit cached data or empty array if empty (Never inject dummy data on inspection)
    let lastEmittedJson = '';
    const emitIfChanged = (data: T[]) => {
      if (isCancelled || !Array.isArray(data)) return;
      try {
        const json = JSON.stringify(data);
        if (json !== lastEmittedJson) {
          lastEmittedJson = json;
          callback(data);
        }
      } catch (e) {
        callback(data);
      }
    };

    try {
      const cached = getLocalCache<T>(tableName);
      if (cached.length > 0) {
        emitIfChanged(cached);
      } else {
        let initialFallback: any[] = [];
        if (tableName === 'reps') initialFallback = DEFAULT_REPS;

        if (initialFallback.length > 0) {
          setLocalCache(tableName, initialFallback as T[]);
          emitIfChanged(initialFallback as T[]);
        } else {
          emitIfChanged([]);
        }
      }
    } catch (e) {
      emitIfChanged([]);
    }

    const fetchData = async () => {
      if (isCancelled) return;

      // 1. Emit from local memory cache instantly for 0ms UI lag
      const current = getLocalCache<T>(tableName);
      if (current && current.length > 0) {
        emitIfChanged(current);
      }

      // In offline mode, skip unnecessary network roundtrips to prevent UI freezing
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

      if (isOnline && apiEndpoint) {
        // First attempt: Central PostgreSQL Server API endpoint with fallback for APK
        try {
          const res = await fetchWithFallback(`/api/${apiEndpoint}`, undefined, 4000);
          if (res && res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) {
              const apiData = await res.json().catch(() => null);
              if (!isCancelled && Array.isArray(apiData)) {
                const mapped = apiData.map((row) => mapRow(tableName, row));
                const merged = mergeRemoteWithPendingLocal<T>(tableName, mapped as T[]);
                setLocalCache(tableName, merged);
                emitIfChanged(merged);
                return;
              }
            }
          }
        } catch (apiErr) {
          // Fall through to local cache
        }
      }

      // Fallback: Retain local cache only if it changed
      try {
        const cached = getLocalCache<T>(tableName);
        if (!isCancelled && cached.length > 0) {
          emitIfChanged(cached);
        }
      } catch (e) {}

      if (onError && !isCancelled && isOnline) {
        onError(new Error('Fetch network error'));
      }
    };

    refreshListeners.add(fetchData);

    // Schedule unified atomic sync on mount (debounced so multiple mounting subscribers only make 1 request)
    scheduleUnifiedDataSync(50);

    let onlineTimeout: any = null;
    const handleOnlineEvent = () => {
      if (onlineTimeout) clearTimeout(onlineTimeout);
      onlineTimeout = setTimeout(() => {
        scheduleUnifiedDataSync(0);
      }, 200);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnlineEvent);
    }

    return () => {
      isCancelled = true;
      activeSubscriberCount--;
      stopUnifiedPollingLoop();
      refreshListeners.delete(fetchData);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnlineEvent);
      }
    };
  };
}

export const subscribeToContracts = createSubscriber<any>('contracts', 'contracts');
export const subscribeToCustomers = createSubscriber<any>('customers', 'customers');
export const subscribeToInventory = createSubscriber<any>('inventory', 'inventory');
export const subscribeToPayments = createSubscriber<any>('payments', 'payments');
export const subscribeToReps = createSubscriber<any>('reps', 'reps');
export const subscribeToFunds = createSubscriber<any>('funds', 'funds');
export const subscribeToCustomerLists = createSubscriber<any>('customer_lists', 'customer-lists');
export const subscribeToFundTransactions = createSubscriber<any>('fund_transactions', 'fund-transactions');
export const subscribeToEmployees = createSubscriber<any>('employees', 'employees');
export const subscribeToEmployeeTransactions = createSubscriber<any>('employee_transactions', 'employee-transactions');
export const subscribeToPaymentConflicts = createSubscriber<any>('payment_conflicts', 'payment-conflicts');
export const subscribeToAppointments = createSubscriber<AppointmentRecord>('appointments', 'appointments');

// --- Contracts ---
export const addContractToDatabase = async (contract: any, quantityDeducted: number = 1) => {
  if (!contract) return;
  const id = contract.id || generateUniqueId('contract');
  const payload = {
    ...contract,
    id,
    customerName: contract.customerName || '',
    customerPhone: contract.customerPhone || '',
    customerAddress: contract.customerAddress || '',
    itemId: contract.itemId || null,
    itemName: contract.itemName || '',
    itemQuantity: Number(contract.itemQuantity) || 1,
    purchasePrice: Number(contract.purchasePrice) || 0,
    listId: contract.listId || null,
    listName: contract.listName || null,
    totalPrice: Number(contract.totalPrice) || 0,
    advancePayment: Number(contract.advancePayment) || 0,
    remainingBalance: Number(contract.remainingBalance ?? (Number(contract.totalPrice) - Number(contract.advancePayment))) || 0,
    dailyInstallment: Number(contract.dailyInstallment) || 0,
    startDate: contract.startDate || new Date().toISOString().split('T')[0],
    notes: contract.notes || '',
    status: contract.status || 'active',
    totalPaid: Number(contract.totalPaid) || 0,
    repName: contract.repName || '',
    createdAt: contract.createdAt || new Date().toISOString(),
  };

  unmarkRecordAsDeleted(id);
  updateLocalCacheItem('contracts', payload);
  const qPromise = addToPendingQueue('CREATE_CONTRACT', payload);
  const savePromise = saveToPostgres('contracts', 'POST', payload, qPromise);

  let invPromiseAll: any = null;
  if (payload.itemId || payload.itemName) {
    const inventory = getLocalCache<any>('inventory');
    const item = inventory.find((d: any) => d.id === payload.itemId || d.name === payload.itemName);
    if (item) {
      const currentQty = Number(item.quantity) || 0;
      const newQty = Math.max(0, currentQty - (quantityDeducted || Number(payload.itemQuantity) || 1));
      const updatedItem = { ...item, quantity: newQty };
      updateLocalCacheItem('inventory', updatedItem);
      const invPromise = addToPendingQueue('UPDATE_INVENTORY', { id: item.id, quantity: newQty });
      invPromiseAll = saveToPostgres(`inventory/${item.id}`, 'PUT', { quantity: newQty }, invPromise);
    }
  }

  // Await saving to database with a 2-second timeout race limit
  // Guarantees data is committed before modal closes on active connection
  await Promise.race([
    Promise.all([savePromise, invPromiseAll]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
};
export const addContractToFirestore = addContractToDatabase;

export const updateContractInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const currentContracts = getLocalCache<any>('contracts');
  const existing = currentContracts.find((c) => c.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  unmarkRecordAsDeleted(docId);
  updateLocalCacheItem('contracts', merged);
  const qPromise = addToPendingQueue('UPDATE_CONTRACT', payload);
  await Promise.race([
    saveToPostgres(`contracts/${docId}`, 'PUT', payload, qPromise),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
};
export const updateContractInFirestore = updateContractInDatabase;

export const deleteContractFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;

  markRecordAsDeleted(docId, 'contracts');
  markRecordAsDeleted(docId, 'sales');
  markRecordAsDeleted(docId, 'customers');
  removeLocalCacheItem('contracts', docId);

  // Clean up local cached payments associated with this contract and tombstone them
  try {
    const localPayments = getLocalCache<any>('payments');
    const relatedPayments = localPayments.filter((p) => p.contractId === docId);
    for (const rp of relatedPayments) {
      if (rp.id) markRecordAsDeleted(rp.id, 'payments');
    }
    const filteredPayments = localPayments.filter((p) => p.contractId !== docId);
    setLocalCache('payments', filteredPayments);
  } catch (e) {}

  const qPromise = addToPendingQueue('DELETE_CONTRACT', { id: docId });
  await Promise.race([
    saveToPostgres(`contracts/${docId}`, 'DELETE', undefined, qPromise),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
};
export const deleteContractFromFirestore = deleteContractFromDatabase;

export const deleteCustomerFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'customers');
  markRecordAsDeleted(docId, 'contracts');
  markRecordAsDeleted(docId, 'sales');
  removeLocalCacheItem('customers', docId);
  const qPromise = addToPendingQueue('DELETE_CUSTOMER', { id: docId });
  await Promise.race([
    saveToPostgres(`customers/${docId}`, 'DELETE', undefined, qPromise),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
};
export const deleteCustomerFromFirestore = deleteCustomerFromDatabase;

// --- Payments ---
export const recordPaymentInDatabase = async (arg1: any, arg2?: any, arg3?: any, arg4?: any, ..._rest: any[]): Promise<any> => {
  let paymentRecord: any = {};
  if (arg1 && arg1.contractId !== undefined && arg1.amountPaid !== undefined) {
    paymentRecord = { ...arg1 };
  } else if (arg1 && (arg1.id || arg1.customerName)) {
    const contract = arg1;
    const amount = Number(arg2) || 0;
    const repName = arg3 || '';
    const note = arg4 || '';
    paymentRecord = {
      contractId: contract.id,
      customerName: contract.customerName || '',
      amountPaid: amount,
      paymentDate: new Date().toISOString().split('T')[0],
      repName: repName,
      note: note,
      fundId: contract.listId || null,
    };
  } else if (typeof arg1 === 'object') {
    paymentRecord = { ...arg1 };
  }

  const id = paymentRecord.id || generateUniqueId('pay');
  const numAmount = Number(paymentRecord.amountPaid ?? paymentRecord.amount) || 0;
  if (numAmount <= 0) {
    return;
  }

  // Resolve fund ID from customer list if needed
  let resolvedFundId = paymentRecord.fundId || null;
  const lists = getLocalCache<any>('customer_lists');
  if (resolvedFundId) {
    const matchedList = lists.find((l: any) => l.id === resolvedFundId);
    if (matchedList?.fundId || matchedList?.fund_id) {
      resolvedFundId = matchedList.fundId || matchedList.fund_id;
    }
  } else if (paymentRecord.contractId) {
    const contracts = getLocalCache<any>('contracts');
    const contract = contracts.find((c: any) => c.id === paymentRecord.contractId);
    const targetList = lists.find((l: any) => l.id === contract?.listId || l.name === contract?.listName);
    if (targetList?.fundId || targetList?.fund_id) {
      resolvedFundId = targetList.fundId || targetList.fund_id;
    }
  }

  if (!resolvedFundId) {
    const cachedFunds = getLocalCache<any>('funds');
    if (cachedFunds && cachedFunds.length > 0) {
      resolvedFundId = cachedFunds[0].id;
    }
  }

  let custName = paymentRecord.customerName || '';
  if (!custName && paymentRecord.contractId) {
    const contracts = getLocalCache<any>('contracts');
    const contract = contracts.find((c: any) => c.id === paymentRecord.contractId);
    if (contract?.customerName) custName = contract.customerName;
  }

  const pLat = paymentRecord.latitude != null ? Number(paymentRecord.latitude) : (paymentRecord.lat != null ? Number(paymentRecord.lat) : undefined);
  const pLng = paymentRecord.longitude != null ? Number(paymentRecord.longitude) : (paymentRecord.lng != null ? Number(paymentRecord.lng) : undefined);

  const payload = {
    id,
    contractId: paymentRecord.contractId || (paymentRecord.id && !paymentRecord.id.startsWith('pay_') ? paymentRecord.id : ''),
    customerName: custName,
    amount: numAmount,
    amountPaid: numAmount,
    paymentDate: paymentRecord.paymentDate || new Date().toISOString().split('T')[0],
    repName: paymentRecord.repName || '',
    note: paymentRecord.note || '',
    fundId: resolvedFundId,
    latitude: pLat,
    longitude: pLng,
    createdAt: paymentRecord.createdAt || new Date().toISOString(),
  };

  unmarkRecordAsDeleted(id);
  if (payload.contractId) unmarkRecordAsDeleted(payload.contractId);
  updateLocalCacheItem('payments', payload);

  // Instantly reflect installment in local funds and fund transactions
  if (resolvedFundId && numAmount > 0) {
    const ftId = `ft_pay_${id}`;
    const txObj = {
      id: ftId,
      fundId: resolvedFundId,
      type: 'installment',
      amount: numAmount,
      note: `تسديد قسط زبون: ${custName}`,
      repName: payload.repName || '',
      createdAt: payload.paymentDate || payload.createdAt || new Date().toISOString(),
    };
    updateLocalCacheItem('fund_transactions', txObj);

    const cachedFunds = getLocalCache<any>('funds');
    const targetFund = cachedFunds.find((f: any) => f.id === resolvedFundId);
    if (targetFund) {
      updateLocalCacheItem('funds', {
        ...targetFund,
        balance: Math.max(0, (Number(targetFund.balance) || 0) + numAmount),
      });
    }
  }

  const payPromise = addToPendingQueue('CREATE_PAYMENT', payload);
  const savePay = saveToPostgres('payments', 'POST', payload, payPromise);

  let saveContract: any = null;
  if (payload.contractId || payload.customerName) {
    const contracts = getLocalCache<any>('contracts');
    const contract = contracts.find((c: any) =>
      (payload.contractId && c.id && payload.contractId === c.id) ||
      (!payload.contractId && payload.customerName && c.customerName && normName(payload.customerName) === normName(c.customerName))
    );
    if (contract) {
      const newTotalPaid = (Number(contract.totalPaid) || 0) + Number(payload.amountPaid);
      const newRemaining = Math.max(0, (Number(contract.totalPrice) || 0) - (Number(contract.advancePayment) || 0) - newTotalPaid);
      const newStatus = newRemaining <= 0 ? 'completed' : contract.status;
      const contractUpdates: any = {
        ...contract,
        totalPaid: newTotalPaid,
        remainingBalance: newRemaining,
        status: newStatus,
        lastPaymentDate: payload.paymentDate,
      };

      // Automatically update customer's GPS location from payment location if available
      if (pLat != null && pLng != null && !isNaN(pLat) && !isNaN(pLng)) {
        contractUpdates.latitude = pLat;
        contractUpdates.longitude = pLng;
        contractUpdates.locationAddress = paymentRecord.locationAddress || contract.locationAddress || `موقع تسديد (${payload.paymentDate})`;
        contractUpdates.locationUpdatedAt = new Date().toISOString();
      }

      updateLocalCacheItem('contracts', contractUpdates);
      const cPromise = addToPendingQueue('UPDATE_CONTRACT', contractUpdates);
      saveContract = saveToPostgres(`contracts/${contract.id}`, 'PUT', contractUpdates, cPromise);
    }
  }

  // Execute network sync in background without blocking rapid entry (instantaneous fraction of a millisecond local commit)
  Promise.all([savePay, saveContract]).catch(() => {});

  notifySubscribersRefresh();
  return { isConflict: false };
};
export const recordPaymentInFirestore = recordPaymentInDatabase;
export const addPaymentToFirestore = recordPaymentInDatabase;
export const addPaymentToDatabase = recordPaymentInDatabase;

export const updatePaymentInDatabase = async (
  id: string | any,
  updates?: any,
  maybeNoteOrContracts?: any,
  maybeContracts?: any[]
) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;

  let payload: any = {};
  if (typeof id === 'string') {
    payload = typeof updates === 'object' ? { ...updates, id: docId } : { id: docId, amountPaid: updates };
  } else if (typeof updates === 'number') {
    payload = {
      id: docId,
      amountPaid: updates,
      note: typeof maybeNoteOrContracts === 'string' ? maybeNoteOrContracts : id?.note,
      updatedAt: new Date().toISOString(),
      isEdited: true,
    };
  } else {
    payload = { ...(updates || id), id: docId };
  }

  const payments = getLocalCache<any>('payments');
  const existing = payments.find((p) => p.id === docId);

  // Adjust fund if amount changed
  const oldAmt = Number(existing?.amountPaid ?? existing?.amount) || 0;
  const newAmt = Number(payload.amountPaid ?? payload.amount ?? oldAmt) || 0;
  const diff = newAmt - oldAmt;
  if (diff !== 0) {
    let fundId = payload.fundId || existing?.fundId;
    if (!fundId && (payload.contractId || existing?.contractId)) {
      const contracts = getLocalCache<any>('contracts');
      const c = contracts.find((ct: any) => ct.id === (payload.contractId || existing?.contractId));
      const lists = getLocalCache<any>('customer_lists');
      const l = lists.find((lst: any) => lst.id === c?.listId || lst.name === c?.listName);
      fundId = l?.fundId || l?.fund_id;
    }
    const lists = getLocalCache<any>('customer_lists');
    const matchedList = lists.find((lst: any) => lst.id === fundId);
    if (matchedList?.fundId || matchedList?.fund_id) {
      fundId = matchedList.fundId || matchedList.fund_id;
    }
    if (fundId) {
      const funds = getLocalCache<any>('funds');
      const targetFund = funds.find((f: any) => f.id === fundId);
      if (targetFund) {
        updateLocalCacheItem('funds', {
          ...targetFund,
          balance: Math.max(0, (Number(targetFund.balance) || 0) + diff),
        });
      }
      const existingFt = getLocalCache<any>('fund_transactions').find((f: any) => f.id === `ft_pay_${docId}`);
      if (existingFt) {
        updateLocalCacheItem('fund_transactions', {
          ...existingFt,
          amount: newAmt,
          fundId,
        });
      }
    }
  }

  const merged = existing ? { ...existing, ...payload } : payload;
  updateLocalCacheItem('payments', merged);

  const payPromise = addToPendingQueue('UPDATE_PAYMENT', payload);
  const savePayPromise = saveToPostgres(`payments/${docId}`, 'PUT', payload, payPromise);

  const allContracts = Array.isArray(maybeContracts)
    ? maybeContracts
    : Array.isArray(maybeNoteOrContracts)
    ? maybeNoteOrContracts
    : Array.isArray(updates)
    ? updates
    : getLocalCache<any>('contracts');

  const paymentObj = existing ? { ...existing, ...merged } : merged;
  let saveContractPromise: any = null;

  if (allContracts && allContracts.length > 0) {
    const target = allContracts.find(
      (c: any) =>
        (paymentObj.contractId && c.id && paymentObj.contractId === c.id) ||
        (!paymentObj.contractId && paymentObj.customerName && c.customerName && normName(paymentObj.customerName) === normName(c.customerName))
    );
    if (target) {
      const updatedPaymentsList = payments.map((p: any) => p.id === docId ? { ...p, ...payload } : p);
      const cPayments = updatedPaymentsList.filter(
        (p: any) =>
          (p.contractId && target.id && p.contractId === target.id) ||
          (!p.contractId && p.customerName && target.customerName && normName(p.customerName) === normName(target.customerName))
      );
      const newTotalPaid = cPayments.reduce((sum: number, p: any) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
      const netFinanced = Math.max(0, (Number(target.totalPrice) || 0) - (Number(target.advancePayment) || 0));
      let newRemaining = Math.max(0, netFinanced - newTotalPaid);
      if (newRemaining > 0 && newRemaining <= 2 && (Number(target.remainingBalance || 0) <= 5 || newTotalPaid >= netFinanced - 2)) {
        newRemaining = 0;
      }
      const newStatus = (newRemaining === 0 && (netFinanced === 0 || newTotalPaid > 0)) ? 'completed' : 'active';
      const sorted = [...cPayments].sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      const newLastPaymentDate = sorted[0]?.paymentDate || null;

      const updatedContract = {
        ...target,
        totalPaid: newTotalPaid,
        remainingBalance: newRemaining,
        status: newStatus,
        lastPaymentDate: newLastPaymentDate,
      };

      updateLocalCacheItem('contracts', updatedContract);
      const cPromise = addToPendingQueue('UPDATE_CONTRACT', updatedContract);
      saveContractPromise = saveToPostgres(`contracts/${target.id}`, 'PUT', updatedContract, cPromise);
    }
  }

  await Promise.race([
    Promise.all([savePayPromise, saveContractPromise]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

  notifySubscribersRefresh();
};
export const updatePaymentInFirestore = updatePaymentInDatabase;

export const deletePaymentFromDatabase = async (id: string | any, _contracts?: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const paymentsCache = getLocalCache<any>('payments');
  const paymentObj = typeof id === 'object' ? id : paymentsCache.find((p) => p.id === docId);

  const contractId = paymentObj?.contractId;
  const payAmt = Number(paymentObj?.amountPaid ?? paymentObj?.amount) || 0;

  // Resolve fund ID
  let fundId = paymentObj?.fundId || paymentObj?.fund_id;
  const contracts = getLocalCache<any>('contracts');
  const lists = getLocalCache<any>('customer_lists');
  const funds = getLocalCache<any>('funds');

  if (!fundId && contractId) {
    const c = contracts.find((ct: any) => ct.id === contractId);
    const l = lists.find((lst: any) => lst.id === c?.listId || (lst.name && c?.listName && normName(lst.name) === normName(c?.listName)));
    fundId = l?.fundId || l?.fund_id;
  }
  if (!fundId && paymentObj?.customerName) {
    const c = contracts.find((ct: any) => ct.customerName && normName(ct.customerName) === normName(paymentObj.customerName));
    const l = lists.find((lst: any) => lst.id === c?.listId || (lst.name && c?.listName && normName(lst.name) === normName(c?.listName)));
    fundId = l?.fundId || l?.fund_id;
  }
  if (fundId) {
    const matchedList = lists.find((lst: any) => lst.id === fundId || (lst.name && normName(lst.name) === normName(fundId)));
    if (matchedList?.fundId || matchedList?.fund_id) {
      fundId = matchedList.fundId || matchedList.fund_id;
    }
  }

  // Immediately deduct from local fund cache and remove transaction
  if (fundId && payAmt > 0) {
    const targetFund = funds.find((f: any) => f.id === fundId || (f.name && normName(f.name) === normName(fundId)));
    if (targetFund) {
      updateLocalCacheItem('funds', {
        ...targetFund,
        balance: Math.max(0, (Number(targetFund.balance) || 0) - payAmt),
      });
    }
    removeLocalCacheItem('fund_transactions', `ft_pay_${docId}`);
  }

  markRecordAsDeleted(docId, 'payments');
  removeLocalCacheItem('payments', docId);

  const qPromise = addToPendingQueue('DELETE_PAYMENT', {
    id: docId,
    contractId,
    fundId,
    amount: payAmt,
    customerName: paymentObj?.customerName,
    repName: paymentObj?.repName,
    paymentDate: paymentObj?.paymentDate,
  });
  const delPayPromise = saveToPostgres(`payments/${docId}`, 'DELETE', undefined, qPromise);

  const allContracts = Array.isArray(_contracts) && _contracts.length > 0 ? _contracts : getLocalCache<any>('contracts');
  const remainingPayments = paymentsCache.filter((p: any) => p.id !== docId);
  let saveContractPromise: any = null;

  if (paymentObj && allContracts.length > 0) {
    const target = allContracts.find(
      (c: any) =>
        (paymentObj.contractId && c.id && String(paymentObj.contractId).trim() === String(c.id).trim()) ||
        (paymentObj.customerName && c.customerName && normName(paymentObj.customerName) === normName(c.customerName))
    );
    if (target) {
      const cPayments = remainingPayments.filter(
        (p: any) =>
          (p.contractId && target.id && String(p.contractId).trim() === String(target.id).trim()) ||
          (p.customerName && target.customerName && normName(p.customerName) === normName(target.customerName))
      );
      const newTotalPaid = cPayments.reduce((sum: number, p: any) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
      const netFinanced = Math.max(0, (Number(target.totalPrice) || 0) - (Number(target.advancePayment) || 0));
      const newRemaining = Math.max(0, netFinanced - newTotalPaid);
      const newStatus = (newRemaining === 0 && (netFinanced === 0 || newTotalPaid > 0)) ? 'completed' : 'active';
      
      const sorted = [...cPayments].sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
      const newLastPaymentDate = sorted[0]?.paymentDate || null;

      const updatedContract = {
        ...target,
        totalPaid: newTotalPaid,
        remainingBalance: newRemaining,
        status: newStatus,
        lastPaymentDate: newLastPaymentDate,
      };

      updateLocalCacheItem('contracts', updatedContract);
      const cPromise = addToPendingQueue('UPDATE_CONTRACT', updatedContract);
      saveContractPromise = saveToPostgres(`contracts/${target.id}`, 'PUT', updatedContract, cPromise);
    }
  }

  await Promise.race([
    Promise.all([delPayPromise, saveContractPromise]),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

  notifySubscribersRefresh();
};
export const deletePaymentFromFirestore = deletePaymentFromDatabase;

export const deleteMultiplePaymentsFromDatabase = async (payments: any[], _contracts: any[] = []) => {
  if (!Array.isArray(payments) || payments.length === 0) return;

  const paymentsCache = getLocalCache<any>('payments');
  const allContracts = Array.isArray(_contracts) && _contracts.length > 0 ? _contracts : getLocalCache<any>('contracts');
  const funds = getLocalCache<any>('funds');
  const lists = getLocalCache<any>('customer_lists');

  const docIds: string[] = [];
  const affectedContractMap = new Map<string, any>();

  for (const payment of payments) {
    const docId = typeof payment === 'string' ? payment : payment?.id;
    if (!docId) continue;
    docIds.push(docId);

    const paymentObj = typeof payment === 'object' ? payment : paymentsCache.find((p: any) => p.id === docId);
    const contractId = paymentObj?.contractId;
    const payAmt = Number(paymentObj?.amountPaid ?? paymentObj?.amount) || 0;

    let fundId = paymentObj?.fundId || paymentObj?.fund_id;
    if (!fundId && contractId) {
      const c = allContracts.find((ct: any) => ct.id === contractId);
      const l = lists.find((lst: any) => lst.id === c?.listId || (lst.name && c?.listName && normName(lst.name) === normName(c?.listName)));
      fundId = l?.fundId || l?.fund_id;
    }
    if (!fundId && paymentObj?.customerName) {
      const c = allContracts.find((ct: any) => ct.customerName && normName(ct.customerName) === normName(paymentObj.customerName));
      const l = lists.find((lst: any) => lst.id === c?.listId || (lst.name && c?.listName && normName(lst.name) === normName(c?.listName)));
      fundId = l?.fundId || l?.fund_id;
    }
    if (fundId) {
      const matchedList = lists.find((lst: any) => lst.id === fundId || (lst.name && normName(lst.name) === normName(fundId)));
      if (matchedList?.fundId || matchedList?.fund_id) {
        fundId = matchedList.fundId || matchedList.fund_id;
      }
    }

    if (fundId && payAmt > 0) {
      const targetFund = funds.find((f: any) => f.id === fundId || (f.name && normName(f.name) === normName(fundId)));
      if (targetFund) {
        updateLocalCacheItem('funds', {
          ...targetFund,
          balance: Math.max(0, (Number(targetFund.balance) || 0) - payAmt),
        });
      }
      removeLocalCacheItem('fund_transactions', `ft_pay_${docId}`);
    }

    markRecordAsDeleted(docId, 'payments');
    removeLocalCacheItem('payments', docId);

    const qPromise = addToPendingQueue('DELETE_PAYMENT', {
      id: docId,
      contractId,
      fundId,
      amount: payAmt,
      customerName: paymentObj?.customerName,
      repName: paymentObj?.repName,
      paymentDate: paymentObj?.paymentDate,
    });
    saveToPostgres(`payments/${docId}`, 'DELETE', undefined, qPromise);

    if (paymentObj && allContracts.length > 0) {
      const target = allContracts.find(
        (c: any) =>
          (paymentObj.contractId && c.id && paymentObj.contractId === c.id) ||
          (!paymentObj.contractId && paymentObj.customerName && c.customerName && normName(paymentObj.customerName) === normName(c.customerName))
      );
      if (target && target.id) {
        affectedContractMap.set(target.id, target);
      }
    }
  }

  // Trigger batch API call to server
  try {
    saveToPostgres('payments/delete-batch', 'POST', { ids: docIds });
  } catch (err) {
    console.warn('Batch delete call error:', err);
  }

  const remainingPayments = getLocalCache<any>('payments').filter((p: any) => !docIds.includes(p.id));

  for (const [, target] of affectedContractMap.entries()) {
    const cPayments = remainingPayments.filter(
      (p: any) =>
        (p.contractId && target.id && p.contractId === target.id) ||
        (!p.contractId && p.customerName && target.customerName && normName(p.customerName) === normName(target.customerName))
    );
    const newTotalPaid = cPayments.reduce((sum: number, p: any) => sum + (Number(p.amountPaid ?? p.amount) || 0), 0);
    const netFinanced = Math.max(0, (Number(target.totalPrice) || 0) - (Number(target.advancePayment) || 0));
    const newRemaining = Math.max(0, netFinanced - newTotalPaid);
    const newStatus = (newRemaining === 0 && (netFinanced === 0 || newTotalPaid > 0)) ? 'completed' : 'active';

    const sorted = [...cPayments].sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    const newLastPaymentDate = sorted[0]?.paymentDate || null;

    const updatedContract = {
      ...target,
      totalPaid: newTotalPaid,
      remainingBalance: newRemaining,
      status: newStatus,
      lastPaymentDate: newLastPaymentDate,
    };

    updateLocalCacheItem('contracts', updatedContract);
    const cPromise = addToPendingQueue('UPDATE_CONTRACT', updatedContract);
    saveToPostgres(`contracts/${target.id}`, 'PUT', updatedContract, cPromise);
  }

  notifySubscribersRefresh();
};
export const deleteMultiplePaymentsFromFirestore = deleteMultiplePaymentsFromDatabase;

// --- Inventory ---
export const addInventoryItemToDatabase = async (item: any, ..._rest: any[]) => {
  if (!item) return;
  const id = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload = { ...item, id };
  updateLocalCacheItem('inventory', payload);
  const qPromise = addToPendingQueue('CREATE_INVENTORY', payload);
  saveToPostgres('inventory', 'POST', payload, qPromise);
};
export const addInventoryItemToFirestore = addInventoryItemToDatabase;

export const updateInventoryItemInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('inventory');
  const existing = current.find((i) => i.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('inventory', merged);
  const qPromise = addToPendingQueue('UPDATE_INVENTORY', payload);
  saveToPostgres(`inventory/${docId}`, 'PUT', payload, qPromise);
};
export const updateInventoryItemInFirestore = updateInventoryItemInDatabase;

export const deleteInventoryItemFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'inventory');
  removeLocalCacheItem('inventory', docId);
  const qPromise = addToPendingQueue('DELETE_INVENTORY', { id: docId });
  saveToPostgres(`inventory/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteInventoryItemFromFirestore = deleteInventoryItemFromDatabase;

// --- Sales Representatives ---
export const addRepToDatabase = async (rep: any, ..._rest: any[]) => {
  if (!rep) return;
  const id = rep.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload = { ...rep, id };
  updateLocalCacheItem('reps', payload);
  const qPromise = addToPendingQueue('CREATE_REP', payload);
  saveToPostgres('reps', 'POST', payload, qPromise);
};
export const addRepToFirestore = addRepToDatabase;

export const updateRepInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('reps');
  const existing = current.find((r) => r.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('reps', merged);
  const qPromise = addToPendingQueue('UPDATE_REP', merged);
  saveToPostgres(`reps/${docId}`, 'PUT', merged, qPromise);
};
export const updateRepInFirestore = updateRepInDatabase;

export const deleteRepFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'reps');
  removeLocalCacheItem('reps', docId);
  const qPromise = addToPendingQueue('DELETE_REP', { id: docId });
  saveToPostgres(`reps/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteRepFromFirestore = deleteRepFromDatabase;

// --- Funds ---
export const addFundToDatabase = async (fund: any, ..._rest: any[]) => {
  if (!fund) return;
  const current = getLocalCache<any>('funds');
  const id = fund.id || `fund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const orderIndex = fund.orderIndex !== undefined ? Number(fund.orderIndex) : current.length;
  const payload = { ...fund, id, orderIndex };
  updateLocalCacheItem('funds', payload);
  const qPromise = addToPendingQueue('CREATE_FUND', payload);
  saveToPostgres('funds', 'POST', payload, qPromise);
};
export const addFundToFirestore = addFundToDatabase;

export const updateFundInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('funds');
  const existing = current.find((f) => f.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('funds', merged);
  const qPromise = addToPendingQueue('UPDATE_FUND', payload);
  saveToPostgres(`funds/${docId}`, 'PUT', payload, qPromise);
};
export const updateFundInFirestore = updateFundInDatabase;

export const reorderFundsInDatabase = async (orderedIds: string[]) => {
  const current = getLocalCache<any>('funds');
  const idMap = new Map(current.map((f: any) => [f.id, f]));
  const reordered: any[] = [];
  orderedIds.forEach((id, index) => {
    const item = idMap.get(id);
    if (item) {
      reordered.push({ ...item, orderIndex: index });
    }
  });
  current.forEach((f: any) => {
    if (!orderedIds.includes(f.id)) {
      reordered.push({ ...f, orderIndex: reordered.length });
    }
  });
  setLocalCache('funds', reordered);
  notifySubscribersRefresh();
  const qPromise = addToPendingQueue('REORDER_FUNDS', { orderedIds });
  saveToPostgres('funds/reorder', 'POST', { orderedIds }, qPromise);
};

export const deleteFundFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'funds');
  removeLocalCacheItem('funds', docId);
  const qPromise = addToPendingQueue('DELETE_FUND', { id: docId });
  saveToPostgres(`funds/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteFundFromFirestore = deleteFundFromDatabase;

// --- Customer Lists ---
export const addCustomerListToDatabase = async (list: any, ..._rest: any[]) => {
  if (!list) return;
  const current = getLocalCache<any>('customer_lists');
  const id = list.id || `list_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const orderIndex = list.orderIndex !== undefined ? Number(list.orderIndex) : current.length;
  const payload = { ...list, id, orderIndex };
  updateLocalCacheItem('customer_lists', payload);
  const qPromise = addToPendingQueue('CREATE_CUSTOMER_LIST', payload);
  saveToPostgres('customer-lists', 'POST', payload, qPromise);
};
export const addCustomerListToFirestore = addCustomerListToDatabase;

export const updateCustomerListInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('customer_lists');
  const existing = current.find((l) => l.id === docId);
  const tpl = payload.receiptTemplate || payload.receipt_template || existing?.receiptTemplate || existing?.receipt_template || 'template_1';
  const merged = existing
    ? { ...existing, ...payload, receiptTemplate: tpl, receipt_template: tpl }
    : { ...payload, receiptTemplate: tpl, receipt_template: tpl };

  updateLocalCacheItem('customer_lists', merged);
  const qPromise = addToPendingQueue('UPDATE_CUSTOMER_LIST', merged);
  saveToPostgres(`customer-lists/${docId}`, 'PUT', merged, qPromise);
  notifySubscribersRefresh();
};
export const updateCustomerListInFirestore = updateCustomerListInDatabase;

export const reorderCustomerListsInDatabase = async (orderedIds: string[]) => {
  const current = getLocalCache<any>('customer_lists');
  const idMap = new Map(current.map((l: any) => [l.id, l]));
  const reordered: any[] = [];
  orderedIds.forEach((id, index) => {
    const item = idMap.get(id);
    if (item) {
      reordered.push({ ...item, orderIndex: index });
    }
  });
  current.forEach((l: any) => {
    if (!orderedIds.includes(l.id)) {
      reordered.push({ ...l, orderIndex: reordered.length });
    }
  });
  setLocalCache('customer_lists', reordered);
  notifySubscribersRefresh();
  const qPromise = addToPendingQueue('REORDER_CUSTOMER_LISTS', { orderedIds });
  saveToPostgres('customer-lists/reorder', 'POST', { orderedIds }, qPromise);
};

export const deleteCustomerListFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'customer_lists');
  removeLocalCacheItem('customer_lists', docId);
  const qPromise = addToPendingQueue('DELETE_CUSTOMER_LIST', { id: docId });
  saveToPostgres(`customer-lists/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteCustomerListFromFirestore = deleteCustomerListFromDatabase;

// --- Fund Transactions ---
export const addDepositOrWithdrawalToFund = async (arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any) => {
  let tx: any = {};
  if (typeof arg1 === 'string') {
    tx = {
      id: `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fundId: arg1,
      type: arg2,
      amount: Number(arg3) || 0,
      repName: arg4 || '',
      note: arg5 || '',
      createdAt: new Date().toISOString(),
    };
  } else if (arg1) {
    tx = { ...arg1 };
    tx.id = tx.id || `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  } else {
    return;
  }

  // Update local funds cache balance
  try {
    const funds = getLocalCache<any>('funds');
    const fund = funds.find((f: any) => f.id === tx.fundId);
    if (fund) {
      const isDeduction = tx.type === 'withdraw' || tx.type === 'expense' || tx.type === 'employee_loan';
      const delta = isDeduction ? -Number(tx.amount || 0) : Number(tx.amount || 0);
      const newBal = (Number(fund.balance) || 0) + delta;
      updateLocalCacheItem('funds', { ...fund, balance: newBal });
    }
  } catch (e) {}

  updateLocalCacheItem('fund_transactions', tx);
  const qPromise = addToPendingQueue('CREATE_FUND_TRANSACTION', tx);
  saveToPostgres('fund-transactions', 'POST', tx, qPromise);
};

export const transferBetweenFunds = async (arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any) => {
  let tx: any = {};
  if (typeof arg1 === 'string') {
    tx = {
      id: `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fundId: arg1,
      targetFundId: arg2,
      type: 'transfer',
      amount: Number(arg3) || 0,
      repName: arg4 || '',
      note: arg5 || '',
      createdAt: new Date().toISOString(),
    };
  } else if (arg1) {
    tx = { ...arg1 };
    tx.id = tx.id || `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  } else {
    return;
  }

  // Update local funds cache balance for both funds
  try {
    const funds = getLocalCache<any>('funds');
    const amount = Number(tx.amount) || 0;
    const srcFund = funds.find((f: any) => f.id === tx.fundId);
    if (srcFund) {
      const newBal = (Number(srcFund.balance) || 0) - amount;
      updateLocalCacheItem('funds', { ...srcFund, balance: newBal });
    }
    const dstFund = funds.find((f: any) => f.id === tx.targetFundId);
    if (dstFund) {
      const newBal = (Number(dstFund.balance) || 0) + amount;
      updateLocalCacheItem('funds', { ...dstFund, balance: newBal });
    }
  } catch (e) {}

  updateLocalCacheItem('fund_transactions', tx);
  const qPromise = addToPendingQueue('CREATE_FUND_TRANSACTION', tx);
  saveToPostgres('fund-transactions', 'POST', tx, qPromise);
};

export const deleteFundTransactionFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;

  try {
    const current = getLocalCache<any>('fund_transactions');
    const existing = current.find((t: any) => t.id === docId);
    if (existing) {
      const funds = getLocalCache<any>('funds');
      const amount = Number(existing.amount) || 0;
      if (existing.type === 'transfer') {
        const src = funds.find((f: any) => f.id === existing.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) + amount });
        const dst = funds.find((f: any) => f.id === existing.targetFundId);
        if (dst) updateLocalCacheItem('funds', { ...dst, balance: (Number(dst.balance) || 0) - amount });
      } else if (existing.type === 'withdraw' || existing.type === 'expense' || existing.type === 'employee_loan') {
        const src = funds.find((f: any) => f.id === existing.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) + amount });
      } else if (existing.type === 'deposit' || existing.type === 'employee_repay') {
        const src = funds.find((f: any) => f.id === existing.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) - amount });
      }
    }
  } catch (e) {}

  markRecordAsDeleted(docId, 'fund_transactions');
  removeLocalCacheItem('fund_transactions', docId);
  const qPromise = addToPendingQueue('DELETE_FUND_TRANSACTION', { id: docId });
  saveToPostgres(`fund-transactions/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteFundTransactionFromFirestore = deleteFundTransactionFromDatabase;

export const updateFundTransactionInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('fund_transactions');
  const existing = current.find((t) => t.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;
  const oldAmount = existing ? Number(existing.amount) || 0 : 0;
  const newAmount = payload.amount !== undefined ? Number(payload.amount) || 0 : oldAmount;
  const diff = newAmount - oldAmount;

  if (diff !== 0) {
    try {
      const funds = getLocalCache<any>('funds');
      const type = merged.type || 'deposit';
      if (type === 'transfer') {
        const src = funds.find((f: any) => f.id === merged.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) - diff });
        const dst = funds.find((f: any) => f.id === merged.targetFundId);
        if (dst) updateLocalCacheItem('funds', { ...dst, balance: (Number(dst.balance) || 0) + diff });
      } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
        const src = funds.find((f: any) => f.id === merged.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) - diff });
      } else if (type === 'deposit' || type === 'employee_repay') {
        const src = funds.find((f: any) => f.id === merged.fundId);
        if (src) updateLocalCacheItem('funds', { ...src, balance: (Number(src.balance) || 0) + diff });
      }
    } catch (e) {}
  }

  updateLocalCacheItem('fund_transactions', merged);
  const qPromise = addToPendingQueue('UPDATE_FUND_TRANSACTION', payload);
  saveToPostgres(`fund-transactions/${docId}`, 'PUT', payload, qPromise);
};
export const updateFundTransactionInFirestore = updateFundTransactionInDatabase;

// --- Employees ---
export const addEmployeeToDatabase = async (emp: any, ..._rest: any[]) => {
  if (!emp) return;
  const id = emp.id || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload = { ...emp, id };
  updateLocalCacheItem('employees', payload);
  const qPromise = addToPendingQueue('CREATE_EMPLOYEE', payload);
  saveToPostgres('employees', 'POST', payload, qPromise);
};
export const addEmployeeToFirestore = addEmployeeToDatabase;

export const updateEmployeeInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('employees');
  const existing = current.find((e) => e.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('employees', merged);
  const qPromise = addToPendingQueue('UPDATE_EMPLOYEE', payload);
  saveToPostgres(`employees/${docId}`, 'PUT', payload, qPromise);
};
export const updateEmployeeInFirestore = updateEmployeeInDatabase;

export const deleteEmployeeFromDatabase = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'employees');
  removeLocalCacheItem('employees', docId);
  const qPromise = addToPendingQueue('DELETE_EMPLOYEE', { id: docId });
  saveToPostgres(`employees/${docId}`, 'DELETE', undefined, qPromise);
};
export const deleteEmployeeFromFirestore = deleteEmployeeFromDatabase;

export const processEmployeeDebtTransaction = async (arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any) => {
  let tx: any = {};
  if (typeof arg1 === 'object' && arg1?.id && typeof arg2 === 'string') {
    tx = {
      id: `emptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      employeeId: arg1.id,
      fundId: arg2,
      type: arg3,
      amount: Number(arg4) || 0,
      repName: arg5 || '',
      notes: arg6 || '',
      createdAt: new Date().toISOString(),
    };
  } else if (arg1) {
    tx = { ...arg1 };
    tx.id = tx.id || `emptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  } else {
    return;
  }
  updateLocalCacheItem('employee_transactions', tx);
  const qPromise = addToPendingQueue('CREATE_EMPLOYEE_TRANSACTION', tx);
  saveToPostgres('employee-transactions', 'POST', tx, qPromise);
};

export const deleteEmployeeDebtTransaction = async (id: string | any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  markRecordAsDeleted(docId, 'employee_transactions');
  removeLocalCacheItem('employee_transactions', docId);
  const qPromise = addToPendingQueue('DELETE_EMPLOYEE_TRANSACTION', { id: docId });
  saveToPostgres(`employee-transactions/${docId}`, 'DELETE', undefined, qPromise);
};

export const updateEmployeeDebtTransaction = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('employee_transactions');
  const existing = current.find((t) => t.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('employee_transactions', merged);
  const qPromise = addToPendingQueue('UPDATE_EMPLOYEE_TRANSACTION', payload);
  saveToPostgres(`employee-transactions/${docId}`, 'PUT', payload, qPromise);
};

// --- Sync & Management utilities ---
export const replaceAllDataInDatabase = async (...args: any[]) => {
  try {
    const rawData = args[0];
    if (Array.isArray(rawData) && rawData.length > 0) {
      // Bulk Import to PostgreSQL backend
      const res = await fetchWithFallback('/api/contracts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contracts: rawData, overwrite: true })
      }, 15000);

      if (res && res.ok) {
        setLocalCache('contracts', rawData);
      }
    } else {
      await fetchWithFallback('/api/seed', { method: 'POST' }, 10000);
    }
  } catch (e) {
    console.warn('Failed to replace/seed database:', e);
  } finally {
    await forceRefreshAllDataFromPostgres();
    notifySubscribersRefresh();
  }
};
export const replaceAllDataInFirestore = replaceAllDataInDatabase;

export const syncAndOverwriteActiveDatabase = async (data?: any) => {
  try {
    // 1. Flush any pending offline queue first
    await flushPendingQueue();

    // 2. Reconcile all local datasets and force push all data to ensure nothing is missing in PostgreSQL
    const res = await reconcileAllLocalWithDatabase({ force: true, forcePushAll: true });

    // 3. Force refresh all latest data from PostgreSQL
    await forceRefreshAllDataFromPostgres();

    return res;
  } catch (e) {
    console.warn('Sync and overwrite error:', e);
  } finally {
    notifySubscribersRefresh();
  }
};

export const cleanupLegacyCollectionsFromDatabase = async (..._args: any[]) => {
  notifySubscribersRefresh();
};
export const cleanupLegacyCollectionsFromFirestore = cleanupLegacyCollectionsFromDatabase;

export const recordPaymentConflictInDatabase = async (conflict: any, ..._rest: any[]) => {
  if (!conflict) return;
  const id = conflict.id || `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const payload = { ...conflict, id };
  updateLocalCacheItem('payment_conflicts', payload);
  const qPromise = addToPendingQueue('CREATE_PAYMENT_CONFLICT', payload);
  saveToPostgres('payment-conflicts', 'POST', payload, qPromise);
};
export const recordPaymentConflictInFirestore = recordPaymentConflictInDatabase;

export const resolvePaymentConflictInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('payment_conflicts');
  const existing = current.find((c) => c.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('payment_conflicts', merged);
  const qPromise = addToPendingQueue('RESOLVE_PAYMENT_CONFLICT', payload);
  saveToPostgres(`payment-conflicts/${docId}`, 'PUT', payload, qPromise);
};
export const resolvePaymentConflictInFirestore = resolvePaymentConflictInDatabase;

export const rejectPaymentConflictInDatabase = async (id: string | any, updates?: any, ..._rest: any[]) => {
  const docId = typeof id === 'string' ? id : id?.id;
  if (!docId) return;
  const payload = typeof id === 'string' ? { ...updates, id: docId } : id;

  const current = getLocalCache<any>('payment_conflicts');
  const existing = current.find((c) => c.id === docId);
  const merged = existing ? { ...existing, ...payload } : payload;

  updateLocalCacheItem('payment_conflicts', merged);
  const qPromise = addToPendingQueue('REJECT_PAYMENT_CONFLICT', payload);
  saveToPostgres(`payment-conflicts/${docId}`, 'PUT', payload, qPromise);
};
export const rejectPaymentConflictInFirestore = rejectPaymentConflictInDatabase;

export const syncAllEmployeesDebtBalances = async (..._args: any[]) => {
  notifySubscribersRefresh();
  return 0;
};

export const silentBackgroundSync = async (..._args: any[]) => {
  try {
    await flushPendingQueue();
  } catch (e) {
    console.warn('silentBackgroundSync queue flush error:', e);
  } finally {
    notifySubscribersRefresh();
  }
};

export async function forceRefreshAllDataFromPostgres(): Promise<boolean> {
  try {
    // 1. Flush any pending offline queue first to guarantee all offline additions are saved in Postgres
    try {
      await flushPendingQueue();
    } catch (flushErr) {
      console.warn('Pre-refresh flush note:', flushErr);
    }

    // Try atomic full sync endpoint first
    try {
      const allRes = await fetchWithFallback('/api/sync/all', undefined, 10000);
      if (allRes && allRes.ok) {
        const data = await allRes.json();
        if (data && data.success) {
          if (Array.isArray(data.deletedRecordIds)) {
            markRecordAsDeleted(data.deletedRecordIds);
          }
          // Process payments first so payments from other reps are saved
          if (Array.isArray(data.payments)) setLocalCache('payments', mergeRemoteWithPendingLocal('payments', data.payments));
          // Recalculate contracts with all payments
          if (Array.isArray(data.contracts)) {
            const mergedContracts = mergeRemoteWithPendingLocal('contracts', data.contracts);
            const currentPayments = getLocalCache<any>('payments');
            const recalculated = recalculateAllContractsFromPayments(mergedContracts, currentPayments, false);
            setLocalCache('contracts', recalculated);
          } else {
            recalculateAllContractsFromPayments(undefined, undefined, true);
          }
          if (Array.isArray(data.inventory)) setLocalCache('inventory', mergeRemoteWithPendingLocal('inventory', data.inventory));
          if (Array.isArray(data.reps)) setLocalCache('reps', mergeRemoteWithPendingLocal('reps', data.reps));
          if (Array.isArray(data.funds)) setLocalCache('funds', mergeRemoteWithPendingLocal('funds', data.funds));
          if (Array.isArray(data.customerLists)) setLocalCache('customer_lists', mergeRemoteWithPendingLocal('customer_lists', data.customerLists));
          if (Array.isArray(data.employees)) setLocalCache('employees', mergeRemoteWithPendingLocal('employees', data.employees));
          if (Array.isArray(data.fundTransactions)) setLocalCache('fund_transactions', mergeRemoteWithPendingLocal('fund_transactions', data.fundTransactions));
          if (Array.isArray(data.employeeTransactions)) setLocalCache('employee_transactions', mergeRemoteWithPendingLocal('employee_transactions', data.employeeTransactions));
          if (Array.isArray(data.paymentConflicts)) setLocalCache('payment_conflicts', mergeRemoteWithPendingLocal('payment_conflicts', data.paymentConflicts));
          mirrorLocalSnapshotToIndexedDb(true);
          notifySubscribersRefresh();
          return true;
        }
      }
    } catch (allErr) {
      console.warn('Fast /api/sync/all attempt fallback:', allErr);
    }

    const tableEndpoints: { table: string; endpoint: string }[] = [
      { table: 'contracts', endpoint: 'contracts' },
      { table: 'inventory', endpoint: 'inventory' },
      { table: 'payments', endpoint: 'payments' },
      { table: 'reps', endpoint: 'reps' },
      { table: 'funds', endpoint: 'funds' },
      { table: 'customer_lists', endpoint: 'customer-lists' },
      { table: 'employees', endpoint: 'employees' },
      { table: 'fund_transactions', endpoint: 'fund-transactions' },
      { table: 'employee_transactions', endpoint: 'employee-transactions' },
      { table: 'payment_conflicts', endpoint: 'payment-conflicts' },
    ];
    
    const results = await Promise.allSettled(
      tableEndpoints.map(async ({ table, endpoint }) => {
        const res = await fetchWithFallback(`/api/${endpoint}`, undefined, 10000);
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const mapped = data.map((row) => mapRow(table, row));
            const merged = mergeRemoteWithPendingLocal(table, mapped);
            setLocalCache(table, merged);
            return true;
          }
        }
        return false;
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    notifySubscribersRefresh();
    return successCount > 0;
  } catch (e) {
    console.warn('Force refresh error:', e);
    return false;
  }
}

export const deleteAllCustomersAndPayments = async () => {
  try {
    // Clear local caches
    setLocalCache('contracts', []);
    setLocalCache('customers', []);
    setLocalCache('payments', []);
    setLocalCache('installment_contracts', []);
    setLocalCache('payment_conflicts', []);

    localStorage.removeItem('sami_cache_contracts');
    localStorage.removeItem('sami_cache_customers');
    localStorage.removeItem('sami_cache_payments');
    localStorage.removeItem('sami_cache_installment_contracts');
    localStorage.removeItem('sami_cache_payment_conflicts');
    localStorage.removeItem('alkarrar_cache_contracts');
    localStorage.removeItem('alkarrar_cache_payments');
    localStorage.removeItem(DELETED_RECORD_IDS_KEY);

    // Delete from Postgres server API
    await fetchWithFallback('/api/contracts', { method: 'DELETE' }, 15000).catch(() => {});
    await fetchWithFallback('/api/customers', { method: 'DELETE' }, 15000).catch(() => {});
    await fetchWithFallback('/api/payments', { method: 'DELETE' }, 15000).catch(() => {});
    await clearPendingQueue().catch(() => {});
    mirrorLocalSnapshotToIndexedDb(true).catch(() => {});
  } catch (e) {
    console.warn('Error deleting customers and payments:', e);
  } finally {
    notifySubscribersRefresh();
  }
};

export const deleteAllEmployees = async () => {
  try {
    // 1. Clear local caches and storage
    setLocalCache('employees', []);
    setLocalCache('employee_transactions', []);

    localStorage.removeItem('sami_cache_employees');
    localStorage.removeItem('sami_cache_employee_transactions');
    localStorage.removeItem('alkarrar_employees');
    localStorage.removeItem('alkarrar_cache_employees');
    localStorage.removeItem('alkarrar_cache_employee_transactions');

    // 2. Clear any pending offline actions for employees
    await clearPendingActionsByFilter((a: any) =>
      Boolean(
        a.type?.includes('EMPLOYEE') ||
        a.endpoint?.includes('employees') ||
        a.table === 'employees' ||
        a.table === 'employee_transactions'
      )
    ).catch(() => {});

    // 3. Delete from Postgres / Server API
    await Promise.all([
      fetchWithFallback('/api/employees', { method: 'DELETE' }, 15000).catch(() => {}),
      fetchWithFallback('/api/employee-transactions', { method: 'DELETE' }, 15000).catch(() => {}),
    ]);

    // 4. Update indexedDB mirror
    await mirrorLocalSnapshotToIndexedDb(true).catch(() => {});
  } catch (e) {
    console.warn('Error deleting all employees:', e);
  } finally {
    notifySubscribersRefresh();
  }
};

// =========================================================================
// APPOINTMENTS PERSISTENCE (Android APK & Offline Guaranteed)
// =========================================================================

export const fetchAppointmentsFromPostgres = async (): Promise<AppointmentRecord[]> => {
  const local = getLocalCache<AppointmentRecord>('appointments');
  try {
    const res = await fetchWithFallback('/api/appointments', { method: 'GET' }, 8000);
    if (res && res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData)) {
        const serverMap = new Map(serverData.map((a: any) => [a.id, a]));
        const merged = [...serverData];
        local.forEach((loc) => {
          if (!serverMap.has(loc.id)) {
            merged.push(loc);
          }
        });
        setLocalCache('appointments', merged);
        return merged;
      }
    }
  } catch (err) {
    console.warn('[fetchAppointmentsFromPostgres] Using local cache:', err);
  }
  return local;
};

export const saveAppointmentToPostgres = async (appt: any): Promise<AppointmentRecord> => {
  const fullAppt: AppointmentRecord = {
    ...appt,
    id: appt.id || `appt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: appt.createdAt || new Date().toISOString(),
  };

  // 1. Save immediately to local cache
  updateLocalCacheItem('appointments', fullAppt);

  // 2. Push to server via fetchWithFallback
  try {
    const res = await fetchWithFallback('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullAppt),
    }, 8000);
    if (res && res.ok) {
      const json = await res.json();
      if (json?.appointment) {
        updateLocalCacheItem('appointments', json.appointment);
        return json.appointment;
      }
    }
  } catch (err) {
    console.warn('[saveAppointmentToPostgres] Offline/Network error, saved locally:', err);
    try {
      addToPendingQueue('APPOINTMENT_CREATE', fullAppt);
    } catch (e) {}
  }
  return fullAppt;
};

export const deleteAppointmentFromPostgres = async (id: string): Promise<void> => {
  removeLocalCacheItem('appointments', id);
  try {
    await fetchWithFallback(`/api/appointments/${id}`, { method: 'DELETE' }, 8000);
  } catch (err) {
    console.warn('[deleteAppointmentFromPostgres] Error deleting on server:', err);
    try {
      addToPendingQueue('APPOINTMENT_DELETE', { id });
    } catch (e) {}
  }
};

export const updateAppointmentInPostgres = async (id: string, updates: any): Promise<void> => {
  const current = getLocalCache<any>('appointments');
  const target = current.find((a) => a.id === id);
  if (target) {
    const updated = { ...target, ...updates };
    updateLocalCacheItem('appointments', updated);
  }
  try {
    await fetchWithFallback(`/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }, 8000);
  } catch (err) {
    console.warn('[updateAppointmentInPostgres] Error updating on server:', err);
  }
};

export const updateCustomerLocation = async (
  contractId: string,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  locationAddress?: string | null
): Promise<boolean> => {
  if (!contractId) return false;
  const isClearing = latitude == null || longitude == null || (latitude === 0 && longitude === 0);
  const nowIso = isClearing ? null : new Date().toISOString();
  const currentContracts = getLocalCache<any>('contracts');
  const contract = currentContracts.find((c: any) => c.id === contractId);

  const updates = {
    latitude: isClearing ? null : latitude,
    longitude: isClearing ? null : longitude,
    locationAddress: isClearing ? null : (locationAddress || contract?.customerAddress || ''),
    locationUpdatedAt: nowIso,
  };

  if (contract) {
    const updated = { ...contract, ...updates };
    updateLocalCacheItem('contracts', updated);
  }

  if (isClearing) {
    // Clear in local payments so past payment GPS won't resurrect the location
    const localPayments = getLocalCache<any>('payments');
    let payChanged = false;
    const updatedPayments = localPayments.map((p: any) => {
      if (p.contractId === contractId || (contract?.customerName && p.customerName && normName(p.customerName) === normName(contract.customerName))) {
        if (p.latitude != null || p.longitude != null) {
          payChanged = true;
          return { ...p, latitude: null, longitude: null };
        }
      }
      return p;
    });
    if (payChanged) {
      setLocalCache('payments', updatedPayments);
    }

    // Clear in local customers
    const localCustomers = getLocalCache<any>('customers');
    let custChanged = false;
    const updatedCusts = localCustomers.map((c: any) => {
      if (c.id === contractId || (contract?.customerName && c.name && normName(c.name) === normName(contract.customerName))) {
        custChanged = true;
        return { ...c, latitude: null, longitude: null, locationAddress: null, locationUpdatedAt: null };
      }
      return c;
    });
    if (custChanged) {
      setLocalCache('customers', updatedCusts);
    }
  }

  mirrorLocalSnapshotToIndexedDb(true);
  notifySubscribersRefresh();

  try {
    const res = await fetchWithFallback(`/api/contracts/${contractId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }, 8000);
    return Boolean(res && res.ok);
  } catch (err) {
    console.warn('[updateCustomerLocation] Offline or network error, queued in pendingQueue:', err);
    try {
      addToPendingQueue('UPDATE_CONTRACT', { id: contractId, ...updates });
    } catch (e) {}
    return true;
  }
};


