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

  // Helper to get device count for a contract
  // User rule: "if mentioned only devices for example 170 or 175 or 215... consider it 1 device and in count also count it 1"
  const getDeviceCount = (c: InstallmentContract): number => {
    const name = (c.itemName || '').toLowerCase();
    // Check if name contains the magic numbers
    const isSpecial = name.includes('170') || name.includes('175') || name.includes('215');
    if (isSpecial) {
      return 1;
    }
    return Number(c.itemQuantity) || 1;
  };

  // Helper to get purchase price for a contract
  // User rule: "Purchase price field in sales box multiply it by number of devices"
  // Also: "this first sale automatically make its count 1 and purchase price like selling price automatically multiply it by the count"
  const getPurchasePrice = (c: InstallmentContract): number => {
    const devCount = getDeviceCount(c);
    let basePurchasePrice = c.purchasePrice || 0;

    // If purchase price is 0, try fetching from inventory or default to selling price for special items
    if (basePurchasePrice === 0) {
      if (c.itemId) {
        const found = inventory.find((i) => i.id === c.itemId);
        if (found && found.purchasePrice && found.purchasePrice > 0) {
          basePurchasePrice = found.purchasePrice;
        }
      }
      
      // If still 0 and it's a special item (like selling price automatically)
      const name = (c.itemName || '').toLowerCase();
      const isSpecial = name.includes('170') || name.includes('175') || name.includes('215');
      if (basePurchasePrice === 0 && isSpecial) {
        // Use total price divided by actual quantity as unit purchase price, 
        // but since we count it as 1 device, we'll effectively use totalPrice as the purchase cost
        // if the user says "like selling price".
        // Actually, if it's "اجهزه 175 (عدد 2)" and selling is 350,000. 
        // If purchase is 0, we'll use 350,000 as total purchase if we want profit to be 0.
        basePurchasePrice = c.totalPrice; 
        return basePurchasePrice; // Already the total for 1 device
      }
    }

    return basePurchasePrice * devCount;
  };

  // Helper to format Item Name & Quantity in the same cell
  const formatItemAndQty = (c: InstallmentContract): string => {
    const rawName = c.itemName || (isAr ? 'مادة غير محددة' : 'Unspecified Item');
    const displayQty = Number(c.itemQuantity) || 1;
    
    // Check if it's a special item for naming
    const nameLower = rawName.toLowerCase();
    const isSpecial = nameLower.includes('170') || nameLower.includes('175') || nameLower.includes('215');
    
    if (isSpecial) {
      // Just return the raw name (which usually includes the count like "عدد 2")
      // but the logical count remains 1 device.
      return rawName;
    }

    if (displayQty > 1 && !rawName.includes('عدد')) {
      return `${rawName} (العدد: ${displayQty})`;
    }
    return rawName;
  };

  // Calculate Totals for Footer Row
  const totals = useMemo(() => {
    let totalSelling = 0;
    let totalPurchase = 0;
    let totalDailyInst = 0;
    let totalQty = 0;

    filteredSales.forEach((c) => {
      totalSelling += c.totalPrice || 0;
      totalPurchase += getPurchasePrice(c);
      totalDailyInst += c.dailyInstallment || 0;
      totalQty += getDeviceCount(c);
    });

    const totalProfit = totalSelling - totalPurchase;

    return {
      count: filteredSales.length,
      totalSelling,
      totalPurchase,
      totalDailyInst,
      totalProfit,
      totalQty,
    };
  }, [filteredSales, inventory]);

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
        {/* Top Controls Row: List Selector & Dates Strictly in Single Row */}
        <div className="grid grid-cols-3 gap-1 sm:gap-2 w-full items-center">
          {/* Customer List Selector */}
          <div className="relative w-full min-w-0">
            <button
              type="button"
              onClick={() => setIsListDropdownOpen((prev) => !prev)}
              className="flex items-center justify-between gap-1 bg-white dark:bg-slate-700 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-650 w-full text-[10px] sm:text-xs font-black text-slate-800 dark:text-slate-100 cursor-pointer min-w-0"
              title={isAr ? 'تصفية حسب القائمة' : 'Filter by List'}
            >
              <div className="flex items-center gap-1 min-w-0 truncate">
                <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
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

          {/* From Date Picker (Compact) */}
          <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-700 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
              <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[9px] sm:text-[11px] font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'من:' : 'From:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-[11px] text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

          {/* To Date Picker (Compact) */}
          <div className="relative flex items-center justify-between gap-1 bg-white dark:bg-slate-700 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 shadow-2xs w-full min-w-0">
            <div className="flex items-center gap-0.5 min-w-0 shrink-0 pointer-events-none">
              <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-[9px] sm:text-[11px] font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {isAr ? 'إلى:' : 'To:'}
              </span>
            </div>
            <span className="font-mono font-bold text-[8.5px] xs:text-[9.5px] sm:text-[11px] text-slate-900 dark:text-slate-100 tracking-tight whitespace-nowrap shrink-0 text-left pointer-events-none leading-none" dir="ltr">
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

          {/* Sales Count Pill */}
          <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-black shrink-0 whitespace-nowrap shadow-2xs">
            <ShoppingBag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{totals.count} {isAr ? 'مبيع' : 'Sales'}</span>
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

                    {/* Purchase Price (سعر الشراء) */}
                    <td className="px-2 py-1.5 border border-slate-900 dark:border-slate-600 text-center font-black dir-ltr text-rose-800 dark:text-rose-300 text-xs sm:text-sm whitespace-nowrap">
                      {pPrice > 0 ? pPrice.toLocaleString('en-US') : '—'}
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
                <td className="sticky bottom-0 z-20 bg-[#b8cce4] dark:bg-slate-800 px-2.5 py-2 border border-slate-900 dark:border-slate-600 text-center font-black text-xs sm:text-sm">
                  {isAr ? `العدد: ${totals.totalQty}` : `Qty: ${totals.totalQty}`}
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
