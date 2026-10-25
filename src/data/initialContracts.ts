import { InstallmentContract, PaymentRecord, InventoryItem, SalesRepresentative, CashFund, CustomerList, Employee } from '../types';
import { KARBALA_1_RAW_DATA } from './karbalaContractsData';

export const DEFAULT_REPS: SalesRepresentative[] = [
  {
    id: 'rep-1',
    name: 'ضياء المحاسب',
    phone: '07801112233',
    code: '7351',
    role: 'admin',
    canEdit: true,
    canDelete: true,
    canMoveCustomer: true,
    canSell: true,
    allowedListIds: ['all']
  },
  {
    id: 'rep_1790075504995_4y79u',
    name: 'ماهر',
    phone: '',
    code: '5632',
    role: 'supervisor',
    canEdit: true,
    canDelete: false,
    canMoveCustomer: true,
    canSell: true,
    allowedListIds: ['list_1789987255564_y9e1d', 'fund-2', 'list_1791618798751_j2o66']
  },
  {
    id: 'rep_1792578863867_soh3s',
    name: 'سيد نزار',
    phone: '',
    code: '3333',
    role: 'rep',
    canEdit: false,
    canDelete: false,
    canMoveCustomer: false,
    canSell: true,
    allowedListIds: ['all']
  },
  {
    id: 'rep_1790325874814_0njii',
    name: 'زيد',
    phone: '07704445566',
    code: '0000',
    role: 'rep',
    canEdit: true,
    canDelete: true,
    canMoveCustomer: true,
    canSell: true
  },
  {
    id: 'rep_1791619141491_eurdj',
    name: 'هيثم',
    phone: '',
    code: '7683',
    role: 'rep',
    canEdit: false,
    canDelete: false,
    canMoveCustomer: false,
    canSell: false,
    allowedListIds: ['list_1791618798751_j2o66']
  }
];

export const INITIAL_FUNDS: CashFund[] = [];

export const INITIAL_CUSTOMER_LISTS: CustomerList[] = [];

export const INITIAL_EMPLOYEES: Employee[] = [];

export const INITIAL_INVENTORY: InventoryItem[] = [];

export const INITIAL_CONTRACTS: InstallmentContract[] = [];

export const INITIAL_PAYMENTS: PaymentRecord[] = [];
