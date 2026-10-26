import React, { useEffect, useState, useMemo } from 'react';
import {
  Printer,
  Download,
  Share2,
  CheckCircle2,
  ArrowRight,
  FileText,
  MessageCircle,
  Copy,
  Info
} from 'lucide-react';
import { ThermalReceiptData, downloadReceiptPdf, downloadReceiptImage, openThermalPrintWindow, DEFAULT_DUPLICATE_RECEIPT_WARNING } from '../lib/bluetoothPrinter';
import { numberToArabicWords } from '../lib/tafqeet';

interface CustomerReceiptViewProps {
  onBackToApp?: () => void;
}

export const CustomerReceiptView: React.FC<CustomerReceiptViewProps> = ({ onBackToApp }) => {
  const [receiptData, setReceiptData] = useState<ThermalReceiptData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  useEffect(() => {
    // Parse URL search parameters
    const params = new URLSearchParams(window.location.search);

    const id = params.get('id') || '';
    const customerName = params.get('c') || params.get('customer_name') || 'زبون';
    const itemName = params.get('item') || params.get('item_name') || 'قسط';
    const totalPrice = Number(params.get('price') || params.get('total_price')) || 0;
    const totalPaid = Number(params.get('paid_so_far') || params.get('total_paid')) || 0;
    const remainingBalance = Number(params.get('remaining') || params.get('remaining_balance')) || 0;
    const paidAmount = Number(params.get('paid_now') || params.get('paid_amount') || params.get('amount')) || 0;
    const amountInWords = params.get('words') || params.get('amount_in_words') || numberToArabicWords(paidAmount);
    const dateStr = params.get('d') || params.get('date') || new Date().toISOString().split('T')[0];
    const timeStr = params.get('tm') || params.get('time') || '';
    const template = (params.get('tpl') || params.get('template') || 'template_1') as 'template_1' | 'template_2';
    const isDuplicate = params.get('dup') === 'true' || true;

    if (paidAmount > 0 || customerName !== 'زبون') {
      setReceiptData({
        shopTitle: 'الكرار للموبايل',
        receiptNo: template === 'template_2' ? '' : '1',
        customerName,
        itemName: template === 'template_2' ? '' : itemName,
        totalPrice,
        totalPaid,
        remainingBalance,
        paidAmount,
        amountInWords,
        dateStr,
        timeStr,
        isDuplicate,
        warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
        template,
      });
      setLoading(false);
      return;
    }

    // If params are empty but id is provided, fetch from server
    if (id) {
      fetch(`/api/payments`)
        .then((res) => res.json())
        .then((payments) => {
          if (Array.isArray(payments)) {
            const found = payments.find((p: any) => p.id === id);
            if (found) {
              const amt = Number(found.amountPaid ?? found.amount) || 0;
              setReceiptData({
                shopTitle: 'الكرار للموبايل',
                receiptNo: '1',
                customerName: found.customerName || 'زبون',
                itemName: 'قسط',
                totalPrice: 0,
                totalPaid: amt,
                remainingBalance: 0,
                paidAmount: amt,
                amountInWords: numberToArabicWords(amt),
                dateStr: found.paymentDate || '',
                timeStr: '',
                isDuplicate: true,
                warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
                template: 'template_1',
              });
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleDownloadPdf = () => {
    if (!receiptData) return;
    downloadReceiptPdf(receiptData);
  };

  const handleDownloadImage = () => {
    if (!receiptData) return;
    downloadReceiptImage(receiptData);
  };

  const handlePrint = () => {
    if (!receiptData) return;
    try {
      openThermalPrintWindow(receiptData);
    } catch (e) {
      window.print();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const isTemplate2 = receiptData?.template === 'template_2';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white dir-rtl p-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold">جاري تحميل وصل الاستلام...</h2>
      </div>
    );
  }

  if (!receiptData) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center dir-rtl p-4 text-center">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-700">
          <Info className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-2">تعذر العثور على بيانات الوصل</h2>
          <p className="text-sm font-semibold text-slate-500 mb-6">يرجى التأكد من صحة الرابط المرسل عبر الواتساب.</p>
          {onBackToApp && (
            <button
              onClick={onBackToApp}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
            >
              الذهاب للتطبيق الرئيسي
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col items-center py-6 px-3 sm:px-4 dir-rtl text-slate-900">
      {/* Top Header Navigation */}
      <div className="w-full max-w-[420px] mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-base shadow-sm">
            ✓
          </div>
          <div>
            <h1 className="text-base font-black text-slate-900 dark:text-slate-100">وصل استلام رسمي</h1>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">الكرار للموبايل والتقسيط</p>
          </div>
        </div>

        {onBackToApp && (
          <button
            onClick={onBackToApp}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-slate-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>التطبيق الرئيسي</span>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>

      {/* Action Buttons Toolbar (Top) */}
      <div className="w-full max-w-[420px] grid grid-cols-3 gap-2 mb-4">
        <button
          onClick={handleDownloadPdf}
          className="py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs flex flex-col items-center justify-center gap-1 shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <FileText className="w-4 h-4" />
          <span>تنزيل PDF</span>
        </button>

        <button
          onClick={handleDownloadImage}
          className="py-2.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs flex flex-col items-center justify-center gap-1 shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>حفظ صورة</span>
        </button>

        <button
          onClick={handlePrint}
          className="py-2.5 px-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-xs flex flex-col items-center justify-center gap-1 shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة</span>
        </button>
      </div>

      {/* Physical Thermal Paper Styled Receipt Container */}
      <div className="w-full max-w-[420px] bg-white text-black p-5 sm:p-6 rounded-2xl shadow-2xl border-2 border-slate-300 select-none dir-rtl relative overflow-hidden">
        {/* Subtle decorative roll notch at top */}
        <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

        {isTemplate2 ? (
          /* ============================================================ */
          /* DESIGN TEMPLATE 2 (Structured Tables with Top Shop Title)    */
          /* ============================================================ */
          <div>
            <div className="text-center font-black text-2xl text-black pb-2 mb-3 border-b-2 border-black tracking-wide">
              الكرار للموبايل
            </div>

            {/* Customer Details Table */}
            <table className="w-full border-collapse border border-black mb-2 text-base font-black">
              <tbody>
                <tr>
                  <td className="w-[38%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    الزبون
                  </td>
                  <td className="py-1.5 px-2 text-left dir-ltr font-black text-lg text-black">
                    {receiptData.customerName}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Warning Notice for Duplicate Receipt */}
            {(receiptData.isDuplicate || receiptData.warningNote) && (
              <div className="p-3 mb-2 border-2 border-black rounded-xl bg-white text-center font-black text-black">
                <div className="text-lg font-black mb-1">⚠️ تنبية هام ⚠️</div>
                <div className="text-sm font-black leading-snug">
                  {receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                </div>
              </div>
            )}

            {/* Financial Grid */}
            <table className="w-full border-collapse border border-black mb-2 text-base font-black">
              <tbody>
                <tr className="border-b border-black">
                  <td className="w-[42%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    المبلغ الكلي
                  </td>
                  <td className="py-1.5 px-2 text-left dir-ltr font-black text-black">
                    {Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="w-[42%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    المبلغ الواصل
                  </td>
                  <td className="py-1.5 px-2 text-left dir-ltr font-black text-black">
                    {Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-b-2 border-black bg-slate-50">
                  <td className="w-[42%] py-2 px-2 bg-slate-200 border-l border-black text-right text-lg font-black text-slate-900">
                    المبلغ المتبقي
                  </td>
                  <td className="py-2 px-2 text-left dir-ltr font-black text-2xl text-black">
                    {Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-2 border-black bg-slate-100">
                  <td className="w-[42%] py-2.5 px-2 border-l-2 border-black text-right text-lg font-black text-black">
                    المبلغ المدفوع
                  </td>
                  <td className="py-2.5 px-2 text-left dir-ltr font-black text-2xl text-emerald-800">
                    {Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tafqeet and Timing */}
            <table className="w-full border-collapse border border-black mb-2 text-sm font-black">
              <tbody>
                <tr className="border-b border-black">
                  <td className="w-[35%] py-1.5 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    المبلغ كتابة
                  </td>
                  <td className="py-1.5 px-2 text-left dir-ltr font-black text-black leading-snug">
                    {receiptData.amountInWords || 'صفر دينار'}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="w-[35%] py-1 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    تاريخ الدفع
                  </td>
                  <td className="py-1 px-2 text-left dir-ltr font-bold text-black">{receiptData.dateStr}</td>
                </tr>
                <tr>
                  <td className="w-[35%] py-1 px-2 bg-slate-100 border-l border-black text-right text-slate-800">
                    الوقت
                  </td>
                  <td className="py-1 px-2 text-left dir-ltr font-bold text-black">{receiptData.timeStr}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-center font-bold text-sm my-3 text-black">
              شكراً لتعاملكم معنا
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* DESIGN TEMPLATE 1 (Classic Thermal Roll Design)              */
          /* ============================================================ */
          <div>
            <div className="text-center font-black text-2xl text-black mb-3 pb-2 border-b-2 border-black">
              الكرار للموبايل
            </div>

            <table className="w-full border-collapse mb-1 text-lg text-black">
              <tbody>
                {receiptData.receiptNo && (
                  <tr className="border-b border-dashed border-slate-300">
                    <td className="py-2 px-1 font-black text-right align-top whitespace-nowrap w-[38%] text-slate-700 text-lg">
                      رقم الوصل
                    </td>
                    <td className="py-2 px-1 font-black text-left align-top dir-ltr w-[62%] text-black text-xl">
                      {receiptData.receiptNo}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-dashed border-slate-300">
                  <td className="py-2.5 px-1 font-black text-right align-top whitespace-nowrap text-slate-700 text-xl">
                    الزبون
                  </td>
                  <td className="py-2.5 px-1 font-black text-left align-top dir-ltr break-words text-2xl text-black">
                    {receiptData.customerName}
                  </td>
                </tr>

                {(receiptData.isDuplicate || receiptData.warningNote) && (
                  <tr>
                    <td colSpan={2} className="py-3 px-0">
                      <div className="p-3.5 border-[3px] border-black rounded-2xl bg-white text-center font-black text-black">
                        <div className="text-xl font-black mb-1">⚠️ تنبية هام ⚠️</div>
                        <div className="text-sm font-black leading-relaxed">
                          {receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {receiptData.itemName && (
                  <tr>
                    <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">
                      المادة المباعة
                    </td>
                    <td className="py-2 px-1 font-black text-left align-top dir-ltr break-words text-xl text-black">
                      {receiptData.itemName}
                    </td>
                  </tr>
                )}

                <tr>
                  <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">
                    المبلغ الكلي
                  </td>
                  <td className="py-2 px-1 font-black text-left align-top dir-ltr text-xl text-black">
                    {Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                <tr>
                  <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">
                    المبلغ الواصل
                  </td>
                  <td className="py-2 px-1 font-black text-left align-top dir-ltr text-xl text-black">
                    {Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                <tr className="border-b-2 border-dashed border-slate-400 bg-slate-100/60">
                  <td className="py-3 px-2 font-black text-right align-middle whitespace-nowrap text-slate-900 text-xl">
                    المبلغ المتبقي
                  </td>
                  <td className="py-3 px-2 font-black text-left align-middle dir-ltr text-3xl text-black">
                    {Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                {/* Highlighted Paid Box */}
                <tr>
                  <td colSpan={2} className="py-3.5 px-0">
                    <div className="border-[3px] border-black rounded-2xl p-4 bg-slate-50 flex items-center justify-between shadow-xs">
                      <span className="font-black text-xl text-black">المبلغ المدفوع:</span>
                      <span className="font-black text-3xl dir-ltr text-emerald-800">
                        {Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع
                      </span>
                    </div>
                  </td>
                </tr>

                <tr className="bg-slate-50 border border-slate-200/80 rounded-xl">
                  <td className="py-3 px-2 font-black text-right align-top whitespace-nowrap text-slate-900 text-lg">
                    المبلغ كتابة
                  </td>
                  <td className="py-3 px-2 font-black text-xl text-left align-top dir-ltr break-words text-slate-900 leading-snug">
                    {receiptData.amountInWords || 'صفر دينار'}
                  </td>
                </tr>

                <tr>
                  <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">
                    تاريخ الدفع
                  </td>
                  <td className="py-2 px-1 font-black text-left align-top dir-ltr text-lg">{receiptData.dateStr}</td>
                </tr>

                <tr>
                  <td className="py-2 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-lg">
                    الوقت
                  </td>
                  <td className="py-2 px-1 font-black text-left align-top dir-ltr text-lg">{receiptData.timeStr}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-center font-black text-lg my-2 text-black tracking-tighter">
              ====================
            </div>
          </div>
        )}

        <div className="text-center text-[11px] font-bold text-slate-500 mt-2">
          الكرار للموبايل والتقسيط • وثيقة قبض معتمدة
        </div>
      </div>

      {/* Bottom Share Link Box */}
      <div className="w-full max-w-[420px] mt-4 p-3 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Copy className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
            رابط الوصل الإلكتروني
          </span>
        </div>
        <button
          onClick={handleCopyLink}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-black text-xs cursor-pointer shrink-0 transition-all"
        >
          {copySuccess ? 'تم النسخ ✓' : 'نسخ الرابط'}
        </button>
      </div>
    </div>
  );
};
