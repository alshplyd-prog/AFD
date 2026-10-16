/**
 * Returns a date string formatted as YYYY-MM-DD in Iraq timezone (Asia/Baghdad).
 * Prevents UTC offset shifts.
 */
export function getLocalDateString(input?: Date | string | number): string {
  if (!input) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
}

/**
 * Formats a date in Iraq time (Asia/Baghdad).
 */
export function formatIraqDate(input?: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ar-IQ', { timeZone: 'Asia/Baghdad', ...options });
}

/**
 * Formats date and time in Iraq time (Asia/Baghdad).
 */
export function formatIraqDateTime(input?: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const d = input ? (input instanceof Date ? input : new Date(input)) : new Date();
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...options });
}

/**
 * Checks if a customer/contract has remaining balance of 0 (or status is completed)
 * and at least 24 hours (1 calendar day) have passed since that date.
 */
export function isZeroBalanceExpired24h(contract: {
  id?: string;
  remainingBalance?: number;
  status?: string;
  lastPaymentDate?: string;
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
  lastPaymentDate?: string;
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
    const storageKey = `zero_balance_completed_at_${contract.id || contract.lastPaymentDate || 'unknown'}`;
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
    lastPaymentDate?: string;
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

export function playNotificationSound() {
  try {
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

export function showBrowserNotification(title: string, body: string) {
  try {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            new Notification(title, { body });
          }
        });
      }
    }
  } catch (e) {
    // Ignore
  }
}
