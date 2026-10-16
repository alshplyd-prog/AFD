import fs from 'fs';
import path from 'path';

const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

const DATA_DIR = isNode && typeof process.cwd === 'function' ? path.join(process.cwd(), 'data') : '';

if (isNode && fs.existsSync && !fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function getFilePath(tableName: string) {
  if (isNode && DATA_DIR) {
    return path.join(DATA_DIR, `${tableName}.json`);
  }
  return `${tableName}.json`;
}

function loadTable<T = any>(tableName: string): T[] {
  try {
    if (isNode && fs.existsSync) {
      const file = getFilePath(tableName);
      if (!fs.existsSync(file)) {
        return [];
      }
      const content = fs.readFileSync(file, 'utf-8');
      return JSON.parse(content) || [];
    } else if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`filedb_${tableName}`);
      return stored ? JSON.parse(stored) : [];
    }
  } catch {
    return [];
  }
  return [];
}

function saveTable<T = any>(tableName: string, data: T[]) {
  try {
    if (isNode && fs.writeFileSync) {
      const file = getFilePath(tableName);
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`filedb_${tableName}`, JSON.stringify(data));
    }
  } catch (e) {
    console.error(`Error saving table ${tableName}:`, e);
  }
}

export const fileDb = {
  get: <T = any>(tableName: string): T[] => {
    return loadTable<T>(tableName);
  },

  upsert: <T extends { id: string }>(tableName: string, record: T): T => {
    const records = loadTable<T>(tableName);
    const index = records.findIndex((r) => r.id === record.id);
    if (index >= 0) {
      records[index] = { ...records[index], ...record };
    } else {
      records.push(record);
    }
    saveTable(tableName, records);
    return record;
  },

  update: <T extends { id: string }>(tableName: string, id: string, updates: Partial<T>): boolean => {
    const records = loadTable<T>(tableName);
    const index = records.findIndex((r) => r.id === id);
    if (index >= 0) {
      records[index] = { ...records[index], ...updates };
      saveTable(tableName, records);
      return true;
    }
    return false;
  },

  delete: (tableName: string, id: string): boolean => {
    const records = loadTable<{ id: string }>(tableName);
    const filtered = records.filter((r) => r.id !== id);
    saveTable(tableName, filtered);
    return true;
  },

  setAll: <T = any>(tableName: string, data: T[]): void => {
    saveTable(tableName, data);
  }
};
