import jsPDF from 'jspdf';

/**
 * Bluetooth Thermal Printer Helper & Web Print Driver
 */

export const Platform = {
  /**
   * Returns true if running as native Android APK wrapper (Capacitor / Cordova / Native Bridge)
   */
  get isAPK(): boolean {
    if (typeof window === 'undefined') return false;
    const isCapacitorNative = (window as any).Capacitor?.isNativePlatform?.() || (window as any).Capacitor?.getPlatform?.() === 'android';
    const isAndroidBridge = !!(window as any).AndroidPrinter || !!(window as any).AndroidInterface || !!(window as any).Android;
    const isStandaloneAPK = !!(window as any).isAndroidAPK || isCapacitorNative || isAndroidBridge;
    return isStandaloneAPK;
  },

  /**
   * Returns true if running on an Android device (via browser or native APK)
   */
  get isAndroid(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isAndroidUA = /Android/i.test(ua);
    return isAndroidUA || this.isAPK;
  },

  /**
   * Returns true if running in standard web browser
   */
  get isWeb(): boolean {
    return !this.isAPK;
  }
};

import { numberToArabicWords } from './tafqeet';

export interface ThermalReceiptData {
  shopTitle?: string;
  receiptNo: string | number;
  customerName: string;
  itemName: string;
  totalPrice: number;
  totalPaid: number;
  remainingBalance: number;
  paidAmount: number;
  amountInWords: string;
  dateStr: string;
  timeStr: string;
  isDuplicate?: boolean;
  warningNote?: string;
  template?: 'template_1' | 'template_2';
}

export const DEFAULT_DUPLICATE_RECEIPT_WARNING = 'تنبية هام حرصاً منا على ضمان حقوقكم المالية وأمانة المعاملات، نود إفادتكم بأن الاعتماد على (الوصل المكرر ) يقتصر حصراً على الحالات الطارئة مثل توقف الطابعة المركزية نرجو الانتباه الى المبلغ المتبقي او التاكد من تاريخ الدفعه';

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// Common Bluetooth Low Energy (BLE) Thermal POS Printer UUIDs
const COMMON_PRINTER_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Serial/Printer
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // ESC/POS POS printer
  '00001101-0000-1000-8000-00805f9b34fb', // SPP Serial
  '0000ff00-0000-1000-8000-00805f9b34fb', // Vendor POS
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip ISSC
  '0000af00-0000-1000-8000-00805f9b34fb',
  '0000e0ff-0000-1000-8000-00805f9b34fb',
];

export type PrintMethod = 'direct_bluetooth' | 'rawbt' | 'system_default' | 'network_escpos';

export interface SavedPrinterProfile {
  id: string;
  name: string;
  type: PrintMethod;
  address?: string;
  isDefault?: boolean;
}

export interface PrinterConfig {
  deviceId: string | null;
  deviceName: string | null;
  autoPrintOnPayment: boolean;
  printMethod: PrintMethod;
  networkIp?: string;
  networkPort?: number;
}

const PRINTER_STORAGE_KEY = 'alkarrar_saved_bluetooth_printer';
const SAVED_PRINTERS_LIST_KEY = 'alkarrar_saved_printers_profiles_list';

export function getSavedPrintersList(): SavedPrinterProfile[] {
  try {
    const raw = localStorage.getItem(SAVED_PRINTERS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved printers list:', e);
  }
  // Default preset printer profiles
  return [
    { id: 'bt_direct_default', name: 'طابعة البلوتوث المباشرة (ESC/POS)', type: 'direct_bluetooth', isDefault: true },
    { id: 'rawbt_default', name: 'الطباعة عبر تطبيق RawBT للأندرويد', type: 'rawbt', isDefault: false },
    { id: 'system_default_printer', name: 'PDF', type: 'system_default', isDefault: false },
  ];
}

export function savePrinterProfile(profile: SavedPrinterProfile): SavedPrinterProfile[] {
  try {
    const list = getSavedPrintersList();
    const existingIndex = list.findIndex((p) => p.id === profile.id);
    let updatedList: SavedPrinterProfile[];
    if (existingIndex >= 0) {
      updatedList = list.map((p, i) => (i === existingIndex ? { ...p, ...profile } : p));
    } else {
      updatedList = [...list, profile];
    }
    if (profile.isDefault) {
      updatedList = updatedList.map((p) => ({ ...p, isDefault: p.id === profile.id }));
    }
    localStorage.setItem(SAVED_PRINTERS_LIST_KEY, JSON.stringify(updatedList));
    return updatedList;
  } catch (e) {
    console.error('Failed to save printer profile:', e);
    return getSavedPrintersList();
  }
}

export function removePrinterProfile(id: string): SavedPrinterProfile[] {
  try {
    const list = getSavedPrintersList();
    const filtered = list.filter((p) => p.id !== id);
    localStorage.setItem(SAVED_PRINTERS_LIST_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (e) {
    return getSavedPrintersList();
  }
}

export function getSavedPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(PRINTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      let deviceName = parsed.deviceName || null;
      if (parsed.printMethod === 'system_default' || deviceName === 'طابعة النظام الافتراضية' || deviceName === 'طابعة النظام') {
        deviceName = 'PDF';
      }
      return {
        deviceId: parsed.deviceId || null,
        deviceName,
        autoPrintOnPayment: parsed.autoPrintOnPayment !== false,
        printMethod: parsed.printMethod || 'direct_bluetooth',
        networkIp: parsed.networkIp || '',
        networkPort: Number(parsed.networkPort) || 9100,
      };
    }
  } catch (e) {
    console.warn('Failed to parse saved printer config:', e);
  }
  return {
    deviceId: null,
    deviceName: null,
    autoPrintOnPayment: true,
    printMethod: 'direct_bluetooth',
    networkIp: '',
    networkPort: 9100,
  };
}

export function savePrinterConfig(config: Partial<PrinterConfig>) {
  try {
    const current = getSavedPrinterConfig();
    const isDeviceChanged =
      (config.deviceId !== undefined && config.deviceId !== current.deviceId) ||
      (config.deviceName !== undefined && config.deviceName !== current.deviceName);

    if (isDeviceChanged) {
      clearCachedWebBluetoothDevice();
    }

    const updated = { ...current, ...config };
    localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(updated));

    // Also sync with saved printers list
    if (updated.deviceId || updated.deviceName) {
      const pName = updated.deviceName || updated.deviceId || 'طابعة';
      const pId = updated.deviceId || `printer_${Date.now()}`;
      savePrinterProfile({
        id: pId,
        name: pName,
        type: updated.printMethod || 'direct_bluetooth',
        address: updated.deviceId || updated.networkIp,
        isDefault: true,
      });
    }

    return updated;
  } catch (e) {
    console.error('Failed to save printer config:', e);
    return null;
  }
}

export function switchActivePrinter(printer: Partial<PrinterConfig> | SavedPrinterProfile): PrinterConfig {
  clearCachedWebBluetoothDevice();
  let newConfig: Partial<PrinterConfig> = {};
  if ('type' in printer) {
    const profile = printer as SavedPrinterProfile;
    newConfig = {
      deviceId: profile.address || profile.id,
      deviceName: profile.name,
      printMethod: profile.type,
      autoPrintOnPayment: true,
    };
  } else {
    newConfig = printer as Partial<PrinterConfig>;
  }
  const updated = savePrinterConfig(newConfig);
  return updated || getSavedPrinterConfig();
}

export function clearSavedPrinterConfig() {
  try {
    localStorage.removeItem(PRINTER_STORAGE_KEY);
    clearCachedWebBluetoothDevice();
  } catch (e) {
    // ignore
  }
}

let cachedWebBluetoothDevice: any = null;

export function clearCachedWebBluetoothDevice() {
  if (cachedWebBluetoothDevice && cachedWebBluetoothDevice.gatt && cachedWebBluetoothDevice.gatt.connected) {
    try {
      cachedWebBluetoothDevice.gatt.disconnect();
    } catch (e) {
      console.warn('Disconnect cached Web Bluetooth device error:', e);
    }
  }
  cachedWebBluetoothDevice = null;
}

export function openNativeBluetoothSettings(): boolean {
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge && typeof androidBridge.openBluetoothSettings === 'function') {
    try {
      androidBridge.openBluetoothSettings();
      return true;
    } catch (e) {
      console.warn('openBluetoothSettings bridge error:', e);
    }
  }
  return false;
}

/**
 * Retrieves an active or previously permitted Web Bluetooth printer without opening the selection dialog.
 * If forceRequestNew is true or no permitted device exists, opens the browser Bluetooth selector once.
 */
export async function getWebBluetoothDevice(forceRequestNew = false): Promise<any> {
  if (typeof window === 'undefined' || !('bluetooth' in navigator)) return null;

  // 1. Check in-memory cached device
  if (!forceRequestNew && cachedWebBluetoothDevice) {
    return cachedWebBluetoothDevice;
  }

  // 2. Try retrieving previously permitted devices via navigator.bluetooth.getDevices() (Chrome/Edge)
  if (!forceRequestNew && typeof (navigator as any).bluetooth.getDevices === 'function') {
    try {
      const devices = await (navigator as any).bluetooth.getDevices();
      if (Array.isArray(devices) && devices.length > 0) {
        const config = getSavedPrinterConfig();
        const matched = devices.find(
          (d: any) =>
            (config.deviceId && d.id === config.deviceId) ||
            (config.deviceName && d.name && d.name.toLowerCase() === config.deviceName.toLowerCase())
        ) || devices[0];

        if (matched) {
          cachedWebBluetoothDevice = matched;
          if (matched.name || matched.id) {
            savePrinterConfig({
              deviceId: matched.id || config.deviceId || `bt_${Date.now()}`,
              deviceName: matched.name || config.deviceName || 'طابعة البلوتوث',
              autoPrintOnPayment: true,
            });
          }
          return matched;
        }
      }
    } catch (err) {
      console.warn('navigator.bluetooth.getDevices check error:', err);
    }
  }

  // 3. Fallback to navigator.bluetooth.requestDevice (opens device chooser dialog once)
  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: COMMON_PRINTER_UUIDS,
    });

    if (device) {
      cachedWebBluetoothDevice = device;
      savePrinterConfig({
        deviceId: device.id || `bt_${Date.now()}`,
        deviceName: device.name || 'طابعة البلوتوث',
        autoPrintOnPayment: true,
      });
      return device;
    }
  } catch (err: any) {
    console.warn('Web Bluetooth requestDevice error/cancelled:', err);
    throw err;
  }

  return null;
}

export function buildReceiptText(receiptData: ThermalReceiptData): string {
  const isDuplicate = receiptData.isDuplicate || Boolean(receiptData.warningNote);
  const warningText = receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
  const duplicateBlock = isDuplicate
    ? `\n--------------------------------\n⚠️ ${warningText}\n--------------------------------`
    : '';

  return `
${receiptData.customerName}                  الزبون${duplicateBlock}
${receiptData.itemName}   المادة المباعة
${receiptData.totalPrice.toLocaleString('en-US')} دع              المبلغ الكلي
${receiptData.totalPaid.toLocaleString('en-US')} دع             المبلغ الواصل
${receiptData.remainingBalance.toLocaleString('en-US')} دع           المبلغ المتبقي
${receiptData.paidAmount.toLocaleString('en-US')} دع                      المبلغ المدفوع
${receiptData.amountInWords}                  المبلغ كتابة
${receiptData.dateStr}                 تاريخ الدفع
${receiptData.timeStr}                         الوقت
====================
`;
}

/**
 * Renders receipt data onto an HTML5 Canvas element formatted for thermal receipt width (384px / 58mm).
 * Supports template_1 (default classic layout) and template_2 (table grid layout with fixed 'الكرار للموبايل' at top).
 */
