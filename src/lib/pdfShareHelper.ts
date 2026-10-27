import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { numberToArabicWords } from './tafqeet';
import { getPaymentFormattedDateAndTime } from './dateUtils';
import { InstallmentContract, PaymentRecord } from '../types';

/**
 * Universal PDF Sharer
 * Shares PDF directly on Android (via Native Share to WhatsApp/Telegram),
 * Web Share API on mobile browsers, or triggers instant download on desktop.
 */
export async function sharePdfBlob({
  filename,
  pdfBlob,
  title,
  text,
}: {
  filename: string;
  pdfBlob: Blob;
  title?: string;
  text?: string;
}): Promise<{ success: boolean; method: string; error?: string }> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  // 1. CAPACITOR NATIVE (Android APK / iOS)
  if (Capacitor.isNativePlatform()) {
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

      if (await Share.canShare().then((res) => res.value).catch(() => true)) {
        await Share.share({
          title: title || cleanFilename,
          text: text || 'تقرير ملف PDF',
          url: fileUri,
          dialogTitle: title || 'مشاركة ملف PDF',
        });
        return { success: true, method: 'capacitor_share' };
      }
    } catch (capErr) {
      console.warn('Capacitor PDF Share error, trying Documents directory save:', capErr);
    }
  }

  // 2. Web Share API with File object (Android Chrome / Mobile Browsers)
  if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
    try {
      const file = new File([pdfBlob], cleanFilename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || cleanFilename,
          text: text || 'تقرير ملف PDF',
        });
        return { success: true, method: 'navigator_share_file' };
      }
    } catch (shareErr: any) {
      if (shareErr?.name === 'AbortError') {
        return { success: true, method: 'user_cancelled' };
      }
      console.warn('Navigator share PDF failed, falling back to download:', shareErr);
    }
  }

  // 3. Browser Download Fallback
  try {
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cleanFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 2000);
    return { success: true, method: 'browser_download' };
  } catch (err: any) {
    console.error('Browser PDF download failed:', err);
    return { success: false, method: 'failed', error: err?.message };
  }
}

/**
 * Converts an HTML element container to a multi-page jsPDF Blob.
 */
