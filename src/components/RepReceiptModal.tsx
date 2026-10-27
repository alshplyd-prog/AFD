import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Download, Copy, FileText, Share2, Printer, CheckCircle } from 'lucide-react';
import { numberToArabicWords } from '../lib/tafqeet';
import jsPDF from 'jspdf';
import {
  openUniversalPdfPrintWindow,
  getSavedPrinterConfig,
  ensureBluetoothEnabled,
  buildEscPosBitmapBytesFromCanvas,
  printCustomEscPosViaBluetooth,
  Platform,
} from '../lib/bluetoothPrinter';

export interface RepSummaryItem {
  repName: string;
  paymentsCount: number;
  totalCollected: number;
}

export interface RepPaymentDetailItem {
  customerName: string;
  amount: number;
  dateStr: string;
  timeStr?: string;
  note?: string;
}

export interface RepReceiptData {
  shopTitle?: string;
  repName: string;
  repRole?: string;
  listName?: string;
  fromDateStr: string;
  toDateStr: string;
  paymentsCount: number;
  totalCollected: number;
  amountInWords?: string;
  printedBy?: string;
  dateStr: string;
  timeStr: string;
  isAllRepsSummary?: boolean;
  allRepsSummaryList?: RepSummaryItem[];
  paymentsList?: RepPaymentDetailItem[];
}

interface RepReceiptModalProps {
  receipt: RepReceiptData | null;
  isOpen: boolean;
  onClose: () => void;
  autoTriggerPrint?: boolean;
}

/**
 * Format plain text for clipboard & RawBT Intent
 * Displays: وصل تسديدات, اسم المندوب, الفترة, قائمة التسديدات المحددة, والمجموع بنهاية الشريط
 */
export function formatRepReceiptAsPlainText(receipt: RepReceiptData): string {
  const amountWords = receipt.amountInWords || numberToArabicWords(receipt.totalCollected);
  const totalMoney = `${Number(receipt.totalCollected || 0).toLocaleString('en-US')} د.ع`;

  let paymentsText = '';
  if (receipt.paymentsList && receipt.paymentsList.length > 0) {
    paymentsText = receipt.paymentsList
      .map((p, idx) => {
        const cleanNote = p.note && !p.note.includes('قسط يومي') && p.note !== 'تسديد قسط' && p.note !== 'Daily installment payment' ? p.note.trim() : '';
        const line1 = `${idx + 1}. ${p.customerName} : ${Number(p.amount || 0).toLocaleString('en-US')} د.ع`;
        const line2 = p.timeStr ? `   (${p.dateStr} - ${p.timeStr})` : `   (${p.dateStr})`;
        const line3 = cleanNote ? `   ملاحظة: ${cleanNote}` : '';
        return [line1, line2, line3].filter(Boolean).join('\n');
      })
      .join('\n--------------------------------\n');
  }

  return `وصل تسديدات
================================
اسم المندوب: ${receipt.repName}
من تاريخ: ${receipt.fromDateStr}
إلى تاريخ: ${receipt.toDateStr}
عدد التسديدات: ${receipt.paymentsCount || (receipt.paymentsList?.length ?? 0)}
================================
${paymentsText ? `قائمة التسديدات المحددة:\n--------------------------------\n${paymentsText}\n================================\n` : ''}اجمالي التحصيلات: ${totalMoney}
(${amountWords})
================================
تاريخ الطباعة: ${receipt.dateStr} - ${receipt.timeStr}`.trim();
}

/**
 * Opens dedicated 58mm thermal print window
 * Prints all itemized payments and summary box at the end with doubled font sizes for maximum readability
 */