export function buildReceiptCanvas(receiptData: ThermalReceiptData): HTMLCanvasElement {
  if (receiptData.template === 'template_2') {
    return buildReceiptCanvasTable(receiptData);
  }
  // Standard 58mm Thermal Printer Width = exactly 384 dots (48 bytes x 8)
  // This prevents the printer from chopping off dots past 384 and ensures complete Arabic labels.
  const width = 384;
  const hasShopTitle = Boolean(receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل');
  const shopTitle = hasShopTitle ? receiptData.shopTitle! : '';
  const amountInWordsText = receiptData.amountInWords || (typeof numberToArabicWords === 'function' ? numberToArabicWords(receiptData.paidAmount) : '');

  // Safe inner margins to guarantee titles are 100% inside physical thermal paper margins
  const rightMarginX = width - 30; // 354px (generous 30px inset from right edge)
  const leftMarginX = 16;          // 16px inset from left edge

  // Height calculations
  const headerHeight = hasShopTitle ? 58 : 22;
  const standardRowHeight = 36;
  const paidBoxHeight = 64;
  const wordsRowHeight = 38;
  const footerHeight = 34;
  const isDuplicate = receiptData.isDuplicate || Boolean(receiptData.warningNote);
  const duplicateBoxHeight = isDuplicate ? 250 : 0;

  const normalItemsCount = (receiptData.receiptNo ? 1 : 0) + 5; // receiptNo?, customer, item, total, paidSoFar, remaining
  const dateItemsCount = 2; // date, time
  const calculatedHeight = headerHeight + (normalItemsCount * standardRowHeight) + paidBoxHeight + wordsRowHeight + (dateItemsCount * standardRowHeight) + duplicateBoxHeight + footerHeight + 20;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = calculatedHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Background white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvas.height);

  let y = 28;
  if (hasShopTitle) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 26px system-ui, Arial, sans-serif';
    ctx.fillText(shopTitle, width / 2, 32);
    y = 66;
  }

  // Helper row drawer with safe internal boundaries
  const drawRow = (label: string, val: string, isCustomer = false, isHighlighted = false) => {
    ctx.fillStyle = '#000000';
    
    // Draw right-aligned Arabic label safely tucked inside rightMarginX
    ctx.font = isHighlighted
      ? 'bold 22px system-ui, Arial, sans-serif'
      : (isCustomer ? 'bold 24px system-ui, Arial, sans-serif' : 'bold 18px system-ui, Arial, sans-serif');
    ctx.textAlign = 'right';
    ctx.fillText(label, rightMarginX, y);
    
    // Measure label to prevent overlap with left value
    const labelWidth = ctx.measureText(label).width;
    const maxValWidth = (rightMarginX - leftMarginX) - labelWidth - 14;

    // Draw left-aligned value safely tucked inside leftMarginX
    let valFont = isHighlighted
      ? 'bold 24px system-ui, Arial, sans-serif'
      : (isCustomer ? 'bold 24px system-ui, Arial, sans-serif' : 'bold 18px system-ui, Arial, sans-serif');
    ctx.font = valFont;
    if (ctx.measureText(val).width > maxValWidth) {
      ctx.font = isHighlighted
        ? 'bold 20px system-ui, Arial, sans-serif'
        : (isCustomer ? 'bold 20px system-ui, Arial, sans-serif' : 'bold 15px system-ui, Arial, sans-serif');
    }
    ctx.textAlign = 'left';
    ctx.fillText(val, leftMarginX, y);
    
    y += isHighlighted ? standardRowHeight + 4 : standardRowHeight;
  };

  if (receiptData.receiptNo) {
    drawRow('رقم الوصل', String(receiptData.receiptNo));
  }
  drawRow('الزبون', String(receiptData.customerName || 'زبون'), true);

  // تحذير الوصل المكرر بعد الاسم مباشرة لتجنب قصه من المندوب
  if (isDuplicate) {
    const warningText = receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
    const wBoxX = 10;
    const wBoxW = width - 20; // 364px wide
    const textMaxWidth = wBoxW - 16;
    
    ctx.font = 'bold 16.5px system-ui, Arial, sans-serif';
    const warningLines = wrapCanvasText(ctx, warningText, textMaxWidth);
    const wLineHeight = 23;
    const wBoxH = 36 + (warningLines.length * wLineHeight) + 10;
    const wBoxY = y - 4;

    // Draw solid border box for warning notice
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(wBoxX, wBoxY, wBoxW, wBoxH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(wBoxX, wBoxY, wBoxW, wBoxH);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 19px system-ui, Arial, sans-serif';
    ctx.fillText('⚠️ تنبية هام ⚠️', width / 2, wBoxY + 25);

    ctx.font = 'bold 16.5px system-ui, Arial, sans-serif';
    let lineY = wBoxY + 50;
    for (const wLine of warningLines) {
      ctx.fillText(wLine, width / 2, lineY);
      lineY += wLineHeight;
    }

    y += wBoxH + 10;
  }

  drawRow('المادة المباعة', String(receiptData.itemName || ''));
  drawRow('المبلغ الكلي', `${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع`);
  drawRow('المبلغ الواصل', `${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع`);
  // المبلغ المتبقي بحجم مكبر وبارز
  drawRow('المبلغ المتبقي', `${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع`, false, true);

  // --- مستطيل بارز على المبلغ المدفوع (مضمّن بأمان داخل حدود الورقة) ---
  const boxX = 12;
  const boxY = y - 24;
  const boxW = width - 24; // 360px wide (right edge = 372px, leaving 12px margin on both sides)
  const boxH = 56;
  const radius = 10;

  // Draw rectangle box
  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.lineTo(boxX + boxW - radius, boxY);
  ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
  ctx.lineTo(boxX + boxW, boxY + boxH - radius);
  ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
  ctx.lineTo(boxX + radius, boxY + boxH);
  ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
  ctx.lineTo(boxX, boxY + radius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
  ctx.closePath();

  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw Paid Amount Inside Box safely tucked inside the box
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px system-ui, Arial, sans-serif';
  ctx.fillText('المبلغ المدفوع:', boxX + boxW - 14, y + 12);

  ctx.textAlign = 'left';
  ctx.font = 'bold 28px system-ui, Arial, sans-serif';
  ctx.fillText(`${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع`, boxX + 14, y + 12);

  y += paidBoxHeight;

  // Amount in words - بحجم مكبر وواضح جداً
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'right';
  ctx.font = 'bold 20px system-ui, Arial, sans-serif';
  ctx.fillText('المبلغ كتابة', rightMarginX, y);
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px system-ui, Arial, sans-serif';
  if (ctx.measureText(amountInWordsText || 'صفر دينار').width > (rightMarginX - leftMarginX - 115)) {
    ctx.font = 'bold 15px system-ui, Arial, sans-serif';
  }
  ctx.fillText(amountInWordsText || 'صفر دينار', leftMarginX, y);
  y += wordsRowHeight;

  // Date & Time
  drawRow('تاريخ الدفع', String(receiptData.dateStr || ''));
  drawRow('الوقت', String(receiptData.timeStr || ''));

  // Separator line
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 17px monospace';
  ctx.fillText('==================', width / 2, y);

  return canvas;
}

/**
 * Renders Template 2 receipt (Table-based design with fixed title 'الكرار للموبايل' at top).
 */
export function buildReceiptCanvasTable(receiptData: ThermalReceiptData): HTMLCanvasElement {
  const width = 384;
  const isDuplicate = receiptData.isDuplicate || Boolean(receiptData.warningNote);
  const amountInWordsText = receiptData.amountInWords || (typeof numberToArabicWords === 'function' ? numberToArabicWords(receiptData.paidAmount) : '');

  // Dynamic height calculation
  let estimatedHeight = 65; // header "الكرار للموبايل" + divider
  if (isDuplicate) estimatedHeight += 120;
  estimatedHeight += 130; // Table 1: Customer info (3 rows)
  estimatedHeight += 180; // Table 2: Accounts (4 rows, paid highlighted)
  estimatedHeight += 120; // Table 3: Words + Date + Time (3 rows)
  estimatedHeight += 45;  // footer

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = estimatedHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, canvas.height);

  const tableX = 12;
  const tableW = width - 24; // 360px
  const colSplit = 145;      // right column (label) width
  const labelX = tableX + tableW - 10;
  const valX = tableX + 10;

  let y = 34;

  // 1. Fixed Header: "الكرار للموبايل"
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.font = '900 27px system-ui, Arial, sans-serif';
  ctx.fillText('الكرار للموبايل', width / 2, y);

  y += 12;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(tableX, y);
  ctx.lineTo(tableX + tableW, y);
  ctx.stroke();

  y += 14;

  // Helper to draw a single table row inside a bordered grid
  const drawTableRow = (
    label: string,
    val: string,
    rowH: number,
    opts?: { isHeaderBg?: boolean; isHighlight?: boolean; isLarge?: boolean }
  ) => {
    // Background
    if (opts?.isHighlight) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(tableX, y, tableW, rowH);
    } else if (opts?.isHeaderBg) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(tableX + tableW - colSplit, y, colSplit, rowH);
    }

    // Outer row borders
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = opts?.isHighlight ? 2.5 : 1.5;
    ctx.strokeRect(tableX, y, tableW, rowH);

    // Column separator
    const splitX = tableX + tableW - colSplit;
    ctx.beginPath();
    ctx.moveTo(splitX, y);
    ctx.lineTo(splitX, y + rowH);
    ctx.stroke();

    // Label (Right aligned)
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'right';
    ctx.font = opts?.isHighlight
      ? '900 19px system-ui, Arial, sans-serif'
      : (opts?.isLarge ? '900 19px system-ui, Arial, sans-serif' : 'bold 16px system-ui, Arial, sans-serif');
    ctx.fillText(label, labelX, y + (rowH / 2) + 6);

    // Value (Left aligned)
    ctx.textAlign = 'left';
    ctx.font = opts?.isHighlight
      ? '900 24px system-ui, Arial, sans-serif'
      : (opts?.isLarge ? '900 22px system-ui, Arial, sans-serif' : 'bold 17px system-ui, Arial, sans-serif');

    // Auto shrink value if overflowing
    const maxValW = splitX - tableX - 14;
    if (ctx.measureText(val).width > maxValW) {
      ctx.font = opts?.isHighlight ? '900 18px system-ui, Arial, sans-serif' : 'bold 14px system-ui, Arial, sans-serif';
    }
    ctx.fillText(val, valX, y + (rowH / 2) + 6);

    y += rowH;
  };

  // --- Table 1: Customer Details ---
  drawTableRow('الزبون', String(receiptData.customerName || 'زبون'), 38, { isHeaderBg: true, isLarge: true });

  y += 8;

  // 2. Duplicate Warning if present (Positioned below customer name)
  if (isDuplicate) {
    const warningText = receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
    ctx.font = 'bold 15px system-ui, Arial, sans-serif';
    const warningLines = wrapCanvasText(ctx, warningText, tableW - 20);
    const boxH = 34 + (warningLines.length * 20);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tableX, y, tableW, boxH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(tableX, y, tableW, boxH);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = '900 17px system-ui, Arial, sans-serif';
    ctx.fillText('⚠️ تنبية هام ⚠️', width / 2, y + 22);

    ctx.font = 'bold 14px system-ui, Arial, sans-serif';
    let lineY = y + 42;
    for (const l of warningLines) {
      ctx.fillText(l, width / 2, lineY);
      lineY += 20;
    }
    y += boxH + 8;
  }

  // --- Table 2: Financial Grid ---
  drawTableRow('المبلغ الكلي', `${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع`, 34, { isHeaderBg: true });
  drawTableRow('المبلغ الواصل', `${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع`, 34, { isHeaderBg: true });
  drawTableRow('المبلغ المتبقي', `${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع`, 38, { isHeaderBg: true, isLarge: true });
  drawTableRow('المبلغ المدفوع', `${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع`, 46, { isHighlight: true });

  y += 8;

  // --- Table 3: Tafqeet & Date/Time ---
  drawTableRow('المبلغ كتابة', amountInWordsText || 'صفر دينار', 34, { isHeaderBg: true });
  drawTableRow('تاريخ الدفع', String(receiptData.dateStr || ''), 30, { isHeaderBg: true });
  drawTableRow('الوقت', String(receiptData.timeStr || ''), 30, { isHeaderBg: true });

  y += 18;

  // Footer: شكراً لتعاملكم معنا
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px system-ui, Arial, sans-serif';
  ctx.fillText('شكراً لتعاملكم معنا', width / 2, y);

  return canvas;
}

/**
 * Converts any HTML5 Canvas element into ESC/POS GS v 0 Monochrome Raster Bitmap binary bytes.
 * Bypasses printer character encodings to display perfect Arabic text and numbers.
 */
export function buildEscPosBitmapBytesFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array();

    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const widthBytes = Math.ceil(width / 8);
    const imageBytes: number[] = [];

    for (let y = 0; y < height; y++) {
      for (let xByte = 0; xByte < widthBytes; xByte++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = xByte * 8 + bit;
          if (x < width) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const alpha = data[idx + 3];

            // Dark pixel threshold for monochrome printing
            const luminance = r * 0.299 + g * 0.587 + b * 0.114;
            if (alpha > 128 && luminance < 190) {
              byteVal |= 0x80 >> bit;
            }
          }
        }
        imageBytes.push(byteVal);
      }
    }

    // ESC @ - Initialize printer
    const header = [0x1b, 0x40];
    // ESC a 1 - Center align
    header.push(0x1b, 0x61, 0x01);

    // GS v 0 0 xL xH yL yH (Print raster bit image)
    const xL = widthBytes % 256;
    const xH = Math.floor(widthBytes / 256);
    const yL = height % 256;
    const yH = Math.floor(height / 256);

    const rasterHeader = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH];

    // Feed 1 line & Paper cut (GS V 66 0)
    const footer = [0x1b, 0x64, 0x01, 0x1d, 0x56, 0x42, 0x00];

    const result = new Uint8Array(header.length + rasterHeader.length + imageBytes.length + footer.length);
    result.set(header, 0);
    result.set(rasterHeader, header.length);
    result.set(imageBytes, header.length + rasterHeader.length);
    result.set(footer, header.length + rasterHeader.length + imageBytes.length);

    return result;
  } catch (e) {
    console.warn('Bitmap raster generation from canvas failed:', e);
    return new Uint8Array();
  }
}

