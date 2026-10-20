/**
 * Statement PDF & Printable Ledger Generator
 */
import { formatZeroBalanceCountdown, calculateAccumulatedInstallment } from './dateUtils';
import { openUniversalPdfPrintWindow } from './bluetoothPrinter';

export interface StatementPrintData {
  shopTitle?: string;
  listName: string;
  startDate?: string;
  endDate?: string;
  contracts: {
    id: string;
    customerName: string;
    itemName: string;
    dailyInstallment: number;
    totalPaid: number;
    totalPrice: number;
    advancePayment: number;
    remainingBalance?: number;
    status?: string;
    startDate?: string;
    createdAt?: string;
    completedAt?: string;
  }[];
  availableDates: string[];
  paymentMatrix: Record<string, Record<string, number>>;
  isAr?: boolean;
}

export function openStatementPrintWindow(data: StatementPrintData) {
  const shopTitle = data.shopTitle || 'الكرار للموبايل';
  
  // totals
  const totalAccumulated = data.contracts.reduce((sum, c) => {
    const acc = calculateAccumulatedInstallment(c, data.endDate);
    return sum + (acc.accumulated > 0 ? acc.accumulated : 0);
  }, 0);
  const totalDaily = data.contracts.reduce((sum, c) => sum + (c.dailyInstallment || 0), 0);
  const totalPaid = data.contracts.reduce((sum, c) => sum + (c.totalPaid || 0), 0);
  const totalRemaining = data.contracts.reduce((sum, c) => sum + Math.max(0, (c.totalPrice - c.advancePayment) - (c.totalPaid || 0)), 0);

  // Generate date columns
  const dateHeadersHtml = data.availableDates
    .map(
      (d) =>
        `<th style="padding: 6px 4px; border: 1px solid #0284c7; background-color: #0284c7; color: white; text-align: center; font-size: 11px; white-space: nowrap;">${d}</th>`
    )
    .join('');

  // Generate rows
  const rowsHtml = data.contracts
    .map((c, idx) => {
      const remaining = Math.max(0, c.totalPrice - c.advancePayment - (c.totalPaid || 0));
      const custPayments = data.paymentMatrix[c.id] || {};
      const accInfo = calculateAccumulatedInstallment(c, data.endDate);

      const dateCellsHtml = data.availableDates
        .map((dateStr) => {
          const paidOnDate = custPayments[dateStr] || 0;
          const cellBg = paidOnDate > 0 ? '#d1fae5' : 'transparent';
          const cellColor = paidOnDate > 0 ? '#065f46' : '#94a3b8';
          return `<td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px; font-weight: bold; background-color: ${cellBg}; color: ${cellColor};">${
            paidOnDate > 0 ? paidOnDate.toLocaleString('en-US') : '0'
          }</td>`;
        })
        .join('');

      const isZero = remaining <= 0;
      return `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold; font-size: 11px; text-align: right;">
          ${idx + 1}. ${c.customerName}
          ${isZero ? `<br/><span style="font-size: 8px; color: #d97706; font-weight: bold;">${formatZeroBalanceCountdown(c, true)}</span>` : ''}
        </td>
        <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 11px; color: ${accInfo.isOverdueDueAll ? '#b91c1c' : '#b45309'}; background-color: ${accInfo.isOverdueDueAll ? '#fee2e2' : 'transparent'};">
          ${accInfo.isOverdueDueAll ? '<b style="color:#b91c1c;padding:2px 6px;border-radius:4px;font-size:12px;">م</b>' : (accInfo.accumulated > 0 ? accInfo.accumulated.toLocaleString('en-US') : '0')}
        </td>
        <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-size: 11px; color: #1e3a8a;">${(c.dailyInstallment || 0).toLocaleString('en-US')}</td>
        <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-size: 11px; color: #047857;">${(c.totalPaid || 0).toLocaleString('en-US')}</td>
        <td style="padding: 6px 4px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; font-size: 11px; color: #be123c;">${remaining.toLocaleString('en-US')}</td>
        ${dateCellsHtml}
      </tr>
    `;
    })
    .join('');

  // Generate footer column sums
  const footerSumsHtml = data.availableDates
    .map((dateStr) => {
      const daySum = data.contracts.reduce((sum, c) => {
        const custPayments = data.paymentMatrix[c.id] || {};
        return sum + (custPayments[dateStr] || 0);
      }, 0);
      return `<td style="padding: 6px 4px; border: 1px solid #64748b; text-align: center; font-weight: 900; font-size: 11px; background-color: ${
        daySum > 0 ? '#a7f3d0' : '#e2e8f0'
      }; color: ${daySum > 0 ? '#064e3b' : '#64748b'};">${daySum > 0 ? daySum.toLocaleString('en-US') : '0'}</td>`;
    })
    .join('');

  const nowStr = new Date().toLocaleString('en-US');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب الأقساط - ${data.listName}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        body {
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background: #ffffff;
          color: #0f172a;
          margin: 0;
          padding: 12px;
          direction: rtl;
        }
        .header-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .title {
          font-size: 18px;
          font-weight: 900;
          color: #0369a1;
          margin: 0 0 4px 0;
        }
        .subtitle {
          font-size: 11px;
          color: #475569;
          font-weight: bold;
        }
        .meta-info {
          font-size: 11px;
          color: #334155;
          text-align: left;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        th {
          background-color: #0284c7;
          color: #ffffff;
          padding: 8px 4px;
          font-size: 11px;
          font-weight: 800;
          border: 1px solid #0284c7;
        }
        tfoot tr {
          background-color: #e2e8f0;
          font-weight: 900;
        }
        tfoot td {
          border: 1px solid #64748b;
          padding: 8px 4px;
        }
        .print-btn {
          position: fixed;
          top: 10px;
          left: 10px;
          background-color: #0284c7;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          font-size: 12px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          z-index: 9999;
        }
        @media print {
          .print-btn {
            display: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div>
          <h1 class="title">${shopTitle} - كشف حسابات الأقساط</h1>
          <div class="subtitle">القائمة: <strong>${data.listName}</strong> ${
    data.startDate || data.endDate ? `| الفترة: من (${data.startDate || '—'}) إلى (${data.endDate || '—'})` : ''
  }</div>
        </div>
        <div class="meta-info">
          <div>تاريخ التصدير: ${nowStr}</div>
          <div>عدد الزبائن: ${data.contracts.length}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align: right; min-width: 120px;">الزبون</th>
            <th style="width: 75px; background-color: #0369a1;">المتراكم</th>
            <th style="width: 75px;">القسط اليومي</th>
            <th style="width: 80px;">الواصل</th>
            <th style="width: 80px;">المتبقي</th>
            ${dateHeadersHtml}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td style="text-align: right; font-weight: 900; font-size: 11px;">الإجمالي الكلي</td>
            <td style="text-align: center; font-weight: 900; color: #b45309; font-size: 11px;">${totalAccumulated.toLocaleString('en-US')}</td>
            <td style="text-align: center; font-weight: 900; color: #1e3a8a; font-size: 11px;">${totalDaily.toLocaleString('en-US')}</td>
            <td style="text-align: center; font-weight: 900; color: #047857; font-size: 11px;">${totalPaid.toLocaleString('en-US')}</td>
            <td style="text-align: center; font-weight: 900; color: #be123c; font-size: 11px;">${totalRemaining.toLocaleString('en-US')}</td>
            ${footerSumsHtml}
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  openUniversalPdfPrintWindow(htmlContent, false, 'كشف حسابات الأقساط');
}
