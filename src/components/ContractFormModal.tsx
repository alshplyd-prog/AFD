import React, { useState, useEffect, useMemo } from 'react';
import { X, User, Phone, MapPin, Tag, Calendar, FileText, Package, ExternalLink, Plus, Minus, FolderKanban, Lock, LocateFixed, Check } from 'lucide-react';
import { InstallmentContract, InventoryItem, Language, CustomerList, SalesRepresentative } from '../types';
import { InventoryModal } from './InventoryModal';
import { getLocalDateString } from '../lib/dateUtils';
import { captureDeviceLocation } from '../lib/geolocationHelper';
import { normalizeArabicText } from '../lib/searchUtils';

interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    contractData: Omit<InstallmentContract, 'id' | 'createdAt' | 'totalPaid'>,
    editingId?: string,
    quantityDeducted?: number
  ) => void;
  editingContract?: InstallmentContract | null;
  contracts?: InstallmentContract[];
  inventory: InventoryItem[];
  customerLists?: CustomerList[];
  defaultListId?: string;
  lang: Language;
  currentRep?: SalesRepresentative | null;
  reps?: SalesRepresentative[];
  onAddItemToInventory?: (item: Omit<InventoryItem, 'id'>) => void;
  onUpdateInventoryItem?: (id: string, data: Partial<InventoryItem>) => void;
  onDeleteInventoryItem?: (id: string) => void;
}

const CONTRACT_DRAFT_KEY = 'alkarrar_active_contract_form_draft';

