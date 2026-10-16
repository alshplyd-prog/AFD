import dotenv from 'dotenv';
dotenv.config({ override: true });
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const resetPool = () => {
  if (global._postgresPool) {
    try {
      global._postgresPool.end().catch(() => {});
    } catch (e) {}
    global._postgresPool = undefined;
  }
};

export const createPool = () => {
  if (global._postgresPool) {
    return global._postgresPool;
  }

  // Primary configuration: prefer explicit DB_HOST credentials if available
  let dbUrl = '';
  if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME) {
    dbUrl = `postgresql://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`;
  } else if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('supabase.co') && !process.env.DATABASE_URL.includes('[YOUR-PASSWORD]') && !process.env.DATABASE_URL.includes('YOUR-PASSWORD')) {
    dbUrl = process.env.DATABASE_URL;
  } else {
    // Direct production Hostinger PostgreSQL database
    dbUrl = 'postgresql://app_user:vOY9)hN0)5egF3cL@72.62.158.128:5432/app_database';
  }

  const newPool = new Pool({
    connectionString: dbUrl,
    ssl: false,
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 20000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5000,
  });

  newPool.on('error', (err) => {
    console.warn('PostgreSQL pool client connection warning:', err?.message || err);
    // Reset pool reference so next query gets a fresh connection
    resetPool();
  });

  global._postgresPool = newPool;
  return global._postgresPool;
};

const pool = createPool();
export const db = drizzle(pool, { schema });
