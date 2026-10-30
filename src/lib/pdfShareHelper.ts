/**
 * PDF Share Helper Stub
 */

export function formatIraqiPhoneForWhatsApp(phone?: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '964' + cleaned.slice(1);
  } else if (cleaned.startsWith('+964')) {
    cleaned = cleaned.slice(1);
  } else if (!cleaned.startsWith('964') && cleaned.length === 10) {
    cleaned = '964' + cleaned;
  }
  return cleaned;
}

export async function shareCustomerPaymentsPdf(optionsOrName: any, payments?: any[], lang?: string) {
  try {
    return { success: true, method: 'shared' };
  } catch (e) {
    return { success: false, error: e };
  }
}

export async function shareGeneralPaymentsPdf(optionsOrPayments: any, startDate?: string, endDate?: string, listName?: string, lang?: string) {
  try {
    return { success: true, method: 'shared' };
  } catch (e) {
    return { success: false, error: e };
  }
}

export async function shareCustomerPaymentsOrDirectWhatsApp(options: any) {
  try {
    return { success: true, method: 'shared' };
  } catch (e) {
    return { success: false, error: e };
  }
}
