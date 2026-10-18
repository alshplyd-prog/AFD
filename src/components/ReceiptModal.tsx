import React, { useEffect, useState } from 'react';
import { X, CheckCircle, ExternalLink, Download, Copy, Info, FileText, Share2, Printer, Image as ImageIcon } from 'lucide-react';
import { numberToArabicWords } from '../lib/tafqeet';
import { openThermalPrintWindow, directPrintReceipt, sendToRawBTDirectly, downloadReceiptImage, shareReceiptImage, generateReceiptCanvasDataUrl, sendReceiptToRawBTIntent, sendReceiptPdfToRawBTIntent, downloadReceiptPdf, DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';
import { openReceiptPdfWindow } from '../lib/receiptPdf';

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

interface ReceiptModalProps {
  receipt: ReceiptData | null;
  isOpen: boolean;
  onClose: () => void;
  autoTriggerPrint?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receipt,
  isOpen,
  onClose,
  autoTriggerPrint,
}) => {
  const [imageUrl, setImageUrl] = useState<string>('');

  // Mobile Back Button / Gesture support (popstate)
  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ modal: 'receipt_modal' }, '');

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && receipt) {
      const amountInWords = receipt.amountInWords || numberToArabicWords(receipt.paidAmount);
      const fullObj = { ...receipt, amountInWords };
      const url = generateReceiptCanvasDataUrl(fullObj as any);
      setImageUrl(url);

      if (autoTriggerPrint) {
        setTimeout(() => {
          sendToRawBTDirectly(fullObj as any);
        }, 300);
      }
    } else {
      setImageUrl('');
    }
  }, [isOpen, receipt, autoTriggerPrint]);

  if (!isOpen || !receipt) return null;

  const amountInWords = receipt.amountInWords || numberToArabicWords(receipt.paidAmount);

  const fullReceiptObj = {
    ...receipt,
    amountInWords,
  };

  const handleDownloadImage = () => {
    downloadReceiptImage(fullReceiptObj as any);
  };

  const handleShareImage = () => {
    shareReceiptImage(fullReceiptObj as any);
  };

  const handleThermalPrint = async () => {
    try {
      await directPrintReceipt(fullReceiptObj as any);
    } catch (e) {
      sendToRawBTDirectly(fullReceiptObj as any);
    }
  };

  const handleCopyText = () => {
    const isDuplicate = receipt.isDuplicate || Boolean(receipt.warningNote);
    const warningText = receipt.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING;
    const duplicateWarningText = isDuplicate
      ? `\n⚠️ تنبية هام:\n${warningText}\n`
      : '';

    const receiptText = `
الزبون: ${receipt.customerName}${duplicateWarningText}
المادة المباعة: ${receipt.itemName}
المبلغ الكلي: ${Number(receipt.totalPrice).toLocaleString('en-US')} د.ع
المبلغ الواصل: ${Number(receipt.totalPaid).toLocaleString('en-US')} د.ع
المبلغ المتبقي: ${Number(receipt.remainingBalance).toLocaleString('en-US')} د.ع
المبلغ المدفوع: ${Number(receipt.paidAmount).toLocaleString('en-US')} د.ع
المبلغ كتابة: ${amountInWords}
تاريخ الدفع: ${receipt.dateStr}
الوقت: ${receipt.timeStr}
    `.trim();

    navigator.clipboard.writeText(receiptText);
    alert('تم نسخ تفاصيل الوصل بنجاح!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/85 backdrop-blur-md animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md sm:max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 bg-blue-700 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-200 shrink-0" />
            <h3 className="font-bold text-sm text-white">معاينة طباعة الوصل (58mm Roll)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Container Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 bg-slate-100 dark:bg-slate-950">
          {/* Helper Badge */}
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 rounded-2xl text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-[11px] font-bold leading-relaxed">
              انقر على زر <strong>طباعة الوصل</strong> لإرسال الوصل فوراً للطابعة الحرارية عبر RawBT أو الطباعة المباشرة.
            </span>
          </div>

          {/* Live HTML 58mm Thermal Receipt Component Card */}
          <div className="flex justify-center my-1">
            <div id="receipt-content" className="w-full max-w-[390px] bg-white text-black p-5 rounded-2xl shadow-lg border-2 border-slate-400 dark:border-slate-600 font-sans text-base select-none dir-rtl">
              {receipt.template === 'template_2' ? (
                /* === تصميم وصل 2 (جداول منظمة مع الكرار للموبايل بالأعلى وثابتة) === */
                <div>
                  {/* العنوان مثبت لمرة واحدة بالأعلى */}
                  <div className="text-center font-black text-2xl text-black pb-2 mb-3 border-b-2 border-black tracking-wide">
                    الكرار للموبايل
                  </div>

                  {/* جدول بيانات الزبون */}
                  <table className="w-full border-collapse border border-black mb-2 text-base font-black">
                    <tbody>
                      <tr>
                        <td className="w-[38%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">الزبون</td>
                        <td className="py-1.5 px-2 text-left dir-ltr font-black text-lg text-black">{receipt.customerName || 'زبون'}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* تنبيه الوصل المكرر إن وجد */}
                  {(receipt.isDuplicate || receipt.warningNote) && (
                    <div className="p-3 mb-2 border-2 border-black rounded-xl bg-white text-center font-black text-black">
                      <div className="text-lg font-black mb-1">⚠️ تنبية هام ⚠️</div>
                      <div className="text-sm font-black leading-snug">
                        {receipt.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                      </div>
                    </div>
                  )}

                  {/* جدول الحسابات المالية */}
                  <table className="w-full border-collapse border border-black mb-2 text-base font-black">
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="w-[42%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">المبلغ الكلي</td>
                        <td className="py-1.5 px-2 text-left dir-ltr font-black text-black">{Number(receipt.totalPrice || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="w-[42%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">المبلغ الواصل</td>
                        <td className="py-1.5 px-2 text-left dir-ltr font-black text-black">{Number(receipt.totalPaid || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                      <tr className="border-b-2 border-black bg-slate-50">
                        <td className="w-[42%] py-2 px-2 bg-slate-200 border-l border-black text-right text-lg font-black text-slate-900">المبلغ المتبقي</td>
                        <td className="py-2 px-2 text-left dir-ltr font-black text-2xl text-black">{Number(receipt.remainingBalance || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                      <tr className="border-2 border-black bg-slate-100">
                        <td className="w-[42%] py-2.5 px-2 border-l-2 border-black text-right text-lg font-black text-black">المبلغ المدفوع</td>
                        <td className="py-2.5 px-2 text-left dir-ltr font-black text-2xl text-emerald-800">{Number(receipt.paidAmount || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* جدول التفقيط والوقت */}
                  <table className="w-full border-collapse border border-black mb-2 text-sm font-black">
                    <tbody>
                      <tr className="border-b border-black">
                        <td className="w-[35%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">المبلغ كتابة</td>
                        <td className="py-1.5 px-2 text-left dir-ltr font-black text-black">{amountInWords || 'صفر دينار'}</td>
                      </tr>
                      <tr className="border-b border-black">
                        <td className="w-[35%] py-1 px-2 bg-slate-100 border-l border-black text-right text-slate-800">تاريخ الدفع</td>
                        <td className="py-1 px-2 text-left dir-ltr font-bold text-black">{receipt.dateStr}</td>
                      </tr>
                      <tr>
                        <td className="w-[35%] py-1 px-2 bg-slate-100 border-l border-black text-right text-slate-800">الوقت</td>
                        <td className="py-1 px-2 text-left dir-ltr font-bold text-black">{receipt.timeStr}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="text-center font-bold text-sm my-2 text-black">
                    شكراً لتعاملكم معنا
                  </div>
                </div>
              ) : (
                /* === تصميم وصل 1 (التصميم الحالي) === */
                <div>
                  {/* Shop Title (only if custom provided) */}
                  {receipt.shopTitle && receipt.shopTitle !== 'الكرار للموبايل' && (
                    <div className="text-center font-black text-2xl sm:text-3xl text-black mb-3 tracking-tight">
                      {receipt.shopTitle}
                    </div>
                  )}

                  {/* Data Table with Enlarged Fonts */}
                  <table className="w-full border-collapse mb-1 text-lg text-black">
                    <tbody>
                      {receipt.receiptNo && (
                        <tr className="border-b border-dashed border-slate-300">
                          <td className="py-2 px-1 font-black text-right align-top whitespace-nowrap w-[38%] text-slate-700 text-lg">رقم الوصل</td>
                          <td className="py-2 px-1 font-black text-left align-top dir-ltr w-[62%] text-black text-xl">{receipt.receiptNo}</td>
                        </tr>
                      )}
                      <tr className="border-b border-dashed border-slate-300">
                        <td className="py-2.5 px-1 font-black text-right align-top whitespace-nowrap text-slate-700 text-xl">الزبون</td>
                        <td className="py-2.5 px-1 font-black text-left align-top dir-ltr break-words text-2xl text-black">{receipt.customerName || 'علاوي'}</td>
                      </tr>

                      {/* Warning Notice for Duplicate Receipt - مباشرة بعد الزبون لتجنب قصه من المندوب */}
                      {(receipt.isDuplicate || receipt.warningNote) && (
                        <tr>
                          <td colSpan={2} className="py-3 px-0">
                            <div className="p-4 sm:p-4.5 border-[3px] border-black rounded-2xl bg-white text-center font-black text-black shadow-xs">
                              <div className="text-xl sm:text-2xl font-black mb-2 flex items-center justify-center gap-2 text-black">
                                <span>⚠️ تنبية هام ⚠️</span>
                              </div>
                              <div className="text-base sm:text-lg font-black leading-relaxed text-black">
                                {receipt.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      <tr>
                        <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">المادة المباعة</td>
                        <td className="py-2 px-1 font-black text-left align-top dir-ltr break-words text-xl text-black">{receipt.itemName || ''}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">المبلغ الكلي</td>
                        <td className="py-2 px-1 font-black text-left align-top dir-ltr text-xl text-black">{Number(receipt.totalPrice || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">المبلغ الواصل</td>
                        <td className="py-2 px-1 font-black text-left align-top dir-ltr text-xl text-black">{Number(receipt.totalPaid || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>
                      <tr className="border-b-2 border-dashed border-slate-400 bg-slate-100/60">
                        <td className="py-3 px-2 font-black text-right align-middle whitespace-nowrap text-slate-900 text-xl sm:text-2xl">المبلغ المتبقي</td>
                        <td className="py-3 px-2 font-black text-left align-middle dir-ltr text-3xl sm:text-4xl text-black">{Number(receipt.remainingBalance || 0).toLocaleString('en-US')} د.ع</td>
                      </tr>

                      {/* المبلغ المدفوع - مستطيل بارز وكبير جداً وواضح */}
                      <tr>
                        <td colSpan={2} className="py-3.5 px-0">
                          <div className="border-[3px] border-black rounded-2xl p-4 bg-slate-50 flex items-center justify-between shadow-xs">
                            <span className="font-black text-xl sm:text-2xl text-black">المبلغ المدفوع:</span>
                            <span className="font-black text-3xl sm:text-4xl dir-ltr text-emerald-800">
                              {Number(receipt.paidAmount || 0).toLocaleString('en-US')} د.ع
                            </span>
                          </div>
                        </td>
                      </tr>

                      <tr className="bg-slate-50 border border-slate-200/80 rounded-xl">
                        <td className="py-3 px-2 font-black text-right align-top whitespace-nowrap text-slate-900 text-lg sm:text-xl">المبلغ كتابة</td>
                        <td className="py-3 px-2 font-black text-xl sm:text-2xl text-left align-top dir-ltr break-words text-slate-900 leading-snug">{amountInWords || 'صفر دينار'}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">تاريخ الدفع</td>
                        <td className="py-2 px-1 font-black text-left align-top dir-ltr text-lg">{receipt.dateStr}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">الوقت</td>
                        <td className="py-2 px-1 font-black text-left align-top dir-ltr text-lg">{receipt.timeStr}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Separator Line */}
                  <div className="text-center font-black text-lg my-1.5 text-black tracking-tighter">
                    ====================
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Sticky Footer */}
        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0 max-h-[45vh] overflow-y-auto">
          {/* Main Primary Print Button (Direct RawBT print) */}
          <button
            onClick={handleThermalPrint}
            className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ring-2 ring-blue-400/30"
          >
            <Printer className="w-5 h-5 text-blue-100" />
            <span>طباعة مباشرة إلى RawBT (بدون معاينة PDF) ⚡</span>
          </button>


          {/* Save PDF File & Other Secondary Actions */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => {
                downloadReceiptPdf(fullReceiptObj as any);
              }}
              className="py-2 px-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-300" />
              <span>تنزيل PDF</span>
            </button>

            <button
              onClick={handleDownloadImage}
              className="py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-100" />
              <span>حفظ صورة PNG</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={handleShareImage}
              className="py-2 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 shadow transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-indigo-100" />
              <span>مشاركة الوصل</span>
            </button>

            <button
              onClick={handleCopyText}
              className="py-2 px-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-[11px] flex items-center justify-center gap-1 hover:bg-slate-300 transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>نسخ النص</span>
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

