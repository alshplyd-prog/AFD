import React from 'react';
import { ShoppingBag, Plus } from 'lucide-react';
import { Language } from '../types';

interface EmptyStateProps {
  searchQuery: string;
  lang: Language;
  onOpenAddModal: () => void;
  onClearSearch: () => void;
  canSell?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  searchQuery,
  lang,
  onOpenAddModal,
  onClearSearch,
  canSell = false,
}) => {
  const isAr = lang === 'ar';

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 my-6">
      <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-700 text-slate-400 flex items-center justify-center mb-4">
        <ShoppingBag className="w-8 h-8" />
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
        {searchQuery
          ? isAr ? 'لم يتم العثور على نتائج' : 'No Results Found'
          : isAr
            ? (canSell ? 'لا توجد عملاء مضافين بعد' : 'لا توجد عملاء في هذه القائمة')
            : (canSell ? 'No Customers Added Yet' : 'No Customers In This List')}
      </h3>

      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-6 leading-relaxed">
        {searchQuery
          ? isAr
            ? `لا تنطبق أي نتائج على "${searchQuery}". جرب البحث بكلمات أخرى.`
            : `No clients matched "${searchQuery}". Try searching with different terms.`
          : isAr
            ? (canSell
                ? 'اضغط على زر (بيع جديد) لإضافة أول زبون ومبيع بالتقسيط اليومي.'
                : 'لا توجد عقود أو زبائن مسجلين ضمن هذه القائمة حالياً.')
            : (canSell
                ? 'Click the add button to record your first client and daily installment sale.'
                : 'No contracts or customers registered in this list currently.')}
      </p>

      {searchQuery ? (
        <button
          onClick={onClearSearch}
          className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {isAr ? 'مسح تصفية البحث' : 'Clear Search'}
        </button>
      ) : canSell ? (
        <button
          onClick={onOpenAddModal}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'تسجيل بيع جديد' : 'Add First Installment Sale'}</span>
        </button>
      ) : null}
    </div>
  );
};
