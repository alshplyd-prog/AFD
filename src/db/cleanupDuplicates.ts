import { executePg, isPgConfigured } from './dbExecutor.ts';
import { fileDb } from './fileDb.ts';
import { normalizeEntityName } from '../lib/nameHelpers.ts';

/**
 * Clean up existing duplicate records in reps, employees, funds, and customer_lists.
 * Keeps the primary record (e.g. admin or earliest ID) and safely merges/reassigns foreign keys.
 * Excludes customers (customers CAN have duplicate names).
 */
export async function cleanupDuplicateEntities() {
  console.log('[Deduplication] Starting cleanup for reps, employees, funds, and customer lists...');

  // 1. REPS DEDUPLICATION
  try {
    let allReps = fileDb.get<any>('reps') || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg('SELECT * FROM reps');
        if (pgRows && pgRows.length > 0) {
          allReps = pgRows;
        }
      } catch (err) {
        console.warn('[Deduplication] Could not fetch reps from PG:', err);
      }
    }

    const repGroups = new Map<string, any[]>();
    for (const r of allReps) {
      const key = normalizeEntityName(r.name);
      if (!key) continue;
      if (!repGroups.has(key)) repGroups.set(key, []);
      repGroups.get(key)!.push(r);
    }

    for (const [key, reps] of repGroups) {
      if (reps.length > 1) {
        console.log(`[Deduplication] Found ${reps.length} duplicate reps for "${key}"`);
        // Sort: admin first, supervisor second, then earliest ID
        reps.sort((a, b) => {
          if (a.role === 'admin' && b.role !== 'admin') return -1;
          if (b.role === 'admin' && a.role !== 'admin') return 1;
          if (a.role === 'supervisor' && b.role !== 'supervisor') return -1;
          if (b.role === 'supervisor' && a.role !== 'supervisor') return 1;
          return (a.id || '').localeCompare(b.id || '');
        });

        const primary = reps[0];
        const duplicates = reps.slice(1);

        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate rep ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg('UPDATE employees SET rep_id = $1 WHERE rep_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('DELETE FROM reps WHERE id = $1', [dup.id]).catch(() => {});
            await executePg('INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING', [dup.id, 'reps']).catch(() => {});
          }
          fileDb.delete('reps', dup.id);
        }
      }
    }
  } catch (err) {
    console.error('[Deduplication] Error cleaning reps:', err);
  }

  // 2. EMPLOYEES DEDUPLICATION
  try {
    let allEmps = fileDb.get<any>('employees') || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg('SELECT * FROM employees');
        if (pgRows && pgRows.length > 0) {
          allEmps = pgRows;
        }
      } catch (err) {
        console.warn('[Deduplication] Could not fetch employees from PG:', err);
      }
    }

    const empGroups = new Map<string, any[]>();
    for (const e of allEmps) {
      const key = normalizeEntityName(e.name);
      if (!key) continue;
      if (!empGroups.has(key)) empGroups.set(key, []);
      empGroups.get(key)!.push(e);
    }

    for (const [key, emps] of empGroups) {
      if (emps.length > 1) {
        console.log(`[Deduplication] Found ${emps.length} duplicate employees for "${key}"`);
        // Sort: prefer one with repId or highest total debt / salary
        emps.sort((a, b) => {
          if (a.repId && !b.repId) return -1;
          if (b.repId && !a.repId) return 1;
          return (Number(b.salary || 0) + Number(b.totalDebt || 0)) - (Number(a.salary || 0) + Number(a.totalDebt || 0));
        });

        const primary = emps[0];
        const duplicates = emps.slice(1);

        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate employee ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg('UPDATE employee_transactions SET employee_id = $1 WHERE employee_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('DELETE FROM employees WHERE id = $1', [dup.id]).catch(() => {});
            await executePg('INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING', [dup.id, 'employees']).catch(() => {});
          }
          fileDb.delete('employees', dup.id);
        }
      }
    }
  } catch (err) {
    console.error('[Deduplication] Error cleaning employees:', err);
  }

  // 3. CASH FUNDS DEDUPLICATION
  try {
    let allFunds = fileDb.get<any>('cash_funds') || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg('SELECT * FROM cash_funds');
        if (pgRows && pgRows.length > 0) {
          allFunds = pgRows;
        }
      } catch (err) {
        console.warn('[Deduplication] Could not fetch funds from PG:', err);
      }
    }

    const fundGroups = new Map<string, any[]>();
    for (const f of allFunds) {
      const key = normalizeEntityName(f.name);
      if (!key) continue;
      if (!fundGroups.has(key)) fundGroups.set(key, []);
      fundGroups.get(key)!.push(f);
    }

    for (const [key, funds] of fundGroups) {
      if (funds.length > 1) {
        console.log(`[Deduplication] Found ${funds.length} duplicate funds for "${key}"`);
        // Sort: highest balance first, or earliest ID
        funds.sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0));

        const primary = funds[0];
        const duplicates = funds.slice(1);

        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate fund ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg('UPDATE contracts SET fund_id = $1 WHERE fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE payments SET fund_id = $1 WHERE fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE sales SET fund_id = $1 WHERE fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE customer_lists SET fund_id = $1 WHERE fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE fund_transactions SET fund_id = $1 WHERE fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE fund_transactions SET target_fund_id = $1 WHERE target_fund_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('DELETE FROM cash_funds WHERE id = $1', [dup.id]).catch(() => {});
            await executePg('INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING', [dup.id, 'cash_funds']).catch(() => {});
          }
          // fileDb updates
          for (const tbl of ['payments', 'customer_lists', 'fund_transactions']) {
            const items = fileDb.get<any>(tbl) || [];
            let changed = false;
            const updated = items.map((it: any) => {
              let c = false;
              const res = { ...it };
              if (res.fundId === dup.id || res.fund_id === dup.id) {
                if (res.fundId) res.fundId = primary.id;
                if (res.fund_id) res.fund_id = primary.id;
                c = true;
              }
              if (res.targetFundId === dup.id || res.target_fund_id === dup.id) {
                if (res.targetFundId) res.targetFundId = primary.id;
                if (res.target_fund_id) res.target_fund_id = primary.id;
                c = true;
              }
              if (c) changed = true;
              return res;
            });
            if (changed) fileDb.setAll(tbl, updated);
          }
          fileDb.delete('cash_funds', dup.id);
          fileDb.delete('funds', dup.id);
        }
      }
    }
  } catch (err) {
    console.error('[Deduplication] Error cleaning funds:', err);
  }

  // 4. CUSTOMER LISTS DEDUPLICATION
  try {
    let allLists = fileDb.get<any>('customer_lists') || [];
    if (isPgConfigured()) {
      try {
        const pgRows = await executePg('SELECT * FROM customer_lists');
        if (pgRows && pgRows.length > 0) {
          allLists = pgRows;
        }
      } catch (err) {
        console.warn('[Deduplication] Could not fetch customer lists from PG:', err);
      }
    }

    const listGroups = new Map<string, any[]>();
    for (const l of allLists) {
      const key = normalizeEntityName(l.name);
      if (!key) continue;
      if (!listGroups.has(key)) listGroups.set(key, []);
      listGroups.get(key)!.push(l);
    }

    for (const [key, lists] of listGroups) {
      if (lists.length > 1) {
        console.log(`[Deduplication] Found ${lists.length} duplicate customer lists for "${key}"`);
        // Sort: prefer list with fundId or earliest ID
        lists.sort((a, b) => {
          if (a.fund_id && !b.fund_id) return -1;
          if (b.fund_id && !a.fund_id) return 1;
          return (a.id || '').localeCompare(b.id || '');
        });

        const primary = lists[0];
        const duplicates = lists.slice(1);

        for (const dup of duplicates) {
          console.log(`[Deduplication] Merging duplicate customer list ${dup.id} into primary ${primary.id} (${primary.name})`);
          if (isPgConfigured()) {
            await executePg('UPDATE contracts SET list_id = $1 WHERE list_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('UPDATE sales SET list_id = $1 WHERE list_id = $2', [primary.id, dup.id]).catch(() => {});
            await executePg('DELETE FROM customer_lists WHERE id = $1', [dup.id]).catch(() => {});
            await executePg('INSERT INTO deleted_records (record_id, table_name) VALUES ($1, $2) ON CONFLICT (record_id) DO NOTHING', [dup.id, 'customer_lists']).catch(() => {});
          }
          // fileDb updates
          for (const tbl of ['contracts', 'sales']) {
            const items = fileDb.get<any>(tbl) || [];
            let changed = false;
            const updated = items.map((it: any) => {
              if (it.listId === dup.id || it.list_id === dup.id) {
                changed = true;
                return { ...it, listId: primary.id, list_id: primary.id, listName: primary.name, list_name: primary.name };
              }
              return it;
            });
            if (changed) fileDb.setAll(tbl, updated);
          }
          fileDb.delete('customer_lists', dup.id);
        }
      }
    }
  } catch (err) {
    console.error('[Deduplication] Error cleaning customer lists:', err);
  }

  // 5. INVENTORY SANITIZATION & CLEANUP
  try {
    if (isPgConfigured()) {
      await executePg(`
        DELETE FROM inventory_items 
        WHERE id LIKE 'emp_%' 
           OR id LIKE 'pay_%' 
           OR id LIKE 'contract_%' 
           OR id LIKE 'ft_%' 
           OR id LIKE 'emptx_%' 
           OR id LIKE 'conflict_%';
      `).catch(() => {});
    }
    const currentInv = fileDb.get<any>('inventory_items') || [];
    const validInv = currentInv.filter((i: any) => 
      i && i.id && (i.id.startsWith('item_') || (!i.id.startsWith('emp_') && !i.id.startsWith('pay_') && !i.id.startsWith('contract_') && !i.id.startsWith('ft_') && !i.id.startsWith('emptx_')))
    );
    if (validInv.length !== currentInv.length) {
      fileDb.setAll('inventory_items', validInv);
    }
  } catch (invErr) {
    console.warn('[Deduplication] Notice cleaning inventory:', invErr);
  }

  // 6. PAYMENTS SANITIZATION & ZERO-AMOUNT CLEANUP
  try {
    if (isPgConfigured()) {
      await executePg(`
        DELETE FROM payments 
        WHERE COALESCE(amount_paid, amount, 0) <= 0 
           OR id LIKE 'contract_%' 
           OR id LIKE 'emp_%' 
           OR id LIKE 'item_%'
           OR id LIKE 'fund_%'
           OR (contract_id IS NOT NULL AND contract_id != '' AND contract_id NOT IN (SELECT id FROM sales UNION SELECT id FROM contracts))
           OR id IN (SELECT record_id FROM deleted_records WHERE table_name = 'payments');
      `).catch(() => {});
    }
    const currentPayments = fileDb.get<any>('payments') || [];
    const validContracts = new Set((fileDb.get<any>('contracts') || []).map((c: any) => c.id).filter(Boolean));
    const validPayments = currentPayments.filter((p: any) => 
      p && p.id && (Number(p.amountPaid ?? p.amount) > 0) &&
      !p.id.startsWith('contract_') && !p.id.startsWith('emp_') && !p.id.startsWith('item_') && !p.id.startsWith('fund_') &&
      (!p.contractId || validContracts.has(p.contractId))
    );
    if (validPayments.length !== currentPayments.length) {
      fileDb.setAll('payments', validPayments);
    }
  } catch (payErr) {
    console.warn('[Deduplication] Notice cleaning payments:', payErr);
  }

  // 7. CASH FUNDS SANITIZATION & EMPTY-NAME CLEANUP
  try {
    if (isPgConfigured()) {
      await executePg(`
        DELETE FROM cash_funds 
        WHERE TRIM(name) = '' 
           OR id LIKE 'pay_%' 
           OR id LIKE 'contract_%' 
           OR id LIKE 'emp_%' 
           OR id LIKE 'item_%' 
           OR id LIKE 'ft_%' 
           OR id LIKE 'emptx_%' 
           OR id LIKE 'conflict_%';
      `).catch(() => {});
    }
    const currentFunds = fileDb.get<any>('cash_funds') || [];
    const validFunds = currentFunds.filter((f: any) => 
      f && f.id && typeof f.name === 'string' && f.name.trim().length > 0 &&
      !f.id.startsWith('pay_') && !f.id.startsWith('contract_') && !f.id.startsWith('emp_') && !f.id.startsWith('item_') && !f.id.startsWith('ft_') && !f.id.startsWith('emptx_') && !f.id.startsWith('conflict_')
    );
    if (validFunds.length !== currentFunds.length) {
      fileDb.setAll('cash_funds', validFunds);
    }
  } catch (fundErr) {
    console.warn('[Deduplication] Notice cleaning cash_funds:', fundErr);
  }

  // 8. CUSTOMER LISTS SANITIZATION & BOGUS CLEANUP
  try {
    if (isPgConfigured()) {
      await executePg(`
        DELETE FROM customer_lists 
        WHERE TRIM(name) = '' OR TRIM(name) = 'قائمة بدون اسم'
           OR id LIKE 'pay_%' 
           OR id LIKE 'contract_%' 
           OR id LIKE 'emp_%' 
           OR id LIKE 'item_%' 
           OR id LIKE 'fundtx_%';
      `).catch(() => {});
    }
    const currentLists = fileDb.get<any>('customer_lists') || [];
    const validLists = currentLists.filter((l: any) => 
      l && l.id && typeof l.name === 'string' && l.name.trim().length > 0 && l.name.trim() !== 'قائمة بدون اسم' &&
      !l.id.startsWith('pay_') && !l.id.startsWith('contract_') && !l.id.startsWith('emp_') && !l.id.startsWith('item_') && !l.id.startsWith('fundtx_')
    );
    if (validLists.length !== currentLists.length) {
      fileDb.setAll('customer_lists', validLists);
    }
  } catch (listErr) {
    console.warn('[Deduplication] Notice cleaning customer_lists:', listErr);
  }

  // 9. SALES & CONTRACTS SANITIZATION
  try {
    if (isPgConfigured()) {
      await executePg(`
        DELETE FROM sales 
        WHERE TRIM(customer_name) = '' 
           OR id LIKE 'pay_%' 
           OR id LIKE 'fund_%' 
           OR id LIKE 'emp_%' 
           OR id LIKE 'item_%' 
           OR id LIKE 'ft_%' 
           OR id LIKE 'emptx_%' 
           OR id LIKE 'conflict_%';
      `).catch(() => {});
    }
    const currentContracts = fileDb.get<any>('contracts') || [];
    const validContracts = currentContracts.filter((c: any) => 
      c && c.id && ((c.customerName && c.customerName.trim().length > 0) || (c.customer_name && c.customer_name.trim().length > 0)) &&
      !c.id.startsWith('pay_') && !c.id.startsWith('fund_') && !c.id.startsWith('emp_') && !c.id.startsWith('item_') && !c.id.startsWith('ft_') && !c.id.startsWith('emptx_') && !c.id.startsWith('conflict_')
    );
    if (validContracts.length !== currentContracts.length) {
      fileDb.setAll('contracts', validContracts);
    }
  } catch (contractErr) {
    console.warn('[Deduplication] Notice cleaning sales/contracts:', contractErr);
  }

  console.log('[Deduplication] Deduplication cleanup finished successfully.');
}
