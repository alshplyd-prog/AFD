import { InstallmentContract, PaymentRecord, InventoryItem, SalesRepresentative, CashFund, CustomerList, Employee } from '../types';
import { KARBALA_1_RAW_DATA } from './karbalaContractsData';

export const DEFAULT_REPS: SalesRepresentative[] = [
  { id: 'rep-1', name: 'ضياء المحاسب', phone: '07801112233', code: '4444', role: 'admin', canEdit: true, canDelete: true, canMoveCustomer: true, canSell: true, allowedListIds: ['all'] },
  { id: 'rep-sup-1', name: 'أحمد المشرف (مسؤول)', phone: '07809991122', code: '2222', role: 'supervisor', canEdit: true, canDelete: true, canSell: true },
  { id: 'rep-2', name: 'زيد', phone: '07704445566', code: '5678', role: 'rep', canEdit: true, canDelete: true },
  { id: 'rep-3', name: 'رغيد', phone: '07509998877', code: '0000', role: 'rep', canEdit: true, canDelete: true },
];

export const INITIAL_FUNDS: CashFund[] = [];

export const INITIAL_CUSTOMER_LISTS: CustomerList[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_INVENTORY: InventoryItem[] = [];

export const INITIAL_CONTRACTS: InstallmentContract[] = [];

export const INITIAL_PAYMENTS: PaymentRecord[] = [];
