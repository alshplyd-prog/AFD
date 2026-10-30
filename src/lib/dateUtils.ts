/**
 * Returns a date string formatted as YYYY-MM-DD in the local device timezone using 'en-CA' locale.
 * Prevents UTC offset shifts (e.g. late night payments showing as previous day).
 */
export function getLocalDateString(input?: Date | string | number): string {
  if (!input) {
    return new Date().toLocaleDateString('en-CA');
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA');
  }
  return d.toLocaleDateString('en-CA');
}

/**
 * Returns an ISO-like timestamp string adjusted for the device's local time zone
 * preventing UTC shift bugs (e.g. 3:00 AM offset issues).
 */
export function getLocalIsoString(date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  const offsetMs = d.getTimezoneOffset() * 60 * 1000;
  const localDate = new Date(d.getTime() - offsetMs);
  return localDate.toISOString();
}

/**
 * Formats a payment's date & time string accurately using the device/phone's local time.
 * Resolves the issue where Date("YYYY-MM-DD") parsed as UTC midnight turns into 3:00 AM (3:00 ص) in UTC+3.
 */
export function formatPaymentDateTime(
  paymentOrDate: { paymentDate?: string; createdAt?: string; updatedAt?: string } | string | Date | undefined | null,
  isAr = true
): string {
  if (!paymentOrDate) return '-';

  if (paymentOrDate instanceof Date) {
    if (isNaN(paymentOrDate.getTime())) return '-';
    const dStr = paymentOrDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const tStr = paymentOrDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dStr} ${tStr}`;
  }

  if (typeof paymentOrDate === 'string') {
    const trimmed = paymentOrDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parts = trimmed.split('-');
      return `${parts[0]}/${parts[1]}/${parts[2]}`;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const dStr = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const tStr = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return `${dStr} ${tStr}`;
    }
    return trimmed;
  }

  // Object case: payment record
  const payDate = paymentOrDate.paymentDate;
  const created = paymentOrDate.createdAt;
  const updated = paymentOrDate.updatedAt;

  // Extract time portion (from createdAt / updatedAt / paymentDate)
  const timeStr = formatPaymentTime(paymentOrDate, isAr);

  // Extract date portion: paymentDate is the authoritative transaction date
  let datePartStr = '';
  if (payDate) {
    const trimmed = payDate.trim();
    const dateOnly = trimmed.split('T')[0].split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      const parts = dateOnly.split('-');
      datePartStr = `${parts[0]}/${parts[1]}/${parts[2]}`;
    } else {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        datePartStr = d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      } else {
        datePartStr = dateOnly;
      }
    }
  } else if (created) {
    const d = new Date(created);
    if (!isNaN(d.getTime())) {
      datePartStr = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
  } else if (updated) {
    const d = new Date(updated);
    if (!isNaN(d.getTime())) {
      datePartStr = d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
  }

  if (!datePartStr) {
    datePartStr = getLocalDateString();
  }

  if (timeStr) {
    return `${datePartStr} ${timeStr}`;
  }
  return datePartStr;
}

/**
 * Extracts and formats the time portion only from a payment or date record using mobile local time.
 */
export function formatPaymentTime(
  paymentOrDate: { paymentDate?: string; createdAt?: string; updatedAt?: string } | string | Date | undefined | null,
  isAr = true
): string {
  if (!paymentOrDate) return '';

  let dateObj: Date | null = null;
  if (typeof paymentOrDate === 'object' && !(paymentOrDate instanceof Date)) {
    if (paymentOrDate.createdAt) {
      const d = new Date(paymentOrDate.createdAt);
      if (!isNaN(d.getTime())) dateObj = d;
    }
    if (!dateObj && paymentOrDate.updatedAt) {
      const d = new Date(paymentOrDate.updatedAt);
      if (!isNaN(d.getTime())) dateObj = d;
    }
    if (!dateObj && paymentOrDate.paymentDate && (paymentOrDate.paymentDate.includes('T') || paymentOrDate.paymentDate.includes(':'))) {
      const d = new Date(paymentOrDate.paymentDate);
      if (!isNaN(d.getTime())) dateObj = d;
    }
  } else if (paymentOrDate instanceof Date) {
    dateObj = isNaN(paymentOrDate.getTime()) ? null : paymentOrDate;
  } else if (typeof paymentOrDate === 'string' && (paymentOrDate.includes('T') || paymentOrDate.includes(':'))) {
    const d = new Date(paymentOrDate);
    if (!isNaN(d.getTime())) dateObj = d;
  }

  if (dateObj) {
    return dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  return '';
}

/**
 * Accurately extracts date string and time string for a payment using device local time.
 * Avoids the UTC-midnight to 3:00 AM timezone conversion issue.
 */
export function getPaymentFormattedDateAndTime(
  p: { paymentDate?: string; createdAt?: string; updatedAt?: string; note?: string } | undefined | null,
  isAr = true
): { dateStr: string; timeStr: string; cleanNote: string } {
  if (!p) {
    const now = new Date();
    return {
      dateStr: getLocalDateString(now),
      timeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      cleanNote: '',
    };
  }

  let timeStr = formatPaymentTime(p, isAr);
  let dateStr = '';

  if (p.paymentDate) {
    const pDateOnly = p.paymentDate.split('T')[0].split(' ')[0].trim();
    const parts = pDateOnly.split('-');
    if (parts.length === 3) {
      dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else {
      const d = new Date(p.paymentDate);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-US');
      } else {
        dateStr = pDateOnly;
      }
    }
  } else if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString('en-US');
    }
  }

  if (!dateStr) {
    dateStr = getLocalDateString();
  }

  let cleanNote = (p.note || '').trim();
  if (cleanNote === 'تسديد قسط يومي' || cleanNote === 'تسديد قسط' || cleanNote === 'قسط يومي' || cleanNote === 'Daily installment payment') {
    cleanNote = '';
  }

  return { dateStr, timeStr, cleanNote };
}

/**
 * Checks if a customer/contract has remaining balance of 0 (or status is completed)
 * and at least 24 hours (1 calendar day) have passed since that date.
 */
export function isZeroBalanceExpired24h(contract: {
  id?: string;
  remainingBalance?: number;
  status?: string;
  startDate?: string;
  createdAt?: string | number;
  completedAt?: string | number;
}): boolean {
  const isZero = (contract.remainingBalance ?? 0) <= 0 || contract.status === 'completed';
  if (!isZero) {
    if (typeof window !== 'undefined' && contract.id) {
      try {
        localStorage.removeItem(`zero_balance_completed_at_${contract.id}`);
      } catch {
        // ignore
      }
    }
    return false;
  }

  const expiryMs = getZeroBalanceExpiryMs(contract);
  return Date.now() > expiryMs;
}

/**
 * Returns the timestamp (ms) when a zero-balance contract expires (24h after completion timestamp).
 */
export function getZeroBalanceExpiryMs(contract: {
  id?: string;
  remainingBalance?: number;
  status?: string;
  startDate?: string;
  createdAt?: string | number;
  completedAt?: string | number;
}): number {
  const isZero = (contract.remainingBalance ?? 0) <= 0 || contract.status === 'completed';
  if (!isZero) return 0;

  if (contract.completedAt) {
    const completedMs = new Date(contract.completedAt).getTime();
    if (!isNaN(completedMs)) {
      return completedMs + 24 * 60 * 60 * 1000;
    }
  }

  // If completedAt is not in PostgreSQL yet, use localStorage to remember the exact moment it was zeroed
  if (typeof window !== 'undefined') {
    const storageKey = `zero_balance_completed_at_${contract.id || 'unknown'}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const storedMs = parseInt(stored, 10);
      if (!isNaN(storedMs)) {
        return storedMs + 24 * 60 * 60 * 1000;
      }
    } else {
      const now = Date.now();
      try {
        localStorage.setItem(storageKey, String(now));
      } catch {
        // ignore storage errors
      }
      return now + 24 * 60 * 60 * 1000;
    }
  }

  return Date.now() + 24 * 60 * 60 * 1000;
}

