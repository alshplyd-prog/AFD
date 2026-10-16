import { ReceiptData } from '../components/ReceiptModal';
import { openThermalPrintWindow, ThermalReceiptData } from './bluetoothPrinter';

/**
 * فتح نافذة الطباعة الحرارية مباشرة (58mm Roll) وإغلاقها عند انتهاء الطباعة
 */
export function openReceiptPreviewModal(receipt: ReceiptData) {
  try {
    openThermalPrintWindow(receipt as ThermalReceiptData);
  } catch (err) {
    console.error('openReceiptPreviewModal error:', err);
  }
}

/**
 * الغاء الوصل الصغير واستبداله بوصل الطباعة الحرارية 58mm Roll
 * Calls the unified 58mm thermal print window (58mm Roll).
 */
export function openReceiptPdfWindow(receipt: ReceiptData) {
  try {
    openThermalPrintWindow(receipt as ThermalReceiptData);
  } catch (err) {
    console.error('openReceiptPdfWindow -> openThermalPrintWindow error:', err);
  }
}


