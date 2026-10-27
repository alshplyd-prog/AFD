import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { numberToArabicWords } from './tafqeet';
import { getPaymentFormattedDateAndTime } from './dateUtils';
import { getPaymentReceiptBalances } from './paymentCalculator';
import { InstallmentContract, PaymentRecord } from '../types';
import { getPublicShareBaseUrl } from './apiConfig';

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
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? 0) || 0), 0);

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-CA');

  const paymentsLines = payments
    .map((p, idx) => {
      const { dateStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      const noteStr = cleanNote ? ` (${cleanNote})` : '';
      const repStr = p.repName ? ` - مندوب: ${p.repName}` : '';
      return `${idx + 1}. ${dateStr}: ${amount.toLocaleString('en-US')} د.ع${repStr}${noteStr}`;
    })
    .join('\n');

  return `اسم الزبون: ${customerName}
إجمالي الواصل: ${totalPaid.toLocaleString('en-US')} د.ع
التاريخ: ${printDateStr}
تفاصيل التسديدات:
${paymentsLines || 'لا توجد دفعات مسجلة بعد'}`.trim();
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

  const paymentsRowsHtml = payments
    .map((p, idx) => {
      const { dateStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      const rep = p.repName || '—';
      return `
        <tr style="border-bottom: 2px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 16px 12px; text-align: center; font-weight: 900; color: #475569; font-size: 20px;">${idx + 1}</td>
          <td style="padding: 16px 12px; text-align: center; font-weight: 900; color: #0f766e; font-size: 25px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 16px 12px; text-align: center; font-weight: 900; color: #0f172a; font-size: 20px; direction: ltr;">${dateStr}</td>
          <td style="padding: 16px 12px; text-align: center; font-weight: 800; color: #1e293b; font-size: 20px;">${rep}</td>
          <td style="padding: 16px 12px; text-align: right; font-weight: 700; color: #334155; font-size: 19px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 30px 36px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #0f766e; padding-bottom: 18px; margin-bottom: 24px;">
        <div>
          <div style="font-size: 32px; font-weight: 900; color: #0f766e; letter-spacing: -0.5px;">كشف وسجل تسديدات الزبون</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 20px; font-weight: 800; color: #475569;">تاريخ التصدير: <span style="direction: ltr; font-weight: 900; color: #0f172a;">${printDateStr}</span></div>
          <div style="font-size: 20px; font-weight: 800; color: #475569; margin-top: 6px;">عدد الحركات: <span style="font-weight: 900; color: #0f766e; font-size: 24px;">${payments.length}</span></div>
        </div>
      </div>

      <!-- Customer Summary Card -->
      <div style="background: #f0fdfa; border: 3px solid #2dd4bf; border-radius: 20px; padding: 22px 26px; margin-bottom: 26px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; border-bottom: 2px solid #99f6e4; padding-bottom: 14px;">
          <div>
            <span style="font-size: 22px; font-weight: 800; color: #0f766e;">اسم الزبون: </span>
            <span style="font-size: 34px; font-weight: 900; color: #0f172a;">${customerName}</span>
          </div>
          ${
            phone && phone !== '—'
              ? `<div><span style="font-size: 22px; font-weight: 800; color: #0f766e;">الهاتف: </span><span style="font-size: 26px; font-weight: 900; color: #0f172a; direction: ltr;">${phone}</span></div>`
              : ''
          }
          <div>
            <span style="font-size: 22px; font-weight: 800; color: #0f766e;">المادة: </span>
            <span style="font-size: 26px; font-weight: 900; color: #0f172a;">${itemName}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;">
          <div style="background: #ffffff; border: 2px solid #99f6e4; border-radius: 16px; padding: 16px 12px; text-align: center;">
            <div style="font-size: 18px; font-weight: 800; color: #64748b;">المبلغ الكلي</div>
            <div style="font-size: 26px; font-weight: 900; color: #0284c7; direction: ltr; margin-top: 6px;">${totalPrice.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 2px solid #99f6e4; border-radius: 16px; padding: 16px 12px; text-align: center;">
            <div style="font-size: 18px; font-weight: 800; color: #64748b;">الواصل الكلي</div>
            <div style="font-size: 26px; font-weight: 900; color: #047857; direction: ltr; margin-top: 6px;">${totalPaid.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 2px solid #99f6e4; border-radius: 16px; padding: 16px 12px; text-align: center;">
            <div style="font-size: 18px; font-weight: 800; color: #64748b;">المتبقي الباقي</div>
            <div style="font-size: 26px; font-weight: 900; color: #b91c1c; direction: ltr; margin-top: 6px;">${remaining.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 2px solid #99f6e4; border-radius: 16px; padding: 16px 12px; text-align: center;">
            <div style="font-size: 18px; font-weight: 800; color: #64748b;">حالة العقد</div>
            <div style="font-size: 24px; font-weight: 900; color: ${isFinished ? '#047857' : '#b45309'}; margin-top: 6px;">${isFinished ? 'منتهي ومكتمل' : 'قيد التسديد'}</div>
          </div>
        </div>
      </div>

      <!-- Payments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 26px; border: 2px solid #cbd5e1; border-radius: 14px; overflow: hidden;">
        <thead>
          <tr style="background-color: #0f766e; color: #ffffff;">
            <th style="padding: 16px 12px; font-size: 22px; font-weight: 900; text-align: center; width: 60px;">#</th>
            <th style="padding: 16px 12px; font-size: 22px; font-weight: 900; text-align: center; width: 190px;">المبلغ المسدد</th>
            <th style="padding: 16px 12px; font-size: 22px; font-weight: 900; text-align: center; width: 180px;">التاريخ</th>
            <th style="padding: 16px 12px; font-size: 22px; font-weight: 900; text-align: center; width: 170px;">المندوب</th>
            <th style="padding: 16px 12px; font-size: 22px; font-weight: 900; text-align: right;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRowsHtml || '<tr><td colspan="5" style="padding: 32px; text-align: center; color: #94a3b8; font-weight: bold; font-size: 22px;">لا توجد تسديدات مسجلة</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 900; border-top: 3px solid #cbd5e1;">
            <td style="padding: 16px 18px; text-align: right; font-size: 22px; color: #0f172a;">مجموع المبالغ المسددة:</td>
            <td style="padding: 16px 12px; text-align: center; font-size: 28px; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</td>
            <td colspan="3" style="padding: 16px 18px; text-align: right; font-size: 20px; color: #334155; font-weight: 800;">(${numberToArabicWords(totalPaid)})</td>
          </tr>
        </tfoot>
      </table>

      <!-- Bottom Signature & Verification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 26px; padding-top: 18px; border-top: 2px dashed #94a3b8; font-size: 20px; color: #475569;">
        <div style="font-weight: 800;">توقيع وختم الإدارة: ___________________</div>
        <div style="font-weight: 900; color: #0f766e; font-size: 22px;">وثيقة كشف حساب معتمدة</div>
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
    : (isAr ? 'مشاركة ملف PDF عبر التطبيقات (تليكرام، واتساب، ماسنجر...)' : 'Share PDF via Apps');

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
 * If targetApp === 'whatsapp':
 * Directly opens customer's WhatsApp chat with the full formatted breakdown of payments and statement.
 * If targetApp === 'other' or 'all':
 * Generates and shares the actual PDF document file directly.
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
  const isAr = lang === 'ar';

  // Direct customer WhatsApp chat if requested
  if (targetApp === 'whatsapp' && !forceAppsChooser) {
    const rawPhone = contract?.customerPhone || (payments[0] as any)?.customerPhone || '';
    let cleanPhone = formatIraqiPhoneForWhatsApp(rawPhone);

    if (!cleanPhone && typeof window !== 'undefined') {
      const custName = contract?.customerName || payments[0]?.customerName || 'الزبون';
      const input = window.prompt(
        `الزبون (${custName}) لا يملك رقم هاتف مسجل.\nيرجى كتابة رقم هاتف الزبون (أو رقم الواتساب):`,
        ''
      );
      if (input && input.trim()) {
        cleanPhone = formatIraqiPhoneForWhatsApp(input.trim());
      }
    }

    if (cleanPhone) {
      const origin = getPublicShareBaseUrl();
      const contractId = contract?.id || (payments[0] as any)?.contractId || '';
      const statementUrl = contractId ? `${origin}/s/${encodeURIComponent(contractId)}` : origin;

      // User explicit request: "والنص فقط افتح الرابط لعرض التسديدات"
      const statementText = `افتح الرابط لعرض التسديدات:
${statementUrl}`;

      const opened = openCustomerWhatsAppDirect({
        phone: cleanPhone,
        text: statementText,
      });

      if (opened) {
        return { success: true, method: 'direct_whatsapp' };
      }
    }
  }

  // Fallback to generating and sharing the PDF document file across apps
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

  const dateSubtitle =
    startDate || endDate
      ? `الفترة من: ${startDate || 'البداية'} إلى: ${endDate || 'اليوم'}`
      : 'الكشف الشامل لجميع التواريخ المسجلة';

  const paymentsRowsHtml = payments
    .map((p, idx) => {
      const { dateStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      return `
        <tr style="border-bottom: 1.5px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 8px 8px; text-align: center; font-weight: 800; color: #64748b; font-size: 13px;">${idx + 1}</td>
          <td style="padding: 8px 8px; text-align: right; font-weight: 900; color: #1e293b; font-size: 14.5px;">${p.customerName || '—'}</td>
          <td style="padding: 8px 8px; text-align: center; font-weight: 900; color: #047857; font-size: 16px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 8px 8px; text-align: center; font-weight: 900; color: #0f172a; font-size: 13.5px; direction: ltr;">${dateStr}</td>
          <td style="padding: 8px 8px; text-align: center; font-weight: 800; color: #334155; font-size: 13.5px;">${p.repName || '—'}</td>
          <td style="padding: 8px 8px; text-align: right; font-weight: 700; color: #64748b; font-size: 13px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 20px 24px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3.5px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 22px; font-weight: 900; color: #0284c7; letter-spacing: -0.5px;">تقرير وسجل التسديدات العام (كافة الزبائن)</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 13px; font-weight: 800; color: #475569;">تاريخ التصدير: <span style="direction: ltr; font-weight: 900; color: #0f172a;">${printDateStr}</span></div>
          <div style="font-size: 13px; font-weight: 900; color: #0284c7; margin-top: 3px;">${dateSubtitle}</div>
          ${listName ? `<div style="font-size: 12.5px; font-weight: 800; color: #475569;">القائمة: ${listName}</div>` : ''}
        </div>
      </div>

      <!-- General Statistics Grid -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 12.5px; font-weight: 800; color: #166534;">إجمالي التحصيلات المقبوضة</div>
          <div style="font-size: 20px; font-weight: 900; color: #15803d; direction: ltr; margin-top: 3px;">${totalPaid.toLocaleString('en-US')} د.ع</div>
          <div style="font-size: 12px; font-weight: 800; color: #166534; margin-top: 2px;">(${numberToArabicWords(totalPaid)})</div>
        </div>
        <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 12.5px; font-weight: 800; color: #075985;">عدد حركات التسديد</div>
          <div style="font-size: 22px; font-weight: 900; color: #0284c7; margin-top: 3px;">${payments.length}</div>
          <div style="font-size: 12px; font-weight: 800; color: #075985;">حركة مسجلة</div>
        </div>
        <div style="background: #faf5ff; border: 1.5px solid #e9d5ff; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 12.5px; font-weight: 800; color: #6b21a8;">عدد الزبائن المسددين</div>
          <div style="font-size: 22px; font-weight: 900; color: #7e22ce; margin-top: 3px;">${distinctCustomers}</div>
          <div style="font-size: 12px; font-weight: 800; color: #6b21a8;">زبون مشمول بالتقرير</div>
        </div>
      </div>

      <!-- Itemized Payments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px;">
        <thead>
          <tr style="background-color: #0284c7; color: #ffffff;">
            <th style="padding: 10px 8px; font-size: 13.5px; font-weight: 900; text-align: center; width: 40px;">#</th>
            <th style="padding: 10px 8px; font-size: 14px; font-weight: 900; text-align: right;">اسم الزبون</th>
            <th style="padding: 10px 8px; font-size: 14px; font-weight: 900; text-align: center; width: 135px;">المبلغ (د.ع)</th>
            <th style="padding: 10px 8px; font-size: 14px; font-weight: 900; text-align: center; width: 130px;">التاريخ</th>
            <th style="padding: 10px 8px; font-size: 14px; font-weight: 900; text-align: center; width: 125px;">المندوب</th>
            <th style="padding: 10px 8px; font-size: 14px; font-weight: 900; text-align: right;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRowsHtml || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: bold; font-size: 14px;">لا توجد تسديدات مسجلة</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 900;">
            <td colspan="2" style="padding: 10px 12px; text-align: right; font-size: 15px; color: #0f172a;">المجموع الإجمالي لكافة التسديدات:</td>
            <td style="padding: 10px 8px; text-align: center; font-size: 19px; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</td>
            <td colspan="3" style="padding: 10px 12px; text-align: right; font-size: 13.5px; color: #475569;">(${numberToArabicWords(totalPaid)})</td>
          </tr>
        </tfoot>
      </table>

      <!-- Bottom Signature & Verification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; padding-top: 12px; border-top: 1.5px dashed #94a3b8; font-size: 13px; color: #475569;">
        <div style="font-weight: 800;">توقيع وختم الإدارة: ___________________</div>
        <div style="font-weight: 900; color: #0284c7;">تقرير مالي معتمد</div>
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

export async function sharePaymentReceiptWhatsApp({
  payment,
  contract,
  allPayments = [],
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
  shopTitle?: string;
}): Promise<boolean> {
  const customerName = payment.customerName || contract?.customerName || 'زبون';
  const phone = contract?.customerPhone || '';
  const amount = Number(payment.amountPaid ?? payment.amount ?? 0);
  const { dateStr } = getPaymentFormattedDateAndTime(payment, true);
  const snapshot = getPaymentReceiptBalances(payment, contract || null, allPayments);

  const text = `اسم الزبون: ${customerName}
الواصل: ${snapshot.totalPaid.toLocaleString('en-US')} د.ع
المبلغ رقماً: ${amount.toLocaleString('en-US')} د.ع
المبلغ كتابة: ${numberToArabicWords(amount)}
الباقي: ${snapshot.remainingBalance.toLocaleString('en-US')} د.ع
التاريخ: ${dateStr}`.trim();

  return openCustomerWhatsAppDirect({
    phone: phone || (payment as any).customerPhone || '',
    text,
  });
}


