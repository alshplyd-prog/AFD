import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { numberToArabicWords } from './tafqeet';
import { getPaymentFormattedDateAndTime } from './dateUtils';
import { InstallmentContract, PaymentRecord } from '../types';
import { fetchWithFallback, getApiBaseUrl, getPublicShareBaseUrl } from './apiConfig';
import { getPaymentReceiptBalances } from './paymentCalculator';

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
 * Formats a clean, professional, high-clarity Arabic text receipt for WhatsApp
 * matching the exact structure and details of the printed thermal receipt.
 */
export function buildPaymentReceiptWhatsAppText({
  payment,
  contract,
  allPayments = [],
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
  shopTitle?: string;
}): string {
  const snapshot = getPaymentReceiptBalances(payment, contract, allPayments);
  const customerName = payment.customerName || contract?.customerName || 'زبون';
  const remaining = snapshot.remainingBalance || 0;
  const paidAmount = snapshot.paidAmount || Number(payment.amountPaid ?? payment.amount ?? 0) || 0;
  const totalPaid = snapshot.totalPaid || paidAmount;
  const amountInWords = numberToArabicWords(paidAmount);
  const { dateStr } = getPaymentFormattedDateAndTime(payment, true);

  let text = `*وصل تسديد*\n`;
  text += `*اسم الزبون:* ${customerName}\n`;
  text += `*الواصل:* ${totalPaid.toLocaleString('en-US')} د.ع\n`;
  text += `*المبلغ رقما:* ${paidAmount.toLocaleString('en-US')} د.ع\n`;
  text += `*المبلغ كتابة:* ${amountInWords}\n`;
  text += `*الباقي:* ${remaining.toLocaleString('en-US')} د.ع\n`;
  text += `*التاريخ:* ${dateStr}\n`;
  text += `*وصل معتمد*`;

  return text.trim();
}

/**
  * Generates a clean PDF Blob of the official thermal/single payment receipt.
  */