/**
 * Formats the countdown until the zero-balance contract is hidden (e.g. "(يتم الإخفاء خلال 23:45:10)").
 */
export function formatZeroBalanceCountdown(
  contract: {
    remainingBalance?: number;
    status?: string;
    startDate?: string;
    createdAt?: string | number;
    completedAt?: string | number;
  },
  isAr: boolean = true
): string {
  const isZero = (contract.remainingBalance ?? 0) <= 0 || contract.status === 'completed';
  if (!isZero) return '';

  const expiryMs = getZeroBalanceExpiryMs(contract);
  const diff = expiryMs - Date.now();
  if (diff <= 0) {
    return isAr ? '(انتهى وقت الإخفاء)' : '(Expired)';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return isAr ? `(يتم الإخفاء خلال ${timeStr})` : `(Hidden in ${timeStr})`;
}


let lastNotificationSoundTime = 0;

export function playNotificationSound() {
  try {
    const now = Date.now();
    // Debounce audio trigger so it never plays repeatedly within 800ms
    if (now - lastNotificationSoundTime < 800) {
      return;
    }
    lastNotificationSoundTime = now;

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    // Ignore audio errors
  }
}

export function getCurrentLoggedRepFromStorage(): { id?: string; name?: string; role?: string; allowedListIds?: any } | null {
  try {
    const savedRep = localStorage.getItem('sami_app_logged_rep');
    if (!savedRep) return null;
    const rep = JSON.parse(savedRep);
    if (!rep || !rep.id || !rep.name) return null;
    return rep;
  } catch (e) {
    return null;
  }
}

export async function showBrowserNotification(
  title: string,
  body: string,
  options?: {
    icon?: string;
    badge?: string;
    tag?: string;
    data?: any;
    vibrate?: number[];
    requiredListId?: string | null;
  }
): Promise<boolean> {
  // CRITICAL SECURITY: Block all notifications before login!
  const loggedRep = getCurrentLoggedRepFromStorage();
  if (!loggedRep) {
    return false;
  }

  // Permission check: if notification belongs to a specific list, verify rep access
  if (options?.requiredListId && loggedRep.role !== 'admin') {
    const allowed = loggedRep.allowedListIds;
    if (allowed && !allowed.includes('all')) {
      const allowedArr = typeof allowed === 'string' ? allowed.split(',') : (Array.isArray(allowed) ? allowed : []);
      if (!allowedArr.includes(options.requiredListId)) {
        return false;
      }
    }
  }

  try {
    // Play sound once
    playNotificationSound();

    // Delegate to unified APK/Web notification dispatcher
    const { sendExternalNotification } = await import('./capacitorPush');
    return await sendExternalNotification(title, body, {
      tag: options?.tag,
      icon: options?.icon || '/pwa-192x192.png',
      badge: options?.badge || '/favicon.png',
      data: options?.data,
      vibrate: options?.vibrate || [200, 100, 200],
    });
  } catch (e) {
    console.warn('showBrowserNotification exception:', e);
  }
  return false;
}

export async function requestExternalNotificationPermission(): Promise<boolean> {
  const { requestExternalNotificationPermission: req } = await import('./capacitorPush');
  return await req();
}

export const WEEK_DAYS_AR = [
  { day: 0, label: 'كل أحد', short: 'الأحد' },
  { day: 1, label: 'كل إثنين', short: 'الإثنين' },
  { day: 2, label: 'كل ثلاثاء', short: 'الثلاثاء' },
  { day: 3, label: 'كل أربعاء', short: 'الأربعاء' },
  { day: 4, label: 'كل خميس', short: 'الخميس' },
  { day: 5, label: 'كل جمعة', short: 'الجمعة' },
  { day: 6, label: 'كل سبت', short: 'السبت' },
];

export const WEEK_DAYS_EN = [
  { day: 0, label: 'Every Sunday', short: 'Sun' },
  { day: 1, label: 'Every Monday', short: 'Mon' },
  { day: 2, label: 'Every Tuesday', short: 'Tue' },
  { day: 3, label: 'Every Wednesday', short: 'Wed' },
  { day: 4, label: 'Every Thursday', short: 'Thu' },
  { day: 5, label: 'Every Friday', short: 'Fri' },
  { day: 6, label: 'Every Saturday', short: 'Sat' },
];

export function getNextDateForDayOfWeek(targetDayOfWeek: number): string {
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  let diff = targetDayOfWeek - currentDayOfWeek;
  if (diff <= 0) {
    diff += 7;
  }
  const next = new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNextDateForDayOfMonth(targetDayOfMonth: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  let targetYear = year;
  let targetMonth = month;
  if (day >= targetDayOfMonth) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }
  const mStr = String(targetMonth + 1).padStart(2, '0');
  const dStr = String(Math.min(targetDayOfMonth, 28)).padStart(2, '0');
  return `${targetYear}-${mStr}-${dStr}`;
}


export function parseAppointmentDateTime(appointmentDateStr?: string, appointmentTimeStr?: string): Date | null {
  if (!appointmentDateStr) return null;
  const cleanDate = appointmentDateStr.trim();
  const timeStr = appointmentTimeStr ? appointmentTimeStr.trim() : '09:00';
  const fullStr = `${cleanDate}T${timeStr}:00`;
  const d = new Date(fullStr);
  if (!isNaN(d.getTime())) return d;
  const dOnly = new Date(cleanDate);
  return isNaN(dOnly.getTime()) ? null : dOnly;
}

export function isAppointmentOlderThanDays(appointmentDateStr?: string, days = 2): boolean {
  if (!appointmentDateStr) return false;
  const dateObj = parseAppointmentDateTime(appointmentDateStr);
  if (!dateObj) return false;
  const diffMs = Date.now() - dateObj.getTime();
  const daysMs = days * 24 * 60 * 60 * 1000;
  return diffMs > daysMs;
}

/**
 * Parse an appointment time string (e.g. "10:00 ص", "10:00 AM", "14:30", "02:30 م", "02:30 PM") into minutes since midnight (0..1439).
 */
export function parseAppointmentTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const s = timeStr.trim();
  const normalized = s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();

  const match = normalized.match(/(\d{1,2}):(\d{2})(?:\s*([ap]\.?m\.?|[صم]))?/i);
  if (!match) {
    const parts = normalized.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h * 60 + m;
    }
    return null;
  }
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toLowerCase() : null;

  if (ampm) {
    if ((ampm.includes('p') || ampm.includes('م')) && h < 12) {
      h += 12;
    } else if ((ampm.includes('a') || ampm.includes('ص')) && h === 12) {
      h = 0;
    }
  }
  return h * 60 + m;
}