/**
 * Converts receipt canvas into ESC/POS GS v 0 Monochrome Raster Bitmap binary bytes.
 * Bypasses printer character encodings to display perfect Arabic text and numbers.
 */
export function buildEscPosBitmapBytes(receiptData: ThermalReceiptData): Uint8Array {
  try {
    const canvas = buildReceiptCanvas(receiptData);
    return buildEscPosBitmapBytesFromCanvas(canvas);
  } catch (e) {
    console.warn('Bitmap raster generation failed, falling back to text payload:', e);
    return new Uint8Array();
  }
}

/**
 * Builds standard ESC/POS binary payload byte buffer for thermal receipt printers.
 * Defaults to raster bitmap payload for crisp, uncorrupted Arabic text.
 */
export function buildEscPosBytes(receiptData: ThermalReceiptData): Uint8Array {
  const bitmapBytes = buildEscPosBitmapBytes(receiptData);
  if (bitmapBytes && bitmapBytes.length > 0) {
    return bitmapBytes;
  }

  const encoder = new TextEncoder();
  const parts: number[] = [];

  // ESC @ - Initialize Printer
  parts.push(0x1b, 0x40);

  // Shop Title if custom and provided
  if (receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل') {
    // ESC a 1 - Center align
    parts.push(0x1b, 0x61, 0x01);
    // GS ! 0x11 - Double height & width
    parts.push(0x1d, 0x21, 0x11);
    const titleBytes = encoder.encode(`${receiptData.shopTitle}\n`);
    parts.push(...Array.from(titleBytes));
    // Reset text size: GS ! 0
    parts.push(0x1d, 0x21, 0x00);
  }

  // ESC a 1 - Center align
  parts.push(0x1b, 0x61, 0x01);
  const subtitleBytes = encoder.encode('وصل تسديد قسط - إيصال استلام\n================================\n');
  parts.push(...Array.from(subtitleBytes));

  // ESC a 2 - Right align for Arabic lines
  parts.push(0x1b, 0x61, 0x02);

  const lines = [
    `رقم الوصل: ${receiptData.receiptNo}`,
    `الزبون: ${receiptData.customerName}`,
    ...(receiptData.isDuplicate || receiptData.warningNote
      ? [
          '--------------------------------',
          '[!] تنبية هام (وصل مكرر):',
          receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING,
          '--------------------------------',
        ]
      : []),
    `المادة المباعة: ${receiptData.itemName}`,
    `المبلغ الكلي: ${receiptData.totalPrice.toLocaleString('en-US')} د.ع`,
    `المبلغ الواصل: ${receiptData.totalPaid.toLocaleString('en-US')} د.ع`,
    `المبلغ المتبقي: ${receiptData.remainingBalance.toLocaleString('en-US')} د.ع`,
    `المبلغ المدفوع: ${receiptData.paidAmount.toLocaleString('en-US')} د.ع`,
    `المبلغ كتابة: ${receiptData.amountInWords}`,
    `تاريخ الدفع: ${receiptData.dateStr}`,
    `الوقت: ${receiptData.timeStr}`,
  ];

  lines.forEach((line) => {
    const bytes = encoder.encode(`${line}\n`);
    parts.push(...Array.from(bytes));
  });

  // ESC a 1 - Center align
  parts.push(0x1b, 0x61, 0x01);
  const footerBytes = encoder.encode('================================\nشكراً لتعاملكم معنا\n');
  parts.push(...Array.from(footerBytes));

  // Feed 1 line & Paper Cut: GS V 66 0
  parts.push(0x1b, 0x64, 0x01, 0x1d, 0x56, 0x42, 0x00);

  return new Uint8Array(parts);
}

// Direct RawBT App intent trigger for Android Mobile Thermal Printers
export interface PrintJob {
  id: number;
  content: any;
  createdAt: string;
}

/**
 * 0. دالة تجهيز هيكل HTML منسق للطباعة الحرارية (عرض 58mm / 80mm) بوضوح تام للغة العربية
 */
export function buildReceiptHtml(invoiceData: any): string {
  if (typeof invoiceData === 'string') {
    if (invoiceData.trim().toLowerCase().includes('<!doctype html>') || invoiceData.trim().toLowerCase().includes('<html')) {
      return invoiceData;
    }
  }

  const hasShopTitle = Boolean(invoiceData?.shopTitle && invoiceData.shopTitle !== 'الكرار للموبايل');
  const shopTitle = hasShopTitle ? invoiceData.shopTitle : '';
  const amountInWordsText = invoiceData?.amountInWords || (typeof numberToArabicWords === 'function' && invoiceData?.paidAmount !== undefined ? numberToArabicWords(invoiceData.paidAmount) : '');

  const items = [
    ...(invoiceData?.receiptNo ? [{ label: 'رقم الوصل', val: String(invoiceData.receiptNo) }] : []),
    { label: 'الزبون', val: String(invoiceData?.customerName || '') },
    { label: 'المادة المباعة', val: String(invoiceData?.itemName || '') },
    { label: 'المبلغ الكلي', val: `${Number(invoiceData?.totalPrice || 0).toLocaleString('en-US')} د.ع` },
    { label: 'المبلغ الواصل', val: `${Number(invoiceData?.totalPaid || 0).toLocaleString('en-US')} د.ع` },
    { label: 'المبلغ المتبقي', val: `${Number(invoiceData?.remainingBalance || 0).toLocaleString('en-US')} د.ع` },
    { label: 'المبلغ المدفوع', val: `${Number(invoiceData?.paidAmount || 0).toLocaleString('en-US')} د.ع` },
    { label: 'المبلغ كتابة', val: amountInWordsText || 'صفر دينار' },
    { label: 'تاريخ الدفع', val: String(invoiceData?.dateStr || '') },
    { label: 'الوقت', val: String(invoiceData?.timeStr || '') },
  ];

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; size: 57mm auto; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 6px 4px;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    text-align: center;
    direction: rtl;
    width: 57mm;
    max-width: 57mm;
    font-size: 18px;
    font-weight: 800;
    color: #000000;
    background: #ffffff;
    line-height: 1.4;
  }
  .title {
    font-size: 26px;
    font-weight: 900;
    margin-bottom: 10px;
    color: #000000;
    text-align: center;
    letter-spacing: 0.5px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  td {
    padding: 5px 2px;
    font-size: 18px;
    font-weight: 800;
    vertical-align: top;
    color: #000000;
  }
  .lbl {
    text-align: right;
    white-space: nowrap;
    width: 42%;
  }
  .val {
    text-align: left;
    direction: ltr;
    width: 58%;
    word-break: break-word;
  }
  .highlight-remaining td {
    font-size: 22px !important;
    font-weight: 900 !important;
  }
  .highlight-words td {
    font-size: 20px !important;
    font-weight: 900 !important;
  }
  .line {
    text-align: center;
    font-size: 18px;
    font-weight: 900;
    margin: 8px 0;
    letter-spacing: -1px;
    color: #000000;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 15px;
    font-weight: 800;
    margin-top: 6px;
    color: #000000;
  }
</style>
</head>
<body>
  ${hasShopTitle ? `<div class="title">${shopTitle}</div>` : ''}
  <table>
    <tbody>
      ${items.map(item => {
        const cls = item.label === 'المبلغ المتبقي' ? ' class="highlight-remaining"' : item.label === 'المبلغ كتابة' ? ' class="highlight-words"' : '';
        const rowHtml = `<tr${cls}><td class="lbl">${item.label}</td><td class="val">${item.val}</td></tr>`;
        if (item.label === 'الزبون' && (invoiceData?.isDuplicate || invoiceData?.warningNote)) {
          const warningText = invoiceData?.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
          return `${rowHtml}
          <tr>
            <td colspan="2" style="padding: 6px 0;">
              <div style="border: 3px solid #000; border-radius: 9px; padding: 8px 6px; margin: 4px 0; background: #ffffff; text-align: center; color: #000;">
                <div style="font-size: 18px; font-weight: 900; margin-bottom: 4px;">⚠️ تنبية هام ⚠️</div>
                <div style="font-size: 15.5px; font-weight: 900; line-height: 1.45;">${warningText}</div>
              </div>
            </td>
          </tr>`;
        }
        return rowHtml;
      }).join('')}
    </tbody>
  </table>
  <div class="line">==================</div>
</body>
</html>`.trim();
}

/**
 * 1. دالة إضافة الفاتورة لطابور الانتظار وتجربة إرسالها
 */
export function printOrQueueInvoice(printDataText: any): boolean {
  try {
    let queue: PrintJob[] = [];
    try {
      queue = JSON.parse(localStorage.getItem('print_queue') || '[]');
    } catch (e) {
      queue = [];
    }

    const newPrintJob: PrintJob = {
      id: Date.now(),
      content: printDataText,
      createdAt: new Date().toISOString()
    };

    queue.push(newPrintJob);
    localStorage.setItem('print_queue', JSON.stringify(queue));

    processPrintQueue();
    return true;
  } catch (err) {
    console.error('Error adding invoice to print queue:', err);
    return false;
  }
}

/**
 * دالة تحويل الفاتورة إلى صورة PNG عالية الدقة (Base64)
 * لحل مشكلة الطباعة المشفرة ولضمان طباعة الأحرف العربية بوضوح تام كصورة (Raster Image)
 */
export function renderInvoiceToImageBase64(invoiceData: any): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (typeof invoiceData === 'string') {
    const lines = invoiceData
      .replace(/<[^>]+>/g, '\n')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line !== '&nbsp;');

    const baseHeight = 160;
    const itemsHeight = Math.max(lines.length, 1) * 44;
    canvas.width = 576;
    canvas.height = 40 + itemsHeight;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px Arial, sans-serif';
    let y = 40;
    lines.forEach((l) => {
      ctx.fillText(l, canvas.width / 2, y);
      y += 44;
    });

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1] || '';
  }

  const hasShopTitle = Boolean(invoiceData.shopTitle && invoiceData.shopTitle !== 'الكرار للموبايل');
  const shopTitle = hasShopTitle ? invoiceData.shopTitle : '';
  const customerName = invoiceData.customerName || 'زبون عام';
  const itemName = invoiceData.itemName || 'دفعة / تسديد';
  const receiptNo = invoiceData.receiptNo || '';
  const totalPrice = Number(invoiceData.totalPrice || 0).toLocaleString('en-US') + ' د.ع';
  const totalPaid = Number(invoiceData.totalPaid || 0).toLocaleString('en-US') + ' د.ع';
  const remainingBalance = Number(invoiceData.remainingBalance || 0).toLocaleString('en-US') + ' د.ع';
  const paidAmount = Number(invoiceData.paidAmount || 0).toLocaleString('en-US') + ' د.ع';
  const amountInWords = invoiceData.amountInWords || 'صفر دينار';
  const dateStr = invoiceData.dateStr || new Date().toLocaleDateString('en-GB');
  const timeStr = invoiceData.timeStr || new Date().toLocaleTimeString('en-US');

  const itemsList = [
    { label: 'رقم الوصل', val: String(receiptNo) },
    { label: 'الزبون', val: String(customerName) },
    { label: 'المادة المباعة', val: String(itemName) },
    { label: 'المبلغ الكلي', val: totalPrice },
    { label: 'المبلغ الواصل', val: totalPaid },
    { label: 'المبلغ المتبقي', val: remainingBalance },
    { label: 'المبلغ المدفوع', val: paidAmount },
    { label: 'المبلغ كتابة', val: amountInWords },
    { label: 'تاريخ الدفع', val: dateStr },
    { label: 'الوقت', val: timeStr }
  ];

  const baseHeight = hasShopTitle ? 120 : 40;
  const itemsHeight = itemsList.length * 46;
  const footerHeight = 40;
  canvas.width = 576; // 80mm standard width at 203 DPI
  canvas.height = baseHeight + itemsHeight + footerHeight;

  // الخلفية البيضاء
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  let y = 50;
  if (hasShopTitle) {
    // العنوان الرئيسي
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.fillText(shopTitle, canvas.width / 2, 55);

    // خط فاصل علوي
    ctx.beginPath();
    ctx.setLineDash([8, 8]);
    ctx.moveTo(30, 80);
    ctx.lineTo(canvas.width - 30, 80);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    y = 130;
  }

  // عناصر الفاتورة
  itemsList.forEach((item) => {
    const isRemaining = item.label === 'المبلغ المتبقي';
    const isWords = item.label === 'المبلغ كتابة';
    ctx.font = isRemaining ? 'bold 28px Arial, sans-serif' : isWords ? 'bold 25px Arial, sans-serif' : 'bold 22px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(item.label, canvas.width - 40, y);
    ctx.textAlign = 'left';
    ctx.fillText(item.val, 40, y);
    y += isRemaining || isWords ? 50 : 46;
  });

  // خط فاصل سفلي
  ctx.beginPath();
  ctx.setLineDash([8, 8]);
  ctx.moveTo(30, y + 10);
  ctx.lineTo(canvas.width - 30, y + 10);
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] || '';
}

/**
 * دالة ترميز HTML إلى Base64 مع دعم الأحرف العربية (UTF-8) بوضوح كامل
 */
function encodeHtmlToUtf8Base64(html: string): string {
  try {
    const bytes = new TextEncoder().encode(html);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    return btoa(unescape(encodeURIComponent(html)));
  }
}

/**
 * تنسيق نص الوصل بالكامل بدلالة وسوم تطبيق RawBT (توسيط، خط عريض <center>, <b>, وفواصل)
 */
export function formatReceiptForRawBTText(receiptData: any): string {
  const hasCustomTitle = Boolean(receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل');
  const customerName = receiptData.customerName || '';
  const receiptNo = receiptData.receiptNo || '';
  const itemName = receiptData.itemName || '';
  const amount = Number(receiptData.paidAmount || 0);
  const remaining = Number(receiptData.remainingBalance || 0);
  const total = Number(receiptData.totalPrice || 0);
  const dateStr = receiptData.dateStr || new Date().toLocaleDateString('en-GB');
  const timeStr = receiptData.timeStr || new Date().toLocaleTimeString('en-US');

  let txt = '';
  if (hasCustomTitle) {
    txt += `<center><b>${receiptData.shopTitle}</b></center>\n`;
  }
  txt += `<center><b>وصل تسديد قسط</b></center>\n`;
  txt += `--------------------------------\n`;
  txt += `<b>رقم الوصل:</b> ${receiptNo}\n`;
  txt += `<b>التاريخ:</b> ${dateStr} - ${timeStr}\n`;
  txt += `<b>اسم الزبون:</b> ${customerName}\n`;
  if (itemName) {
    txt += `<b>البضاعة/البيان:</b> ${itemName}\n`;
  }
  txt += `--------------------------------\n`;
  txt += `<b>المبلغ الواصل:</b> ${amount.toLocaleString('en-US')} دينار\n`;
  if (receiptData.amountInWords) {
    txt += `(${receiptData.amountInWords})\n`;
  }
  txt += `--------------------------------\n`;
  txt += `<b>المتبقي بذمتكم:</b> ${remaining.toLocaleString('en-US')} دينار\n`;
  if (total > 0) {
    txt += `<b>المبلغ الكلي:</b> ${total.toLocaleString('en-US')} دينار\n`;
  }
  txt += `--------------------------------\n`;
  txt += `<center>شكراً لتعاملكم معنا</center>\n\n\n`;
  return txt;
}

/**
 * إرسال الفاتورة والوصل غير المشفر مباشرة إلى تطبيق RawBT على الأندرويد للطباعة الحرارية السريعة
 */
export function sendReceiptToRawBTIntent(receiptData: any): boolean {
  try {
    const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';

    const imageDataUrl = generateReceiptCanvasDataUrl(receiptData);
    const cleanImgBase64 = imageDataUrl ? imageDataUrl.replace(/^data:image\/png;base64,/, '') : '';

    const amountInWordsText = receiptData.amountInWords || (typeof numberToArabicWords === 'function' ? numberToArabicWords(receiptData.paidAmount) : '');
    const items = [
      ...(receiptData.receiptNo ? [{ label: 'رقم الوصل', val: String(receiptData.receiptNo) }] : []),
      { label: 'الزبون', val: String(receiptData.customerName || '') },
      { label: 'المادة المباعة', val: String(receiptData.itemName || '') },
      { label: 'المبلغ الكلي', val: `${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع` },
      { label: 'المبلغ الواصل', val: `${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع` },
      { label: 'المبلغ المتبقي', val: `${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع` },
      { label: 'المبلغ المدفوع', val: `${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع` },
      { label: 'المبلغ كتابة', val: amountInWordsText || 'صفر دينار' },
      { label: 'تاريخ الدفع', val: String(receiptData.dateStr || '') },
      { label: 'الوقت', val: String(receiptData.timeStr || '') },
    ];

    const hasShopTitle = Boolean(receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل');
    const htmlContent = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; padding: 4px; font-family: system-ui, -apple-system, sans-serif; text-align: center; direction: rtl; width: 56mm; font-size: 13px; font-weight: bold; color: #000; }
  .title { font-size: 20px; font-weight: 800; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  td { padding: 4px 1px; font-size: 13px; font-weight: bold; vertical-align: top; }
  .lbl { text-align: right; white-space: nowrap; width: 45%; }
  .val { text-align: left; direction: ltr; width: 55%; word-break: break-word; }
  .remaining-row td { font-size: 16px !important; font-weight: 900 !important; }
  .words-row td { font-size: 15px !important; font-weight: 900 !important; }
  .line { text-align: center; font-size: 15px; font-weight: bold; margin: 8px 0; letter-spacing: -1px; }
</style>
</head>
<body>
  ${hasShopTitle ? `<div class="title">${receiptData.shopTitle}</div>` : ''}
  <table>
    <tbody>
      ${items.map(item => {
        const cls = item.label === 'المبلغ المتبقي' ? ' class="remaining-row"' : item.label === 'المبلغ كتابة' ? ' class="words-row"' : '';
        return `<tr${cls}><td class="lbl">${item.label}</td><td class="val">${item.val}</td></tr>`;
      }).join('')}
    </tbody>
  </table>
  <div class="line">====================</div>
</body>
</html>`.trim();

    const base64Html = encodeHtmlToUtf8Base64(htmlContent);

    // 1. Send Direct HTML/PDF to RawBT
    try {
      window.location.href = `rawbt:html;base64,${base64Html}`;
    } catch (e) {}

    // 2. Android Intent for RawBT package ru.a402d.rawbtprinter (HTML/PDF mode)
    const intentHtmlUrl = `intent:#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.base64=${base64Html};S.type=html;end;`;

    setTimeout(() => {
      try {
        const link = document.createElement('a');
        link.href = intentHtmlUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          try { if (document.body.contains(link)) document.body.removeChild(link); } catch (e) {}
        }, 500);
      } catch (e) {}
    }, 200);

    // 3. Fallback: Trigger System PDF Print Spooler window
    setTimeout(() => {
      try {
        openThermalPrintWindow(receiptData);
      } catch (e) {}
    }, 600);

    return true;
  } catch (err) {
    console.error("خطأ أثناء إرسال الوصل إلى RawBT:", err);
    return false;
  }
}

/**
 * دالة إرسال الفاتورة عبر rawbt:html;base64, كخيار طباعة أساسي للوصول المباشر دون تدخل يدوي
 */
export function sendToRawBTHtml(invoiceData: any): boolean {
  try {
    const RAWBT_PACKAGE = 'ru.a402d.rawbtprinter';
    const htmlContent = buildReceiptHtml(invoiceData);
    const base64Html = encodeHtmlToUtf8Base64(htmlContent);
    const rawbtUrl = `rawbt:html;base64,${base64Html}`;
    const intentUrl = `intent:#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.base64=${base64Html};S.type=html;end;`;

    const isAndroid = (typeof Platform !== 'undefined' && (Platform.isAndroid || Platform.isAPK)) || /Android/i.test(navigator.userAgent || '') || !!(window as any).isAndroidAPK;
    const targetUrl = isAndroid ? intentUrl : rawbtUrl;

    setTimeout(() => {
      try {
        window.location.href = targetUrl;
      } catch (e) {
        // ignore
      }

      const link = document.createElement('a');
      link.href = targetUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
        } catch (e) {
          // ignore
        }
      }, 500);
    }, 200);

    return true;
  } catch (err) {
    console.error("خطأ أثناء الطباعة بصيغة HTML عبر RawBT:", err);
    return false;
  }
}

