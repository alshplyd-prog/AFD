import React, { useEffect, useState } from 'react';
import {
  Printer,
  Download,
  FileText,
  Copy,
  Info,
  CheckCircle2
} from 'lucide-react';
import {
  ThermalReceiptData,
  downloadReceiptPdf,
  downloadReceiptImage,
  openThermalPrintWindow,
  DEFAULT_DUPLICATE_RECEIPT_WARNING
} from '../lib/bluetoothPrinter';
import { numberToArabicWords } from '../lib/tafqeet';

interface CustomerReceiptViewProps {
  receiptId?: string | null;
}

export const CustomerReceiptView: React.FC<CustomerReceiptViewProps> = ({ receiptId: propReceiptId }) => {
  const [receiptData, setReceiptData] = useState<ThermalReceiptData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  useEffect(() => {
    // 1. Extract receipt ID from path (/r/:id or /receipt/:id) or query parameter (?r= or ?id=)
    let id = propReceiptId || '';
    if (!id && typeof window !== 'undefined') {
      const pathname = window.location.pathname || '';
      if (pathname.startsWith('/r/')) {
        id = pathname.replace('/r/', '').trim();
      } else if (pathname.startsWith('/receipt/')) {
        id = pathname.replace('/receipt/', '').trim();
      }
      if (!id) {
        const params = new URLSearchParams(window.location.search);
        id = params.get('r') || params.get('id') || params.get('receipt_id') || '';
      }
    }

    // 2. Also check if URL has query params (backward compatibility)
    const params = new URLSearchParams(window.location.search);
    const queryCustomer = params.get('c') || params.get('customer_name');
    const queryPaid = Number(params.get('paid_now') || params.get('paid_amount') || params.get('amount') || 0);

    const applyData = (data: any) => {
      const amt = Number(data.paidAmount ?? data.amountPaid ?? data.amount ?? 0);
      const template = (data.template || 'template_1') as 'template_1' | 'template_2';
      const dateStr = data.dateStr || data.paymentDate || new Date().toISOString().split('T')[0];
      const timeStr = data.timeStr || data.paymentTime || '';

      setReceiptData({
        shopTitle: template === 'template_2' ? 'الكرار للموبايل' : '',
        receiptNo: template === 'template_2' ? '' : '1',
        customerName: data.customerName || 'زبون',
        itemName: template === 'template_2' ? '' : (data.itemName || 'قسط'),
        totalPrice: Number(data.totalPrice || 0),
        totalPaid: Number(data.totalPaid || amt),
        remainingBalance: Number(data.remainingBalance || 0),
        paidAmount: amt,
        amountInWords: data.amountInWords || numberToArabicWords(amt),
        dateStr,
        timeStr,
        isDuplicate: true,
        warningNote: DEFAULT_DUPLICATE_RECEIPT_WARNING,
        template,
      });
      setLoading(false);
    };

    // If ID is available, fetch exact receipt from server endpoint /api/receipt/:id
    if (id) {
      fetch(`/api/receipt/${encodeURIComponent(id)}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('API receipt error');
        })
        .then((data) => {
          if (data && (data.customerName || data.paidAmount > 0)) {
            applyData(data);
          } else {
            throw new Error('Invalid data');
          }
        })
        .catch(() => {
          // Fallback to /api/payments
          fetch(`/api/payments`)
            .then((r) => r.json())
            .then((allP) => {
              if (Array.isArray(allP)) {
                const found = allP.find((p: any) => p.id === id);
                if (found) {
                  applyData(found);
                  return;
                }
              }
              if (queryPaid > 0 || queryCustomer) {
                applyData({
                  customerName: queryCustomer,
                  paidAmount: queryPaid,
                  totalPrice: Number(params.get('price') || 0),
                  totalPaid: Number(params.get('paid_so_far') || 0),
                  remainingBalance: Number(params.get('remaining') || 0),
                  itemName: params.get('item') || '',
                  dateStr: params.get('d') || '',
                  timeStr: params.get('tm') || '',
                  template: params.get('tpl') || 'template_1',
                });
              } else {
                setLoading(false);
              }
            })
            .catch(() => {
              if (queryPaid > 0 || queryCustomer) {
                applyData({
                  customerName: queryCustomer,
                  paidAmount: queryPaid,
                  totalPrice: Number(params.get('price') || 0),
                  totalPaid: Number(params.get('paid_so_far') || 0),
                  remainingBalance: Number(params.get('remaining') || 0),
                  itemName: params.get('item') || '',
                  dateStr: params.get('d') || '',
                  timeStr: params.get('tm') || '',
                  template: params.get('tpl') || 'template_1',
                });
              } else {
                setLoading(false);
              }
            });
        });
    } else if (queryPaid > 0 || queryCustomer) {
      applyData({
        customerName: queryCustomer,
        paidAmount: queryPaid,
        totalPrice: Number(params.get('price') || 0),
        totalPaid: Number(params.get('paid_so_far') || 0),
        remainingBalance: Number(params.get('remaining') || 0),
        itemName: params.get('item') || '',
        dateStr: params.get('d') || '',
        timeStr: params.get('tm') || '',
        template: params.get('tpl') || 'template_1',
      });
    } else {
      setLoading(false);
    }
  }, [propReceiptId]);

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
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <h2 className="text-sm font-bold text-slate-300">جاري تحميل وصل الاستلام...</h2>
      </div>
    );
  }

  if (!receiptData) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center dir-rtl p-4 text-center">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl max-w-sm w-full border border-slate-200 dark:border-slate-700">
          <Info className="w-10 h-10 text-amber-500 mx-auto mb-2" />
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">تعذر العثور على بيانات الوصل</h2>
          <p className="text-xs font-semibold text-slate-500">يرجى التأكد من صحة الرابط المرسل عبر الواتساب.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200/70 dark:bg-slate-950 flex flex-col items-center justify-center py-4 px-2 dir-rtl text-slate-900 antialiased">
      {/* Physical 58mm Thermal Receipt Card - Scaled compactly to look authentic */}
      <div
        id="thermal-receipt-container"
        className="w-full max-w-[280px] sm:max-w-[295px] bg-white text-black p-3.5 sm:p-4 rounded-xl shadow-lg border border-slate-300 dark:border-slate-700 select-none dir-rtl relative overflow-hidden"
      >
        {/* Subtle decorative roll indentation */}
        <div className="w-6 h-0.5 bg-slate-200 rounded-full mx-auto mb-2" />

        {isTemplate2 ? (
          /* ============================================================ */
          /* DESIGN TEMPLATE 2 (Structured Tables with Shop Title)        */
          /* ============================================================ */
          <div>
            <div className="text-center font-black text-lg text-black pb-1 mb-2 border-b-2 border-black tracking-wide">
              الكرار للموبايل
            </div>

            {/* Customer Details Table */}
            <table className="w-full border-collapse border border-black mb-1.5 text-xs font-black">
              <tbody>
                <tr>
                  <td className="w-[36%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800 text-[11px]">
                    الزبون
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-black text-sm text-black">
                    {receiptData.customerName}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Warning Notice for Duplicate Receipt */}
            {(receiptData.isDuplicate || receiptData.warningNote) && (
              <div className="p-1.5 mb-1.5 border-2 border-black rounded-lg bg-white text-center font-black text-black">
                <div className="text-xs font-black mb-0.5">⚠️ تنبية هام ⚠️</div>
                <div className="text-[10px] font-black leading-snug">
                  {receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                </div>
              </div>
            )}

            {/* Financial Grid */}
            <table className="w-full border-collapse border border-black mb-1.5 text-xs font-black">
              <tbody>
                <tr className="border-b border-black">
                  <td className="w-[42%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800 text-[11px]">
                    المبلغ الكلي
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-black text-black text-xs">
                    {Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="w-[42%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800 text-[11px]">
                    المبلغ الواصل
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-black text-black text-xs">
                    {Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-b-2 border-black bg-slate-50">
                  <td className="w-[42%] py-1 px-1 bg-slate-200 border-l border-black text-right font-black text-slate-900 text-xs">
                    المبلغ المتبقي
                  </td>
                  <td className="py-1 px-1 text-left dir-ltr font-black text-base text-black">
                    {Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
                <tr className="border-2 border-black bg-slate-100">
                  <td className="w-[42%] py-1 px-1 border-l-2 border-black text-right font-black text-black text-xs">
                    المبلغ المدفوع
                  </td>
                  <td className="py-1 px-1 text-left dir-ltr font-black text-base text-emerald-800">
                    {Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Tafqeet and Timing */}
            <table className="w-full border-collapse border border-black mb-1.5 text-[11px] font-black">
              <tbody>
                <tr className="border-b border-black">
                  <td className="w-[35%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800">
                    المبلغ كتابة
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-black text-black leading-tight text-[11px]">
                    {receiptData.amountInWords || 'صفر دينار'}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="w-[35%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800">
                    تاريخ الدفع
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-bold text-black">{receiptData.dateStr}</td>
                </tr>
                <tr>
                  <td className="w-[35%] py-0.5 px-1 bg-slate-100 border-l border-black text-right text-slate-800">
                    الوقت
                  </td>
                  <td className="py-0.5 px-1 text-left dir-ltr font-bold text-black">{receiptData.timeStr}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-center font-bold text-xs my-1 text-black">
              شكراً لتعاملكم معنا
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* DESIGN TEMPLATE 1 (Classic Compact Thermal Roll Design)       */
          /* ============================================================ */
          <div>
            {receiptData.shopTitle && (
              <div className="text-center font-black text-lg text-black mb-2 pb-1 border-b-2 border-black">
                {receiptData.shopTitle}
              </div>
            )}

            <table className="w-full border-collapse mb-1 text-xs text-black">
              <tbody>
                {receiptData.receiptNo && (
                  <tr className="border-b border-dashed border-slate-300">
                    <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap w-[38%] text-slate-700 text-[11px]">
                      رقم الوصل
                    </td>
                    <td className="py-0.5 px-1 font-black text-left align-top dir-ltr w-[62%] text-black text-xs">
                      {receiptData.receiptNo}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-dashed border-slate-300">
                  <td className="py-1 px-1 font-black text-right align-top whitespace-nowrap text-slate-700 text-xs">
                    الزبون
                  </td>
                  <td className="py-1 px-1 font-black text-left align-top dir-ltr break-words text-base text-black">
                    {receiptData.customerName}
                  </td>
                </tr>

                {(receiptData.isDuplicate || receiptData.warningNote) && (
                  <tr>
                    <td colSpan={2} className="py-1.5 px-0">
                      <div className="p-1.5 border-2 border-black rounded-lg bg-white text-center font-black text-black">
                        <div className="text-xs font-black mb-0.5">⚠️ تنبية هام ⚠️</div>
                        <div className="text-[10px] font-black leading-snug">
                          {receiptData.warningNote || DEFAULT_DUPLICATE_RECEIPT_WARNING}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {receiptData.itemName && (
                  <tr>
                    <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-[11px]">
                      المادة المباعة
                    </td>
                    <td className="py-0.5 px-1 font-black text-left align-top dir-ltr break-words text-xs text-black">
                      {receiptData.itemName}
                    </td>
                  </tr>
                )}

                <tr>
                  <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-[11px]">
                    المبلغ الكلي
                  </td>
                  <td className="py-0.5 px-1 font-black text-left align-top dir-ltr text-xs text-black">
                    {Number(receiptData.totalPrice || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                <tr>
                  <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-[11px]">
                    المبلغ الواصل
                  </td>
                  <td className="py-0.5 px-1 font-black text-left align-top dir-ltr text-xs text-black">
                    {Number(receiptData.totalPaid || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                <tr className="border-b-2 border-dashed border-slate-400 bg-slate-100/70">
                  <td className="py-1 px-1 font-black text-right align-middle whitespace-nowrap text-slate-900 text-xs">
                    المبلغ المتبقي
                  </td>
                  <td className="py-1 px-1 font-black text-left align-middle dir-ltr text-lg text-black">
                    {Number(receiptData.remainingBalance || 0).toLocaleString('en-US')} د.ع
                  </td>
                </tr>

                {/* Highlighted Paid Box */}
                <tr>
                  <td colSpan={2} className="py-1.5 px-0">
                    <div className="border-2 border-black rounded-lg p-2 bg-slate-50 flex items-center justify-between shadow-2xs">
                      <span className="font-black text-xs text-black">المبلغ المدفوع:</span>
                      <span className="font-black text-xl dir-ltr text-emerald-800">
                        {Number(receiptData.paidAmount || 0).toLocaleString('en-US')} د.ع
                      </span>
                    </div>
                  </td>
                </tr>

                <tr className="bg-slate-50 border border-slate-200/80 rounded-lg">
                  <td className="py-1 px-1 font-black text-right align-top whitespace-nowrap text-slate-900 text-[11px]">
                    المبلغ كتابة
                  </td>
                  <td className="py-1 px-1 font-black text-[11px] text-left align-top dir-ltr break-words text-slate-900 leading-snug">
                    {receiptData.amountInWords || 'صفر دينار'}
                  </td>
                </tr>

                <tr>
                  <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-[11px]">
                    تاريخ الدفع
                  </td>
                  <td className="py-0.5 px-1 font-black text-left align-top dir-ltr text-[11px]">{receiptData.dateStr}</td>
                </tr>

                <tr>
                  <td className="py-0.5 px-1 font-bold text-right align-top whitespace-nowrap text-slate-700 text-[11px]">
                    الوقت
                  </td>
                  <td className="py-0.5 px-1 font-black text-left align-top dir-ltr text-[11px]">{receiptData.timeStr}</td>
                </tr>
              </tbody>
            </table>

            <div className="text-center font-black text-xs my-1 text-black tracking-tighter">
              ====================
            </div>
          </div>
        )}

        <div className="text-center text-[10px] font-bold text-slate-500 mt-2">
          {isTemplate2 ? 'الكرار للموبايل • وثيقة قبض معتمدة' : 'وثيقة قبض معتمدة'}
        </div>
      </div>

      {/* Copy link option */}
      <button
        onClick={handleCopyLink}
        className="mt-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
      >
        <Copy className="w-3 h-3" />
        <span>{copySuccess ? 'تم نسخ الرابط بنجاح ✓' : 'نسخ رابط الوصل'}</span>
      </button>
    </div>
  );
};