export function openRepReceiptThermalPrintWindow(receipt: RepReceiptData) {
  const amountWords = receipt.amountInWords || numberToArabicWords(receipt.totalCollected);
  const totalMoney = `${Number(receipt.totalCollected || 0).toLocaleString('en-US')} د.ع`;

  let paymentsRowsHtml = '';
  if (receipt.paymentsList && receipt.paymentsList.length > 0) {
    paymentsRowsHtml = receipt.paymentsList
      .map((p, idx) => {
        const cleanNote = p.note && !p.note.includes('قسط يومي') && p.note !== 'تسديد قسط' && p.note !== 'Daily installment payment' ? p.note.trim() : '';
        return `
        <div style="padding: 8px 0; border-bottom: 1.5px dashed #cbd5e1;">
          <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 900;">
            <span style="color: #0f172a; font-size: 18px; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idx + 1}. ${p.customerName}</span>
            <span style="color: #047857; font-size: 22px; font-weight: 900; direction: ltr;">${Number(p.amount || 0).toLocaleString('en-US')} د.ع</span>
          </div>
          <div style="display: flex; justify-content: space-between; color: #475569; font-size: 14px; font-weight: 700; margin-top: 3px;">
            <span>${p.dateStr}${p.timeStr ? ' - ' + p.timeStr : ''}</span>
            ${cleanNote ? `<span style="color: #334155; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cleanNote}</span>` : ''}
          </div>
        </div>
      `;
      })
      .join('');
  }

  const htmlContent = `
    <div style="width: 58mm; max-width: 58mm; margin: 0 auto; padding: 2mm 1mm; font-family: system-ui, -apple-system, sans-serif; direction: rtl; text-align: right; color: #000; box-sizing: border-box; font-size: 15px; line-height: 1.4;">
      <div style="background: #ffffff; border: 2.5px solid #000000; border-radius: 10px; padding: 10px; box-sizing: border-box;">
        <!-- Title -->
        <div style="text-align: center; font-size: 24px; font-weight: 900; color: #000; padding-bottom: 6px; margin-bottom: 8px; border-bottom: 2.5px solid #000;">
          وصل تسديدات
        </div>

        <!-- Delegate Name -->
        <div style="margin-bottom: 8px; font-size: 16px; font-weight: 900; display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px dashed #94a3b8; padding-bottom: 6px;">
          <span style="color: #334155;">اسم المندوب:</span>
          <span style="color: #000; font-size: 22px; font-weight: 900;">${receipt.repName}</span>
        </div>

        <!-- Date Range: من تاريخ إلى تاريخ -->
        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px 10px; margin-bottom: 10px; font-size: 15px; font-weight: 800; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>من تاريخ:</span>
            <span style="font-size: 16px; font-weight: 900; direction: ltr;">${receipt.fromDateStr}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>إلى تاريخ:</span>
            <span style="font-size: 16px; font-weight: 900; direction: ltr;">${receipt.toDateStr}</span>
          </div>
        </div>

        <!-- Payments Details List (جميع التسديدات المحددة - خط مضاعف للزبائن) -->
        ${
          receipt.paymentsList && receipt.paymentsList.length > 0
            ? `
          <div style="margin-bottom: 10px;">
            <div style="background: #f1f5f9; padding: 5px 8px; border-radius: 6px; font-size: 15px; font-weight: 900; color: #1e293b; display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span>الزبون</span>
              <span>المبلغ</span>
            </div>
            ${paymentsRowsHtml}
          </div>
        `
            : ''
        }

        <!-- Total Collected Box at the end of the strip (حجم خط اجمالي تسديدات مضاعف) -->
        <div style="background: #e6f9f0; border: 2.5px solid #059669; border-radius: 10px; padding: 10px; text-align: center; margin-top: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 18px; font-weight: 900; color: #064e3b;">إجمالي التحصيلات:</span>
            <span style="font-size: 14px; font-weight: 900; color: #047857; background: #a7f3d0; padding: 2px 8px; border-radius: 6px;">
              ${receipt.paymentsCount || receipt.paymentsList?.length || 0} تسديد
            </span>
          </div>
          <div style="font-size: 32px; font-weight: 900; color: #047857; direction: ltr; margin: 4px 0; line-height: 1.1;">
            ${totalMoney}
          </div>
          <div style="font-size: 14px; font-weight: 800; color: #065f46;">
            (${amountWords})
          </div>
        </div>
      </div>

      <!-- Small Footer Timestamp -->
      <div style="text-align: center; font-size: 12px; font-weight: bold; color: #64748b; margin-top: 8px;">
        تاريخ الطباعة: ${receipt.dateStr} - ${receipt.timeStr}
      </div>
    </div>
  `;

  openUniversalPdfPrintWindow(
    htmlContent,
    true,
    `وصل تسديدات - ${receipt.repName}`
  );
}

function drawCanvasRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Builds HTML5 Canvas strictly matching user requirements with doubled font sizes:
 * 1. العنوان: وصل تسديدات (حجم مضاعف)
 * 2. اسم المندوب
 * 3. التاريخ: من تاريخ إلى تاريخ
 * 4. جميع التسديدات المحددة (اسم الزبون والمبلغ والتاريخ بخط كبير واضح)
 * 5. اجمالي التحصيلات بنهاية الشريط بخط ضخم ومميز
 */
export function buildRepReceiptCanvas(receipt: RepReceiptData): HTMLCanvasElement {
  const width = 384; // Standard 58mm thermal width
  const payments = receipt.paymentsList || [];
  const paymentsCount = payments.length;

  // Calculate dynamic canvas height for doubled font heights
  const baseHeaderHeight = 175;
  const itemsSectionHeaderHeight = paymentsCount > 0 ? 40 : 0;
  const itemsHeight = paymentsCount * 68;
  const summaryBoxHeight = 125;
  const footerHeight = 45;
  const paddingBottom = 20;

  const totalHeight = baseHeaderHeight + itemsSectionHeaderHeight + itemsHeight + summaryBoxHeight + footerHeight + paddingBottom;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const amountWords = receipt.amountInWords || numberToArabicWords(receipt.totalCollected);
  const totalMoney = `${Number(receipt.totalCollected || 0).toLocaleString('en-US')} د.ع`;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer border box
  const outerBoxHeight = totalHeight - footerHeight - 10;
  drawCanvasRoundRect(ctx, 8, 8, 368, outerBoxHeight, 10);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Title: وصل تسديدات (Doubled font size)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 26px system-ui, Arial, sans-serif';
  ctx.fillText('وصل تسديدات', 192, 40);

  // Title divider line
  ctx.beginPath();
  ctx.moveTo(18, 52);
  ctx.lineTo(366, 52);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Delegate Name
  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 16px system-ui, Arial, sans-serif';
  ctx.fillText('اسم المندوب:', 354, 82);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 22px system-ui, Arial, sans-serif';
  ctx.fillText(receipt.repName, 240, 82);

  // Date Range Box: من تاريخ إلى تاريخ
  drawCanvasRoundRect(ctx, 18, 98, 348, 52, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px system-ui, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`من تاريخ: ${receipt.fromDateStr}`, 354, 122);
  ctx.textAlign = 'left';
  ctx.fillText(`إلى تاريخ: ${receipt.toDateStr}`, 28, 122);

  let currentY = 162;

  // Render Payment Items if present (خط مضاعف لتسديدات الزبائن)
  if (paymentsCount > 0) {
    // Items header
    drawCanvasRoundRect(ctx, 18, currentY, 348, 30, 6);
    ctx.fillStyle = '#f1f5f9';
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px system-ui, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('الزبون', 354, currentY + 21);
    ctx.textAlign = 'left';
    ctx.fillText('المبلغ', 28, currentY + 21);

    currentY += 36;

    // Draw each payment item with doubled fonts
    payments.forEach((p, idx) => {
      // Customer name on right (doubled size)
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 18px system-ui, Arial, sans-serif';
      const custText = `${idx + 1}. ${p.customerName}`;
      ctx.fillText(custText, 354, currentY + 20);

      // Amount on left (doubled bold size)
      ctx.textAlign = 'left';
      ctx.fillStyle = '#047857';
      ctx.font = 'bold 22px system-ui, Arial, sans-serif';
      ctx.fillText(`${Number(p.amount || 0).toLocaleString('en-US')} د.ع`, 28, currentY + 20);

      // Date / Time subtitle
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 13px system-ui, Arial, sans-serif';
      const cleanNote = p.note && !p.note.includes('قسط يومي') && p.note !== 'تسديد قسط' && p.note !== 'Daily installment payment' ? p.note.trim() : '';
      const timeInfo = `${p.dateStr}${p.timeStr ? ' - ' + p.timeStr : ''}${cleanNote ? ' | ' + cleanNote : ''}`;
      ctx.fillText(timeInfo, 354, currentY + 44);

      // Item divider
      ctx.beginPath();
      ctx.moveTo(18, currentY + 56);
      ctx.lineTo(366, currentY + 56);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      currentY += 68;
    });
  }

  // Total Collected Box at the end of the strip (حجم خط اجمالي تسديدات مضاعف ومميز)
  currentY += 8;
  drawCanvasRoundRect(ctx, 18, currentY, 348, 115, 10);
  ctx.fillStyle = '#e6f9f0';
  ctx.fill();
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#064e3b';
  ctx.font = 'bold 18px system-ui, Arial, sans-serif';
  ctx.fillText('إجمالي التحصيلات:', 354, currentY + 28);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 15px system-ui, Arial, sans-serif';
  ctx.fillText(`${receipt.paymentsCount || paymentsCount} تسديد`, 28, currentY + 28);

  // Total Money in big bold doubled text
  ctx.textAlign = 'center';
  ctx.fillStyle = '#047857';
  ctx.font = 'bold 32px system-ui, Arial, sans-serif';
  ctx.fillText(totalMoney, 192, currentY + 68);

  // Amount in words
  ctx.fillStyle = '#065f46';
  ctx.font = 'bold 14px system-ui, Arial, sans-serif';
  ctx.fillText(`(${amountWords})`, 192, currentY + 96);

  // Footer timestamp
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 12px system-ui, Arial, sans-serif';
  ctx.textAlign = 'center';
  const timestampY = currentY + 122;
  ctx.fillText(`تاريخ الطباعة: ${receipt.dateStr} - ${receipt.timeStr}`, 192, timestampY);

  // Crop canvas height immediately after text ends to prevent extra paper feed
  const exactHeight = Math.ceil(timestampY + 12);
  if (exactHeight < canvas.height) {
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = width;
    trimmedCanvas.height = exactHeight;
    const tCtx = trimmedCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, width, exactHeight);
      tCtx.drawImage(canvas, 0, 0, width, exactHeight, 0, 0, width, exactHeight);
      return trimmedCanvas;
    }
  }

  return canvas;
}

/**
 * Direct Print Rep Receipt: Instantly sends receipt to printer without intermediate steps
 */
export async function directPrintRepReceipt(
  receipt: RepReceiptData,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; message?: string }> {
  const config = getSavedPrinterConfig();
  const printerDisplayName = config.deviceName || config.deviceId || 'طابعة البلوتوث المباشرة';

  // 1. Direct Bluetooth ESC/POS Mode
  if (config.printMethod === 'direct_bluetooth') {
    if (onProgress) {
      onProgress(`جاري فحص البلوتوث والاتصال المباشر بالطابعة (${printerDisplayName})...`);
    }
    await ensureBluetoothEnabled(onProgress);

    const canvas = buildRepReceiptCanvas(receipt);
    const escPosBytes = buildEscPosBitmapBytesFromCanvas(canvas);
    const fallbackText = formatRepReceiptAsPlainText(receipt);

    const res = await printCustomEscPosViaBluetooth(escPosBytes, fallbackText, onProgress);
    if (res.success) return res;

    // Direct RawBT Intent
    if (Platform.isAndroid || Platform.isAPK) {
      try {
        sendRepReceiptToRawBTDirectly(receipt);
        return { success: true, message: 'تم إرسال الوصل للطباعة المباشرة عبر تطبيق RawBT' };
      } catch (e) {
        console.warn('RawBT direct failed:', e);
      }
    }
  }

  // 2. Direct Thermal Print Window
  openRepReceiptThermalPrintWindow(receipt);
  return { success: true, message: 'تم إرسال الوصل للطباعة بنجاح' };
}

export function sendRepReceiptToRawBTDirectly(receipt: RepReceiptData) {
  const textReceipt = formatRepReceiptAsPlainText(receipt);
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
}

export function downloadRepReceiptPdf(receipt: RepReceiptData) {
  try {
    const canvas = buildRepReceiptCanvas(receipt);
    const canvasDataUrl = canvas.toDataURL('image/png');
    const pdfWidthMm = 58;
    const pdfHeightMm = Math.max(50, Math.round(pdfWidthMm * (canvas.height / canvas.width)));

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pdfWidthMm, pdfHeightMm],
      compress: false,
    });

    pdf.addImage(canvasDataUrl, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm);
    const title = `وصل_تسديدات_${receipt.repName}`;
    pdf.save(`${title}_${receipt.dateStr}.pdf`);
  } catch (err) {
    console.error('Error downloading rep receipt PDF:', err);
  }
}

export function downloadRepReceiptImage(receipt: RepReceiptData) {
  try {
    const canvas = buildRepReceiptCanvas(receipt);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const title = `وصل_تسديدات_${receipt.repName}`;
    link.download = `${title}_${receipt.dateStr}.png`;
    link.href = dataUrl;
    link.click();
  } catch (err) {
    console.error('Error downloading image:', err);
  }
}

export async function shareRepReceiptImage(receipt: RepReceiptData) {
  try {
    const canvas = buildRepReceiptCanvas(receipt);
    const dataUrl = canvas.toDataURL('image/png');
    const title = `وصل_تسديدات_${receipt.repName}`;

    if (navigator.share) {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${title}_${receipt.dateStr}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'وصل تسديدات',
          text: `وصل تسديدات: ${receipt.repName}`,
        });
        return;
      }
    }
    downloadRepReceiptImage(receipt);
  } catch (err) {
    console.warn('Share rep receipt image cancelled or failed, falling back to download', err);
    downloadRepReceiptImage(receipt);
  }
}

export const RepReceiptModal: React.FC<RepReceiptModalProps> = ({
  receipt,
  isOpen,
  onClose,
  autoTriggerPrint,
}) => {
  const [copied, setCopied] = useState(false);

  // Mobile Back Button / Gesture support (popstate)
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: 'rep_receipt_modal' }, '');

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && receipt && autoTriggerPrint) {
      setTimeout(() => {
        directPrintRepReceipt(receipt);
      }, 200);
    }
  }, [isOpen, receipt, autoTriggerPrint]);

  if (!isOpen || !receipt) return null;

  const amountInWords = receipt.amountInWords || numberToArabicWords(receipt.totalCollected);
  const totalMoney = `${Number(receipt.totalCollected || 0).toLocaleString('en-US')} د.ع`;

  const handleCopyText = () => {
    const txt = formatRepReceiptAsPlainText(receipt);
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/85 backdrop-blur-md animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm sm:max-w-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-black text-sm">
            <Printer className="w-4 h-4 text-blue-600" />
            <span>وصل تسديدات</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
          {/* Card Simulation matching printed receipt strictly to requested fields */}
          <div className="bg-white text-black p-4 sm:p-5 rounded-2xl shadow-md border-2 border-slate-900 w-full max-w-[360px] font-sans select-none">
            {/* Title: وصل تسديدات */}
            <div className="text-center font-black text-2xl text-slate-900 pb-2 mb-3 border-b-2 border-slate-900">
              وصل تسديدات
            </div>

            {/* Delegate Name */}
            <div className="flex items-center justify-between py-2 border-b border-dashed border-slate-300 text-base font-black mb-3">
              <span className="text-slate-600">اسم المندوب:</span>
              <span className="text-slate-900 font-extrabold text-xl">{receipt.repName}</span>
            </div>

            {/* Date Range: من تاريخ إلى تاريخ */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 mb-3.5 text-sm font-black text-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span>من تاريخ:</span>
                <span className="font-black text-sm dir-ltr">{receipt.fromDateStr}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>إلى تاريخ:</span>
                <span className="font-black text-sm dir-ltr">{receipt.toDateStr}</span>
              </div>
            </div>

            {/* Itemized Payments List (خط مضاعف لتسديدات الزبائن) */}
            {receipt.paymentsList && receipt.paymentsList.length > 0 && (
              <div className="mb-3.5 space-y-2 max-h-56 overflow-y-auto pr-1">
                <div className="flex justify-between text-xs font-black text-slate-600 pb-1 border-b border-slate-200">
                  <span>الزبون</span>
                  <span>المبلغ</span>
                </div>
                {receipt.paymentsList.map((p, idx) => (
                  <div key={idx} className="py-1.5 border-b border-dashed border-slate-200 flex flex-col">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-900 font-black text-sm truncate max-w-[190px]">{idx + 1}. {p.customerName}</span>
                      <span className="text-emerald-700 font-black text-base dir-ltr">{Number(p.amount || 0).toLocaleString('en-US')} د.ع</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-500 mt-0.5">
                      <span>{p.dateStr}{p.timeStr ? ` - ${p.timeStr}` : ''}</span>
                      {p.note && !p.note.includes('قسط يومي') && p.note !== 'تسديد قسط' && (
                        <span className="text-slate-600 truncate max-w-[130px]">{p.note}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Total Collected Amount at the end (خط اجمالي تسديدات مضاعف) */}
            <div className="bg-emerald-500/10 px-4 py-3.5 rounded-2xl border-2 border-emerald-500 text-center space-y-1">
              <div className="flex justify-between items-center text-sm font-black text-emerald-950">
                <span>إجمالي التحصيلات:</span>
                <span className="text-xs font-black bg-emerald-200/80 text-emerald-800 px-2.5 py-0.5 rounded-md">
                  {receipt.paymentsCount || receipt.paymentsList?.length || 0} تسديد
                </span>
              </div>
              <div className="text-3xl font-black text-emerald-800 dir-ltr my-1 leading-tight">
                {totalMoney}
              </div>
              <div className="text-xs font-bold text-emerald-700">
                ({amountInWords})
              </div>
            </div>

            {/* Print timestamp */}
            <div className="text-xs font-bold text-slate-500 text-center mt-3">
              تاريخ الطباعة: {receipt.dateStr} - {receipt.timeStr}
            </div>
          </div>
        </div>

        {/* Action Buttons Sticky Footer */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
          {/* Main Primary Print Button (Direct Instant Print) */}
          <button
            onClick={() => directPrintRepReceipt(receipt)}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-blue-100" />
            <span>طباعة مباشرة الآن ⚡</span>
          </button>

          {/* Direct RawBT Intent Button */}
          <button
            onClick={() => sendRepReceiptToRawBTDirectly(receipt)}
            className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 active:scale-98 text-white font-bold text-xs shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
            <span>إرسال نصي لتطبيق RawBT ⚡</span>
          </button>

          {/* Save PDF & Image */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => downloadRepReceiptPdf(receipt)}
              className="py-1.5 px-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-300" />
              <span>تنزيل PDF</span>
            </button>
            <button
              onClick={() => downloadRepReceiptImage(receipt)}
              className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-100" />
              <span>حفظ صورة PNG</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => shareRepReceiptImage(receipt)}
              className="py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-100" />
              <span>مشاركة الوصل</span>
            </button>
            <button
              onClick={handleCopyText}
              className="py-1.5 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-slate-300 transition-all cursor-pointer"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />}
              <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