/**
 * 2. دالة إرسال الفاتورة لتطبيق RawBT مباشرة
 */
export function processPrintQueue() {
  if (typeof window === 'undefined') return;

  let queue: PrintJob[] = [];
  try {
    queue = JSON.parse(localStorage.getItem('print_queue') || '[]');
  } catch (e) {
    queue = [];
  }

  if (queue.length === 0) return;

  const currentJob = queue[0];

  try {
    // 1. استخدام rawbt:html;base64, كخيار أساسي للطباعة الفورية
    const sentHtml = sendToRawBTHtml(currentJob.content);
    if (!sentHtml) {
      // احتياطي: التحويل إلى صورة PNG في حال تعذر إرسال الـ HTML
      const base64Image = renderInvoiceToImageBase64(currentJob.content);
      if (!base64Image) return;
      const rawbtUrl = `rawbt:data:image/png;base64,${base64Image}`;
      try { window.location.href = rawbtUrl; } catch (e) {}
    }

    // إزالة الفاتورة المطبوعة من الطابور
    queue.shift();
    localStorage.setItem('print_queue', JSON.stringify(queue));
  } catch (err) {
    console.error('Error processing print queue:', err);
  }
}

/**
 * Opens direct print for PDF receipts and customer statements without displaying any modal/preview.
 * On Android, sends PDF directly to RawBT for thermal printers without Arabic font support.
 * On Web/Desktop, uses silent iframe printing directly.
 */
export function openUniversalPdfPrintWindow(contentHtml: string, isThermal: boolean = false, title: string = 'وصل تسديد', receiptData?: ThermalReceiptData) {
  const isAndroid = (typeof Platform !== 'undefined' && (Platform.isAndroid || Platform.isAPK)) || /Android/i.test(navigator.userAgent || '') || !!(window as any).isAndroidAPK;

  // 1. If receiptData is available and on Android: direct RawBT PDF dispatch
  if (isAndroid && receiptData) {
    try {
      sendReceiptPdfToRawBTIntent(receiptData);
      return;
    } catch (e) {
      console.warn('sendReceiptPdfToRawBTIntent error:', e);
    }
  }

  // 2. Silent direct printing via invisible iframe (never displays the receipt on screen)
  try {
    silentIframePrint(contentHtml, title);
  } catch (err) {
    console.error('Error in openUniversalPdfPrintWindow silent print:', err);
  }
}

/**
 * Generates an unencrypted plain PDF blob for 58mm Thermal Printers using jsPDF.
 * Page Dimensions: Width = 58mm (164pt), Height = dynamic based on content length (~140mm).
 */
export function generate58mmReceiptPdfBlob(receiptData: ThermalReceiptData): Blob {
  const canvas = buildReceiptCanvas(receiptData);
  const canvasDataUrl = canvas.toDataURL('image/png');

  const pdfWidthMm = 58; // Exact 58mm width
  const pdfHeightMm = Math.round(pdfWidthMm * (canvas.height / canvas.width));

  // Create unencrypted plain jsPDF document (compress: false)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidthMm, pdfHeightMm],
    compress: false, // Plain unencrypted stream for Android printer compatibility (RawBT / Spooler)
  });

  pdf.addImage(canvasDataUrl, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);

  return pdf.output('blob');
}

export function generate58mmReceiptPdfBase64(receiptData: ThermalReceiptData): string {
  const canvas = buildReceiptCanvas(receiptData);
  const canvasDataUrl = canvas.toDataURL('image/png');

  const pdfWidthMm = 58;
  const pdfHeightMm = Math.round(pdfWidthMm * (canvas.height / canvas.width));

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidthMm, pdfHeightMm],
    compress: false,
  });

  pdf.addImage(canvasDataUrl, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);

  const dataUri = pdf.output('datauristring');
  return dataUri.split(',')[1] || '';
}

export function sendReceiptPdfToRawBTIntent(receiptData: ThermalReceiptData): boolean {
  try {
    const base64Pdf = generate58mmReceiptPdfBase64(receiptData);
    const RAWBT_PACKAGE = 'ru.a404m.rawbt';
    
    // 1. Direct PDF rawbt URL schemes
    const rawbtPdfUrl = `rawbt:data:application/pdf;base64,${base64Pdf}`;
    const rawbtAltUrl = `rawbt:pdf;base64,${base64Pdf}`;
    
    // 2. Android Intent for RawBT PDF
    const intentPdfUrl = `intent:#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.base64=${base64Pdf};S.type=pdf;end;`;
    
    try {
      window.location.href = intentPdfUrl;
    } catch (e) {}

    const link = document.createElement('a');
    link.href = intentPdfUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (document.body.contains(link)) document.body.removeChild(link);
      } catch (e) {}
    }, 500);

    setTimeout(() => {
      try {
        const link2 = document.createElement('a');
        link2.href = rawbtPdfUrl;
        link2.style.display = 'none';
        document.body.appendChild(link2);
        link2.click();
        setTimeout(() => {
          try {
            if (document.body.contains(link2)) document.body.removeChild(link2);
          } catch (e) {}
        }, 500);
      } catch (e) {}
    }, 200);

    return true;
  } catch (err) {
    console.error('Error sending PDF to RawBT:', err);
    return false;
  }
}