async function renderHtmlToPdfBlob(htmlString: string): Promise<Blob> {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '794px'; // Standard A4 width at 96 DPI
  container.style.minHeight = '1123px';
  container.style.background = '#ffffff';
  container.style.direction = 'rtl';
  container.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif";
  container.style.boxSizing = 'border-box';
  container.style.zIndex = '-9999';
  container.innerHTML = htmlString;
  document.body.appendChild(container);

  try {
    // Wait for fonts & layout stabilization
    await new Promise((r) => setTimeout(r, 150));

    const canvas = await html2canvas(container, {
      scale: 2, // High resolution (crisp text & lines)
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
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    const pageHeight = 297; // A4 height mm

    let heightLeft = pdfHeight;
    let position = 0;

    if (pdfHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    } else {
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }
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
}: {
  contract?: InstallmentContract | null;
  payments: PaymentRecord[];
  lang?: string;
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
          <td style="padding: 7px 8px; text-align: center; font-weight: bold; color: #64748b; font-size: 11px;">${idx + 1}</td>
          <td style="padding: 7px 8px; text-align: center; font-weight: 800; color: #0f172a; font-size: 12px; direction: ltr;">${dateStr} ${timeStr}</td>
          <td style="padding: 7px 8px; text-align: center; font-weight: 900; color: #047857; font-size: 13px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 7px 8px; text-align: center; font-weight: bold; color: #334155; font-size: 11px;">${rep}</td>
          <td style="padding: 7px 8px; text-align: right; font-weight: 600; color: #475569; font-size: 11px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 24px 28px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f766e; padding-bottom: 14px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 24px; font-weight: 900; color: #0f766e;">الكرار للموبايل والتقسيط</div>
          <div style="font-size: 14px; font-weight: bold; color: #64748b; margin-top: 2px;">كشف وسجل تسديدات الزبون</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b;">تاريخ التصدير: <span style="direction: ltr; font-weight: 800; color: #0f172a;">${printDateStr} ${printTimeStr}</span></div>
          <div style="font-size: 11px; font-weight: bold; color: #64748b; margin-top: 2px;">عدد الحركات: <span style="font-weight: 900; color: #0f766e;">${payments.length}</span></div>
        </div>
      </div>

      <!-- Customer Summary Card -->
      <div style="background: #f0fdfa; border: 1.5px solid #99f6e4; border-radius: 14px; padding: 14px 18px; margin-bottom: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <span style="font-size: 12px; font-weight: bold; color: #0f766e;">اسم الزبون: </span>
            <span style="font-size: 18px; font-weight: 900; color: #134e4a;">${customerName}</span>
          </div>
          ${
            phone && phone !== '—'
              ? `<div><span style="font-size: 12px; font-weight: bold; color: #0f766e;">الهاتف: </span><span style="font-size: 14px; font-weight: 800; direction: ltr;">${phone}</span></div>`
              : ''
          }
          <div>
            <span style="font-size: 12px; font-weight: bold; color: #0f766e;">المادة: </span>
            <span style="font-size: 14px; font-weight: 800; color: #1e293b;">${itemName}</span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 8px;">
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 10px; padding: 8px 10px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b;">المبلغ الكلي</div>
            <div style="font-size: 14px; font-weight: 900; color: #0284c7; direction: ltr;">${totalPrice.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 10px; padding: 8px 10px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b;">الواصل الكلي</div>
            <div style="font-size: 14px; font-weight: 900; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 10px; padding: 8px 10px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b;">المتبقي الباقي</div>
            <div style="font-size: 14px; font-weight: 900; color: #b91c1c; direction: ltr;">${remaining.toLocaleString('en-US')} د.ع</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #ccfbf1; border-radius: 10px; padding: 8px 10px; text-align: center;">
            <div style="font-size: 10px; font-weight: bold; color: #64748b;">حالة العقد</div>
            <div style="font-size: 13px; font-weight: 900; color: ${isFinished ? '#047857' : '#b45309'};">${isFinished ? 'منتهي ومكتمل' : 'قيد التسديد'}</div>
          </div>
        </div>
      </div>

      <!-- Payments Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #0f766e; color: #ffffff;">
            <th style="padding: 9px 8px; font-size: 11px; font-weight: 900; text-align: center; width: 40px;">#</th>
            <th style="padding: 9px 8px; font-size: 12px; font-weight: 900; text-align: center; width: 140px;">التاريخ والوقت</th>
            <th style="padding: 9px 8px; font-size: 12px; font-weight: 900; text-align: center; width: 120px;">المبلغ المسدد</th>
            <th style="padding: 9px 8px; font-size: 12px; font-weight: 900; text-align: center; width: 120px;">المندوب</th>
            <th style="padding: 9px 8px; font-size: 12px; font-weight: 900; text-align: right;">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          ${paymentsRowsHtml || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #94a3b8; font-weight: bold;">لا توجد تسديدات مسجلة</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background-color: #e2e8f0; font-weight: 900;">
            <td colspan="2" style="padding: 10px 12px; text-align: right; font-size: 13px; color: #0f172a;">مجموع المبالغ المسددة:</td>
            <td style="padding: 10px 8px; text-align: center; font-size: 15px; color: #047857; direction: ltr;">${totalPaid.toLocaleString('en-US')} د.ع</td>
            <td colspan="2" style="padding: 10px 12px; text-align: right; font-size: 11px; color: #475569;">(${numberToArabicWords(totalPaid)})</td>
          </tr>
        </tfoot>
      </table>

      <!-- Bottom Signature & Verification -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 14px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
        <div>توقيع وختم الإدارة: ___________________</div>
        <div style="font-weight: bold;">الكرار للموبايل والتقسيط - وثيقة كشف حساب معتمدة</div>
      </div>
    </div>
  `;

  const pdfBlob = await renderHtmlToPdfBlob(htmlContent);
  const cleanName = customerName.replace(/[\/\\:*?"<>|]/g, '_');
  const filename = `تسديدات_${cleanName}_${printDateStr}`;

  return sharePdfBlob({
    filename,
    pdfBlob,
    title: `كشف تسديدات: ${customerName}`,
    text: `كشف وسجل تسديدات الزبون: ${customerName} بمجموع واصل ${totalPaid.toLocaleString('en-US')} د.ع`,
  });
}

/**
 * Generates and shares a PDF report for the Reps Payments Summary Box (صندوق التسديدات).
 */
export async function shareRepsPaymentsSummaryPdf({
  visiblePayments,
  activeRepStats,
  startDate,
  endDate,
  listLabel,
  lang = 'ar',
}: {
  visiblePayments: PaymentRecord[];
  activeRepStats: {
    rep: { id: string; name: string };
    paymentsCount: number;
    totalCollected: number;
    totalDebt: number;
  }[];
  startDate?: string;
  endDate?: string;
  listLabel?: string;
  lang?: string;
}): Promise<{ success: boolean; method: string; error?: string }> {
  const isAr = lang === 'ar';
  const totalCollectedAll = activeRepStats.reduce((sum, r) => sum + r.totalCollected, 0);
  const totalPaymentsCount = visiblePayments.length;
  const totalDebtsAll = activeRepStats.reduce((sum, r) => sum + r.totalDebt, 0);

  const now = new Date();
  const printDateStr = now.toLocaleDateString('en-CA');
  const printTimeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const dateSubtitle =
    startDate || endDate
      ? `الفترة من: ${startDate || 'البداية'} إلى: ${endDate || 'اليوم'}`
      : 'الكشف الشامل لجميع التواريخ المسجلة';

  // Delegate summary rows
  const repRowsHtml = activeRepStats
    .map((rs, idx) => `
      <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 7px 10px; font-weight: 800; font-size: 12px; color: #0f172a;">${rs.rep.name}</td>
        <td style="padding: 7px 10px; text-align: center; font-weight: 900; font-size: 12px; color: #0284c7;">${rs.paymentsCount}</td>
        <td style="padding: 7px 10px; text-align: center; font-weight: 900; font-size: 13px; color: #047857; direction: ltr;">${rs.totalCollected.toLocaleString('en-US')} د.ع</td>
        <td style="padding: 7px 10px; text-align: center; font-weight: 800; font-size: 12px; color: #b91c1c; direction: ltr;">${rs.totalDebt.toLocaleString('en-US')} د.ع</td>
      </tr>
    `)
    .join('');

  // Detailed payment rows
  const paymentRowsHtml = visiblePayments
    .map((p, idx) => {
      const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, isAr);
      const amount = Number(p.amountPaid ?? p.amount ?? 0);
      return `
        <tr style="border-bottom: 1px solid #cbd5e1; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #64748b; font-size: 10px;">${idx + 1}</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: 800; color: #0f172a; font-size: 11px; direction: ltr;">${dateStr} ${timeStr}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: 900; color: #1e293b; font-size: 12px;">${p.customerName || '—'}</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: 900; color: #047857; font-size: 12px; direction: ltr;">${amount.toLocaleString('en-US')} د.ع</td>
          <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #334155; font-size: 11px;">${p.repName || '—'}</td>
          <td style="padding: 6px 8px; text-align: right; font-weight: 600; color: #64748b; font-size: 10px;">${cleanNote || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <div style="padding: 24px 28px; direction: rtl; text-align: right; color: #0f172a; font-family: system-ui, -apple-system, sans-serif;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0284c7; padding-bottom: 14px; margin-bottom: 16px;">
        <div>
          <div style="font-size: 24px; font-weight: 900; color: #0284c7;">الكرار للموبايل والتقسيط</div>
          <div style="font-size: 14px; font-weight: bold; color: #64748b; margin-top: 2px;">تقرير صندوق التسديدات والتحصيلات اليومية</div>
        </div>
        <div style="text-align: left;">
          <div style="font-size: 11px; font-weight: bold; color: #64748b;">تاريخ التصدير: <span style="direction: ltr; font-weight: 800; color: #0f172a;">${printDateStr} ${printTimeStr}</span></div>
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; margin-top: 2px;">${dateSubtitle}</div>
          ${listLabel ? `<div style="font-size: 10px; font-weight: bold; color: #64748b;">القائمة: ${listLabel}</div>` : ''}
        </div>
      </div>

      <!-- Top Stats Cards -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px;">
        <div style="background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #166534;">إجمالي التحصيلات</div>
          <div style="font-size: 18px; font-weight: 900; color: #15803d; direction: ltr; margin-top: 2px;">${totalCollectedAll.toLocaleString('en-US')} د.ع</div>
          <div style="font-size: 10px; font-weight: bold; color: #166534;">(${numberToArabicWords(totalCollectedAll)})</div>
        </div>
        <div style="background: #f0f9ff; border: 1.5px solid #bae6fd; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #075985;">عدد التسديدات المنفذة</div>
          <div style="font-size: 20px; font-weight: 900; color: #0284c7; margin-top: 2px;">${totalPaymentsCount}</div>
          <div style="font-size: 10px; font-weight: bold; color: #075985;">تسديد مقبوض</div>
        </div>
        <div style="background: #fff1f2; border: 1.5px solid #fecdd3; border-radius: 12px; padding: 10px 14px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #9f1239;">إجمالي الديون المتبقية</div>
          <div style="font-size: 18px; font-weight: 900; color: #be123c; direction: ltr; margin-top: 2px;">${totalDebtsAll.toLocaleString('en-US')} د.ع</div>
          <div style="font-size: 10px; font-weight: bold; color: #9f1239;">المطالبة الإجمالية</div>
        </div>
      </div>

      <!-- Delegate Summary Table -->
      <div style="margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: 900; color: #1e293b; margin-bottom: 6px;">جدول تحصيلات المندوبين:</div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #0284c7; color: #ffffff;">
              <th style="padding: 8px 10px; font-size: 11px; font-weight: 900; text-align: right;">المندوب</th>
              <th style="padding: 8px 10px; font-size: 11px; font-weight: 900; text-align: center; width: 100px;">عدد التسديدات</th>
              <th style="padding: 8px 10px; font-size: 11px; font-weight: 900; text-align: center; width: 140px;">المبلغ المحصل</th>
              <th style="padding: 8px 10px; font-size: 11px; font-weight: 900; text-align: center; width: 140px;">إجمالي الديون المتبقية</th>
            </tr>
          </thead>
          <tbody>
            ${repRowsHtml || '<tr><td colspan="4" style="padding: 14px; text-align: center; color: #94a3b8;">لا توجد بيانات مندوبين</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background-color: #e2e8f0; font-weight: 900;">
              <td style="padding: 8px 10px; text-align: right; font-size: 12px;">المجموع الكلي:</td>
              <td style="padding: 8px 10px; text-align: center; font-size: 12px; color: #0284c7;">${totalPaymentsCount}</td>
              <td style="padding: 8px 10px; text-align: center; font-size: 14px; color: #047857; direction: ltr;">${totalCollectedAll.toLocaleString('en-US')} د.ع</td>
              <td style="padding: 8px 10px; text-align: center; font-size: 13px; color: #b91c1c; direction: ltr;">${totalDebtsAll.toLocaleString('en-US')} د.ع</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Itemized Payments Table -->
      <div>
        <div style="font-size: 13px; font-weight: 900; color: #1e293b; margin-bottom: 6px;">تفاصيل حركات التسديد المسجلة:</div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #334155; color: #ffffff;">
              <th style="padding: 7px 8px; font-size: 10px; font-weight: 900; text-align: center; width: 35px;">#</th>
              <th style="padding: 7px 8px; font-size: 11px; font-weight: 900; text-align: center; width: 120px;">التاريخ والوقت</th>
              <th style="padding: 7px 8px; font-size: 11px; font-weight: 900; text-align: right;">اسم الزبون</th>
              <th style="padding: 7px 8px; font-size: 11px; font-weight: 900; text-align: center; width: 110px;">المبلغ (د.ع)</th>
              <th style="padding: 7px 8px; font-size: 11px; font-weight: 900; text-align: center; width: 100px;">المندوب</th>
              <th style="padding: 7px 8px; font-size: 11px; font-weight: 900; text-align: right;">ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${paymentRowsHtml || '<tr><td colspan="6" style="padding: 16px; text-align: center; color: #94a3b8;">لا توجد تسديدات مسجلة</td></tr>'}
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #64748b;">
        <div>الكرار للموبايل والتقسيط - تقرير مالي رسمي</div>
        <div>صفحة 1 من 1</div>
      </div>
    </div>
  `;

  const pdfBlob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `صندوق_التسديدات_${startDate || 'بداية'}_إلى_${endDate || 'اليوم'}`;

  return sharePdfBlob({
    filename,
    pdfBlob,
    title: 'تقرير صندوق التسديدات والتحصيلات',
    text: `تقرير صندوق التسديدات بمجموع تحصيل ${totalCollectedAll.toLocaleString('en-US')} د.ع`,
  });
}
