import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { numberToArabicWords } from './tafqeet';
import { getPaymentFormattedDateAndTime } from './dateUtils';
import { InstallmentContract, PaymentRecord } from '../types';

/**
 * Converts Arabic and Persian numerals to Western digits (0-9).
 */
export function convertArabicToEnglishDigits(str: string): string {
  if (!str) return '';
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(arabicNumerals[i], 'g'), String(i));
    result = result.replace(new RegExp(persianNumerals[i], 'g'), String(i));
  }
  return result;
}

/**
 * Normalizes Iraqi phone numbers for international WhatsApp links (e.g. 964780xxxxxxx).
 */
export function formatIraqiPhoneForWhatsApp(rawPhone: string | undefined | null): string | null {
  if (!rawPhone) return null;
  const converted = convertArabicToEnglishDigits(rawPhone);
  let clean = converted.replace(/[^0-9]/g, '');
  if (!clean || clean.length < 9) return null;

  if (clean.startsWith('00964')) {
    clean = clean.substring(2);
  } else if (clean.startsWith('07')) {
    clean = '964' + clean.substring(1);
  } else if (clean.startsWith('7') && clean.length === 10) {
    clean = '964' + clean;
  } else if (!clean.startsWith('964') && clean.length === 10) {
    clean = '964' + clean;
  }

  return clean;
}

/**
 * Formats a clean, high-clarity Arabic text statement for WhatsApp.
 */
export function buildCustomerPaymentStatementText({
  contract,
  payments,
  isAr = true,
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  isAr?: boolean;
}): string {
  const customerName = contract?.customerName || payments[0]?.customerName || 'الزبون';
  const itemName = contract?.itemName || '—';
  const phone = contract?.customerPhone || '';
  const totalPrice = Number(contract?.totalPrice || 0);
  const advance = Number(contract?.advancePayment || 0);
  const netDue = Math.max(0, totalPrice - advance);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? 0) || 0), 0);
  const remaining = Math.max(0, netDue - totalPaid);
  const isFinished = remaining <= 0;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-CA');

  const paymentsLines = payments
    .map((p, idx) => {
      const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      const noteStr = cleanNote ? ` (${cleanNote})` : '';
      const repStr = p.repName ? ` - مندوب: ${p.repName}` : '';
      return `${idx + 1}. 🗓️ ${dateStr} ${timeStr}: *${amount.toLocaleString('en-US')} د.ع*${repStr}${noteStr}`;
    })
    .join('\n');

  return `*الكرار للموبايل والتقسيط*
📄 *كشف وسجل تسديدات الزبون*
التاريخ: ${printDateStr}
--------------------------------
👤 *الزبون:* ${customerName}
${phone ? `📱 *الهاتف:* ${phone}\n` : ''}📦 *المادة:* ${itemName}
💰 *المبلغ الكلي:* ${totalPrice.toLocaleString('en-US')} د.ع
${advance > 0 ? `💵 *المقدمة:* ${advance.toLocaleString('en-US')} د.ع\n` : ''}✅ *إجمالي الواصل:* ${totalPaid.toLocaleString('en-US')} د.ع
⏳ *المتبقي المطلوب:* ${remaining.toLocaleString('en-US')} د.ع
📌 *حالة العقد:* ${isFinished ? '✅ منتهي ومكتمل' : '⏳ قيد التسديد'}
--------------------------------
📋 *تفاصيل حركات التسديد:*
${paymentsLines || 'لا توجد دفعات مسجلة بعد'}
--------------------------------
💵 *المجموع الكلي للواصل:* ${totalPaid.toLocaleString('en-US')} د.ع
(${numberToArabicWords(totalPaid)})

_الكرار للموبايل والتقسيط - وثيقة كشف حساب معتمدة_`.trim();
}

/**
 * Opens WhatsApp chat directly to the customer's phone number with the formatted statement.
 */