export function sendReceiptImageToRawBTIntent(receiptData: ThermalReceiptData): boolean {
  try {
    const canvas = buildReceiptCanvas(receiptData);
    const base64Image = canvas.toDataURL('image/png').split(',')[1];
    const RAWBT_PACKAGE = 'ru.a404m.rawbt';
    
    const intentImageUrl = `intent:#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};S.base64=${base64Image};S.type=image;end;`;
    const rawbtImageUrl = `rawbt:data:image/png;base64,${base64Image}`;
    
    try {
      window.location.href = intentImageUrl;
    } catch (e) {}

    const link = document.createElement('a');
    link.href = intentImageUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (document.body.contains(link)) document.body.removeChild(link);
      } catch (e) {}
    }, 500);

    return true;
  } catch (err) {
    console.error('Error sending image to RawBT:', err);
    return false;
  }
}

export function formatReceiptAsPlainText(receiptData: ThermalReceiptData): string {
  const amountInWordsText = receiptData.amountInWords || (typeof numberToArabicWords === 'function' ? numberToArabicWords(receiptData.paidAmount) : '');
  const titlePart = receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل' ? `${receiptData.shopTitle}\n\n` : '';
  const isDuplicate = receiptData.isDuplicate || Boolean(receiptData.warningNote);
  const warningText = receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
  const duplicateWarning = isDuplicate
    ? `\n--------------------------------\n⚠️ ${warningText}\n--------------------------------`
    : '';
  
  return `
${titlePart}رقم الوصل: ${receiptData.receiptNo || ''}
الزبون: ${receiptData.customerName || ''}${duplicateWarning}
المادة المباعة: ${receiptData.itemName || ''}
المبلغ الكلي: ${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع
المبلغ الواصل: ${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع
المبلغ المتبقي: ${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع
المبلغ المدفوع: ${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع
المبلغ كتابة: ${amountInWordsText || 'صفر دينار'}
تاريخ الدفع: ${receiptData.dateStr || ''}
الوقت: ${receiptData.timeStr || ''}
================================
`.trim();
}

/**
 * Sends receipt directly to RawBT app as pure unencrypted plain text
 * bypassing base64 encoding, PDF generation & Android print dialog entirely.
 */
export function sendToRawBTDirectly(receiptData: ThermalReceiptData) {
  const textReceipt = formatReceiptAsPlainText(receiptData);

  // 0. If in Native Android APK, use Java Native RawBT intent directly for 100% reliability
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge && typeof androidBridge.printRawBT === 'function') {
    try {
      const ok = androidBridge.printRawBT(textReceipt);
      if (ok) return true;
    } catch (e) {
      console.warn('Native Android printRawBT error:', e);
    }
  }

  // Pure plain text Android Intent for RawBT (NO base64 / NO encryption)
  const rawbtIntentUrl = `intent:#Intent;scheme=rawbt;package=ru.a404m.rawbt;S.text=${encodeURIComponent(textReceipt)};end;`;

  try {
    window.location.href = rawbtIntentUrl;
  } catch (e) {}

  try {
    const link = document.createElement('a');
    link.href = rawbtIntentUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (document.body.contains(link)) document.body.removeChild(link);
      } catch (e) {}
    }, 400);
  } catch (e) {}
  return true;
}

/**
 * Downloads the receipt as an unencrypted plain 58mm PDF file (.pdf)
 */
export function downloadReceiptPdf(receiptData: ThermalReceiptData) {
  try {
    const pdfBlob = generate58mmReceiptPdfBlob(receiptData);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `وصل_تسديد_${receiptData.customerName || 'زبون'}_${receiptData.receiptNo || '58mm'}.pdf`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (document.body.contains(link)) document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 1000);
  } catch (err) {
    console.error('Error downloading PDF:', err);
  }
}

/**
 * Opens a dedicated top-level print window for 80mm/58mm thermal printers.
 * Triggers native system print (RawBT print service) with exact 58mm thermal layout.
 */
export function openThermalPrintWindow(receiptData: ThermalReceiptData) {
  const amountInWordsText = receiptData.amountInWords || (typeof numberToArabicWords === 'function' ? numberToArabicWords(receiptData.paidAmount) : '');
  const hasCustomTitle = Boolean(receiptData.shopTitle && receiptData.shopTitle !== 'الكرار للموبايل');
  const isTemplate2 = receiptData.template === 'template_2';

  const htmlContent = isTemplate2 ? `
    <div style="width: 100%; max-width: 54mm; margin: 0 auto; text-align: center; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; font-weight: bold; color: #000; background: #fff; padding: 2mm 2.5mm 0 2.5mm; box-sizing: border-box;" dir="rtl" lang="ar">
      <div style="font-size: 21px; font-weight: 900; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 2px solid #000; color: #000;">الكرار للموبايل</div>
      <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 13px; font-weight: bold; margin: 3px 0; color: #000;">
        <tbody>
          <tr><td style="width: 38%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 4px; white-space: nowrap;">الزبون</td><td style="text-align: left; padding: 4px; direction: ltr; font-size: 15px; font-weight: 900;">${receiptData.customerName || ''}</td></tr>
        </tbody>
      </table>

      ${(receiptData.isDuplicate || receiptData.warningNote) ? `
      <div style="border: 2px solid #000; border-radius: 6px; padding: 5px; margin: 4px 0; background: #ffffff; text-align: center; color: #000;">
        <div style="font-size: 15px; font-weight: 900; margin-bottom: 2px;">⚠️ تنبية هام ⚠️</div>
        <div style="font-size: 12px; font-weight: 900; line-height: 1.35;">${receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}</div>
      </div>
      ` : ''}

      <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 13px; font-weight: bold; margin: 4px 0; color: #000;">
        <tbody>
          <tr style="border-bottom: 1.5px solid #000;"><td style="width: 42%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 3px 4px; white-space: nowrap;">المبلغ الكلي</td><td style="text-align: left; padding: 3px 4px; direction: ltr; font-weight: 900;">${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع</td></tr>
          <tr style="border-bottom: 1.5px solid #000;"><td style="width: 42%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 3px 4px; white-space: nowrap;">المبلغ الواصل</td><td style="text-align: left; padding: 3px 4px; direction: ltr; font-weight: 900;">${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع</td></tr>
          <tr style="border-bottom: 2px solid #000; background: #e2e8f0;"><td style="width: 42%; border-left: 1.5px solid #000; text-align: right; padding: 4px; white-space: nowrap; font-size: 14px; font-weight: 900;">المبلغ المتبقي</td><td style="text-align: left; padding: 4px; direction: ltr; font-size: 17px; font-weight: 900;">${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع</td></tr>
          <tr style="border: 2px solid #000; background: #f8fafc;"><td style="width: 42%; border-left: 2px solid #000; text-align: right; padding: 6px 4px; white-space: nowrap; font-size: 14px; font-weight: 900;">المبلغ المدفوع</td><td style="text-align: left; padding: 6px 4px; direction: ltr; font-size: 20px; font-weight: 900; color: #047857;">${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع</td></tr>
        </tbody>
      </table>

      <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; font-size: 12px; font-weight: bold; margin: 3px 0; color: #000;">
        <tbody>
          <tr style="border-bottom: 1.5px solid #000;"><td style="width: 35%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 3px 4px; white-space: nowrap;">المبلغ كتابة</td><td style="text-align: left; padding: 3px 4px; direction: ltr; font-size: 13px; font-weight: 900;">${amountInWordsText || 'صفر دينار'}</td></tr>
          <tr style="border-bottom: 1.5px solid #000;"><td style="width: 35%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 2px 4px; white-space: nowrap;">تاريخ الدفع</td><td style="text-align: left; padding: 2px 4px; direction: ltr;">${receiptData.dateStr || ''}</td></tr>
          <tr><td style="width: 35%; background: #f1f5f9; border-left: 1.5px solid #000; text-align: right; padding: 2px 4px; white-space: nowrap;">الوقت</td><td style="text-align: left; padding: 2px 4px; direction: ltr;">${receiptData.timeStr || ''}</td></tr>
        </tbody>
      </table>
      <div style="text-align: center; font-size: 12px; font-weight: bold; margin: 4px 0; color: #000;">شكراً لتعاملكم معنا</div>
    </div>
  ` : `
    <div style="width: 100%; max-width: 54mm; margin: 0 auto; text-align: center; font-family: system-ui, -apple-system, sans-serif; font-size: 15px; font-weight: bold; color: #000; background: #fff; padding: 2mm 3.5mm 0 3.5mm; box-sizing: border-box;" dir="rtl" lang="ar">
      ${hasCustomTitle ? `<div style="font-size: 22px; font-weight: 900; margin-bottom: 5px; color: #000;">${receiptData.shopTitle}</div>` : ''}
      <table style="width: 100%; border-collapse: collapse; font-size: 15px; font-weight: bold; margin: 2px 0; color: #000;">
        <tbody>
          ${receiptData.receiptNo ? `<tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; width: 40%; font-size: 14px;">رقم الوصل</td><td style="text-align: left; padding: 2px 1px; direction: ltr; width: 60%; font-size: 15px; font-weight: 900;">${receiptData.receiptNo}</td></tr>` : ''}
          <tr style="border-bottom: 1.5px dashed #94a3b8;"><td style="text-align: right; padding: 3px 4px 3px 1px; white-space: nowrap; font-size: 16px; font-weight: 900;">الزبون</td><td style="text-align: left; padding: 3px 1px; direction: ltr; font-size: 19px; font-weight: 900;">${receiptData.customerName || ''}</td></tr>
          ${(receiptData.isDuplicate || receiptData.warningNote) ? `
          <tr>
            <td colspan="2" style="padding: 6px 0;">
              <div style="border: 3px solid #000; border-radius: 9px; padding: 8px 6px; margin: 4px 0; background: #ffffff; text-align: center; color: #000;">
                <div style="font-size: 18px; font-weight: 900; margin-bottom: 4px;">⚠️ تنبية هام ⚠️</div>
                <div style="font-size: 15.5px; font-weight: 900; line-height: 1.45;">${receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}</div>
              </div>
            </td>
          </tr>
          ` : ''}
          <tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; font-size: 14px;">المادة المباعة</td><td style="text-align: left; padding: 2px 1px; direction: ltr; font-size: 15px;">${receiptData.itemName || ''}</td></tr>
          <tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; font-size: 14px;">المبلغ الكلي</td><td style="text-align: left; padding: 2px 1px; direction: ltr; font-size: 16px; font-weight: 900;">${Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع</td></tr>
          <tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; font-size: 14px;">المبلغ الواصل</td><td style="text-align: left; padding: 2px 1px; direction: ltr; font-size: 16px; font-weight: 900;">${Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع</td></tr>
          <tr style="border-bottom: 2px dashed #475569; background: #f8fafc;"><td style="text-align: right; padding: 4px 4px 4px 1px; white-space: nowrap; font-size: 17px; font-weight: 900;">المبلغ المتبقي</td><td style="text-align: left; padding: 4px 1px; direction: ltr; font-size: 21px; font-weight: 900;">${Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع</td></tr>
          
          <!-- مستطيل بارز على المبلغ المدفوع -->
          <tr>
            <td colspan="2" style="padding: 5px 0;">
              <div style="border: 2.5px solid #000; border-radius: 9px; padding: 6px 8px; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
                <span style="font-size: 16px; font-weight: 900; color: #000;">المبلغ المدفوع:</span>
                <span style="font-size: 23px; font-weight: 900; color: #047857; direction: ltr;">${Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع</span>
              </div>
            </td>
          </tr>

          <tr style="background: #f8fafc;"><td style="text-align: right; padding: 4px 4px 4px 1px; white-space: nowrap; font-size: 16px; font-weight: 900;">المبلغ كتابة</td><td style="text-align: left; padding: 4px 1px; font-size: 17px; font-weight: 900; direction: ltr; word-break: break-word;">${amountInWordsText || 'صفر دينار'}</td></tr>
          <tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; font-size: 13px;">تاريخ الدفع</td><td style="text-align: left; padding: 2px 1px; direction: ltr; font-size: 13px;">${receiptData.dateStr || ''}</td></tr>
          <tr><td style="text-align: right; padding: 2px 4px 2px 1px; white-space: nowrap; font-size: 13px;">الوقت</td><td style="text-align: left; padding: 2px 1px; direction: ltr; font-size: 13px;">${receiptData.timeStr || ''}</td></tr>
        </tbody>
      </table>
      <div style="text-align: center; font-size: 15px; font-weight: 900; margin: 3px 0; letter-spacing: -1px; color: #000;">====================</div>
    </div>
  `;

  openUniversalPdfPrintWindow(htmlContent, true, 'وصل تسديد (58mm)', receiptData);
}

/**
 * Renders the 58mm thermal receipt on an HTML5 canvas and returns the Data URL (image/png).
 * Converts the receipt into an exact image matching the 58mm Roll thermal layout.
 */
export function generateReceiptCanvasDataUrl(receiptData: ThermalReceiptData): string {
  const canvas = buildReceiptCanvas(receiptData);
  return canvas.toDataURL('image/png');
}

/**
 * Renders the thermal receipt on an HTML5 canvas and downloads as a sharp 58mm image.
 */
export function downloadReceiptImage(receiptData: ThermalReceiptData) {
  const dataUrl = generateReceiptCanvasDataUrl(receiptData);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.download = `وصل_تسديد_${receiptData.customerName}_${receiptData.receiptNo}.png`;
  link.href = dataUrl;
  link.click();
}

/**
 * Shares the generated receipt PNG image via Web Share API (WhatsApp, etc.) or downloads it.
 */
export async function shareReceiptImage(receiptData: ThermalReceiptData) {
  try {
    const dataUrl = generateReceiptCanvasDataUrl(receiptData);
    if (!dataUrl) return;

    if (navigator.share) {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `وصل_تسديد_${receiptData.customerName}_${receiptData.receiptNo}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'وصل تسديد - الكرار للموبايل',
          text: `وصل تسديد للزبون: ${receiptData.customerName}`,
        });
        return;
      }
    }
    downloadReceiptImage(receiptData);
  } catch (err) {
    console.warn('Share image cancelled or failed, falling back to download', err);
    downloadReceiptImage(receiptData);
  }
}

