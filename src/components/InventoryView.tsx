import React, { useState } from 'react';
import { Package, Plus, Search, Edit3, Trash2, AlertCircle, CheckCircle, Boxes, X } from 'lucide-react';
import { InventoryItem, Language, SalesRepresentative } from '../types';
import { ActionMenu } from './ActionMenu';

interface InventoryViewProps {
  items: InventoryItem[];
  lang: Language;
  onAddItem: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateItem: (id: string, data: Partial<InventoryItem>) => void;
  onDeleteItem: (id: string) => void;
  currentRep?: SalesRepresentative | null;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  lang,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  currentRep,
}) => {
  const isAr = lang === 'ar';
  const isAdmin = currentRep?.role === 'admin';
  const canEdit = isAdmin || currentRep?.canEdit !== false;
  const canDelete = isAdmin || currentRep?.canDelete === true;
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [dailyInstallment, setDailyInstallment] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');

  const formatMoney = (val: number) => {
    return val.toLocaleString('en-US') + (isAr ? ' د.ع' : ' IQD');
  };

  const filteredItems = items.filter((item) => {
    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleOpenAddModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setPrice(item.price.toString());
      setPurchasePrice(item.purchasePrice ? item.purchasePrice.toString() : '');
      setDailyInstallment(item.dailyInstallment ? item.dailyInstallment.toString() : '');
      setQuantity(item.quantity.toString());
    } else {
      setEditingItem(null);
      setName('');
      setPrice('');
      setPurchasePrice('');
      setDailyInstallment('');
      setQuantity('');
    }
    setError('');
    setIsAddModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isAr ? 'اسم المادة مطلوب' : 'Item name is required');
      return;
    }
    if (Number(price) <= 0) {
      setError(isAr ? 'أدخل سعر بيع صحيح' : 'Valid price required');
      return;
    }
    if (Number(quantity) < 0) {
      setError(isAr ? 'أدخل كمية المخزون' : 'Valid quantity required');
      return;
    }

    if (editingItem) {
      onUpdateItem(editingItem.id, {
        name: name.trim(),
        price: Number(price),
        purchasePrice: Number(purchasePrice) || 0,
        dailyInstallment: Number(dailyInstallment) || 0,
        quantity: Number(quantity),
      });
    } else {
      onAddItem({
        name: name.trim(),
        price: Number(price),
        purchasePrice: Number(purchasePrice) || 0,
        dailyInstallment: Number(dailyInstallment) || 0,
        quantity: Number(quantity),
        createdAt: new Date().toISOString(),
      });
    }

    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-4 dir-rtl">
      {/* Compact Top Header Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">
              {isAr ? 'المخزن والمواد المتوفرة' : 'Inventory & Products'}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {isAr ? `إجمالي المواد: ${items.length} مادة` : `Total items: ${items.length}`}
            </p>
          </div>
        </div>

        <button
          onClick={() => handleOpenAddModal()}
          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAr ? 'إضافة مادة' : 'Add Item'}</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-xs">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث في المخزن باسم المادة...' : 'Search stock items...'}
            className="w-full pr-10 pl-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      {/* Items Table Format */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-8">
          <Package className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
            {isAr ? 'لا توجد مواد في المخزن' : 'No items in stock'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            {isAr ? 'اضغط على زر إضافة مادة لإضافة منتج جديد للمخزن' : 'Click add new item to register inventory'}
          </p>
          <button
            onClick={() => handleOpenAddModal()}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
          >
            {isAr ? 'إضافة مادة للمخزن' : 'Add Item'}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-black border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3">{isAr ? 'اسم المادة' : 'Item Name'}</th>
                  <th className="p-3">{isAr ? 'سعر البيع (د.ع)' : 'Sale Price'}</th>
                  <th className="p-3">{isAr ? 'سعر الشراء (د.ع)' : 'Cost Price'}</th>
                  <th className="p-3">{isAr ? 'قسط المادة (د.ع)' : 'Daily Rate'}</th>
                  <th className="p-3">{isAr ? 'الكمية المتوفرة' : 'Stock'}</th>
                  <th className="p-3">{isAr ? 'تاريخ الإضافة' : 'Date Added'}</th>
                  <th className="p-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-semibold">
                {filteredItems.map((item) => {
                  const isOutOfStock = item.quantity === 0;
                  const isLowStock = item.quantity <= 2;
                  const dateFormatted = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '-';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <td className="p-3 font-extrabold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>

                      <td className="p-3 text-teal-600 dark:text-teal-400 font-black dir-ltr text-right">
                        {formatMoney(item.price)}
                      </td>

                      <td className="p-3 text-amber-600 dark:text-amber-400 font-black dir-ltr text-right">
                        {item.purchasePrice ? formatMoney(item.purchasePrice) : '-'}
                      </td>

                      <td className="p-3 text-blue-600 dark:text-blue-400 font-black dir-ltr text-right">
                        {item.dailyInstallment ? formatMoney(item.dailyInstallment) : '-'}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-[11px] ${
                            isOutOfStock
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200'
                              : isLowStock
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
                          }`}
                        >
                          {isOutOfStock ? (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              {isAr ? 'نفذت الكمية' : 'Out of Stock'}
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              {item.quantity} {isAr ? 'قطع' : 'pcs'}
                            </>
                          )}
                        </span>
                      </td>

                      <td className="p-3 text-slate-500 dark:text-slate-400 text-xs dir-ltr text-right font-medium">
                        {dateFormatted}
                      </td>

                      <td className="p-3 text-center">
                        <ActionMenu
                          isAr={isAr}
                          onEdit={canEdit ? () => handleOpenAddModal(item) : undefined}
                          onDelete={canDelete ? () => onDeleteItem(item.id) : undefined}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Inventory Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                {editingItem
                  ? isAr ? 'تعديل تفاصيل المادة' : 'Edit Inventory Item'
                  : isAr ? 'إضافة مادة جديدة للمخزن' : 'Add Item to Inventory'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المادة *' : 'Item Name *'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'مثال: ثلاجة هيتاشي 18 قدم' : 'e.g. Hitachi Fridge'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'سعر البيع (د.ع) *' : 'Sale Price *'}
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="750000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold dir-ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'سعر الشراء (د.ع)' : 'Purchase Price'}
                  </label>
                  <input
                    type="number"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    placeholder="500000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold dir-ltr"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'قسط المادة (د.ع)' : 'Daily Rate'}
                  </label>
                  <input
                    type="number"
                    value={dailyInstallment}
                    onChange={(e) => setDailyInstallment(e.target.value)}
                    placeholder="10000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold dir-ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الكمية المتوفرة *' : 'Stock Quantity *'}
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="10"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold dir-ltr"
                />
              </div>

              {error && <p className="text-rose-500 font-bold">{error}</p>}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700"
                >
                  {editingItem ? (isAr ? 'تحديث' : 'Update') : (isAr ? 'إضافة للمخزن' : 'Add to Stock')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