export const ContractFormModal: React.FC<ContractFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingContract,
  contracts = [],
  inventory,
  customerLists = [],
  defaultListId,
  lang,
  currentRep,
  reps = [],
  onAddItemToInventory,
  onUpdateInventoryItem,
  onDeleteInventoryItem,
}) => {
  const currentKey = editingContract
    ? (editingContract.id ? `edit_${editingContract.id}` : 'editing_new_contract')
    : '__NEW_BLANK_CONTRACT__';

  const [customerName, setCustomerName] = useState('');
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);

  // Auto-suggestion list of existing customers matching full name
  const matchedCustomerSuggestions = useMemo(() => {
    if (!contracts || contracts.length === 0 || !customerName || customerName.trim().length === 0) return [];
    const q = normalizeArabicText(customerName);
    if (!q) return [];

    const uniqueMap = new Map<string, { name: string; phone: string; address: string; listId?: string }>();
    for (const c of contracts) {
      if (c && c.customerName) {
        const norm = normalizeArabicText(c.customerName);
        if (norm.includes(q)) {
          if (!uniqueMap.has(c.customerName)) {
            uniqueMap.set(c.customerName, {
              name: c.customerName,
              phone: c.customerPhone || '',
              address: c.customerAddress || '',
              listId: c.listId,
            });
          }
        }
      }
    }
    return Array.from(uniqueMap.values()).slice(0, 6);
  }, [contracts, customerName]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | null | undefined>(undefined);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemName, setItemName] = useState('');
  const [totalPrice, setTotalPrice] = useState<string>('');
  const [dailyInstallment, setDailyInstallment] = useState<string>('');
  const [startDate, setStartDate] = useState(getLocalDateString());
  const [repName, setRepName] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [isInventoryPickerOpen, setIsInventoryPickerOpen] = useState(false);

  const isAdminOrSupervisor = currentRep?.role === 'admin' || currentRep?.role === 'supervisor' || !currentRep;
  const isEditingExistingContract = Boolean(editingContract && editingContract.id);
  const isNonAdminEdit = !isAdminOrSupervisor && isEditingExistingContract;

  const currentEditingKeyRef = React.useRef<string | null>(null);
  const isInitializedForCurrentKeyRef = React.useRef(false);

  // Sync state with draft or props only on new modal opening / key change
  useEffect(() => {
    if (!isOpen) {
      currentEditingKeyRef.current = null;
      isInitializedForCurrentKeyRef.current = false;
      return;
    }

    if (isInitializedForCurrentKeyRef.current && currentEditingKeyRef.current === currentKey) {
      return;
    }

    currentEditingKeyRef.current = currentKey;
    isInitializedForCurrentKeyRef.current = true;

    // Check if there is an active saved draft in sessionStorage for this key
    try {
      const rawDraft = sessionStorage.getItem(`${CONTRACT_DRAFT_KEY}_${currentKey}`);
      if (rawDraft) {
        const d = JSON.parse(rawDraft);
        if (d && typeof d === 'object') {
          setCustomerName(d.customerName ?? '');
          setCustomerPhone(d.customerPhone ?? '');
          setCustomerAddress(d.customerAddress ?? '');
          setLatitude(d.latitude != null ? Number(d.latitude) : undefined);
          setLongitude(d.longitude != null ? Number(d.longitude) : undefined);
          setSelectedListId(d.selectedListId || defaultListId || customerLists[0]?.id || '');
          setSelectedItemId(d.selectedItemId ?? '');
          setItemQuantity(Number(d.itemQuantity) || 1);
          setItemName(d.itemName ?? '');
          setTotalPrice(d.totalPrice ?? '');
          setDailyInstallment(d.dailyInstallment ?? '');
          setStartDate(d.startDate || getLocalDateString());
          setRepName(d.repName || currentRep?.name || 'مندوب');
          setErrors({});
          return;
        }
      }
    } catch (e) {}

    if (editingContract) {
      setCustomerName(editingContract.customerName || '');
      setCustomerPhone(editingContract.customerPhone || '');
      setCustomerAddress(editingContract.customerAddress || '');
      setLatitude(editingContract.latitude != null ? Number(editingContract.latitude) : undefined);
      setLongitude(editingContract.longitude != null ? Number(editingContract.longitude) : undefined);
      setSelectedListId(editingContract.listId || defaultListId || customerLists[0]?.id || '');
      setSelectedItemId(editingContract.itemId || '');
      setItemQuantity(1);
      setItemName(editingContract.itemName || '');
      setTotalPrice(editingContract.totalPrice ? editingContract.totalPrice.toString() : '');
      setDailyInstallment(editingContract.dailyInstallment ? editingContract.dailyInstallment.toString() : '');
      setStartDate((isAdminOrSupervisor || !editingContract.id) ? (editingContract.startDate || getLocalDateString()) : (editingContract.startDate || getLocalDateString()));
      setRepName(editingContract.repName || currentRep?.name || 'مندوب');
    } else {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setLatitude(undefined);
      setLongitude(undefined);
      setSelectedListId(defaultListId || customerLists[0]?.id || '');
      setSelectedItemId('');
      setItemQuantity(1);
      setItemName('');
      setTotalPrice('');
      setDailyInstallment('');
      setStartDate(getLocalDateString());
      setRepName(currentRep?.name || 'مندوب');
    }
    setErrors({});
  }, [isOpen, currentKey]);

  // Auto-save draft whenever user enters info
  useEffect(() => {
    if (!isOpen || !currentKey) return;
    try {
      const draftObj = {
        customerName,
        customerPhone,
        customerAddress,
        latitude,
        longitude,
        selectedListId,
        selectedItemId,
        itemQuantity,
        itemName,
        totalPrice,
        dailyInstallment,
        startDate,
        repName,
      };
      sessionStorage.setItem(`${CONTRACT_DRAFT_KEY}_${currentKey}`, JSON.stringify(draftObj));
    } catch (e) {}
  }, [
    isOpen,
    currentKey,
    customerName,
    customerPhone,
    customerAddress,
    selectedListId,
    selectedItemId,
    itemQuantity,
    itemName,
    totalPrice,
    dailyInstallment,
    startDate,
    repName,
  ]);

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(`${CONTRACT_DRAFT_KEY}_${currentKey}`);
    } catch (e) {}
  };

  const handleCloseModal = () => {
    clearDraft();
    onClose();
  };

  if (!isOpen) return null;

  const visibleCustomerLists = customerLists.filter((l) => {
    if (!currentRep || !currentRep.allowedListIds || currentRep.allowedListIds.includes('all')) return true;
    return currentRep.allowedListIds.includes(l.id);
  });

  const isAr = lang === 'ar';

  const numericTotal = Number(totalPrice) || 0;
  const remainingCalculated = numericTotal;

  // When inventory item selected from dropdown
  const handleSelectInventoryItem = (itemId: string, qty: number = itemQuantity) => {
    setSelectedItemId(itemId);
    if (!itemId) return;

    const found = inventory.find((i) => i.id === itemId);
    if (found) {
      const calcTotal = found.price * qty;
      setItemName(qty > 1 ? `${found.name} (عدد ${qty})` : found.name);
      setTotalPrice(calcTotal.toString());
      if (found.dailyInstallment && found.dailyInstallment > 0) {
        setDailyInstallment((found.dailyInstallment * qty).toString());
      } else {
        const suggestedDaily = Math.ceil((calcTotal * 0.8) / 30 / 5000) * 5000;
        if (!dailyInstallment || Number(dailyInstallment) === 0) {
          setDailyInstallment(suggestedDaily.toString());
        }
      }
    }
  };

  // Handle quantity change
  const handleQuantityChange = (newQty: number) => {
    const validQty = Math.max(1, newQty);
    setItemQuantity(validQty);

    if (selectedItemId) {
      const found = inventory.find((i) => i.id === selectedItemId);
      if (found) {
        const calcTotal = found.price * validQty;
        setItemName(validQty > 1 ? `${found.name} (عدد ${validQty})` : found.name);
        setTotalPrice(calcTotal.toString());
        if (found.dailyInstallment && found.dailyInstallment > 0) {
          setDailyInstallment((found.dailyInstallment * validQty).toString());
        } else {
          const suggestedDaily = Math.ceil((calcTotal * 0.8) / 30 / 5000) * 5000;
          setDailyInstallment(suggestedDaily.toString());
        }
      }
    }
  };

  const validate = () => {
    const errs: { [key: string]: string } = {};
    const cleanName = customerName.trim();
    if (!cleanName) {
      errs.customerName = isAr ? 'اسم الزبون مطلوب' : 'Customer name is required';
    } else if (cleanName.length < 3) {
      errs.customerName = isAr
        ? 'يرجى إدخال اسم الزبون بشكل صحيح (الاسم الكامل)'
        : 'Please enter a valid full customer name';
    }
    
    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      errs.customerPhone = isAr ? 'رقم الهاتف مطلوب' : 'Phone number is required';
    } else if (cleanPhone.length !== 11) {
      errs.customerPhone = isAr
        ? 'رقم الهاتف يجب أن يتكون من 11 رقماً بالضبط'
        : 'Phone number must be exactly 11 digits';
    } else if (!/^(078|077|075|079|074|076)/.test(cleanPhone)) {
      errs.customerPhone = isAr
        ? 'يجب أن يبدأ الرقم بمفتاح عراقي صحيح (078, 077, 075 كورك, 079)'
        : 'Phone number must start with a valid Iraqi prefix (078, 077, 075 Korek, 079)';
    }
    
    if (!selectedItemId) {
      errs.itemName = isAr ? 'يرجى اختيار مادة من المخزن' : 'Please select an item from inventory';
    }

    let validDaily = Number(dailyInstallment) || 0;
    if (validDaily > 0 && validDaily < 1000) {
      validDaily = validDaily * 1000;
      setDailyInstallment(validDaily.toString());
    }

    if (numericTotal <= 0) errs.totalPrice = isAr ? 'أدخل السعر الكلي الصحيح' : 'Valid total price is required';
    if (validDaily <= 0) errs.dailyInstallment = isAr ? 'أدخل قيمة القسط اليومي' : 'Daily installment rate is required';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleDailyInstallmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDailyInstallment(e.target.value);
  };

  const handleTotalPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTotalPrice(e.target.value);
  };

  const handleInstallmentBlur = () => {
    const num = Number(dailyInstallment);
    if (!isNaN(num) && num > 0 && num < 1000) {
      setDailyInstallment((num * 1000).toString());
    }
  };

  const handleTotalPriceBlur = () => {
    const num = Number(totalPrice);
    if (!isNaN(num) && num > 0 && num < 1000) {
      setTotalPrice((num * 1000).toString());
    }
  };

  const handleGetGpsLocation = async () => {
    setIsLocatingGps(true);
    const res = await captureDeviceLocation();
    setIsLocatingGps(false);

    if (res.location) {
      setLatitude(res.location.latitude);
      setLongitude(res.location.longitude);
    } else if (res.error) {
      const msg = isAr ? res.error.messageAr : res.error.message;
      alert(msg);
    }
  };

  const handleClearLocation = () => {
    setLatitude(null);
    setLongitude(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setErrors((prev) => ({
        ...prev,
        customerName: isAr ? 'اسم الزبون مطلوب' : 'Customer name is required',
      }));
      return;
    }

    const effectiveListId = selectedListId || defaultListId || visibleCustomerLists[0]?.id || customerLists[0]?.id || '';
    const matchedList = customerLists.find((l) => l.id === effectiveListId);

    const netFinanced = numericTotal;
    const currentPaid = editingContract ? (editingContract.totalPaid || 0) : 0;
    const calculatedRemaining = Math.max(0, netFinanced - currentPaid);

    const resolvedLatitude = latitude === null ? null : (latitude !== undefined ? latitude : editingContract?.latitude);
    const resolvedLongitude = longitude === null ? null : (longitude !== undefined ? longitude : editingContract?.longitude);
    const resolvedLocationAddress = (resolvedLatitude == null || resolvedLongitude == null)
      ? null
      : (customerAddress.trim() || editingContract?.customerAddress || '');

    if (isNonAdminEdit && editingContract) {
      // Supervisor / Rep can ONLY edit the daily installment rate!
      clearDraft();
      onSave(
        {
          customerName: editingContract.customerName,
          customerPhone: editingContract.customerPhone,
          customerAddress: editingContract.customerAddress || '',
          itemId: editingContract.itemId || '',
          itemName: editingContract.itemName || '',
          listId: editingContract.listId || '',
          listName: editingContract.listName || '',
          totalPrice: editingContract.totalPrice,
          advancePayment: editingContract.advancePayment || 0,
          remainingBalance: editingContract.remainingBalance,
          dailyInstallment: Number(dailyInstallment),
          startDate: editingContract.startDate || getLocalDateString(),
          notes: editingContract.notes || '',
          repName: editingContract.repName || currentRep?.name || 'مندوب',
          status: editingContract.status || 'active',
          latitude: resolvedLatitude != null ? resolvedLatitude : undefined,
          longitude: resolvedLongitude != null ? resolvedLongitude : undefined,
          locationAddress: resolvedLocationAddress || '',
        },
        editingContract.id,
        itemQuantity
      );
      onClose();
      return;
    }

    let effectiveItemName = itemName.trim();
    if (!effectiveItemName && selectedItemId) {
      const found = inventory.find((i) => i.id === selectedItemId);
      if (found) {
        effectiveItemName = itemQuantity > 1 ? `${found.name} (عدد ${itemQuantity})` : found.name;
      }
    }

    const selectedItem = inventory.find(i => i.id === selectedItemId);
    const itemPurchasePrice = selectedItem?.purchasePrice || 0;

    clearDraft();
    onSave(
      {
        customerName: trimmedName,
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim() || '',
        latitude: resolvedLatitude != null ? resolvedLatitude : (resolvedLatitude === null ? null as any : undefined),
        longitude: resolvedLongitude != null ? resolvedLongitude : (resolvedLongitude === null ? null as any : undefined),
        locationAddress: resolvedLocationAddress || '',
        itemId: selectedItemId || '',
        itemName: effectiveItemName || (isAr ? 'مادة مبيعات' : 'Sales Item'),
        itemQuantity: itemQuantity,
        purchasePrice: itemPurchasePrice,
        listId: effectiveListId,
        listName: matchedList ? matchedList.name : '',
        totalPrice: numericTotal,
        advancePayment: 0,
        remainingBalance: calculatedRemaining,
        dailyInstallment: Number(dailyInstallment),
        startDate: isAdminOrSupervisor ? startDate : (editingContract?.startDate || getLocalDateString()),
        notes: '',
        repName: repName.trim() || currentRep?.name || 'مندوب',
        status: calculatedRemaining === 0 ? 'completed' : (editingContract?.status || 'active'),
      },
      editingContract?.id || undefined,
      itemQuantity
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/65 backdrop-blur-sm animate-in fade-in duration-200 dir-rtl">
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-3xl lg:max-w-4xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <User className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>
              {editingContract
                ? isAr ? 'تعديل بيانات مبيع الزبون' : 'Edit Customer Sale'
                : isAr ? 'إضافة زبون جديد وتسجيل بيع بالتقسيط' : 'Add New Customer & Installment Sale'}
            </span>
          </h2>
          <button
            type="button"
            onClick={handleCloseModal}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body - with sticky footer and scrollable content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 space-y-2.5 text-xs">
            {/* Row 1: Customer Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5 text-[11px] flex items-center justify-between">
                  <span>{isAr ? 'اسم الزبون الكامل *' : 'Customer Full Name *'}</span>
                  {isNonAdminEdit ? (
                    <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 shrink-0" />
                      <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-normal">
                      {isAr ? '(الاسم الثلاثي أو الرباعي)' : '(Full name)'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 z-10" />
                  <input
                    type="text"
                    value={customerName}
                    disabled={isNonAdminEdit}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setShowNameSuggestions(true);
                    }}
                    onFocus={() => setShowNameSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => setShowNameSuggestions(false), 220);
                    }}
                    placeholder={isAr ? 'أدخل الاسم الثلاثي الكامل للزبون...' : 'e.g. Ahmed Jasim Mohammed'}
                    className={`w-full pr-8 pl-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                      isNonAdminEdit
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                        : 'bg-slate-50 dark:bg-slate-900/50'
                    }`}
                  />

                  {showNameSuggestions && matchedCustomerSuggestions.length > 0 && !isNonAdminEdit && (
                    <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/60 max-h-48 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/80 text-[10px] font-black text-slate-500 dark:text-slate-400 flex justify-between items-center">
                        <span>{isAr ? 'زبائن مسجلون سابقاً (اضغط لاختيار الاسم الثلاثي):' : 'Existing Customers:'}</span>
                        <span className="text-[9px] text-teal-600 dark:text-teal-400 font-bold">{matchedCustomerSuggestions.length}</span>
                      </div>
                      {matchedCustomerSuggestions.map((cust, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onMouseDown={() => {
                            setCustomerName(cust.name);
                            if (cust.phone && !customerPhone) setCustomerPhone(cust.phone);
                            if (cust.address && !customerAddress) setCustomerAddress(cust.address);
                            if (cust.listId && !selectedListId) setSelectedListId(cust.listId);
                            setShowNameSuggestions(false);
                          }}
                          className="w-full text-right px-3 py-2 hover:bg-teal-50 dark:hover:bg-teal-950/60 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <span className="font-black text-slate-900 dark:text-slate-100 text-xs block break-words">
                              {cust.name}
                            </span>
                            {cust.address && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block truncate">
                                {cust.address}
                              </span>
                            )}
                          </div>
                          {cust.phone && (
                            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded dir-ltr shrink-0">
                              {cust.phone}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {errors.customerName && <p className="text-rose-500 text-[10px] mt-0.5">{errors.customerName}</p>}
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5 text-[11px] flex items-center justify-between">
                  <span>{isAr ? 'رقم الهاتف *' : 'Phone Number *'}</span>
                  {isNonAdminEdit ? (
                    <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 shrink-0" />
                      <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-normal">
                      {isAr ? '(11 رقم 078/077/075)' : '(11 digits)'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={11}
                    value={customerPhone}
                    disabled={isNonAdminEdit}
                    autoComplete="tel"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => {
                      const converted = e.target.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
                      const onlyNums = converted.replace(/\D/g, '');
                      setCustomerPhone(onlyNums);
                    }}
                    placeholder="07801234567"
                    className={`w-full pr-8 pl-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/20 dir-ltr text-left font-mono ${
                      isNonAdminEdit
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                        : 'bg-slate-50 dark:bg-slate-900/50'
                    }`}
                  />
                </div>
                {errors.customerPhone && <p className="text-rose-500 text-[10px] mt-0.5">{errors.customerPhone}</p>}
              </div>
            </div>

          {/* Row: Customer Address & GPS Location */}
          <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-2">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>{isAr ? 'عنوان وسكن الزبون:' : 'Customer Address:'}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {isAr ? '(اختياري)' : '(Optional)'}
                </span>
              </label>
              <input
                type="text"
                value={customerAddress}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder={isAr ? 'مثال: بغداد - الكرادة - قرب جامع الخضيري' : 'e.g. Baghdad, Karrada'}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 bg-white dark:bg-slate-900"
              />
            </div>

            {/* GPS Location Button and Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center gap-1.5">
                {(isAdminOrSupervisor || !editingContract?.id || !editingContract?.latitude || Number(editingContract?.latitude) === 0) && (
                  <button
                    type="button"
                    onClick={handleGetGpsLocation}
                    disabled={isLocatingGps}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    title={isAr ? 'التقاط إحداثيات الموقع الحالي للزبون عبر الـ GPS' : 'Capture current GPS coordinates'}
                  >
                    <LocateFixed className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin' : ''}`} />
                    <span>
                      {isLocatingGps
                        ? (isAr ? 'جارِ تحديد الموقع عبر GPS...' : 'Locating GPS...')
                        : (isAr ? 'تحديد الموقع الحالي (GPS)' : 'Set Current GPS Location')}
                    </span>
                  </button>
                )}

                {latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude)) && Number(latitude) !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
                    }}
                    className="px-2 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                    title={isAr ? 'معاينة الموقع على خرائط Google' : 'Preview on Google Maps'}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>{isAr ? 'معاينة الخريطة' : 'Preview'}</span>
                  </button>
                )}
              </div>

              {latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude)) && Number(latitude) !== 0 ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2 py-1 rounded-lg text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">
                  <span>📍 {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)}</span>
                  {isAdminOrSupervisor ? (
                    <button
                      type="button"
                      onClick={handleClearLocation}
                      className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                      title={isAr ? 'إلغاء وحذف الموقع' : 'Clear location'}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  ) : (
                    <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400">🔒 {isAr ? 'مثبت' : 'Locked'}</span>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-slate-400">
                  {isAr ? 'لم يتم تحديد موقع GPS' : 'No GPS set'}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Customer List Selector */}
          {visibleCustomerLists.length > 0 && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5 text-[11px] flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <FolderKanban className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{isAr ? 'قائمة الزبائن (السجل التابع له):' : 'Customer List (Ledger):'}</span>
                </div>
                {isNonAdminEdit && (
                  <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 shrink-0" />
                    <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                  </span>
                )}
              </label>
              <select
                value={selectedListId}
                disabled={isNonAdminEdit}
                onChange={(e) => setSelectedListId(e.target.value)}
                className={`w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 ${
                  isNonAdminEdit
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                    : 'bg-slate-50 dark:bg-slate-900'
                }`}
              >
                {visibleCustomerLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Row 3: Inventory Item Selection & Quantity */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-[11px]">
                <Package className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{isAr ? 'اختيار مادة من المخزن:' : 'Select Item from Inventory:'}</span>
              </label>
              {isNonAdminEdit ? (
                <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 shrink-0" />
                  <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsInventoryPickerOpen(true)}
                  className="px-2 py-0.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] flex items-center gap-1 transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{isAr ? 'المخزن' : 'Inventory'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <div className="sm:col-span-2 space-y-1">
                <select
                  value={selectedItemId}
                  disabled={isNonAdminEdit}
                  onChange={(e) => handleSelectInventoryItem(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 ${
                    isNonAdminEdit
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                      : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <option value="">{isAr ? '-- اختر مادة من المخزن --' : '-- Select from Inventory --'}</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id} disabled={item.quantity === 0}>
                      {item.name} ({item.price.toLocaleString('en-US')} د.ع) - {isAr ? `المتبقي: ${item.quantity}` : `Stock: ${item.quantity}`}
                    </option>
                  ))}
                </select>
                {errors.itemName && <p className="text-rose-500 text-[10px] font-bold mt-0.5">{errors.itemName}</p>}
              </div>

              {/* Quantity Selector Control */}
              <div className="flex items-center justify-between sm:justify-end gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'الكمية:' : 'Qty:'}
                </span>
                <div className={`flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 ${
                  isNonAdminEdit ? 'bg-slate-100 dark:bg-slate-800 opacity-80' : 'bg-white dark:bg-slate-800'
                }`}>
                  <button
                    type="button"
                    disabled={isNonAdminEdit}
                    onClick={() => handleQuantityChange(itemQuantity - 1)}
                    className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    disabled={isNonAdminEdit}
                    value={itemQuantity}
                    onChange={(e) => handleQuantityChange(Number(e.target.value) || 1)}
                    className="w-8 text-center text-xs font-black text-slate-900 dark:text-slate-100 focus:outline-none bg-transparent disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={isNonAdminEdit}
                    onClick={() => handleQuantityChange(itemQuantity + 1)}
                    className="w-5 h-5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory Picker Sliding Page Modal */}
          <InventoryModal
            isOpen={isInventoryPickerOpen}
            onClose={() => setIsInventoryPickerOpen(false)}
            items={inventory}
            lang={lang}
            isSelectMode={true}
            onSelectItem={(item) => {
              handleSelectInventoryItem(item.id);
              setIsInventoryPickerOpen(false);
            }}
            onAddItem={(item) => onAddItemToInventory && onAddItemToInventory(item)}
            onUpdateItem={(id, data) => onUpdateInventoryItem && onUpdateInventoryItem(id, data)}
            onDeleteItem={(id) => onDeleteInventoryItem && onDeleteInventoryItem(id)}
          />

          {/* Pricing Grid (Total Price, Daily Installment) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div>
              <label className="block font-bold text-slate-800 dark:text-slate-200 mb-0.5 text-[11px] flex items-center justify-between">
                <span>{isAr ? 'السعر الكلي (د.ع) *' : 'Total Price *'}</span>
                {!isAdminOrSupervisor && Boolean(editingContract) && (
                  <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 shrink-0" />
                    <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                  </span>
                )}
              </label>
              <input
                type="number"
                value={totalPrice}
                disabled={!isAdminOrSupervisor && Boolean(editingContract)}
                onChange={handleTotalPriceChange}
                onBlur={handleTotalPriceBlur}
                placeholder="1500000"
                className={`w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dir-ltr text-xs ${
                  !isAdminOrSupervisor && Boolean(editingContract)
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                    : 'bg-white dark:bg-slate-900'
                }`}
              />
              {errors.totalPrice && <p className="text-rose-500 mt-0.5 text-[10px] font-bold">{errors.totalPrice}</p>}
            </div>

            <div>
              <label className="block font-bold text-blue-600 dark:text-blue-400 mb-0.5 text-[11px] flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span>{isAr ? 'القسط اليومي (د.ع) *' : 'Daily Rate *'}</span>
                  {isNonAdminEdit && (
                    <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                      {isAr ? 'مسموح لك بتعديله' : 'Editable'}
                    </span>
                  )}
                </span>
                {Number(dailyInstallment) > 0 && Number(dailyInstallment) < 1000 && (
                  <span className="text-[9px] font-extrabold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.2 rounded">
                    {isAr ? `سيصبح: ${(Number(dailyInstallment) * 1000).toLocaleString('en-US')} د.ع` : `Will be: ${(Number(dailyInstallment) * 1000).toLocaleString('en-US')} IQD`}
                  </span>
                )}
              </label>
              <input
                type="number"
                value={dailyInstallment}
                onChange={handleDailyInstallmentChange}
                onBlur={handleInstallmentBlur}
                placeholder="3000"
                className={`w-full px-2.5 py-1.5 rounded-xl border bg-white dark:bg-slate-900 font-black text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 dir-ltr text-xs ${
                  isNonAdminEdit
                    ? 'border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-blue-300 dark:border-blue-700 focus:ring-blue-500/20'
                }`}
              />
              {errors.dailyInstallment && <p className="text-rose-500 mt-0.5 text-[10px] font-bold">{errors.dailyInstallment}</p>}
            </div>
          </div>

          {/* Start Date */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5 text-[11px] flex items-center justify-between">
              <span>{isAr ? 'تاريخ بداية البيع' : 'Start Date'}</span>
              {!isAdminOrSupervisor && (
                <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/80 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 shrink-0" />
                  <span>{isAr ? 'المدير فقط' : 'Admin only'}</span>
                </span>
              )}
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                value={startDate}
                disabled={!isAdminOrSupervisor}
                onChange={(e) => setStartDate(e.target.value)}
                className={`w-full pr-8 pl-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                  !isAdminOrSupervisor
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-80'
                    : 'bg-slate-50 dark:bg-slate-900/50'
                }`}
              />
            </div>
          </div>

          {isNonAdminEdit && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold shadow-2xs">
              <Lock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{isAr ? 'تنبيه الصلاحية: بصفتك (مسؤول / مندوب)، تقتصر صلاحية التعديل على تعديل قيمة القسط فقط. تعديل باقي بيانات الزبون والمبيع محصور بالمدير.' : 'Notice: As supervisor/rep, your edit permission is limited to modifying the installment amount only.'}</span>
            </div>
          )}

          </div>

          {/* Sticky Modal Footer - ALWAYS VISIBLE */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-850 shrink-0 shadow-lg z-10">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
              {numericTotal > 0 && (
                <span>
                  {isAr ? 'الإجمالي: ' : 'Total: '}
                  <span className="font-black text-slate-900 dark:text-slate-100 dir-ltr text-xs sm:text-sm font-mono">
                    {numericTotal.toLocaleString('en-US')} د.ع
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-3.5 sm:px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs sm:text-sm font-black shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
              >
                {editingContract && editingContract.id
                  ? (isAr ? 'حفظ التعديلات' : 'Save Changes')
                  : (isAr ? 'حفظ' : 'Save')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
