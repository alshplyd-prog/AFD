import React from 'react';
import { InstallmentContract, CustomerList, InventoryItem, SalesRepresentative, Language } from '../types';
import { SalesBox } from './SalesBox';

interface SalesBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  contracts: InstallmentContract[];
  customerLists: CustomerList[];
  inventory: InventoryItem[];
  reps: SalesRepresentative[];
  currentRep: SalesRepresentative | null;
  lang: Language;
  onOpenCustomerHistory?: (contract: InstallmentContract) => void;
}

export const SalesBoxModal: React.FC<SalesBoxModalProps> = ({
  isOpen,
  onClose,
  contracts,
  customerLists,
  inventory,
  reps,
  currentRep,
  lang,
  onOpenCustomerHistory,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 bg-slate-950/85 backdrop-blur-xs animate-in fade-in duration-150 dir-rtl"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full h-full max-w-full max-h-full shadow-2xl border-0 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <SalesBox
          contracts={contracts}
          customerLists={customerLists}
          inventory={inventory}
          reps={reps}
          currentRep={currentRep}
          lang={lang}
          onClose={onClose}
          onOpenCustomerHistory={(contract) => {
            onClose();
            if (onOpenCustomerHistory) onOpenCustomerHistory(contract);
          }}
        />
      </div>
    </div>
  );
};
