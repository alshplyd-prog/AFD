import { InstallmentContract, PaymentRecord, InventoryItem, SalesRepresentative, CashFund, CustomerList, Employee } from '../types';

export const DEFAULT_REPS: SalesRepresentative[] = [
  {
    "id": "rep-1",
    "name": "ضياء المحاسب",
    "phone": "07801112233",
    "code": "7351",
    "role": "admin",
    "canEdit": true,
    "canDelete": true,
    "canMoveCustomer": true,
    "canSell": true,
    "allowedListIds": [
      "all"
    ]
  },
  {
    "id": "rep_1790075504995_4y79u",
    "name": "ماهر",
    "phone": "",
    "code": "5632",
    "role": "supervisor",
    "canEdit": true,
    "canDelete": false,
    "canMoveCustomer": true,
    "canSell": true,
    "allowedListIds": [
      "list_1789987255564_y9e1d",
      "fund-2",
      "list_1791618798751_j2o66"
    ]
  },
  {
    "id": "rep_1792578863867_soh3s",
    "name": "سيد نزار",
    "phone": "",
    "code": "3333",
    "role": "rep",
    "canEdit": false,
    "canDelete": false,
    "canMoveCustomer": false,
    "canSell": true,
    "allowedListIds": [
      "all"
    ]
  },
  {
    "id": "rep_1790325874814_0njii",
    "name": "زيد",
    "phone": "07704445566",
    "code": "0000",
    "role": "rep",
    "canEdit": true,
    "canDelete": true,
    "canMoveCustomer": true,
    "canSell": true
  },
  {
    "id": "rep_1791619141491_eurdj",
    "name": "هيثم",
    "phone": "",
    "code": "7683",
    "role": "rep",
    "canEdit": false,
    "canDelete": false,
    "canMoveCustomer": false,
    "canSell": false,
    "allowedListIds": [
      "list_1791618798751_j2o66"
    ]
  }
];

export const INITIAL_FUNDS: CashFund[] = [
  {
    "id": "fund-4",
    "name": "صندوق ماهر 1",
    "balance": 7382000,
    "description": "",
    "orderIndex": 0,
    "createdAt": "2026-09-04T18:20:53.845Z"
  },
  {
    "id": "fund-2",
    "name": "ماهر 2",
    "balance": 50000,
    "description": "",
    "orderIndex": 1,
    "createdAt": "2026-09-04T18:19:54.513Z"
  },
  {
    "id": "fund_1787350326789_erqgt",
    "name": "صندوق الديوانية العام 🌟🌹",
    "balance": 10000,
    "description": "",
    "orderIndex": 2,
    "createdAt": "2026-08-21T22:12:07.489Z"
  },
  {
    "id": "fund_1787350349137_204v6",
    "name": "صندوق الاولى",
    "balance": 0,
    "description": "",
    "orderIndex": 3,
    "createdAt": "2026-08-21T22:12:29.884Z"
  },
  {
    "id": "fund_1787350392388_zmj8l",
    "name": "صندوق الثانية",
    "balance": 0,
    "description": "",
    "orderIndex": 4,
    "createdAt": "2026-08-21T22:13:13.099Z"
  },
  {
    "id": "fund-1",
    "name": "صندوق متوقفين الديوانية",
    "balance": 0,
    "description": "",
    "orderIndex": 5,
    "createdAt": "2026-09-04T18:20:35.204Z"
  },
  {
    "id": "fund_1787351541464_lqvd8",
    "name": "صندوق كربلاء العام 🌟🌹",
    "balance": 0,
    "description": "",
    "orderIndex": 6,
    "createdAt": "2026-08-21T22:32:22.201Z"
  },
  {
    "id": "fund_1787412692389_0x4u5",
    "name": "صندوق كربلاء الاولى",
    "balance": 0,
    "description": "",
    "orderIndex": 7,
    "createdAt": "2026-08-22T15:31:32.391Z"
  },
  {
    "id": "fund_1787412701870_5rh61",
    "name": "صندوق كربلاء الثانية",
    "balance": 1500,
    "description": "",
    "orderIndex": 8,
    "createdAt": "2026-08-22T15:31:41.870Z"
  },
  {
    "id": "fundtx_1788545333848_a15gc",
    "name": "صندوق كربلاء الثالثة",
    "balance": 0,
    "description": "",
    "orderIndex": 9,
    "createdAt": "2026-09-04T18:15:16.511Z"
  },
  {
    "id": "fund_1787350448071_bdhbq",
    "name": "صندوق متوقفين كربلاء",
    "balance": 0,
    "description": "",
    "orderIndex": 10,
    "createdAt": "2026-09-04T18:20:13.852Z"
  },
  {
    "id": "fund_1791618782897_u79cy",
    "name": "هيثم",
    "balance": 165000,
    "description": "",
    "orderIndex": 11,
    "createdAt": "2026-10-10T07:53:02.897Z"
  }
];

