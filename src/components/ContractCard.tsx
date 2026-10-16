import React, { useState } from 'react';
import { ShoppingBag, Trash2, ArrowRightLeft, X, ChevronUp, ChevronDown, ShieldAlert, Zap, CalendarClock } from 'lucide-react';
import { InstallmentContract, Language, CustomerList, SalesRepresentative } from '../types';
import { ActionMenu, ActionMenuItem } from './ActionMenu';

interface ContractCardProps {
  contract: InstallmentContract;
  index?: number;
  totalCount?: number;
  lang: Language;
  onSelect?: (contract: InstallmentContract) => void;
  onPay: (e: React.MouseEvent, contract: InstallmentContract) => void;
  onViewPayments: (e: React.MouseEvent, contract: InstallmentContract) => void;
  onNewSale?: (e: React.MouseEvent, contract: InstallmentContract) => void;
  onEdit?: (e: React.MouseEvent, contract: InstallmentContract) => void;
  onDelete?: (e: React.MouseEvent, contract: InstallmentContract) => void;
  onCall?: (e: React.MouseEvent, phone: string) => void;
  customerLists?: CustomerList[];
  currentRep?: SalesRepresentative | null;
  isAdmin?: boolean;
  onMoveCustomer?: (contractId: string, newListId: string, newListName: string) => void;
  onAddAppointment?: (contract: InstallmentContract) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  showExpandToggle?: boolean;
  onSettleExcess?: (contractId: string, customerName?: string) => void;
}

