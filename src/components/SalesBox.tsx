import React, { useState, useMemo } from 'react';
import { ShoppingBag, Calendar, Search, ChevronDown, Check, X, Layers } from 'lucide-react';
import { InstallmentContract, CustomerList, InventoryItem, SalesRepresentative, Language } from '../types';
import { getLocalDateString } from '../lib/dateUtils';

interface SalesBoxProps {
  contracts: InstallmentContract[];
  customerLists: CustomerList[];
  inventory: InventoryItem[];
  reps: SalesRepresentative[];
  currentRep: SalesRepresentative | null;
  lang: Language;
  onOpenCustomerHistory?: (contract: InstallmentContract) => void;
  onClose?: () => void;
}

export const SalesBox: React.FC<SalesBoxProps> = ({
  contracts,
  customerLists,
  inventory,
  reps,
  currentRep,
  lang,
  onOpenCustomerHistory,
  onClose,
}) => {
  const isAr = lang === 'ar';
  const today = getLocalDateString();

  // Filter States
  const [selectedListId, setSelectedListId] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isListDropdownOpen, setIsListDropdownOpen] = useState(false);

  // Allowed lists for current rep
  const availableLists = useMemo(() => {
    return customerLists.filter((l) => {
      if (!currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) {
        return true;
      }
      return currentRep.allowedListIds.includes(l.id);
    });
  }, [customerLists, currentRep]);

  // Filter Sales Contracts
  const filteredSales = useMemo(() => {
    return contracts.filter((c) => {
      // 1. List Filter
      if (selectedListId !== 'all' && c.listId !== selectedListId) {
        return false;
      }

      // Rep / user list restriction check
      if (currentRep && currentRep.allowedListIds && !currentRep.allowedListIds.includes('all')) {
        if (c.listId && !currentRep.allowedListIds.includes(c.listId)) {
          return false;
        }
      }

      // 2. Date Range Filter
      const saleDate = c.startDate || (c.createdAt ? getLocalDateString(c.createdAt) : '');
      if (startDate && saleDate < startDate) return false;
      if (endDate && saleDate > endDate) return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = c.customerName.toLowerCase().includes(query);
        const matchesItem = c.itemName.toLowerCase().includes(query);
        const matchesPhone = c.customerPhone.includes(query);
        const matchesRep = (c.repName || '').toLowerCase().includes(query);
        if (!matchesName && !matchesItem && !matchesPhone && !matchesRep) return false;
      }

      return true;
    });
  }, [contracts, selectedListId, startDate, endDate, searchQuery, currentRep]);

  const toWesternDigits = (str: string): string => {
    return (str || '').replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  };

  // Helper to extract clean base name without quantity annotations
  const extractCleanItemName = (rawName: string): string => {
    if (!rawName) return '';
    return rawName
      .replace(/(?:\(|\[)?\s*(?:العدد|عدد)\s*[:=-]?\s*[\d٠-٩]+\s*(?:\)|\])?/gi, '')
      .replace(/\s*\(العدد:\s*[\d٠-٩]+\)/gi, '')
      .replace(/\s*\(\s*[\d٠-٩]+\s*جهاز\s*\)/gi, '')
      .trim();
  };

  // Helper to extract contract quantity reliably from itemName or itemQuantity or totalPrice ratio
  const extractContractQuantity = (c: { itemName?: string; itemQuantity?: number; totalPrice?: number; itemId?: string }): number => {
    const rawName = c.itemName || '';
    const name = toWesternDigits(rawName);

    // 1. Check if quantity is embedded in itemName: e.g. "اجهزه 175 (عدد 20)" or "(العدد: 20)" or "عدد 20"
    const match = name.match(/(?:\(|\[)?\s*(?:العدد|عدد)\s*[:=-]?\s*(\d+)\s*(?:\)|\])?/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }

    // 2. If explicit itemQuantity is set and > 1
    if (c.itemQuantity && Number(c.itemQuantity) > 1) {
      return Number(c.itemQuantity);
    }

    // 3. Check if matching inventory item has selling price, and totalPrice is a clean multiple of it
    if (c.totalPrice && c.totalPrice > 0) {
      let invItem = c.itemId ? inventory.find((i) => i.id === c.itemId) : undefined;
      if (!invItem) {
        const cleanName = extractCleanItemName(rawName);
        invItem = inventory.find(
          (i) => i.name.trim().toLowerCase() === cleanName.toLowerCase() ||
                 cleanName.toLowerCase().startsWith(i.name.trim().toLowerCase())
        );
      }
      if (invItem && invItem.price && invItem.price > 0) {
        const multiple = Math.round(c.totalPrice / invItem.price);
        if (multiple > 1 && Math.abs(multiple * invItem.price - c.totalPrice) < 5) {
          return multiple;
        }
      }
    }

    // 4. Fallback to c.itemQuantity or 1
    return Math.max(1, Number(c.itemQuantity) || 1);
  };

  // Helper to get unit purchase price
  const getUnitPurchasePrice = (c: InstallmentContract): number => {
    if (c.purchasePrice !== undefined && c.purchasePrice > 0) {
      return c.purchasePrice;
    }
    if (c.itemId) {
      const found = inventory.find((i) => i.id === c.itemId);
      if (found && found.purchasePrice && found.purchasePrice > 0) {
        return found.purchasePrice;
      }
    }
    // Fallback: match by clean item name against inventory
    const cleanName = extractCleanItemName(c.itemName || '');
    if (cleanName) {
      const foundByName = inventory.find((i) =>
        i.name.trim().toLowerCase() === cleanName.toLowerCase() ||
        cleanName.toLowerCase().startsWith(i.name.trim().toLowerCase())
      );
      if (foundByName && foundByName.purchasePrice && foundByName.purchasePrice > 0) {
        return foundByName.purchasePrice;
      }
    }
    return 0;
  };

  // Helper to get total purchase price: سعر شرائها يضرب في عددها
  const getPurchasePrice = (c: InstallmentContract): number => {
    const qty = extractContractQuantity(c);
    const unitPrice = getUnitPurchasePrice(c);
    return unitPrice * qty;
  };

  // Helper to format Item Name & Quantity in the same cell: حتى اذا جهاز واحد انطي عدد 1 مقابله
  const formatItemAndQty = (c: InstallmentContract): string => {
    const baseName = extractCleanItemName(c.itemName || '') || c.itemName || (isAr ? 'مادة غير محددة' : 'Unspecified Item');
    const qty = extractContractQuantity(c);
    return `${baseName} (العدد: ${qty})`;
  };

  // Calculate Totals for Footer Row
  const totals = useMemo(() => {
    let totalSelling = 0;
    let totalPurchase = 0;
    let totalDailyInst = 0;
    let totalQty = 0;

    filteredSales.forEach((c) => {
      const qty = extractContractQuantity(c);
      totalQty += qty;
      totalSelling += c.totalPrice || 0;
      totalPurchase += getPurchasePrice(c);
      totalDailyInst += c.dailyInstallment || 0;
    });

    const totalProfit = Math.max(0, totalSelling - totalPurchase);

    return {
      count: filteredSales.length,
      totalQty,
      totalSelling,
      totalPurchase,
      totalDailyInst,
      totalProfit,
    };
  }, [filteredSales, inventory]);

  // مجموع نوع المادة والعدد وسعر شرائها الإجمالي المضروب في العدد
  const itemTypeSummary = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; totalPurchase: number; totalSelling: number }>();
    filteredSales.forEach((c) => {
      const cleanName = extractCleanItemName(c.itemName || '') || c.itemName?.trim() || (isAr ? 'مادة غير محددة' : 'Unspecified Item');
      const qty = extractContractQuantity(c);
      const purchase = getPurchasePrice(c);
      const selling = c.totalPrice || 0;
      const existing = map.get(cleanName) || { name: cleanName, qty: 0, totalPurchase: 0, totalSelling: 0 };
      existing.qty += qty;
      existing.totalPurchase += purchase;
      existing.totalSelling += selling;
      map.set(cleanName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [filteredSales, inventory, isAr]);

  // Selected List Label
  const selectedListLabel = useMemo(() => {
    if (selectedListId === 'all') return isAr ? 'جميع القوائم' : 'All Lists';
    const found = customerLists.find((l) => l.id === selectedListId);
    return found ? found.name : isAr ? 'قائمة غير معروفة' : 'Unknown List';
  }, [selectedListId, customerLists, isAr]);

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 font-sans dir-rtl select-none">
      {/* Responsive Filter Bar: Adapts to all devices - Expands on large screens, contracts outer padding on small screens */}
      <div className="p-2 sm:p-3 md:p-3.5 bg-slate-100 dark:bg-slate-800/95 border-b border-slate-300 dark:border-slate-700 shrink-0 space-y-2">
        {/* Top Controls Row: List Selector + From Date + To Date in a single row on mobile */}
        <div className="grid grid-cols-3 gap-1 sm:gap-2 w-full items-center">
          {/* Customer List Selector */}
          <div className="relative w-full min-w-0">
            <button
              type="button"
              onClick={() => setIsListDropdownOpen((prev) => !prev)}
              className="flex items-center justify-between gap-1 bg-white dark:bg-slate-700 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-300 dark:border-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-650 w-full text-[10px] xs:text-[11px] sm:text-xs font-black text-slate-800 dark:text-slate-100 cursor-pointer"
              title={isAr ? 'تصفية حسب القائمة' : 'Filter by List'}
            >
              <div className="flex items-center gap-1 min-w-0 truncate">
                <Layers className="w-3 h-3 xs:w-3.5 xs:h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">{selectedListLabel}</span>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {isListDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsListDropdownOpen(false)}
                />
                <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-1.5 w-full min-w-[200px] space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedListId('all');
                      setIsListDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs sm:text-sm text-right cursor-pointer transition-colors ${
                      selectedListId === 'all'
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                    }`}
                  >
                    <span>{isAr ? 'جميع القوائم المتاحة' : 'All Customer Lists'}</span>
                    {selectedListId === 'all' && <Check className="w-4 h-4 text-blue-600" />}
                  </button>

                  <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />

                  <div className="max-h-48 overflow-y-auto space-y-0.5 no-scrollbar">
                    {availableLists.map((list) => {
                      const isSelected = selectedListId === list.id;
                      return (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => {
                            setSelectedListId(list.id);
                            setIsListDropdownOpen(false);
                          }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs sm:text-sm text-right cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-black'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold'
                          }`}
                        >
                          <span className="truncate">{list.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* From Date Picker */}
          <div className="relative flex items-center justify-between gap-0.5 sm:gap-1 bg-white dark:bg-slate-700 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-300 dark:border-slate-600 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 shrink-0 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="text-[10px] xs:text-[11px] sm:text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'من:' : 'From:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[10px] xs:text-[11px] sm:text-xs text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
              {startDate ? startDate.replace(/-/g, '/') : (isAr ? '----/--/--' : '----/--/--')}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              title={isAr ? 'من تاريخ' : 'From Date'}
            />
          </div>

          {/* To Date Picker */}
          <div className="relative flex items-center justify-between gap-0.5 sm:gap-1 bg-white dark:bg-slate-700 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-slate-300 dark:border-slate-600 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 shrink-0 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0"></span>
              <span className="text-[10px] xs:text-[11px] sm:text-xs font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'إلى:' : 'To:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[10px] xs:text-[11px] sm:text-xs text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
              {endDate ? endDate.replace(/-/g, '/') : (isAr ? '----/--/--' : '----/--/--')}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
              title={isAr ? 'إلى تاريخ' : 'To Date'}
            />
          </div>
        </div>

        {/* Row 2: Search Input Box, Reset, Count, and Close Button */}
        <div className="flex items-center gap-2 w-full">
          {/* Search Input Box */}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-700 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 flex-1 min-w-0 shadow-2xs">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'بحث عن زبون أو مادة أو هاتف...' : 'Search customer or item...'}
              className="w-full bg-transparent font-bold text-slate-800 dark:text-slate-100 focus:outline-none placeholder:text-slate-400 text-xs sm:text-sm"
            />
          </div>

          {/* Reset Filters Button */}
          {(startDate || endDate || selectedListId !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSelectedListId('all');
                setSearchQuery('');
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-black text-xs transition-colors shrink-0 whitespace-nowrap cursor-pointer shadow-2xs"
            >
              {isAr ? 'إعادة ضبط' : 'Reset'}
            </button>
          )}

          {/* Sales Count & Total Items Pill */}
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-black shrink-0 whitespace-nowrap shadow-2xs">
            <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{totals.count} {isAr ? 'مبيع' : 'Sales'} ({totals.totalQty} {isAr ? 'جهاز' : 'Items'})</span>
          </div>

          {/* Close Button if provided */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-200 hover:bg-rose-600 dark:bg-slate-700 dark:hover:bg-rose-600 text-slate-700 dark:text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0 shadow-2xs"
              title={isAr ? 'إغلاق' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Item Types Summary Breakdown (مجموع نوع المادة والعدد وسعر شرائها) */}
        {itemTypeSummary.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1.5 border-t border-slate-200 dark:border-slate-700">
            <span className="text-[10px] xs:text-[11px] font-black text-slate-500 dark:text-slate-400 shrink-0 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              {isAr ? 'مجموع المواد:' : 'Items Summary:'}
            </span>
            {itemTypeSummary.map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 px-2 py-0.5 rounded-lg text-[10px] xs:text-[11px] font-black shrink-0 shadow-2xs whitespace-nowrap"
              >
                <span className="text-slate-800 dark:text-slate-200 font-black">{item.name}</span>
                <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1.5 py-0.2 rounded-md font-extrabold text-[10px]">
                  {isAr ? `العدد: ${item.qty}` : `Qty: ${item.qty}`}
                </span>
                {item.totalPurchase > 0 && (
                  <span className="text-rose-700 dark:text-rose-300 font-bold text-[10px]" dir="ltr">
                    ({item.totalPurchase.toLocaleString('en-US')} د.ع)
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Table Container (Fills Full Height & Width) */}
      <div className="flex-1 w-full overflow-auto bg-white dark:bg-slate-900 relative">
        <table className="w-full text-right border-collapse border border-slate-800 dark:border-slate-700 min-w-[700px]">
          {/* Frozen Table Header */}
          <thead className="sticky top-0 z-20 shadow-xs">
            <tr className="bg-[#b8cce4] dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black border-b border-slate-900 dark:border-slate-600 text-xs sm:text-sm">
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap w-10">
                #
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'التاريخ' : 'Date'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2.5 py-2 border border-slate-900 dark:border-slate-600 text-right whitespace-nowrap">
                {isAr ? 'اسم الزبون' : 'Customer Name'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2.5 py-2 border border-slate-900 dark:border-slate-600 text-right whitespace-nowrap">
                {isAr ? 'نوع المادة والعدد' : 'Item & Quantity'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'القسط' : 'Installment'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'سعر الشراء' : 'Purchase Cost'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'سعر البيع' : 'Selling Price'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'القائمة المضاف عليها' : 'Added List'}
              </th>
              <th className="sticky top-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center whitespace-nowrap">
                {isAr ? 'البائع' : 'Seller / Rep'}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-300 dark:divide-slate-700 font-black text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
            {filteredSales.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-slate-400 font-bold text-xs sm:text-sm">
                  {isAr ? 'لا توجد عمليات بيع مطابقة للفلتر والتاريخ المحدد' : 'No sales records match the selected filters'}
                </td>
              </tr>
            ) : (
              filteredSales.map((c, idx) => {
                const qty = extractContractQuantity(c);
                const unitPrice = getUnitPurchasePrice(c);
                const pPrice = getPurchasePrice(c);
                const listName = c.listName || customerLists.find((l) => l.id === c.listId)?.name || '—';

                return (
                  <tr key={c.id} className="hover:bg-blue-50/80 dark:hover:bg-slate-700/60 transition-colors">
                    {/* # Index */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-bold text-slate-500 dark:text-slate-400 text-xs">
                      {idx + 1}
                    </td>

                    {/* Date */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-slate-800 dark:text-slate-200 text-xs whitespace-nowrap">
                      {c.startDate || getLocalDateString(c.createdAt)}
                    </td>

                    {/* Customer Name */}
                    <td className="px-2.5 py-1.5 border border-slate-900 dark:border-slate-600 font-black">
                      {onOpenCustomerHistory ? (
                        <button
                          type="button"
                          onClick={() => onOpenCustomerHistory(c)}
                          className="text-blue-700 dark:text-blue-400 hover:underline text-right font-black cursor-pointer text-xs sm:text-sm block truncate max-w-[200px]"
                        >
                          {c.customerName}
                        </button>
                      ) : (
                        <span className="text-slate-900 dark:text-slate-100 font-black text-xs sm:text-sm truncate block max-w-[200px]">
                          {c.customerName}
                        </span>
                      )}
                    </td>

                    {/* Item Name & Quantity in SAME cell */}
                    <td className="px-2.5 py-1.5 border border-slate-900 dark:border-slate-600 text-right text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm">
                      <span className="bg-slate-100 dark:bg-slate-750 px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-200 inline-block font-black">
                        {formatItemAndQty(c)}
                      </span>
                    </td>

                    {/* Daily Installment */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-amber-800 dark:text-amber-300 text-xs sm:text-sm whitespace-nowrap">
                      {(c.dailyInstallment || 0).toLocaleString('en-US')}
                    </td>

                    {/* Purchase Price (سعر الشراء مضروب في العدد) */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-rose-800 dark:text-rose-300 text-xs sm:text-sm whitespace-nowrap">
                      {pPrice > 0 ? (
                        <div>
                          <span>{pPrice.toLocaleString('en-US')}</span>
                          {qty > 1 && (
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold" dir="ltr">
                              ({unitPrice.toLocaleString('en-US')} × {qty})
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>

                    {/* Selling Price (سعر البيع) */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-900 dark:text-blue-300 text-xs sm:text-sm whitespace-nowrap">
                      {(c.totalPrice || 0).toLocaleString('en-US')}
                    </td>

                    {/* Customer List Added To */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center text-slate-800 dark:text-slate-200 font-bold text-xs whitespace-nowrap">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 font-extrabold border border-blue-200 dark:border-blue-800">
                        {listName}
                      </span>
                    </td>

                    {/* Seller / Representative */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center text-slate-800 dark:text-slate-300 font-bold text-xs whitespace-nowrap">
                      {c.repName || 'غير محدد'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Frozen Summary Footer Row */}
          {filteredSales.length > 0 && (
            <tfoot className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 font-black text-slate-900 dark:text-slate-100 border-t-2 border-slate-900 dark:border-slate-500 shadow-md">
              <tr>
                <td colSpan={3} className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2.5 py-2 border border-slate-900 dark:border-slate-600 text-right font-black text-xs sm:text-sm">
                  {isAr ? 'الإجمالي للفترة المحددة' : 'Period Totals'}
                </td>
                <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center font-black text-xs sm:text-sm whitespace-nowrap text-blue-950 dark:text-blue-200">
                  {isAr ? `مجموع العدد: ${totals.totalQty} جهاز` : `Total Qty: ${totals.totalQty}`}
                </td>
                <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-amber-900 dark:text-amber-200 text-xs sm:text-sm whitespace-nowrap">
                  {totals.totalDailyInst.toLocaleString('en-US')}
                </td>
                <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-rose-900 dark:text-rose-300 text-xs sm:text-sm whitespace-nowrap">
                  {totals.totalPurchase.toLocaleString('en-US')}
                </td>
                <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2 py-2 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-blue-900 dark:text-blue-300 text-xs sm:text-sm whitespace-nowrap">
                  {totals.totalSelling.toLocaleString('en-US')}
                </td>
                <td colSpan={2} className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2.5 py-2 border border-slate-900 dark:border-slate-600 text-center font-black text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm whitespace-nowrap">
                  {isAr ? `الربح: ${totals.totalProfit.toLocaleString('en-US')} د.ع` : `Profit: ${totals.totalProfit.toLocaleString('en-US')}`}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