export function openCustomerWhatsAppDirect({
  phone,
  text,
}: {
  phone: string;
  text: string;
}): boolean {
  const cleanPhone = formatIraqiPhoneForWhatsApp(phone);
  if (!cleanPhone) return false;

  const encodedText = encodeURIComponent(text);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  const waAppUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`;

  try {
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
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

/**
 * Universal PDF Sharer
 * Shares PDF directly to native share sheet (WhatsApp, Telegram, Messenger, etc.).
 * Strictly DOES NOT save or auto-download files to the user's device storage
 * to respect the user's preference ("ماريد يحفض بالجهاز يشارك فقط").
 */
export async function sharePdfBlob({
  filename,
  pdfBlob,
  title,
  text,
  dialogTitle,
}: {
  filename: string;
  pdfBlob: Blob;
  title?: string;
  text?: string;
  dialogTitle?: string;
}): Promise<{ success: boolean; method: string; error?: string }> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const shareTitle = title || 'مشاركة تقرير PDF';
  const modalDialogTitle = dialogTitle || shareTitle;

  // 1. CAPACITOR NATIVE (Android APK / iOS)
  const isCapacitor =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.() === 'android');

  if (isCapacitor) {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || '';
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(pdfBlob);
      const base64Data = await base64Promise;

      // Write strictly to temporary Cache directory (auto-purged, not saved to persistent user storage)
      const writeResult = await Filesystem.writeFile({
        path: cleanFilename,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      const fileUri =
        writeResult.uri ||
        (
          await Filesystem.getUri({
            path: cleanFilename,
            directory: Directory.Cache,
          })
        ).uri;

      // Pass `files: [fileUri]` so native apps (WhatsApp, Telegram, etc.) receive the actual PDF document file.
      // Do NOT pass `url: fileUri` as text, so WhatsApp doesn't send a link string instead of the document.
      await Share.share({
        title: shareTitle,
        files: [fileUri],
        dialogTitle: modalDialogTitle,
      });

      return { success: true, method: 'capacitor_share' };
    } catch (capErr: any) {
      console.warn('Capacitor native share error:', capErr);
      if (capErr?.message?.includes('cancel') || capErr?.name === 'AbortError') {
        return { success: true, method: 'user_cancelled' };
      }
    }
  }

  // 2. Web Share API with File object (Mobile Chrome / Android Web / Safari)
  if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
    try {
      const file = new File([pdfBlob], cleanFilename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: shareTitle,
        });
        return { success: true, method: 'navigator_share_file' };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError' || shareErr?.message?.includes('cancel')) {
        return { success: true, method: 'user_cancelled' };
      }
      console.warn('Navigator share file failed:', shareErr);
    }
  }

  // If sharing is not supported and user explicitly does NOT want auto-download:
  // Open the PDF in a clean temporary blob window for preview/sharing, NEVER force-download.
  try {
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { success: true, method: 'window_open_preview' };
  } catch (err: any) {
    return { success: false, method: 'failed', error: 'تعذر فتح نافذة المشاركة' };
  }
}

/**
 * Converts an HTML element container to a clean, exact jsPDF Blob.
 * Strictly avoids adding blank/trailing extra pages.
 */
async function renderHtmlToPdfBlob(htmlString: string): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // Standard A4 width at 96 DPI
  container.style.height = 'auto'; // Auto-height based purely on content
  container.style.background = '#ffffff';
  container.style.direction = 'rtl';
  container.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif";
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '-9999';
  container.innerHTML = htmlString;
  document.body.appendChild(container);

  try {
    // Ultra-short layout stabilization
    await new Promise((r) => setTimeout(r, 60));

    const canvas = await html2canvas(container, {
      scale: 2, // High resolution (300 DPI equivalent)
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfWidth = 210; // A4 width mm
    const pageHeight = 297; // A4 height mm
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Single Page Fit: if content height is within 1 page (with 10mm tolerance), strictly use 1 page!
    if (pdfHeight <= pageHeight + 10) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(pdfHeight, pageHeight));
      return pdf.output('blob');
    }

    // Multipage: only add an extra page if remaining content height is strictly > 25mm (eliminates blank trailing pages)
    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 25) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    try {
      document.body.removeChild(container);
    } catch (e) {}
  }
}

/**
 * Generates and shares a PDF report for a single customer's payments and contract statement.
 */
export async function shareCustomerPaymentsPdf({
  contract,
  payments,
  lang = 'ar',
  targetApp = 'whatsapp',
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  lang?: string;
  targetApp?: 'whatsapp' | 'all' | 'other';
}): Promise<{ success: boolean; method: string; error?: string }> {
  const isAr = lang === 'ar';
  const customerName = contract?.customerName || payments[0]?.customerName || (isAr ? 'زبون' : 'Customer');
  const itemName = contract?.itemName || '—';
  const phone = contract?.customerPhone || '—';
  const totalPrice = Number(contract?.totalPrice || 0);
  const advance = Number(contract?.advancePayment || 0);
  const netDue = Math.max(0, totalPrice - advance);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? 0) || 0), 0);
  const remaining = Math.max(0, netDue - totalPaid);
  const isFinished = remaining <= 0;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-CA');
  const printTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const paymentsRowsHtml = payments
    .map((p, idx) => {
      const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      const rep = p.repName || '—';
      return `
        <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 6px 6px; text-align: center; font-weight: bold; color: #64748b; font-size: 11px;">${idx + 1}</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: 800; color: #0f172a; font-size: 11.5px; direction: ltr;">${dateStr} ${timeStr}</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: 900; color: #047857; font-size: 12.5px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: bold; color: #334155; font-size: 11px;">${rep}</td>
          <td style="padding: 6px 6px; text-align: right; font-weight: 600; color: #475569; font-size: 11px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 16px 20px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f766e; padding-bottom: 10px; margin-bottom: 12px;">
        <div>
          <div style="font-size: 22px; font-weight: 900; color: #0f766e;">الكرار للموبايل والتقسيط</div>
          <div style="font-size: 13px; font-weight: bold; color: #64748b; margin-top: 1px;">كشف وسجل تسديدات الزبون</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 10.5px; font-weight: bold; color: #64748b;">تاريخ التصدير: <span style="direction: ltr; font-weight: 800; color: #0f172a;">${printDateStr} ${printTimeStr}</span></div>
          <div style="font-size: 10.5px; font-weight: bold; color: #64748b; margin-top: 2px;">عدد الحركات: <span style="font-weight: 900; color: #0f766e;">${payments.length}</span></div>
        </div>
      </div>

      <!-- Customer Summary Card -->
      <div style="background: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 12px; padding: 10px 14px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div>
            <span style="font-size: 11px; font-weight: bold; color: #0f766e;">اسم الزبون: </span>
            <span style="font-size: 16px; font-weight: 900; color: #134e4a;">${customerName}</span>
          </div>
          ${
            phone && phone !== '—'
              ? `<div><span style="font-size: 11px; font-weight: bold; color: #0f766e;">الهاتف: </span><span style="font-size: 13px; font-weight: 800; direction: ltr;">${phone}</span></div>`
              : ''
          }
          <div>
            <span style="font-size: 11px; font-weight: bold; color: #0f766e;">المادة: </span>
            <span style="font-size: 13px; font-weight: 800; color: #1e293b;">${itemName}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 8px; padding: 6px 8px; text-align: center;">
            <div style="font-size: 9.5px; font-weight: bold; color: #64748b;">المبلغ الكلي</div>
            <div style="font-size: 13px; font-weight: 900; color: #0284c7; direction: ltr;">${totalPrice.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 8px; padding: 6px 8px; text-align: center;">
            <div style="font-size: 9.5px; font-weight: bold; color: #64748b;">الواصل الكلي</div>
            <div style="font-size: 13px; font-weight: 900; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 8px; padding: 6px 8px; text-align: center;">
            <div style="font-size: 9.5px; font-weight: bold; color: #64748b;">المتبقي الباقي</div>
            <div style="font-size: 13px; font-weight: 900; color: #b91c1c; direction: ltr;">${remaining.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 8px; padding: 6px 8px; text-align: center;">
            <div style="font-size: 9.5px; font-weight: bold; color: #64748b;">حالة العقد</div>
            <div style="font-size: 12px; font-weight: 900; color: ${isFinished ? '#047857' : '#b45309'};">${isFinished ? 'منتهي ومكتمل' : 'قيد التسديد'}</div>
          </div>
        </div>
      </div>

      <!-- Payments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead>
          <tr style="background-color: #0f766e; color: #ffffff;">
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: center; width: 35px;">#</th>
            <th style="padding: 7px 6px; font-size: 11px; font-weight: 900; text-align: center; width: 130px;">التاريخ والوقت</th>
            <th style="padding: 7px 6px; font-size: 11px; font-weight: 900; text-align: center; width: 115px;">المبلغ المسدد</th>
            <th style="padding: 7px 6px; font-size: 11px; font-weight: 900; text-align: center; width: 110px;">المندوب</th>
            <th style="padding: 7px 6px; font-size: 11px; font-weight: 900; text-align: right;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRowsHtml || '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #94a3b8; font-weight: bold;">لا توجد تسديدات مسجلة</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 900;">
            <td colspan="2" style="padding: 8px 10px; text-align: right; font-size: 12px; color: #0f172a;">مجموع المبالغ المسددة:</td>
            <td style="padding: 8px 6px; text-align: center; font-size: 14px; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</td>
            <td colspan="2" style="padding: 8px 10px; text-align: right; font-size: 10.5px; color: #475569;">(${numberToArabicWords(totalPaid)})</td>
          </tr>
        </tfoot>
      </table>

      <!-- Bottom Signature & Verification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; font-size: 10.5px; color: #64748b;">
        <div>توقيع وختم الإدارة: ___________________</div>
        <div style="font-weight: bold;">الكرار للموبايل والتقسيط - وثيقة كشف حساب معتمدة</div>
      </div>
    </div>
  `;

  const pdfBlob = await renderHtmlToPdfBlob(htmlContent);
  const cleanName = customerName.replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `تسديدات_${cleanName}_${printDateStr}`;

  const isWhatsAppTarget = targetApp === 'whatsapp';
  const shareTitle = isWhatsAppTarget
    ? (isAr ? `إرسال كشف تسديدات الزبون (PDF) إلى واتساب: ${customerName}` : `Send customer statement (PDF) to WhatsApp: ${customerName}`)
    : (isAr ? `مشاركة كشف تسديدات الزبون (PDF): ${customerName}` : `Share customer statement (PDF): ${customerName}`);

  const dialogTitle = isWhatsAppTarget
    ? (isAr ? 'إرسال ملف PDF عبر واتساب الزبون' : 'Send PDF via Customer WhatsApp')
    : (isAr ? 'مشاركة ملف PDF عبر التطبيقات (تليكرام، ماسنجر...)' : 'Share PDF via Apps');

  return sharePdfBlob({
    filename,
    pdfBlob,
    title: shareTitle,
    text: `كشف وسجل تسديدات الزبون: ${customerName} بمجموع واصل ${totalPaid.toLocaleString('en-US')} د.ع`,
    dialogTitle,
  });
}

/**
 * High-level Customer Sharing Function:
 * Always generates and shares the PDF document file (📄 ملف بي دي اف وليس نص).
 * Passes the PDF file attachment to native sharing so WhatsApp receives the PDF file document.
 */
export async function shareCustomerPaymentsOrDirectWhatsApp({
  contract,
  payments,
  lang = 'ar',
  forceAppsChooser = false,
  targetApp = 'whatsapp',
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  lang?: string;
  forceAppsChooser?: boolean;
  targetApp?: 'whatsapp' | 'all' | 'other';
}): Promise<{ success: boolean; method: string; error?: string }> {
  // Always share the actual PDF document file directly (never plain text wa.me links)
  return shareCustomerPaymentsPdf({
    contract,
    payments,
    lang,
    targetApp: forceAppsChooser ? 'all' : targetApp,
  });
}

/**
 * Generates and shares a PDF report for ALL selected/filtered payments in General Payments View (صندوق التسديدات العامة).
 * Includes all selected payments across all customers and reps, with no single customer bias.
 */
export async function shareGeneralPaymentsPdf({
  payments,
  startDate,
  endDate,
  listName,
  lang = 'ar',
}: {
  payments: PaymentRecord[];
  startDate?: string;
  endDate?: string;
  listName?: string;
  lang?: string;
}): Promise<{ success: boolean; method: string; error?: string }> {
  const isAr = lang === 'ar';
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? 0) || 0), 0);
  const distinctCustomers = new Set(payments.map((p) => p.customerName || p.contractId)).size;

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-CA');
  const printTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const dateSubtitle =
    startDate || endDate
      ? `الفترة من: ${startDate || 'البداية'} إلى: ${endDate || 'اليوم'}`
      : 'الكشف الشامل لجميع التواريخ المسجلة';

  const paymentsRowsHtml = payments
    .map((p, idx) => {
      const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      return `
        <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 6px 6px; text-align: center; font-weight: bold; color: #64748b; font-size: 10px;">${idx + 1}</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: 800; color: #0f172a; font-size: 10.5px; direction: ltr;">${dateStr} ${timeStr}</td>
          <td style="padding: 6px 6px; text-align: right; font-weight: 900; color: #1e293b; font-size: 11.5px;">${p.customerName || '—'}</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: 900; color: #047857; font-size: 12px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 6px 6px; text-align: center; font-weight: bold; color: #334155; font-size: 10.5px;">${p.repName || '—'}</td>
          <td style="padding: 6px 6px; text-align: right; font-weight: 600; color: #64748b; font-size: 10px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 16px 20px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px;">
        <div>
          <div style="font-size: 22px; font-weight: 900; color: #0284c7;">الكرار للموبايل والتقسيط</div>
          <div style="font-size: 13px; font-weight: bold; color: #64748b; margin-top: 1px;">تقرير وسجل التسديدات العام (كافة الزبائن)</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 10.5px; font-weight: bold; color: #64748b;">تاريخ التصدير: <span style="direction: ltr; font-weight: 800; color: #0f172a;">${printDateStr} ${printTimeStr}</span></div>
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; margin-top: 2px;">${dateSubtitle}</div>
          ${listName ? `<div style="font-size: 10px; font-weight: bold; color: #64748b;">القائمة: ${listName}</div>` : ''}
        </div>
      </div>

      <!-- General Statistics Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 10px; padding: 8px 12px; text-align: center;">
          <div style="font-size: 10px; font-weight: bold; color: #166534;">إجمالي التحصيلات المقبوضة</div>
          <div style="font-size: 16px; font-weight: 900; color: #15803d; direction: ltr; margin-top: 2px;">${totalPaid.toLocaleString('en-US')} د.ع</div>
          <div style="font-size: 9.5px; font-weight: bold; color: #166534;">(${numberToArabicWords(totalPaid)})</div>
        </div>
        <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 10px; padding: 8px 12px; text-align: center;">
          <div style="font-size: 10px; font-weight: bold; color: #075985;">عدد حركات التسديد</div>
          <div style="font-size: 18px; font-weight: 900; color: #0284c7; margin-top: 2px;">${payments.length}</div>
          <div style="font-size: 9.5px; font-weight: bold; color: #075985;">حركة مسجلة</div>
        </div>
        <div style="background: #faf5ff; border: 1.5px solid #e9d5ff; border-radius: 10px; padding: 8px 12px; text-align: center;">
          <div style="font-size: 10px; font-weight: bold; color: #6b21a8;">عدد الزبائن المسددين</div>
          <div style="font-size: 18px; font-weight: 900; color: #7e22ce; margin-top: 2px;">${distinctCustomers}</div>
          <div style="font-size: 9.5px; font-weight: bold; color: #6b21a8;">زبون مشمول بالتقرير</div>
        </div>
      </div>

      <!-- Itemized Payments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead>
          <tr style="background-color: #0284c7; color: #ffffff;">
            <th style="padding: 7px 6px; font-size: 10px; font-weight: 900; text-align: center; width: 30px;">#</th>
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: center; width: 120px;">التاريخ والوقت</th>
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: right;">اسم الزبون</th>
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: center; width: 110px;">المبلغ (د.ع)</th>
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: center; width: 100px;">المندوب</th>
            <th style="padding: 7px 6px; font-size: 10.5px; font-weight: 900; text-align: right;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRowsHtml || '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8; font-weight: bold;">لا توجد تسديدات مسجلة</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 900;">
            <td colspan="3" style="padding: 8px 10px; text-align: right; font-size: 12px; color: #0f172a;">المجموع الإجمالي لكافة التسديدات:</td>
            <td style="padding: 8px 6px; text-align: center; font-size: 14px; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</td>
            <td colspan="2" style="padding: 8px 10px; text-align: right; font-size: 10.5px; color: #475569;">(${numberToArabicWords(totalPaid)})</td>
          </tr>
        </tfoot>
      </table>

      <!-- Bottom Signature & Verification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1; font-size: 10.5px; color: #64748b;">
        <div>توقيع وختم الإدارة: ___________________</div>
        <div style="font-weight: bold;">الكرار للموبايل والتقسيط - تقرير مالي معتمد</div>
      </div>
    </div>
  `;

  const pdfBlob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `سجل_التسديدات_العام_${startDate || 'بداية'}_إلى_${endDate || 'اليوم'}`;

  return sharePdfBlob({
    filename,
    pdfBlob,
    title: 'تقرير وسجل التسديدات العام',
    text: `تقرير وسجل التسديدات العام بمجموع ${totalPaid.toLocaleString('en-US')} د.ع لعدد ${payments.length} تسديد`,
    dialogTitle: 'اختر التطبيق لمشاركة تقرير التسديدات العام (تليكرام، واتساب، ماسنجر...)',
  });
}