export const ContractCard: React.FC<ContractCardProps> = ({
  contract,
  index,
  totalCount,
  lang,
  onSelect,
  onPay,
  onViewPayments,
  onEdit,
  onDelete,
  customerLists,
  currentRep,
  isAdmin,
  onMoveCustomer,
  onAddAppointment,
  isExpanded = false,
  onToggleExpand,
  showExpandToggle,
  onSettleExcess,
}) => {
  const isAr = lang === 'ar';
  const [showMoveModal, setShowMoveModal] = useState(false);

  const showPriceDetails = isExpanded;

  const formatMoney = (val: number) => {
    return Number(val || 0).toLocaleString('en-US') + (isAr ? ' د.ع' : ' IQD');
  };

  const rawTotalReceived = (contract.advancePayment || 0) + (contract.totalPaid || 0);
  const totalReceived = contract.totalPrice > 0 ? Math.min(contract.totalPrice, rawTotalReceived) : rawTotalReceived;
  const cardExcessAmount = (contract.excessAmount && contract.excessAmount > 0)
    ? contract.excessAmount
    : Math.max(0, (contract.rawTotalPaid !== undefined ? (contract.advancePayment || 0) + contract.rawTotalPaid : rawTotalReceived) - (contract.totalPrice || 0));

  const canMoveCustomer = Boolean(onMoveCustomer && (isAdmin || currentRep?.canMoveCustomer !== false));
  const allowedCustomerLists = (customerLists || []).filter((l) => {
    if (!currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
      return true;
    }
    return currentRep.allowedListIds.includes(l.id);
  });
  const targetLists = allowedCustomerLists.filter((l) => l.id !== contract.listId);

  const extraActions: ActionMenuItem[] = [
    ...(onAddAppointment
      ? [
          {
            label: isAr ? 'إضافة موعد' : 'Add Appointment',
            icon: <CalendarClock className="w-4 h-4 text-amber-500 flex-shrink-0" />,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              onAddAppointment(contract);
            },
          },
        ]
      : []),
    ...(canMoveCustomer && targetLists.length > 0
      ? [
          {
            label: isAr ? 'نقل الزبون' : 'Move Customer',
            icon: <ArrowRightLeft className="w-4 h-4 text-indigo-500 flex-shrink-0" />,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              setShowMoveModal(true);
            },
          },
        ]
      : []),
  ];

  return (
    <div
      className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl p-3 sm:p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-all space-y-2.5 dir-rtl relative"
    >
      {/* Top Header Row with Action Menu if edit or delete provided */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 truncate">
            {contract.listName || (isAr ? 'عقد عام' : 'General')}
          </span>
          {contract.status === 'completed' && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {isAr ? 'مكتمل' : 'Completed'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Toggle Button to expand (ChevronDown) / collapse (ChevronUp) - only shown for the first customer */}
          {showExpandToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleExpand) {
                  onToggleExpand();
                }
              }}
              title={
                showPriceDetails
                  ? (isAr ? 'طي جميع البطاقات وإخفاء التفاصيل' : 'Collapse All')
                  : (isAr ? 'فتح جميع البطاقات وإظهار التفاصيل' : 'Expand All')
              }
              className={`p-1 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                showPriceDetails
                  ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {showPriceDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={(e) => onDelete(e, contract)}
              className="p-1 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 dark:text-slate-500 transition-colors"
              title={isAr ? 'حذف الزبون / العقد' : 'Delete Customer'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {(onEdit || onDelete || extraActions.length > 0) && (
            <ActionMenu
              isAr={isAr}
              onEdit={onEdit ? (e) => onEdit(e, contract) : undefined}
              onDelete={onDelete ? (e) => onDelete(e, contract) : undefined}
              extraActions={extraActions}
            />
          )}
        </div>
      </div>

      {/* Customer Header Info */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate leading-snug">
            {contract.customerName}
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate mt-0.5">
            {contract.customerAddress || (isAr ? 'العنوان: غير محدد' : 'No address')}
          </p>
        </div>
        <div className="text-left shrink-0 dir-ltr">
          <a
            href={`tel:${contract.customerPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 sm:py-1 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition-colors inline-block"
          >
            {contract.customerPhone}
          </a>
        </div>
      </div>

      {/* Metric Badges with Collapsible Item Name, Sale Price & Daily Rate */}
      <div className="space-y-1.5 text-right">
        {/* Collapsible Section: Item Name, Sale Price & Daily Rate */}
        {showPriceDetails && (
          <div className="space-y-1.5 animate-fadeIn">
            {/* Item info line */}
            {contract.itemName && (
              <div className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 px-2.5 py-1 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">{isAr ? 'المادة / المحل:' : 'Item:'}</span>
                <span className="text-slate-800 dark:text-slate-200">{contract.itemName}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {/* Sale Price */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/50 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-300">
                  {isAr ? 'سعر البيع' : 'Sale Price'}
                </div>
                <div className="text-xs font-black text-indigo-950 dark:text-indigo-100 mt-0.5">
                  {formatMoney(contract.totalPrice)}
                </div>
              </div>

              {/* Daily Rate */}
              <div className="bg-sky-50/70 dark:bg-sky-950/50 p-2 rounded-xl border border-sky-100 dark:border-sky-900/60">
                <div className="text-[10px] font-black text-sky-600 dark:text-sky-300">
                  {isAr ? 'القسط اليومي' : 'Daily Rate'}
                </div>
                <div className="text-xs font-black text-sky-950 dark:text-sky-100 mt-0.5">
                  {formatMoney(contract.dailyInstallment)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Primary Row: Total Received & Remaining Balance */}
        <div className="grid grid-cols-2 gap-1.5 relative">
          {/* Total Received */}
          <div className="bg-emerald-50/70 dark:bg-emerald-950/50 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
            <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">
              {isAr ? 'إجمالي الواصل' : 'Total Paid'}
            </div>
            <div className="text-xs font-black text-emerald-900 dark:text-emerald-100 mt-0.5">
              {formatMoney(totalReceived)}
            </div>
          </div>

          {/* Remaining Balance */}
          <div className="bg-rose-50/70 dark:bg-rose-950/50 p-2 rounded-xl border border-rose-100 dark:border-rose-900/60">
            <div className="text-[10px] font-black text-rose-700 dark:text-rose-300">
              {isAr ? 'المبلغ المتبقي' : 'Remaining'}
            </div>
            <div className="text-xs font-black text-rose-900 dark:text-rose-100 mt-0.5">
              {formatMoney(contract.remainingBalance)}
            </div>
          </div>
        </div>
      </div>

        {cardExcessAmount > 0 && (
          <div className="flex items-center justify-between gap-1 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[11px] font-extrabold text-amber-900 dark:text-amber-200 animate-fadeIn">
            <div className="flex items-center gap-1.5 truncate">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                {isAr ? `فائض بحوزة المندوب: ${formatMoney(cardExcessAmount)}` : `Excess with rep: ${formatMoney(cardExcessAmount)}`}
              </span>
            </div>
            {onSettleExcess && (isAdmin || currentRep?.role === 'supervisor') && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSettleExcess(contract.id, contract.customerName);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black shrink-0 cursor-pointer shadow-xs inline-flex items-center gap-1"
                title={isAr ? 'تسوية وتصفير الحساب فوراً' : 'Settle excess now'}
              >
                <Zap className="w-3 h-3 fill-current" />
                <span>{isAr ? 'تسوية الفائض' : 'Settle'}</span>
              </button>
            )}
          </div>
        )}

      {/* Buttons: تسديد (Pay) or حذف (Delete if completed) and عرض التسديدات (View Payments) */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {contract.remainingBalance <= 0 || contract.status === 'completed' ? (
          onDelete ? (
            <button
              type="button"
              onClick={(e) => onDelete(e, contract)}
              className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'حذف الزبون المكتمل' : 'Delete Customer'}</span>
            </button>
          ) : (
            <div className="w-full py-2 px-3 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-black text-xs text-center flex items-center justify-center">
              {isAr ? 'مكتمل بالكامل' : 'Fully Paid'}
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={(e) => onPay(e, contract)}
            className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer flex items-center justify-center gap-1"
          >
            {isAr ? 'تسديد' : 'Pay'}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => onViewPayments(e, contract)}
          className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-black text-xs shadow-xs transition-all text-center cursor-pointer flex items-center justify-center gap-1"
        >
          {isAr ? 'عرض التسديدات' : 'View Payments'}
        </button>
      </div>

      {showMoveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn"
          onClick={(e) => {
            e.stopPropagation();
            setShowMoveModal(false);
          }}
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 dir-rtl text-right animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-slate-100">
                    {isAr ? 'نقل الزبون إلى قائمة أخرى' : 'Move Customer'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate">
                    {contract.customerName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoveModal(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {isAr ? 'اختر القائمة المطلوب نقل الزبون إليها:' : 'Select destination list:'}
              </p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {targetLists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onMoveCustomer) {
                        onMoveCustomer(contract.id, l.id, l.name);
                      }
                      setShowMoveModal(false);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900/60 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-slate-800 dark:text-slate-200 font-extrabold text-xs transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <span>{l.name}</span>
                    <ArrowRightLeft className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMoveModal(false);
              }}
              className="w-full py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-extrabold text-xs transition-colors cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

