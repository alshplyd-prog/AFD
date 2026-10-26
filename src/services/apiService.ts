/**
 * Dedicated API Service Layer
 * Connects the React client to the Node.js backend server via standard REST endpoints.
 */

import { getApiBaseUrl, isNativeOrApkEnvironment } from '../lib/apiConfig';

/**
 * Production VPS backend URL for mobile APK and external environments
 */
export const CLOUD_API_URL = 'https://ais-pre-5x4c6bq6p4ul7njqnkzon5-947254878994.europe-west2.run.app/api';

/**
 * Dynamic API Base URL resolver:
 * - Directs all mobile / APK requests directly to http://72.62.158.128:3000/api
 * - In web browser, uses relative `/api` or custom server
 */
export function getActiveApiUrl(): string {
  if (typeof window !== 'undefined') {
    if (!isNativeOrApkEnvironment()) {
      const custom = getApiBaseUrl();
      if (custom) return `${custom.replace(/\/+$/, '')}/api`;
      return '/api';
    }
    const base = getApiBaseUrl();
    if (base) {
      return `${base.replace(/\/+$/, '')}/api`;
    }
  }
  return CLOUD_API_URL;
}

export const API_BASE_URL = getActiveApiUrl();

// Helper function for all HTTP requests with timeout & error handling
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const baseUrl = getActiveApiUrl();
  const url = `${baseUrl.replace(/\/+$/, '')}/${cleanEndpoint}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (text.trim().toLowerCase().startsWith('<!doctype') || text.trim().toLowerCase().startsWith('<html')) {
        throw new Error('استجابة السيرفر غير صالحة (يبدو أن الخادم أعمل إعادة توجيه أو يعرض صفحة خطأ HTML بدلاً من بيانات JSON)');
      }
      throw new Error(`خطأ في قراءة رد السيرفر`);
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `خطأ في الاتصال بالسيرفر (${response.status})`);
    }

    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بالسيرفر. يرجى التحقق من اتصال الإنترنت.');
    }
    // Fallback: if we were using a relative URL that failed or vice versa, try cloud URL
    if (baseUrl !== CLOUD_API_URL) {
      try {
        const fallbackUrl = `${CLOUD_API_URL}/${cleanEndpoint}`;
        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
          },
          ...options,
        });
        if (fallbackRes.ok) {
          return fallbackRes.json();
        }
      } catch (fallbackErr) {
        // ignore and throw original error
      }
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==========================================
// 1. قسم الزبائن والمبيعات (Customers & Sales)
// ==========================================
export const SalesService = {
  // جلب كافة العقود والمبيعات
  async getAllSales(): Promise<any[]> {
    return apiRequest<any[]>('/contracts');
  },

  // إضافة بيع / عقد جديد
  async createSale(saleData: {
    customerName: string;
    customerPhone: string;
    customerAddress?: string;
    itemName: string;
    totalPrice: number;
    advancePayment: number;
    dailyInstallment: number;
    listId?: string;
    listName?: string;
    notes?: string;
    repId?: string;
    repName?: string;
    startDate?: string;
  }): Promise<any> {
    return apiRequest<any>('/contracts', {
      method: 'POST',
      body: JSON.stringify(saleData),
    });
  },

  // تعديل عقد بيع
  async updateSale(id: string, updatedData: any): Promise<any> {
    return apiRequest<any>(`/contracts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedData),
    });
  },

  // حذف عقد
  async deleteSale(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/contracts/${id}`, {
      method: 'DELETE',
    });
  },
};

// ==========================================
// 2. قسم المدفوعات والتحصيلات (Payments)
// ==========================================
export const PaymentsService = {
  // جلب سجل المدفوعات
  async getPayments(): Promise<any[]> {
    return apiRequest<any[]>('/payments');
  },

  // تسديد دفعة جديدة
  async addPayment(paymentData: {
    contractId: string;
    amount: number;
    receiptNumber?: string;
    repName?: string;
    repId?: string;
    notes?: string;
    fundId?: string;
    paymentMethod?: string;
    createdAt?: string;
  }): Promise<any> {
    return apiRequest<any>('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  },

  // تعديل دفعة
  async updatePayment(paymentId: string, updatedData: any): Promise<any> {
    return apiRequest<any>(`/payments/${paymentId}`, {
      method: 'PUT',
      body: JSON.stringify(updatedData),
    });
  },

  // حذف دفعة
  async deletePayment(paymentId: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/payments/${paymentId}`, {
      method: 'DELETE',
    });
  },
};

// ==========================================
// 3. قسم الأرصدة والصناديق المالية (Funds & Balances)
// ==========================================
export const FundsService = {
  // جلب بيانات الصناديق والأرصدة
  async getFunds(): Promise<any[]> {
    return apiRequest<any[]>('/funds');
  },

  // جلب الحركات المالية
  async getFundTransactions(): Promise<any[]> {
    return apiRequest<any[]>('/fund-transactions');
  },

  // إنشاء حركة مالية (إيداع، سحب، أو تحويل بين الصناديق)
  async createTransaction(txData: {
    fundId: string;
    type: 'deposit' | 'withdraw' | 'transfer';
    amount: number;
    targetFundId?: string;
    notes?: string;
    repId?: string;
    repName?: string;
    createdAt?: string;
  }): Promise<any> {
    return apiRequest<any>('/fund-transactions', {
      method: 'POST',
      body: JSON.stringify(txData),
    });
  },

  // إنشاء صندوق مالي جديد
  async createFund(fundData: { name: string; balance?: number; type?: string; description?: string }): Promise<any> {
    return apiRequest<any>('/funds', {
      method: 'POST',
      body: JSON.stringify(fundData),
    });
  },
};

// ==========================================
// 4. قسم الموظفين والمندوبين (Employees & Reps)
// ==========================================
export const EmployeesService = {
  // جلب الموظفين
  async getEmployees(): Promise<any[]> {
    return apiRequest<any[]>('/employees');
  },

  // جلب المندوبين
  async getReps(): Promise<any[]> {
    return apiRequest<any[]>('/reps');
  },
};

// ==========================================
// 5. المزامنة والتحقق من الإصدار (Sync Version)
// ==========================================
export const SyncService = {
  async getSyncVersion(): Promise<{ success: boolean; syncVersion: number; timestamp: number }> {
    return apiRequest<{ success: boolean; syncVersion: number; timestamp: number }>('/sync/version');
  },
};
