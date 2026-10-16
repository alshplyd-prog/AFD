import React, { useState } from 'react';
import { Boxes, X, Plus, Search, CheckCircle, AlertCircle, Edit3, Trash2, Check } from 'lucide-react';
import { InventoryItem, Language } from '../types';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  lang: Language;
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateItem: (id: string, data: Partial<InventoryItem>) => void;
  onDeleteItem: (id: string) => void;
  onSelectItem?: (item: InventoryItem) => void;
  isSelectMode?: boolean;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  items,
  lang,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onSelectItem,
  isSelectMode = false,
}) => {
  const isAr = lang === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [dailyInstallment, setDailyInstallment] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const formatMoney = (val: number) => {
    return val.toLocaleString('en-US') + (isAr ? ' د.ع' : ' IQD');
  };

  const filteredItems = items.filter((item) => {
    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleOpenForm = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setPrice(item.price.toString());
      setQuantity(item.quantity.toString());
      setDailyInstallment(item.dailyInstallment ? item.dailyInstallment.toString() : '');
    } else {
      setEditingItem(null);
      setName('');
      setPrice('');
      setQuantity('');
      setDailyInstallment('');
    }
    setError('');
    setIsFormOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isAr ? 'اسم المادة مطلوب' : 'Item name required');
      return;
    }
    let validPrice = Number(price) || 0;
    if (validPrice > 0 && validPrice < 1000) validPrice = validPrice * 1000;

    let validDaily = Number(dailyInstallment) || 0;
    if (validDaily > 0 && validDaily < 1000) validDaily = validDaily * 1000;

    if (validPrice <= 0) {
      setError(isAr ? 'أدخل سعر صحيح' : 'Valid price required');
      return;
    }
    if (Number(quantity) < 0) {
      setError(isAr ? 'أدخل كمية صحيح' : 'Valid quantity required');
      return;
    }

    if (editingItem) {
      onUpdateItem(editingItem.id, {
        name: name.trim(),
        price: validPrice,
        quantity: Number(quantity),
        dailyInstallment: validDaily,
      });
    } else {
      onAddItem({
        name: name.trim(),
        price: validPrice,
        quantity: Number(quantity),
        dailyInstallment: validDaily,
        createdAt: new Date().toISOString(),
      });
    }

    setIsFormOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200 dir-rtl">
      <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-5xl lg:max-w-6xl max-h-[94vh] shadow-2xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-sm">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                {isAr ? 'صفحة المخزن والمواد' : 'Inventory & Stock Page'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isSelectMode
                  ? isAr ? 'اضغط على المادة لاختيارها فوراً للبيع' : 'Click item to select for sale'
                  : isAr ? 'عرض وإضافة وتعديل مواد المخزن' : 'Manage inventory items'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenForm()}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة مادة' : 'Add Item'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'البحث باسم المادة...' : 'Search stock item...'}
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {/* Items List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-slate-50/50 dark:bg-slate-900/50">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs font-bold">
              {isAr ? 'لا توجد مواد مطابقة بالمخزن' : 'No items found'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredItems.map((item) => {
                const isOutOfStock = item.quantity === 0;
                const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '';

                return (
                  <div
                    key={item.id}
                    className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-xs flex flex-col justify-between space-y-2.5 hover:border-teal-500 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        {formattedDate ? (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {isAr ? `تاريخ الإضافة: ${formattedDate}` : `Added: ${formattedDate}`}
                          </span>
                        ) : <span />}

                        {isOutOfStock ? (
                          <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {isAr ? 'نفذت الكمية' : 'Out of Stock'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {isAr ? `متوفر: ${item.quantity} قطعة` : `Stock: ${item.quantity}`}
                          </span>
                        )}
                      </div>

                      <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                        {item.name}
                      </h4>

                      <div className="flex items-center justify-between gap-2 text-xs font-bold mt-1">
                        <span className="text-teal-600 dark:text-teal-400">
                          {isAr ? 'السعر:' : 'Price:'} {formatMoney(item.price)}
                        </span>
                        {item.dailyInstallment ? (
                          <span className="text-blue-600 dark:text-blue-400">
                            {isAr ? 'القسط:' : 'Rate:'} {formatMoney(item.dailyInstallment)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                      {isSelectMode && onSelectItem ? (
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => {
                            onSelectItem(item);
                            onClose();
                          }}
                          className={`w-full py-2 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all ${
                            isOutOfStock
                              ? 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-teal-600 hover:bg-teal-700 text-white shadow-xs active:scale-95'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                          <span>{isAr ? 'اختيار هذه المادة' : 'Select Item'}</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 w-full justify-end">
                          <button
                            onClick={() => handleOpenForm(item)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 transition-colors"
                            title={isAr ? 'تعديل' : 'Edit'}
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteItem(item.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                            title={isAr ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Sub-Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-5 border-2 border-slate-300 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                {editingItem ? (isAr ? 'تعديل المادة' : 'Edit Item') : (isAr ? 'إضافة مادة للمخزن' : 'Add Stock Item')}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المادة' : 'Item Name'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold"
                  placeholder={isAr ? 'مثال: ثلاجة هيتاشي' : 'e.g. Fridge'}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>{isAr ? 'سعر البيع (د.ع)' : 'Sale Price'}</span>
                    {Number(price) > 0 && Number(price) < 1000 && (
                      <span className="text-[10px] font-bold text-teal-600">
                        {isAr ? `سيصبح: ${(Number(price) * 1000).toLocaleString('en-US')}` : `Will be: ${(Number(price) * 1000).toLocaleString('en-US')}`}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    onBlur={() => {
                      const p = Number(price);
                      if (p > 0 && p < 1000) setPrice((p * 1000).toString());
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold dir-ltr"
                    placeholder="500000"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>{isAr ? 'قسط المادة (د.ع)' : 'Daily Rate'}</span>
                    {Number(dailyInstallment) > 0 && Number(dailyInstallment) < 1000 && (
                      <span className="text-[10px] font-bold text-teal-600">
                        {isAr ? `سيصبح: ${(Number(dailyInstallment) * 1000).toLocaleString('en-US')}` : `Will be: ${(Number(dailyInstallment) * 1000).toLocaleString('en-US')}`}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    value={dailyInstallment}
                    onChange={(e) => setDailyInstallment(e.target.value)}
                    onBlur={() => {
                      const d = Number(dailyInstallment);
                      if (d > 0 && d < 1000) setDailyInstallment((d * 1000).toString());
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold dir-ltr"
                    placeholder="10000"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الكمية المتوفرة' : 'Stock Quantity'}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold dir-ltr"
                  placeholder="5"
                />
              </div>

              {error && <p className="text-rose-500 font-bold">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 rounded-lg border text-slate-600 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-teal-600 text-white font-bold hover:bg-teal-700"
                >
                  {isAr ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