export async function printViaNativeAndroidSerial(
  receiptData: ThermalReceiptData,
  printerNameOrId?: string | null,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  const defaultTargetName = printerNameOrId || 'طابعة البلوتوث';
  if (onProgress) onProgress(`جاري فحص البلوتوث والاتصال بالطابعة...`);

  // 0. Check Native Android Bridge Interface (Injected via MainActivity.java AndroidPrinter / AndroidInterface)
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge) {
    try {
      if (onProgress) onProgress('جاري تحضير أوامر ESC/POS وإرسال البيانات للطباعة المباشرة...');
      const escPosBytes = buildEscPosBytes(receiptData);

      let binaryStr = '';
      const len = escPosBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binaryStr += String.fromCharCode(escPosBytes[i]);
      }
      const base64Data = window.btoa(binaryStr);

      if (typeof androidBridge.printBase64Bytes === 'function') {
        const rawRes = androidBridge.printBase64Bytes(printerNameOrId || '', base64Data);
        try {
          const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
          if (parsed && parsed.success) {
            if (onProgress) onProgress('تمت الطباعة المباشرة بنجاح');
            return { success: true, message: parsed.message || 'تمت الطباعة بنجاح' };
          }
        } catch (e) {
          if (rawRes === true || rawRes === 'true') {
            if (onProgress) onProgress('تمت الطباعة بنجاح');
            return { success: true, message: 'تمت الطباعة بنجاح' };
          }
        }
      }

      if (typeof androidBridge.printReceiptText === 'function') {
        const text = buildReceiptText(receiptData);
        const rawRes = androidBridge.printReceiptText(printerNameOrId || '', text);
        try {
          const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
          if (parsed && parsed.success) {
            if (onProgress) onProgress('تمت الطباعة بنجاح');
            return { success: true, message: parsed.message || 'تمت الطباعة بنجاح' };
          }
        } catch (e) {}
      }
    } catch (err: any) {
      console.warn('Native Android bridge error:', err);
    }
  }

  // 1. Check window.bluetoothSerial (Cordova/Capacitor Bluetooth Serial)
  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;
  if (btSerial) {
    // Ensure runtime permissions (BLUETOOTH_CONNECT, BLUETOOTH_SCAN, ACCESS_FINE_LOCATION) are requested first
    const permRes = await requestAndroidBluetoothPermissions();
    if (!permRes.granted) {
      const msg = permRes.message || 'يرجى الموافقة على صلاحيات البلوتوث الحديثة (BLUETOOTH_CONNECT, BLUETOOTH_SCAN) في إعدادات الهاتف للتمكن من الاتصال بالطابعة';
      console.warn('Bluetooth permission denied:', msg);
      if (onProgress) onProgress(msg);
      return {
        success: false,
        message: msg,
      };
    }

    return new Promise((resolve) => {
      const escPosBytes = buildEscPosBytes(receiptData);

      const sendData = () => {
        if (onProgress) onProgress('جاري إرسال الوصل إلى طابعة البلوتوث...');
        try {
          btSerial.write(
            escPosBytes.buffer || escPosBytes,
            () => {
              if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
              resolve({ success: true, message: 'تم إرسال الطباعة بنجاح' });
            },
            (err: any) => {
              console.warn('btSerial write bytes failed, trying string write fallback:', err);
              const text = buildReceiptText(receiptData);
              btSerial.write(
                text,
                () => {
                  if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
                  resolve({ success: true, message: 'تم إرسال الطباعة بنجاح' });
                },
                (e: any) => {
                  console.warn('btSerial string write failed:', e);
                  resolve({ success: false, message: 'فشل إرسال البيانات عبر Bluetooth Serial' });
                }
              );
            }
          );
        } catch (writeErr) {
          console.warn('btSerial.write exception caught:', writeErr);
          resolve({ success: false, message: 'فشل إرسال البيانات عبر Bluetooth Serial' });
        }
      };

      const connectAndPrint = (targetMacOrName: string) => {
        const isMacAddress = targetMacOrName && (targetMacOrName.includes(':') || targetMacOrName.includes('-'));

        const doConnect = () => {
          if (isMacAddress && btSerial.connect) {
            if (onProgress) onProgress(`جاري الاتصال بالطابعة (${targetMacOrName})...`);
            try {
              btSerial.connect(
                targetMacOrName,
                () => sendData(),
                (connErr: any) => {
                  console.warn('btSerial.connect failed gracefully, sending data directly:', connErr);
                  sendData();
                }
              );
            } catch (err) {
              console.warn('btSerial.connect exception:', err);
              sendData();
            }
          } else {
            sendData();
          }
        };

        if (typeof btSerial.isConnected === 'function') {
          try {
            btSerial.isConnected(
              () => sendData(),
              () => doConnect()
            );
          } catch {
            doConnect();
          }
        } else {
          doConnect();
        }
      };

      const findPrinterAndPrint = () => {
        if (typeof btSerial.list === 'function') {
          try {
            btSerial.list(
              (devices: any[]) => {
                if (Array.isArray(devices) && devices.length > 0) {
                  let matchedDevice = null;
                  if (printerNameOrId) {
                    matchedDevice = devices.find(
                      (d) =>
                        d.id === printerNameOrId ||
                        d.address === printerNameOrId ||
                        (d.name && d.name.toLowerCase() === printerNameOrId.toLowerCase())
                    );
                  }

                  if (!matchedDevice) {
                    matchedDevice =
                      devices.find((d) => {
                        const name = (d.name || d.id || '').toLowerCase();
                        return (
                          name.includes('printer') ||
                          name.includes('p1') ||
                          name.includes('pos') ||
                          name.includes('thermal') ||
                          name.includes('bt') ||
                          name.includes('6ba1') ||
                          name.includes('80') ||
                          name.includes('58')
                        );
                      }) || devices[0];
                  }

                  const macOrAddress = matchedDevice.address || matchedDevice.id || '';
                  const displayName = matchedDevice.name || macOrAddress || defaultTargetName;
                  if (onProgress) onProgress(`تم الاتصال بالطابعة المقترنة (${displayName})...`);
                  connectAndPrint(macOrAddress || displayName);
                } else {
                  connectAndPrint(defaultTargetName);
                }
              },
              (listErr: any) => {
                console.warn('btSerial.list warning:', listErr);
                connectAndPrint(defaultTargetName);
              }
            );
          } catch (e) {
            console.warn('btSerial.list exception:', e);
            connectAndPrint(defaultTargetName);
          }
        } else {
          connectAndPrint(defaultTargetName);
        }
      };

      if (typeof btSerial.isEnabled === 'function') {
        try {
          btSerial.isEnabled(
            () => findPrinterAndPrint(),
            () => {
              if (onProgress) onProgress('البلوتوث مغلق. جاري تشغيله تلقائياً...');
              if (typeof btSerial.enable === 'function') {
                btSerial.enable(
                  () => {
                    if (onProgress) onProgress('تم تشغيل البلوتوث بنجاح، جاري الاتصال بالطابعة...');
                    setTimeout(findPrinterAndPrint, 600);
                  },
                  (enableErr: any) => {
                    console.warn('Failed to enable Bluetooth automatically:', enableErr);
                    findPrinterAndPrint();
                  }
                );
              } else {
                findPrinterAndPrint();
              }
            }
          );
        } catch {
          findPrinterAndPrint();
        }
      } else {
        findPrinterAndPrint();
      }
    });
  }

  // 2. Check window.blueThermalPrinter / BlueThermalPrinter
  const blueThermal = (window as any).blueThermalPrinter || (window as any).BlueThermalPrinter;
  if (blueThermal) {
    try {
      if (onProgress) onProgress('جاري تحضير أوامر ESC/POS وإرسال البيانات...');
      const text = buildReceiptText(receiptData);
      if (typeof blueThermal.printText === 'function') {
        blueThermal.printText(text);
      } else if (typeof blueThermal.printData === 'function') {
        const escPosBytes = buildEscPosBytes(receiptData);
        blueThermal.printData(escPosBytes);
      }
      if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
      return { success: true, message: 'تم إرسال الطباعة بنجاح' };
    } catch (e: any) {
      console.warn('blueThermalPrinter execution error:', e);
    }
  }

  // 3. Fallback Native WebView Android Interface (window.AndroidInterface or window.AndroidPrinter)
  const legacyBridge = (window as any).AndroidInterface || (window as any).AndroidPrinter || (window as any).Android;
  if (legacyBridge) {
    try {
      if (onProgress) onProgress('جاري تحضير أوامر ESC/POS وإرسال البيانات...');
      const text = buildReceiptText(receiptData);
      if (legacyBridge.printEscPos) {
        legacyBridge.printEscPos(text);
      } else if (legacyBridge.printReceipt) {
        legacyBridge.printReceipt(text);
      } else if (legacyBridge.printBluetooth) {
        legacyBridge.printBluetooth(text);
      }
      if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
      return { success: true, message: 'تم إرسال الطباعة بنجاح' };
    } catch (e: any) {
      console.warn('Android native bridge print error:', e);
    }
  }

  return { success: false, message: 'لم يتم العثور على مكتبة أندرويد للبلوتوث المباشر' };
}

export async function printReceiptViaBluetooth(
  receiptData: ThermalReceiptData,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;
  const config = getSavedPrinterConfig();
  const targetPrinter = config.deviceId || config.deviceName || 'طابعة البلوتوث';

  if (btSerial) {
    return printViaNativeAndroidSerial(receiptData, targetPrinter, onProgress);
  }

  if (typeof window === 'undefined' || !('bluetooth' in navigator)) {
    // Fallback directly to native serial or ESC/POS payload
    return printViaNativeAndroidSerial(receiptData, targetPrinter, onProgress);
  }

  try {
    if (onProgress) onProgress('جاري الاتصال المباشر بطابعة البلوتوث...');
    
    // Retrieve active cached or previously permitted device without opening popup
    let device: any = null;
    try {
      device = await getWebBluetoothDevice(false);
    } catch (err: any) {
      const isCancelled =
        err?.name === 'NotFoundError' ||
        err?.name === 'AbortError' ||
        err?.message?.includes('cancelled') ||
        err?.message?.includes('chooser');
      if (isCancelled) {
        return { success: false, message: 'تم إلغاء اختيار طابعة البلوتوث.' };
      }
      throw err;
    }

    if (!device || !device.gatt) {
      return { success: false, message: 'لم يتم العثور على طابعة بلوتوث.' };
    }

    const deviceName = device.name || 'طابعة البلوتوث';
    if (onProgress) onProgress(`جاري الاتصال بـ ${deviceName}...`);

    let server = device.gatt.connected ? device.gatt : null;
    if (!server || !server.connected) {
      server = await device.gatt.connect();
    }
    if (onProgress) onProgress('تم الاتصال، جاري استخراج بروتوكول الطباعة...');
    const services = await server.getPrimaryServices();

    if (!services || services.length === 0) {
      return { success: false, message: 'تعذر الاتصال ببروتوكول الطابعة.' };
    }

    let writeChar: any = null;
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
      } catch (e) {
        // Continue checking other services
      }
      if (writeChar) break;
    }

    if (!writeChar) {
      return { success: false, message: 'طابعتك تعتمد Bluetooth Classic. جاري استخدام بروتوكول البلوتوث المباشر.' };
    }

    if (onProgress) onProgress('جاري تحضير أوامر ESC/POS وإرسال البيانات...');
    const escPosBytes = buildEscPosBytes(receiptData);

    // Chunk write payloads to 100 bytes to strictly comply with GATT MTU / 512-byte limits
    const CHUNK_SIZE = 100;
    for (let i = 0; i < escPosBytes.length; i += CHUNK_SIZE) {
      const chunk = escPosBytes.subarray(i, i + CHUNK_SIZE);
      if (writeChar.properties.writeWithoutResponse && typeof writeChar.writeValueWithoutResponse === 'function') {
        try {
          await writeChar.writeValueWithoutResponse(chunk);
        } catch {
          if (typeof writeChar.writeValue === 'function') {
            await writeChar.writeValue(chunk);
          } else if (typeof writeChar.writeValueWithResponse === 'function') {
            await writeChar.writeValueWithResponse(chunk);
          }
        }
      } else if (typeof writeChar.writeValue === 'function') {
        await writeChar.writeValue(chunk);
      } else if (typeof writeChar.writeValueWithResponse === 'function') {
        await writeChar.writeValueWithResponse(chunk);
      }
      // Short delay between chunks for thermal printer hardware buffer pacing
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
    return { success: true };
  } catch (err: any) {
    const isCancelled =
      err.name === 'NotFoundError' ||
      err.name === 'AbortError' ||
      err.message?.includes('cancelled') ||
      err.message?.includes('User cancelled') ||
      err.message?.includes('chooser');

    if (!isCancelled) {
      console.warn('Bluetooth GATT warning:', err?.message || err);
    } else {
      console.log('Bluetooth printer selection cancelled by user');
    }

    if (err.name === 'SecurityError' || err.name === 'NotAllowedError' || err.message?.includes('permissions policy') || err.message?.includes('disallowed')) {
      // Fallback silently to direct printer config instead of blocking
      const saved = savePrinterConfig({
        deviceId: 'escpos_bt_thermal_default',
        deviceName: 'طابعة البلوتوث المقترنة (ESC/POS)',
        autoPrintOnPayment: true,
      });
      return {
        success: true,
        message: 'تم اعتماد طابعة البلوتوث المقترنة بالهاتف للطباعة المباشرة',
      };
    }

    if (isCancelled) {
      return {
        success: false,
        message: 'تم إلغاء اختيار طابعة البلوتوث.',
      };
    }

    return {
      success: false,
      message: err.message || 'حدث خطأ أثناء محاولة ربط طابعة البلوتوث.',
    };
  }
}

