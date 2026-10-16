import { PaymentRecord, InstallmentContract } from '../types';
import { normalizeEntityName } from './nameHelpers';

/**
 * Helper to safely extract a numerical timestamp from a PaymentRecord for chronological sorting.
 */
function getPaymentSortTime(p: PaymentRecord): number {
  if (p.createdAt) {
    const t = new Date(p.createdAt).getTime();
    if (!isNaN(t)) return t;
  }
  if (p.paymentDate) {
    const t = new Date(p.paymentDate).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
}

/**
 * Calculates the exact historical totalPaid and remainingBalance at the specific
 * point in time when a given payment occurred.
 *
 * This ensures that printing or reprinting a past receipt (e.g. yesterday's payment, or any historical installment)
 * reflects the exact cumulative paid amount and remaining balance of that specific payment,
 * rather than today's live balance after subsequent payments.
 */
export function getPaymentReceiptBalances(
  targetPayment: PaymentRecord,
  contract: InstallmentContract | undefined | null,
  allPayments: PaymentRecord[] = []
): {
  totalPaid: number;
  remainingBalance: number;
  paidAmount: number;
  totalPrice: number;
} {
  const paidAmount = Number(targetPayment.amountPaid ?? targetPayment.amount ?? targetPayment.amount_paid) || 0;
  const totalPrice = Number(contract?.totalPrice) || 0;

  if (!contract) {
    return {
      totalPrice,
      totalPaid: targetPayment.totalPaidSnapshot !== undefined ? targetPayment.totalPaidSnapshot : paidAmount,
      remainingBalance: targetPayment.remainingBalanceSnapshot !== undefined ? targetPayment.remainingBalanceSnapshot : 0,
      paidAmount,
    };
  }

  const advancePayment = Number(contract.advancePayment) || 0;
  const netFinanced = Math.max(0, totalPrice - advancePayment);

  // If the record has stored snapshots and they match logical constraints, we can use them:
  // But calculating from sorted history guarantees 100% mathematical integrity across all past records.
  const normCustomerName = contract.customerName ? normalizeEntityName(contract.customerName) : '';
  const safePayments = Array.isArray(allPayments) ? allPayments.filter(Boolean) : [];

  // Filter payments belonging to this contract
  const contractPayments = safePayments.filter((p) => {
    if (!p) return false;
    if (p.contractId && contract.id && p.contractId === contract.id) return true;
    if (p.customerName && normCustomerName && normalizeEntityName(p.customerName) === normCustomerName) return true;
    return false;
  });

  // If the target payment is not in the list (e.g. fresh or not yet synced to array), append it
  if (!contractPayments.some((p) => p.id === targetPayment.id)) {
    contractPayments.push(targetPayment);
  }

  // Sort payments chronologically (oldest to newest)
  const sortedPayments = [...contractPayments].sort((a, b) => {
    const timeA = getPaymentSortTime(a);
    const timeB = getPaymentSortTime(b);
    if (timeA !== timeB) return timeA - timeB;
    // Tie breaker: stable order by id or creation string
    return String(a.createdAt || a.id || '').localeCompare(String(b.createdAt || b.id || ''));
  });

  // Calculate cumulative sum up to and including targetPayment
  let cumulativeSum = 0;
  for (const p of sortedPayments) {
    const amt = Number(p.amountPaid ?? p.amount ?? p.amount_paid) || 0;
    cumulativeSum += amt;
    if (p.id === targetPayment.id) {
      break;
    }
  }

  const historicalTotalPaid = netFinanced > 0 ? Math.min(netFinanced, cumulativeSum) : cumulativeSum;
  const historicalRemaining = Math.max(0, netFinanced - cumulativeSum);

  return {
    totalPrice,
    totalPaid: historicalTotalPaid,
    remainingBalance: historicalRemaining,
    paidAmount,
  };
}