export async function generateSinglePaymentReceiptPdfBlob({
  payment,
  contract,
  allPayments = [],
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
}): Promise<Blob> {
  const snapshot = getPaymentReceiptBalances(payment, contract, allPayments);
  const customerName = payment.customerName || contract?.customerName || 'زبون';
  const itemName = contract?.itemName || '—';
  const paidAmount = snapshot.paidAmount || Number(payment.amountPaid ?? payment.amount ?? 0) || 0;
  const totalPaid = snapshot.totalPaid || paidAmount;
  const remaining = snapshot.remainingBalance || 0;
  const totalPrice = snapshot.totalPrice || contract?.totalPrice || 0;
  const amountInWords = numberToArabicWords(paidAmount);
  const { dateStr, timeStr } = getPaymentFormattedDateAndTime(payment, true);

  const htmlContent = `
    <div style="width: 750px; padding: 40px 36px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; border: 4px solid #0f766e; border-radius: 24px; margin: 0 auto; box-sizing: border-box;">
      <div style="text-align: center; border-bottom: 3px dashed #0f766e; padding-bottom: 20px; margin-bottom: 24px;">
        <div style="font-size: 34px; font-weight: 900; color: #0f766e; letter-spacing: -0.5px;">وصل استلام قسط رسمي</div>
      </div>

      <div style="font-size: 24px; line-height: 2.2; color: #1e293b;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding: 8px 0;">
          <span style="font-weight: bold; color: #475569; font-size: 24px;">اسم الزبون:</span>
          <span style="font-weight: 900; color: #0f172a; font-size: 28px;">${customerName}</span>
        </div>
        ${itemName && itemName !== '—' ? `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding: 8px 0;">
          <span style="font-weight: bold; color: #475569; font-size: 24px;">المادة:</span>
          <span style="font-weight: bold; color: #334155; font-size: 25px;">${itemName}</span>
        </div>
        ` : ''}
        ${totalPrice > 0 ? `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding: 8px 0;">
          <span style="font-weight: bold; color: #475569; font-size: 24px;">المبلغ الكلي:</span>
          <span style="font-weight: 900; color: #0284c7; direction: ltr; font-size: 26px;">${totalPrice.toLocaleString('en-US')} د.ع</span>
        </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding: 8px 0; color: #047857;">
          <span style="font-weight: bold; font-size: 24px;">مجموع الواصل الكلي:</span>
          <span style="font-weight: 900; direction: ltr; font-size: 28px;">${totalPaid.toLocaleString('en-US')} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; color: #0f766e; font-weight: 900; margin: 18px 0; background: #f0fdf4; border: 2.5px solid #a7f3d0; padding: 16px 20px; border-radius: 16px;">
          <span style="font-size: 28px;">مبلغ الدفعة رقماً:</span>
          <span style="direction: ltr; font-size: 36px; font-weight: 900; color: #047857;">${paidAmount.toLocaleString('en-US')} د.ع</span>
        </div>
        <div style="font-size: 22px; color: #047857; font-weight: bold; background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 12px 18px; border-radius: 14px; margin-bottom: 14px;">
          <span>المبلغ كتابة:</span> <span style="font-weight: 900; color: #0f172a;">${amountInWords}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding: 8px 0; color: #b91c1c;">
          <span style="font-weight: bold; font-size: 24px;">المبلغ المتبقي:</span>
          <span style="font-weight: 900; direction: ltr; font-size: 28px;">${remaining.toLocaleString('en-US')} د.ع</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; color: #64748b; font-size: 22px; margin-top: 6px;">
          <span style="font-weight: bold;">تاريخ التسديد:</span>
          <span style="font-weight: 900; direction: ltr; color: #334155; font-size: 22px;">${dateStr} ${timeStr}</span>
        </div>
      </div>

      <div style="text-align: center; border-top: 3px dashed #0f766e; padding-top: 18px; margin-top: 24px; font-size: 24px; font-weight: 900; color: #0f766e;">
        وصل رسمي معتمد
      </div>
    </div>
  `;

  const { pdfBlob } = await renderHtmlToPdfAndImage(htmlContent);
  return pdfBlob;
}

/**
 * Shares an individual payment text receipt directly to the customer's WhatsApp,
 * including a short link to the official PDF receipt document.
 */
export async function sharePaymentReceiptWhatsApp({
  payment,
  contract,
  allPayments = [],
  shopTitle = 'الكرار للموبايل والتقسيط',
}: {
  payment: PaymentRecord;
  contract?: InstallmentContract | null;
  allPayments?: PaymentRecord[];
  shopTitle?: string;
}): Promise<boolean> {
  let receiptText = buildPaymentReceiptWhatsAppText({
    payment,
    contract,
    allPayments,
    shopTitle,
  });

  // Generate and upload PDF receipt short link
  try {
    const pdfBlob = await generateSinglePaymentReceiptPdfBlob({ payment, contract, allPayments });
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
      reader.readAsDataURL(pdfBlob);
    });

    const safeTimestamp = Date.now();
    const safePdfName = `receipt_${safeTimestamp}.pdf`;

    const uploadRes = await fetchWithFallback('/api/save-statement-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: safePdfName, base64Data }),
    }, 15000);

    if (uploadRes && uploadRes.ok) {
      const data = await uploadRes.json();
      if (data?.url) {
        let serverOrigin = '';
        if (uploadRes.url && (uploadRes.url.startsWith('http://') || uploadRes.url.startsWith('https://')) && !uploadRes.url.includes('localhost') && !uploadRes.url.includes('127.0.0.1')) {
          try {
            serverOrigin = new URL(uploadRes.url).origin;
          } catch (e) {}
        }
        if (!serverOrigin) {
          serverOrigin = getPublicShareBaseUrl();
        }
        const pdfPublicUrl = `${serverOrigin.replace(/\/+$/, '')}${data.url}`;
        receiptText += `\n\n📄 *رابط الوصل (PDF):*\n${pdfPublicUrl}`;
      }
    }
  } catch (err) {
    console.warn('Single payment receipt PDF upload failed:', err);
  }

  const rawPhone = contract?.customerPhone || (payment as any)?.customerPhone;
  const cleanPhone = formatIraqiPhoneForWhatsApp(rawPhone);

  const nativeAndroid =
    typeof window !== 'undefined'
      ? (window as any).AndroidInterface || (window as any).AndroidPrinter
      : null;

  if (cleanPhone && nativeAndroid && typeof nativeAndroid.openWhatsAppChatWithText === 'function') {
    const ok = nativeAndroid.openWhatsAppChatWithText(cleanPhone, receiptText);
    if (ok) return true;
  }

  const encodedMsg = encodeURIComponent(receiptText);
  const waAppUrl = cleanPhone
    ? `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`
    : `whatsapp://send?text=${encodedMsg}`;
  const waWebUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://api.whatsapp.com/send?text=${encodedMsg}`;

  try {
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    if (isMobile) {
      window.location.href = waAppUrl;
      setTimeout(() => {
        window.open(waWebUrl, '_blank');
      }, 500);
    } else {
      window.open(waWebUrl, '_blank');
    }
    return true;
  } catch (e) {
    window.open(waWebUrl, '_blank');
    return true;
  }
}

