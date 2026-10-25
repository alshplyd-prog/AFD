import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, doublePrecision, boolean } from 'drizzle-orm/pg-core';

// Define the 'users' table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // User Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'inventory_items'
export const inventoryItems = pgTable('inventory_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price: doublePrecision('price').notNull(),
  purchasePrice: doublePrecision('purchase_price').default(0),
  quantity: integer('quantity').notNull().default(0),
  dailyInstallment: doublePrecision('daily_installment').default(0),
  category: text('category'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'customer_lists'
export const customerLists = pgTable('customer_lists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  fundId: text('fund_id').notNull(),
  description: text('description'),
  orderIndex: integer('order_index').default(0),
  receiptTemplate: text('receipt_template').default('template_1'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'cash_funds'
export const cashFunds = pgTable('cash_funds', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  balance: doublePrecision('balance').notNull().default(0),
  description: text('description'),
  orderIndex: integer('order_index').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'customers' (جدول الزبائن)
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  address: text('address'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  locationAddress: text('location_address'),
  listId: text('list_id'),
  listName: text('list_name'),
  notes: text('notes'),
  totalPurchases: doublePrecision('total_purchases').default(0),
  totalPaid: doublePrecision('total_paid').default(0),
  remainingBalance: doublePrecision('remaining_balance').default(0),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Define 'sales' (جدول المبيعات)
export const sales = pgTable('sales', {
  id: text('id').primaryKey(),
  saleNumber: text('sale_number'),
  customerId: text('customer_id'),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerAddress: text('customer_address'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  locationAddress: text('location_address'),
  locationUpdatedAt: text('location_updated_at'),
  itemId: text('item_id'),
  itemName: text('item_name').notNull(),
  itemQuantity: integer('item_quantity').default(1),
  purchasePrice: doublePrecision('purchase_price').default(0),
  listId: text('list_id'),
  listName: text('list_name'),
  totalPrice: doublePrecision('total_price').notNull(),
  advancePayment: doublePrecision('advance_payment').default(0),
  remainingBalance: doublePrecision('remaining_balance').notNull(),
  dailyInstallment: doublePrecision('daily_installment').notNull(),
  startDate: text('start_date').notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('active'),
  lastPaymentDate: text('last_payment_date'),
  totalPaid: doublePrecision('total_paid').default(0),
  repName: text('rep_name'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
  updatedAt: text('updated_at'),
  isEdited: boolean('is_edited').default(false),
});

// Define 'payments'
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  contractId: text('contract_id').notNull(),
  customerName: text('customer_name').notNull(),
  amount: doublePrecision('amount').default(0),
  amountPaid: doublePrecision('amount_paid').default(0),
  paymentDate: text('payment_date').notNull(),
  repName: text('rep_name'),
  note: text('note'),
  fundId: text('fund_id'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  updatedAt: text('updated_at'),
  createdAt: text('created_at'),
  isEdited: boolean('is_edited').default(false),
});

// Define 'fund_transactions'
export const fundTransactions = pgTable('fund_transactions', {
  id: text('id').primaryKey(),
  fundId: text('fund_id').notNull(),
  targetFundId: text('target_fund_id'),
  type: text('type').notNull(),
  amount: doublePrecision('amount').notNull(),
  note: text('note'),
  repName: text('rep_name'),
  createdAt: text('created_at').notNull(),
});

// Define 'employees'
export const employees = pgTable('employees', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  jobTitle: text('job_title'),
  position: text('position'),
  salary: doublePrecision('salary').default(0),
  debtBalance: doublePrecision('debt_balance').default(0),
  totalDebt: doublePrecision('total_debt').default(0),
  isRep: boolean('is_rep').default(false),
  repId: text('rep_id'),
  createdAt: text('created_at'),
});

// Define 'employee_transactions'
export const employeeTransactions = pgTable('employee_transactions', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull(),
  fundId: text('fund_id').notNull(),
  type: text('type').notNull(),
  amount: doublePrecision('amount').notNull(),
  notes: text('notes'),
  repName: text('rep_name'),
  createdAt: text('created_at').notNull(),
});

// Define 'reps'
export const reps = pgTable('reps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  code: text('code').notNull(),
  role: text('role').default('rep'),
  canEdit: boolean('can_edit').default(true),
  canDelete: boolean('can_delete').default(false),
  canMoveCustomer: boolean('can_move_customer').default(true),
  canSell: boolean('can_sell').default(true),
  allowedListIds: text('allowed_list_ids'),
  avatarUrl: text('avatar_url'),
});

// Define 'payment_conflicts'
export const paymentConflicts = pgTable('payment_conflicts', {
  id: text('id').primaryKey(),
  contractId: text('contract_id'),
  customerName: text('customer_name'),
  attemptedAmount: doublePrecision('attempted_amount').default(0),
  actualRemainingBalance: doublePrecision('actual_remaining_balance').default(0),
  excessAmount: doublePrecision('excess_amount').default(0),
  repName: text('rep_name'),
  note: text('note'),
  paymentDate: text('payment_date'),
  createdAt: text('created_at'),
  status: text('status').default('pending_review'),
  resolvedBy: text('resolved_by'),
  resolvedAt: text('resolved_at'),
  resolutionNote: text('resolution_note'),
  acceptedAmount: doublePrecision('accepted_amount').default(0),
});

// Define 'system_settings'
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Define 'deleted_records'
export const deletedRecords = pgTable('deleted_records', {
  recordId: text('record_id').primaryKey(),
  tableName: text('table_name').notNull(),
  deletedAt: timestamp('deleted_at').defaultNow(),
});

// Define 'shared_pdfs'
export const sharedPdfs = pgTable('shared_pdfs', {
  filename: text('filename').primaryKey(),
  dataBase64: text('data_base64').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sales: many(sales),
}));
