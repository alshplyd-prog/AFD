import { PaymentRecord, InstallmentContract, CustomerList } from '../types';
import { getPaymentReceiptBalances } from './paymentCalculator';
import { formatPaymentTime, getLocalDateString, getPaymentFormattedDateAndTime } from './dateUtils';
import { numberToArabicWords } from './tafqeet';
import { DEFAULT_DUPLICATE_RECEIPT_WARNING } from './bluetoothPrinter';
import { formatIraqiPhoneForWhatsApp } from './pdfShareHelper';
import { normalizeEntityName } from './nameHelpers';
import { getPublicShareBaseUrl } from './apiConfig';

export interface PreparedReceiptData {
  shopTitle: string;
  receiptNo: string | number;
  customerName: string;
  customerPhone?: string;
  itemName: string;
  totalPrice: number;
  totalPaid: number;
  remainingBalance: number;
  paidAmount: number;
  amountInWords: string;
  dateStr: string;
  timeStr: string;
  repName?: string;
  isDuplicate?: boolean;
  warningNote?: string;
  template?: 'template_1' | 'template_2';
  receiptUrl: string;
  messageText: string;
  cleanPhone: string | null;
}

/**
 * Generates the full receipt data, direct viewer URL, and formatted WhatsApp message.
 */
export function preparePaymentReceiptWhatsApp({
  payment,
  contract,
  allPayments = [],
  customerLists = [],
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
  customerLists?: CustomerList[];
}): PreparedReceiptData {
  const dStr = payment.paymentDate ? getLocalDateString(payment.paymentDate) : getLocalDateString();
  const tStr = formatPaymentTime(payment, true);
  const snapshot = getPaymentReceiptBalances(payment, contract, allPayments);

  const targetListId =
    (contract as any)?.listId ||
    (contract as any)?.list_id ||
    (payment as any)?.listId ||
    (payment as any)?.list_id;
  const rawListName =
    (contract as any)?.listName ||
    (contract as any)?.list_name ||
    (payment as any)?.listName ||
    (payment as any)?.list_name;
  const normListName = rawListName ? String(rawListName).trim().toLowerCase() : '';

  const linkedList =
    (customerLists || []).find((l) => {
      const lId = l.id || (l as any)._id;
      const lName = l.name ? String(l.name).trim().toLowerCase() : '';
      if (targetIdMatches(lId, targetListId)) return true;
      if (normListName && lName === normListName) return true;
      return false;
    });

  function targetIdMatches(lId: any, tId: any) {
    return tId && String(lId) === String(tId);
  }

  const receiptTemplate: 'template_1' | 'template_2' =
    (linkedList as any)?.receiptTemplate ||
    (linkedList as any)?.receipt_template ||
    (contract as any)?.receiptTemplate ||
    (contract as any)?.receipt_template ||
    'template_1';

  const customerName = payment.customerName || contract?.customerName || 'زبون';
  const customerPhone = contract?.customerPhone || (payment as any)?.customerPhone || '';
  const cleanPhone = formatIraqiPhoneForWhatsApp(customerPhone);
  const itemName = (receiptTemplate === 'template_2' ? '' : contract?.itemName) || contract?.itemName || 'قسط';
  const repName = payment.repName || contract?.repName || '';

  const amountInWords = numberToArabicWords(snapshot.paidAmount);

  // Build the direct short view URL pointing to the standalone Receipt View
  const origin = getPublicShareBaseUrl();
  const cleanPaymentId = (payment.id || '').trim();
  const searchParams = new URLSearchParams({
    view_receipt: 'true',
    id: payment.id || '',
    contract_id: contract?.id || payment.contractId || '',
    c: customerName,
    p_phone: customerPhone || '',
    item: contract?.itemName || '',
    price: String(snapshot.totalPrice || contract?.totalPrice || 0),
    paid_so_far: String(snapshot.totalPaid || 0),
    remaining: String(snapshot.remainingBalance || 0),
    paid_now: String(snapshot.paidAmount || payment.amountPaid || 0),
    words: amountInWords,
    d: dStr,
    tm: tStr,
    rep: repName,
    tpl: receiptTemplate,
  });

  const receiptUrl = cleanPaymentId
    ? `${origin}/r/${encodeURIComponent(cleanPaymentId)}`
    : `${origin}/?${searchParams.toString()}`;

  let messageText = `اسم الزبون: ${customerName}
الواصل: ${snapshot.totalPaid.toLocaleString('en-US')} د.ع
المبلغ رقماً: ${snapshot.paidAmount.toLocaleString('en-US')} د.ع
المبلغ كتابة: ${amountInWords}
الباقي: ${snapshot.remainingBalance.toLocaleString('en-US')} د.ع
التاريخ: ${dStr}
رابط الوصل:
${receiptUrl}`.trim();

  return {
    shopTitle: '',
    receiptNo: receiptTemplate === 'template_2' ? '' : '1',
    customerName,
    customerPhone,
    itemName,
    totalPrice: snapshot.totalPrice,
    totalPaid: snapshot.totalPaid,
    remainingBalance: snapshot.remainingBalance,
    paidAmount: snapshot.paidAmount,
    amountInWords,
    dateStr: dStr,
    timeStr: tStr,
    repName,
    isDuplicate: true,
    warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
    template: receiptTemplate,
    receiptUrl,
    messageText,
    cleanPhone,
  };
}

/**
 * Triggers sending payment receipt directly to customer's WhatsApp.
 * If phone number is missing, prompts the user to enter it.
 */
export function sendPaymentReceiptToWhatsApp({
  payment,
  contract,
  allPayments = [],
  customerLists = [],
  customPhone,
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
  customerLists?: CustomerList[];
  customPhone?: string;
}): boolean {
  const prepared = preparePaymentReceiptWhatsApp({
    payment,
    contract,
    allPayments,
    customerLists,
  });

  let phoneToUse = customPhone ? formatIraqiPhoneForWhatsApp(customPhone) : prepared.cleanPhone;

  if (!phoneToUse) {
    const input = window.prompt(
      `الزبون (${prepared.customerName}) لا يملك رقم هاتف مسجل.\nيرجى كتابة رقم هاتف الزبون (أو رقم الواتساب):`,
      ''
    );
    if (!input || !input.trim()) {
      return false;
    }
    phoneToUse = formatIraqiPhoneForWhatsApp(input.trim());
    if (!phoneToUse) {
      alert('رقم الهاتف المدخل غير صالح. يرجى التأكد من الرقم والمحاولة مرة أخرى.');
      return false;
    }
  }

  const encodedText = encodeURIComponent(prepared.messageText);
  const waUrl = `https://wa.me/${phoneToUse}?text=${encodedText}`;
  const waAppUrl = `whatsapp://send?phone=${phoneToUse}&text=${encodedText}`;

  try {
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (isMobile) {
      window.location.href = waAppUrl;
      setTimeout(() => {
        window.open(waUrl, '_blank');
      }, 500);
    } else {
      window.open(waUrl, '_blank');
    }
    return true;
  } catch (e) {
    window.open(waUrl, '_blank');
    return true;
  }
}