/**
 * Universal PDF Sharer
 * Shares PDF directly to native share sheet or directly to Customer WhatsApp.
 * Strictly DOES NOT save or auto-download files to the user's persistent device storage
 * to respect the user's preference ("ماريد يحفض بالجهاز يشارك فقط").
 */
export async function sharePdfBlob({
  filename,
  pdfBlob,
  title,
  text,
  dialogTitle,
  phone,
  targetApp = 'all',
}: {
  filename: string;
  pdfBlob: Blob;
  title?: string;
  text?: string;
  dialogTitle?: string;
  phone?: string | null;
  targetApp?: 'whatsapp' | 'all' | 'other';
}): Promise<{ success: boolean; method: string; error?: string }> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const shareTitle = title || 'مشاركة تقرير PDF';
  const modalDialogTitle = dialogTitle || shareTitle;
  const cleanPhone = formatIraqiPhoneForWhatsApp(phone);

  const getBase64 = async (): Promise<string> => {
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        const res = reader.result as string;
        const b64 = res.split(',')[1] || '';
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });
  };

  // 1. DIRECT TO CUSTOMER WHATSAPP
  // When targetApp === 'whatsapp', STRICTLY target WhatsApp directly and NEVER show the all-apps system chooser
  if (targetApp === 'whatsapp') {
    // 1A. Android Native Interface (inside APK)
    const nativeAndroid =
      typeof window !== 'undefined'
        ? (window as any).AndroidInterface || (window as any).AndroidPrinter
        : null;

    if (nativeAndroid && typeof nativeAndroid.sharePdfToWhatsApp === 'function') {
      try {
        const base64Data = await getBase64();
        const success = nativeAndroid.sharePdfToWhatsApp(base64Data, cleanFilename, cleanPhone || '');
        if (success) {
          return { success: true, method: 'android_native_whatsapp' };
        }
      } catch (nativeErr) {
        console.warn('AndroidInterface.sharePdfToWhatsApp failed, falling back:', nativeErr);
      }
    }

    // 1B. Direct WhatsApp with PDF Link (No explanation, only "لعرض تسديدات  افتح الرابط ادناه")
    if (cleanPhone) {
      let pdfPublicUrl = '';
      try {
        const base64Data = await getBase64();
        const safeTimestamp = Date.now();
        const safeName = `statement_${safeTimestamp}.pdf`;
        const res = await fetchWithFallback('/api/save-statement-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: safeName, base64Data }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.url) {
            const baseUrl = getApiBaseUrl().replace(/\/+$/, '');
            pdfPublicUrl = `${baseUrl}${data.url}`;
          }
        }
      } catch (e) {
        console.warn('Failed to upload PDF link for WhatsApp:', e);
      }

      const fullMessage = pdfPublicUrl
        ? `لعرض تسديدات  افتح الرابط ادناه:\n${pdfPublicUrl}`
        : 'لعرض تسديدات  افتح الرابط ادناه';

      if (nativeAndroid && typeof nativeAndroid.openWhatsAppChatWithText === 'function') {
        const ok = nativeAndroid.openWhatsAppChatWithText(cleanPhone, fullMessage);
        if (ok) {
          return { success: true, method: 'whatsapp_direct_with_pdf_link_native' };
        }
      }

      const encodedMsg = encodeURIComponent(fullMessage);
      const waAppUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
      const waWebUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      if (isMobile) {
        window.location.href = waAppUrl;
        setTimeout(() => {
          window.open(waWebUrl, '_blank');
        }, 500);
      } else {
        window.open(waWebUrl, '_blank');
      }

      return { success: true, method: 'whatsapp_direct_with_pdf_link' };
    }
  }

  // 2. CAPACITOR NATIVE GENERAL SHARE (Used for 'تطبيقات أخرى' or when no customer phone)
  const isCapacitor =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.() === 'android');

  if (isCapacitor) {
    try {
      const base64Data = await getBase64();

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

      // Pass `files: [fileUri]` so native apps receive the actual PDF document file
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

  // 3. Web Share API with File object (Used for 'تطبيقات أخرى' on Web)
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

  // 4. General Fallback preview (never force-download)
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
 * Converts an HTML element container to both a clean jsPDF Blob and a crisp high-res Image.
 */
async function renderHtmlToPdfAndImage(htmlString: string): Promise<{
  pdfBlob: Blob;
  imageBlob: Blob;
  imageBase64: string;
}> {
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
    // Layout stabilization
    await new Promise((r) => setTimeout(r, 60));

    const canvas = await html2canvas(container, {
      scale: 2, // High resolution (300 DPI equivalent)
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imageBase64 = imgData.split(',')[1] || '';
    const imageBlob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || new Blob()), 'image/jpeg', 0.95);
    });

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
      const pdfBlob = pdf.output('blob');
      return { pdfBlob, imageBlob, imageBase64 };
    }

    // Multipage
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

    const pdfBlob = pdf.output('blob');
    return { pdfBlob, imageBlob, imageBase64 };
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
  phone,
  lang = 'ar',
  targetApp = 'whatsapp',
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  phone?: string | null;
  lang?: string;
  targetApp?: 'whatsapp' | 'all' | 'other';
}): Promise<{ success: boolean; method: string; error?: string }> {
  const isAr = lang === 'ar';
  const customerName = contract?.customerName || payments[0]?.customerName || (isAr ? 'زبون' : 'Customer');
  const itemName = contract?.itemName || '—';
  const resolvedPhone = phone || contract?.customerPhone || '—';
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
            resolvedPhone && resolvedPhone !== '—'
              ? `<div><span style="font-size: 11px; font-weight: bold; color: #0f766e;">الهاتف: </span><span style="font-size: 13px; font-weight: 800; direction: ltr;">${resolvedPhone}</span></div>`
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

  const { pdfBlob, imageBlob, imageBase64 } = await renderHtmlToPdfAndImage(htmlContent);
  const cleanName = customerName.replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `تسديدات_${cleanName}_${printDateStr}`;
  const isWhatsAppTarget = targetApp === 'whatsapp';
  const cleanPhone = formatIraqiPhoneForWhatsApp(resolvedPhone);

  if (isWhatsAppTarget) {
    if (cleanPhone) {
      let pdfPublicUrl = '';
      try {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
          reader.readAsDataURL(pdfBlob);
        });

        const safeTimestamp = Date.now();
        const safePdfName = `statement_${safeTimestamp}.pdf`;

        const uploadRes = await fetchWithFallback('/api/save-statement-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: safePdfName, base64Data }),
        }, 15000);

        if (uploadRes && uploadRes.ok) {
          const data = await uploadRes.json();
          if (data?.url) {
            let serverOrigin = '';
            if (uploadRes.url && (uploadRes.url.startsWith('http://') || uploadRes.url.startsWith('https://')) && !uploadRes.url.includes('localhost') && !uploadRes.url.includes('127.0.0.1')) {
              try {
                serverOrigin = new URL(uploadRes.url).origin;
              } catch (e) {}
            }
            if (!serverOrigin) {
              serverOrigin = getPublicShareBaseUrl();
            }
            pdfPublicUrl = `${serverOrigin.replace(/\/+$/, '')}${data.url}`;
          }
        }
      } catch (uploadErr) {
        console.warn('PDF upload warning:', uploadErr);
      }

      // Exact user instruction: "ارسل رابط بي دي اف بس لاتكتب ويا شرح فقط اكتب  لعرض تسديدات  افتح الرابط ادناه"
      const messageText = pdfPublicUrl
        ? `لعرض تسديدات  افتح الرابط ادناه:\n${pdfPublicUrl}`
        : `لعرض تسديدات  افتح الرابط ادناه:\n${getPublicShareBaseUrl()}`;

      // 1. If running inside Android APK with native interface
      const nativeAndroid =
        typeof window !== 'undefined'
          ? (window as any).AndroidInterface || (window as any).AndroidPrinter
          : null;

      if (nativeAndroid && typeof nativeAndroid.openWhatsAppChatWithText === 'function') {
        const ok = nativeAndroid.openWhatsAppChatWithText(cleanPhone, messageText);
        if (ok) {
          return { success: true, method: 'whatsapp_pdf_link_native' };
        }
      }

      // 2. Web / Mobile Chrome / Capacitor URL scheme
      const encodedMsg = encodeURIComponent(messageText);
      const waAppUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
      const waWebUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;

      const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
      if (isMobile) {
        window.location.href = waAppUrl;
        setTimeout(() => {
          window.open(waWebUrl, '_blank');
        }, 500);
      } else {
        window.open(waWebUrl, '_blank');
      }

      return { success: true, method: 'whatsapp_pdf_link_direct' };
    }
  }

  // If "تطبيقات أخرى" (Other apps) was requested:
  return sharePdfBlob({
    filename,
    pdfBlob,
    title: `مشاركة كشف تسديدات الزبون: ${customerName}`,
    text: `كشف وسجل تسديدات الزبون: ${customerName}`,
    dialogTitle: 'مشاركة كشف الحساب عبر التطبيقات (تليكرام، ماسنجر...)',
    phone: resolvedPhone,
    targetApp,
  });
}