/**
 * Prints custom ESC/POS binary data (e.g., from Canvas monochrome raster) directly to Bluetooth printer
 */
export async function printCustomEscPosViaBluetooth(
  escPosBytes: Uint8Array,
  fallbackText?: string,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  const config = getSavedPrinterConfig();
  const targetPrinter = config.deviceId || config.deviceName || 'طابعة البلوتوث';

  // 1. Android Bridge Interface (Injected via MainActivity.java)
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge) {
    try {
      if (onProgress) onProgress('جاري تحضير أوامر ESC/POS وإرسال البيانات للطباعة المباشرة...');
      let binaryStr = '';
      const len = escPosBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binaryStr += String.fromCharCode(escPosBytes[i]);
      }
      const base64Data = window.btoa(binaryStr);

      if (typeof androidBridge.printBase64Bytes === 'function') {
        const rawRes = androidBridge.printBase64Bytes(targetPrinter, base64Data);
        try {
          const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
          if (parsed && parsed.success) {
            if (onProgress) onProgress('تمت الطباعة المباشرة بنجاح');
            return { success: true, message: parsed.message || 'تمت الطباعة بنجاح' };
          }
        } catch (e) {
          if (rawRes === true || rawRes === 'true') {
            if (onProgress) onProgress('تمت الطباعة بنجاح');
            return { success: true, message: 'تمت الطباعة بنجاح' };
          }
        }
      }

      if (fallbackText && typeof androidBridge.printReceiptText === 'function') {
        const rawRes = androidBridge.printReceiptText(targetPrinter, fallbackText);
        try {
          const parsed = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
          if (parsed && parsed.success) {
            if (onProgress) onProgress('تمت الطباعة بنجاح');
            return { success: true, message: parsed.message || 'تمت الطباعة بنجاح' };
          }
        } catch (e) {}
      }
    } catch (err: any) {
      console.warn('Native Android bridge error:', err);
    }
  }

  // 2. Cordova / Capacitor bluetoothSerial
  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;
  if (btSerial) {
    const permRes = await requestAndroidBluetoothPermissions();
    if (!permRes.granted) {
      return { success: false, message: permRes.message || 'صلاحية البلوتوث مرفوضة' };
    }

    return new Promise((resolve) => {
      const sendData = () => {
        if (onProgress) onProgress('جاري إرسال البيانات لطابعة البلوتوث...');
        btSerial.write(
          escPosBytes.buffer || escPosBytes,
          () => {
            if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
            resolve({ success: true, message: 'تم إرسال الطباعة بنجاح' });
          },
          (err: any) => {
            console.warn('btSerial write failed:', err);
            if (fallbackText) {
              btSerial.write(
                fallbackText,
                () => resolve({ success: true, message: 'تم إرسال الطباعة النصية بنجاح' }),
                (textErr: any) => resolve({ success: false, message: `فشل الإرسال: ${textErr}` })
              );
            } else {
              resolve({ success: false, message: `فشل الإرسال: ${err}` });
            }
          }
        );
      };

      btSerial.isConnected(
        () => sendData(),
        () => {
          if (!targetPrinter) {
            resolve({ success: false, message: 'لم يتم تحديد طابعة' });
            return;
          }
          btSerial.connect(
            targetPrinter,
            () => sendData(),
            (connErr: any) => resolve({ success: false, message: `فشل الاتصال: ${connErr}` })
          );
        }
      );
    });
  }

  // 3. Web Bluetooth GATT
  if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
    try {
      if (onProgress) onProgress('جاري الاتصال المباشر بطابعة البلوتوث...');
      let device: any = null;
      try {
        device = await getWebBluetoothDevice(false);
      } catch (err: any) {
        if (err?.name === 'NotFoundError' || err?.message?.includes('cancelled')) {
          return { success: false, message: 'تم إلغاء اختيار الطابعة' };
        }
        throw err;
      }
      if (!device || !device.gatt) {
        return { success: false, message: 'لم يتم العثور على طابعة بلوتوث.' };
      }
      let server = device.gatt.connected ? device.gatt : null;
      if (!server || !server.connected) {
        server = await device.gatt.connect();
      }
      const services = await server.getPrimaryServices();
      let writeChar: any = null;
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
        } catch (e) {}
        if (writeChar) break;
      }
      if (!writeChar) {
        return { success: false, message: 'تعذر العثور على منفذ كتابة بالطابعة' };
      }

      const CHUNK_SIZE = 100;
      for (let i = 0; i < escPosBytes.length; i += CHUNK_SIZE) {
        const chunk = escPosBytes.subarray(i, i + CHUNK_SIZE);
        if (writeChar.properties.writeWithoutResponse && typeof writeChar.writeValueWithoutResponse === 'function') {
          try {
            await writeChar.writeValueWithoutResponse(chunk);
          } catch {
            if (typeof writeChar.writeValue === 'function') {
              await writeChar.writeValue(chunk);
            }
          }
        } else if (typeof writeChar.writeValue === 'function') {
          await writeChar.writeValue(chunk);
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (onProgress) onProgress('تم إرسال الطباعة بنجاح');
      return { success: true };
    } catch (err: any) {
      console.warn('Web Bluetooth GATT print error:', err);
      return { success: false, message: err?.message || 'فشل الاتصال بالطابعة عبر Web Bluetooth' };
    }
  }

  return { success: false, message: 'لم تتوفر وسيلة بلوتوث مباشرة' };
}

/**
 * Automatically checks if Bluetooth is enabled, and prompts/activates it if disabled (Android / APK / Web)
 */
export async function ensureBluetoothEnabled(onProgress?: (status: string) => void): Promise<{ enabled: boolean; message?: string }> {
  if (typeof window === 'undefined') return { enabled: true };

  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;

  // 1. Android Native Bluetooth Serial
  if (btSerial && typeof btSerial.isEnabled === 'function') {
    return new Promise((resolve) => {
      try {
        btSerial.isEnabled(
          () => {
            resolve({ enabled: true });
          },
          () => {
            if (onProgress) onProgress('البلوتوث مغلق. جاري تفعيله تلقائياً للطباعة...');
            if (typeof btSerial.enable === 'function') {
              try {
                btSerial.enable(
                  () => {
                    if (onProgress) onProgress('تم تشغيل البلوتوث بنجاح، جاري إرسال الفاتورة...');
                    setTimeout(() => resolve({ enabled: true }), 800);
                  },
                  (enableErr: any) => {
                    console.warn('Bluetooth auto-enable failed/declined:', enableErr);
                    resolve({
                      enabled: false,
                      message: 'يرجى تشغيل البلوتوث في الهاتف للتمكن من طباعة الوصل.',
                    });
                  }
                );
              } catch (e) {
                console.warn('btSerial.enable exception:', e);
                resolve({ enabled: false, message: 'يرجى تشغيل البلوتوث من إعدادات الهاتف.' });
              }
            } else {
              resolve({ enabled: false, message: 'البلوتوث مغلق. يرجى تفعيله للطباعة.' });
            }
          }
        );
      } catch (err) {
        console.warn('btSerial.isEnabled exception:', err);
        resolve({ enabled: true });
      }
    });
  }

  // 2. Web Bluetooth
  if ('bluetooth' in navigator && !Platform.isAndroid) {
    if (typeof (navigator as any).bluetooth.getAvailability === 'function') {
      try {
        const available = await (navigator as any).bluetooth.getAvailability();
        if (!available) {
          return {
            enabled: false,
            message: 'محول البلوتوث مغلق أو غير مدعوم على هذا الجهاز. يرجى تشغيل البلوتوث.',
          };
        }
      } catch (e) {}
    }
  }

  return { enabled: true };
}

/**
 * Safely requests runtime permissions for Android 12+ (BLUETOOTH_CONNECT, BLUETOOTH_SCAN, ACCESS_FINE_LOCATION)
 * before invoking native bluetooth calls to prevent App crashes (SecurityExceptions).
 */
export async function requestAndroidBluetoothPermissions(): Promise<{ granted: boolean; message?: string }> {
  if (typeof window === 'undefined') return { granted: true };

  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;
  const cordova = (window as any).cordova;
  const capacitor = (window as any).Capacitor;

  // 1. Request permissions via Cordova Android Permissions plugin if present (Android 12+ Runtime Permissions)
  if (cordova && cordova.plugins && cordova.plugins.permissions) {
    const permissions = cordova.plugins.permissions;
    const list = [
      permissions.BLUETOOTH_CONNECT || 'android.permission.BLUETOOTH_CONNECT',
      permissions.BLUETOOTH_SCAN || 'android.permission.BLUETOOTH_SCAN',
      permissions.BLUETOOTH_ADVERTISE || 'android.permission.BLUETOOTH_ADVERTISE',
      permissions.ACCESS_FINE_LOCATION || 'android.permission.ACCESS_FINE_LOCATION',
      permissions.ACCESS_COARSE_LOCATION || 'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
    ];
    try {
      const permGranted = await new Promise<boolean>((resolve) => {
        permissions.requestPermissions(
          list,
          (status: any) => resolve(status && status.hasPermission !== false),
          () => resolve(false)
        );
      });
      if (!permGranted) {
        return {
          granted: false,
          message: 'يرجى الموافقة على صلاحيات البلوتوث الحديثة (BLUETOOTH_CONNECT, BLUETOOTH_SCAN) من إعدادات الهاتف للتمكن من الاتصال بالطابعة',
        };
      }
    } catch (e) {
      console.warn('Cordova android permissions request error:', e);
    }
  }

  // 2. Request permissions via Cordova Diagnostic plugin if present
  if (cordova && cordova.plugins && cordova.plugins.diagnostic) {
    const diagnostic = cordova.plugins.diagnostic;
    try {
      if (typeof diagnostic.requestRuntimePermissions === 'function') {
        const perms = [
          diagnostic.permission?.BLUETOOTH_CONNECT || 'android.permission.BLUETOOTH_CONNECT',
          diagnostic.permission?.BLUETOOTH_SCAN || 'android.permission.BLUETOOTH_SCAN',
        ];
        await new Promise<void>((resolve) => {
          diagnostic.requestRuntimePermissions(
            () => resolve(),
            () => resolve(),
            perms
          );
        });
      }
    } catch (e) {
      console.warn('Cordova diagnostic permission error:', e);
    }
  }

  // 3. Request permissions via Capacitor bridge
  if (capacitor && typeof capacitor.nativeCallback === 'function') {
    try {
      if (capacitor.Plugins && capacitor.Plugins.Permissions) {
        await capacitor.Plugins.Permissions.request({ name: 'bluetooth' });
      }
    } catch (e) {
      console.warn('Capacitor permissions request:', e);
    }
  }

  // 4. Request permissions via cordova-plugin-bluetooth-serial native methods
  if (btSerial) {
    if (typeof btSerial.hasPermission === 'function' && typeof btSerial.requestPermission === 'function') {
      try {
        const hasPerm = await new Promise<boolean>((resolve) => {
          btSerial.hasPermission(
            () => resolve(true),
            () => resolve(false)
          );
        });

        if (!hasPerm) {
          const requested = await new Promise<boolean>((resolve) => {
            btSerial.requestPermission(
              () => resolve(true),
              (err: any) => {
                console.warn('btSerial.requestPermission rejected:', err);
                resolve(false);
              }
            );
          });
          if (!requested) {
            return {
              granted: false,
              message: 'يرجى الموافقة على صلاحيات البلوتوث والموقع (BLUETOOTH_CONNECT, BLUETOOTH_SCAN) للتمكن من الاتصال بالطابعة',
            };
          }
        }
      } catch (e) {
        console.warn('btSerial permission check error:', e);
      }
    }
  }

  // 5. Safely verify Bluetooth state and offer enabling if disabled
  if (btSerial && typeof btSerial.isEnabled === 'function') {
    return new Promise((resolve) => {
      try {
        btSerial.isEnabled(
          () => resolve({ granted: true }),
          (err: any) => {
            console.warn('btSerial.isEnabled returned false:', err);
            if (typeof btSerial.enable === 'function') {
              try {
                btSerial.enable(
                  () => resolve({ granted: true }),
                  () =>
                    resolve({
                      granted: false,
                      message: 'يرجى تفعيل البلوتوث والموافقة على صلاحيات البلوتوث والموقع في إعدادات الهاتف.',
                    })
                );
              } catch (enableErr) {
                console.warn('btSerial.enable security exception:', enableErr);
                resolve({
                  granted: false,
                  message: 'يرجى تفعيل البلوتوث ومنح صلاحية BLUETOOTH_CONNECT من إعدادات الهاتف.',
                });
              }
            } else {
              resolve({
                granted: false,
                message: 'البلوتوث غير مفعّل. يرجى تفعيل البلوتوث والموافقة على الصلاحيات في الهاتف.',
              });
            }
          }
        );
      } catch (e) {
        console.warn('btSerial.isEnabled exception caught safely:', e);
        resolve({ granted: true });
      }
    });
  }

  return { granted: true };
}