export const INITIAL_CUSTOMER_LISTS: CustomerList[] = [
  {
    "id": "list_1789987255564_y9e1d",
    "name": "ماهر 1",
    "fundId": "fund-4",
    "description": "",
    "orderIndex": 0,
    "receiptTemplate": "template_1",
    "createdAt": "2026-09-21T10:40:55.564Z"
  },
  {
    "id": "fund-2",
    "name": "ماهر 2",
    "fundId": "fund-2",
    "description": "",
    "orderIndex": 1,
    "receiptTemplate": "template_1",
    "createdAt": "2026-09-19T19:42:41.747Z"
  },
  {
    "id": "list-4",
    "name": "القائمة الاولى",
    "fundId": "fund_1787350349137_204v6",
    "description": "سجل زبائن محافظة الديوانية",
    "orderIndex": 2,
    "receiptTemplate": "template_2",
    "createdAt": "2026-08-21T22:10:57.548Z"
  },
  {
    "id": "list_1787350092691_n2xzi",
    "name": "القائمة الثانية",
    "fundId": "fund_1787350392388_zmj8l",
    "description": "",
    "orderIndex": 3,
    "receiptTemplate": "template_2",
    "createdAt": "2026-09-04T18:13:48.920Z"
  },
  {
    "id": "list-3",
    "name": "متوقفين الديوانية",
    "fundId": "fund-1",
    "description": "سجل زبائن محافظة النجف والأحياء المجاورة",
    "orderIndex": 4,
    "receiptTemplate": "template_2",
    "createdAt": "2026-08-21T22:21:32.852Z"
  },
  {
    "id": "list_1787350121291_e186z",
    "name": "كربلاء الاولى",
    "fundId": "fund_1787412692389_0x4u5",
    "description": "",
    "orderIndex": 5,
    "receiptTemplate": "template_2",
    "createdAt": "2026-08-22T16:44:31.734Z"
  },
  {
    "id": "list-1",
    "name": "كربلاء الثانية",
    "fundId": "fund_1787412701870_5rh61",
    "description": "سجل زبائن الكرخ والمنصور واليرموك",
    "orderIndex": 6,
    "receiptTemplate": "template_2",
    "createdAt": "2026-09-04T18:12:13.160Z"
  },
  {
    "id": "list_1787412721284_d7tle",
    "name": "كربلاء الثالثة",
    "fundId": "fundtx_1788545333848_a15gc",
    "description": "",
    "orderIndex": 7,
    "receiptTemplate": "template_2",
    "createdAt": "2026-09-04T18:13:15.207Z"
  },
  {
    "id": "list_1789987238741_0f20f",
    "name": "متوقفين كربلاء",
    "fundId": "fund_1787350448071_bdhbq",
    "description": "",
    "orderIndex": 8,
    "receiptTemplate": "template_2",
    "createdAt": "2026-09-21T10:40:38.741Z"
  },
  {
    "id": "list_1791618798751_j2o66",
    "name": "هيثم",
    "fundId": "fund_1791618782897_u79cy",
    "description": "",
    "orderIndex": 9,
    "receiptTemplate": "template_1",
    "createdAt": "2026-10-10T07:53:18.751Z"
  }
];

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    "id": "emp_1792444854676_5qc5v",
    "name": "زيد",
    "phone": "",
    "jobTitle": "مندوب / محصل",
    "position": "مندوب / محصل",
    "salary": 0,
    "debtBalance": 0,
    "totalDebt": 0,
    "isRep": true,
    "repId": "rep_1790325874814_0njii",
    "createdAt": "2026-10-19T21:20:54.676Z"
  },
  {
    "id": "emp_1792582315555_0y387",
    "name": "سيد نزار",
    "phone": "0780",
    "jobTitle": "مندوب / محصل",
    "position": "مندوب / محصل",
    "salary": 0,
    "debtBalance": 0,
    "totalDebt": 0,
    "isRep": true,
    "repId": "rep_1792578863867_soh3s",
    "createdAt": "2026-10-21T11:31:55.556Z"
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    "id": "item_1790064412752_wt6aw",
    "name": "اجهزه 170",
    "price": 170000,
    "purchasePrice": 0,
    "quantity": 870,
    "dailyInstallment": 1500,
    "category": "",
    "createdAt": "2026-09-22T08:06:53.382Z"
  },
  {
    "id": "item_1790065183357_qgfnm",
    "name": "اجهزه 175",
    "price": 175000,
    "purchasePrice": 0,
    "quantity": 667,
    "dailyInstallment": 1500,
    "category": "",
    "createdAt": "2026-09-22T08:19:43.354Z"
  },
  {
    "id": "item_1790064440723_1xraf",
    "name": "اجهزه 210",
    "price": 210000,
    "purchasePrice": 0,
    "quantity": 985,
    "dailyInstallment": 2000,
    "category": "",
    "createdAt": "2026-09-22T08:07:21.264Z"
  },
  {
    "id": "item_1790064468433_qo5eq",
    "name": "جهزه 215",
    "price": 215000,
    "purchasePrice": 0,
    "quantity": 919,
    "dailyInstallment": 2000,
    "category": "",
    "createdAt": "2026-09-22T08:07:48.433Z"
  }
];

