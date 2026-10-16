import { PaymentRecord, InstallmentContract } from '../types';
import { getLocalDateString } from './dateUtils';
import { normalizeEntityName } from './nameHelpers';

export interface CustomerStatementResult {
  totalPaid: number;
  remaining: number;
  totalInstallment: number;
  paymentsCount: number;
  filteredPayments: PaymentRecord[];
}

export interface CustomerSubCollectionTx {
  id: string;
  customerId: string;
  type: 'invoice' | 'payment';
  amount: number;
  date: string;
  description?: string;
  repName?: string;
}

export interface SubCollectionStatementResult {
  totalSales: number;
  totalPayments: number;
  remaining: number;
  transactions: CustomerSubCollectionTx[];
}

/**
 * دالة حساب كشف حساب الزبون بناءً على المعرف ونطاق التواريخ المحددة
 */
export function calculateCustomerStatement(
  customerId: string,
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  payments: PaymentRecord[],
  totalInstallment: number,
  contract?: InstallmentContract
): CustomerStatementResult {
  if (!customerId) {
    return {
      totalPaid: 0,
      remaining: Math.max(0, totalInstallment || 0),
      totalInstallment: totalInstallment || 0,
      paymentsCount: 0,
      filteredPayments: [],
    };
  }

  let totalPaid = 0;
  const filteredPayments: PaymentRecord[] = [];

  const start = startDate && startDate.trim() !== '' ? startDate.split('T')[0] : null;
  const end = endDate && endDate.trim() !== '' ? endDate.split('T')[0] : null;

  const safePayments = Array.isArray(payments) ? payments : [];
  const normalizedTargetId = normalizeEntityName(customerId);
  const normalizedTargetName = contract?.customerName ? normalizeEntityName(contract.customerName) : '';

  for (const p of safePayments) {
    if (!p) continue;
    const isMatch =
      p.contractId === customerId ||
      p.id === customerId ||
      (contract && p.contractId === contract.id) ||
      (p.customerName && normalizedTargetId && normalizeEntityName(p.customerName) === normalizedTargetId) ||
      (p.customerName && normalizedTargetName && normalizeEntityName(p.customerName) === normalizedTargetName);

    if (isMatch) {
      const payDate = p.paymentDate ? p.paymentDate.split('T')[0] : '';

      let inRange = true;
      if (start && payDate && payDate < start) {
        inRange = false;
      }
      if (end && payDate && payDate > end) {
        inRange = false;
      }

      if (inRange) {
        totalPaid += Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0;
        filteredPayments.push(p);
      }
    }
  }

  // If no date filters applied and stored contract totalPaid is higher, preserve the highest figure
  if (!start && !end && contract && (contract.totalPaid || 0) > totalPaid) {
    totalPaid = contract.totalPaid;
  }

  const remaining = Math.max(0, (totalInstallment || 0) - totalPaid);

  return {
    totalPaid,
    remaining,
    totalInstallment: totalInstallment || 0,
    paymentsCount: filteredPayments.length,
    filteredPayments,
  };
}

/**
 * دالة تقرأ حركة التسديدات والمبيعات من sub-collection اسمهم transactions للزبون المحدد
 * وتتحقق من التواريخ: تجمع التسديدات إذا وجدت، وإذا لم تجد تعطي القيمة 0
 */
export async function fetchCustomerSubCollectionStatement(
  customerId: string,
  startDate?: string | null,
  endDate?: string | null,
  fallbackContract?: InstallmentContract,
  fallbackPayments: PaymentRecord[] = []
): Promise<SubCollectionStatementResult> {
  if (!customerId) {
    return { totalSales: 0, totalPayments: 0, remaining: 0, transactions: [] };
  }

  let rawDocs: any[] = [];

  // If local contract provided, build statement from stored contract and payments
  if (rawDocs.length === 0 && fallbackContract) {
    const invDate = fallbackContract.startDate || (fallbackContract.createdAt ? getLocalDateString(fallbackContract.createdAt) : getLocalDateString());
    rawDocs.push({
      id: `inv-${fallbackContract.id}`,
      type: 'invoice',
      amount: fallbackContract.totalPrice || 0,
      date: invDate,
      description: `فاتورة عقد: ${fallbackContract.itemName || 'مبيعات تقسيط'}`,
      repName: fallbackContract.repName || 'مندوب'
    });

    if (fallbackContract.advancePayment && fallbackContract.advancePayment > 0) {
      rawDocs.push({
        id: `adv-${fallbackContract.id}`,
        type: 'payment',
        amount: fallbackContract.advancePayment,
        date: invDate,
        description: 'دفعة مقدمة عند البيع',
        repName: fallbackContract.repName || 'مندوب'
      });
    }

    const normTarget = normalizeEntityName(customerId);
    const normFallbackName = fallbackContract?.customerName ? normalizeEntityName(fallbackContract.customerName) : '';

    fallbackPayments.forEach((p) => {
      const isMatch =
        p.contractId === customerId ||
        (fallbackContract && p.contractId === fallbackContract.id) ||
        (p.customerName && normTarget && normalizeEntityName(p.customerName) === normTarget) ||
        (p.customerName && normFallbackName && normalizeEntityName(p.customerName) === normFallbackName);

      if (isMatch) {
        rawDocs.push({
          id: p.id,
          type: 'payment',
          amount: Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0,
          date: p.paymentDate ? p.paymentDate.split('T')[0] : '',
          description: p.note || 'تسديد قسط',
          repName: p.repName || 'مندوب'
        });
      }
    });
  }

  const start = startDate && startDate.trim() !== '' ? startDate.split('T')[0] : null;
  const end = endDate && endDate.trim() !== '' ? endDate.split('T')[0] : null;

  let totalSales = 0;
  let totalPayments = 0;
  const filteredTx: CustomerSubCollectionTx[] = [];

  for (const item of rawDocs) {
    const itemDate = item.date ? item.date.split('T')[0] : (item.createdAt ? item.createdAt.split('T')[0] : '');

    let inRange = true;
    if (start && itemDate && itemDate < start) inRange = false;
    if (end && itemDate && itemDate > end) inRange = false;

    if (inRange) {
      const amt = Number(item.amount || item.amountPaid || 0);
      const txType = item.type === 'invoice' ? 'invoice' : 'payment';

      if (txType === 'invoice') {
        totalSales += amt;
      } else {
        totalPayments += amt;
      }

      filteredTx.push({
        id: item.id || `tx-${Math.random()}`,
        customerId,
        type: txType,
        amount: amt,
        date: itemDate || getLocalDateString(),
        description: item.description || item.note || (txType === 'invoice' ? 'فاتورة بيع' : 'تسديد قسط'),
        repName: item.repName || 'مندوب'
      });
    }
  }

  const remaining = Math.max(0, totalSales - totalPayments);

  return {
    totalSales,
    totalPayments,
    remaining,
    transactions: filteredTx,
  };
}
