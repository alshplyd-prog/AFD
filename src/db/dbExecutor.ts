import { createPool, resetPool } from './index.ts';
import { fileDb } from './fileDb.ts';
import { initializeDatabaseSchema } from './init.ts';

export const isPgConfigured = () => {
  return true;
};

class AsyncSemaphore {
  private tasks: (() => void)[] = [];
  private count = 0;
  private max: number;
  constructor(max: number) {
    this.max = max;
  }

  async acquire(): Promise<void> {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    await new Promise<void>((resolve) => this.tasks.push(resolve));
    this.count++;
  }

  release(): void {
    this.count--;
    if (this.tasks.length > 0) {
      const next = this.tasks.shift();
      if (next) next();
    }
  }
}

const pgSemaphore = new AsyncSemaphore(8);

export async function executePg(sql: string, params: any[] = []): Promise<any[]> {
  await pgSemaphore.acquire();
  try {
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const currentPool = createPool();
        const res = await currentPool.query(sql, params);
        return res.rows || [];
      } catch (e: any) {
        attempts++;
        const errStr = (e?.message || '').toLowerCase();
        const isConnError = errStr.includes('econnreset') || 
                            errStr.includes('etimedout') || 
                            errStr.includes('timeout') || 
                            errStr.includes('terminated') || 
                            errStr.includes('closed') || 
                            errStr.includes('connection');
        const isMaxConn = errStr.includes('emaxconnsession') || 
                          errStr.includes('too many clients') || 
                          errStr.includes('connection limit');

        if (isConnError || isMaxConn) {
          // Immediately reset dead pool reference so fresh connection will be initiated
          resetPool();
          if (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, attempts * 500 + Math.random() * 300));
            continue;
          }
        }

        if (e.message && e.message.includes('does not exist')) {
          try {
            if (e.message.includes('avatar_url') && e.message.includes('reps')) {
              const currentPool = createPool();
              await currentPool.query('ALTER TABLE reps ADD COLUMN IF NOT EXISTS avatar_url TEXT;').catch(() => {});
              const resRetry = await currentPool.query(sql, params);
              return resRetry.rows || [];
            }
            if (e.message.includes('latitude') || e.message.includes('longitude') || e.message.includes('location_address') || e.message.includes('location_updated_at')) {
              const currentPool = createPool();
              await currentPool.query(`
                ALTER TABLE sales ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
                ALTER TABLE sales ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
                ALTER TABLE sales ADD COLUMN IF NOT EXISTS location_address TEXT;
                ALTER TABLE sales ADD COLUMN IF NOT EXISTS location_updated_at TEXT;
                ALTER TABLE customers ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
                ALTER TABLE customers ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
                ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_address TEXT;
                DROP VIEW IF EXISTS contracts CASCADE;
                CREATE VIEW contracts AS 
                SELECT 
                  id, customer_id, customer_name, customer_phone, customer_address,
                  latitude, longitude, location_address, location_updated_at,
                  item_id, item_name, item_quantity, purchase_price,
                  list_id, list_name, total_price, advance_payment,
                  remaining_balance, daily_installment, start_date, notes,
                  status, last_payment_date, total_paid, rep_name,
                  created_at, completed_at, updated_at, is_edited
                FROM sales;
              `).catch(() => {});
              const resRetry = await currentPool.query(sql, params);
              return resRetry.rows || [];
            }
            if (e.message.includes('funds') && (e.message.includes('relation') || e.message.includes('table'))) {
              const currentPool = createPool();
              await currentPool.query('CREATE OR REPLACE VIEW funds AS SELECT * FROM cash_funds;').catch(() => {});
              const resRetry = await currentPool.query(sql, params);
              return resRetry.rows || [];
            }
            await initializeDatabaseSchema();
            const currentPool = createPool();
            const res2 = await currentPool.query(sql, params);
            return res2.rows || [];
          } catch (innerErr) {}
        }

        if (attempts >= maxAttempts) {
          console.warn('PostgreSQL query error after retries (falling back to local data):', e.message);
          throw e;
        }
      }
    }
    return [];
  } finally {
    pgSemaphore.release();
  }
}

export const dbStore = fileDb;
