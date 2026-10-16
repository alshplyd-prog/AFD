export type ContractStatus = 'active' | 'completed' | 'late';

export interface InventoryItem {
  id: string;
  name: string;
  price: number;
  purchasePrice?: number;
  quantity: number;
  dailyInstallment?: number;
  category?: string;
  createdAt?: string;
}

export interface InstallmentContract {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  latitude?: number;
  longitude?: number;
  locationAddress?: string;
  locationUpdatedAt?: string;
  itemId?: string;
  itemName: string;
  itemQuantity?: number;
  purchasePrice?: number;
  listId?: string;
  listName?: string;
  totalPrice: number;
  advancePayment: number;
  remainingBalance: number;
  dailyInstallment: number;
  startDate: string;
  notes?: string;
  status: ContractStatus;
  totalPaid: number;
  excessAmount?: number;
  rawTotalPaid?: number;
  repName?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  isEdited?: boolean;
}

export interface Sale {
  id: string;
  saleNumber?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  itemId?: string;
  itemName: string;
  itemQuantity?: number;
  purchasePrice?: number;
  listId?: string;
  listName?: string;
  totalPrice: number;
  dailyInstallment: number;
  startDate: string;
  notes?: string;
  status: ContractStatus;
  repName?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  isEdited?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  listId?: string;
  listName?: string;
  totalPaid: number;
  remainingBalance: number;
  status?: string;
  notes?: string;
  repName?: string;
  createdAt?: string;
}

export interface PaymentRecord {
  id: string;
  contractId: string;
  customerName: string;
  amountPaid: number;
  amount?: number;
  amount_paid?: number;
  paymentDate: string;
  repName?: string;
  note?: string;
  fundId?: string;
  latitude?: number;
  longitude?: number;
  totalPaidSnapshot?: number;
  remainingBalanceSnapshot?: number;
  updatedAt?: string;
  createdAt?: string;
  isEdited?: boolean;
}

export interface CustomerList {
  id: string;
  name: string;
  fundId: string;
  description?: string;
  orderIndex?: number;
  receiptTemplate?: 'template_1' | 'template_2';
  createdAt?: string;
}

export interface CashFund {
  id: string;
  name: string;
  balance: number;
  description?: string;
  orderIndex?: number;
  createdAt?: string;
}

export interface FundTransaction {
  id: string;
  fundId: string;
  targetFundId?: string;
  type: 'deposit' | 'withdraw' | 'expense' | 'transfer' | 'sale_advance' | 'installment' | 'employee_loan' | 'employee_repay';
  amount: number;
  note?: string;
  repName?: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  jobTitle?: string;
  position?: string;
  salary?: number;
  debtBalance?: number;
  totalDebt?: number;
  isRep?: boolean;
  repId?: string;
  createdAt?: string;
}

export interface EmployeeTransaction {
  id: string;
  employeeId: string;
  employeeName?: string;
  fundId: string;
  type: 'loan' | 'repay';
  amount: number;
  date?: string;
  recordedBy?: string;
  notes?: string;
  note?: string;
  repName?: string;
  createdAt: string;
}

export interface SalesRepresentative {
  id: string;
  name: string;
  phone: string;
  code: string;
  role?: 'admin' | 'supervisor' | 'rep';
  canEdit?: boolean;   // Permission to edit contracts/items
  canDelete?: boolean; // Permission to delete records
  canMoveCustomer?: boolean; // Permission to move customers between lists
  canSell?: boolean;   // Permission to make a new sale / add contract
  allowedListIds?: string[]; // Allowed customer list IDs (or ['all'])
  avatarUrl?: string; // Profile picture / avatar
}

export interface CustomerTransaction {
  id: string;
  customerId: string;
  contractId: string;
  customerName: string;
  type: 'invoice' | 'payment' | 'refund';
  amount: number;
  date: string;
  description: string;
  repName?: string;
  createdAt: string;
}

export interface PaymentConflictRecord {
  id: string;
  contractId: string;
  customerName: string;
  attemptedAmount: number;
  actualRemainingBalance: number;
  excessAmount: number;
  repName: string;
  note?: string;
  paymentDate: string;
  createdAt: string;
  status: 'pending_review' | 'resolved' | 'rejected';
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  acceptedAmount?: number;
}

export type AppointmentType = 'recurring_day' | 'recurring_month' | 'specific_date' | 'date' | 'weekly' | 'monthly';

export interface AppointmentRecord {
  id: string;
  contractId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  listId?: string;
  listName?: string;
  appointmentType: AppointmentType;
  recurringDay?: number;
  recurringDayName?: string;
  recurringDayOfMonth?: number;
  recurringMonthDayName?: string;
  recurringMonthDay?: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  appointmentDate: string;
  appointmentTime?: string;
  dueDate?: string;
  dueTime?: string;
  title?: string;
  notes?: string;
  note?: string;
  status: 'pending' | 'completed' | 'cancelled';
  lastNotifiedAt?: string;
  createdByName?: string;
  createdByRepName?: string;
  createdByRepId?: string;
  createdAt: string;
}

export type Appointment = AppointmentRecord;

export type Language = 'ar' | 'en';
export type FilterStatus = 'all' | 'dueToday' | 'active' | 'completed';
export type ActiveTab = 'home' | 'customers' | 'addCustomer' | 'inventory' | 'history' | 'funds' | 'employees';

