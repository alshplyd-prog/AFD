import React, { useEffect, useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  Copy,
  Info,
  CheckCircle2,
  Clock,
  User,
  Phone,
  Package,
  Calendar,
  Wallet,
  TrendingDown
} from 'lucide-react';
import { InstallmentContract, PaymentRecord } from '../types';
import { numberToArabicWords } from '../lib/tafqeet';
import { getPaymentFormattedDateAndTime, getLocalDateString } from '../lib/dateUtils';
import { shareCustomerPaymentsPdf } from '../lib/pdfShareHelper';
import html2canvas from 'html2canvas';

interface CustomerStatementViewProps {
  contractId?: string | null;
}

export const CustomerStatementView: React.FC<CustomerStatementViewProps> = ({ contractId: propContractId }) => {
  const [contract, setContract] = useState<InstallmentContract | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isDownloadingImage, setIsDownloadingImage] = useState<boolean>(false);

  useEffect(() => {
    // 1. Extract contract ID from pathname (/s/:id or /statement/:id) or query parameter (?s= or ?id=)
    let id = propContractId || '';
    if (!id && typeof window !== 'undefined') {
      const pathname = window.location.pathname || '';
      if (pathname.startsWith('/s/')) {
        id = pathname.replace('/s/', '').trim();
      } else if (pathname.startsWith('/statement/')) {
        id = pathname.replace('/statement/', '').trim();
      }
      if (!id) {
        const params = new URLSearchParams(window.location.search);
        id = params.get('s') || params.get('id') || params.get('statement_id') || params.get('contract_id') || '';
      }
    }

    if (id) {
      fetch(`/api/statement/${encodeURIComponent(id)}`)
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('API statement error');
        })
        .then((data) => {
          if (data && (data.contract || Array.isArray(data.payments))) {
            setContract(data.contract || null);
            setPayments(Array.isArray(data.payments) ? data.payments : []);
          }
          setLoading(false);
        })
        .catch(() => {
          // Fallback to /api/contracts and /api/payments
          Promise.all([
            fetch('/api/contracts').then((r) => r.json()).catch(() => []),
            fetch('/api/payments').then((r) => r.json()).catch(() => [])
          ]).then(([allC, allP]) => {
            if (Array.isArray(allC)) {
              const foundC = allC.find((c: any) => c.id === id || c.customerName === id);
              if (foundC) setContract(foundC);
            }
            if (Array.isArray(allP)) {
              const custPayments = allP.filter((p: any) => p.contractId === id || p.contract_id === id);
              setPayments(custPayments);
            }
            setLoading(false);
          });
        });
    } else {
      setLoading(false);
    }
  }, [propContractId]);

  const customerName = contract?.customerName || payments[0]?.customerName || 'الزبون';
  const phone = contract?.customerPhone || (payments[0] as any)?.customerPhone || '';
  const itemName = contract?.itemName || '—';
  const totalPrice = Number(contract?.totalPrice || 0);
  const advance = Number(contract?.advancePayment || 0);
  const netDue = Math.max(0, totalPrice - advance);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amountPaid ?? p.amount ?? 0) || 0), 0);
  const remaining = Math.max(0, (netDue > 0 ? netDue : (contract?.remainingBalance || 0)) - totalPaid);
  const isFinished = remaining <= 0;

  const handleDownloadPdf = async () => {
    if (isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      await shareCustomerPaymentsPdf({
        contract,
        payments,
        targetApp: 'other',
      });
    } catch (e) {
      console.warn('PDF export error:', e);
      window.print();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    if (isDownloadingImage) return;
    setIsDownloadingImage(true);
    try {
      const el = document.getElementById('customer-statement-container');
      if (!el) return;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `كشف_تسديدات_${customerName.replace(/\s+/g, '_')}_${getLocalDateString()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Image download error:', e);
    } finally {
      setIsDownloadingImage(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white dir-rtl p-4">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <h2 className="text-sm font-bold text-slate-300">جاري تحميل سجل وتسديدات الزبون...</h2>
      </div>
    );
  }

  if (!contract && payments.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center dir-rtl p-4 text-center">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-xl max-w-sm w-full border border-slate-200 dark:border-slate-700">
          <Info className="w-10 h-10 text-amber-500 mx-auto mb-2" />
          <h2 className="text-base font-black text-slate-900 dark:text-slate-100 mb-1">تعذر العثور على كشف الحساب</h2>
          <p className="text-xs font-semibold text-slate-500">يرجى التأكد من صحة الرابط المرسل عبر الواتساب.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-950 flex flex-col items-center py-3 px-2 dir-rtl text-slate-900 antialiased font-sans w-full overflow-x-hidden">
      {/* Print Styles for Exact A4 Output */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          #customer-statement-container {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: auto !important;
          }
        }
      `}</style>

      {/* Main Statement Container (Fully responsive across all screen sizes) */}
      <div
        id="customer-statement-container"
        className="w-full max-w-4xl bg-white text-slate-900 p-3 sm:p-6 rounded-xl shadow-xl border border-slate-200 select-none dir-rtl relative font-sans flex flex-col justify-between my-auto overflow-hidden"
      >
        <div>
          {/* Header Bar */}
          <div className="flex flex-row items-center justify-between pb-2.5 mb-3 border-b-2 sm:border-b-4 border-[#0f766e] gap-2">
            <div>
              <h1 className="text-lg sm:text-3xl font-black text-[#0f766e] tracking-tight">الكرار للموبايل والتقسيط</h1>
              <p className="text-xs sm:text-base font-extrabold text-slate-700 mt-0.5">كشف وسجل تسديدات الزبون</p>
            </div>
            <div className="text-left text-[11px] sm:text-xs font-extrabold text-slate-600 space-y-0.5">
              <div>تاريخ التصدير: <span className="font-black text-slate-900 dir-ltr inline-block">{getLocalDateString()}</span></div>
              <div>عدد الحركات: <span className="font-black text-[#0f766e] text-xs sm:text-base">{payments.length}</span></div>
            </div>
          </div>

          {/* Customer Info Card */}
          <div className="bg-[#f0fdfa] border-2 border-[#2dd4bf] rounded-xl sm:rounded-2xl p-2.5 sm:p-4 my-3">
            {/* Top Line: Customer Name, Phone, Item */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#99f6e4] pb-2 mb-2.5 text-right">
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm font-extrabold text-[#0f766e]">اسم الزبون: </span>
                <span className="text-xs sm:text-lg font-black text-slate-900">{customerName}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm font-extrabold text-[#0f766e]">الهاتف: </span>
                <span className="text-xs sm:text-base font-black text-slate-900 dir-ltr inline-block">{phone || '—'}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm font-extrabold text-[#0f766e]">المادة: </span>
                <span className="text-xs sm:text-lg font-black text-slate-900">{itemName}</span>
              </div>
            </div>

            {/* Bottom Line: 4 Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-3">
              <div className="bg-white border border-[#99f6e4] rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center shadow-2xs">
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500">المبلغ الكلي</div>
                <div className="text-xs sm:text-lg font-black text-[#0284c7] dir-ltr mt-0.5">
                  {totalPrice.toLocaleString('en-US')} <span className="text-[9px] sm:text-xs font-bold text-slate-500">د.ع</span>
                </div>
              </div>

              <div className="bg-white border border-[#99f6e4] rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center shadow-2xs">
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500">الواصل الكلي</div>
                <div className="text-xs sm:text-lg font-black text-[#047857] dir-ltr mt-0.5">
                  {totalPaid.toLocaleString('en-US')} <span className="text-[9px] sm:text-xs font-bold text-slate-500">د.ع</span>
                </div>
              </div>

              <div className="bg-white border border-[#99f6e4] rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center shadow-2xs">
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500">المتبقي الباقي</div>
                <div className="text-xs sm:text-lg font-black text-[#b91c1c] dir-ltr mt-0.5">
                  {remaining.toLocaleString('en-US')} <span className="text-[9px] sm:text-xs font-bold text-slate-500">د.ع</span>
                </div>
              </div>

              <div className="bg-white border border-[#99f6e4] rounded-lg sm:rounded-xl p-1.5 sm:p-3 text-center flex flex-col justify-center shadow-2xs">
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500">حالة العقد</div>
                <div className={`text-xs sm:text-base font-black mt-0.5 ${isFinished ? 'text-[#047857]' : 'text-[#b45309]'}`}>
                  {isFinished ? 'منتهي ومكتمل' : 'قيد التسديد'}
                </div>
              </div>
            </div>
          </div>

          {/* Payments History Table */}
          <div className="mb-3 overflow-x-auto rounded-lg sm:rounded-xl border border-slate-300">
            <table className="w-full text-right border-collapse text-[11px] sm:text-sm">
              <thead>
                <tr className="bg-[#0f766e] text-white font-black text-xs sm:text-base">
                  <th className="py-2 px-1 sm:px-2 text-center w-6 sm:w-10">#</th>
                  <th className="py-2 px-1 sm:px-2 text-center">التاريخ والوقت</th>
                  <th className="py-2 px-1 sm:px-2 text-center">المبلغ المسدد</th>
                  <th className="py-2 px-1 sm:px-2 text-center">المندوب</th>
                  <th className="py-2 px-1 sm:px-2 text-right">ملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 font-bold text-sm sm:text-base">
                      لا توجد تسديدات مسجلة بعد لهذا العقد
                    </td>
                  </tr>
                ) : (
                  payments.map((p, idx) => {
                    const { dateStr, timeStr, cleanNote } = getPaymentFormattedDateAndTime(p, true);
                    const amt = Number(p.amountPaid ?? p.amount ?? 0);
                    return (
                      <tr key={p.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="py-2 px-1 text-center font-bold text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-1 text-center font-black text-slate-900 dir-ltr whitespace-nowrap text-[10px] sm:text-xs">
                          {dateStr} <span className="font-bold text-slate-500">{timeStr}</span>
                        </td>
                        <td className="py-2 px-1 text-center font-black text-[#0f766e] dir-ltr whitespace-nowrap text-xs sm:text-base">
                          {amt.toLocaleString('en-US')} د.ع
                        </td>
                        <td className="py-2 px-1 text-center font-bold text-slate-800 whitespace-nowrap text-[11px] sm:text-xs">
                          {p.repName || '—'}
                        </td>
                        <td className="py-2 px-1 text-right font-medium text-slate-600 text-[11px] sm:text-xs">
                          {cleanNote || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {payments.length > 0 && (
                <tfoot>
                  <tr className="bg-[#e2e8f0] font-black border-t-2 border-slate-300">
                    <td colSpan={2} className="py-2.5 px-2 text-right text-slate-900 text-xs sm:text-base">
                      مجموع المبالغ المسددة:
                    </td>
                    <td className="py-2.5 px-1 text-center text-[#047857] text-xs sm:text-lg dir-ltr whitespace-nowrap">
                      {totalPaid.toLocaleString('en-US')} د.ع
                    </td>
                    <td colSpan={2} className="py-2.5 px-2 text-right text-slate-700 text-[10px] sm:text-xs font-extrabold">
                      ({numberToArabicWords(totalPaid)})
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Footer Signature */}
        <div className="flex flex-row items-center justify-between pt-2.5 border-t-2 border-dashed border-slate-300 text-[10px] sm:text-xs font-bold text-slate-600 mt-3 gap-2">
          <div>الكرار للموبايل والتقسيط - وثيقة كشف حساب معتمدة</div>
          <div className="font-black text-slate-900">توقيع وختم الإدارة: ___________________</div>
        </div>
      </div>

      {/* Copy Link Option */}
      <button
        onClick={handleCopyLink}
        className="mt-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors print:hidden mb-4"
      >
        <Copy className="w-3.5 h-3.5" />
        <span>{copySuccess ? 'تم نسخ الرابط بنجاح ✓' : 'نسخ رابط الكشف المباشر'}</span>
      </button>
    </div>
  );
};
