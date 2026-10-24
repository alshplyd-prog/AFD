import dotenv from "dotenv";
dotenv.config({ override: true });
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileDb } from "./src/db/fileDb.ts";
import { executePg, isPgConfigured } from "./src/db/dbExecutor.ts";
import { initializeDatabaseSchema } from "./src/db/init.ts";
import { cleanupDuplicateEntities } from "./src/db/cleanupDuplicates.ts";
import { normalizeEntityName } from "./src/lib/nameHelpers.ts";
let globalSyncVersion: number = Date.now();
export function bumpSyncVersion() {
  globalSyncVersion = Date.now();
  try {
    if (isPgConfigured()) {
      executePg(
        `INSERT INTO system_settings (key, value) VALUES ('sync_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(globalSyncVersion)]
      ).catch(() => {});
    }
  } catch (e) {}
}
import { INITIAL_CONTRACTS } from "./src/data/initialContracts.ts";
import fs from "fs";
import webpush from "web-push";

function mapContractRow(r: any) {
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

function mapInventoryRow(r: any) {
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

function mapPaymentRow(r: any) {
  const amt = Number(r.amountPaid ?? r.amount_paid ?? r.amount) || 0;
  let cust = r.customer_name ?? r.customerName ?? r.resolved_customer_name ?? '';
  if (!cust && (r.contract_id || r.contractId)) {
    const cRow = (fileDb.get<any>("contracts") || []).find((c: any) => c.id === (r.contract_id || r.contractId));
    if (cRow?.customerName) cust = cRow.customerName;
  }
  return {
    id: r.id,
    contractId: r.contract_id ?? r.contractId ?? '',
    customerName: cust || '',
    amountPaid: amt,
    paymentDate: r.payment_date ?? r.paymentDate ?? '',
    repName: r.rep_name ?? r.repName ?? '',
    note: r.note ?? '',
    fundId: r.fund_id ?? r.fundId ?? null,
    latitude: r.latitude != null ? Number(r.latitude) : undefined,
    longitude: r.longitude != null ? Number(r.longitude) : undefined,
    updatedAt: r.updated_at ?? r.updatedAt ?? null,
    createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString(),
    isEdited: Boolean(r.is_edited ?? r.isEdited)
  };
}

function mapRepRow(r: any) {
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
    avatarUrl: r.avatar_url ?? r.avatarUrl ?? '',
  };
}

function mapAppointmentRow(r: any) {
  return {
    id: r.id,
    contractId: r.contract_id || r.contractId || '',
    customerName: r.customer_name || r.customerName || '',
    customerPhone: r.customer_phone || r.customerPhone || '',
    customerAddress: r.customer_address || r.customerAddress || '',
    listId: r.list_id || r.listId || '',
    listName: r.list_name || r.listName || '',
    appointmentType: r.appointment_type || r.appointmentType || 'specific_date',
    recurringDay: r.recurring_day != null ? Number(r.recurring_day) : (r.recurringDay != null ? Number(r.recurringDay) : undefined),
    recurringDayName: r.recurring_day_name || r.recurringDayName || '',
    recurringDayOfMonth: r.recurring_day_of_month != null ? Number(r.recurring_day_of_month) : (r.recurringDayOfMonth != null ? Number(r.recurringDayOfMonth) : undefined),
    recurringMonthDayName: r.recurring_month_day_name || r.recurringMonthDayName || '',
    appointmentDate: r.appointment_date || r.appointmentDate || '',
    appointmentTime: r.appointment_time || r.appointmentTime || '',
    dueDate: r.due_date || r.dueDate || '',
    dueTime: r.due_time || r.dueTime || '',
    title: r.title || '',
    notes: r.notes || r.note || '',
    note: r.note || r.notes || '',
    status: r.status || 'pending',
    createdByName: r.created_by_name || r.createdByName || '',
    createdByRepName: r.created_by_rep_name || r.createdByRepName || '',
    createdByRepId: r.created_by_rep_id || r.createdByRepId || '',
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
  };
}

// Helper to adjust cash fund balance safely in both fileDb and PostgreSQL
async function adjustFundBalance(fundId: string, delta: number) {
  if (!fundId || delta === 0) return;
  try {
    // 1. fileDb update
    for (const key of ["cash_funds", "funds"]) {
      const funds = fileDb.get<any>(key) || [];
      const fund = funds.find((f: any) => f.id === fundId);
      if (fund) {
        const newBal = Math.max(0, (Number(fund.balance) || 0) + delta);
        fileDb.update(key, fundId, { ...fund, balance: newBal });
      }
    }
    // 2. PostgreSQL update
    await executePg(`UPDATE cash_funds SET balance = GREATEST(0, COALESCE(balance, 0) + $1) WHERE id = $2`, [delta, fundId]).catch(() => {});
  } catch (err) {
    console.warn("adjustFundBalance error:", fundId, delta, err);
  }
}

function compareEntitiesByOrderIndex(a: any, b: any): number {
  const oA = Number(a?.orderIndex ?? a?.order_index ?? 0);
  const oB = Number(b?.orderIndex ?? b?.order_index ?? 0);
  if (oA !== oB) return oA - oB;
  const timeA = String(a?.createdAt ?? a?.created_at ?? '');
  const timeB = String(b?.createdAt ?? b?.created_at ?? '');
  const tCmp = timeA.localeCompare(timeB);
  if (tCmp !== 0) return tCmp;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

async function recalculateAllFundBalancesInPg() {
  try {
    const lists = fileDb.get<any>("customer_lists") || [];
    const funds = fileDb.get<any>("cash_funds") || fileDb.get<any>("funds") || [];
    const defaultFundId = funds.length > 0 ? funds[0].id : null;

    if (isPgConfigured()) {
      // 1. Resolve and link all payments missing fund_id in PostgreSQL
      await executePg(`
        UPDATE payments p
        SET fund_id = COALESCE(
          NULLIF(p.fund_id, ''),
          (
            SELECT cl.fund_id 
            FROM sales s 
            JOIN customer_lists cl ON (s.list_id = cl.id OR s.list_name = cl.name) 
            WHERE s.id = p.contract_id AND cl.fund_id IS NOT NULL AND cl.fund_id != ''
            LIMIT 1
          ),
          (
            SELECT id 
            FROM cash_funds 
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cash_funds.id)
            ORDER BY COALESCE(order_index, 0) ASC, created_at ASC 
            LIMIT 1
          )
        )
        WHERE (p.fund_id IS NULL OR p.fund_id = '')
          AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id)
      `).catch(() => {});

      // 2. Clean up any orphan installment transactions whose payment was deleted
      await executePg(`
        DELETE FROM fund_transactions
        WHERE id LIKE 'ft_pay_%'
          AND SUBSTRING(id FROM 8) NOT IN (
            SELECT id FROM payments 
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = payments.id)
              AND COALESCE(amount_paid, amount, 0) > 0
          )
      `).catch(() => {});

      // 3. Ensure all active payments have a corresponding fund_transactions record
      await executePg(`
        INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
        SELECT 
          'ft_pay_' || p.id,
          p.fund_id,
          'installment',
          COALESCE(p.amount_paid, p.amount, 0),
          'تسديد قسط زبون: ' || COALESCE(p.customer_name, ''),
          COALESCE(p.rep_name, ''),
          COALESCE(p.created_at, NOW()::text)
        FROM payments p
        WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id)
          AND COALESCE(p.amount_paid, p.amount, 0) > 0
          AND p.fund_id IS NOT NULL 
          AND p.fund_id != ''
        ON CONFLICT (id) DO UPDATE 
        SET amount = EXCLUDED.amount, 
            fund_id = EXCLUDED.fund_id,
            note = EXCLUDED.note,
            rep_name = EXCLUDED.rep_name
      `).catch(() => {});

      // 3.5 Clean duplicate or orphan employee debt transactions in fund_transactions
      await executePg(`
        DELETE FROM fund_transactions
        WHERE id LIKE 'ft_emp_tx_%'
           OR (
             id LIKE 'ft_emp_%' 
             AND SUBSTRING(id FROM 8) NOT IN (
               SELECT id FROM employee_transactions
               WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = employee_transactions.id)
             )
           )
      `).catch(() => {});

      // Ensure all active employee transactions have a corresponding fund_transactions record
      await executePg(`
        INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
        SELECT 
          'ft_emp_' || et.id,
          et.fund_id,
          CASE WHEN et.type IN ('loan', 'debt', 'سلفة', 'دين') THEN 'employee_loan' ELSE 'employee_repay' END,
          COALESCE(et.amount, 0),
          CASE WHEN et.type IN ('loan', 'debt', 'سلفة', 'دين') 
            THEN 'دين / سلفة للموظف (' || COALESCE(et.employee_name, et.rep_name, 'الموظف') || ')' || CASE WHEN et.notes IS NOT NULL AND et.notes != '' THEN ' - ' || et.notes ELSE '' END
            ELSE 'راجع دين / تسديد من الموظف (' || COALESCE(et.employee_name, et.rep_name, 'الموظف') || ')' || CASE WHEN et.notes IS NOT NULL AND et.notes != '' THEN ' - ' || et.notes ELSE '' END
          END,
          COALESCE(et.rep_name, 'الإدارة'),
          COALESCE(et.created_at, NOW()::text)
        FROM employee_transactions et
        WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = et.id)
          AND COALESCE(et.amount, 0) > 0
          AND et.fund_id IS NOT NULL 
          AND et.fund_id != ''
        ON CONFLICT (id) DO UPDATE 
        SET amount = EXCLUDED.amount, 
            fund_id = EXCLUDED.fund_id,
            type = EXCLUDED.type,
            note = EXCLUDED.note,
            rep_name = EXCLUDED.rep_name
      `).catch(() => {});

      // 4. Compute accurate fund balances based on all fund transactions
      const dbFunds = await executePg("SELECT id FROM cash_funds WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cash_funds.id)").catch(() => []);
      for (const f of dbFunds) {
        const fundId = f.id;
        const txRes = await executePg(`
          SELECT COALESCE(SUM(
            CASE 
              WHEN type IN ('deposit', 'installment', 'transfer_in', 'employee_repay') AND fund_id = $1 THEN amount
              WHEN type = 'transfer' AND target_fund_id = $1 THEN amount
              WHEN type IN ('withdraw', 'transfer_out', 'transfer', 'expense', 'employee_loan') AND fund_id = $1 THEN -amount
              ELSE 0 
            END
          ), 0) as total
          FROM fund_transactions
          WHERE (fund_id = $1 OR target_fund_id = $1)
            AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = fund_transactions.id)
        `, [fundId]).catch(() => []);
        const calculatedBalance = Math.max(0, Number(txRes?.[0]?.total) || 0);
        await executePg(`UPDATE cash_funds SET balance = $1 WHERE id = $2`, [calculatedBalance, fundId]).catch(() => {});
      }
    }

    // Also update fileDb funds & transactions
    const filePayments = fileDb.get<any>("payments") || [];
    const fileFundTxs = fileDb.get<any>("fund_transactions") || [];
    const fileEmpTxs = fileDb.get<any>("employee_transactions") || [];
    const activePaymentIds = new Set(filePayments.filter((p: any) => Number(p.amountPaid ?? p.amount) > 0).map((p: any) => String(p.id)));
    const activeEmpTxIds = new Set(fileEmpTxs.map((t: any) => String(t.id)));

    // Clean orphan installment & duplicate employee debt transactions
    let updatedTxs = fileFundTxs.filter((tx: any) => {
      if (tx && tx.id && String(tx.id).startsWith("ft_pay_")) {
        const pId = String(tx.id).replace("ft_pay_", "");
        return activePaymentIds.has(pId);
      }
      if (tx && tx.id && String(tx.id).startsWith("ft_emp_tx_")) {
        return false;
      }
      if (tx && tx.id && String(tx.id).startsWith("ft_emp_")) {
        const empTxId = String(tx.id).replace("ft_emp_", "");
        return activeEmpTxIds.has(empTxId);
      }
      return true;
    });
    let txsChanged = updatedTxs.length !== fileFundTxs.length;

    let paymentsChanged = false;
    for (const p of filePayments) {
      if (!p || (Number(p.amountPaid ?? p.amount) <= 0)) continue;
      const ftId = `ft_pay_${p.id}`;
      let pFundId = p.fundId || p.fund_id;
      if (!pFundId) {
        const contract = (fileDb.get<any>("contracts") || []).find((c: any) => c.id === p.contractId);
        const targetList = lists.find((l: any) => l.id === contract?.listId || l.name === contract?.listName);
        pFundId = targetList?.fundId || targetList?.fund_id || defaultFundId;
        if (pFundId) {
          p.fundId = pFundId;
          paymentsChanged = true;
        }
      }
      if (pFundId) {
        const existingTxIdx = updatedTxs.findIndex((tx: any) => tx.id === ftId);
        const amount = Number(p.amountPaid ?? p.amount) || 0;
        const txObj = {
          id: ftId,
          fundId: pFundId,
          type: 'installment',
          amount,
          note: `تسديد قسط زبون: ${p.customerName || ''}`,
          repName: p.repName || '',
          createdAt: p.createdAt || p.paymentDate || new Date().toISOString()
        };
        if (existingTxIdx >= 0) {
          if (updatedTxs[existingTxIdx].amount !== amount || updatedTxs[existingTxIdx].fundId !== pFundId) {
            updatedTxs[existingTxIdx] = { ...updatedTxs[existingTxIdx], ...txObj };
            txsChanged = true;
          }
        } else {
          updatedTxs.push(txObj);
          txsChanged = true;
        }
      }
    }

    // Ensure 1:1 synchronization for active employee debt transactions
    for (const et of fileEmpTxs) {
      if (!et || Number(et.amount) <= 0 || !et.fundId) continue;
      const ftId = `ft_emp_${et.id}`;
      const isLoan = et.type === 'loan' || et.type === 'debt' || et.type === 'سلفة' || et.type === 'دين';
      const existingTxIdx = updatedTxs.findIndex((tx: any) => tx.id === ftId);
      const amount = Number(et.amount) || 0;
      const empName = et.employeeName || et.repName || 'الموظف';
      const ftObj = {
        id: ftId,
        fundId: et.fundId,
        type: isLoan ? 'employee_loan' : 'employee_repay',
        amount,
        note: isLoan
          ? `دين / سلفة للموظف (${empName})${et.notes ? ` - ${et.notes}` : ''}`
          : `راجع دين / تسديد من الموظف (${empName})${et.notes ? ` - ${et.notes}` : ''}`,
        repName: et.repName || 'الإدارة',
        createdAt: et.createdAt || new Date().toISOString()
      };
      if (existingTxIdx >= 0) {
        if (updatedTxs[existingTxIdx].amount !== amount || updatedTxs[existingTxIdx].fundId !== et.fundId) {
          updatedTxs[existingTxIdx] = { ...updatedTxs[existingTxIdx], ...ftObj };
          txsChanged = true;
        }
      } else {
        updatedTxs.push(ftObj);
        txsChanged = true;
      }
    }

    if (paymentsChanged) {
      fileDb.setAll("payments", filePayments);
    }
    if (txsChanged) {
      fileDb.setAll("fund_transactions", updatedTxs);
    }

    // Recalculate fileDb funds balances
    for (const key of ["cash_funds", "funds"]) {
      const curFunds = fileDb.get<any>(key) || [];
      const updatedCurFunds = curFunds.map((fund: any) => {
        const fundTxs = updatedTxs.filter((tx: any) => tx.fundId === fund.id || tx.targetFundId === fund.id);
        const total = fundTxs.reduce((sum: number, tx: any) => {
          const amt = Number(tx.amount) || 0;
          if (tx.fundId === fund.id) {
            if (tx.type === 'deposit' || tx.type === 'installment' || tx.type === 'transfer_in' || tx.type === 'employee_repay') {
              return sum + amt;
            } else if (tx.type === 'withdraw' || tx.type === 'transfer_out' || tx.type === 'transfer' || tx.type === 'expense' || tx.type === 'employee_loan') {
              return sum - amt;
            }
          } else if (tx.targetFundId === fund.id && tx.type === 'transfer') {
            return sum + amt;
          }
          return sum;
        }, 0);
        return { ...fund, balance: Math.max(0, total) };
      });
      fileDb.setAll(key, updatedCurFunds);
    }
  } catch (err) {
    console.warn("recalculateAllFundBalancesInPg error:", err);
  }
}

// Helper to resolve the correct fund ID for a payment (resolving via customer list if needed)
async function resolveFundIdForPayment(fundId?: string | null, contractId?: string | null, customerName?: string | null): Promise<string | null> {
  try {
    const lists = fileDb.get<any>("customer_lists") || [];
    const funds = fileDb.get<any>("cash_funds") || fileDb.get<any>("funds") || [];

    // 1. If fundId is provided, check if it's already a valid cash fund
    if (fundId) {
      if (funds.some((f: any) => f.id === fundId)) return fundId;

      // Check if fundId was mistakenly passed as a listId
      const listMatch = lists.find((l: any) => l.id === fundId || (l.name && normalizeEntityName(l.name) === normalizeEntityName(fundId)));
      if (listMatch?.fundId || listMatch?.fund_id) {
        return listMatch.fundId || listMatch.fund_id;
      }

      if (isPgConfigured()) {
        const pgFund = await executePg("SELECT id FROM cash_funds WHERE id = $1 LIMIT 1", [fundId]).catch(() => []);
        if (pgFund && pgFund.length > 0) return pgFund[0].id;

        const pgList = await executePg("SELECT fund_id FROM customer_lists WHERE id = $1 OR name = $1 LIMIT 1", [fundId]).catch(() => []);
        if (pgList && pgList.length > 0 && pgList[0].fund_id) return pgList[0].fund_id;
      }
    }

    // 2. If contractId is provided, look up via contract's list
    if (contractId) {
      const contracts = fileDb.get<any>("contracts") || [];
      const contract = contracts.find((c: any) => c.id === contractId);
      const listId = contract?.listId || contract?.list_id;
      if (listId) {
        const l = lists.find((item: any) => item.id === listId || (item.name && normalizeEntityName(item.name) === normalizeEntityName(listId)));
        if (l?.fundId || l?.fund_id) return l.fundId || l.fund_id;
      }

      // Check PostgreSQL
      if (isPgConfigured()) {
        const rows = await executePg(`
          SELECT cl.fund_id 
          FROM sales s 
          JOIN customer_lists cl ON (s.list_id = cl.id OR s.list_name = cl.name) 
          WHERE s.id = $1 
          LIMIT 1
        `, [contractId]).catch(() => []);
        if (rows && rows.length > 0 && rows[0].fund_id) {
          return rows[0].fund_id;
        }
      }
    }

    // 3. If customerName is provided, look up via customer's contract
    if (customerName) {
      const contracts = fileDb.get<any>("contracts") || [];
      const contract = contracts.find((c: any) => c.customerName && normalizeEntityName(c.customerName) === normalizeEntityName(customerName));
      const listId = contract?.listId || contract?.list_id;
      if (listId) {
        const l = lists.find((item: any) => item.id === listId || (item.name && normalizeEntityName(item.name) === normalizeEntityName(listId)));
        if (l?.fundId || l?.fund_id) return l.fundId || l.fund_id;
      }

      if (isPgConfigured()) {
        const rows = await executePg(`
          SELECT cl.fund_id 
          FROM sales s 
          JOIN customer_lists cl ON (s.list_id = cl.id OR s.list_name = cl.name) 
          WHERE LOWER(TRIM(REGEXP_REPLACE(s.customer_name, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE($1, '\\s+', ' ', 'g')))
          LIMIT 1
        `, [customerName]).catch(() => []);
        if (rows && rows.length > 0 && rows[0].fund_id) {
          return rows[0].fund_id;
        }
      }
    }

    // 4. Fallback to first active cash fund so payment is never lost
    if (funds.length > 0) {
      return funds[0].id;
    }
    if (isPgConfigured()) {
      const pgFunds = await executePg(`
        SELECT id FROM cash_funds 
        WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cash_funds.id)
        ORDER BY COALESCE(order_index, 0) ASC, created_at ASC 
        LIMIT 1
      `).catch(() => []);
      if (pgFunds && pgFunds.length > 0) {
        return pgFunds[0].id;
      }
    }
  } catch (err) {
    console.warn("resolveFundIdForPayment error:", err);
  }
  return null;
}

// Concurrency lock map for payment adjustments to prevent race conditions
const paymentAdjustmentMutex = new Map<string, Promise<void>>();

// Helper to record or reverse fund balance adjustment and transaction history for payments (100% Idempotent)
async function recordPaymentFundAdjustment(
  paymentId: string,
  fundId: string,
  amount: number,
  customerName: string,
  repName: string,
  paymentDate: string,
  isReversal = false
) {
  if (!fundId || amount === 0) return;
  const ftId = `ft_pay_${paymentId}`;

  // 1. Concurrency control: wait if another operation for this payment is currently in-flight
  while (paymentAdjustmentMutex.has(ftId)) {
    await paymentAdjustmentMutex.get(ftId)?.catch(() => {});
  }

  let resolveLock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });
  paymentAdjustmentMutex.set(ftId, lockPromise);

  try {
    // 2. Check if fund transaction ft_pay_${paymentId} already exists in DB or fileDb
    let existingFt: any = (fileDb.get<any>("fund_transactions") || []).find((f: any) => f.id === ftId);
    if (!existingFt && isPgConfigured()) {
      const rows = await executePg("SELECT * FROM fund_transactions WHERE id = $1 LIMIT 1", [ftId]).catch(() => []);
      if (rows && rows.length > 0) {
        existingFt = {
          id: rows[0].id,
          fundId: rows[0].fund_id ?? rows[0].fundId,
          amount: Number(rows[0].amount) || 0,
          type: rows[0].type,
          note: rows[0].note,
          repName: rows[0].rep_name ?? rows[0].repName,
          createdAt: rows[0].created_at ?? rows[0].createdAt,
        };
      }
    }

    if (isReversal) {
      // Payment deleted/reversed: delete transaction and deduct fund balance ONLY ONCE
      let deletedAmt = 0;
      let targetFundId = fundId;

      if (isPgConfigured()) {
        const delRes = await executePg("DELETE FROM fund_transactions WHERE id = $1 RETURNING amount, fund_id", [ftId]).catch(() => []);
        if (delRes && delRes.length > 0) {
          deletedAmt = Number(delRes[0].amount) || amount;
          targetFundId = delRes[0].fund_id || fundId;
        }
      }

      if (existingFt && !deletedAmt) {
        deletedAmt = Number(existingFt.amount) || amount;
        targetFundId = existingFt.fundId || fundId;
      }

      fileDb.delete("fund_transactions", ftId);

      if (deletedAmt > 0 && targetFundId) {
        await adjustFundBalance(targetFundId, -deletedAmt);
      }
    } else {
      // Adding or updating installment
      if (existingFt) {
        // Transaction ALREADY exists - only adjust delta if amount or fund changed
        const oldAmt = Number(existingFt.amount) || 0;
        const oldFundId = existingFt.fundId || fundId;

        if (oldFundId !== fundId) {
          // Fund changed: revert from old fund, add to new fund
          await adjustFundBalance(oldFundId, -oldAmt);
          await adjustFundBalance(fundId, +amount);
        } else {
          const diff = amount - oldAmt;
          if (diff !== 0) {
            await adjustFundBalance(fundId, diff);
          }
        }

        const note = `تسديد قسط زبون: ${customerName || ''}`;
        const createdAt = paymentDate ? new Date(paymentDate).toISOString() : (existingFt.createdAt || new Date().toISOString());

        await executePg(`
          UPDATE fund_transactions SET fund_id = $1, amount = $2, note = $3, rep_name = $4
          WHERE id = $5
        `, [fundId, amount, note, repName || '', ftId]).catch(() => {});

        fileDb.update("fund_transactions", ftId, {
          id: ftId,
          fundId,
          type: 'installment',
          amount,
          note,
          repName: repName || '',
          createdAt
        });
      } else {
        // Brand new installment transaction
        const note = `تسديد قسط زبون: ${customerName || ''}`;
        const createdAt = paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString();

        if (isPgConfigured()) {
          // Atomic insert: if already inserted by a parallel request, ON CONFLICT returns 0 rows!
          const insertRes = await executePg(`
            INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
            VALUES ($1, $2, 'installment', $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING
            RETURNING id
          `, [ftId, fundId, amount, note, repName || '', createdAt]).catch(() => []);

          if (!insertRes || insertRes.length === 0) {
            // Already inserted concurrently! Do NOT adjust fund balance again.
            fileDb.upsert("fund_transactions", {
              id: ftId,
              fundId,
              type: 'installment',
              amount,
              note,
              repName: repName || '',
              createdAt
            });
            return;
          }
        }

        // Prevent fileDb double-apply when running without PG
        if (!isPgConfigured() && (fileDb.get<any>("fund_transactions") || []).some((f: any) => f.id === ftId)) {
          return;
        }

        fileDb.upsert("fund_transactions", {
          id: ftId,
          fundId,
          type: 'installment',
          amount,
          note,
          repName: repName || '',
          createdAt
        });

        // Add to fund balance EXACTLY ONCE
        await adjustFundBalance(fundId, +amount);
      }
    }
  } finally {
    paymentAdjustmentMutex.delete(ftId);
    resolveLock();
  }
}

function mapFundRow(r: any) {
  return {
    id: r.id,
    name: r.name ?? '',
    balance: Number(r.balance) || 0,
    description: r.description ?? '',
    orderIndex: Number(r.order_index ?? r.orderIndex ?? 0),
    createdAt: r.created_at ?? r.createdAt ?? new Date().toISOString()
  };
}

function mapCustomerListRow(r: any) {
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

function mapFundTxRow(r: any) {
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

function mapEmployeeRow(r: any) {
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

function mapEmpTxRow(r: any) {
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

function mapConflictRow(r: any) {
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

// ==========================================
// Web Push Notifications System (Closed App / Background)
// ==========================================
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || '',
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
};

const VAPID_KEY_FILE = path.join(process.cwd(), 'data', 'vapid_keys.json');
const PUSH_SUBS_FILE = path.join(process.cwd(), 'data', 'push_subscriptions.json');

async function initVapidKeys() {
  try {
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      if (fs.existsSync(VAPID_KEY_FILE)) {
        try {
          const content = JSON.parse(fs.readFileSync(VAPID_KEY_FILE, 'utf8'));
          if (content.publicKey && content.privateKey) {
            vapidKeys = content;
          }
        } catch (e) {}
      }
    }
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      if (isPgConfigured()) {
        try {
          await executePg("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
          const rows = await executePg("SELECT value FROM system_settings WHERE key = 'vapid_keys'");
          if (rows.length > 0 && rows[0].value) {
            const parsed = JSON.parse(rows[0].value);
            if (parsed.publicKey && parsed.privateKey) {
              vapidKeys = parsed;
            }
          }
        } catch (e) {}
      }
    }
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      const generated = webpush.generateVAPIDKeys();
      vapidKeys = generated;
      try {
        if (!fs.existsSync(path.dirname(VAPID_KEY_FILE))) {
          fs.mkdirSync(path.dirname(VAPID_KEY_FILE), { recursive: true });
        }
        fs.writeFileSync(VAPID_KEY_FILE, JSON.stringify(vapidKeys, null, 2));
      } catch (e) {}
      if (isPgConfigured()) {
        try {
          await executePg(
            `INSERT INTO system_settings (key, value) VALUES ('vapid_keys', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [JSON.stringify(vapidKeys)]
          );
        } catch (e) {}
      }
    }
    if (vapidKeys.publicKey && vapidKeys.privateKey) {
      webpush.setVapidDetails('mailto:support@alkarrar.com', vapidKeys.publicKey, vapidKeys.privateKey);
      console.log('[WebPush] VAPID initialized. Public key length:', vapidKeys.publicKey.length);
    }
  } catch (err) {
    console.warn('[WebPush] VAPID initialization notice:', err);
  }
}

interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  subscription: any;
  repId?: string;
  repName?: string;
  role?: string;
  allowedListIds?: string[];
  updatedAt: number;
}

let pushSubsCache: Map<string, PushSubscriptionRecord> = new Map();

function loadPushSubsFromFile(): Map<string, PushSubscriptionRecord> {
  const map = new Map<string, PushSubscriptionRecord>();
  try {
    if (fs.existsSync(PUSH_SUBS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf8'));
      if (Array.isArray(arr)) {
        arr.forEach((item) => {
          if (item && item.endpoint) map.set(item.endpoint, item);
        });
      }
    }
  } catch (e) {}
  return map;
}

function savePushSubsToFile(map: Map<string, PushSubscriptionRecord>) {
  try {
    if (!fs.existsSync(path.dirname(PUSH_SUBS_FILE))) {
      fs.mkdirSync(path.dirname(PUSH_SUBS_FILE), { recursive: true });
    }
    fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(Array.from(map.values()), null, 2));
  } catch (e) {}
}

