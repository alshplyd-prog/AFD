import React from 'react';
import { DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';

export interface ReceiptData {
  shopTitle?: string;
  receiptNo: string | number;
  customerName: string;
  itemName: string;
  totalPrice: number;
  totalPaid: number;
  remainingBalance: number;
  paidAmount: number;
  amountInWords?: string;
  dateStr: string;
  timeStr: string;
  isDuplicate?: boolean;
  warningNote?: string;
  template?: 'template_1' | 'template_2';
}

interface ReceiptPrintTemplateProps {
  receipt: ReceiptData | null;
}

export const ReceiptPrintTemplate: React.FC<ReceiptPrintTemplateProps> = ({ receipt }) => {
  if (!receipt) return null;

  const isTemplate2 = receipt.template === 'template_2';

  if (isTemplate2) {
    return (
      <div id="thermal-receipt-printable" className="hidden print:block font-sans dir-rtl text-black bg-white p-0.5 w-[54mm] max-w-[54mm] mx-auto text-[13px] leading-snug">
        <style>{`
          @media print {
            html, body {
              width: 54mm !important;
              min-width: 54mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #fff !important;
            }
            body * {
              visibility: hidden !important;
            }
            #thermal-receipt-printable, #thermal-receipt-printable * {
              visibility: visible !important;
            }
            #thermal-receipt-printable {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 54mm !important;
              max-width: 54mm !important;
              margin: 0 !important;
              padding: 1.5mm 2.5mm !important;
              box-sizing: border-box !important;
              display: block !important;
            }
            @page {
              size: 54mm auto;
              margin: 0;
            }
          }
        `}</style>

        {/* Fixed Title at top for Template 2: الكرار للموبايل */}
        <div className="text-center font-black text-[21px] mb-1 pb-1 border-b-2 border-black text-black tracking-wide">
          الكرار للموبايل
        </div>

        {/* Table 1: Customer Details */}
        <table className="w-full border-collapse border border-black my-1 text-[13px] font-black">
          <tbody>
            <tr>
              <td className="w-[38%] py-1 px-1.5 bg-gray-100 border-l border-black text-right">الزبون</td>
              <td className="py-1 px-1.5 text-left dir-ltr font-black text-[15px]">{receipt.customerName}</td>
            </tr>
          </tbody>
        </table>

        {/* Warning Notice for Duplicate Receipt (Below customer name) */}
        {(receipt.isDuplicate || receipt.warningNote) && (
          <div className="my-1.5 p-2 border-2 border-black rounded text-center font-black text-black bg-white">
            <div className="text-[15px] font-black mb-0.5">⚠️ تنبية هام ⚠️</div>
            <div className="text-[12px] font-black leading-snug">
              {receipt.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
            </div>
          </div>
        )}

        {/* Table 2: Financial Accounts Grid */}
        <table className="w-full border-collapse border border-black my-1 text-[13px] font-black">
          <tbody>
            <tr className="border-b border-black">
              <td className="w-[42%] py-1 px-1.5 bg-gray-100 border-l border-black text-right">المبلغ الكلي</td>
              <td className="py-1 px-1.5 text-left dir-ltr font-black">{Number(receipt.totalPrice || 0).toLocaleString('en-US')} د.ع</td>
            </tr>
            <tr className="border-b border-black">
              <td className="w-[42%] py-1 px-1.5 bg-gray-100 border-l border-black text-right">المبلغ الواصل</td>
              <td className="py-1 px-1.5 text-left dir-ltr font-black">{Number(receipt.totalPaid || 0).toLocaleString('en-US')} د.ع</td>
            </tr>
            <tr className="border-b-2 border-black bg-gray-50">
              <td className="w-[42%] py-1 px-1.5 bg-gray-200 border-l border-black text-right text-[14px]">المبلغ المتبقي</td>
              <td className="py-1 px-1.5 text-left dir-ltr font-black text-[17px]">{Number(receipt.remainingBalance || 0).toLocaleString('en-US')} د.ع</td>
            </tr>
            {/* Highlighted Paid Amount Row */}
            <tr className="border-2 border-black bg-gray-100">
              <td className="w-[42%] py-1.5 px-1.5 border-l-2 border-black text-right text-[14px] font-black">المبلغ المدفوع</td>
              <td className="py-1.5 px-1.5 text-left dir-ltr font-black text-[19px]">{Number(receipt.paidAmount || 0).toLocaleString('en-US')} د.ع</td>
            </tr>
          </tbody>
        </table>

        {/* Table 3: Tafqeet and Timing */}
        <table className="w-full border-collapse border border-black my-1 text-[12px] font-black">
          <tbody>
            <tr className="border-b border-black">
              <td className="w-[35%] py-1 px-1.5 bg-gray-100 border-l border-black text-right">المبلغ كتابة</td>
              <td className="py-1 px-1.5 text-left dir-ltr font-black text-[13px] leading-tight">{receipt.amountInWords || 'صفر دينار'}</td>
            </tr>
            <tr className="border-b border-black">
              <td className="w-[35%] py-0.5 px-1.5 bg-gray-100 border-l border-black text-right">تاريخ الدفع</td>
              <td className="py-0.5 px-1.5 text-left dir-ltr">{receipt.dateStr}</td>
            </tr>
            <tr>
              <td className="w-[35%] py-0.5 px-1.5 bg-gray-100 border-l border-black text-right">الوقت</td>
              <td className="py-0.5 px-1.5 text-left dir-ltr">{receipt.timeStr}</td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-1 text-center font-bold text-black text-[12px]">
          شكراً لتعاملكم معنا
        </div>
      </div>
    );
  }

  const formatMoney = (val: number) => {
    return val.toLocaleString('en-US') + ' دع';
  };

  return (
    <div id="thermal-receipt-printable" className="hidden print:block font-sans dir-rtl text-black bg-white p-0.5 w-[54mm] max-w-[54mm] mx-auto text-[14px] leading-snug">
      <style>{`
        @media print {
          html, body {
            width: 54mm !important;
            min-width: 54mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-printable, #thermal-receipt-printable * {
            visibility: visible !important;
          }
          #thermal-receipt-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 54mm !important;
            max-width: 54mm !important;
            margin: 0 !important;
            padding: 1.5mm 3mm !important;
            box-sizing: border-box !important;
            display: block !important;
          }
          @page {
            size: 54mm auto;
            margin: 0;
          }
        }
      `}</style>

      {/* Header (optional if custom shopTitle provided) */}
      {receipt.shopTitle && receipt.shopTitle !== 'الكرار للموبايل' && (
        <div className="text-center font-black text-[20px] mb-1 text-black tracking-wide">
          {receipt.shopTitle}
        </div>
      )}

      {/* Structured Thermal Table */}
      <table className="w-full border-collapse my-0.5 text-[14px] font-extrabold">
        <tbody>
          {receipt.receiptNo && (
            <tr>
              <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap w-[40%] text-[14px]">رقم الوصل</td>
              <td className="py-0.5 text-left font-black text-black dir-ltr w-[60%] text-[15px]">{receipt.receiptNo}</td>
            </tr>
          )}

          <tr className="border-b border-dashed border-gray-400">
            <td className="py-1 pr-1.5 text-right font-black text-black whitespace-nowrap text-[16px]">الزبون</td>
            <td className="py-1 text-left font-black text-black dir-ltr text-[18px]">{receipt.customerName}</td>
          </tr>

          {/* Warning Notice for Duplicate Receipt - مباشرة بعد الزبون لتجنب قصه من المندوب */}
          {(receipt.isDuplicate || receipt.warningNote) && (
            <tr>
              <td colSpan={2} className="py-2">
                <div className="p-2.5 border-[2.5px] border-black rounded-lg text-center font-black text-black bg-white">
                  <div className="text-[18px] font-black mb-1">⚠️ تنبية هام ⚠️</div>
                  <div className="text-[15.5px] font-black leading-snug">
                    {receipt.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                  </div>
                </div>
              </td>
            </tr>
          )}

          <tr>
            <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[14px]">المادة المباعة</td>
            <td className="py-0.5 text-left font-black text-black dir-ltr text-[15px]">{receipt.itemName}</td>
          </tr>

          <tr>
            <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[14px]">المبلغ الكلي</td>
            <td className="py-0.5 text-left font-black text-black dir-ltr text-[15px]">{Number(receipt.totalPrice || 0).toLocaleString('en-US')} د.ع</td>
          </tr>

          <tr>
            <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[14px]">المبلغ الواصل</td>
            <td className="py-0.5 text-left font-black text-black dir-ltr text-[15px]">{Number(receipt.totalPaid || 0).toLocaleString('en-US')} د.ع</td>
          </tr>

          <tr className="border-b-2 border-dashed border-gray-600 bg-gray-50">
            <td className="py-1.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[17px]">المبلغ المتبقي</td>
            <td className="py-1.5 text-left font-black text-black dir-ltr text-[21px]">{Number(receipt.remainingBalance || 0).toLocaleString('en-US')} د.ع</td>
          </tr>

          {/* مستطيل بارز وكبير على المبلغ المدفوع */}
          <tr>
            <td colSpan={2} className="py-2">
              <div style={{ border: '2.5px solid #000', borderRadius: '9px', padding: '6px 8px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#000' }}>المبلغ المدفوع:</span>
                <span style={{ fontSize: '24px', fontWeight: 900, color: '#047857', direction: 'ltr' }}>
                  {Number(receipt.paidAmount || 0).toLocaleString('en-US')} د.ع
                </span>
              </div>
            </td>
          </tr>

          <tr className="bg-gray-50/70">
            <td className="py-1.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[15px]">المبلغ كتابة</td>
            <td className="py-1.5 text-left font-black text-[16px] text-black dir-ltr leading-tight">{receipt.amountInWords || 'صفر دينار'}</td>
          </tr>

          <tr>
            <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[13px]">تاريخ الدفع</td>
            <td className="py-0.5 text-left font-black text-black dir-ltr text-[13px]">{receipt.dateStr}</td>
          </tr>

          <tr>
            <td className="py-0.5 pr-1.5 text-right font-black text-black whitespace-nowrap text-[13px]">الوقت</td>
            <td className="py-0.5 text-left font-black text-black dir-ltr text-[13px]">{receipt.timeStr}</td>
          </tr>
        </tbody>
      </table>

      {/* Footer Divider */}
      <div className="mt-1.5 pt-0.5 text-center font-bold text-black">
        <div className="font-mono my-0.5 text-base font-black tracking-widest">==================</div>
      </div>
    </div>
  );
};