/**
 * High-level Customer Sharing Function:
 * Always generates and shares the PDF document file (📄 ملف بي دي اف وليس نص).
 * Directly enters customer's WhatsApp chat with the PDF document when targetApp === 'whatsapp'.
 */
export async function shareCustomerPaymentsOrDirectWhatsApp({
  contract,
  payments,
  phone,
  lang = 'ar',
  forceAppsChooser = false,
  targetApp = 'whatsapp',
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  phone?: string | null;
  lang?: string;
  forceAppsChooser?: boolean;
  targetApp?: 'whatsapp' | 'all' | 'other';
}): Promise<{ success: boolean; method: string; error?: string }> {
  const resolvedPhone = phone || contract?.customerPhone;
  return shareCustomerPaymentsPdf({
    contract,
    payments,
    phone: resolvedPhone,
    lang,
    targetApp: forceAppsChooser ? 'other' : targetApp,
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

  const { pdfBlob } = await renderHtmlToPdfAndImage(htmlContent);
  const filename = `سجل_التسديدات_العام_${startDate || 'بداية'}_إلى_${endDate || 'اليوم'}`;

  return sharePdfBlob({
    filename,
    pdfBlob,
    title: 'تقرير وسجل التسديدات العام',
    text: `تقرير وسجل التسديدات العام بمجموع ${totalPaid.toLocaleString('en-US')} د.ع لعدد ${payments.length} تسديد`,
    dialogTitle: 'اختر التطبيق لمشاركة تقرير التسديدات العام (تليكرام، واتساب، ماسنجر...)',
  });
}