async function initPushSubscriptionsTable() {
  pushSubsCache = loadPushSubsFromFile();
  if (isPgConfigured()) {
    try {
      await executePg(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          endpoint TEXT PRIMARY KEY,
          subscription_json TEXT NOT NULL,
          rep_id TEXT,
          rep_name TEXT,
          role TEXT,
          allowed_list_ids TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      const rows = await executePg("SELECT * FROM push_subscriptions");
      if (Array.isArray(rows)) {
        rows.forEach((r: any) => {
          try {
            const subJson = JSON.parse(r.subscription_json);
            let allowed: string[] = [];
            try { allowed = r.allowed_list_ids ? JSON.parse(r.allowed_list_ids) : []; } catch (e) {
              allowed = r.allowed_list_ids ? String(r.allowed_list_ids).split(',') : [];
            }
            pushSubsCache.set(r.endpoint, {
              id: r.endpoint,
              endpoint: r.endpoint,
              subscription: subJson,
              repId: r.rep_id,
              repName: r.rep_name,
              role: r.role,
              allowedListIds: allowed,
              updatedAt: new Date(r.updated_at || Date.now()).getTime(),
            });
          } catch (e) {}
        });
        savePushSubsToFile(pushSubsCache);
      }
    } catch (e) {
      console.warn('[WebPush] PostgreSQL subscriptions table notice:', e);
    }
  }
}

async function savePushSubscription(record: PushSubscriptionRecord) {
  pushSubsCache.set(record.endpoint, record);
  savePushSubsToFile(pushSubsCache);
  if (isPgConfigured()) {
    try {
      await executePg(
        `INSERT INTO push_subscriptions (endpoint, subscription_json, rep_id, rep_name, role, allowed_list_ids, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (endpoint) DO UPDATE SET 
           subscription_json = EXCLUDED.subscription_json,
           rep_id = EXCLUDED.rep_id,
           rep_name = EXCLUDED.rep_name,
           role = EXCLUDED.role,
           allowed_list_ids = EXCLUDED.allowed_list_ids,
           updated_at = NOW()`,
        [
          record.endpoint,
          JSON.stringify(record.subscription),
          record.repId || null,
          record.repName || null,
          record.role || null,
          JSON.stringify(record.allowedListIds || []),
        ]
      ).catch(() => {});
    } catch (e) {}
  }
}

async function removePushSubscription(endpoint: string) {
  pushSubsCache.delete(endpoint);
  savePushSubsToFile(pushSubsCache);
  if (isPgConfigured()) {
    try {
      await executePg("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]).catch(() => {});
    } catch (e) {}
  }
}

export async function broadcastPushNotification(options: {
  title: string;
  body: string;
  tag?: string;
  type: 'sale' | 'appointment' | 'conflict' | 'debt' | 'repay';
  listId?: string | null;
  targetRepId?: string | null;
  targetRepName?: string | null;
  data?: any;
}) {
  const { title, body, tag, type, listId, targetRepId, targetRepName, data } = options;
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) return;
  const subs = Array.from(pushSubsCache.values());
  if (subs.length === 0) return;

  const payloadString = JSON.stringify({
    title,
    body,
    tag: tag || `push_${Date.now()}`,
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    data: data || {},
  });

  const promises = subs.map(async (sub) => {
    // 1. Sales: Anyone who has access to the customer list
    if (type === 'sale') {
      const hasAccess =
        !sub.role ||
        sub.role === 'admin' ||
        (sub.repName && sub.repName.includes('ضياء')) ||
        sub.repId === 'rep-1' ||
        (sub.allowedListIds &&
          (sub.allowedListIds.includes('all') || (listId && sub.allowedListIds.includes(listId))));
      if (!hasAccess) return;
    }
    // 2. Appointments: Anyone who has access to the list
    else if (type === 'appointment') {
      const hasAccess =
        !sub.role ||
        sub.role === 'admin' ||
        (sub.repName && sub.repName.includes('ضياء')) ||
        sub.repId === 'rep-1' ||
        (sub.allowedListIds &&
          (sub.allowedListIds.includes('all') || (listId && sub.allowedListIds.includes(listId))));
      if (!hasAccess) return;
    }
    // 3. Payment Conflicts: Admin/supervisor, or assigned rep, or list access
    else if (type === 'conflict') {
      const isSupervisorOrAdmin = !sub.role || sub.role === 'admin' || sub.role === 'supervisor';
      const isAssigned = Boolean(targetRepName && sub.repName && targetRepName.trim().toLowerCase() === sub.repName.trim().toLowerCase());
      const hasList = Boolean(
        sub.allowedListIds &&
        (sub.allowedListIds.includes('all') || (listId && sub.allowedListIds.includes(listId)))
      );
      if (!isSupervisorOrAdmin && !isAssigned && !hasList) return;
    }
    // 4. Debts and Return of Debt: For Admin/Supervisor or the representative who owns the debt/repayment
    else if (type === 'debt' || type === 'repay') {
      const isSupervisorOrAdmin = !sub.role || sub.role === 'admin' || sub.role === 'supervisor';
      const normTarget = (targetRepName || '').trim().toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      const normSub = (sub.repName || '').trim().toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
      const isOwner = Boolean(
        isSupervisorOrAdmin ||
        (normTarget && normSub && (normTarget === normSub || normSub.includes(normTarget) || normTarget.includes(normSub))) ||
        (targetRepId && sub.repId && (
          targetRepId === sub.repId ||
          targetRepId === `rep-emp-${sub.repId}` ||
          targetRepId === `rep_${sub.repId}` ||
          sub.repId === `rep-emp-${targetRepId}` ||
          sub.repId === `rep_${targetRepId}`
        ))
      );
      if (!isOwner) return;
    }

    try {
      await webpush.sendNotification(sub.subscription, payloadString, {
        TTL: 86400,
        urgency: 'high',
      });
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await removePushSubscription(sub.endpoint);
      }
    }
  });

  await Promise.allSettled(promises);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Clean up any stale in-memory contracts if cleared

  // Run DB schema init & initial sync & deduplication in background so server listens immediately
  initializeDatabaseSchema()
    .then(async () => {
      if (isPgConfigured()) {
        await executePg(`
          CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments (contract_id);
          CREATE INDEX IF NOT EXISTS idx_payments_customer_name ON payments (customer_name);
          CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date);
          CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales (customer_name);
          CREATE INDEX IF NOT EXISTS idx_sales_list_id ON sales (list_id);
          CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
          CREATE INDEX IF NOT EXISTS idx_deleted_records_lookup ON deleted_records (record_id, table_name);
          ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          ALTER TABLE cash_funds ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
          ALTER TABLE customer_lists ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
          ALTER TABLE customer_lists ADD COLUMN IF NOT EXISTS receipt_template TEXT DEFAULT 'template_1';

          WITH numbered_funds AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(order_index, 0) ASC, created_at ASC, id ASC) - 1 as new_idx
            FROM cash_funds
          )
          UPDATE cash_funds cf
          SET order_index = nf.new_idx
          FROM numbered_funds nf
          WHERE cf.id = nf.id AND (cf.order_index IS NULL);

          WITH numbered_lists AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY COALESCE(order_index, 0) ASC, created_at ASC, id ASC) - 1 as new_idx
            FROM customer_lists
          )
          UPDATE customer_lists cl
          SET order_index = nl.new_idx
          FROM numbered_lists nl
          WHERE cl.id = nl.id AND (cl.order_index IS NULL);
        `).catch(() => {});
      }
      await cleanupDuplicateEntities().catch((e) => console.warn("Deduplication cleanup notice:", e));
      await recalculateAllFundBalancesInPg().catch((e) => console.warn("Recalculate balances notice:", e));
      await initVapidKeys().catch((e) => console.warn("Vapid init notice:", e));
      await initPushSubscriptionsTable().catch((e) => console.warn("Push subs table notice:", e));
      return;
    })
    .catch((err) => console.warn("Background DB initialization notice:", err));

  console.log("SERVER DB CONFIG:", isPgConfigured() ? "PostgreSQL + FileDB" : "Local FileDB Engine");

  // CORS middleware for Web, APK, Capacitor, and remote clients
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Range");
    res.header("Access-Control-Expose-Headers", "Content-Length, Content-Range");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.text({ type: ['text/*', 'text/plain', 'application/json'], limit: '50mb' }));

  // Robust body normalizer to automatically parse string/buffer request bodies into JSON objects
  app.use((req, res, next) => {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      try {
        const rawStr = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
        if (rawStr && (rawStr.trim().startsWith('{') || rawStr.trim().startsWith('['))) {
          req.body = JSON.parse(rawStr);
        }
      } catch (e) {}
    }
    next();
  });

  // URL normalization middleware for hyphenated / underscore / alias API routes
  app.use((req, _res, next) => {
    if (req.url.startsWith("/api/customer_lists") || req.url.startsWith("/api/lists")) {
      req.url = req.url.replace(/^\/api\/(customer_lists|lists)/, "/api/customer-lists");
    } else if (req.url.startsWith("/api/representatives")) {
      req.url = req.url.replace(/^\/api\/representatives/, "/api/reps");
    } else if (req.url.startsWith("/api/fund_transactions")) {
      req.url = req.url.replace("/api/fund_transactions", "/api/fund-transactions");
    } else if (req.url.startsWith("/api/employee_transactions")) {
      req.url = req.url.replace("/api/employee_transactions", "/api/employee-transactions");
    } else if (req.url.startsWith("/api/payment_conflicts")) {
      req.url = req.url.replace("/api/payment_conflicts", "/api/payment-conflicts");
    }
    next();
  });

  // Health check API route
  app.get("/api/health", async (req, res) => {
    let deletedCount = 0;
    try {
      if (isPgConfigured()) {
        const dRes = await executePg("SELECT COUNT(*) as count FROM deleted_records").catch(() => []);
        if (dRes && dRes[0]?.count) deletedCount = Number(dRes[0].count);
      }
    } catch (e) {}

    res.json({
      status: "ok",
      database: isPgConfigured() ? "postgresql" : "filedb",
      persistent: true,
      syncVersion: globalSyncVersion,
      deletedCount,
      timestamp: Date.now(),
    });
  });

  // Temporary storage for shared statement PDFs
  app.post("/api/save-statement-pdf", (req, res) => {
    try {
      const { filename, base64Data } = req.body || {};
      if (!base64Data) {
        return res.status(400).json({ error: "No PDF data" });
      }
      const sharedDir = path.resolve(process.cwd(), "public", "shared_pdfs");
      if (!fs.existsSync(sharedDir)) {
        fs.mkdirSync(sharedDir, { recursive: true });
      }
      const safeName = (filename || "statement").replace(/[^a-zA-Z0-9_\u0600-\u06FF.-]/g, "_");
      const finalName = safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`;
      const filePath = path.join(sharedDir, finalName);
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(filePath, buffer);
      const fileUrl = `/shared_pdfs/${encodeURIComponent(finalName)}`;
      return res.json({ success: true, url: fileUrl });
    } catch (e: any) {
      console.warn("Error saving statement PDF:", e);
      return res.status(500).json({ error: "Failed to save PDF" });
    }
  });

  // Explicit download / inline view route for shared PDFs
  app.get("/shared_pdfs/:filename", (req, res) => {
    try {
      const filename = req.params.filename;
      const sharedDir = path.resolve(process.cwd(), "public", "shared_pdfs");
      const filePath = path.join(sharedDir, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(filename)}"`);
        return fs.createReadStream(filePath).pipe(res);
      }
      return res.status(404).send("PDF not found");
    } catch (e) {
      return res.status(500).send("Error reading PDF");
    }
  });

  // Welcome message settings API
  app.get("/api/settings/welcome", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT value FROM system_settings WHERE key = 'welcome_message'");
          if (rows.length > 0 && rows[0].value) {
            try {
              return res.json(JSON.parse(rows[0].value));
            } catch (e) {}
          }
        } catch (pgErr) {
          try {
            await executePg("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
            const rows = await executePg("SELECT value FROM system_settings WHERE key = 'welcome_message'");
            if (rows.length > 0 && rows[0].value) {
              return res.json(JSON.parse(rows[0].value));
            }
          } catch (e2) {}
        }
      }
      const items = fileDb.get<any>("system_settings");
      const val = items.find((i: any) => i.id === 'welcome_message') || items[0];
      if (val && val.value) {
        try { return res.json(typeof val.value === 'string' ? JSON.parse(val.value) : val.value); } catch (e) {}
      }
      res.json({ title: 'أهلاً بك في نظام مبيعات الأقساط', subtitle: 'اختر القسم الذي تريد الدخول إليه:' });
    } catch (err: any) {
      res.json({ title: 'أهلاً بك في نظام مبيعات الأقساط', subtitle: 'اختر القسم الذي تريد الدخول إليه:' });
    }
  });

  app.post("/api/settings/welcome", async (req, res) => {
    try {
      const { title, subtitle } = req.body;
      const data = {
        title: title || 'أهلاً بك في نظام مبيعات الأقساط',
        subtitle: subtitle || 'اختر القسم الذي تريد الدخول إليه:'
      };
      const jsonStr = JSON.stringify(data);
      fileDb.upsert("system_settings", { id: 'welcome_message', key: 'welcome_message', value: jsonStr });
      if (isPgConfigured()) {
        try {
          await executePg(
            `INSERT INTO system_settings (key, value) VALUES ('welcome_message', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [jsonStr]
          );
        } catch (pgErr) {
          await executePg("CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
          await executePg(
            `INSERT INTO system_settings (key, value) VALUES ('welcome_message', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [jsonStr]
          );
        }
      }
      res.json({ success: true, ...data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database Seed API route - Only runs on explicit admin request
  app.post("/api/seed", async (req, res) => {
    try {
      res.json({ success: true, message: 'Database ready' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/init-db", async (req, res) => {
    try {
      await initializeDatabaseSchema();
      await initVapidKeys();
      await initPushSubscriptionsTable();
      res.json({ success: true, message: 'Database schema and tables initialized successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Web Push Notification Routes (Closed-App Background Notifications) ---
  app.get("/api/push-vapid-public-key", (req, res) => {
    res.json({ success: true, publicKey: vapidKeys.publicKey });
  });

  app.post("/api/push-subscribe", async (req, res) => {
    try {
      const { subscription, repId, repName, role, allowedListIds } = req.body || {};
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription' });
      }
      await savePushSubscription({
        id: subscription.endpoint,
        endpoint: subscription.endpoint,
        subscription,
        repId: repId || undefined,
        repName: repName || undefined,
        role: role || undefined,
        allowedListIds: Array.isArray(allowedListIds) ? allowedListIds : [],
        updatedAt: Date.now(),
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push-unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body || {};
      if (endpoint) {
        await removePushSubscription(endpoint);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push-test", async (req, res) => {
    try {
      await broadcastPushNotification({
        title: '🔔 إشعار تجريبي خارجي',
        body: 'تم استلام الإشعار الخارجي بنجاح حتى عندما يكون التطبيق مغلقاً تماماً!',
        tag: `test_${Date.now()}`,
        type: 'sale',
      });
      res.json({ success: true, message: 'Test notification sent to all active subscriptions' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Inventory API ---
  app.get("/api/inventory", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT * FROM inventory_items 
            WHERE (id LIKE 'item_%' OR (id NOT LIKE 'emp_%' AND id NOT LIKE 'pay_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'ft_%' AND id NOT LIKE 'emptx_%' AND id NOT LIKE 'conflict_%'))
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = inventory_items.id AND (dr.table_name = 'inventory_items' OR dr.table_name = 'inventory' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `);
          const items = (rows || []).map(mapInventoryRow);
          fileDb.setAll("inventory_items", items);
          return res.json(items);
        } catch (pgErr) {
          console.warn("Postgres fetch inventory error, fallback to fileDb:", pgErr);
        }
      }
      const raw = fileDb.get("inventory_items") || [];
      const clean = raw.filter((i: any) => 
        i && i.id && (i.id.startsWith('item_') || (!i.id.startsWith('emp_') && !i.id.startsWith('pay_') && !i.id.startsWith('contract_') && !i.id.startsWith('ft_') && !i.id.startsWith('emptx_') && !i.id.startsWith('conflict_')))
      );
      res.json(clean);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/inventory", async (req, res) => {
    try {
      const item = req.body;
      const id = item.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("inventory_items", {
        id,
        name: item.name && item.name.trim() ? item.name : 'مادة',
        price: Number(item.price ?? item.sellingPrice ?? item.unitPrice) || 0,
        purchasePrice: Number(item.purchasePrice ?? item.costPrice) || 0,
        quantity: Number(item.quantity) || 0,
        dailyInstallment: Number(item.dailyInstallment) || 0,
        category: item.category || '',
        createdAt: item.createdAt || new Date().toISOString()
      });

      const query1 = `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, purchase_price=EXCLUDED.purchase_price, quantity=EXCLUDED.quantity, daily_installment=EXCLUDED.daily_installment, category=EXCLUDED.category`;
      const vals = [id, saved.name, saved.price, saved.purchasePrice, saved.quantity, saved.dailyInstallment, saved.category];

      await executePg(query1, vals);

      bumpSyncVersion();
      res.json({ success: true, item: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/inventory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      fileDb.update("inventory_items", id, updates);

      const fieldMap: Record<string, string> = {
        name: 'name',
        price: 'price',
        sellingPrice: 'price',
        purchasePrice: 'purchase_price',
        costPrice: 'purchase_price',
        purchase_price: 'purchase_price',
        quantity: 'quantity',
        dailyInstallment: 'daily_installment',
        daily_installment: 'daily_installment',
        category: 'category',
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const addedCols = new Set<string>();

      for (const [k, v] of Object.entries(updates)) {
        if (k === 'id') continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }

      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE inventory_items SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
      }

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[PUT /api/inventory/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/inventory/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("inventory_items", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'inventory_items') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM inventory_items WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Helper to purge deleted customers in PG ---
  const syncCustomersTableInPg = async () => {
    if (!isPgConfigured()) return;
    try {
      // 1. Purge deleted records from customers table that are recorded in deleted_records
      await executePg(`
        DELETE FROM customers 
        WHERE id IN (
          SELECT record_id FROM deleted_records 
          WHERE table_name IN ('customers', 'sales', 'contracts')
        )
      `).catch(() => {});

      // 2. Automatically delete orphaned customers who have no contracts in sales or contracts
      const orphaned = await executePg(`
        SELECT c.id FROM customers c
        WHERE NOT EXISTS (
          SELECT 1 FROM sales s 
          WHERE s.customer_name = c.name OR s.customer_id = c.id OR s.id = c.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM contracts ct 
          WHERE ct.customer_name = c.name OR ct.customer_id = c.id OR ct.id = c.id
        )
      `).catch(() => []);

      if (Array.isArray(orphaned) && orphaned.length > 0) {
        const orphanIds = orphaned.map((o: any) => o.id).filter(Boolean);
        if (orphanIds.length > 0) {
          await executePg(
            `INSERT INTO deleted_records (record_id, table_name)
             SELECT unnest($1::text[]), 'customers'
             ON CONFLICT (record_id) DO NOTHING`,
            [orphanIds]
          ).catch(() => {});
          await executePg(`DELETE FROM customers WHERE id = ANY($1)`, [orphanIds]).catch(() => {});
          for (const oid of orphanIds) {
            fileDb.delete("customers", oid);
          }
        }
      }

      // 3. Automatically link and fix any customer contracts with missing list_id or list_name
      await executePg(`
        -- Link by name if list_id is missing
        UPDATE sales s
        SET list_id = cl.id
        FROM customer_lists cl
        WHERE (s.list_id IS NULL OR s.list_id = '' OR s.list_id = 'unknown')
          AND TRIM(LOWER(s.list_name)) = TRIM(LOWER(cl.name));

        -- Link by list_id if list_name is missing
        UPDATE sales s
        SET list_name = cl.name
        FROM customer_lists cl
        WHERE s.list_id = cl.id
          AND (s.list_name IS NULL OR s.list_name = '');

        -- For any remaining sales without valid list_id, assign to primary customer list
        UPDATE sales
        SET list_id = (SELECT id FROM customer_lists ORDER BY order_index ASC, created_at ASC LIMIT 1),
            list_name = (SELECT name FROM customer_lists ORDER BY order_index ASC, created_at ASC LIMIT 1)
        WHERE (list_id IS NULL OR list_id = '' OR list_id = 'unknown')
          AND EXISTS (SELECT 1 FROM customer_lists);

        -- Synchronize GPS locations between sales and customers if missing on one side
        UPDATE customers c
        SET latitude = s.latitude, longitude = s.longitude, location_address = COALESCE(c.location_address, s.location_address)
        FROM sales s
        WHERE (c.id = s.customer_id OR c.name = s.customer_name)
          AND (c.latitude IS NULL OR c.latitude = 0)
          AND s.latitude IS NOT NULL AND s.latitude != 0;

        UPDATE sales s
        SET latitude = c.latitude, longitude = c.longitude, location_address = COALESCE(s.location_address, c.location_address)
        FROM customers c
        WHERE (c.id = s.customer_id OR c.name = s.customer_name)
          AND (s.latitude IS NULL OR s.latitude = 0)
          AND c.latitude IS NOT NULL AND c.latitude != 0;
      `).catch(() => {});
    } catch (e) {
      console.warn("syncCustomersTableInPg error:", e);
    }
  };

  // --- Contracts API ---
  const syncContractBalancesInPgAndFileDb = async (specificContractIds?: string[]) => {
    const hasSpecific = Array.isArray(specificContractIds) && specificContractIds.length > 0;
    const targetIds = hasSpecific ? specificContractIds.filter(Boolean) : [];

    if (isPgConfigured()) {
      try {
        // Purge any payments that are tombstoned in deleted_records or whose contract no longer exists
        await executePg(`
          DELETE FROM payments 
          WHERE (contract_id IS NOT NULL AND contract_id != '' AND contract_id NOT IN (SELECT id FROM sales UNION SELECT id FROM contracts))
             OR id IN (SELECT record_id FROM deleted_records WHERE table_name = 'payments');
        `).catch(() => {});

        const whereClause = hasSpecific ? `WHERE c.id = ANY($1)` : ``;
        const params = hasSpecific ? [targetIds] : [];

        await executePg(`
          UPDATE sales c
          SET 
            total_paid = LEAST(
              GREATEST(0, COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)),
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND dr.table_name = 'payments')
              ), 0)
            ),
            remaining_balance = GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - COALESCE((
              SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
              FROM payments p
              WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND dr.table_name = 'payments')
            ), 0)),
            last_payment_date = (
              SELECT MAX(p.payment_date)
              FROM payments p
              WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND dr.table_name = 'payments')
            ),
            status = CASE 
              WHEN GREATEST(0, (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) - COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND dr.table_name = 'payments')
              ), 0)) = 0 AND (
                COALESCE((
                  SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                  FROM payments p
                  WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                    AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND dr.table_name = 'payments')
                ), 0) > 0 OR (COALESCE(c.total_price, 0) - COALESCE(c.advance_payment, 0)) = 0
              ) THEN 'completed' 
              ELSE 'active' 
            END
          ${whereClause}
        `, params);

        if (!hasSpecific) {
          const pgContracts = await executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name IN ('sales', 'contracts') OR dr.table_name IS NULL))
            ORDER BY c.created_at ASC, c.id ASC
          `).catch(() => []);
          if (Array.isArray(pgContracts)) {
            fileDb.setAll("contracts", pgContracts.map(mapContractRow));
          }
          const pgPayments = await executePg(`
            SELECT * FROM payments
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))
            ORDER BY payment_date DESC, created_at DESC
          `).catch(() => []);
          if (Array.isArray(pgPayments)) {
            fileDb.setAll("payments", pgPayments.map(mapPaymentRow));
          }
        }
      } catch (err) {
        console.warn("syncContractBalancesInPg error:", err);
      }
    } else {
      try {
        const allContracts = fileDb.get("contracts") || [];
        const allPayments = fileDb.get("payments") || [];
        const updated = allContracts.map((c: any) => {
          const cNameNorm = normalizeEntityName(c.customerName);
          const cPayments = allPayments.filter(
            (p: any) => (p.contractId && p.contractId.trim()) ? p.contractId === c.id : (p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm)
          );
          const paymentsSum = cPayments.reduce((sum: number, p: any) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
          const net = Math.max(0, (Number(c.totalPrice) || 0) - (Number(c.advancePayment) || 0));
          const totalPaid = net > 0 ? Math.min(net, paymentsSum) : paymentsSum;
          const excessAmount = Math.max(0, paymentsSum - net);
          const remainingBalance = Math.max(0, net - paymentsSum);
          const status = (remainingBalance === 0 && (net === 0 || paymentsSum > 0)) ? 'completed' : 'active';
          const sorted = [...cPayments].sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
          const lastPaymentDate = sorted[0]?.paymentDate || null;
          return {
            ...c,
            totalPaid,
            excessAmount,
            rawTotalPaid: paymentsSum,
            remainingBalance,
            status,
            lastPaymentDate,
          };
        });
        fileDb.setAll("contracts", updated);
      } catch (e) {
        // ignore
      }
    }
  };

  app.get(["/api/contracts", "/api/sales"], async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const sql = `
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name IS NULL))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE c.id NOT LIKE 'pay_%' AND c.id NOT LIKE 'ft_%' AND c.id NOT LIKE 'emptx_%' AND c.id NOT LIKE 'conflict_%'
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name IN ('sales', 'contracts') OR dr.table_name IS NULL))
            ORDER BY c.created_at ASC, c.id ASC
          `;
          const rows = await executePg(sql);
          let contracts = (rows || []).map(mapContractRow).filter(c => c && c.id && !c.id.startsWith('pay_') && !c.id.startsWith('ft_') && !c.id.startsWith('emptx_'));
          fileDb.setAll("contracts", contracts);
          return res.json(contracts);
        } catch (pgErr) {
          console.warn("Postgres fetch contracts error, fallback to fileDb:", pgErr);
        }
      }
      
      let allContracts = (fileDb.get("contracts") || []).filter((c: any) => c && c.id && !String(c.id).startsWith('pay_') && !String(c.id).startsWith('ft_') && !String(c.id).startsWith('emptx_') && !String(c.id).startsWith('conflict_'));
      const allPayments = fileDb.get("payments") || [];
      const contracts = allContracts.map((c: any) => {
        const cNameNorm = normalizeEntityName(c.customerName);
        const cPayments = allPayments.filter(
          (p: any) => (p.contractId && p.contractId.trim()) ? p.contractId === c.id : (p.customerName && cNameNorm && normalizeEntityName(p.customerName) === cNameNorm)
        );
        const paymentsSum = cPayments.reduce((sum: number, p: any) => sum + (Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0), 0);
        const net = Math.max(0, (Number(c.totalPrice) || 0) - (Number(c.advancePayment) || 0));
        const totalPaid = net > 0 ? Math.min(net, paymentsSum) : paymentsSum;
        const excessAmount = Math.max(0, paymentsSum - net);
        const remainingBalance = Math.max(0, net - paymentsSum);
        const status = (remainingBalance === 0 && (net === 0 || paymentsSum > 0)) ? 'completed' : 'active';
        const sorted = [...cPayments].sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        const lastPaymentDate = sorted[0]?.paymentDate || null;
        return {
          ...c,
          totalPaid,
          excessAmount,
          rawTotalPaid: paymentsSum,
          remainingBalance,
          status,
          lastPaymentDate,
        };
      });
      res.json(contracts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(["/api/contracts", "/api/sales"], async (req, res) => {
    try {
      const c = req.body;
      if (c && c.id && (String(c.id).startsWith('pay_') || String(c.id).startsWith('ft_') || String(c.id).startsWith('emptx_') || String(c.id).startsWith('conflict_'))) {
        console.warn(`[POST /api/contracts] Blocked non-contract ID: ${c.id}`);
        return res.status(400).json({ error: 'Invalid contract ID' });
      }
      const id = c.id || `contract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("contracts", {
        id,
        customerName: c.customerName || '',
        customerPhone: c.customerPhone || '',
        customerAddress: c.customerAddress || '',
        itemId: c.itemId || null,
        itemName: c.itemName || '',
        itemQuantity: Number(c.itemQuantity) || 1,
        purchasePrice: Number(c.purchasePrice) || 0,
        listId: c.listId || null,
        listName: c.listName || null,
        totalPrice: Number(c.totalPrice) || 0,
        advancePayment: Number(c.advancePayment) || 0,
        remainingBalance: Number(c.remainingBalance) || 0,
        dailyInstallment: Number(c.dailyInstallment) || 0,
        startDate: c.startDate || new Date().toISOString().split('T')[0],
        notes: c.notes || '',
        status: c.status || 'active',
        lastPaymentDate: c.lastPaymentDate || null,
        totalPaid: Number(c.totalPaid) || 0,
        repName: c.repName || '',
        latitude: c.latitude != null ? Number(c.latitude) : (c.lat != null ? Number(c.lat) : null),
        longitude: c.longitude != null ? Number(c.longitude) : (c.lng != null ? Number(c.lng) : null),
        locationAddress: c.locationAddress || c.location_address || '',
        locationUpdatedAt: c.locationUpdatedAt || c.location_updated_at || null,
        createdAt: c.createdAt || new Date().toISOString(),
        completedAt: c.completedAt || null,
        updatedAt: c.updatedAt || null,
        isEdited: Boolean(c.isEdited)
      });

      const sql1 = `INSERT INTO sales (
          id, customer_name, customer_phone, customer_address, item_id, item_name,
          item_quantity, purchase_price, list_id, list_name, total_price, advance_payment,
          remaining_balance, daily_installment, start_date, notes, status, last_payment_date,
          total_paid, rep_name, created_at, completed_at, updated_at, is_edited,
          latitude, longitude, location_address, location_updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
        ON CONFLICT (id) DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_phone = EXCLUDED.customer_phone,
          customer_address = EXCLUDED.customer_address,
          list_id = EXCLUDED.list_id,
          list_name = EXCLUDED.list_name,
          total_price = EXCLUDED.total_price,
          advance_payment = EXCLUDED.advance_payment,
          remaining_balance = EXCLUDED.remaining_balance,
          daily_installment = EXCLUDED.daily_installment,
          status = EXCLUDED.status,
          total_paid = EXCLUDED.total_paid,
          last_payment_date = EXCLUDED.last_payment_date,
          updated_at = EXCLUDED.updated_at,
          is_edited = EXCLUDED.is_edited,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          location_address = EXCLUDED.location_address,
          location_updated_at = EXCLUDED.location_updated_at`;
      const vals = [
        id, saved.customerName, saved.customerPhone, saved.customerAddress, saved.itemId, saved.itemName,
        saved.itemQuantity, saved.purchasePrice, saved.listId, saved.listName,
        saved.totalPrice, saved.advancePayment, saved.remainingBalance, saved.dailyInstallment,
        saved.startDate, saved.notes, saved.status, saved.lastPaymentDate, saved.totalPaid,
        saved.repName, saved.createdAt, saved.completedAt, saved.updatedAt, saved.isEdited,
        saved.latitude, saved.longitude, saved.locationAddress, saved.locationUpdatedAt
      ];

      console.log(`[POST /api/contracts] Inserting contract ${id} for customer ${saved.customerName}...`);
      await executePg(sql1, vals);
      await executePg("DELETE FROM deleted_records WHERE record_id = $1", [id]).catch(() => {});
      console.log(`[POST /api/contracts] Inserted ${id} into PostgreSQL successfully.`);

      bumpSyncVersion();
      const priceFmt = Number(saved.totalPrice || 0).toLocaleString('en-US');
      const instFmt = Number(saved.dailyInstallment || 0).toLocaleString('en-US');
      broadcastPushNotification({
        title: '🛍️ إشعار مبيع جديد',
        body: `"${saved.customerName}" - القسط: ${instFmt} د.ع - بقيمة (${priceFmt} د.ع) - ${saved.itemName || 'مادة'} (${saved.repName || 'المندوب'})`,
        tag: `sale_${saved.id}`,
        type: 'sale',
        listId: saved.listId,
      }).catch(() => {});
      res.json({ success: true, contract: saved });
    } catch (err: any) {
      console.error(`[POST /api/contracts] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk Import Contracts & Payments API with high speed & transactional consistency
  app.post(["/api/contracts/import", "/api/sales/import"], async (req, res) => {
    try {
      const body = req.body || {};
      const contractsList: any[] = Array.isArray(body) ? body : (Array.isArray(body.contracts) ? body.contracts : []);
      const overwrite = Boolean(body.overwrite);

      if (contractsList.length === 0) {
        return res.json({ success: true, count: 0, message: 'No contracts provided to import' });
      }

      if (overwrite) {
        await executePg(`DELETE FROM payments WHERE contract_id IS NOT NULL`).catch(() => {});
        await executePg(`DELETE FROM sales`).catch(() => {});
        fileDb.setAll("contracts", []);
      }

      const savedList: any[] = [];
      const CHUNK_SIZE = 50;

      for (let i = 0; i < contractsList.length; i += CHUNK_SIZE) {
        const chunk = contractsList.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (c: any) => {
            if (!c) return;
            const id = c.id || `contract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const saved = fileDb.upsert("contracts", {
              id,
              customerName: c.customerName || c.customer_name || '',
              customerPhone: c.customerPhone || c.customer_phone || '',
              customerAddress: c.customerAddress || c.customer_address || '',
              itemId: c.itemId || c.item_id || null,
              itemName: c.itemName || c.item_name || '',
              itemQuantity: Number(c.itemQuantity ?? c.item_quantity ?? 1) || 1,
              purchasePrice: Number(c.purchasePrice ?? c.purchase_price ?? 0) || 0,
              listId: c.listId || c.list_id || null,
              listName: c.listName || c.list_name || null,
              totalPrice: Number(c.totalPrice ?? c.total_price ?? 0) || 0,
              advancePayment: Number(c.advancePayment ?? c.advance_payment ?? 0) || 0,
              remainingBalance: Number(c.remainingBalance ?? c.remaining_balance ?? c.totalPrice ?? 0) || 0,
              dailyInstallment: Number(c.dailyInstallment ?? c.daily_installment ?? 0) || 0,
              startDate: c.startDate || c.start_date || new Date().toISOString().split('T')[0],
              notes: c.notes || '',
              status: c.status || 'active',
              lastPaymentDate: c.lastPaymentDate || c.last_payment_date || null,
              totalPaid: Number(c.totalPaid ?? c.total_paid ?? 0) || 0,
              repName: c.repName || c.rep_name || '',
              createdAt: c.createdAt || c.created_at || new Date().toISOString(),
              completedAt: c.completedAt || c.completed_at || null,
              updatedAt: c.updatedAt || c.updated_at || null,
              isEdited: Boolean(c.isEdited ?? c.is_edited)
            });
            savedList.push(saved);

            const sql = `INSERT INTO sales (
                id, customer_name, customer_phone, customer_address, item_id, item_name,
                item_quantity, purchase_price, list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes, status, last_payment_date,
                total_paid, rep_name, created_at, completed_at, updated_at, is_edited
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
              ON CONFLICT (id) DO UPDATE SET
                customer_name = EXCLUDED.customer_name,
                customer_phone = EXCLUDED.customer_phone,
                customer_address = EXCLUDED.customer_address,
                item_id = EXCLUDED.item_id,
                item_name = EXCLUDED.item_name,
                item_quantity = EXCLUDED.item_quantity,
                purchase_price = EXCLUDED.purchase_price,
                list_id = EXCLUDED.list_id,
                list_name = EXCLUDED.list_name,
                total_price = EXCLUDED.total_price,
                advance_payment = EXCLUDED.advance_payment,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = EXCLUDED.daily_installment,
                start_date = EXCLUDED.start_date,
                notes = EXCLUDED.notes,
                status = EXCLUDED.status,
                total_paid = EXCLUDED.total_paid,
                last_payment_date = EXCLUDED.last_payment_date,
                rep_name = EXCLUDED.rep_name,
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited`;
            const vals = [
              saved.id, saved.customerName, saved.customerPhone, saved.customerAddress, saved.itemId, saved.itemName,
              saved.itemQuantity, saved.purchasePrice, saved.listId, saved.listName,
              saved.totalPrice, saved.advancePayment, saved.remainingBalance, saved.dailyInstallment,
              saved.startDate, saved.notes, saved.status, saved.lastPaymentDate, saved.totalPaid,
              saved.repName, saved.createdAt, saved.completedAt, saved.updatedAt, saved.isEdited
            ];
            await executePg(sql, vals).catch((e) => console.warn('Bulk contract insert error:', e));
          })
        );
      }

      bumpSyncVersion();
      res.json({ success: true, count: savedList.length, message: `Successfully imported ${savedList.length} contracts` });
    } catch (err: any) {
      console.error('[POST /api/contracts/import] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put(["/api/contracts/:id", "/api/sales/:id"], async (req, res) => {
    try {
      const { id } = req.params;
      if (id && (String(id).startsWith('pay_') || String(id).startsWith('ft_') || String(id).startsWith('emptx_') || String(id).startsWith('conflict_'))) {
        console.warn(`[PUT /api/contracts/:id] Blocked non-contract ID: ${id}`);
        return res.status(400).json({ error: 'Invalid contract ID' });
      }
      const updates = req.body;
      fileDb.update("contracts", id, updates);
      fileDb.update("contracts", id, updates);

      const fieldMap: Record<string, string> = {
        customerName: 'customer_name',
        customerPhone: 'customer_phone',
        customerAddress: 'customer_address',
        itemId: 'item_id',
        itemName: 'item_name',
        itemQuantity: 'item_quantity',
        purchasePrice: 'purchase_price',
        listId: 'list_id',
        listName: 'list_name',
        totalPrice: 'total_price',
        advancePayment: 'advance_payment',
        remainingBalance: 'remaining_balance',
        dailyInstallment: 'daily_installment',
        startDate: 'start_date',
        notes: 'notes',
        status: 'status',
        lastPaymentDate: 'last_payment_date',
        totalPaid: 'total_paid',
        repName: 'rep_name',
        createdAt: 'created_at',
        completedAt: 'completed_at',
        updatedAt: 'updated_at',
        isEdited: 'is_edited',
        // Also support snake_case keys if passed directly
        customer_name: 'customer_name',
        customer_phone: 'customer_phone',
        customer_address: 'customer_address',
        item_id: 'item_id',
        item_name: 'item_name',
        item_quantity: 'item_quantity',
        purchase_price: 'purchase_price',
        list_id: 'list_id',
        list_name: 'list_name',
        total_price: 'total_price',
        advance_payment: 'advance_payment',
        remaining_balance: 'remaining_balance',
        daily_installment: 'daily_installment',
        start_date: 'start_date',
        last_payment_date: 'last_payment_date',
        total_paid: 'total_paid',
        rep_name: 'rep_name',
        created_at: 'created_at',
        completed_at: 'completed_at',
        updated_at: 'updated_at',
        is_edited: 'is_edited',
        latitude: 'latitude',
        longitude: 'longitude',
        locationAddress: 'location_address',
        location_address: 'location_address',
        locationUpdatedAt: 'location_updated_at',
        location_updated_at: 'location_updated_at'
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const addedCols = new Set<string>();

      for (const [k, v] of Object.entries(updates)) {
        if (k === 'id') continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }

      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE sales SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
        await executePg("DELETE FROM deleted_records WHERE record_id = $1", [id]).catch(() => {});

        if (updates.latitude !== undefined || updates.longitude !== undefined) {
          const newLat = (updates.latitude != null && updates.latitude !== 0 && !isNaN(Number(updates.latitude))) ? Number(updates.latitude) : null;
          const newLng = (updates.longitude != null && updates.longitude !== 0 && !isNaN(Number(updates.longitude))) ? Number(updates.longitude) : null;
          await executePg(`
            UPDATE customers
            SET latitude = $1, longitude = $2
            WHERE id IN (SELECT customer_id FROM sales WHERE id = $3)
               OR name IN (SELECT customer_name FROM sales WHERE id = $3)
          `, [newLat, newLng, id]).catch(() => {});

          if (newLat == null || newLng == null) {
            await executePg(`
              UPDATE payments
              SET latitude = NULL, longitude = NULL
              WHERE contract_id = $1 OR customer_name IN (SELECT customer_name FROM sales WHERE id = $1)
            `, [id]).catch(() => {});

            // Also clear in fileDb payments
            const allP = fileDb.get<any>("payments") || [];
            let pChanged = false;
            for (let i = 0; i < allP.length; i++) {
              if (allP[i].contractId === id) {
                if (allP[i].latitude != null || allP[i].longitude != null) {
                  allP[i].latitude = null;
                  allP[i].longitude = null;
                  pChanged = true;
                }
              }
            }
            if (pChanged) {
              fileDb.setAll("payments", allP);
            }
          }
        }
      }

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[PUT /api/contracts/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(["/api/contracts", "/api/sales", "/api/customers"], async (req, res) => {
    try {
      fileDb.setAll("contracts", []);
      fileDb.setAll("customers", []);
      fileDb.setAll("payments", []);
      fileDb.setAll("payment_conflicts", []);
      if (isPgConfigured()) {
        await executePg(`DELETE FROM payments`).catch(() => {});
        await executePg(`DELETE FROM payment_conflicts`).catch(() => {});
        await executePg(`DELETE FROM sales`).catch(() => {});
        await executePg(`DELETE FROM customers`).catch(() => {});
        await executePg(`DELETE FROM deleted_records WHERE table_name IN ('sales', 'contracts', 'customers', 'payments')`).catch(() => {});
      }
      bumpSyncVersion();
      res.json({ success: true, message: "All customers, contracts and payments deleted successfully" });
    } catch (err: any) {
      console.error('[DELETE /api/contracts] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete(["/api/contracts/:id", "/api/sales/:id"], async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("contracts", id);
      const allPay = fileDb.get("payments") || [];
      fileDb.setAll("payments", allPay.filter((p: any) => p.contractId !== id));

      // 1. Tombstone contract/sale in deleted_records
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales'), ($1, 'contracts') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});

      // 2. Fetch contract & customer details before deleting
      const contractDetails = await executePg(
        `SELECT customer_id, customer_name FROM sales WHERE id = $1 UNION SELECT customer_id, customer_name FROM contracts WHERE id = $1`,
        [id]
      ).catch(() => []);

      // 3. Register and delete associated payments + reverse fund transactions
      const relPayments = await executePg(`SELECT id, fund_id, amount, amount_paid, customer_name, rep_name, payment_date FROM payments WHERE contract_id = $1`, [id]).catch(() => []);
      if (Array.isArray(relPayments) && relPayments.length > 0) {
        for (const rp of relPayments) {
          if (rp?.id) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {});
            const amt = Number(rp.amount_paid ?? rp.amount) || 0;
            const targetFundId = await resolveFundIdForPayment(rp.fund_id, id, rp.customer_name);
            if (targetFundId && amt > 0) {
              await recordPaymentFundAdjustment(rp.id, targetFundId, amt, rp.customer_name || '', rp.rep_name || '', rp.payment_date || '', true).catch(() => {});
            }
          }
        }
      }

      // 4. Delete from sales, contracts, and payments
      await executePg(`DELETE FROM sales WHERE id = $1`, [id]).catch(() => {});
      await executePg(`DELETE FROM contracts WHERE id = $1`, [id]).catch(() => {});
      await executePg(`DELETE FROM payments WHERE contract_id = $1`, [id]).catch(() => {});

      // 5. If the customer has no other active contracts, also delete from customers table
      if (Array.isArray(contractDetails) && contractDetails.length > 0) {
        for (const cd of contractDetails) {
          const custId = cd.customer_id;
          const custName = cd.customer_name;
          const hasOtherContracts = await executePg(
            `SELECT 1 FROM sales WHERE id != $1 AND (customer_id = $2 OR customer_name = $3)
             UNION
             SELECT 1 FROM contracts WHERE id != $1 AND (customer_id = $2 OR customer_name = $3) LIMIT 1`,
            [id, custId || '', custName || '']
          ).catch(() => []);

          if (!hasOtherContracts || hasOtherContracts.length === 0) {
            if (custId) {
              await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customers') ON CONFLICT (record_id) DO NOTHING`, [custId]).catch(() => {});
              await executePg(`DELETE FROM customers WHERE id = $1`, [custId]).catch(() => {});
              fileDb.delete("customers", custId);
            }
            if (custName) {
              await executePg(`DELETE FROM customers WHERE name = $1`, [custName]).catch(() => {});
            }
          }
        }
      }

      await syncCustomersTableInPg().catch(() => {});
      await recalculateAllFundBalancesInPg().catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Payments API ---
  app.get("/api/payments", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT p.*, COALESCE(NULLIF(p.customer_name, ''), c.customer_name, '') AS resolved_customer_name
            FROM payments p
            LEFT JOIN contracts c ON p.contract_id = c.id
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))
            ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
          `);
          const payments = (rows || []).map(mapPaymentRow).filter((p: any) => p.amountPaid > 0);
          fileDb.setAll("payments", payments);
          return res.json(payments);
        } catch (pgErr) {
          console.warn("Postgres fetch payments error, fallback to fileDb:", pgErr);
        }
      }
      const filePayments = (fileDb.get("payments") || []).map(mapPaymentRow).filter((p: any) => (p.amountPaid ?? p.amount ?? 0) > 0);
      res.json(filePayments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments", async (req, res) => {
    try {
      const p = req.body;
      const amountVal = Number(p.amount ?? p.amountPaid) || 0;
      if (amountVal <= 0) {
        return res.status(400).json({ error: "Payment amount must be greater than zero" });
      }
      const id = p.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? `pay_${crypto.randomUUID()}` : `pay_${Date.now()}_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`);
      const contractId = p.contractId || '';
      let customerName = p.customerName || '';
      if (!customerName && contractId) {
        const cRow = (fileDb.get<any>("contracts") || []).find((c: any) => c.id === contractId);
        if (cRow?.customerName) customerName = cRow.customerName;
      }
      const paymentDate = p.paymentDate || new Date().toISOString().split('T')[0];
      const repName = p.repName || '';
      const note = p.note || '';
      const createdAt = p.createdAt || new Date().toISOString();
      const isEdited = Boolean(p.isEdited);

      const resolvedFundId = await resolveFundIdForPayment(p.fundId, contractId);

      const latitude = p.latitude != null ? Number(p.latitude) : null;
      const longitude = p.longitude != null ? Number(p.longitude) : null;

      const saved = fileDb.upsert("payments", {
        id,
        contractId,
        customerName,
        amount: amountVal,
        amountPaid: amountVal,
        paymentDate,
        repName,
        note,
        fundId: resolvedFundId,
        latitude: latitude != null ? latitude : undefined,
        longitude: longitude != null ? longitude : undefined,
        updatedAt: p.updatedAt || null,
        createdAt,
        isEdited
      });

      const sql1 = `INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, rep_name, note, fund_id, updated_at, created_at, is_edited, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           contract_id = EXCLUDED.contract_id,
           customer_name = EXCLUDED.customer_name,
           amount = EXCLUDED.amount,
           amount_paid = EXCLUDED.amount_paid,
           payment_date = EXCLUDED.payment_date,
           rep_name = EXCLUDED.rep_name,
           note = EXCLUDED.note,
           fund_id = EXCLUDED.fund_id,
           updated_at = EXCLUDED.updated_at,
           is_edited = EXCLUDED.is_edited,
           latitude = COALESCE(EXCLUDED.latitude, payments.latitude),
           longitude = COALESCE(EXCLUDED.longitude, payments.longitude)`;
      const vals = [id, contractId, customerName, amountVal, amountVal, paymentDate, repName, note, resolvedFundId, p.updatedAt || null, createdAt, isEdited, latitude, longitude];

      await executePg(sql1, vals);
      await executePg("DELETE FROM deleted_records WHERE record_id = $1", [id]).catch(() => {});

      // If payment has GPS location, immediately reflect it as the customer's location on the map
      if (contractId && latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude)) {
        const nowIso = new Date().toISOString();
        await executePg(`
          UPDATE sales 
          SET latitude = $1, longitude = $2, location_updated_at = $3
          WHERE id = $4
        `, [latitude, longitude, nowIso, contractId]).catch(() => {});

        await executePg(`
          UPDATE customers 
          SET latitude = $1, longitude = $2
          WHERE id IN (SELECT customer_id FROM sales WHERE id = $3)
             OR name IN (SELECT customer_name FROM sales WHERE id = $3)
        `, [latitude, longitude, contractId]).catch(() => {});

        const allC = fileDb.get<any>("contracts") || [];
        const cIdx = allC.findIndex((x: any) => x.id === contractId);
        if (cIdx !== -1) {
          allC[cIdx] = { ...allC[cIdx], latitude, longitude, locationUpdatedAt: nowIso };
          fileDb.setAll("contracts", allC);
        }
      }

      // Adjust fund balance and add installment transaction
      if (resolvedFundId && amountVal > 0) {
        await recordPaymentFundAdjustment(id, resolvedFundId, amountVal, customerName, repName, paymentDate, false);
      }

      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : undefined);

      bumpSyncVersion();
      res.json({ success: true, payment: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      let existingPayment = (fileDb.get<any>("payments") || []).find((p: any) => p.id === id);
      if (!existingPayment && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
      }

      const oldAmt = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
      const rawAmt = updates.amount !== undefined ? updates.amount : (updates.amountPaid !== undefined ? updates.amountPaid : updates.amount_paid);
      const newAmt = (rawAmt !== undefined && rawAmt !== null && rawAmt !== '' && !isNaN(Number(rawAmt)))
        ? Number(rawAmt)
        : oldAmt;
      const diff = newAmt - oldAmt;
      const contractId = updates.contractId || updates.contract_id || existingPayment?.contractId;
      const resolvedFundId = await resolveFundIdForPayment(updates.fundId || existingPayment?.fundId, contractId);

      if (resolvedFundId) {
        const cName = updates.customerName || updates.customer_name || existingPayment?.customerName || '';
        const rName = updates.repName || updates.rep_name || existingPayment?.repName || '';
        const pDate = updates.paymentDate || updates.payment_date || existingPayment?.paymentDate || '';
        await recordPaymentFundAdjustment(id, resolvedFundId, newAmt, cName, rName, pDate, false);
      }

      fileDb.update("payments", id, { ...updates, amount: newAmt, amountPaid: newAmt, fundId: resolvedFundId || updates.fundId });

      const fieldMap: Record<string, string> = {
        contractId: 'contract_id',
        contract_id: 'contract_id',
        customerName: 'customer_name',
        customer_name: 'customer_name',
        amountPaid: 'amount',
        amount: 'amount',
        paymentDate: 'payment_date',
        payment_date: 'payment_date',
        repName: 'rep_name',
        rep_name: 'rep_name',
        note: 'note',
        fundId: 'fund_id',
        fund_id: 'fund_id',
        updatedAt: 'updated_at',
        updated_at: 'updated_at',
        createdAt: 'created_at',
        created_at: 'created_at',
        isEdited: 'is_edited',
        is_edited: 'is_edited'
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const addedCols = new Set<string>();

      if (updates.amount !== undefined || updates.amountPaid !== undefined || updates.amount_paid !== undefined) {
        setClauses.push(`amount = $${idx++}`);
        values.push(newAmt);
        setClauses.push(`amount_paid = $${idx++}`);
        values.push(newAmt);
        addedCols.add('amount');
        addedCols.add('amount_paid');
      }

      if (resolvedFundId && !updates.fundId && !updates.fund_id) {
        setClauses.push(`fund_id = $${idx++}`);
        values.push(resolvedFundId);
        addedCols.add('fund_id');
      }

      for (const [k, v] of Object.entries(updates)) {
        if (k === 'id' || k === 'amount' || k === 'amountPaid' || k === 'amount_paid') continue;
        const col = fieldMap[k];
        if (col && !addedCols.has(col)) {
          addedCols.add(col);
          setClauses.push(`${col} = $${idx++}`);
          values.push(v);
        }
      }

      if (setClauses.length > 0) {
        values.push(id);
        await executePg(`UPDATE payments SET ${setClauses.join(', ')} WHERE id = $${idx}`, values).catch(() => {});
        await executePg("DELETE FROM deleted_records WHERE record_id = $1", [id]).catch(() => {});
      }

      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : undefined);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[PUT /api/payments/:id] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/payments", async (req, res) => {
    try {
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length > 0) {
        let paymentsToDelete: any[] = [];
        if (isPgConfigured()) {
          const rows = await executePg("SELECT * FROM payments WHERE id = ANY($1)", [ids]).catch(() => []);
          if (rows && rows.length > 0) paymentsToDelete = rows.map(mapPaymentRow);
        }
        if (paymentsToDelete.length === 0) {
          paymentsToDelete = (fileDb.get<any>("payments") || []).filter((p: any) => ids.includes(p.id));
        }

        const affectedContractIds = new Set<string>();
        for (const p of paymentsToDelete) {
          const cId = p.contractId || p.contract_id;
          if (cId) affectedContractIds.add(cId);
          const amountVal = Number(p.amountPaid ?? p.amount) || 0;
          const resolvedFundId = await resolveFundIdForPayment(p.fundId, cId);
          if (resolvedFundId && amountVal > 0) {
            await recordPaymentFundAdjustment(
              p.id,
              resolvedFundId,
              amountVal,
              p.customerName || '',
              p.repName || '',
              p.paymentDate || '',
              true
            ).catch(() => {});
          }
          fileDb.delete("payments", p.id);
        }

        if (isPgConfigured()) {
          await executePg(
            `INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'payments' ON CONFLICT (record_id) DO NOTHING`,
            [ids]
          ).catch(() => {});
          await executePg(`DELETE FROM payments WHERE id = ANY($1)`, [ids]).catch(() => {});
          if (affectedContractIds.size > 0) {
            await syncContractBalancesInPgAndFileDb(Array.from(affectedContractIds));
          }
        }
        bumpSyncVersion();
        return res.json({ success: true, deletedCount: ids.length });
      }

      fileDb.setAll("payments", []);
      fileDb.setAll("payment_conflicts", []);
      if (isPgConfigured()) {
        await executePg(`DELETE FROM payments`).catch(() => {});
        await executePg(`DELETE FROM payment_conflicts`).catch(() => {});
        await syncContractBalancesInPgAndFileDb();
      }
      await recalculateAllFundBalancesInPg().catch(() => {});
      bumpSyncVersion();
      res.json({ success: true, message: "All payments deleted successfully" });
    } catch (err: any) {
      console.error('[DELETE /api/payments] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments/delete-batch", async (req, res) => {
    try {
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return res.json({ success: true, deletedCount: 0 });
      }

      let paymentsToDelete: any[] = [];
      if (isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = ANY($1)", [ids]).catch(() => []);
        if (rows && rows.length > 0) paymentsToDelete = rows.map(mapPaymentRow);
      }
      if (paymentsToDelete.length === 0) {
        paymentsToDelete = (fileDb.get<any>("payments") || []).filter((p: any) => ids.includes(p.id));
      }

      const affectedContractIds = new Set<string>();
      for (const p of paymentsToDelete) {
        const cId = p.contractId || p.contract_id;
        if (cId) affectedContractIds.add(cId);
        const amountVal = Number(p.amountPaid ?? p.amount) || 0;
        const resolvedFundId = await resolveFundIdForPayment(p.fundId, cId, p.customerName);
        if (resolvedFundId && amountVal > 0) {
          await recordPaymentFundAdjustment(
            p.id,
            resolvedFundId,
            amountVal,
            p.customerName || '',
            p.repName || '',
            p.paymentDate || '',
            true
          ).catch(() => {});
        }
        fileDb.delete("payments", p.id);
      }

      if (isPgConfigured()) {
        await executePg(
          `INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'payments' ON CONFLICT (record_id) DO NOTHING`,
          [ids]
        ).catch(() => {});
        await executePg(`DELETE FROM payments WHERE id = ANY($1)`, [ids]).catch(() => {});
        if (affectedContractIds.size > 0) {
          await syncContractBalancesInPgAndFileDb(Array.from(affectedContractIds));
        }
      }

      await recalculateAllFundBalancesInPg().catch(() => {});
      bumpSyncVersion();
      res.json({ success: true, deletedCount: ids.length });
    } catch (err: any) {
      console.error('[POST /api/payments/delete-batch] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/payments/:id", async (req, res) => {
    try {
      const { id } = req.params;

      let existingPayment = (fileDb.get<any>("payments") || []).find((p: any) => p.id === id);
      if (!existingPayment && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
      }

      const contractId = existingPayment?.contractId || existingPayment?.contract_id;
      const amountVal = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
      const resolvedFundId = await resolveFundIdForPayment(existingPayment?.fundId, contractId, existingPayment?.customerName);

      // Deduct from fund balance and delete corresponding fund transaction
      if (resolvedFundId && amountVal > 0) {
        await recordPaymentFundAdjustment(
          id,
          resolvedFundId,
          amountVal,
          existingPayment?.customerName || '',
          existingPayment?.repName || '',
          existingPayment?.paymentDate || '',
          true
        );
      }

      fileDb.delete("payments", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM payments WHERE id = $1`, [id]);
      await syncContractBalancesInPgAndFileDb(contractId ? [contractId] : undefined);
      await recalculateAllFundBalancesInPg().catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Cash Funds API ---
  app.get("/api/funds", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM cash_funds ORDER BY COALESCE(order_index, 0) ASC, created_at ASC, id ASC");
          const funds = (rows || []).map(mapFundRow);
          fileDb.setAll("cash_funds", funds);
          return res.json(funds);
        } catch (pgErr) {
          console.warn("Postgres fetch funds error, fallback to fileDb:", pgErr);
        }
      }
      const fileFunds = (fileDb.get("cash_funds") || fileDb.get("funds") || []).map(mapFundRow).sort(compareEntitiesByOrderIndex);
      res.json(fileFunds);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/funds/recalculate", async (req, res) => {
    try {
      await recalculateAllFundBalancesInPg();
      bumpSyncVersion();
      const funds = (fileDb.get("cash_funds") || fileDb.get("funds") || []).map(mapFundRow).sort(compareEntitiesByOrderIndex);
      res.json({ success: true, funds });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/funds", async (req, res) => {
    try {
      const f = req.body;
      const fundName = (f.name || '').trim();
      if (!fundName) {
        return res.status(400).json({ error: "اسم الصندوق مطلوب" });
      }
      const normName = normalizeEntityName(fundName);

      // Check duplicate in fileDb
      const existingFunds = fileDb.get<any>("cash_funds") || [];
      if (existingFunds.some((item: any) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكرار أسماء الصناديق" });
      }

      // Check duplicate in Postgres
      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM cash_funds WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكرار أسماء الصناديق" });
        }
      }

      const id = f.id || `fund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const orderIndexVal = f.orderIndex !== undefined ? Number(f.orderIndex) : existingFunds.length;
      const saved = fileDb.upsert("cash_funds", {
        id,
        name: f.name || '',
        balance: Number(f.balance) || 0,
        description: f.description || '',
        orderIndex: orderIndexVal,
        createdAt: f.createdAt || new Date().toISOString()
      });

      const sql1 = `INSERT INTO cash_funds (id, name, balance, description, order_index) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance, name = EXCLUDED.name, order_index = COALESCE(EXCLUDED.order_index, cash_funds.order_index)`;
      const vals = [id, saved.name, saved.balance, saved.description, orderIndexVal];

      await executePg(sql1, vals);

      bumpSyncVersion();
      res.json({ success: true, fund: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/funds/reorder", async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (Array.isArray(orderedIds)) {
        const pgUpdates: Promise<any>[] = [];
        for (let i = 0; i < orderedIds.length; i++) {
          const fid = orderedIds[i];
          fileDb.update("cash_funds", fid, { orderIndex: i } as any);
          fileDb.update("funds", fid, { orderIndex: i } as any);
          if (isPgConfigured()) {
            pgUpdates.push(executePg("UPDATE cash_funds SET order_index = $1 WHERE id = $2", [i, fid]).catch(() => {}));
          }
        }
        if (pgUpdates.length > 0) {
          await Promise.all(pgUpdates);
        }
        bumpSyncVersion();
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/funds/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.name !== undefined) {
        const fundName = (updates.name || '').trim();
        if (!fundName) {
          return res.status(400).json({ error: "اسم الصندوق مطلوب" });
        }
        const normName = normalizeEntityName(fundName);

        const existingFunds = fileDb.get<any>("cash_funds") || [];
        if (existingFunds.some((item: any) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكرار أسماء الصناديق" });
        }

        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM cash_funds WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "عذراً، اسم الصندوق مسجل مسبقاً ولا يمكن تكرار أسماء الصناديق" });
          }
        }
      }

      const existingFund = (fileDb.get<any>("cash_funds") || []).find((f: any) => f.id === id);
      const balanceToSet = (updates.balance !== undefined && updates.balance !== null && updates.balance !== '')
        ? Number(updates.balance)
        : existingFund?.balance;

      const orderIndexToSet = updates.orderIndex !== undefined || updates.order_index !== undefined
        ? Number(updates.orderIndex ?? updates.order_index)
        : existingFund?.orderIndex;

      fileDb.update("cash_funds", id, {
        ...updates,
        balance: balanceToSet ?? existingFund?.balance ?? 0,
        ...(orderIndexToSet !== undefined ? { orderIndex: orderIndexToSet } : {})
      });
      await executePg(
        `UPDATE cash_funds SET 
           name = COALESCE($1, name), 
           balance = COALESCE($2, balance), 
           description = COALESCE($3, description),
           order_index = COALESCE($4, order_index)
         WHERE id = $5`,
        [updates.name, balanceToSet !== undefined ? balanceToSet : null, updates.description, orderIndexToSet !== undefined ? orderIndexToSet : null, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/funds/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("cash_funds", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'cash_funds') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM cash_funds WHERE id = $1`, [id]).catch(() => {});

      // Delete associated fund transactions
      const relTx = await executePg(`SELECT id FROM fund_transactions WHERE fund_id = $1 OR target_fund_id = $1`, [id]).catch(() => []);
      if (Array.isArray(relTx) && relTx.length > 0) {
        for (const tx of relTx) {
          if (tx?.id) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [tx.id]).catch(() => {});
            fileDb.delete("fund_transactions", tx.id);
          }
        }
      }
      await executePg(`DELETE FROM fund_transactions WHERE fund_id = $1 OR target_fund_id = $1`, [id]).catch(() => {});

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Customer Lists API ---
  app.get("/api/customer-lists", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM customer_lists cl WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cl.id AND (dr.table_name = 'customer_lists' OR dr.table_name = 'unknown')) ORDER BY COALESCE(cl.order_index, 0) ASC, cl.created_at ASC, cl.id ASC");
          const lists = (rows || []).map(mapCustomerListRow);
          fileDb.setAll("customer_lists", lists);
          return res.json(lists);
        } catch (pgErr) {
          console.warn("Postgres fetch customer-lists error, fallback to fileDb:", pgErr);
        }
      }
      const fileLists = (fileDb.get("customer_lists") || []).map(mapCustomerListRow).sort(compareEntitiesByOrderIndex);
      res.json(fileLists);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/customer-lists", async (req, res) => {
    try {
      const l = req.body;
      const listName = (l.name || '').trim();
      if (!listName) {
        return res.status(400).json({ error: "اسم القائمة مطلوب" });
      }
      const normName = normalizeEntityName(listName);

      const existingLists = fileDb.get<any>("customer_lists") || [];
      if (existingLists.some((item: any) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكرار أسماء القوائم" });
      }

      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM customer_lists WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكرار أسماء القوائم" });
        }
      }

      const id = l.id || `list_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const fundIdVal = l.fundId || l.fund_id || '';
      const orderIndexVal = l.orderIndex !== undefined ? Number(l.orderIndex) : existingLists.length;
      const receiptTemplateVal = l.receiptTemplate || l.receipt_template || 'template_1';
      const saved = fileDb.upsert("customer_lists", {
        id,
        name: l.name || '',
        fundId: fundIdVal,
        fund_id: fundIdVal,
        description: l.description || '',
        orderIndex: orderIndexVal,
        receiptTemplate: receiptTemplateVal,
        receipt_template: receiptTemplateVal,
        createdAt: l.createdAt || new Date().toISOString()
      });

      await executePg(
        `INSERT INTO customer_lists (id, name, fund_id, description, order_index, receipt_template) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fund_id = EXCLUDED.fund_id, order_index = COALESCE(EXCLUDED.order_index, customer_lists.order_index), receipt_template = COALESCE(EXCLUDED.receipt_template, customer_lists.receipt_template)`,
        [id, saved.name, saved.fundId || null, saved.description, orderIndexVal, receiptTemplateVal]
      );

      bumpSyncVersion();
      res.json({ success: true, list: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/customer-lists/reorder", async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (Array.isArray(orderedIds)) {
        const pgUpdates: Promise<any>[] = [];
        for (let i = 0; i < orderedIds.length; i++) {
          const lid = orderedIds[i];
          fileDb.update("customer_lists", lid, { orderIndex: i } as any);
          if (isPgConfigured()) {
            pgUpdates.push(executePg("UPDATE customer_lists SET order_index = $1 WHERE id = $2", [i, lid]).catch(() => {}));
          }
        }
        if (pgUpdates.length > 0) {
          await Promise.all(pgUpdates);
        }
        bumpSyncVersion();
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/customer-lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.name !== undefined) {
        const listName = (updates.name || '').trim();
        if (!listName) {
          return res.status(400).json({ error: "اسم القائمة مطلوب" });
        }
        const normName = normalizeEntityName(listName);

        const existingLists = fileDb.get<any>("customer_lists") || [];
        if (existingLists.some((item: any) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكرار أسماء القوائم" });
        }

        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM customer_lists WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "عذراً، اسم القائمة مسجل مسبقاً ولا يمكن تكرار أسماء القوائم" });
          }
        }
      }

      const fundIdVal = updates.fundId !== undefined ? updates.fundId : updates.fund_id;
      const receiptTemplateVal = updates.receiptTemplate !== undefined 
        ? updates.receiptTemplate 
        : (updates.receipt_template !== undefined ? updates.receipt_template : undefined);
      const existingList = (fileDb.get<any>("customer_lists") || []).find((l: any) => l.id === id);
      const orderIndexToSet = updates.orderIndex !== undefined || updates.order_index !== undefined
        ? Number(updates.orderIndex ?? updates.order_index)
        : existingList?.orderIndex;

      const mergedList = {
        ...existingList,
        ...updates,
        ...(fundIdVal !== undefined ? { fundId: fundIdVal, fund_id: fundIdVal } : {}),
        ...(orderIndexToSet !== undefined ? { orderIndex: orderIndexToSet } : {}),
        ...(receiptTemplateVal !== undefined ? { receiptTemplate: receiptTemplateVal, receipt_template: receiptTemplateVal } : {})
      };
      fileDb.update("customer_lists", id, mergedList);
      await executePg(
        `UPDATE customer_lists SET 
           name = COALESCE($1, name), 
           fund_id = COALESCE($2, fund_id), 
           description = COALESCE($3, description),
           order_index = COALESCE($4, order_index),
           receipt_template = COALESCE($5, receipt_template)
         WHERE id = $6`, 
        [updates.name, fundIdVal, updates.description, orderIndexToSet !== undefined ? orderIndexToSet : null, receiptTemplateVal ?? null, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/customer-lists/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("customer_lists", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customer_lists') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM customer_lists WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Customers API (جدول الزبائن) ---
  app.get("/api/customers", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM sales s WHERE s.customer_name = c.name OR s.customer_id = c.id) as sales_count
            FROM customers c
            WHERE NOT EXISTS (
              SELECT 1 FROM deleted_records dr 
              WHERE dr.record_id = c.id AND (dr.table_name = 'customers' OR dr.table_name = 'unknown')
            )
            ORDER BY c.name ASC
          `);
          if (rows && rows.length > 0) {
            return res.json(rows);
          }
          return res.json([]);
        } catch (pgErr) {
          console.warn("Postgres fetch customers error:", pgErr);
        }
      }
      res.json([]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const b = req.body;
      const id = b.id || `cust-${Date.now()}`;
      const name = b.name || b.customerName || '';
      const phone = b.phone || b.customerPhone || '';
      const address = b.address || b.customerAddress || '';
      const listId = b.listId || b.list_id || null;
      const listName = b.listName || b.list_name || null;
      const notes = b.notes || '';
      const totalPurchases = Number(b.totalPurchases ?? b.total_purchases) || 0;
      const totalPaid = Number(b.totalPaid ?? b.total_paid) || 0;
      const remainingBalance = Number(b.remainingBalance ?? b.remaining_balance) || 0;
      const status = b.status || 'active';

      await executePg(`
        INSERT INTO customers (id, name, phone, address, list_id, list_name, notes, total_purchases, total_paid, remaining_balance, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          list_id = EXCLUDED.list_id,
          list_name = EXCLUDED.list_name,
          notes = EXCLUDED.notes,
          total_purchases = EXCLUDED.total_purchases,
          total_paid = EXCLUDED.total_paid,
          remaining_balance = EXCLUDED.remaining_balance,
          status = EXCLUDED.status
      `, [id, name, phone, address, listId, listName, notes, totalPurchases, totalPaid, remainingBalance, status]).catch(() => {});

      res.json({ success: true, customer: { id, name, phone, address, listId, listName, notes, totalPurchases, totalPaid, remainingBalance, status } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const b = req.body;
      await executePg(`
        UPDATE customers SET
          name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          address = COALESCE($3, address),
          list_id = COALESCE($4, list_id),
          list_name = COALESCE($5, list_name),
          notes = COALESCE($6, notes),
          status = COALESCE($7, status)
        WHERE id = $8
      `, [b.name, b.phone, b.address, b.listId ?? b.list_id, b.listName ?? b.list_name, b.notes, b.status, id]).catch(() => {});
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/customers/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customers') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      
      const custRows = await executePg(`SELECT id, name FROM customers WHERE id = $1`, [id]).catch(() => []);
      const custName = custRows?.[0]?.name;
      
      await executePg(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {});
      if (custName) {
        await executePg(`DELETE FROM customers WHERE name = $1`, [custName]).catch(() => {});
      }
      fileDb.delete("customers", id);

      // Also cascade delete all sales, contracts, and payments belonging to this customer
      const relSales = await executePg(
        `SELECT id FROM sales WHERE customer_id = $1 OR customer_name = $2
         UNION
         SELECT id FROM contracts WHERE customer_id = $1 OR customer_name = $2`,
        [id, custName || '']
      ).catch(() => []);

      if (Array.isArray(relSales) && relSales.length > 0) {
        for (const s of relSales) {
          if (s?.id) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales'), ($1, 'contracts') ON CONFLICT (record_id) DO NOTHING`, [s.id]).catch(() => {});
            await executePg(`DELETE FROM sales WHERE id = $1`, [s.id]).catch(() => {});
            await executePg(`DELETE FROM contracts WHERE id = $1`, [s.id]).catch(() => {});

            const relPayments = await executePg(`SELECT id, fund_id, amount, amount_paid, customer_name, rep_name, payment_date FROM payments WHERE contract_id = $1`, [s.id]).catch(() => []);
            for (const rp of relPayments) {
              if (rp?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {});
                const amt = Number(rp.amount_paid ?? rp.amount) || 0;
                const targetFundId = await resolveFundIdForPayment(rp.fund_id, s.id, rp.customer_name);
                if (targetFundId && amt > 0) {
                  await recordPaymentFundAdjustment(rp.id, targetFundId, amt, rp.customer_name || '', rp.rep_name || '', rp.payment_date || '', true).catch(() => {});
                }
              }
            }
            await executePg(`DELETE FROM payments WHERE contract_id = $1`, [s.id]).catch(() => {});
            fileDb.delete("contracts", s.id);
          }
        }
      }

      await recalculateAllFundBalancesInPg().catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Sales Reps API ---
  app.get("/api/reps", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          // Ensure rep-1 is never excluded by deleted_records
          await executePg("DELETE FROM deleted_records WHERE record_id = 'rep-1' OR record_id IN (SELECT id FROM reps WHERE name LIKE '%ضياء%')").catch(() => {});
          
          // Ensure rep-1 exists in reps table without overwriting user-customized code
          await executePg(`
            INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
            VALUES ('rep-1', 'ضياء المحاسب', '07801112233', '4444', 'admin', true, true, true, true, '["all"]')
            ON CONFLICT (id) DO UPDATE SET name = 'ضياء المحاسب', role = 'admin', can_edit = true, can_delete = true, can_move_customer = true, can_sell = true, allowed_list_ids = '["all"]'
          `).catch(() => {});

          const rows = await executePg("SELECT * FROM reps r WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = r.id AND dr.record_id != 'rep-1' AND (dr.table_name = 'reps' OR dr.table_name = 'unknown')) ORDER BY r.name ASC");
          if (rows && rows.length > 0) {
            const reps = rows.map(mapRepRow);
            // Ensure ضياء is present
            if (!reps.some((r: any) => r.id === 'rep-1' || (r.name && r.name.includes('ضياء')))) {
              reps.unshift({
                id: 'rep-1',
                name: 'ضياء المحاسب',
                phone: '07801112233',
                code: '4444',
                role: 'admin',
                canEdit: true,
                canDelete: true,
                canMoveCustomer: true,
                canSell: true,
                allowedListIds: ['all'],
                avatarUrl: ''
              });
            }
            fileDb.setAll("reps", reps);
            return res.json(reps);
          }
        } catch (pgErr) {
          console.warn("Postgres fetch reps error, fallback to fileDb:", pgErr);
        }
      }
      let reps = fileDb.get("reps");
      if (!reps.some((r: any) => r.id === 'rep-1' || (r.name && r.name.includes('ضياء')))) {
        reps.unshift({
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
      res.json(reps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reps", async (req, res) => {
    try {
      const r = req.body;
      const repName = (r.name || '').trim();
      if (!repName) {
        return res.status(400).json({ error: "اسم المندوب مطلوب" });
      }
      const normName = normalizeEntityName(repName);

      const existingReps = fileDb.get<any>("reps") || [];
      if (existingReps.some((item: any) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكرار أسماء المندوبين" });
      }

      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM reps WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكرار أسماء المندوبين" });
        }
      }

      const id = r.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("reps", {
        id,
        name: r.name || '',
        phone: r.phone || '',
        code: r.code || '',
        role: r.role || 'rep',
        canEdit: r.canEdit !== false,
        canDelete: Boolean(r.canDelete),
        canMoveCustomer: r.canMoveCustomer !== false,
        canSell: r.canSell !== false,
        allowedListIds: Array.isArray(r.allowedListIds) ? r.allowedListIds : ['all'],
        avatarUrl: r.avatarUrl || r.avatar_url || ''
      });

      const sql1 = `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids, avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, code = EXCLUDED.code, role = EXCLUDED.role, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete, can_move_customer = EXCLUDED.can_move_customer, can_sell = EXCLUDED.can_sell, allowed_list_ids = EXCLUDED.allowed_list_ids, avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), reps.avatar_url)`;
      const vals = [id, saved.name, saved.phone, saved.code, saved.role, saved.canEdit, saved.canDelete, saved.canMoveCustomer, saved.canSell, JSON.stringify(saved.allowedListIds), saved.avatarUrl || null];

      await executePg(sql1, vals);

      bumpSyncVersion();
      res.json({ success: true, rep: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/reps/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.name !== undefined) {
        const repName = (updates.name || '').trim();
        if (!repName) {
          return res.status(400).json({ error: "اسم المندوب مطلوب" });
        }
        const normName = normalizeEntityName(repName);

        const existingReps = fileDb.get<any>("reps") || [];
        if (existingReps.some((item: any) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكرار أسماء المندوبين" });
        }

        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM reps WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "عذراً، اسم المندوب مسجل مسبقاً ولا يمكن تكرار أسماء المندوبين" });
          }
        }
      }

      fileDb.update("reps", id, updates);
      await executePg(
        `UPDATE reps SET name = COALESCE($1, name), phone = COALESCE($2, phone), code = COALESCE($3, code), role = COALESCE($4, role), can_edit = COALESCE($5, can_edit), can_delete = COALESCE($6, can_delete), can_move_customer = COALESCE($7, can_move_customer), can_sell = COALESCE($8, can_sell), allowed_list_ids = COALESCE($9, allowed_list_ids), avatar_url = COALESCE($10, avatar_url) WHERE id = $11`,
        [updates.name, updates.phone, updates.code, updates.role, updates.canEdit, updates.canDelete, updates.canMoveCustomer, updates.canSell, updates.allowedListIds ? JSON.stringify(updates.allowedListIds) : null, updates.avatarUrl ?? updates.avatar_url ?? null, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reps/:id/avatar", async (req, res) => {
    try {
      const { id } = req.params;
      const { avatarUrl } = req.body;
      fileDb.update("reps", id, { avatarUrl: avatarUrl || '' } as any);
      await executePg(
        `UPDATE reps SET avatar_url = $1 WHERE id = $2`,
        [avatarUrl || '', id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/reps/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("reps", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'reps') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM reps WHERE id = $1`, [id]).catch(() => {});
      await executePg(`DELETE FROM rep_locations WHERE rep_id = $1`, [id]).catch(() => {});
      await executePg(`DELETE FROM rep_location_logs WHERE rep_id = $1`, [id]).catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Representatives Live Location API ---
  app.get("/api/reps/locations", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          await executePg(`
            CREATE TABLE IF NOT EXISTS rep_locations (
              rep_id TEXT PRIMARY KEY,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              address TEXT,
              updated_at TEXT NOT NULL
            );
          `).catch(() => {});

          const rows = await executePg(`
            SELECT rl.*, r.name as current_rep_name, r.phone as rep_phone, r.avatar_url 
            FROM rep_locations rl
            LEFT JOIN reps r ON r.id = rl.rep_id
            ORDER BY rl.updated_at DESC
          `);
          return res.json(rows || []);
        } catch (pgErr) {
          console.warn("Postgres fetch rep_locations error:", pgErr);
        }
      }
      const locs = fileDb.get<any>("rep_locations") || [];
      res.json(locs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reps/location", async (req, res) => {
    try {
      const { repId, repName, latitude, longitude, accuracy, speed, battery, address } = req.body;
      if (!repId || latitude === undefined || longitude === undefined) {
        return res.status(400).json({ error: "Missing required coordinates or repId" });
      }

      const now = new Date().toISOString();
      const locationData = {
        id: String(repId),
        rep_id: String(repId),
        rep_name: repName || "مندوب",
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        speed: speed != null ? Number(speed) : null,
        battery: battery != null ? Number(battery) : null,
        address: address || null,
        updated_at: now
      };

      fileDb.upsert("rep_locations", locationData);

      if (isPgConfigured()) {
        try {
          await executePg(`
            CREATE TABLE IF NOT EXISTS rep_locations (
              rep_id TEXT PRIMARY KEY,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              address TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rep_location_logs (
              id TEXT PRIMARY KEY,
              rep_id TEXT NOT NULL,
              rep_name TEXT,
              latitude DOUBLE PRECISION NOT NULL,
              longitude DOUBLE PRECISION NOT NULL,
              accuracy DOUBLE PRECISION,
              speed DOUBLE PRECISION,
              battery INTEGER,
              created_at TEXT NOT NULL
            );
          `).catch(() => {});

          await executePg(`
            INSERT INTO rep_locations (rep_id, rep_name, latitude, longitude, accuracy, speed, battery, address, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (rep_id) DO UPDATE SET
              rep_name = EXCLUDED.rep_name,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              accuracy = EXCLUDED.accuracy,
              speed = EXCLUDED.speed,
              battery = EXCLUDED.battery,
              address = EXCLUDED.address,
              updated_at = EXCLUDED.updated_at
          `, [
            locationData.rep_id,
            locationData.rep_name,
            locationData.latitude,
            locationData.longitude,
            locationData.accuracy,
            locationData.speed,
            locationData.battery,
            locationData.address,
            now
          ]);

          const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await executePg(`
            INSERT INTO rep_location_logs (id, rep_id, rep_name, latitude, longitude, accuracy, speed, battery, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            logId,
            locationData.rep_id,
            locationData.rep_name,
            locationData.latitude,
            locationData.longitude,
            locationData.accuracy,
            locationData.speed,
            locationData.battery,
            now
          ]).catch(() => {});
        } catch (pgErr) {
          console.warn("Postgres save rep_location error:", pgErr);
        }
      }

      res.json({ success: true, location: locationData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/reps/locations/:repId/logs", async (req, res) => {
    try {
      const { repId } = req.params;
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT * FROM rep_location_logs 
            WHERE rep_id = $1 
            ORDER BY created_at DESC 
            LIMIT 100
          `, [repId]);
          return res.json(rows || []);
        } catch (pgErr) {
          console.warn("Postgres fetch rep_location_logs error:", pgErr);
        }
      }
      res.json([]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Fund Transactions API ---
  app.get("/api/fund-transactions", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM fund_transactions ORDER BY created_at DESC");
          const txs = (rows || []).map(mapFundTxRow);
          fileDb.setAll("fund_transactions", txs);
          return res.json(txs);
        } catch (pgErr) {
          console.warn("Postgres fetch fund-transactions error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("fund_transactions"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/fund-transactions", async (req, res) => {
    try {
      const t = req.body;
      const id = t.id || `fundtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const fundId = t.fundId || t.fund_id || '';
      const targetFundId = t.targetFundId || t.target_fund_id || null;
      const type = t.type || 'deposit';
      const amount = Number(t.amount) || 0;
      const note = t.note || t.description || '';
      const repName = t.repName || t.rep_name || '';
      const createdAt = t.createdAt || t.created_at || new Date().toISOString();

      let alreadyExists = false;
      if (isPgConfigured()) {
        const insertRes = await executePg(
          `INSERT INTO fund_transactions (id, fund_id, target_fund_id, type, amount, note, rep_name, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [id, fundId, targetFundId, type, amount, note, repName, createdAt]
        ).catch(() => []);
        if (!insertRes || insertRes.length === 0) {
          alreadyExists = true;
        }
      } else {
        if ((fileDb.get<any>("fund_transactions") || []).some((tx: any) => tx.id === id)) {
          alreadyExists = true;
        }
      }

      const saved = fileDb.upsert("fund_transactions", {
        id,
        fundId,
        targetFundId,
        type,
        amount,
        note,
        repName,
        createdAt
      });

      // Automatically update fund balances in PostgreSQL & fileDb ONLY IF NEW TRANSACTION
      if (!alreadyExists) {
        if (saved.type === 'transfer') {
          if (saved.fundId) await adjustFundBalance(saved.fundId, -amount);
          if (saved.targetFundId) await adjustFundBalance(saved.targetFundId, +amount);
        } else if (saved.type === 'withdraw' || saved.type === 'expense' || saved.type === 'employee_loan') {
          if (saved.fundId) await adjustFundBalance(saved.fundId, -amount);
        } else if (saved.type === 'deposit' || saved.type === 'employee_repay') {
          if (saved.fundId) await adjustFundBalance(saved.fundId, +amount);
        }
      }

      bumpSyncVersion();
      res.json({ success: true, transaction: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/fund-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const existing = (fileDb.get<any>("fund_transactions") || []).find((x: any) => x.id === id);
      const oldAmount = existing ? Number(existing.amount) || 0 : 0;
      const newAmount = updates.amount !== undefined ? Number(updates.amount) || 0 : oldAmount;
      const diff = newAmount - oldAmount;
      const type = updates.type || existing?.type || 'deposit';
      const fundId = updates.fundId || existing?.fundId || updates.fund_id;
      const targetFundId = updates.targetFundId || existing?.targetFundId || updates.target_fund_id;
      const note = updates.note !== undefined ? updates.note : (existing?.note || '');

      fileDb.update("fund_transactions", id, updates);
      await executePg(
        `UPDATE fund_transactions SET amount = COALESCE($1, amount), note = COALESCE($2, note) WHERE id = $3`,
        [updates.amount, updates.note, id]
      );

      if (diff !== 0) {
        if (type === 'transfer') {
          if (fundId) await adjustFundBalance(fundId, -diff);
          if (targetFundId) await adjustFundBalance(targetFundId, +diff);
        } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
          if (fundId) await adjustFundBalance(fundId, -diff);
        } else if (type === 'deposit' || type === 'employee_repay') {
          if (fundId) await adjustFundBalance(fundId, +diff);
        }
      }

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/fund-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const existing = (fileDb.get<any>("fund_transactions") || []).find((x: any) => x.id === id);
      if (existing && existing.amount) {
        const amount = Number(existing.amount) || 0;
        const type = existing.type;
        const fundId = existing.fundId || existing.fund_id;
        const targetFundId = existing.targetFundId || existing.target_fund_id;

        if (type === 'transfer') {
          if (fundId) await adjustFundBalance(fundId, +amount);
          if (targetFundId) await adjustFundBalance(targetFundId, -amount);
        } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
          if (fundId) await adjustFundBalance(fundId, +amount);
        } else if (type === 'deposit' || type === 'employee_repay') {
          if (fundId) await adjustFundBalance(fundId, -amount);
        }
      }

      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      fileDb.delete("fund_transactions", id);
      await executePg(`DELETE FROM fund_transactions WHERE id = $1`, [id]);
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Employees API ---
  app.get("/api/employees", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM employees ORDER BY name ASC");
          const emps = (rows || []).map(mapEmployeeRow);
          fileDb.setAll("employees", emps);
          return res.json(emps);
        } catch (pgErr) {
          console.warn("Postgres fetch employees error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("employees"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      const e = req.body;
      const empName = (e.name || '').trim();
      if (!empName) {
        return res.status(400).json({ error: "اسم الموظف مطلوب" });
      }
      const normName = normalizeEntityName(empName);

      const existingEmps = fileDb.get<any>("employees") || [];
      if (existingEmps.some((item: any) => normalizeEntityName(item.name) === normName)) {
        return res.status(400).json({ error: "عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكرار أسماء الموظفين" });
      }

      if (isPgConfigured()) {
        const checkPg = await executePg(
          "SELECT id FROM employees WHERE LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $1",
          [normName]
        );
        if (checkPg && checkPg.length > 0) {
          return res.status(400).json({ error: "عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكرار أسماء الموظفين" });
        }
      }

      const id = e.id || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("employees", {
        id,
        name: e.name || '',
        phone: e.phone || '',
        jobTitle: e.jobTitle || '',
        position: e.position || '',
        salary: Number(e.salary) || 0,
        debtBalance: Number(e.debtBalance) || 0,
        totalDebt: Number(e.totalDebt) || 0,
        isRep: Boolean(e.isRep),
        repId: e.repId || null,
        createdAt: e.createdAt || new Date().toISOString()
      });

      await executePg(
        `INSERT INTO employees (id, name, phone, job_title, position, salary, debt_balance, total_debt, is_rep, rep_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, salary = EXCLUDED.salary, debt_balance = EXCLUDED.debt_balance`,
        [id, saved.name, saved.phone, saved.jobTitle, saved.position, saved.salary, saved.debtBalance, saved.totalDebt, saved.isRep, saved.repId, saved.createdAt]
      );

      bumpSyncVersion();
      res.json({ success: true, employee: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.name !== undefined) {
        const empName = (updates.name || '').trim();
        if (!empName) {
          return res.status(400).json({ error: "اسم الموظف مطلوب" });
        }
        const normName = normalizeEntityName(empName);

        const existingEmps = fileDb.get<any>("employees") || [];
        if (existingEmps.some((item: any) => item.id !== id && normalizeEntityName(item.name) === normName)) {
          return res.status(400).json({ error: "عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكرار أسماء الموظفين" });
        }

        if (isPgConfigured()) {
          const checkPg = await executePg(
            "SELECT id FROM employees WHERE id != $1 AND LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g'))) = $2",
            [id, normName]
          );
          if (checkPg && checkPg.length > 0) {
            return res.status(400).json({ error: "عذراً، اسم الموظف مسجل مسبقاً ولا يمكن تكرار أسماء الموظفين" });
          }
        }
      }

      fileDb.update("employees", id, updates);
      await executePg(
        `UPDATE employees SET name = COALESCE($1, name), phone = COALESCE($2, phone), job_title = COALESCE($3, job_title), position = COALESCE($4, position), salary = COALESCE($5, salary), debt_balance = COALESCE($6, debt_balance), total_debt = COALESCE($7, total_debt) WHERE id = $8`,
        [updates.name, updates.phone, updates.jobTitle, updates.position, updates.salary, updates.debtBalance, updates.totalDebt, id]
      );
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cleanup-duplicates", async (req, res) => {
    try {
      await cleanupDuplicateEntities();
      res.json({ success: true, message: "تم تنظيف الأسماء المكررة بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employees", async (req, res) => {
    try {
      const allEmps = fileDb.get<any>("employees") || [];
      const empIds = allEmps.map((e: any) => e.id).filter(Boolean);
      
      fileDb.setAll("employees", []);
      
      if (isPgConfigured()) {
        if (empIds.length > 0) {
          await executePg(
            `INSERT INTO deleted_records (record_id, table_name) 
             SELECT unnest($1::text[]), 'employees' 
             ON CONFLICT (record_id) DO NOTHING`,
            [empIds]
          ).catch(() => {});
        }
        await executePg(`
          INSERT INTO deleted_records (record_id, table_name)
          SELECT id, 'employees' FROM employees
          ON CONFLICT (record_id) DO NOTHING
        `).catch(() => {});
        await executePg(`DELETE FROM employees`).catch(() => {});

        await executePg(`
          INSERT INTO deleted_records (record_id, table_name)
          SELECT id, 'employee_transactions' FROM employee_transactions
          ON CONFLICT (record_id) DO NOTHING
        `).catch(() => {});
        await executePg(`DELETE FROM employee_transactions`).catch(() => {});
        fileDb.setAll("employee_transactions", []);
      }
      
      bumpSyncVersion();
      res.json({ success: true, message: "تم حذف جميع الموظفين بنجاح" });
    } catch (err: any) {
      console.error('[DELETE /api/employees] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("employees", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employees') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM employees WHERE id = $1`, [id]).catch(() => {});

      // Also cascade delete related employee transactions
      const relTx = await executePg(`SELECT id FROM employee_transactions WHERE employee_id = $1`, [id]).catch(() => []);
      if (Array.isArray(relTx) && relTx.length > 0) {
        for (const tx of relTx) {
          if (tx?.id) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employee_transactions') ON CONFLICT (record_id) DO NOTHING`, [tx.id]).catch(() => {});
            fileDb.delete("employee_transactions", tx.id);
          }
        }
      }
      await executePg(`DELETE FROM employee_transactions WHERE employee_id = $1`, [id]).catch(() => {});

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Employee Transactions API ---
  app.get("/api/employee-transactions", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM employee_transactions ORDER BY created_at DESC");
          const txs = (rows || []).map(mapEmpTxRow);
          fileDb.setAll("employee_transactions", txs);
          return res.json(txs);
        } catch (pgErr) {
          console.warn("Postgres fetch employee-transactions error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("employee_transactions"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/employee-transactions", async (req, res) => {
    try {
      const et = req.body;
      const id = et.id || `emptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("employee_transactions", {
        id,
        employeeId: et.employeeId || '',
        employeeName: et.employeeName || et.repName || '',
        fundId: et.fundId || '',
        type: et.type || 'loan',
        amount: Number(et.amount) || 0,
        notes: et.notes || et.note || '',
        note: et.notes || et.note || '',
        repName: et.repName || et.employeeName || '',
        createdAt: et.createdAt || new Date().toISOString()
      });

      await executePg(
        `INSERT INTO employee_transactions (id, employee_id, fund_id, type, amount, notes, note, rep_name, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           amount = EXCLUDED.amount, type = EXCLUDED.type, notes = EXCLUDED.notes, fund_id = EXCLUDED.fund_id`,
        [id, saved.employeeId, saved.fundId, saved.type, saved.amount, saved.notes, saved.notes, saved.repName, saved.createdAt]
      );

      const isLoan = saved.type === 'loan' || (saved.type as string) === 'debt' || (saved.type as string) === 'سلفة' || (saved.type as string) === 'دين';
      const amount = Number(saved.amount) || 0;
      const empName = et.employeeName || saved.repName || 'الموظف';
      const ftId = `ft_emp_${id}`;
      const ftType = isLoan ? 'employee_loan' : 'employee_repay';
      const ftNote = isLoan
        ? `دين / سلفة للموظف (${empName})${saved.notes ? ` - ${saved.notes}` : ''}`
        : `راجع دين / تسديد من الموظف (${empName})${saved.notes ? ` - ${saved.notes}` : ''}`;

      if (saved.fundId && amount > 0) {
        if (isPgConfigured()) {
          await executePg(
            `INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, type = EXCLUDED.type`,
            [ftId, saved.fundId, ftType, amount, ftNote, saved.repName || 'الإدارة', saved.createdAt]
          ).catch(() => {});
        }
        fileDb.upsert("fund_transactions", {
          id: ftId,
          fundId: saved.fundId,
          type: ftType,
          amount,
          note: ftNote,
          repName: saved.repName || 'الإدارة',
          createdAt: saved.createdAt
        });

        // Adjust fund balance: if loan -> decreases (-amount), if repay -> increases (+amount)
        await adjustFundBalance(saved.fundId, isLoan ? -amount : +amount);
      }

      bumpSyncVersion();
      const amtFmt = amount.toLocaleString('en-US');
      broadcastPushNotification({
        title: isLoan ? '💸 إشعار دين جديد' : '💵 إشعار راجع دين',
        body: isLoan
          ? `تم تسجيل دين بمبلغ (${amtFmt} د.ع) على "${empName}"${saved.notes ? ` (${saved.notes})` : ''} بواسطة ${saved.repName || 'الإدارة'}`
          : `تم تسجيل راجع دين بمبلغ (${amtFmt} د.ع) من "${empName}"${saved.notes ? ` (${saved.notes})` : ''} بواسطة ${saved.repName || 'الإدارة'}`,
        tag: `emp_${isLoan ? 'debt' : 'repay'}_${saved.id}`,
        type: isLoan ? 'debt' : 'repay',
        targetRepId: saved.employeeId,
        targetRepName: empName,
      }).catch(() => {});

      res.json({ success: true, transaction: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/employee-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      let existing = (fileDb.get<any>("employee_transactions") || []).find((x: any) => x.id === id);
      if (!existing && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM employee_transactions WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) {
          existing = {
            id: rows[0].id,
            fundId: rows[0].fund_id,
            amount: Number(rows[0].amount) || 0,
            type: rows[0].type,
            notes: rows[0].notes || rows[0].note,
            repName: rows[0].rep_name
          };
        }
      }

      const oldAmount = Number(existing?.amount) || 0;
      const newAmount = Number(updates.amount !== undefined ? updates.amount : oldAmount);
      const diff = newAmount - oldAmount;
      const isLoan = (existing?.type || updates.type) === 'loan' || (existing?.type || updates.type) === 'debt';
      const fundId = updates.fundId || existing?.fundId;

      fileDb.update("employee_transactions", id, updates);
      await executePg(
        `UPDATE employee_transactions SET amount = COALESCE($1, amount), notes = COALESCE($2, notes) WHERE id = $3`,
        [updates.amount, updates.notes || updates.note, id]
      );

      // Adjust fund balance by diff
      if (fundId && diff !== 0) {
        await adjustFundBalance(fundId, isLoan ? -diff : +diff);
      }

      // Update linked fund transaction
      const ftId = `ft_emp_${id}`;
      const ftNote = isLoan
        ? `دين / سلفة للموظف (${updates.employeeName || existing?.employeeName || 'الموظف'})${updates.notes ? ` - ${updates.notes}` : ''}`
        : `راجع دين / تسديد من الموظف (${updates.employeeName || existing?.employeeName || 'الموظف'})${updates.notes ? ` - ${updates.notes}` : ''}`;
      fileDb.update<any>("fund_transactions", ftId, { amount: newAmount, note: ftNote } as any);
      if (isPgConfigured()) {
        await executePg(`UPDATE fund_transactions SET amount = $1, note = $2 WHERE id = $3`, [newAmount, ftNote, ftId]).catch(() => {});
      }

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employee-transactions", async (req, res) => {
    try {
      fileDb.setAll("employee_transactions", []);
      if (isPgConfigured()) {
        await executePg(`
          INSERT INTO deleted_records (record_id, table_name)
          SELECT id, 'employee_transactions' FROM employee_transactions
          ON CONFLICT (record_id) DO NOTHING
        `).catch(() => {});
        await executePg(`DELETE FROM employee_transactions`).catch(() => {});
      }
      bumpSyncVersion();
      res.json({ success: true, message: "تم حذف جميع حركات وسجلات الموظفين بنجاح" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/employee-transactions/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let existing = (fileDb.get<any>("employee_transactions") || []).find((x: any) => x.id === id);
      if (!existing && isPgConfigured()) {
        const rows = await executePg("SELECT * FROM employee_transactions WHERE id = $1 LIMIT 1", [id]).catch(() => []);
        if (rows && rows.length > 0) {
          existing = {
            id: rows[0].id,
            fundId: rows[0].fund_id,
            amount: Number(rows[0].amount) || 0,
            type: rows[0].type,
            notes: rows[0].notes || rows[0].note,
            repName: rows[0].rep_name,
            createdAt: rows[0].created_at
          };
        }
      }

      if (existing && existing.amount && existing.fundId) {
        const isLoan = existing.type === 'loan' || (existing.type as string) === 'debt' || (existing.type as string) === 'سلفة' || (existing.type as string) === 'دين';
        const amount = Number(existing.amount) || 0;
        // On deletion of loan: fund balance increases (+amount). On deletion of repay: fund balance decreases (-amount).
        await adjustFundBalance(existing.fundId, isLoan ? +amount : -amount);
      }

      // Delete linked fund transactions
      const ftId = `ft_emp_${id}`;
      const ftIdAlt = `ft_emptx_${id}`;
      fileDb.delete("fund_transactions", ftId);
      fileDb.delete("fund_transactions", ftIdAlt);
      if (isPgConfigured()) {
        await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions'), ($2, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [ftId, ftIdAlt]).catch(() => {});
        await executePg(`DELETE FROM fund_transactions WHERE id = $1 OR id = $2`, [ftId, ftIdAlt]).catch(() => {});
      }

      fileDb.delete("employee_transactions", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employee_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM employee_transactions WHERE id = $1`, [id]).catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Payment Conflicts API ---
  app.get("/api/payment-conflicts", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg("SELECT * FROM payment_conflicts ORDER BY created_at DESC");
          const conflicts = (rows || []).map(mapConflictRow);
          fileDb.setAll("payment_conflicts", conflicts);
          return res.json(conflicts);
        } catch (pgErr) {
          console.warn("Postgres fetch payment-conflicts error, fallback to fileDb:", pgErr);
        }
      }
      res.json(fileDb.get("payment_conflicts"));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payment-conflicts", async (req, res) => {
    try {
      const pc = req.body;
      const id = pc.id || `conflict_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const saved = fileDb.upsert("payment_conflicts", {
        id,
        contractId: pc.contractId || '',
        customerName: pc.customerName || '',
        attemptedAmount: Number(pc.attemptedAmount) || 0,
        actualRemainingBalance: Number(pc.actualRemainingBalance) || 0,
        excessAmount: Number(pc.excessAmount) || 0,
        acceptedAmount: Number(pc.acceptedAmount) || 0,
        repName: pc.repName || '',
        note: pc.note || '',
        paymentDate: pc.paymentDate || '',
        createdAt: pc.createdAt || new Date().toISOString(),
        status: pc.status || 'pending_review',
        resolvedBy: pc.resolvedBy || null,
        resolvedAt: pc.resolvedAt || null,
        resolutionNote: pc.resolutionNote || null
      });

      await executePg(
        `INSERT INTO payment_conflicts (id, contract_id, customer_name, attempted_amount, actual_remaining_balance, excess_amount, accepted_amount, rep_name, note, payment_date, created_at, status, resolved_by, resolved_at, resolution_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           excess_amount = EXCLUDED.excess_amount,
           accepted_amount = EXCLUDED.accepted_amount,
           resolved_by = EXCLUDED.resolved_by,
           resolved_at = EXCLUDED.resolved_at,
           resolution_note = EXCLUDED.resolution_note`,
        [id, saved.contractId, saved.customerName, saved.attemptedAmount, saved.actualRemainingBalance, saved.excessAmount, saved.acceptedAmount, saved.repName, saved.note, saved.paymentDate, saved.createdAt, saved.status, saved.resolvedBy, saved.resolvedAt, saved.resolutionNote]
      ).catch((err) => {
        console.warn("Postgres insert payment_conflict warning:", err?.message || err);
      });

      bumpSyncVersion();
      if (saved.status === 'resolved') {
        let listId = null;
        if (saved.contractId && isPgConfigured()) {
          try {
            const rows = await executePg("SELECT list_id FROM sales WHERE id = $1", [saved.contractId]);
            if (rows.length > 0) listId = rows[0].list_id;
          } catch (e) {}
        }
        const excessFmt = Number(saved.excessAmount || 0).toLocaleString('en-US');
        const acceptedFmt = Number(saved.acceptedAmount || 0).toLocaleString('en-US');
        broadcastPushNotification({
          title: '🔔 إشعار تسوية تصفير الحساب',
          body: `تمت تسوية وتصفير حساب الزبون "${saved.customerName}". الواصل يطابق سعر البيع (${acceptedFmt} د.ع). المبلغ الفائض في حوزة المندوب "${saved.repName || 'المندوب'}": ${excessFmt} د.ع`,
          tag: `settle_${saved.id}`,
          type: 'conflict',
          listId,
          targetRepName: saved.repName,
        }).catch(() => {});
      } else {
        broadcastPushNotification({
          title: 'تنبيه تعارض الدفعات',
          body: `دفعة معلقة للزبون "${saved.customerName}" تتجاوز المتبقي مضافة بواسطة المندوب ${saved.repName || 'المندوب'}`,
          tag: `conflict_${saved.id}`,
          type: 'conflict',
          targetRepName: saved.repName,
        }).catch(() => {});
      }
      res.json({ success: true, conflict: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/payment-conflicts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};
      fileDb.update("payment_conflicts", id, updates);
      await executePg(
        `UPDATE payment_conflicts SET
           status = COALESCE($1, status),
           resolved_by = COALESCE($2, resolved_by),
           resolved_at = COALESCE($3, resolved_at),
           resolution_note = COALESCE($4, resolution_note),
           accepted_amount = COALESCE($5, accepted_amount),
           excess_amount = COALESCE($6, excess_amount)
         WHERE id = $7`,
        [
          updates.status || null,
          updates.resolvedBy ?? updates.resolved_by ?? null,
          updates.resolvedAt ?? updates.resolved_at ?? null,
          updates.resolutionNote ?? updates.resolution_note ?? null,
          updates.acceptedAmount !== undefined ? Number(updates.acceptedAmount) : null,
          updates.excessAmount !== undefined ? Number(updates.excessAmount) : null,
          id
        ]
      ).catch((err) => {
        console.warn("Postgres update payment_conflict warning:", err?.message || err);
      });
      bumpSyncVersion();

      if (updates.status === 'resolved') {
        const existing = (fileDb.get("payment_conflicts") || []).find((c: any) => c.id === id);
        if (existing) {
          let listId = null;
          if (existing.contractId && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT list_id FROM sales WHERE id = $1", [existing.contractId]);
              if (rows.length > 0) listId = rows[0].list_id;
            } catch (e) {}
          }
          const excessFmt = Number(existing.excessAmount || updates.excessAmount || 0).toLocaleString('en-US');
          const acceptedFmt = Number(existing.acceptedAmount || updates.acceptedAmount || 0).toLocaleString('en-US');
          broadcastPushNotification({
            title: '🔔 إشعار تسوية تصفير الحساب',
            body: `تمت تسوية وتصفير حساب الزبون "${existing.customerName}". الواصل يطابق سعر البيع (${acceptedFmt} د.ع). المبلغ الفائض في حوزة المندوب "${existing.repName || 'المندوب'}": ${excessFmt} د.ع`,
            tag: `settle_${existing.id}`,
            type: 'conflict',
            listId,
            targetRepName: existing.repName,
          }).catch(() => {});
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/payment-conflicts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("payment_conflicts", id);
      await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payment_conflicts') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
      await executePg(`DELETE FROM payment_conflicts WHERE id = $1`, [id]).catch(() => {});
      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // APPOINTMENTS ENDPOINTS (PostgreSQL + fileDb Fallback + Real-time Sync)
  // -------------------------------------------------------------
  app.get("/api/appointments", async (req, res) => {
    try {
      if (isPgConfigured()) {
        try {
          const rows = await executePg(`
            SELECT * FROM appointments
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = appointments.id AND (dr.table_name = 'appointments' OR dr.table_name = 'unknown'))
            ORDER BY created_at DESC
          `);
          const items = (rows || []).map(mapAppointmentRow);
          fileDb.setAll("appointments", items);
          return res.json(items);
        } catch (pgErr) {
          console.warn("PostgreSQL fetch appointments warning, fallback to fileDb:", pgErr);
        }
      }
      const records = fileDb.get("appointments") || [];
      res.json(records);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const appt = req.body || {};
      const id = appt.id || `appt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cAt = appt.createdAt || new Date().toISOString();
      const saved = fileDb.upsert("appointments", {
        ...appt,
        id,
        createdAt: cAt,
      });

      if (isPgConfigured()) {
        try {
          const query = `
            INSERT INTO appointments (
              id, contract_id, customer_name, customer_phone, customer_address,
              list_id, list_name, appointment_type, recurring_day, recurring_day_name,
              recurring_day_of_month, recurring_month_day_name, appointment_date,
              appointment_time, due_date, due_time, title, notes, note, status,
              created_by_name, created_by_rep_name, created_by_rep_id, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
            ON CONFLICT (id) DO UPDATE SET
              contract_id = EXCLUDED.contract_id,
              customer_name = EXCLUDED.customer_name,
              customer_phone = EXCLUDED.customer_phone,
              customer_address = EXCLUDED.customer_address,
              list_id = EXCLUDED.list_id,
              list_name = EXCLUDED.list_name,
              appointment_type = EXCLUDED.appointment_type,
              recurring_day = EXCLUDED.recurring_day,
              recurring_day_name = EXCLUDED.recurring_day_name,
              recurring_day_of_month = EXCLUDED.recurring_day_of_month,
              recurring_month_day_name = EXCLUDED.recurring_month_day_name,
              appointment_date = EXCLUDED.appointment_date,
              appointment_time = EXCLUDED.appointment_time,
              due_date = EXCLUDED.due_date,
              due_time = EXCLUDED.due_time,
              title = EXCLUDED.title,
              notes = EXCLUDED.notes,
              note = EXCLUDED.note,
              status = EXCLUDED.status,
              created_by_name = EXCLUDED.created_by_name,
              created_by_rep_name = EXCLUDED.created_by_rep_name,
              created_by_rep_id = EXCLUDED.created_by_rep_id
          `;
          const vals = [
            id,
            appt.contractId || appt.contract_id || null,
            appt.customerName || appt.customer_name || '',
            appt.customerPhone || appt.customer_phone || '',
            appt.customerAddress || appt.customer_address || '',
            appt.listId || appt.list_id || null,
            appt.listName || appt.list_name || '',
            appt.appointmentType || appt.appointment_type || 'specific_date',
            appt.recurringDay != null ? Number(appt.recurringDay) : (appt.recurring_day != null ? Number(appt.recurring_day) : null),
            appt.recurringDayName || appt.recurring_day_name || '',
            appt.recurringDayOfMonth != null ? Number(appt.recurringDayOfMonth) : (appt.recurring_day_of_month != null ? Number(appt.recurring_day_of_month) : null),
            appt.recurringMonthDayName || appt.recurring_month_day_name || '',
            appt.appointmentDate || appt.appointment_date || '',
            appt.appointmentTime || appt.appointment_time || '',
            appt.dueDate || appt.due_date || '',
            appt.dueTime || appt.due_time || '',
            appt.title || '',
            appt.notes || appt.note || '',
            appt.note || appt.notes || '',
            appt.status || 'pending',
            appt.createdByName || appt.created_by_name || '',
            appt.createdByRepName || appt.created_by_rep_name || '',
            appt.createdByRepId || appt.created_by_rep_id || '',
            cAt
          ];
          await executePg(query, vals);
        } catch (pgErr) {
          console.warn("PostgreSQL save appointment warning:", pgErr);
        }
      }

      bumpSyncVersion();
      broadcastPushNotification({
        title: '📅 إشعار موعد جديد',
        body: `"${saved.customerName}" - بتاريخ ${saved.appointmentDate}${saved.appointmentTime ? ` الساعة ${saved.appointmentTime}` : ''}${saved.note ? ` (${saved.note})` : ''}`,
        tag: `new_appt_${saved.id}`,
        type: 'appointment',
        listId: saved.listId,
      }).catch(() => {});
      res.json({ success: true, appointment: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/appointments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};
      const updated = fileDb.update("appointments", id, updates);

      if (isPgConfigured()) {
        try {
          const fieldMap: Record<string, string> = {
            contractId: 'contract_id',
            contract_id: 'contract_id',
            customerName: 'customer_name',
            customer_name: 'customer_name',
            customerPhone: 'customer_phone',
            customer_phone: 'customer_phone',
            customerAddress: 'customer_address',
            customer_address: 'customer_address',
            listId: 'list_id',
            list_id: 'list_id',
            listName: 'list_name',
            list_name: 'list_name',
            appointmentType: 'appointment_type',
            appointment_type: 'appointment_type',
            recurringDay: 'recurring_day',
            recurring_day: 'recurring_day',
            recurringDayName: 'recurring_day_name',
            recurring_day_name: 'recurring_day_name',
            recurringDayOfMonth: 'recurring_day_of_month',
            recurring_day_of_month: 'recurring_day_of_month',
            recurringMonthDayName: 'recurring_month_day_name',
            recurring_month_day_name: 'recurring_month_day_name',
            appointmentDate: 'appointment_date',
            appointment_date: 'appointment_date',
            appointmentTime: 'appointment_time',
            appointment_time: 'appointment_time',
            dueDate: 'due_date',
            due_date: 'due_date',
            dueTime: 'due_time',
            due_time: 'due_time',
            title: 'title',
            notes: 'notes',
            note: 'note',
            status: 'status',
          };

          const setClauses: string[] = [];
          const values: any[] = [];
          let idx = 1;
          const addedCols = new Set<string>();

          for (const [k, v] of Object.entries(updates)) {
            if (k === 'id') continue;
            const col = fieldMap[k];
            if (col && !addedCols.has(col)) {
              addedCols.add(col);
              setClauses.push(`${col} = $${idx++}`);
              values.push(v);
            }
          }

          if (setClauses.length > 0) {
            values.push(id);
            await executePg(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
          }
        } catch (pgErr) {
          console.warn("PostgreSQL update appointment warning:", pgErr);
        }
      }

      bumpSyncVersion();
      res.json({ success: true, appointment: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      const { id } = req.params;
      fileDb.delete("appointments", id);

      if (isPgConfigured()) {
        try {
          await executePg(`DELETE FROM appointments WHERE id = $1`, [id]);
          await executePg(
            `INSERT INTO deleted_records (record_id, table_name, deleted_at) VALUES ($1, 'appointments', NOW()) ON CONFLICT (record_id) DO NOTHING`,
            [id]
          ).catch(() => {});
        } catch (pgErr) {
          console.warn("PostgreSQL delete appointment warning:", pgErr);
        }
      }

      bumpSyncVersion();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Debug Tables & Schema Status API ---
  app.get("/api/debug/tables", async (req, res) => {
    try {
      if (!isPgConfigured()) {
        return res.json({ success: false, message: "PostgreSQL is not configured" });
      }

      const tablesToCheck = [
        "sales",
        "contracts",
        "payments",
        "cash_funds",
        "inventory_items",
        "employees",
        "reps",
        "customer_lists",
        "customers",
        "fund_transactions",
        "employee_transactions",
        "payment_conflicts"
      ];

      const report: Record<string, any> = {};

      for (const table of tablesToCheck) {
        try {
          const countRes = await executePg(`SELECT COUNT(*)::int AS count FROM ${table}`);
          const sampleRes = await executePg(`SELECT * FROM ${table} LIMIT 1`);
          const columns = sampleRes[0] ? Object.keys(sampleRes[0]) : [];
          report[table] = {
            exists: true,
            rowCount: countRes[0]?.count ?? 0,
            columns: columns
          };
        } catch (err: any) {
          report[table] = {
            exists: false,
            error: err.message
          };
        }
      }

      res.json({
        success: true,
        database: "postgresql",
        timestamp: new Date().toISOString(),
        tables: report
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Driving street navigation route proxy API (OSRM + openstreetmap mirrors) with in-memory caching
  const routeCache = new Map<string, { data: any; expiry: number }>();

  app.get("/api/route", async (req, res) => {
    try {
      const fromLat = Number(req.query.fromLat ?? req.query.startLat);
      const fromLng = Number(req.query.fromLng ?? req.query.startLng);
      const toLat = Number(req.query.toLat ?? req.query.endLat);
      const toLng = Number(req.query.toLng ?? req.query.endLng);

      if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
        return res.status(400).json({ error: "Invalid coordinates provided" });
      }

      // Check route cache (5 min TTL)
      const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}_${toLat.toFixed(4)},${toLng.toFixed(4)}`;
      const cached = routeCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return res.json(cached.data);
      }

      const endpoints = [
        `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`,
        `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`,
        `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=false`,
      ];

      for (const endpoint of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8500);
          const response = await fetch(endpoint, {
            headers: {
              'User-Agent': 'InstallmentApp/2.0 (Street Navigation Driving Route)',
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data: any = await response.json();
            if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
              const route = data.routes[0];
              const geoCoords = route.geometry.coordinates || [];
              const coordinates = geoCoords.map(([lng, lat]: [number, number]) => [lat, lng]);
              
              if (coordinates.length >= 2) {
                const result = {
                  success: true,
                  distance: Math.round(route.distance),
                  duration: Math.round(route.duration),
                  coordinates,
                };

                // Store in cache for 5 minutes
                if (routeCache.size > 200) {
                  const firstKey = routeCache.keys().next().value;
                  if (firstKey) routeCache.delete(firstKey);
                }
                routeCache.set(cacheKey, { data: result, expiry: Date.now() + 5 * 60 * 1000 });

                return res.json(result);
              }
            }
          }
        } catch (fetchErr) {
          // Try next endpoint
        }
      }

      res.status(502).json({ error: "Routing services unavailable" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Reports & Summary Totals API ---
  app.get("/api/reports/totals", async (req, res) => {
    try {
      if (isPgConfigured()) {
        await syncCustomersTableInPg().catch(() => {});
        const todayStr = new Date().toISOString().split('T')[0];
        const monthPrefix = todayStr.substring(0, 7);
        const queryErrors: Record<string, string> = {};

        const [
          salesStatsRes,
          paymentStatsRes,
          fundsStatsRes,
          inventoryStatsRes,
          employeesStatsRes,
          repsStatsRes,
          customersStatsRes,
          fundTxStatsRes,
          customerListsStatsRes,
          locationsStatsRes,
        ] = await Promise.all([
          // 1. العقود والمبيعات (sales مع fallback إلى contracts)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_contracts,
              COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_contracts,
              COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_contracts,
              COALESCE(SUM(total_price), 0)::float AS total_sales_amount,
              COALESCE(SUM(total_paid), 0)::float AS total_paid_amount,
              COALESCE(SUM(remaining_balance), 0)::float AS total_remaining_balance,
              COALESCE(SUM(advance_payment), 0)::float AS total_advance_payment
            FROM sales
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = sales.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts'))
          `).catch(async (err) => {
            queryErrors["sales"] = err.message;
            console.warn("Notice: sales table query failed, trying contracts view/table:", err.message);
            return executePg(`
              SELECT 
                COUNT(*)::int AS total_contracts,
                COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_contracts,
                COUNT(CASE WHEN status = 'completed' THEN 1 END)::int AS completed_contracts,
                COALESCE(SUM(total_price), 0)::float AS total_sales_amount,
                COALESCE(SUM(total_paid), 0)::float AS total_paid_amount,
                COALESCE(SUM(remaining_balance), 0)::float AS total_remaining_balance,
                COALESCE(SUM(advance_payment), 0)::float AS total_advance_payment
              FROM contracts
              WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = contracts.id)
            `).catch((err2) => {
              queryErrors["contracts"] = err2.message;
              console.error("Error querying sales/contracts:", err2.message);
              return [{}];
            });
          }),

          // 2. التسديدات والمقبوضات (تحويل payment_date::text لضمان التوافق مع Text/Date/Timestamp)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_payments_count,
              COALESCE(SUM(COALESCE(amount_paid, amount, 0)), 0)::float AS total_payments_amount,
              COALESCE(SUM(CASE WHEN payment_date::text LIKE $1 || '%' THEN COALESCE(amount_paid, amount, 0) ELSE 0 END), 0)::float AS today_payments_amount,
              COALESCE(SUM(CASE WHEN payment_date::text LIKE $2 THEN COALESCE(amount_paid, amount, 0) ELSE 0 END), 0)::float AS month_payments_amount
            FROM payments
            WHERE COALESCE(amount_paid, amount, 0) > 0
              AND (id LIKE 'pay_%' OR (id NOT LIKE 'contract_%' AND id NOT LIKE 'emp_%' AND id NOT LIKE 'item_%'))
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = payments.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown' OR dr.table_name IS NULL))
          `, [todayStr, `${monthPrefix}%`]).catch((err) => {
            queryErrors["payments"] = err.message;
            console.error("Error querying payments:", err.message);
            return [{}];
          }),

          // 3. الصناديق (استعلام يدعم balance أو current_balance تلقائياً)
          executePg(`
            SELECT 
              COUNT(*)::int AS funds_count,
              COALESCE(SUM(balance), 0)::float AS total_funds_balance
            FROM cash_funds
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cash_funds.id AND (dr.table_name IN ('cash_funds', 'funds') OR dr.table_name = 'unknown' OR dr.table_name IS NULL))
          `).catch(async () => {
            return executePg(`
              SELECT 
                COUNT(*)::int AS funds_count,
                COALESCE(SUM(current_balance), 0)::float AS total_funds_balance
              FROM cash_funds
              WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = cash_funds.id AND (dr.table_name IN ('cash_funds', 'funds') OR dr.table_name = 'unknown' OR dr.table_name IS NULL))
            `).catch((err) => {
              queryErrors["cash_funds"] = err.message;
              console.error("Error querying cash_funds:", err.message);
              return [{}];
            });
          }),

          // 4. المخزن والمواد
          executePg(`
            SELECT 
              COUNT(*)::int AS total_inventory_items,
              COALESCE(SUM(quantity), 0)::int AS total_inventory_quantity,
              COALESCE(SUM(quantity * purchase_price), 0)::float AS total_inventory_value
            FROM inventory_items
            WHERE (id LIKE 'item_%' OR (id NOT LIKE 'emp_%' AND id NOT LIKE 'pay_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'ft_%' AND id NOT LIKE 'emptx_%' AND id NOT LIKE 'conflict_%'))
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = inventory_items.id AND (dr.table_name = 'inventory_items' OR dr.table_name = 'inventory' OR dr.table_name = 'unknown'))
          `).catch((err) => {
            queryErrors["inventory_items"] = err.message;
            console.error("Error querying inventory_items:", err.message);
            return [{}];
          }),

          // 5. الموظفين (متوافق مع جدول employees وتجاهل المعرفات الخاطئة)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_employees,
              COUNT(*)::int AS active_employees
            FROM employees
            WHERE id NOT LIKE 'item_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'pay_%' AND id NOT LIKE 'ft_%'
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = employees.id)
          `).catch((err) => {
            queryErrors["employees"] = err.message;
            console.error("Error querying employees:", err.message);
            return [{}];
          }),

          // 6. المندوبين (متوافق مع جدول reps)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_reps,
              COUNT(CASE WHEN role IS NOT NULL THEN 1 END)::int AS active_reps
            FROM reps
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = reps.id AND dr.record_id != 'rep-1')
          `).catch((err) => {
            queryErrors["reps"] = err.message;
            console.error("Error querying reps:", err.message);
            return [{}];
          }),

          // 7. الزبائن (استعلام مباشر من جدول customers في سيرفر Hostinger)
          executePg(`
            SELECT 
              COUNT(*)::int AS total_customers,
              COALESCE(SUM(total_paid), 0)::float AS total_paid,
              COALESCE(SUM(remaining_balance), 0)::float AS total_remaining
            FROM customers
            WHERE id NOT LIKE 'item_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'pay_%' AND id NOT LIKE 'ft_%'
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = customers.id)
          `).catch(async (err) => {
            queryErrors["customers"] = err.message;
            return [{}];
          }),

          // 8. عدد عمليات الصناديق
          executePg(`
            SELECT COUNT(*)::int AS total_fund_transactions
            FROM fund_transactions
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = fund_transactions.id)
          `).catch((err) => {
            queryErrors["fund_transactions"] = err.message;
            return [{}];
          }),

          // 9. القوائم وقوائم الزبائن
          executePg(`
            SELECT COUNT(*)::int AS total_lists
            FROM customer_lists
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = customer_lists.id)
          `).catch(() => executePg(`
            SELECT COUNT(DISTINCT TRIM(list_id))::int AS total_lists
            FROM sales
            WHERE list_id IS NOT NULL AND TRIM(list_id) != ''
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = sales.id)
          `).catch(() => [{}])),

          // 10. المواقع الجغرافية المثبتة (GPS) للزبائن والمندوبين
          executePg(`
            SELECT 
              COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN 1 END)::int AS total_locations,
              COUNT(DISTINCT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN TRIM(customer_name) END)::int AS unique_customers_with_locations,
              (SELECT COUNT(*)::int FROM rep_locations WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0) AS rep_locations_count
            FROM sales
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = sales.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts'))
          `).catch(async () => {
            return executePg(`
              SELECT 
                COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN 1 END)::int AS total_locations,
                COUNT(DISTINCT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN TRIM(customer_name) END)::int AS unique_customers_with_locations,
                0::int AS rep_locations_count
              FROM contracts
              WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = contracts.id)
            `).catch((err) => {
              queryErrors["locations"] = err.message;
              return [{}];
            });
          }),
        ]);

        const salesStats = salesStatsRes[0] || {};
        const paymentStats = paymentStatsRes[0] || {};
        const fundsStats = fundsStatsRes[0] || {};
        const inventoryStats = inventoryStatsRes[0] || {};
        const employeesStats = employeesStatsRes[0] || {};
        const repsStats = repsStatsRes[0] || {};
        const customersStats = customersStatsRes[0] || {};
        const fundTxStats = fundTxStatsRes[0] || {};
        const customerListsStats = customerListsStatsRes[0] || {};
        const locationsStats = locationsStatsRes[0] || {};

        return res.json({
          success: true,
          database: "postgresql",
          timestamp: new Date().toISOString(),
          contracts: {
            total: salesStats.total_contracts || 0,
            active: salesStats.active_contracts || 0,
            completed: salesStats.completed_contracts || 0,
            totalSalesAmount: salesStats.total_sales_amount || 0,
            totalPaidAmount: salesStats.total_paid_amount || 0,
            totalRemainingBalance: salesStats.total_remaining_balance || 0,
            totalAdvancePayment: salesStats.total_advance_payment || 0,
          },
          payments: {
            totalCount: paymentStats.total_payments_count || 0,
            totalAmount: paymentStats.total_payments_amount || 0,
            todayAmount: paymentStats.today_payments_amount || 0,
            monthAmount: paymentStats.month_payments_amount || 0,
          },
          funds: {
            count: fundsStats.funds_count || 0,
            totalBalance: fundsStats.total_funds_balance || 0,
            transactionsCount: fundTxStats.total_fund_transactions || 0,
          },
          inventory: {
            totalItems: inventoryStats.total_inventory_items || 0,
            totalQuantity: inventoryStats.total_inventory_quantity || 0,
            totalValue: inventoryStats.total_inventory_value || 0,
          },
          employees: {
            total: employeesStats.total_employees || 0,
            active: employeesStats.active_employees || 0,
          },
          reps: {
            total: repsStats.total_reps || 0,
            active: repsStats.active_reps || 0,
          },
          customers: {
            total: customersStats.total_customers || 0,
            totalPaid: customersStats.total_paid || 0,
            totalRemaining: customersStats.total_remaining || 0,
          },
          lists: {
            count: customerListsStats.total_lists || 0,
          },
          locations: {
            total: locationsStats.total_locations || 0,
            customerLocations: locationsStats.unique_customers_with_locations || locationsStats.total_locations || 0,
            repLocations: locationsStats.rep_locations_count || 0,
          },
          diagnostics: {
            hasErrors: Object.keys(queryErrors).length > 0,
            queryErrors: Object.keys(queryErrors).length > 0 ? queryErrors : undefined
          }
        });
      }

      // Fallback for FileDB Engine
      const allContracts = fileDb.get("contracts") || [];
      const allPayments = fileDb.get("payments") || [];
      const allFunds = fileDb.get("funds") || [];
      const allInventory = fileDb.get("inventory") || [];
      const allEmployees = fileDb.get("employees") || [];
      const allReps = fileDb.get("reps") || [];

      const todayStr = new Date().toISOString().split('T')[0];
      const monthPrefix = todayStr.substring(0, 7);

      const totalSalesAmount = allContracts.reduce((sum: number, c: any) => sum + (Number(c.totalPrice) || 0), 0);
      const totalPaidAmount = allContracts.reduce((sum: number, c: any) => sum + (Number(c.totalPaid) || 0), 0);
      const totalRemainingBalance = allContracts.reduce((sum: number, c: any) => sum + (Number(c.remainingBalance) || 0), 0);
      const totalAdvancePayment = allContracts.reduce((sum: number, c: any) => sum + (Number(c.advancePayment) || 0), 0);

      const totalPaymentsAmount = allPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const todayPaymentsAmount = allPayments
        .filter((p: any) => (p.paymentDate || '').startsWith(todayStr))
        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
      const monthPaymentsAmount = allPayments
        .filter((p: any) => (p.paymentDate || '').startsWith(monthPrefix))
        .reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

      const totalFundsBalance = allFunds.reduce((sum: number, f: any) => sum + (Number(f.currentBalance) || 0), 0);
      const totalInventoryQuantity = allInventory.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0);
      const totalInventoryValue = allInventory.reduce((sum: number, i: any) => sum + ((Number(i.quantity) || 0) * (Number(i.purchasePrice) || 0)), 0);

      res.json({
        success: true,
        database: "filedb",
        timestamp: new Date().toISOString(),
        contracts: {
          total: allContracts.length,
          active: allContracts.filter((c: any) => c.status === 'active').length,
          completed: allContracts.filter((c: any) => c.status === 'completed').length,
          totalSalesAmount,
          totalPaidAmount,
          totalRemainingBalance,
          totalAdvancePayment,
        },
        payments: {
          totalCount: allPayments.length,
          totalAmount: totalPaymentsAmount,
          todayAmount: todayPaymentsAmount,
          monthAmount: monthPaymentsAmount,
        },
        funds: {
          count: allFunds.length,
          totalBalance: totalFundsBalance,
        },
        inventory: {
          totalItems: allInventory.length,
          totalQuantity: totalInventoryQuantity,
          totalValue: totalInventoryValue,
        },
        employees: {
          total: allEmployees.length,
          active: allEmployees.filter((e: any) => e.isActive !== false).length,
        },
        reps: {
          total: allReps.length,
          active: allReps.filter((r: any) => r.status === 'active').length,
        },
        locations: {
          total: allContracts.filter((c: any) => c && c.latitude != null && c.longitude != null && !isNaN(Number(c.latitude)) && Number(c.latitude) !== 0).length,
          customerLocations: allContracts.filter((c: any) => c && c.latitude != null && c.longitude != null && !isNaN(Number(c.latitude)) && Number(c.latitude) !== 0).length,
          repLocations: (fileDb.get("rep_locations") || []).length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Background Sync Batch & Beacon API ---
  async function processSingleSyncAction(action: any, skipBalanceRecalc: boolean = false): Promise<boolean> {
    if (!action || !action.type) return true;
    try {
      const { type, payload } = action;

      // Check if this record was previously deleted so we never resurrect it
      if (payload?.id && (type.startsWith('CREATE_') || type.startsWith('UPDATE_'))) {
        const deletedCheck = await executePg(
          `SELECT 1 FROM deleted_records WHERE record_id = $1 LIMIT 1`,
          [payload.id]
        ).catch(() => []);
        if (deletedCheck && deletedCheck.length > 0) {
          console.log(`[Sync] Record ${payload.id} is marked as deleted. Skipping ${type}.`);
          return true;
        }
      }

      switch (type) {
        case 'CREATE_CONTRACT': {
          if (!payload?.id) return true;
          const pId = String(payload.id);
          const cName = (payload.customerName ?? payload.customer_name ?? '').trim();
          if (!cName || pId.startsWith('fund_') || pId.startsWith('pay_') || pId.startsWith('emp_') || pId.startsWith('item_') || pId.startsWith('ft_') || pId.startsWith('emptx_') || pId.startsWith('conflict_')) {
            console.warn(`[Sync] Skipped invalid contract in CREATE_CONTRACT: ${pId} / ${cName}`);
            return true;
          }
          const cPhone = payload.customerPhone ?? payload.customer_phone ?? '';
          const cAddress = payload.customerAddress ?? payload.customer_address ?? '';
          const iId = payload.itemId ?? payload.item_id ?? null;
          const iName = payload.itemName ?? payload.item_name ?? 'مادة';
          const iQty = Number(payload.itemQuantity ?? payload.item_quantity ?? 1) || 1;
          const pPrice = Number(payload.purchasePrice ?? payload.purchase_price ?? 0) || 0;
          const lId = payload.listId ?? payload.list_id ?? null;
          const lName = payload.listName ?? payload.list_name ?? null;
          const tPrice = Number(payload.totalPrice ?? payload.total_price ?? 0) || 0;
          const advPay = Number(payload.advancePayment ?? payload.advance_payment ?? 0) || 0;
          const remBal = Number(payload.remainingBalance ?? payload.remaining_balance ?? (tPrice - advPay)) || 0;
          const dInst = Number(payload.dailyInstallment ?? payload.daily_installment ?? 0) || 0;
          const sDate = payload.startDate ?? payload.start_date ?? new Date().toISOString().split('T')[0];
          const notes = payload.notes ?? '';
          const status = payload.status ?? 'active';
          const lastPayDate = payload.lastPaymentDate ?? payload.last_payment_date ?? null;
          const tPaid = Number(payload.totalPaid ?? payload.total_paid ?? 0) || 0;
          const rName = payload.repName ?? payload.rep_name ?? '';
          const cAt = payload.createdAt ?? payload.created_at ?? new Date().toISOString();
          const compAt = payload.completedAt ?? payload.completed_at ?? null;
          const upAt = payload.updatedAt ?? payload.updated_at ?? new Date().toISOString();
          const isEd = Boolean(payload.isEdited ?? payload.is_edited);

          const lat = payload.latitude != null ? Number(payload.latitude) : (payload.lat != null ? Number(payload.lat) : null);
          const lng = payload.longitude != null ? Number(payload.longitude) : (payload.lng != null ? Number(payload.lng) : null);
          const locAddr = payload.locationAddress ?? payload.location_address ?? null;
          const locUpAt = payload.locationUpdatedAt ?? payload.location_updated_at ?? null;

          const contractObj = {
            ...payload,
            id: payload.id,
            customerName: cName,
            customerPhone: cPhone,
            customerAddress: cAddress,
            latitude: lat,
            longitude: lng,
            locationAddress: locAddr,
            locationUpdatedAt: locUpAt,
            itemId: iId,
            itemName: iName,
            itemQuantity: iQty,
            purchasePrice: pPrice,
            listId: lId,
            listName: lName,
            totalPrice: tPrice,
            advancePayment: advPay,
            remainingBalance: remBal,
            dailyInstallment: dInst,
            startDate: sDate,
            notes,
            status,
            lastPaymentDate: lastPayDate,
            totalPaid: tPaid,
            repName: rName,
            createdAt: cAt,
            completedAt: compAt,
            updatedAt: upAt,
            isEdited: isEd,
          };

          fileDb.upsert("contracts", contractObj);

          const vals = [
            payload.id, cName, cPhone, cAddress,
            iId, iName, iQty, pPrice,
            lId, lName, tPrice, advPay,
            remBal, dInst, sDate, notes,
            status, lastPayDate, tPaid, rName,
            cAt, compAt, upAt, isEd,
            lat, lng, locAddr, locUpAt
          ];
          await executePg(
            `INSERT INTO sales (id, customer_name, customer_phone, customer_address, item_id, item_name, item_quantity, purchase_price, list_id, list_name, total_price, advance_payment, remaining_balance, daily_installment, start_date, notes, status, last_payment_date, total_paid, rep_name, created_at, completed_at, updated_at, is_edited, latitude, longitude, location_address, location_updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
             ON CONFLICT (id) DO UPDATE SET
               customer_name=EXCLUDED.customer_name, customer_phone=EXCLUDED.customer_phone, customer_address=EXCLUDED.customer_address,
               item_id=EXCLUDED.item_id, item_name=EXCLUDED.item_name, item_quantity=EXCLUDED.item_quantity, purchase_price=EXCLUDED.purchase_price,
               list_id=EXCLUDED.list_id, list_name=EXCLUDED.list_name, total_price=EXCLUDED.total_price,
               advance_payment=EXCLUDED.advance_payment, remaining_balance=EXCLUDED.remaining_balance, daily_installment=EXCLUDED.daily_installment,
               start_date=EXCLUDED.start_date, notes=EXCLUDED.notes, status=EXCLUDED.status, last_payment_date=EXCLUDED.last_payment_date,
               total_paid=EXCLUDED.total_paid, rep_name=EXCLUDED.rep_name, completed_at=EXCLUDED.completed_at,
               updated_at=EXCLUDED.updated_at, is_edited=EXCLUDED.is_edited,
               latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, location_address=EXCLUDED.location_address, location_updated_at=EXCLUDED.location_updated_at`,
            vals
          );
          return true;
        }

        case 'UPDATE_CONTRACT': {
          if (!payload?.id) return true;
          const pId = String(payload.id);
          if (pId.startsWith('fund_') || pId.startsWith('pay_') || pId.startsWith('emp_') || pId.startsWith('item_') || pId.startsWith('ft_') || pId.startsWith('emptx_') || pId.startsWith('conflict_')) {
            console.warn(`[Sync] Skipped invalid contract ID in UPDATE_CONTRACT: ${payload.id}`);
            return true;
          }
          fileDb.update("contracts", payload.id, payload);
          const fields: string[] = [];
          const vals: any[] = [];
          let idx = 1;
          const colMap: any = {
            customerName: "customer_name",
            customerPhone: "customer_phone",
            customerAddress: "customer_address",
            itemId: "item_id",
            itemName: "item_name",
            itemQuantity: "item_quantity",
            purchasePrice: "purchase_price",
            listId: "list_id",
            listName: "list_name",
            totalPrice: "total_price",
            advancePayment: "advance_payment",
            remainingBalance: "remaining_balance",
            dailyInstallment: "daily_installment",
            startDate: "start_date",
            notes: "notes",
            status: "status",
            lastPaymentDate: "last_payment_date",
            totalPaid: "total_paid",
            repName: "rep_name",
            completedAt: "completed_at",
            updatedAt: "updated_at",
            isEdited: "is_edited",
            customer_name: "customer_name",
            customer_phone: "customer_phone",
            customer_address: "customer_address",
            item_id: "item_id",
            item_name: "item_name",
            item_quantity: "item_quantity",
            purchase_price: "purchase_price",
            list_id: "list_id",
            list_name: "list_name",
            total_price: "total_price",
            advance_payment: "advance_payment",
            remaining_balance: "remaining_balance",
            daily_installment: "daily_installment",
            start_date: "start_date",
            last_payment_date: "last_payment_date",
            total_paid: "total_paid",
            rep_name: "rep_name",
            completed_at: "completed_at",
            updated_at: "updated_at",
            is_edited: "is_edited",
            latitude: "latitude",
            longitude: "longitude",
            locationAddress: "location_address",
            location_address: "location_address",
            locationUpdatedAt: "location_updated_at",
            location_updated_at: "location_updated_at"
          };
          const addedCols = new Set<string>();
          for (const [k, v] of Object.entries(payload)) {
            if (k === "id") continue;
            const mappedCol = colMap[k];
            if (mappedCol && !addedCols.has(mappedCol)) {
              addedCols.add(mappedCol);
              fields.push(`${mappedCol} = $${idx++}`);
              vals.push(v);
            }
          }
          if (fields.length > 0) {
            vals.push(payload.id);
            await executePg(`UPDATE sales SET ${fields.join(", ")} WHERE id = $${idx}`, vals).catch(() => {});
            if (payload.latitude !== undefined || payload.longitude !== undefined) {
              const newLat = (payload.latitude != null && payload.latitude !== 0 && !isNaN(Number(payload.latitude))) ? Number(payload.latitude) : null;
              const newLng = (payload.longitude != null && payload.longitude !== 0 && !isNaN(Number(payload.longitude))) ? Number(payload.longitude) : null;
              await executePg(`
                UPDATE customers
                SET latitude = $1, longitude = $2
                WHERE id IN (SELECT customer_id FROM sales WHERE id = $3)
                   OR name IN (SELECT customer_name FROM sales WHERE id = $3)
              `, [newLat, newLng, payload.id]).catch(() => {});

              if (newLat == null || newLng == null) {
                await executePg(`
                  UPDATE payments
                  SET latitude = NULL, longitude = NULL
                  WHERE contract_id = $1 OR customer_name IN (SELECT customer_name FROM sales WHERE id = $1)
                `, [payload.id]).catch(() => {});
              }
            }
          }
          bumpSyncVersion();
          return true;
        }

        case 'DELETE_CONTRACT': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales'), ($1, 'contracts') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});

          const contractDetails = await executePg(
            `SELECT customer_id, customer_name FROM sales WHERE id = $1 UNION SELECT customer_id, customer_name FROM contracts WHERE id = $1`,
            [id]
          ).catch(() => []);

          const relPayments = await executePg(`SELECT id, fund_id, amount, amount_paid, customer_name, rep_name, payment_date FROM payments WHERE contract_id = $1`, [id]).catch(() => []);
          if (Array.isArray(relPayments) && relPayments.length > 0) {
            for (const rp of relPayments) {
              if (rp?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {});
                const amt = Number(rp.amount_paid ?? rp.amount) || 0;
                const targetFundId = await resolveFundIdForPayment(rp.fund_id, id, rp.customer_name);
                if (targetFundId && amt > 0) {
                  await recordPaymentFundAdjustment(rp.id, targetFundId, amt, rp.customer_name || '', rp.rep_name || '', rp.payment_date || '', true).catch(() => {});
                }
              }
            }
          }
          fileDb.delete("contracts", id);
          const allPay = fileDb.get("payments") || [];
          fileDb.setAll("payments", allPay.filter((p: any) => p.contractId !== id));
          await executePg(`DELETE FROM sales WHERE id = $1`, [id]).catch(() => {});
          await executePg(`DELETE FROM contracts WHERE id = $1`, [id]).catch(() => {});
          await executePg(`DELETE FROM payments WHERE contract_id = $1`, [id]).catch(() => {});

          if (Array.isArray(contractDetails) && contractDetails.length > 0) {
            for (const cd of contractDetails) {
              const custId = cd.customer_id;
              const custName = cd.customer_name;
              const hasOtherContracts = await executePg(
                `SELECT 1 FROM sales WHERE id != $1 AND (customer_id = $2 OR customer_name = $3)
                 UNION
                 SELECT 1 FROM contracts WHERE id != $1 AND (customer_id = $2 OR customer_name = $3) LIMIT 1`,
                [id, custId || '', custName || '']
              ).catch(() => []);

              if (!hasOtherContracts || hasOtherContracts.length === 0) {
                if (custId) {
                  await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customers') ON CONFLICT (record_id) DO NOTHING`, [custId]).catch(() => {});
                  await executePg(`DELETE FROM customers WHERE id = $1`, [custId]).catch(() => {});
                  fileDb.delete("customers", custId);
                }
                if (custName) {
                  await executePg(`DELETE FROM customers WHERE name = $1`, [custName]).catch(() => {});
                }
              }
            }
          }

          await syncCustomersTableInPg().catch(() => {});
          await recalculateAllFundBalancesInPg().catch(() => {});
          bumpSyncVersion();
          return true;
        }

        case 'DELETE_CUSTOMER': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customers') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          const custRows = await executePg(`SELECT id, name FROM customers WHERE id = $1`, [id]).catch(() => []);
          const custName = custRows?.[0]?.name;
          await executePg(`DELETE FROM customers WHERE id = $1`, [id]).catch(() => {});
          if (custName) {
            await executePg(`DELETE FROM customers WHERE name = $1`, [custName]).catch(() => {});
          }
          fileDb.delete("customers", id);

          const relSales = await executePg(
            `SELECT id FROM sales WHERE customer_id = $1 OR customer_name = $2
             UNION
             SELECT id FROM contracts WHERE customer_id = $1 OR customer_name = $2`,
            [id, custName || '']
          ).catch(() => []);

          if (Array.isArray(relSales) && relSales.length > 0) {
            for (const s of relSales) {
              if (s?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'sales'), ($1, 'contracts') ON CONFLICT (record_id) DO NOTHING`, [s.id]).catch(() => {});
                await executePg(`DELETE FROM sales WHERE id = $1`, [s.id]).catch(() => {});
                await executePg(`DELETE FROM contracts WHERE id = $1`, [s.id]).catch(() => {});
                const relPayments = await executePg(`SELECT id, fund_id, amount, amount_paid, customer_name, rep_name, payment_date FROM payments WHERE contract_id = $1`, [s.id]).catch(() => []);
                for (const rp of relPayments) {
                  if (rp?.id) {
                    await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [rp.id]).catch(() => {});
                    const amt = Number(rp.amount_paid ?? rp.amount) || 0;
                    const targetFundId = await resolveFundIdForPayment(rp.fund_id, s.id, rp.customer_name);
                    if (targetFundId && amt > 0) {
                      await recordPaymentFundAdjustment(rp.id, targetFundId, amt, rp.customer_name || '', rp.rep_name || '', rp.payment_date || '', true).catch(() => {});
                    }
                  }
                }
                await executePg(`DELETE FROM payments WHERE contract_id = $1`, [s.id]).catch(() => {});
                fileDb.delete("contracts", s.id);
              }
            }
          }
          await recalculateAllFundBalancesInPg().catch(() => {});
          bumpSyncVersion();
          return true;
        }

        case 'CREATE_PAYMENT': {
          if (!payload?.id) return true;
          const pId = String(payload.id);
          const amt = Number(payload.amount ?? payload.amountPaid ?? payload.amount_paid) || 0;
          if (amt <= 0 || pId.startsWith('contract_') || pId.startsWith('emp_') || pId.startsWith('item_') || pId.startsWith('fund_')) {
            console.warn(`[Sync] Skipped invalid payment in CREATE_PAYMENT: ${pId} with amt: ${amt}`);
            return true;
          }
          const cId = payload.contractId ?? payload.contract_id ?? '';
          const cName = payload.customerName ?? payload.customer_name ?? '';
          const pDate = payload.paymentDate ?? payload.payment_date ?? new Date().toISOString().split('T')[0];
          const pNote = payload.note ?? payload.notes ?? '';
          const rName = payload.repName ?? payload.rep_name ?? '';
          const cAt = payload.createdAt ?? payload.created_at ?? new Date().toISOString();
          const isEd = Boolean(payload.isEdited ?? payload.is_edited);

          const resolvedFundId = await resolveFundIdForPayment(payload.fundId ?? payload.fund_id, cId);

          const pLat = payload.latitude != null ? Number(payload.latitude) : null;
          const pLng = payload.longitude != null ? Number(payload.longitude) : null;

          const saved = fileDb.upsert("payments", {
            ...payload,
            id: payload.id,
            contractId: cId,
            customerName: cName,
            amount: amt,
            amountPaid: amt,
            paymentDate: pDate,
            note: pNote,
            repName: rName,
            fundId: resolvedFundId,
            latitude: pLat != null ? pLat : undefined,
            longitude: pLng != null ? pLng : undefined,
            createdAt: cAt,
            isEdited: isEd,
          });

          await executePg(
            `INSERT INTO payments (id, contract_id, customer_name, amount, amount_paid, payment_date, note, rep_name, fund_id, created_at, is_edited, latitude, longitude)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO UPDATE SET
               contract_id = EXCLUDED.contract_id,
               customer_name = EXCLUDED.customer_name,
               amount = EXCLUDED.amount,
               amount_paid = EXCLUDED.amount_paid,
               payment_date = EXCLUDED.payment_date,
               note = EXCLUDED.note,
               rep_name = EXCLUDED.rep_name,
               fund_id = EXCLUDED.fund_id,
               is_edited = EXCLUDED.is_edited,
               latitude = COALESCE(EXCLUDED.latitude, payments.latitude),
               longitude = COALESCE(EXCLUDED.longitude, payments.longitude)`,
            [saved.id, cId, cName, amt, amt, pDate, pNote, rName, resolvedFundId, cAt, isEd, pLat, pLng]
          );

          if (cId && pLat != null && pLng != null && !isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
            const nowIso = new Date().toISOString();
            const shouldForceUpdate = Boolean(payload.updateCustomerLocation || payload.shouldUpdateCustomerLocation);

            // Only update sales & customers if customer has NO location yet (first payment / deleted location) OR explicitly forced:
            await executePg(`
              UPDATE sales 
              SET latitude = $1, longitude = $2, location_updated_at = $3
              WHERE id = $4 AND ($5::boolean = true OR latitude IS NULL OR latitude = 0)
            `, [pLat, pLng, nowIso, cId, shouldForceUpdate]).catch(() => {});

            await executePg(`
              UPDATE customers 
              SET latitude = $1, longitude = $2
              WHERE (id IN (SELECT customer_id FROM sales WHERE id = $3) OR name IN (SELECT customer_name FROM sales WHERE id = $3))
                AND ($4::boolean = true OR latitude IS NULL OR latitude = 0)
            `, [pLat, pLng, cId, shouldForceUpdate]).catch(() => {});

            const allC = fileDb.get<any>("contracts") || [];
            const cIdx = allC.findIndex((x: any) => x.id === cId);
            if (cIdx !== -1) {
              const existingC = allC[cIdx];
              const hasOldLoc = existingC.latitude != null && Number(existingC.latitude) !== 0;
              if (shouldForceUpdate || !hasOldLoc) {
                allC[cIdx] = { ...existingC, latitude: pLat, longitude: pLng, locationUpdatedAt: nowIso };
                fileDb.setAll("contracts", allC);
              }
            }
          }

          if (resolvedFundId && amt > 0) {
            await recordPaymentFundAdjustment(saved.id, resolvedFundId, amt, cName, rName, pDate, false);
          }

          // Update contract remaining balance and total paid in PostgreSQL when payment is added
          if (cId && !skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb([cId]);
          }

          return true;
        }

        case 'UPDATE_PAYMENT': {
          if (!payload?.id) return true;
          let existingPayment = (fileDb.get<any>("payments") || []).find((p: any) => p.id === payload.id);
          if (!existingPayment && isPgConfigured()) {
            const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [payload.id]).catch(() => []);
            if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
          }

          const oldAmt = Number(existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
          const amt = Number(payload.amount ?? payload.amountPaid ?? payload.amount_paid ?? oldAmt) || 0;
          const diff = amt - oldAmt;
          const cId = payload.contractId ?? payload.contract_id ?? existingPayment?.contractId;
          const resolvedFundId = await resolveFundIdForPayment(payload.fundId ?? payload.fund_id ?? existingPayment?.fundId, cId);

          if (resolvedFundId) {
            const cName = payload.customerName || payload.customer_name || existingPayment?.customerName || '';
            const rName = payload.repName || payload.rep_name || existingPayment?.repName || '';
            const pDate = payload.paymentDate || payload.payment_date || existingPayment?.paymentDate || '';
            await recordPaymentFundAdjustment(payload.id, resolvedFundId, amt, cName, rName, pDate, false);
          }

          fileDb.update("payments", payload.id, { ...payload, amount: amt, amountPaid: amt, fundId: resolvedFundId || payload.fundId });
          await executePg(
            `UPDATE payments SET amount = COALESCE($1, amount), amount_paid = COALESCE($1, amount_paid), note = COALESCE($2, note), payment_date = COALESCE($3, payment_date), rep_name = COALESCE($4, rep_name), fund_id = COALESCE($5, fund_id) WHERE id = $6`,
            [amt, payload.note ?? payload.notes, payload.paymentDate ?? payload.payment_date, payload.repName ?? payload.rep_name, resolvedFundId, payload.id]
          );
          if (cId && !skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb([cId]);
          }
          return true;
        }

        case 'DELETE_PAYMENT': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;

          let existingPayment = (fileDb.get<any>("payments") || []).find((p: any) => p.id === id);
          if (!existingPayment && isPgConfigured()) {
            const rows = await executePg("SELECT * FROM payments WHERE id = $1 LIMIT 1", [id]).catch(() => []);
            if (rows && rows.length > 0) existingPayment = mapPaymentRow(rows[0]);
          }

          const contractId = payload?.contractId || payload?.contract_id || existingPayment?.contractId || existingPayment?.contract_id;
          const amt = Number(payload?.amountPaid ?? payload?.amount ?? existingPayment?.amountPaid ?? existingPayment?.amount) || 0;
          const fundId = payload?.fundId || payload?.fund_id || existingPayment?.fundId;
          const resolvedFundId = await resolveFundIdForPayment(fundId, contractId, payload?.customerName || existingPayment?.customerName);

          if (resolvedFundId && amt > 0) {
            await recordPaymentFundAdjustment(
              id,
              resolvedFundId,
              amt,
              existingPayment?.customerName || payload?.customerName || '',
              existingPayment?.repName || payload?.repName || '',
              existingPayment?.paymentDate || payload?.paymentDate || '',
              true
            );
          }

          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'payments') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("payments", id);
          await executePg(`DELETE FROM payments WHERE id = $1`, [id]).catch(() => {});

          if (contractId) {
            await syncContractBalancesInPgAndFileDb([contractId]);
          } else if (!skipBalanceRecalc) {
            await syncContractBalancesInPgAndFileDb();
          }
          return true;
        }

        case 'CREATE_INVENTORY':
        case 'UPDATE_INVENTORY': {
          if (!payload?.id) return true;
          const items = fileDb.get<any>("inventory_items");
          const existing = items.find((i: any) => i.id === payload.id) || {};
          const merged = { ...existing, ...payload };
          const saved = fileDb.upsert("inventory_items", merged);
          const itemName = saved.name && saved.name.trim() ? saved.name : (merged.name && merged.name.trim() ? merged.name : 'مادة');
          await executePg(
            `INSERT INTO inventory_items (id, name, price, purchase_price, quantity, daily_installment, category, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, price = EXCLUDED.price, purchase_price = EXCLUDED.purchase_price,
               quantity = EXCLUDED.quantity, daily_installment = EXCLUDED.daily_installment, category = EXCLUDED.category`,
            [saved.id, itemName, saved.price ?? 0, saved.purchasePrice ?? 0, saved.quantity ?? 0, saved.dailyInstallment ?? 0, saved.category || '', saved.createdAt || new Date().toISOString()]
          );
          return true;
        }

        case 'DELETE_INVENTORY': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'inventory') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("inventory_items", id);
          await executePg(`DELETE FROM inventory_items WHERE id = $1`, [id]).catch(() => {});
          await executePg(`DELETE FROM inventory WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_REP':
        case 'UPDATE_REP': {
          if (!payload?.id) return true;
          const id = payload.id;
          let existing = (fileDb.get<any>("reps") || []).find((r: any) => r.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM reps WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = mapRepRow(rows[0]);
              }
            } catch (e) {}
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const repName = merged.name || payload.name || existing?.name || payload.repName || id || 'مندوب';
          const saved = fileDb.upsert("reps", { ...merged, name: repName });

          if (isPgConfigured()) {
            await executePg(
              `INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids, avatar_url)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (id) DO UPDATE SET
                 name = COALESCE(NULLIF(EXCLUDED.name, ''), reps.name),
                 phone = COALESCE(NULLIF(EXCLUDED.phone, ''), reps.phone),
                 code = COALESCE(NULLIF(EXCLUDED.code, ''), reps.code),
                 role = COALESCE(NULLIF(EXCLUDED.role, ''), reps.role),
                 can_edit = COALESCE(EXCLUDED.can_edit, reps.can_edit),
                 can_delete = COALESCE(EXCLUDED.can_delete, reps.can_delete),
                 can_move_customer = COALESCE(EXCLUDED.can_move_customer, reps.can_move_customer),
                 can_sell = COALESCE(EXCLUDED.can_sell, reps.can_sell),
                 allowed_list_ids = COALESCE(EXCLUDED.allowed_list_ids, reps.allowed_list_ids),
                 avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), reps.avatar_url)`,
              [
                saved.id,
                repName,
                saved.phone || '',
                saved.code || '0000',
                saved.role || 'rep',
                saved.canEdit !== false,
                saved.canDelete !== false,
                saved.canMoveCustomer !== false,
                saved.canSell !== false,
                Array.isArray(saved.allowedListIds) ? JSON.stringify(saved.allowedListIds) : (saved.allowedListIds || '["all"]'),
                saved.avatarUrl || ''
              ]
            ).catch((err) => console.warn("Error upserting rep in PG sync:", err));
          }
          return true;
        }

        case 'DELETE_REP': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'reps') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("reps", id);
          await executePg(`DELETE FROM reps WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_FUND':
        case 'UPDATE_FUND': {
          if (!payload?.id) return true;
          const id = String(payload.id);
          const name = (payload.name || '').trim();
          if (!name || id.startsWith('pay_') || id.startsWith('contract_') || id.startsWith('emp_') || id.startsWith('item_') || id.startsWith('ft_') || id.startsWith('emptx_') || id.startsWith('conflict_')) {
            console.warn(`[Sync] Skipped invalid fund record: ${id} with name: ${name}`);
            return true;
          }
          const balance = Number(payload.balance ?? payload.remainingCapital ?? 0);
          const description = payload.description || payload.notes || '';
          const createdAt = payload.createdAt || new Date().toISOString();
          const orderIndex = payload.orderIndex !== undefined || payload.order_index !== undefined
            ? Number(payload.orderIndex ?? payload.order_index)
            : undefined;
          
          fileDb.upsert("cash_funds", {
            id,
            name,
            balance,
            description,
            ...(orderIndex !== undefined ? { orderIndex } : {}),
            createdAt
          });

          await executePg(
            `INSERT INTO cash_funds (id, name, balance, description, order_index, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, 
               balance = EXCLUDED.balance, 
               description = EXCLUDED.description,
               order_index = COALESCE(EXCLUDED.order_index, cash_funds.order_index)`,
            [id, name, balance, description, orderIndex !== undefined ? orderIndex : null, createdAt]
          ).catch(() => {});

          return true;
        }

        case 'REORDER_FUNDS': {
          const orderedIds = payload?.orderedIds;
          if (Array.isArray(orderedIds)) {
            for (let i = 0; i < orderedIds.length; i++) {
              fileDb.update("cash_funds", orderedIds[i], { orderIndex: i } as any);
              await executePg("UPDATE cash_funds SET order_index = $1 WHERE id = $2", [i, orderedIds[i]]).catch(() => {});
            }
          }
          return true;
        }

        case 'DELETE_FUND': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'cash_funds') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("cash_funds", id);
          await executePg(`DELETE FROM cash_funds WHERE id = $1`, [id]).catch(() => {});
          const relTx = await executePg(`SELECT id FROM fund_transactions WHERE fund_id = $1 OR target_fund_id = $1`, [id]).catch(() => []);
          if (Array.isArray(relTx) && relTx.length > 0) {
            for (const tx of relTx) {
              if (tx?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [tx.id]).catch(() => {});
                fileDb.delete("fund_transactions", tx.id);
              }
            }
          }
          await executePg(`DELETE FROM fund_transactions WHERE fund_id = $1 OR target_fund_id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_CUSTOMER_LIST':
        case 'UPDATE_CUSTOMER_LIST': {
          if (!payload?.id) return true;
          const id = String(payload.id);
          if (id.startsWith('pay_') || id.startsWith('contract_') || id.startsWith('emp_') || id.startsWith('item_') || id.startsWith('fundtx_')) {
            console.warn(`[Sync] Skipped invalid customer list ID: ${id}`);
            return true;
          }
          let existing = (fileDb.get<any>("customer_lists") || []).find((l: any) => l.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM customer_lists WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = rows[0];
              }
            } catch (e) {}
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const listName = (merged.name || payload.name || existing?.name || payload.listName || payload.list_name || payload.title || '').trim();
          if (!listName || listName === 'قائمة بدون اسم') {
            console.warn(`[Sync] Skipped unnamed customer list: ${id}`);
            return true;
          }
          const fundId = merged.fundId || payload.fundId || merged.fund_id || payload.fund_id || null;
          const description = merged.description || payload.description || '';
          const color = merged.color || payload.color || '#3b82f6';
          const createdAt = merged.createdAt || payload.createdAt || new Date().toISOString();
          const orderIndex = merged.orderIndex !== undefined || merged.order_index !== undefined
            ? Number(merged.orderIndex ?? merged.order_index)
            : undefined;

          const receiptTemplate = payload.receiptTemplate || payload.receipt_template || merged.receiptTemplate || merged.receipt_template || 'template_1';

          const saved = fileDb.upsert("customer_lists", {
            ...merged,
            id,
            name: listName,
            fundId,
            description,
            color,
            receiptTemplate,
            receipt_template: receiptTemplate,
            ...(orderIndex !== undefined ? { orderIndex } : {}),
            createdAt
          });

          await executePg(
            `INSERT INTO customer_lists (id, name, description, color, fund_id, order_index, receipt_template, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               name = COALESCE(NULLIF(EXCLUDED.name, ''), customer_lists.name),
               description = COALESCE(EXCLUDED.description, customer_lists.description),
               color = COALESCE(EXCLUDED.color, customer_lists.color),
               fund_id = COALESCE(EXCLUDED.fund_id, customer_lists.fund_id),
               order_index = COALESCE(EXCLUDED.order_index, customer_lists.order_index),
               receipt_template = COALESCE(EXCLUDED.receipt_template, customer_lists.receipt_template)`,
            [id, listName, description, color, fundId, orderIndex !== undefined ? orderIndex : null, receiptTemplate, createdAt]
          ).catch((err) => console.warn("Error upserting customer list in PG sync:", err));
          return true;
        }

        case 'REORDER_CUSTOMER_LISTS': {
          const orderedIds = payload?.orderedIds;
          if (Array.isArray(orderedIds)) {
            for (let i = 0; i < orderedIds.length; i++) {
              fileDb.update("customer_lists", orderedIds[i], { orderIndex: i } as any);
              await executePg("UPDATE customer_lists SET order_index = $1 WHERE id = $2", [i, orderedIds[i]]).catch(() => {});
            }
          }
          return true;
        }

        case 'DELETE_CUSTOMER_LIST': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'customer_lists') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("customer_lists", id);
          await executePg(`DELETE FROM customer_lists WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_EMPLOYEE':
        case 'UPDATE_EMPLOYEE': {
          if (!payload?.id) return true;
          const id = payload.id;
          let existing = (fileDb.get<any>("employees") || []).find((e: any) => e.id === id);
          if (!existing && isPgConfigured()) {
            try {
              const rows = await executePg("SELECT * FROM employees WHERE id = $1 LIMIT 1", [id]);
              if (rows && rows.length > 0) {
                existing = rows[0];
              }
            } catch (e) {}
          }
          const merged = existing ? { ...existing, ...payload } : payload;
          const empName = (merged.name || payload.name || existing?.name || payload.employeeName || payload.empName || payload.repName || '').trim() || 'موظف بدون اسم';
          const phone = merged.phone || payload.phone || '';
          const jobTitle = merged.jobTitle || payload.jobTitle || merged.job_title || payload.job_title || merged.position || payload.position || '';
          const position = merged.position || payload.position || jobTitle;
          const salary = Number(merged.salary ?? payload.salary ?? 0) || 0;
          const debtBalance = Number(merged.debtBalance ?? payload.debtBalance ?? merged.debt_balance ?? payload.debt_balance ?? 0) || 0;
          const totalDebt = Number(merged.totalDebt ?? payload.totalDebt ?? merged.total_debt ?? payload.total_debt ?? 0) || 0;
          const isRep = Boolean(merged.isRep ?? payload.isRep ?? merged.is_rep ?? payload.is_rep);
          const repId = merged.repId || payload.repId || merged.rep_id || payload.rep_id || null;
          const createdAt = merged.createdAt || payload.createdAt || new Date().toISOString();

          const saved = fileDb.upsert("employees", {
            ...merged,
            id,
            name: empName,
            phone,
            jobTitle,
            position,
            salary,
            debtBalance,
            totalDebt,
            isRep,
            repId,
            createdAt
          });

          await executePg(
            `INSERT INTO employees (id, name, phone, job_title, position, salary, debt_balance, total_debt, is_rep, rep_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (id) DO UPDATE SET
               name = COALESCE(NULLIF(EXCLUDED.name, ''), employees.name),
               phone = COALESCE(EXCLUDED.phone, employees.phone),
               job_title = COALESCE(EXCLUDED.job_title, employees.job_title),
               position = COALESCE(EXCLUDED.position, employees.position),
               salary = COALESCE(EXCLUDED.salary, employees.salary),
               debt_balance = COALESCE(EXCLUDED.debt_balance, employees.debt_balance),
               total_debt = COALESCE(EXCLUDED.total_debt, employees.total_debt),
               is_rep = COALESCE(EXCLUDED.is_rep, employees.is_rep),
               rep_id = COALESCE(EXCLUDED.rep_id, employees.rep_id)`,
            [id, empName, phone, jobTitle, position, salary, debtBalance, totalDebt, isRep, repId, createdAt]
          ).catch((err) => console.warn("Error upserting employee in PG sync:", err));
          return true;
        }

        case 'DELETE_EMPLOYEE': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employees') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("employees", id);
          await executePg(`DELETE FROM employees WHERE id = $1`, [id]).catch(() => {});
          const relTx = await executePg(`SELECT id FROM employee_transactions WHERE employee_id = $1`, [id]).catch(() => []);
          if (Array.isArray(relTx) && relTx.length > 0) {
            for (const tx of relTx) {
              if (tx?.id) {
                await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employee_transactions') ON CONFLICT (record_id) DO NOTHING`, [tx.id]).catch(() => {});
                fileDb.delete("employee_transactions", tx.id);
              }
            }
          }
          await executePg(`DELETE FROM employee_transactions WHERE employee_id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_FUND_TX':
        case 'CREATE_FUND_TRANSACTION': {
          if (!payload?.id) return true;
          const id = payload.id;
          const fundId = payload.fundId || payload.fund_id || '';
          const targetFundId = payload.targetFundId || payload.target_fund_id || null;
          const type = payload.type || 'deposit';
          const amount = Number(payload.amount) || 0;
          const note = payload.note || payload.description || '';
          const repName = payload.repName || payload.rep_name || '';
          const createdAt = payload.createdAt || payload.created_at || new Date().toISOString();

          let alreadyExists = false;
          if (isPgConfigured()) {
            const insertRes = await executePg(
              `INSERT INTO fund_transactions (id, fund_id, target_fund_id, type, amount, note, rep_name, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (id) DO NOTHING
               RETURNING id`,
              [id, fundId, targetFundId, type, amount, note, repName, createdAt]
            ).catch(() => []);
            if (!insertRes || insertRes.length === 0) {
              alreadyExists = true;
            }
          } else {
            if ((fileDb.get<any>("fund_transactions") || []).some((tx: any) => tx.id === id)) {
              alreadyExists = true;
            }
          }

          fileDb.upsert("fund_transactions", { id, fundId, targetFundId, type, amount, note, repName, createdAt });

          // Update fund balance in PostgreSQL & fileDb (only when not reconciling bulk data and not already exists)
          if (!skipBalanceRecalc && !alreadyExists) {
            if (type === 'transfer') {
              if (fundId) await adjustFundBalance(fundId, -amount);
              if (targetFundId) await adjustFundBalance(targetFundId, +amount);
            } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
              if (fundId) await adjustFundBalance(fundId, -amount);
            } else if (type === 'deposit' || type === 'employee_repay') {
              if (fundId) await adjustFundBalance(fundId, +amount);
            }
          }

          return true;
        }

        case 'UPDATE_FUND_TRANSACTION': {
          if (!payload?.id) return true;
          const id = payload.id;
          const existing = (fileDb.get<any>("fund_transactions") || []).find((x: any) => x.id === id);
          const oldAmount = existing ? Number(existing.amount) || 0 : 0;
          const newAmount = payload.amount !== undefined ? Number(payload.amount) || 0 : oldAmount;
          const diff = newAmount - oldAmount;
          const type = payload.type || existing?.type || 'deposit';
          const fundId = payload.fundId || existing?.fundId || payload.fund_id;
          const targetFundId = payload.targetFundId || existing?.targetFundId || payload.target_fund_id;
          const note = payload.note !== undefined ? payload.note : (existing?.note || '');

          fileDb.update("fund_transactions", id, { ...existing, ...payload, amount: newAmount, note });

          await executePg(
            `UPDATE fund_transactions SET amount = COALESCE($1, amount), note = COALESCE($2, note) WHERE id = $3`,
            [newAmount, note, id]
          ).catch(() => {});

          if (diff !== 0 && !skipBalanceRecalc) {
            if (type === 'transfer') {
              if (fundId) await adjustFundBalance(fundId, -diff);
              if (targetFundId) await adjustFundBalance(targetFundId, +diff);
            } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
              if (fundId) await adjustFundBalance(fundId, -diff);
            } else if (type === 'deposit' || type === 'employee_repay') {
              if (fundId) await adjustFundBalance(fundId, +diff);
            }
          }

          return true;
        }

        case 'DELETE_FUND_TX':
        case 'DELETE_FUND_TRANSACTION': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;

          const existing = (fileDb.get<any>("fund_transactions") || []).find((x: any) => x.id === id);
          if (existing && existing.amount && !skipBalanceRecalc) {
            const amount = Number(existing.amount) || 0;
            const type = existing.type;
            const fundId = existing.fundId || existing.fund_id;
            const targetFundId = existing.targetFundId || existing.target_fund_id;

            if (type === 'transfer') {
              if (fundId) await adjustFundBalance(fundId, +amount);
              if (targetFundId) await adjustFundBalance(targetFundId, -amount);
            } else if (type === 'withdraw' || type === 'expense' || type === 'employee_loan') {
              if (fundId) await adjustFundBalance(fundId, +amount);
            } else if (type === 'deposit' || type === 'employee_repay') {
              if (fundId) await adjustFundBalance(fundId, -amount);
            }
          }

          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("fund_transactions", id);
          await executePg(`DELETE FROM fund_transactions WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_EMPLOYEE_TX':
        case 'CREATE_EMPLOYEE_TRANSACTION':
        case 'UPDATE_EMPLOYEE_TRANSACTION': {
          if (!payload?.id) return true;
          const id = payload.id;
          const empId = payload.employeeId || payload.employee_id || '';
          const fundId = payload.fundId || payload.fund_id || 'fund-1';
          const repName = payload.repName || payload.rep_name || '';
          const type = payload.type || 'loan';
          const amount = Number(payload.amount) || 0;
          const notes = payload.notes || payload.note || '';
          const txDate = payload.date || payload.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0];
          const createdAt = payload.createdAt || payload.created_at || new Date().toISOString();
          const empName = payload.employeeName || payload.employee_name || repName || 'الموظف';
          const isLoan = type === 'loan' || (type as string) === 'debt' || (type as string) === 'سلفة' || (type as string) === 'دين';

          const saved = fileDb.upsert("employee_transactions", {
            ...payload,
            id,
            employeeId: empId,
            employeeName: empName,
            fundId,
            repName,
            type,
            amount,
            notes,
            note: notes,
            date: txDate,
            createdAt
          });

          await executePg(
            `INSERT INTO employee_transactions (id, employee_id, fund_id, rep_name, type, amount, notes, note, date, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (id) DO UPDATE SET
               amount = EXCLUDED.amount, type = EXCLUDED.type, notes = EXCLUDED.notes, fund_id = EXCLUDED.fund_id`,
            [id, empId, fundId, repName, type, amount, notes, notes, txDate, createdAt]
          ).catch((err) => console.warn("Error inserting employee_tx in PG sync:", err));

          // Manage linked fund transaction
          const ftId = `ft_emp_${id}`;
          const ftType = isLoan ? 'employee_loan' : 'employee_repay';
          const ftNote = isLoan
            ? `دين / سلفة للموظف (${empName})${notes ? ` - ${notes}` : ''}`
            : `راجع دين / تسديد من الموظف (${empName})${notes ? ` - ${notes}` : ''}`;

          let ftAlreadyExists = (fileDb.get<any>("fund_transactions") || []).some((x: any) => x.id === ftId);
          if (fundId && amount > 0) {
            if (isPgConfigured()) {
              const res = await executePg(
                `INSERT INTO fund_transactions (id, fund_id, type, amount, note, rep_name, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)
                 ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note, type = EXCLUDED.type
                 RETURNING id`,
                [ftId, fundId, ftType, amount, ftNote, repName || 'الإدارة', createdAt]
              ).catch(() => []);
              if (!res || res.length === 0) ftAlreadyExists = true;
            }
            fileDb.upsert("fund_transactions", {
              id: ftId,
              fundId,
              type: ftType,
              amount,
              note: ftNote,
              repName: repName || 'الإدارة',
              createdAt
            });

            if (!skipBalanceRecalc && !ftAlreadyExists) {
              await adjustFundBalance(fundId, isLoan ? -amount : +amount);
            }
          }

          if (!ftAlreadyExists) {
            const amtFmt = amount.toLocaleString('en-US');
            broadcastPushNotification({
              title: isLoan ? '💸 إشعار دين جديد' : '💵 إشعار راجع دين',
              body: isLoan
                ? `تم تسجيل دين بمبلغ (${amtFmt} د.ع) على "${empName}"${notes ? ` (${notes})` : ''} بواسطة ${payload.recordedBy || repName || 'الإدارة'}`
                : `تم تسجيل راجع دين بمبلغ (${amtFmt} د.ع) من "${empName}"${notes ? ` (${notes})` : ''} بواسطة ${payload.recordedBy || repName || 'الإدارة'}`,
              tag: `emp_${isLoan ? 'debt' : 'repay'}_${id}`,
              type: isLoan ? 'debt' : 'repay',
              targetRepId: empId,
              targetRepName: empName,
            }).catch(() => {});
          }

          return true;
        }

        case 'DELETE_EMPLOYEE_TX':
        case 'DELETE_EMPLOYEE_TRANSACTION': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;

          let existing = (fileDb.get<any>("employee_transactions") || []).find((x: any) => x.id === id);
          if (!existing && isPgConfigured()) {
            const rows = await executePg("SELECT * FROM employee_transactions WHERE id = $1 LIMIT 1", [id]).catch(() => []);
            if (rows && rows.length > 0) {
              existing = {
                id: rows[0].id,
                fundId: rows[0].fund_id,
                amount: Number(rows[0].amount) || 0,
                type: rows[0].type
              };
            }
          }

          if (existing && existing.amount && existing.fundId && !skipBalanceRecalc) {
            const isLoan = existing.type === 'loan' || (existing.type as string) === 'debt' || (existing.type as string) === 'سلفة' || (existing.type as string) === 'دين';
            const amount = Number(existing.amount) || 0;
            await adjustFundBalance(existing.fundId, isLoan ? +amount : -amount);
          }

          const ftId = `ft_emp_${id}`;
          const ftIdAlt = `ft_emptx_${id}`;
          fileDb.delete("fund_transactions", ftId);
          fileDb.delete("fund_transactions", ftIdAlt);
          if (isPgConfigured()) {
            await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'fund_transactions'), ($2, 'fund_transactions') ON CONFLICT (record_id) DO NOTHING`, [ftId, ftIdAlt]).catch(() => {});
            await executePg(`DELETE FROM fund_transactions WHERE id = $1 OR id = $2`, [ftId, ftIdAlt]).catch(() => {});
          }

          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'employee_transactions') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          fileDb.delete("employee_transactions", id);
          await executePg(`DELETE FROM employee_transactions WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_PAYMENT_CONFLICT': {
          if (!payload?.id) return true;
          fileDb.upsert("payment_conflicts", payload);
          await executePg(
            `INSERT INTO payment_conflicts (id, contract_id, customer_name, attempted_amount, actual_remaining_balance, excess_amount, accepted_amount, rep_name, note, payment_date, created_at, status, resolved_by, resolved_at, resolution_note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               excess_amount = EXCLUDED.excess_amount,
               accepted_amount = EXCLUDED.accepted_amount,
               resolved_by = EXCLUDED.resolved_by,
               resolved_at = EXCLUDED.resolved_at,
               resolution_note = EXCLUDED.resolution_note`,
            [
              payload.id,
              payload.contractId || payload.contract_id || '',
              payload.customerName || payload.customer_name || '',
              Number(payload.attemptedAmount || payload.attempted_amount) || 0,
              Number(payload.actualRemainingBalance || payload.actual_remaining_balance) || 0,
              Number(payload.excessAmount || payload.excess_amount) || 0,
              Number(payload.acceptedAmount || payload.accepted_amount) || 0,
              payload.repName || payload.rep_name || '',
              payload.note || '',
              payload.paymentDate || payload.payment_date || new Date().toISOString().split('T')[0],
              payload.createdAt || payload.created_at || new Date().toISOString(),
              payload.status || 'pending_review',
              payload.resolvedBy || payload.resolved_by || null,
              payload.resolvedAt || payload.resolved_at || null,
              payload.resolutionNote || payload.resolution_note || null,
            ]
          ).catch((err) => console.warn("Error inserting payment_conflict in sync:", err));
          return true;
        }

        case 'RESOLVE_PAYMENT_CONFLICT': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          const status = payload?.status || 'resolved';
          const resolvedBy = payload?.resolvedBy || payload?.resolved_by || 'المدير';
          const resolvedAt = payload?.resolvedAt || payload?.resolved_at || new Date().toISOString();
          const resolutionNote = payload?.resolutionNote || payload?.resolution_note || '';
          const acceptedAmount = Number(payload?.acceptedAmount || payload?.accepted_amount) || 0;
          const excessAmount = Number(payload?.excessAmount || payload?.excess_amount) || 0;

          fileDb.update("payment_conflicts", id, { ...payload, status, resolvedBy, resolvedAt, resolutionNote, acceptedAmount, excessAmount });
          await executePg(
            `UPDATE payment_conflicts SET
               status = $1,
               resolved_by = $2,
               resolved_at = $3,
               resolution_note = $4,
               accepted_amount = $5,
               excess_amount = $6
             WHERE id = $7`,
            [status, resolvedBy, resolvedAt, resolutionNote, acceptedAmount, excessAmount, id]
          ).catch(() => {});
          return true;
        }

        case 'REJECT_PAYMENT_CONFLICT':
        case 'DELETE_PAYMENT_CONFLICT': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          fileDb.delete("payment_conflicts", id);
          await executePg(`DELETE FROM payment_conflicts WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        case 'CREATE_APPOINTMENT':
        case 'APPOINTMENT_CREATE':
        case 'UPDATE_APPOINTMENT':
        case 'APPOINTMENT_UPDATE': {
          if (!payload?.id) return true;
          const id = payload.id;
          const cAt = payload.createdAt || payload.created_at || new Date().toISOString();
          const apptObj = {
            ...payload,
            id,
            createdAt: cAt
          };
          fileDb.upsert("appointments", apptObj);

          const query = `
            INSERT INTO appointments (
              id, contract_id, customer_name, customer_phone, customer_address,
              list_id, list_name, appointment_type, recurring_day, recurring_day_name,
              recurring_day_of_month, recurring_month_day_name, appointment_date,
              appointment_time, due_date, due_time, title, notes, note, status,
              created_by_name, created_by_rep_name, created_by_rep_id, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
            ON CONFLICT (id) DO UPDATE SET
              contract_id = EXCLUDED.contract_id,
              customer_name = EXCLUDED.customer_name,
              customer_phone = EXCLUDED.customer_phone,
              customer_address = EXCLUDED.customer_address,
              list_id = EXCLUDED.list_id,
              list_name = EXCLUDED.list_name,
              appointment_type = EXCLUDED.appointment_type,
              recurring_day = EXCLUDED.recurring_day,
              recurring_day_name = EXCLUDED.recurring_day_name,
              recurring_day_of_month = EXCLUDED.recurring_day_of_month,
              recurring_month_day_name = EXCLUDED.recurring_month_day_name,
              appointment_date = EXCLUDED.appointment_date,
              appointment_time = EXCLUDED.appointment_time,
              due_date = EXCLUDED.due_date,
              due_time = EXCLUDED.due_time,
              title = EXCLUDED.title,
              notes = EXCLUDED.notes,
              note = EXCLUDED.note,
              status = EXCLUDED.status,
              created_by_name = EXCLUDED.created_by_name,
              created_by_rep_name = EXCLUDED.created_by_rep_name,
              created_by_rep_id = EXCLUDED.created_by_rep_id
          `;
          const vals = [
            id,
            payload.contractId || payload.contract_id || null,
            payload.customerName || payload.customer_name || '',
            payload.customerPhone || payload.customer_phone || '',
            payload.customerAddress || payload.customer_address || '',
            payload.listId || payload.list_id || null,
            payload.listName || payload.list_name || '',
            payload.appointmentType || payload.appointment_type || 'specific_date',
            payload.recurringDay != null ? Number(payload.recurringDay) : (payload.recurring_day != null ? Number(payload.recurring_day) : null),
            payload.recurringDayName || payload.recurring_day_name || '',
            payload.recurringDayOfMonth != null ? Number(payload.recurringDayOfMonth) : (payload.recurring_day_of_month != null ? Number(payload.recurring_day_of_month) : null),
            payload.recurringMonthDayName || payload.recurring_month_day_name || '',
            payload.appointmentDate || payload.appointment_date || '',
            payload.appointmentTime || payload.appointment_time || '',
            payload.dueDate || payload.due_date || '',
            payload.dueTime || payload.due_time || '',
            payload.title || '',
            payload.notes || payload.note || '',
            payload.note || payload.notes || '',
            payload.status || 'pending',
            payload.createdByName || payload.created_by_name || '',
            payload.createdByRepName || payload.created_by_rep_name || '',
            payload.createdByRepId || payload.created_by_rep_id || '',
            cAt
          ];
          await executePg(query, vals).catch((err) => console.warn("Error inserting appointment in sync:", err));
          return true;
        }

        case 'DELETE_APPOINTMENT':
        case 'APPOINTMENT_DELETE': {
          const id = typeof payload === 'string' ? payload : payload?.id;
          if (!id) return true;
          fileDb.delete("appointments", id);
          await executePg(`INSERT INTO deleted_records (record_id, table_name) VALUES ($1, 'appointments') ON CONFLICT (record_id) DO NOTHING`, [id]).catch(() => {});
          await executePg(`DELETE FROM appointments WHERE id = $1`, [id]).catch(() => {});
          return true;
        }

        default:
          return true;
      }
    } catch (e) {
      console.warn('Process sync action error:', action?.type, e);
      return false;
    }
  }

  app.get("/api/deleted-records", async (req, res) => {
    try {
      if (isPgConfigured()) {
        const rows = await executePg("SELECT record_id, table_name, deleted_at FROM deleted_records ORDER BY deleted_at DESC LIMIT 5000").catch(() => []);
        return res.json(rows || []);
      }
      res.json([]);
    } catch (e: any) {
      res.json([]);
    }
  });

  // Helper to ensure all standalone customers in `customers` table have corresponding sales/contracts
  async function autoSyncCustomersAndSalesInPg() {
    // Disabled: automatic creation of sales from customers is strictly prevented.
    return;
  }

  // Comprehensive atomic full-sync endpoint for 100% perfect matching between Web & Android APK
  app.get("/api/sync/all", async (req, res) => {
    try {
      if (isPgConfigured()) {
        await cleanupDuplicateEntities().catch(() => {});
        await syncCustomersTableInPg().catch(() => {});
        if (req.query.audit === 'true' || req.query.force_recalc === 'true') {
          await syncContractBalancesInPgAndFileDb().catch(() => {});
        }

        // Ensure rep-1 is never excluded by deleted_records and always exists
        await executePg("DELETE FROM deleted_records WHERE record_id = 'rep-1' OR record_id IN (SELECT id FROM reps WHERE name LIKE '%ضياء%')").catch(() => {});
        await executePg(`
          INSERT INTO reps (id, name, phone, code, role, can_edit, can_delete, can_move_customer, can_sell, allowed_list_ids)
          VALUES ('rep-1', 'ضياء المحاسب', '07801112233', '4444', 'admin', true, true, true, true, '["all"]')
          ON CONFLICT (id) DO UPDATE SET name = 'ضياء المحاسب', role = 'admin', can_edit = true, can_delete = true, can_move_customer = true, can_sell = true, allowed_list_ids = '["all"]'
        `).catch(() => {});

        const [
          contractsRows,
          paymentsRows,
          inventoryRows,
          repsRows,
          fundsRows,
          customerListsRows,
          employeesRows,
          fundTxRows,
          employeeTxRows,
          conflictsRows,
          appointmentsRows,
          deletedRows,
        ] = await Promise.all([
          executePg(`
            SELECT 
              c.*,
              (SELECT COUNT(*) FROM payments p WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name))) AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments'))) AS payment_count,
              COALESCE((
                SELECT SUM(COALESCE(p.amount_paid, p.amount, 0))
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments'))
              ), 0) AS actual_total_paid,
              (
                SELECT MAX(p.payment_date)
                FROM payments p
                WHERE ((p.contract_id = c.id) OR ((p.contract_id IS NULL OR p.contract_id = '') AND (TRIM(LOWER(p.customer_name)) = TRIM(LOWER(c.customer_name)) OR p.customer_name = c.customer_name)))
                  AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments'))
              ) AS actual_last_payment_date
            FROM sales c
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = c.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts'))
              AND TRIM(c.customer_name) != ''
              AND c.id NOT LIKE 'pay_%' AND c.id NOT LIKE 'fund_%' AND c.id NOT LIKE 'emp_%' AND c.id NOT LIKE 'item_%' AND c.id NOT LIKE 'ft_%' AND c.id NOT LIKE 'emptx_%' AND c.id NOT LIKE 'conflict_%'
            ORDER BY c.created_at ASC, c.id ASC
          `).catch(() => []),
          executePg(`
            SELECT p.*
            FROM payments p
            WHERE COALESCE(p.amount_paid, p.amount, 0) > 0
              AND (p.id LIKE 'pay_%' OR (p.id NOT LIKE 'contract_%' AND p.id NOT LIKE 'emp_%' AND p.id NOT LIKE 'item_%' AND p.id NOT LIKE 'fund_%'))
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = p.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown' OR dr.table_name IS NULL))
            ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
          `).catch(() => []),
          executePg(`
            SELECT * FROM inventory_items
            WHERE (id LIKE 'item_%' OR (id NOT LIKE 'emp_%' AND id NOT LIKE 'pay_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'ft_%' AND id NOT LIKE 'emptx_%' AND id NOT LIKE 'conflict_%'))
              AND NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'inventory_items' OR dr.table_name = 'inventory' OR dr.table_name = 'unknown'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM reps
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND dr.record_id != 'rep-1' AND (dr.table_name = 'reps'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM cash_funds
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'cash_funds' OR dr.table_name = 'funds'))
              AND TRIM(name) != ''
              AND id NOT LIKE 'pay_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'emp_%' AND id NOT LIKE 'item_%' AND id NOT LIKE 'ft_%' AND id NOT LIKE 'emptx_%' AND id NOT LIKE 'conflict_%'
            ORDER BY COALESCE(order_index, 0) ASC, created_at ASC, id ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM customer_lists
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'customer_lists'))
              AND TRIM(name) != '' AND TRIM(name) != 'قائمة بدون اسم'
              AND id NOT LIKE 'pay_%' AND id NOT LIKE 'contract_%' AND id NOT LIKE 'emp_%' AND id NOT LIKE 'item_%' AND id NOT LIKE 'fundtx_%'
            ORDER BY COALESCE(order_index, 0) ASC, created_at ASC, id ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM employees
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'employees'))
            ORDER BY name ASC
          `).catch(() => []),
          executePg(`
            SELECT * FROM fund_transactions
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'fund_transactions'))
            ORDER BY created_at DESC
          `).catch(() => []),
          executePg(`
            SELECT * FROM employee_transactions
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = id AND (dr.table_name = 'employee_transactions'))
            ORDER BY created_at DESC
          `).catch(() => []),
          executePg(`SELECT * FROM payment_conflicts WHERE status = 'pending_review' ORDER BY created_at DESC`).catch(() => []),
          executePg(`
            SELECT * FROM appointments 
            WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = appointments.id AND (dr.table_name = 'appointments' OR dr.table_name = 'unknown'))
            ORDER BY created_at DESC
          `).catch(() => []),
          executePg(`SELECT record_id, table_name FROM deleted_records ORDER BY deleted_at DESC LIMIT 5000`).catch(() => []),
        ]);

        const contracts = (contractsRows || []).map(mapContractRow);
        const payments = (paymentsRows || []).map(mapPaymentRow);
        const inventory = (inventoryRows || []).map(mapInventoryRow);
        const reps = (repsRows || []).map(mapRepRow);
        const appointments = (appointmentsRows || []).map(mapAppointmentRow);
        if (!reps.some((r: any) => r.id === 'rep-1' || (r.name && r.name.includes('ضياء')))) {
          reps.unshift({
            id: 'rep-1',
            name: 'ضياء المحاسب',
            phone: '07801112233',
            code: '4444',
            role: 'admin',
            canEdit: true,
            canDelete: true,
            canMoveCustomer: true,
            canSell: true,
            allowedListIds: ['all'],
            avatarUrl: ''
          });
        }
        const funds = (fundsRows || []).map(mapFundRow).sort(compareEntitiesByOrderIndex);
        const customerLists = (customerListsRows || []).map(mapCustomerListRow).sort(compareEntitiesByOrderIndex);
        const employees = (employeesRows || []).map((r: any) => ({
          id: r.id,
          name: r.name,
          phone: r.phone || '',
          jobTitle: r.job_title || '',
          position: r.position || '',
          salary: Number(r.salary) || 0,
          debtBalance: Number(r.debt_balance) || 0,
          totalDebt: Number(r.total_debt) || 0,
          isRep: Boolean(r.is_rep),
          repId: r.rep_id || null,
          createdAt: r.created_at || new Date().toISOString(),
        }));
        const fundTransactions = (fundTxRows || []).map((r: any) => ({
          id: r.id,
          fundId: r.fund_id,
          targetFundId: r.target_fund_id || null,
          type: r.type,
          amount: Number(r.amount) || 0,
          note: r.note || '',
          repName: r.rep_name || '',
          createdAt: r.created_at || new Date().toISOString(),
        }));
        const employeeTransactions = (employeeTxRows || []).map((r: any) => ({
          id: r.id,
          employeeId: r.employee_id,
          fundId: r.fund_id || '',
          type: r.type,
          amount: Number(r.amount) || 0,
          notes: r.notes || '',
          repName: r.rep_name || '',
          createdAt: r.created_at || new Date().toISOString(),
        }));
        const paymentConflicts = (conflictsRows || []).map((r: any) => ({
          id: r.id,
          contractId: r.contract_id,
          customerName: r.customer_name || '',
          attemptedAmount: Number(r.attempted_amount) || 0,
          actualRemainingBalance: Number(r.actual_remaining_balance) || 0,
          excessAmount: Number(r.excess_amount) || 0,
          repName: r.rep_name || '',
          note: r.note || '',
          paymentDate: r.payment_date || '',
          createdAt: r.created_at || new Date().toISOString(),
          status: r.status || 'pending_review',
        }));
        const protectedEmpIds = new Set([
          'rep-1', 'rep-2', 'rep-emp-rep-1', 'rep-emp-rep-2',
          'rep-emp-rep_1786620296205_ae0e2', 'rep-emp-rep_1787351248238_bgr70',
          'rep-emp-rep_1787351289887_620kg', 'rep-emp-rep_1787351318939_bysbs',
          'rep-emp-rep_1787351361675_xp56x', 'rep-emp-rep_1787351151276_4k6lg'
        ]);
        const activeContractIds = new Set(contracts.map((c: any) => String(c.id)));
        const activePaymentIds = new Set(payments.map((p: any) => String(p.id)));
        const activeItemIds = new Set(inventory.map((i: any) => String(i.id)));
        const activeRepIds = new Set(reps.map((r: any) => String(r.id)));
        const activeFundIds = new Set(funds.map((f: any) => String(f.id)));
        const activeListIds = new Set(customerLists.map((l: any) => String(l.id)));
        const activeEmpIds = new Set(employees.map((e: any) => String(e.id)));

        const deletedRecordIds = (deletedRows || [])
          .map((r: any) => r.record_id)
          .filter((id: string) => 
            !protectedEmpIds.has(String(id)) &&
            !activeContractIds.has(String(id)) &&
            !activePaymentIds.has(String(id)) &&
            !activeItemIds.has(String(id)) &&
            !activeRepIds.has(String(id)) &&
            !activeFundIds.has(String(id)) &&
            !activeListIds.has(String(id)) &&
            !activeEmpIds.has(String(id))
          );

        return res.json({
          success: true,
          serverTimestamp: new Date().toISOString(),
          contracts,
          payments,
          inventory,
          reps,
          funds,
          customerLists,
          employees,
          fundTransactions,
          employeeTransactions,
          paymentConflicts,
          appointments,
          deletedRecordIds,
        });
      }

      // Fallback
      res.json({
        success: true,
        serverTimestamp: new Date().toISOString(),
        contracts: fileDb.get("contracts") || [],
        payments: fileDb.get("payments") || [],
        inventory: fileDb.get("inventory") || [],
        reps: fileDb.get("reps") || [],
        funds: (fileDb.get("cash_funds") || fileDb.get("funds") || []).map(mapFundRow).sort(compareEntitiesByOrderIndex),
        customerLists: (fileDb.get("customer_lists") || []).map(mapCustomerListRow).sort(compareEntitiesByOrderIndex),
        employees: fileDb.get("employees") || [],
        fundTransactions: fileDb.get("fund_transactions") || [],
        employeeTransactions: fileDb.get("employee_transactions") || [],
        paymentConflicts: fileDb.get("payment_conflicts") || [],
        appointments: fileDb.get("appointments") || [],
        deletedRecordIds: [],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sync/batch", async (req, res) => {
    try {
      const actions = Array.isArray(req.body?.actions) ? req.body.actions : (Array.isArray(req.body) ? req.body : []);
      if (actions.length === 0) {
        return res.json({ success: true, processedIds: [], totalCount: 0 });
      }

      // 1. Bulk lookup all deleted records in a single query
      const candidateIds = actions.map((a: any) => a?.payload?.id || (typeof a?.payload === 'string' ? a.payload : null)).filter(Boolean);
      let deletedSet = new Set<string>();
      if (candidateIds.length > 0) {
        const deletedRows = await executePg(
          `SELECT record_id FROM deleted_records WHERE record_id = ANY($1)`,
          [candidateIds]
        ).catch(() => []);
        if (Array.isArray(deletedRows)) {
          deletedSet = new Set(deletedRows.map((r: any) => r.record_id));
        }
      }

      const processedIds: string[] = [];
      const affectedContractIds = new Set<string>();

      // Partition actions into Payments, Contracts, Deletes, and Others for maximum batch speed
      const paymentActions: any[] = [];
      const contractActions: any[] = [];
      const otherActions: any[] = [];

      for (const act of actions) {
        const targetId = act?.payload?.id || (typeof act?.payload === 'string' ? act?.payload : null);
        const isDelete = act?.type?.startsWith('DELETE_');

        // If previously deleted entity (and NOT a new creation/payment), mark as processed and skip
        if (!isDelete && act?.type !== 'CREATE_PAYMENT' && targetId && deletedSet.has(targetId)) {
          if (act?.id) processedIds.push(act.id);
          continue;
        }

        if (act?.type === 'CREATE_PAYMENT' || act?.type === 'UPDATE_PAYMENT') {
          // If payment was previously erroneously recorded in deletedSet, unblock it
          if (targetId && deletedSet.has(targetId)) {
            deletedSet.delete(targetId);
          }
          paymentActions.push(act);
        } else if (act?.type === 'CREATE_CONTRACT') {
          contractActions.push(act);
        } else {
          otherActions.push(act);
        }
      }

      // 2. High-Performance Bulk Upsert for Payments (jsonb_to_recordset in 1 single SQL statement)
      if (paymentActions.length > 0) {
        const paymentRows = paymentActions.map((act) => {
          const p = act.payload || {};
          const amt = Number(p.amount ?? p.amountPaid ?? p.amount_paid) || 0;
          const cId = p.contractId ?? p.contract_id ?? '';
          const cName = p.customerName ?? p.customer_name ?? '';
          const pDate = p.paymentDate ?? p.payment_date ?? new Date().toISOString().split('T')[0];
          const pNote = p.note ?? p.notes ?? '';
          const rName = p.repName ?? p.rep_name ?? '';
          const fId = p.fundId ?? p.fund_id ?? null;
          const cAt = p.createdAt ?? p.created_at ?? new Date().toISOString();
          const isEd = Boolean(p.isEdited ?? p.is_edited);

          if (cId) affectedContractIds.add(cId);

          try {
            fileDb.upsert("payments", {
              id: p.id,
              contractId: cId,
              customerName: cName,
              amount: amt,
              amountPaid: amt,
              paymentDate: pDate,
              note: pNote,
              repName: rName,
              fundId: fId,
              createdAt: cAt,
              isEdited: isEd,
            });
          } catch (e) {}

          return {
            id: String(p.id),
            contract_id: String(cId),
            customer_name: String(cName),
            amount: amt,
            amount_paid: amt,
            payment_date: String(pDate),
            note: String(pNote),
            rep_name: String(rName),
            fund_id: fId ? String(fId) : null,
            created_at: String(cAt),
            is_edited: isEd,
          };
        }).filter((r) => r.id);

        const uniquePaymentRowsMap = new Map<string, any>();
        for (const row of paymentRows) {
          if (row && row.id) {
            uniquePaymentRowsMap.set(row.id, row);
          }
        }
        const dedupedPaymentRows = Array.from(uniquePaymentRowsMap.values());

        if (dedupedPaymentRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO payments (
                id, contract_id, customer_name, amount, amount_paid,
                payment_date, note, rep_name, fund_id, created_at, is_edited
              )
              SELECT
                x.id,
                x.contract_id,
                x.customer_name,
                COALESCE(x.amount, 0),
                COALESCE(x.amount_paid, x.amount, 0),
                x.payment_date,
                x.note,
                x.rep_name,
                x.fund_id,
                COALESCE(x.created_at, NOW()::text),
                COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text,
                contract_id text,
                customer_name text,
                amount double precision,
                amount_paid double precision,
                payment_date text,
                note text,
                rep_name text,
                fund_id text,
                created_at text,
                is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                contract_id = EXCLUDED.contract_id,
                customer_name = EXCLUDED.customer_name,
                amount = EXCLUDED.amount,
                amount_paid = EXCLUDED.amount_paid,
                payment_date = EXCLUDED.payment_date,
                note = EXCLUDED.note,
                rep_name = EXCLUDED.rep_name,
                fund_id = EXCLUDED.fund_id,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedPaymentRows)]);

            for (const row of dedupedPaymentRows) {
              if (row.amount > 0) {
                const targetFundId = await resolveFundIdForPayment(row.fund_id, row.contract_id);
                if (targetFundId) {
                  await recordPaymentFundAdjustment(
                    row.id,
                    targetFundId,
                    row.amount,
                    row.customer_name || '',
                    row.rep_name || '',
                    row.payment_date || '',
                    false
                  ).catch(() => {});
                }
              }
            }

            for (const act of paymentActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkPayErr) {
            console.warn('[Batch Sync] Bulk payment upsert error, running per-item fallback:', bulkPayErr);
            for (const act of paymentActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {}
            }
          }
        }
      }

      // 3. High-Performance Bulk Upsert for Contracts (jsonb_to_recordset in 1 single SQL statement)
      if (contractActions.length > 0) {
        const contractRows = contractActions.map((act) => {
          const c = act.payload || {};
          if (c.id && (String(c.id).startsWith('pay_') || String(c.id).startsWith('ft_') || String(c.id).startsWith('emptx_') || String(c.id).startsWith('conflict_'))) {
            return null;
          }
          const totalPrice = Number(c.totalPrice ?? c.total_price) || 0;
          const adv = Number(c.advancePayment ?? c.advance_payment) || 0;
          const paid = Number(c.totalPaid ?? c.total_paid) || 0;
          const rem = Math.max(0, totalPrice - adv - paid);
          const daily = Number(c.dailyInstallment ?? c.daily_installment) || 0;
          const stat = rem <= 0 ? 'completed' : (c.status || 'active');

          if (c.id) affectedContractIds.add(c.id);

          try {
            fileDb.upsert("contracts", {
              ...c,
              totalPrice,
              advancePayment: adv,
              totalPaid: paid,
              remainingBalance: rem,
              dailyInstallment: daily,
              status: stat,
            });
          } catch (e) {}

          return {
            id: String(c.id),
            customer_name: String(c.customerName ?? c.customer_name ?? ''),
            customer_phone: String(c.customerPhone ?? c.customer_phone ?? ''),
            customer_address: c.customerAddress ?? c.customer_address ?? null,
            item_id: c.itemId ?? c.item_id ?? null,
            item_name: String(c.itemName ?? c.item_name ?? ''),
            item_quantity: Number(c.itemQuantity ?? c.item_quantity) || 1,
            purchase_price: Number(c.purchasePrice ?? c.purchase_price) || 0,
            list_id: c.listId ?? c.list_id ?? null,
            list_name: c.listName ?? c.list_name ?? null,
            total_price: totalPrice,
            advance_payment: adv,
            remaining_balance: rem,
            daily_installment: daily,
            start_date: String(c.startDate ?? c.start_date ?? new Date().toISOString().split('T')[0]),
            notes: c.notes ?? null,
            status: stat,
            last_payment_date: c.lastPaymentDate ?? c.last_payment_date ?? null,
            total_paid: paid,
            rep_name: c.repName ?? c.rep_name ?? null,
            created_at: String(c.createdAt ?? c.created_at ?? new Date().toISOString()),
            completed_at: c.completedAt ?? c.completed_at ?? null,
            updated_at: c.updatedAt ?? c.updated_at ?? new Date().toISOString(),
            is_edited: Boolean(c.isEdited ?? c.is_edited),
          };
        }).filter((r) => r.id);

        const uniqueContractRowsMap = new Map<string, any>();
        for (const row of contractRows) {
          if (row && row.id) {
            uniqueContractRowsMap.set(row.id, row);
          }
        }
        const dedupedContractRows = Array.from(uniqueContractRowsMap.values());

        if (dedupedContractRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO sales (
                id, customer_name, customer_phone, customer_address,
                item_id, item_name, item_quantity, purchase_price,
                list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes,
                status, last_payment_date, total_paid, rep_name,
                created_at, completed_at, updated_at, is_edited
              )
              SELECT
                x.id, x.customer_name, x.customer_phone, x.customer_address,
                x.item_id, x.item_name, COALESCE(x.item_quantity, 1), COALESCE(x.purchase_price, 0),
                x.list_id, x.list_name, COALESCE(x.total_price, 0), COALESCE(x.advance_payment, 0),
                COALESCE(x.remaining_balance, 0), COALESCE(x.daily_installment, 0), COALESCE(x.start_date, NOW()::date::text), x.notes,
                COALESCE(x.status, 'active'), x.last_payment_date, COALESCE(x.total_paid, 0), x.rep_name,
                COALESCE(x.created_at, NOW()::text), x.completed_at, x.updated_at, COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text, customer_name text, customer_phone text, customer_address text,
                item_id text, item_name text, item_quantity integer, purchase_price double precision,
                list_id text, list_name text, total_price double precision, advance_payment double precision,
                remaining_balance double precision, daily_installment double precision, start_date text, notes text,
                status text, last_payment_date text, total_paid double precision, rep_name text,
                created_at text, completed_at text, updated_at text, is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), sales.customer_name),
                customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), sales.customer_phone),
                customer_address = COALESCE(EXCLUDED.customer_address, sales.customer_address),
                item_id = COALESCE(EXCLUDED.item_id, sales.item_id),
                item_name = COALESCE(NULLIF(EXCLUDED.item_name, ''), sales.item_name),
                item_quantity = CASE WHEN EXCLUDED.item_quantity > 0 THEN EXCLUDED.item_quantity ELSE sales.item_quantity END,
                purchase_price = CASE WHEN EXCLUDED.purchase_price > 0 THEN EXCLUDED.purchase_price ELSE sales.purchase_price END,
                list_id = COALESCE(EXCLUDED.list_id, sales.list_id),
                list_name = COALESCE(EXCLUDED.list_name, sales.list_name),
                total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE sales.total_price END,
                advance_payment = CASE WHEN EXCLUDED.advance_payment > 0 THEN EXCLUDED.advance_payment ELSE sales.advance_payment END,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = CASE WHEN EXCLUDED.daily_installment > 0 THEN EXCLUDED.daily_installment ELSE sales.daily_installment END,
                start_date = COALESCE(NULLIF(EXCLUDED.start_date, ''), sales.start_date),
                notes = COALESCE(EXCLUDED.notes, sales.notes),
                status = EXCLUDED.status,
                last_payment_date = COALESCE(EXCLUDED.last_payment_date, sales.last_payment_date),
                total_paid = EXCLUDED.total_paid,
                rep_name = COALESCE(NULLIF(EXCLUDED.rep_name, ''), sales.rep_name),
                completed_at = COALESCE(EXCLUDED.completed_at, sales.completed_at),
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedContractRows)]);

            for (const act of contractActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkContractErr) {
            console.warn('[Batch Sync] Bulk contract upsert error, running per-item fallback:', bulkContractErr);
            for (const act of contractActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {}
            }
          }
        }
      }

      // 4. Process any remaining non-payment/non-contract actions (inventory, reps, deletes, funds, etc.)
      if (otherActions.length > 0) {
        for (const act of otherActions) {
          try {
            if (act?.type === 'DELETE_PAYMENT') {
              const pContractId = act.payload?.contractId || act.payload?.contract_id;
              if (pContractId) affectedContractIds.add(pContractId);
            }
            const ok = await processSingleSyncAction(act, true);
            if (ok && act?.id) {
              processedIds.push(act.id);
            }
          } catch (actErr) {
            console.warn('[Batch Sync] Other action error:', act?.id, actErr);
          }
        }
      }

      // 5. Batch recalculate contract balances once for all touched contracts
      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        try {
          await executePg(`
            UPDATE sales c
            SET
              total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
              status = CASE
                WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
                ELSE 'active'
              END
            FROM (
              SELECT contract_id, SUM(COALESCE(amount_paid, amount, 0)) as sum_paid
              FROM payments
              WHERE contract_id = ANY($1)
              GROUP BY contract_id
            ) p
            WHERE c.id = p.contract_id AND c.id = ANY($1)
          `, [cIds]).catch(() => {});

          await executePg(`
            UPDATE sales c
            SET
              total_paid = 0,
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment),
              status = CASE WHEN (c.total_price - c.advance_payment) <= 0 THEN 'completed' ELSE 'active' END
            WHERE c.id = ANY($1) AND NOT EXISTS (
              SELECT 1 FROM payments p 
              WHERE p.contract_id = c.id OR ((p.contract_id IS NULL OR p.contract_id = '') AND p.customer_name = c.customer_name)
            )
          `, [cIds]).catch(() => {});
        } catch (balErr) {
          console.warn('Batch balance recalc notice:', balErr);
        }
        await syncContractBalancesInPgAndFileDb(cIds).catch(() => {});
      }

      bumpSyncVersion();
      res.json({ success: true, processedIds, totalCount: actions.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reconcile and audit all client local datasets against PostgreSQL to ensure 0 missing records (Optimized Bulk)
  app.post("/api/sync/reconcile", async (req, res) => {
    try {
      const payload = req.body || {};
      let totalInserted = 0;
      const affectedContractIds = new Set<string>();

      // 0. Process any deleted IDs in bulk with strict safety guard against deleting active records
      if (Array.isArray(payload.deletedIds) && payload.deletedIds.length > 0) {
        const rawDelIds = payload.deletedIds.filter(Boolean);
        if (rawDelIds.length > 0) {
          let existingIds = new Set<string>();
          if (isPgConfigured()) {
            try {
              const resExisting = await executePg(`SELECT id FROM sales WHERE id = ANY($1) UNION SELECT id FROM payments WHERE id = ANY($1)`, [rawDelIds]);
              if (Array.isArray(resExisting)) {
                resExisting.forEach((r: any) => existingIds.add(String(r.id)));
              }
            } catch (e) {}
          }
          const salesCache = fileDb.get<any>("contracts") || [];
          const paymentsCache = fileDb.get<any>("payments") || [];
          salesCache.forEach((c: any) => { if (c?.id) existingIds.add(String(c.id)); });
          paymentsCache.forEach((p: any) => { if (p?.id) existingIds.add(String(p.id)); });

          const delIds = rawDelIds.filter((id: string) => !existingIds.has(String(id)));

          if (delIds.length > 0) {
            // Strictly classify deleted IDs by entity prefix to guarantee zero accidental deletions across tables
            const contractDelIds = delIds.filter((id: string) => String(id).startsWith('contract_'));
            const paymentDelIds = delIds.filter((id: string) => String(id).startsWith('pay_') || String(id).startsWith('payment_'));
            const itemDelIds = delIds.filter((id: string) => String(id).startsWith('item_') || String(id).startsWith('inv_'));
            const fundDelIds = delIds.filter((id: string) => String(id).startsWith('fund_'));
            const listDelIds = delIds.filter((id: string) => String(id).startsWith('list_'));
            const protectedEmpIds = new Set([
              'rep-1', 'rep-2', 'rep-emp-rep-1', 'rep-emp-rep-2',
              'rep-emp-rep_1786620296205_ae0e2', 'rep-emp-rep_1787351248238_bgr70',
              'rep-emp-rep_1787351289887_620kg', 'rep-emp-rep_1787351318939_bysbs',
              'rep-emp-rep_1787351361675_xp56x', 'rep-emp-rep_1787351151276_4k6lg'
            ]);
            const empDelIds = delIds.filter((id: string) => String(id).startsWith('emp_') && !protectedEmpIds.has(String(id)));

            if (contractDelIds.length > 0) {
              await executePg(`INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'sales' ON CONFLICT (record_id) DO NOTHING`, [contractDelIds]).catch(() => {});
              if (isPgConfigured()) {
                await executePg(`DELETE FROM sales WHERE id = ANY($1)`, [contractDelIds]).catch(() => {});
              }
              for (const dId of contractDelIds) {
                fileDb.delete("contracts", dId);
              }
            }

            if (paymentDelIds.length > 0) {
              await executePg(`INSERT INTO deleted_records (record_id, table_name) SELECT unnest($1::text[]), 'payments' ON CONFLICT (record_id) DO NOTHING`, [paymentDelIds]).catch(() => {});
              if (isPgConfigured()) {
                await executePg(`DELETE FROM payments WHERE id = ANY($1)`, [paymentDelIds]).catch(() => {});
              }
              for (const dId of paymentDelIds) {
                fileDb.delete("payments", dId);
              }
            }

            if (itemDelIds.length > 0) {
              await executePg(`DELETE FROM inventory_items WHERE id = ANY($1)`, [itemDelIds]).catch(() => {});
            }
            if (fundDelIds.length > 0) {
              await executePg(`DELETE FROM cash_funds WHERE id = ANY($1)`, [fundDelIds]).catch(() => {});
            }
            if (listDelIds.length > 0) {
              await executePg(`DELETE FROM customer_lists WHERE id = ANY($1)`, [listDelIds]).catch(() => {});
            }
            if (empDelIds.length > 0) {
              await executePg(`DELETE FROM employees WHERE id = ANY($1)`, [empDelIds]).catch(() => {});
            }
          }
        }
      }

      // Helper to process arrays in parallel chunks
      const processBulk = async (items: any[], type: string) => {
        if (!Array.isArray(items) || items.length === 0) return;
        const CHUNK = 20;
        for (let i = 0; i < items.length; i += CHUNK) {
          const slice = items.slice(i, i + CHUNK);
          await Promise.all(
            slice.map(async (item) => {
              if (!item?.id) return;
              const ok = await processSingleSyncAction({ type, payload: item }, true);
              if (ok) {
                const relatedContractId = item?.contractId || item?.contract_id || (type.includes('CONTRACT') ? item?.id : null);
                if (relatedContractId) affectedContractIds.add(relatedContractId);
                totalInserted++;
              }
            })
          );
        }
      };

      await processBulk(payload.contracts, 'CREATE_CONTRACT');
      await processBulk(payload.payments, 'CREATE_PAYMENT');
      await processBulk(payload.inventory, 'CREATE_INVENTORY');
      await processBulk(payload.reps, 'CREATE_REP');
      await processBulk(payload.funds, 'CREATE_FUND');
      await processBulk(payload.customer_lists, 'CREATE_CUSTOMER_LIST');
      await processBulk(payload.employees, 'CREATE_EMPLOYEE');
      await processBulk(payload.fund_transactions, 'CREATE_FUND_TRANSACTION');
      await processBulk(payload.employee_transactions, 'CREATE_EMPLOYEE_TRANSACTION');
      await processBulk(payload.appointments, 'CREATE_APPOINTMENT');

      // Batch recalculate contract balances once for all touched contracts
      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        await executePg(`
          UPDATE sales c
          SET
            total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
            remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
            status = CASE
              WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
              ELSE 'active'
            END
          FROM (
            SELECT contract_id, SUM(COALESCE(amount_paid, amount, 0)) as sum_paid
            FROM payments
            WHERE contract_id = ANY($1)
            GROUP BY contract_id
          ) p
          WHERE c.id = p.contract_id AND c.id = ANY($1)
        `, [cIds]).catch(() => {});
      }

      await syncContractBalancesInPgAndFileDb().catch(() => {});
      bumpSyncVersion();

      res.json({ success: true, totalInserted, message: 'Reconciliation complete' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Verify and audit matching between client local datasets and PostgreSQL
  // Returns which records are missing on the server, ensuring 100% data fidelity
  app.post("/api/sync/verify-match", async (req, res) => {
    try {
      const payload = req.body || {};
      const clientContractIds: string[] = Array.isArray(payload.contractIds) ? payload.contractIds.filter(Boolean).map(String) : [];
      const clientPaymentIds: string[] = Array.isArray(payload.paymentIds) ? payload.paymentIds.filter(Boolean).map(String) : [];
      const clientInventoryIds: string[] = Array.isArray(payload.inventoryIds) ? payload.inventoryIds.filter(Boolean).map(String) : [];
      const clientRepIds: string[] = Array.isArray(payload.repIds) ? payload.repIds.filter(Boolean).map(String) : [];
      const clientFundIds: string[] = Array.isArray(payload.fundIds) ? payload.fundIds.filter(Boolean).map(String) : [];
      const clientCustomerListIds: string[] = Array.isArray(payload.customerListIds) ? payload.customerListIds.filter(Boolean).map(String) : [];
      const clientEmployeeIds: string[] = Array.isArray(payload.employeeIds) ? payload.employeeIds.filter(Boolean).map(String) : [];

      // Query PostgreSQL to find which IDs exist
      const [
        existingContracts,
        existingPayments,
        existingInventory,
        existingReps,
        existingFunds,
        existingCustomerLists,
        existingEmployees,
        deletedRecordsRows,
      ] = await Promise.all([
        clientContractIds.length > 0
          ? executePg(`SELECT id FROM sales WHERE id = ANY($1)`, [clientContractIds]).catch(() => [])
          : Promise.resolve([]),
        clientPaymentIds.length > 0
          ? executePg(`SELECT id FROM payments WHERE id = ANY($1)`, [clientPaymentIds]).catch(() => [])
          : Promise.resolve([]),
        clientInventoryIds.length > 0
          ? executePg(`SELECT id FROM inventory_items WHERE id = ANY($1)`, [clientInventoryIds]).catch(() => [])
          : Promise.resolve([]),
        clientRepIds.length > 0
          ? executePg(`SELECT id FROM reps WHERE id = ANY($1)`, [clientRepIds]).catch(() => [])
          : Promise.resolve([]),
        clientFundIds.length > 0
          ? executePg(`SELECT id FROM cash_funds WHERE id = ANY($1)`, [clientFundIds]).catch(() => [])
          : Promise.resolve([]),
        clientCustomerListIds.length > 0
          ? executePg(`SELECT id FROM customer_lists WHERE id = ANY($1)`, [clientCustomerListIds]).catch(() => [])
          : Promise.resolve([]),
        clientEmployeeIds.length > 0
          ? executePg(`SELECT id FROM employees WHERE id = ANY($1)`, [clientEmployeeIds]).catch(() => [])
          : Promise.resolve([]),
        executePg(`SELECT record_id FROM deleted_records`).catch(() => []),
      ]);

      const deletedSet = new Set((deletedRecordsRows || []).map((r: any) => String(r.record_id)));

      const foundContractSet = new Set((existingContracts || []).map((r: any) => String(r.id)));
      const foundPaymentSet = new Set((existingPayments || []).map((r: any) => String(r.id)));
      const foundInventorySet = new Set((existingInventory || []).map((r: any) => String(r.id)));
      const foundRepSet = new Set((existingReps || []).map((r: any) => String(r.id)));
      const foundFundSet = new Set((existingFunds || []).map((r: any) => String(r.id)));
      const foundCustomerListSet = new Set((existingCustomerLists || []).map((r: any) => String(r.id)));
      const foundEmployeeSet = new Set((existingEmployees || []).map((r: any) => String(r.id)));

      // Check fileDb backup as well if pg was temporarily cold
      const fileDbContracts = new Set((fileDb.get<any>("contracts") || []).map((c: any) => String(c.id)));
      const fileDbPayments = new Set((fileDb.get<any>("payments") || []).map((p: any) => String(p.id)));
      const fileDbInventory = new Set((fileDb.get<any>("inventory") || []).map((i: any) => String(i.id)));
      const fileDbReps = new Set((fileDb.get<any>("reps") || []).map((r: any) => String(r.id)));
      const fileDbFunds = new Set((fileDb.get<any>("funds") || []).map((f: any) => String(f.id)));
      const fileDbCustomerLists = new Set((fileDb.get<any>("customer_lists") || []).map((cl: any) => String(cl.id)));
      const fileDbEmployees = new Set((fileDb.get<any>("employees") || []).map((e: any) => String(e.id)));

      for (const id of clientContractIds) {
        if (!foundContractSet.has(id) && fileDbContracts.has(id)) {
          foundContractSet.add(id);
        }
      }
      for (const id of clientPaymentIds) {
        if (!foundPaymentSet.has(id) && fileDbPayments.has(id)) {
          foundPaymentSet.add(id);
        }
      }
      for (const id of clientInventoryIds) {
        if (!foundInventorySet.has(id) && fileDbInventory.has(id)) {
          foundInventorySet.add(id);
        }
      }
      for (const id of clientRepIds) {
        if (!foundRepSet.has(id) && fileDbReps.has(id)) {
          foundRepSet.add(id);
        }
      }
      for (const id of clientFundIds) {
        if (!foundFundSet.has(id) && fileDbFunds.has(id)) {
          foundFundSet.add(id);
        }
      }
      for (const id of clientCustomerListIds) {
        if (!foundCustomerListSet.has(id) && fileDbCustomerLists.has(id)) {
          foundCustomerListSet.add(id);
        }
      }
      for (const id of clientEmployeeIds) {
        if (!foundEmployeeSet.has(id) && fileDbEmployees.has(id)) {
          foundEmployeeSet.add(id);
        }
      }

      // Filter out deleted records so they don't count as missing
      const missingContractIds = clientContractIds.filter((id) => !foundContractSet.has(id) && !deletedSet.has(id));
      const missingPaymentIds = clientPaymentIds.filter((id) => !foundPaymentSet.has(id) && !deletedSet.has(id));
      const missingInventoryIds = clientInventoryIds.filter((id) => !foundInventorySet.has(id) && !deletedSet.has(id));
      const missingRepIds = clientRepIds.filter((id) => !foundRepSet.has(id) && !deletedSet.has(id));
      const missingFundIds = clientFundIds.filter((id) => !foundFundSet.has(id) && !deletedSet.has(id));
      const missingCustomerListIds = clientCustomerListIds.filter((id) => !foundCustomerListSet.has(id) && !deletedSet.has(id));
      const missingEmployeeIds = clientEmployeeIds.filter((id) => !foundEmployeeSet.has(id) && !deletedSet.has(id));

      const totalMissing =
        missingContractIds.length +
        missingPaymentIds.length +
        missingInventoryIds.length +
        missingRepIds.length +
        missingFundIds.length +
        missingCustomerListIds.length +
        missingEmployeeIds.length;

      const matched = totalMissing === 0;

      // Query total active count on the server to detect if other reps added records
      let serverContractCount = foundContractSet.size;
      let serverPaymentCount = foundPaymentSet.size;
      try {
        const [cCountRes, pCountRes] = await Promise.all([
          executePg(`SELECT COUNT(*) as count FROM sales WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = sales.id AND (dr.table_name = 'sales' OR dr.table_name = 'contracts' OR dr.table_name = 'unknown'))`).catch(() => []),
          executePg(`SELECT COUNT(*) as count FROM payments WHERE NOT EXISTS (SELECT 1 FROM deleted_records dr WHERE dr.record_id = payments.id AND (dr.table_name = 'payments' OR dr.table_name = 'unknown'))`).catch(() => []),
        ]);
        if (cCountRes?.[0]?.count) serverContractCount = Math.max(serverContractCount, Number(cCountRes[0].count));
        if (pCountRes?.[0]?.count) serverPaymentCount = Math.max(serverPaymentCount, Number(pCountRes[0].count));
      } catch (cntErr) {}

      const hasNewServerData = serverContractCount > clientContractIds.length || serverPaymentCount > clientPaymentIds.length;

      res.json({
        success: true,
        matched,
        totalMissing,
        missingContractIds,
        missingPaymentIds,
        missingInventoryIds,
        missingRepIds,
        missingFundIds,
        missingCustomerListIds,
        missingEmployeeIds,
        confirmedContractCount: foundContractSet.size,
        confirmedPaymentCount: foundPaymentSet.size,
        serverContractCount,
        serverPaymentCount,
        hasNewServerData,
        deletedRecordIds: Array.from(deletedSet),
        syncVersion: globalSyncVersion,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, matched: false });
    }
  });

  app.get("/api/sync/version", async (req, res) => {
    try {
      if (isPgConfigured()) {
        const rows = await executePg("SELECT value FROM system_settings WHERE key = 'sync_version' LIMIT 1").catch(() => []);
        if (rows && rows.length > 0 && rows[0].value) {
          const v = Number(rows[0].value);
          if (v > globalSyncVersion) {
            globalSyncVersion = v;
          }
        }
      }
    } catch (e) {}
    res.json({
      success: true,
      syncVersion: globalSyncVersion,
      timestamp: Date.now(),
    });
  });

  app.post("/api/sync/beacon", async (req, res) => {
    try {
      let actions: any[] = [];
      if (Buffer.isBuffer(req.body)) {
        try {
          const parsed = JSON.parse(req.body.toString('utf8'));
          actions = Array.isArray(parsed?.actions) ? parsed.actions : (Array.isArray(parsed) ? parsed : []);
        } catch (e) {}
      } else if (typeof req.body === 'string') {
        try {
          const parsed = JSON.parse(req.body);
          actions = Array.isArray(parsed?.actions) ? parsed.actions : (Array.isArray(parsed) ? parsed : []);
        } catch (e) {}
      } else if (req.body && typeof req.body === 'object') {
        actions = Array.isArray(req.body?.actions) ? req.body.actions : (Array.isArray(req.body) ? req.body : []);
      }

      if (actions.length === 0) {
        return res.json({ success: true, count: 0, processedIds: [] });
      }

      // 1. Bulk lookup all deleted records in a single query
      const candidateIds = actions.map((a: any) => a?.payload?.id || (typeof a?.payload === 'string' ? a.payload : null)).filter(Boolean);
      let deletedSet = new Set<string>();
      if (candidateIds.length > 0) {
        const deletedRows = await executePg(
          `SELECT record_id FROM deleted_records WHERE record_id = ANY($1)`,
          [candidateIds]
        ).catch(() => []);
        if (Array.isArray(deletedRows)) {
          deletedSet = new Set(deletedRows.map((r: any) => r.record_id));
        }
      }

      const affectedContractIds = new Set<string>();
      const processedIds: string[] = [];

      // Partition actions into Payments, Contracts, Deletes, and Others for maximum batch speed
      const paymentActions: any[] = [];
      const contractActions: any[] = [];
      const otherActions: any[] = [];

      for (const act of actions) {
        const targetId = act?.payload?.id || (typeof act?.payload === 'string' ? act?.payload : null);
        const isDelete = act?.type?.startsWith('DELETE_');

        if (!isDelete && targetId && deletedSet.has(targetId)) {
          if (act?.id) processedIds.push(act.id);
          continue;
        }

        if (act?.type === 'CREATE_PAYMENT' || act?.type === 'UPDATE_PAYMENT') {
          paymentActions.push(act);
        } else if (act?.type === 'CREATE_CONTRACT') {
          contractActions.push(act);
        } else {
          otherActions.push(act);
        }
      }

      // 2. High-Performance Bulk Upsert for Payments (jsonb_to_recordset in 1 single SQL statement)
      if (paymentActions.length > 0) {
        const paymentRows = paymentActions.map((act) => {
          const p = act.payload || {};
          const amt = Number(p.amount ?? p.amountPaid ?? p.amount_paid) || 0;
          const cId = p.contractId ?? p.contract_id ?? '';
          const cName = p.customerName ?? p.customer_name ?? '';
          const pDate = p.paymentDate ?? p.payment_date ?? new Date().toISOString().split('T')[0];
          const pNote = p.note ?? p.notes ?? '';
          const rName = p.repName ?? p.rep_name ?? '';
          const fId = p.fundId ?? p.fund_id ?? null;
          const cAt = p.createdAt ?? p.created_at ?? new Date().toISOString();
          const isEd = Boolean(p.isEdited ?? p.is_edited);

          if (cId) affectedContractIds.add(cId);

          try {
            fileDb.upsert("payments", {
              id: p.id,
              contractId: cId,
              customerName: cName,
              amount: amt,
              amountPaid: amt,
              paymentDate: pDate,
              note: pNote,
              repName: rName,
              fundId: fId,
              createdAt: cAt,
              isEdited: isEd,
            });
          } catch (e) {}

          return {
            id: String(p.id),
            contract_id: String(cId),
            customer_name: String(cName),
            amount: amt,
            amount_paid: amt,
            payment_date: String(pDate),
            note: String(pNote),
            rep_name: String(rName),
            fund_id: fId ? String(fId) : null,
            created_at: String(cAt),
            is_edited: isEd,
          };
        }).filter((r) => r.id);

        const uniquePaymentRowsMap = new Map<string, any>();
        for (const row of paymentRows) {
          if (row && row.id) {
            uniquePaymentRowsMap.set(row.id, row);
          }
        }
        const dedupedPaymentRows = Array.from(uniquePaymentRowsMap.values());

        if (dedupedPaymentRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO payments (
                id, contract_id, customer_name, amount, amount_paid,
                payment_date, note, rep_name, fund_id, created_at, is_edited
              )
              SELECT
                x.id,
                x.contract_id,
                x.customer_name,
                COALESCE(x.amount, 0),
                COALESCE(x.amount_paid, x.amount, 0),
                x.payment_date,
                x.note,
                x.rep_name,
                x.fund_id,
                COALESCE(x.created_at, NOW()::text),
                COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text,
                contract_id text,
                customer_name text,
                amount double precision,
                amount_paid double precision,
                payment_date text,
                note text,
                rep_name text,
                fund_id text,
                created_at text,
                is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                contract_id = EXCLUDED.contract_id,
                customer_name = EXCLUDED.customer_name,
                amount = EXCLUDED.amount,
                amount_paid = EXCLUDED.amount_paid,
                payment_date = EXCLUDED.payment_date,
                note = EXCLUDED.note,
                rep_name = EXCLUDED.rep_name,
                fund_id = EXCLUDED.fund_id,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedPaymentRows)]);

            for (const row of dedupedPaymentRows) {
              if (row.amount > 0) {
                const targetFundId = await resolveFundIdForPayment(row.fund_id, row.contract_id);
                if (targetFundId) {
                  await recordPaymentFundAdjustment(
                    row.id,
                    targetFundId,
                    row.amount,
                    row.customer_name || '',
                    row.rep_name || '',
                    row.payment_date || '',
                    false
                  ).catch(() => {});
                }
              }
            }

            for (const act of paymentActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkPayErr) {
            console.warn('[Beacon Sync] Bulk payment upsert error, running fallback:', bulkPayErr);
            for (const act of paymentActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {}
            }
          }
        }
      }

      // 3. High-Performance Bulk Upsert for Contracts (jsonb_to_recordset in 1 single SQL statement)
      if (contractActions.length > 0) {
        const contractRows = contractActions.map((act) => {
          const c = act.payload || {};
          if (c.id && (String(c.id).startsWith('pay_') || String(c.id).startsWith('ft_') || String(c.id).startsWith('emptx_') || String(c.id).startsWith('conflict_'))) {
            return null;
          }
          const totalPrice = Number(c.totalPrice ?? c.total_price) || 0;
          const adv = Number(c.advancePayment ?? c.advance_payment) || 0;
          const paid = Number(c.totalPaid ?? c.total_paid) || 0;
          const rem = Math.max(0, totalPrice - adv - paid);
          const daily = Number(c.dailyInstallment ?? c.daily_installment) || 0;
          const stat = rem <= 0 ? 'completed' : (c.status || 'active');

          if (c.id) affectedContractIds.add(c.id);

          try {
            fileDb.upsert("contracts", {
              ...c,
              totalPrice,
              advancePayment: adv,
              totalPaid: paid,
              remainingBalance: rem,
              dailyInstallment: daily,
              status: stat,
            });
          } catch (e) {}

          return {
            id: String(c.id),
            customer_name: String(c.customerName ?? c.customer_name ?? ''),
            customer_phone: String(c.customerPhone ?? c.customer_phone ?? ''),
            customer_address: c.customerAddress ?? c.customer_address ?? null,
            item_id: c.itemId ?? c.item_id ?? null,
            item_name: String(c.itemName ?? c.item_name ?? ''),
            item_quantity: Number(c.itemQuantity ?? c.item_quantity) || 1,
            purchase_price: Number(c.purchasePrice ?? c.purchase_price) || 0,
            list_id: c.listId ?? c.list_id ?? null,
            list_name: c.listName ?? c.list_name ?? null,
            total_price: totalPrice,
            advance_payment: adv,
            remaining_balance: rem,
            daily_installment: daily,
            start_date: String(c.startDate ?? c.start_date ?? new Date().toISOString().split('T')[0]),
            notes: c.notes ?? null,
            status: stat,
            last_payment_date: c.lastPaymentDate ?? c.last_payment_date ?? null,
            total_paid: paid,
            rep_name: c.repName ?? c.rep_name ?? null,
            created_at: String(c.createdAt ?? c.created_at ?? new Date().toISOString()),
            completed_at: c.completedAt ?? c.completed_at ?? null,
            updated_at: c.updatedAt ?? c.updated_at ?? new Date().toISOString(),
            is_edited: Boolean(c.isEdited ?? c.is_edited),
          };
        }).filter((r) => r.id);

        const uniqueContractRowsMap = new Map<string, any>();
        for (const row of contractRows) {
          if (row && row.id) {
            uniqueContractRowsMap.set(row.id, row);
          }
        }
        const dedupedContractRows = Array.from(uniqueContractRowsMap.values());

        if (dedupedContractRows.length > 0) {
          try {
            await executePg(`
              INSERT INTO sales (
                id, customer_name, customer_phone, customer_address,
                item_id, item_name, item_quantity, purchase_price,
                list_id, list_name, total_price, advance_payment,
                remaining_balance, daily_installment, start_date, notes,
                status, last_payment_date, total_paid, rep_name,
                created_at, completed_at, updated_at, is_edited
              )
              SELECT
                x.id, x.customer_name, x.customer_phone, x.customer_address,
                x.item_id, x.item_name, COALESCE(x.item_quantity, 1), COALESCE(x.purchase_price, 0),
                x.list_id, x.list_name, COALESCE(x.total_price, 0), COALESCE(x.advance_payment, 0),
                COALESCE(x.remaining_balance, 0), COALESCE(x.daily_installment, 0), COALESCE(x.start_date, NOW()::date::text), x.notes,
                COALESCE(x.status, 'active'), x.last_payment_date, COALESCE(x.total_paid, 0), x.rep_name,
                COALESCE(x.created_at, NOW()::text), x.completed_at, x.updated_at, COALESCE(x.is_edited, false)
              FROM jsonb_to_recordset($1::jsonb) AS x(
                id text, customer_name text, customer_phone text, customer_address text,
                item_id text, item_name text, item_quantity integer, purchase_price double precision,
                list_id text, list_name text, total_price double precision, advance_payment double precision,
                remaining_balance double precision, daily_installment double precision, start_date text, notes text,
                status text, last_payment_date text, total_paid double precision, rep_name text,
                created_at text, completed_at text, updated_at text, is_edited boolean
              )
              ON CONFLICT (id) DO UPDATE SET
                customer_name = COALESCE(NULLIF(EXCLUDED.customer_name, ''), sales.customer_name),
                customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), sales.customer_phone),
                customer_address = COALESCE(EXCLUDED.customer_address, sales.customer_address),
                item_id = COALESCE(EXCLUDED.item_id, sales.item_id),
                item_name = COALESCE(NULLIF(EXCLUDED.item_name, ''), sales.item_name),
                item_quantity = CASE WHEN EXCLUDED.item_quantity > 0 THEN EXCLUDED.item_quantity ELSE sales.item_quantity END,
                purchase_price = CASE WHEN EXCLUDED.purchase_price > 0 THEN EXCLUDED.purchase_price ELSE sales.purchase_price END,
                list_id = COALESCE(EXCLUDED.list_id, sales.list_id),
                list_name = COALESCE(EXCLUDED.list_name, sales.list_name),
                total_price = CASE WHEN EXCLUDED.total_price > 0 THEN EXCLUDED.total_price ELSE sales.total_price END,
                advance_payment = CASE WHEN EXCLUDED.advance_payment > 0 THEN EXCLUDED.advance_payment ELSE sales.advance_payment END,
                remaining_balance = EXCLUDED.remaining_balance,
                daily_installment = CASE WHEN EXCLUDED.daily_installment > 0 THEN EXCLUDED.daily_installment ELSE sales.daily_installment END,
                start_date = COALESCE(NULLIF(EXCLUDED.start_date, ''), sales.start_date),
                notes = COALESCE(EXCLUDED.notes, sales.notes),
                status = EXCLUDED.status,
                last_payment_date = COALESCE(EXCLUDED.last_payment_date, sales.last_payment_date),
                total_paid = EXCLUDED.total_paid,
                rep_name = COALESCE(NULLIF(EXCLUDED.rep_name, ''), sales.rep_name),
                completed_at = COALESCE(EXCLUDED.completed_at, sales.completed_at),
                updated_at = EXCLUDED.updated_at,
                is_edited = EXCLUDED.is_edited
            `, [JSON.stringify(dedupedContractRows)]);

            for (const act of contractActions) {
              if (act?.id) processedIds.push(act.id);
            }
          } catch (bulkContractErr) {
            console.warn('[Beacon Sync] Bulk contract upsert error, running fallback:', bulkContractErr);
            for (const act of contractActions) {
              try {
                const ok = await processSingleSyncAction(act, true);
                if (ok && act?.id) processedIds.push(act.id);
              } catch (e) {}
            }
          }
        }
      }

      // 4. Process other actions
      if (otherActions.length > 0) {
        for (const act of otherActions) {
          try {
            const ok = await processSingleSyncAction(act, true);
            if (ok && act?.id) processedIds.push(act.id);
            const relatedContractId = act?.payload?.contractId || act?.payload?.contract_id || (act?.type?.includes('CONTRACT') ? act?.payload?.id : null);
            if (relatedContractId) affectedContractIds.add(relatedContractId);
          } catch (actErr) {
            console.warn('Beacon action item warning:', act?.id, actErr);
          }
        }
      }

      if (affectedContractIds.size > 0) {
        const cIds = Array.from(affectedContractIds).filter(Boolean);
        try {
          await executePg(`
            UPDATE sales c
            SET
              total_paid = LEAST(GREATEST(0, c.total_price - c.advance_payment), COALESCE(p.sum_paid, 0)),
              remaining_balance = GREATEST(0, c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)),
              status = CASE
                WHEN (c.total_price - c.advance_payment - COALESCE(p.sum_paid, 0)) <= 0 THEN 'completed'
                ELSE 'active'
              END
            FROM (
              SELECT contract_id, SUM(amount_paid) as sum_paid
              FROM payments
              WHERE contract_id = ANY($1)
              GROUP BY contract_id
            ) p
            WHERE c.id = p.contract_id AND c.id = ANY($1)
          `, [cIds]).catch(() => {});

          await executePg(`
            UPDATE sales
            SET
              total_paid = 0,
              remaining_balance = GREATEST(0, total_price - advance_payment),
              status = CASE WHEN (total_price - advance_payment) <= 0 THEN 'completed' ELSE 'active' END
            WHERE id = ANY($1) AND NOT EXISTS (SELECT 1 FROM payments WHERE contract_id = sales.id)
          `, [cIds]).catch(() => {});
        } catch (balErr) {}
      }

      bumpSyncVersion();
      res.json({ success: true, count: processedIds.length, processedIds });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} in use, exiting cleanly for supervisor restart.`);
      process.exit(1);
    } else {
      console.error("Server error:", err);
    }
  });

  process.on("SIGTERM", () => {
    server.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
  });
}

startServer();