/**
 * Evaluates whether an appointment should be deleted based on system rules:
 * 1. Weekly ('recurring_day' | 'weekly') and Monthly ('recurring_month' | 'monthly') appointments are PERMANENT.
 * 2. Specific date appointments ('date' | 'specific_date') auto-delete 3 days after their scheduled date.
 * 3. ANY appointment type is auto-deleted if the customer's remaining balance is 0 or contract is completed.
 */
export function isAppointmentAutoDeletable(
  appt: {
    id: string;
    contractId?: string;
    customerName?: string;
    appointmentType?: string;
    appointmentDate?: string;
    dueDate?: string;
    status?: string;
  },
  contracts: Array<{
    id: string;
    customerName?: string;
    remainingBalance: number;
    status?: string;
  }>,
  currentDateStr = getLocalDateString()
): boolean {
  if (!appt) return false;

  // Rule 3: If remaining balance is 0 or contract completed, auto-delete ANY type of appointment
  if (contracts && contracts.length > 0) {
    let matchedContract = appt.contractId ? contracts.find((c) => c.id === appt.contractId) : undefined;
    if (!matchedContract && appt.customerName) {
      const normName = appt.customerName.trim().toLowerCase();
      matchedContract = contracts.find((c) => c.customerName && c.customerName.trim().toLowerCase() === normName);
    }

    if (matchedContract) {
      if ((matchedContract.remainingBalance ?? 0) <= 0 || matchedContract.status === 'completed') {
        return true; // Balance is 0 -> auto delete ANY type!
      }
    } else if (appt.customerName) {
      const normName = appt.customerName.trim().toLowerCase();
      const customerContracts = contracts.filter((c) => c.customerName && c.customerName.trim().toLowerCase() === normName);
      if (customerContracts.length > 0) {
        const totalRem = customerContracts.reduce((sum, c) => sum + (c.remainingBalance || 0), 0);
        if (totalRem <= 0) {
          return true; // Balance is 0 -> auto delete ANY type!
        }
      }
    }
  }

  // Rule 1: Weekly and Monthly appointments are PERMANENT (never auto-deleted by date)
  const type = appt.appointmentType;
  const isWeekly = type === 'weekly' || type === 'recurring_day';
  const isMonthly = type === 'monthly' || type === 'recurring_month';
  if (isWeekly || isMonthly) {
    return false;
  }

  // Rule 2: Specific / custom date appointments auto-delete 3 days after their date
  const apptDateStr = appt.appointmentDate || appt.dueDate;
  if (apptDateStr && typeof apptDateStr === 'string') {
    const rawDate = apptDateStr.split('T')[0].trim();
    const parts = rawDate.split('-').map(Number);
    const todayParts = currentDateStr.split('-').map(Number);
    if (parts.length === 3 && todayParts.length === 3 && !isNaN(parts[0]) && !isNaN(todayParts[0])) {
      const apptMidnight = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
      const todayMidnight = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
      const diffDays = Math.round((todayMidnight - apptMidnight) / (24 * 60 * 60 * 1000));
      // If more than 3 days have passed (diffDays > 3)
      if (diffDays > 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if an appointment is due and should appear in notifications:
 * - Weekly: due if today matches recurring day of week AND current time >= appointment time.
 * - Monthly: due if today matches recurring day of month AND current time >= appointment time.
 * - Specific date: due if today is == appointment date AND current time >= appointment time, or within 3 days past.
 * - Never due if balance is 0, in future, or before scheduled time.
 */
export function isAppointmentDueForNotification(
  appt: {
    id: string;
    contractId?: string;
    customerName?: string;
    appointmentType?: string;
    appointmentDate?: string;
    dueDate?: string;
    appointmentTime?: string;
    dueTime?: string;
    recurringDay?: number;
    dayOfWeek?: number;
    recurringDayOfMonth?: number;
    recurringMonthDay?: number;
    dayOfMonth?: number;
    status?: string;
  },
  contracts: Array<{
    id: string;
    customerName?: string;
    remainingBalance: number;
    status?: string;
  }>,
  now = new Date()
): boolean {
  if (appt.status === 'completed' || appt.status === 'cancelled') return false;

  // If auto-deletable (e.g. balance is 0 or specific date > 3 days old), never alert in notifications
  if (isAppointmentAutoDeletable(appt, contracts, getLocalDateString(now))) {
    return false;
  }

  const type = appt.appointmentType;
  const isWeekly = type === 'weekly' || type === 'recurring_day';
  const isMonthly = type === 'monthly' || type === 'recurring_month';

  const apptTimeMinutes = parseAppointmentTimeToMinutes(appt.appointmentTime || appt.dueTime);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (isWeekly) {
    const dayOfWeek = appt.recurringDay !== undefined ? appt.recurringDay : appt.dayOfWeek;
    if (dayOfWeek === undefined || dayOfWeek === null || now.getDay() !== dayOfWeek) {
      return false;
    }
    // On the same day of week: only alert when current time has reached the scheduled time
    if (apptTimeMinutes !== null && nowMinutes < apptTimeMinutes) {
      return false;
    }
    return true;
  }

  if (isMonthly) {
    const dayOfMonth = appt.recurringDayOfMonth !== undefined ? appt.recurringDayOfMonth : (appt.recurringMonthDay !== undefined ? appt.recurringMonthDay : appt.dayOfMonth);
    if (dayOfMonth === undefined || dayOfMonth === null || now.getDate() !== dayOfMonth) {
      return false;
    }
    // On the same day of month: only alert when current time has reached the scheduled time
    if (apptTimeMinutes !== null && nowMinutes < apptTimeMinutes) {
      return false;
    }
    return true;
  }

  // Specific / custom date
  const apptDateStr = appt.appointmentDate || appt.dueDate;
  if (apptDateStr) {
    const rawDate = apptDateStr.split('T')[0].trim();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curDate = String(now.getDate()).padStart(2, '0');
    const todayDateStr = `${curYear}-${curMonth}-${curDate}`;

    const parts = rawDate.split('-').map(Number);
    const todayParts = [curYear, Number(curMonth), Number(curDate)];
    if (parts.length === 3) {
      const apptMidnight = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
      const todayMidnight = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]).getTime();
      const diffDays = Math.round((todayMidnight - apptMidnight) / (24 * 60 * 60 * 1000));
      
      // Future date -> not due yet
      if (diffDays < 0) {
        return false;
      }
      // Today -> strictly check time
      if (diffDays === 0) {
        if (apptTimeMinutes !== null && nowMinutes < apptTimeMinutes) {
          return false;
        }
        return true;
      }
      // Past within 3 days -> due
      return diffDays <= 3;
    }
    if (rawDate > todayDateStr) return false;
    if (rawDate === todayDateStr && apptTimeMinutes !== null && nowMinutes < apptTimeMinutes) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Calculates number of days starting from the second day of the sale
 * (Day of sale = 0 days, 2nd day = 1 day, 3rd day = 2 days, etc.)
 */
export function getDaysSinceSaleSecondDay(saleDateStr?: string, targetDateStr?: string): number {
  if (!saleDateStr) return 0;
  const saleD = saleDateStr.split('T')[0].trim();
  if (!saleD) return 0;
  const targetD = (targetDateStr ? targetDateStr.split('T')[0].trim() : '') || getLocalDateString();
  const [sY, sM, sD] = saleD.split('-').map(Number);
  const [tY, tM, tD] = targetD.split('-').map(Number);
  if (!sY || !sM || !sD || !tY || !tM || !tD) return 0;
  const sUtc = Date.UTC(sY, sM - 1, sD);
  const tUtc = Date.UTC(tY, tM - 1, tD);
  const diffDays = Math.floor((tUtc - sUtc) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calculates the accrued/overdue accumulated amount for a contract:
 * Formula: (dailyInstallment * days starting second day of sale) - totalPaid
 * If accumulated >= remaining balance, returns isOverdueDueAll: true and displayValue: 'منتهي'
 */
export function calculateAccumulatedInstallment(
  contract: {
    startDate?: string;
    createdAt?: string;
    dailyInstallment?: number;
    totalPaid?: number;
    totalPrice?: number;
    advancePayment?: number;
  },
  targetDateStr?: string
): {
  days: number;
  accumulated: number;
  remaining: number;
  isOverdueDueAll: boolean;
  displayValue: string;
} {
  const saleDateStr = contract.startDate || (contract.createdAt ? contract.createdAt.split('T')[0] : '');
  const days = getDaysSinceSaleSecondDay(saleDateStr, targetDateStr);
  const installment = Number(contract.dailyInstallment || 0);
  const totalPaid = Number(contract.totalPaid || 0);
  const totalPrice = Number(contract.totalPrice || 0);
  const advancePayment = Number(contract.advancePayment || 0);
  const netFinanced = Math.max(0, totalPrice - advancePayment);
  const remaining = Math.max(0, netFinanced - totalPaid);
  const accumulated = Math.round((installment * days) - totalPaid);
  const isOverdueDueAll = remaining > 0 && accumulated >= remaining;
  const displayValue = isOverdueDueAll ? 'منتهي' : (accumulated > 0 ? accumulated.toLocaleString('en-US') : '0');

  return {
    days,
    accumulated,
    remaining,
    isOverdueDueAll,
    displayValue,
  };
}