export interface BluetoothDevice {
  name: string;
  address: string;
  id: string;
}

/**
 * Lists all paired Bluetooth devices from native Android Bluetooth Serial, AndroidPrinter bridge, or Web environment
 */
export async function listPairedBluetoothDevices(): Promise<BluetoothDevice[]> {
  // 0. Native Android Bridge (MainActivity.java)
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge && typeof androidBridge.getBondedDevices === 'function') {
    try {
      const raw = androidBridge.getBondedDevices();
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((d: any) => ({
          name: d.name || d.id || 'طابعة بلوتوث',
          address: d.address || d.id || '',
          id: d.id || d.address || '',
        }));
      }
    } catch (e) {
      console.warn('Native Android bridge getBondedDevices error:', e);
    }
  }

  // 1. Cordova/Capacitor Bluetooth Serial
  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;
  if (btSerial && typeof btSerial.list === 'function') {
    // Request Android runtime permissions first to avoid SecurityException crash
    const permRes = await requestAndroidBluetoothPermissions();
    if (!permRes.granted) {
      console.warn('Bluetooth permissions not granted:', permRes.message);
      return [];
    }

    return new Promise((resolve) => {
      try {
        btSerial.list(
          (devices: any[]) => {
            if (Array.isArray(devices) && devices.length > 0) {
              const mapped: BluetoothDevice[] = devices.map((d) => ({
                name: d.name || d.id || 'طابعة بلوتوث',
                address: d.address || d.id || '',
                id: d.id || d.address || '',
              }));
              resolve(mapped);
            } else {
              resolve([]);
            }
          },
          (err: any) => {
            console.warn('btSerial.list failed cleanly:', err);
            resolve([]);
          }
        );
      } catch (e) {
        console.warn('btSerial.list exception caught safely:', e);
        resolve([]);
      }
    });
  }
  return [];
}

export async function requestWebBluetoothDevice(): Promise<{ success: boolean; deviceName?: string; deviceId?: string; message?: string }> {
  if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
    try {
      // Force request new device picker dialog when explicitly requested
      const device = await getWebBluetoothDevice(true);

      if (device) {
        const deviceName = device.name || 'طابعة البلوتوث';
        const deviceId = device.id || `bt_${Date.now()}`;

        return {
          success: true,
          deviceName,
          deviceId,
          message: `تم الاقتران واختيار الطابعة بنجاح: ${deviceName}`,
        };
      }
    } catch (err: any) {
      const isCancelled =
        err.name === 'NotFoundError' ||
        err.name === 'AbortError' ||
        err.message?.includes('cancelled') ||
        err.message?.includes('User cancelled') ||
        err.message?.includes('chooser');

      if (isCancelled) {
        return { success: false, message: 'تم إلغاء تحديد جهاز البلوتوث من قبل المستخدم' };
      }
      return { success: false, message: err.message || 'تعذر تحديد جهاز البلوتوث من المتصفح' };
    }
  }
  return { success: false, message: 'خاصية Web Bluetooth غير مدعومة في هذا المتصفح' };
}

export async function scanAndSaveBluetoothPrinter(): Promise<{ success: boolean; deviceName?: string; deviceId?: string; message?: string }> {
  // 0. Check Native Android Bridge (MainActivity.java)
  const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
  if (androidBridge && typeof androidBridge.getBondedDevices === 'function') {
    try {
      const raw = androidBridge.getBondedDevices();
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const deviceName = first.name || first.id || 'طابعة البلوتوث الحرارية';
        const deviceId = first.address || first.id || `bt_${Date.now()}`;
        savePrinterConfig({
          deviceId,
          deviceName,
          autoPrintOnPayment: true,
        });
        return {
          success: true,
          deviceName,
          deviceId,
          message: `تم الاقتران بنجاح مع الطابعة: ${deviceName}`,
        };
      }
    } catch (e) {
      console.warn('Native Android bridge scan error:', e);
    }
  }

  const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;

  // 1. Android Native Bluetooth Serial / Plugin list
  if (btSerial && typeof btSerial.list === 'function') {
    const permRes = await requestAndroidBluetoothPermissions();
    if (!permRes.granted) {
      return {
        success: false,
        message: permRes.message || 'يرجى الموافقة على صلاحيات البلوتوث والموقع لتطبيقات أندرويد 12+ للتمكن من البحث عن الطابعات.',
      };
    }

    return new Promise((resolve) => {
      try {
        btSerial.list(
          (devices: any[]) => {
            if (Array.isArray(devices) && devices.length > 0) {
              const firstDevice = devices[0];
              const deviceName = firstDevice.name || firstDevice.id || 'طابعة البلوتوث الحرارية';
              const deviceId = firstDevice.address || firstDevice.id || `bt_${Date.now()}`;
              savePrinterConfig({
                deviceId,
                deviceName,
                autoPrintOnPayment: true,
              });
              resolve({
                success: true,
                deviceName,
                deviceId,
                message: `تم الاقتران بنجاح مع الطابعة: ${deviceName}`,
              });
            } else {
              resolve({
                success: false,
                message: 'لم يتم العثور على أجهزة بلوتوث مقترنة بالنظام. يرجى الاقتران بالطابعة من إعدادات البلوتوث للهاتف أولاً أو إدخال اسمها يدوياً.',
              });
            }
          },
          (err: any) => {
            console.warn('btSerial.list failed cleanly:', err);
            resolve({
              success: false,
              message: 'تعذر جلب الأجهزة المقترنة تلقائياً. يمكنك إدخال اسم أو عنوان MAC الخاص بالطابعة يدوياً.',
            });
          }
        );
      } catch (e) {
        console.warn('btSerial.list exception caught safely:', e);
        resolve({
          success: false,
          message: 'تعذر جلب الأجهزة المقترنة تلقائياً. يمكنك إدخال اسم أو عنوان MAC الخاص بالطابعة يدوياً.',
        });
      }
    });
  }

  // 2. Web Bluetooth API if present
  if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
    const webBtRes = await requestWebBluetoothDevice();
    if (webBtRes.success) {
      return webBtRes;
    }
  }

  return {
    success: false,
    message: 'لم يتم العثور على أجهزة بلوتوث تلقائياً. يرجى إدخال اسم الطابعة أو عنوان MAC يدوياً في الخانات أدناه.',
  };
}

/**
 * Triggers silent background printing using a hidden iframe directly to the system default printer
 * without opening full window popups or preview screens.
 */
export function silentIframePrint(htmlContent: string, title: string = 'وصل تسديد') {
  try {
    const frameId = '__silent_print_iframe__';
    let iframe = document.getElementById(frameId) as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = frameId;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 0; size: 58mm auto; }
    body {
      margin: 0;
      padding: 4px;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      direction: rtl;
      background: #ffffff;
      color: #000000;
    }
  </style>
</head>
<body>
  ${htmlContent}
  <script>
    window.onload = function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch(e) {}
      }, 200);
    };
  </script>
</body>
</html>`);
      doc.close();
      return true;
    }
  } catch (err) {
    console.warn('silentIframePrint fallback notice:', err);
  }
  return false;
}

/**
 * Direct Print Receipt: Sends receipt directly to the configured printer (Direct Bluetooth ESC/POS or System Thermal Printer)
 * without requiring manual preview or selection steps.
 */
export async function directPrintReceipt(
  receiptData: ThermalReceiptData,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  const config = getSavedPrinterConfig();
  const printerDisplayName = config.deviceName || config.deviceId || 'طابعة البلوتوث المباشرة';

  // 0. RawBT Dedicated Mode
  if (config.printMethod === 'rawbt') {
    if (onProgress) {
      onProgress('جاري إرسال الوصل للطباعة المباشرة عبر تطبيق RawBT...');
    }
    try {
      sendToRawBTDirectly(receiptData);
      if (onProgress) onProgress('تم إرسال الوصل للطباعة بنجاح عبر تطبيق RawBT');
      return { success: true, message: 'تم إرسال الوصل للطباعة بنجاح عبر تطبيق RawBT' };
    } catch (e: any) {
      console.warn('RawBT print error:', e);
    }
  }

  // 1. Direct Bluetooth ESC/POS Mode
  if (config.printMethod === 'direct_bluetooth') {
    if (onProgress) {
      onProgress(`جاري فحص البلوتوث والاتصال المباشر بالطابعة (${printerDisplayName})...`);
    }

    // Automatically check and enable Bluetooth if turned off
    await ensureBluetoothEnabled(onProgress);

    // Try native Android Bluetooth Serial bridge / AndroidPrinter first
    const androidBridge = (window as any).AndroidPrinter || (window as any).AndroidInterface || (window as any).Android;
    const btSerial = (window as any).bluetoothSerial || (navigator as any).bluetoothSerial;

    if (androidBridge || btSerial) {
      const nativeRes = await printViaNativeAndroidSerial(receiptData, config.deviceId || config.deviceName, onProgress);
      if (nativeRes.success) {
        return nativeRes;
      }
    }

    // Try Web Bluetooth GATT write
    if (typeof window !== 'undefined' && 'bluetooth' in navigator) {
      try {
        const res = await printReceiptViaBluetooth(receiptData, onProgress);
        if (res.success) return res;
      } catch (e) {
        console.warn('Direct Bluetooth GATT failed:', e);
      }
    }

    // If on Android and Bluetooth failed, attempt direct RawBT intent
    if (Platform.isAndroid || Platform.isAPK) {
      try {
        sendToRawBTDirectly(receiptData);
        if (onProgress) onProgress('تم إرسال الوصل للطباعة المباشرة عبر تطبيق RawBT');
        return { success: true, message: 'تم إرسال الوصل للطباعة المباشرة بنجاح' };
      } catch (e) {
        console.warn('RawBT fallback attempt error:', e);
      }
    }
  }

  // 2. PDF Print Mode (Direct PDF without showing any receipt preview on screen)
  if (onProgress) onProgress('جاري إرسال وصل PDF للطباعة المباشرة...');

  const isAndroid = (typeof Platform !== 'undefined' && (Platform.isAndroid || Platform.isAPK)) || /Android/i.test(navigator.userAgent || '') || !!(window as any).isAndroidAPK;
  if (isAndroid && receiptData) {
    try {
      sendReceiptPdfToRawBTIntent(receiptData);
      return { success: true, message: 'تم إرسال وصل PDF للطباعة المباشرة بنجاح' };
    } catch (e) {
      console.warn('sendReceiptPdfToRawBTIntent in directPrintReceipt error:', e);
    }
  }

  openThermalPrintWindow(receiptData);
  return { success: true, message: 'تم إرسال وصل PDF للطباعة بنجاح' };
}

/**
 * Performs silent background ESC/POS thermal printing upon adding a payment receipt.
 */
export async function silentAutoPrintReceipt(
  receiptData: ThermalReceiptData,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  return directPrintReceipt(receiptData, onProgress);
}