export const INITIAL_CONTRACTS: InstallmentContract[] = [
  {
    id: 'contract-1',
    customerName: 'أحمد محمد عبد الله',
    customerPhone: '07801234567',
    customerAddress: 'الديوانية - حي العسكري',
    itemId: 'item_1790064412752_wt6aw',
    itemName: 'اجهزه 170',
    itemQuantity: 1,
    purchasePrice: 150000,
    listId: 'list_1789987255564_y9e1d',
    listName: 'ماهر 1',
    totalPrice: 170000,
    advancePayment: 20000,
    remainingBalance: 150000,
    dailyInstallment: 5000,
    startDate: '2026-09-01',
    notes: 'منتظم في التسديد',
    status: 'active',
    totalPaid: 0,
    excessAmount: 0,
    rawTotalPaid: 0,
    repName: 'ماهر',
    latitude: 31.9903,
    longitude: 44.9183,
    locationAddress: 'الديوانية - حي العسكري قرب المدارس',
    createdAt: '2026-09-01T10:00:00.000Z'
  },
  {
    id: 'contract-2',
    customerName: 'علي كاظم محسن',
    customerPhone: '07709876543',
    customerAddress: 'كربلاء المقدسة - شارع العباس',
    itemId: 'item_1790064440723_1xraf',
    itemName: 'اجهزه 210',
    itemQuantity: 1,
    purchasePrice: 190000,
    listId: 'fund-2',
    listName: 'ماهر 2',
    totalPrice: 210000,
    advancePayment: 30000,
    remainingBalance: 180000,
    dailyInstallment: 6000,
    startDate: '2026-09-05',
    notes: 'زبون مميز',
    status: 'active',
    totalPaid: 0,
    excessAmount: 0,
    rawTotalPaid: 0,
    repName: 'ماهر',
    latitude: 32.6160,
    longitude: 44.0249,
    locationAddress: 'كربلاء المقدسة - قرب العتبة العباسية',
    createdAt: '2026-09-05T11:30:00.000Z'
  }
];

export const INITIAL_PAYMENTS: PaymentRecord[] = [];

export const INITIAL_APPOINTMENTS: any[] = [
  {
    id: 'appt_init_1',
    contractId: 'contract-1',
    customerName: 'أحمد محمد عبد الله',
    customerPhone: '07801234567',
    customerAddress: 'الديوانية - حي العسكري',
    listId: 'list_1789987255564_y9e1d',
    listName: 'ماهر 1',
    appointmentType: 'recurring_day',
    recurringDay: 2,
    recurringDayName: 'الثلاثاء',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '10:00 ص',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '10:00 ص',
    title: 'موعد تحصيل قسط أسبوعي',
    notes: 'متابعة سداد الأقساط الأسبوعية',
    status: 'pending',
    createdByName: 'ضياء المحاسب',
    createdByRepName: 'ضياء المحاسب',
    createdByRepId: 'rep-1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'appt_init_2',
    contractId: 'contract-2',
    customerName: 'علي كاظم محسن',
    customerPhone: '07709876543',
    customerAddress: 'كربلاء المقدسة - شارع العباس',
    listId: 'fund-2',
    listName: 'ماهر 2',
    appointmentType: 'recurring_month',
    recurringDayOfMonth: 15,
    recurringMonthDayName: 'يوم 15 من كل شهر',
    appointmentDate: new Date().toISOString().split('T')[0],
    appointmentTime: '11:00 ص',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '11:00 ص',
    title: 'موعد القسط الشهري',
    notes: 'تسديد القسط الشهري الثابت',
    status: 'pending',
    createdByName: 'ماهر',
    createdByRepName: 'ماهر',
    createdByRepId: 'rep_1790075504995_4y79u',
    createdAt: new Date().toISOString(),
  }
];
