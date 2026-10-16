/**
 * Helper utilities for PIN code normalization and verification.
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic / Persian (۰-۹) digits
 * to standard ASCII digits (0-9), trims whitespace, and removes unwanted characters.
 */
export function normalizePin(pin: any): string {
  if (pin === null || pin === undefined) return '';
  const str = String(pin).trim();
  return str
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/\s+/g, '');
}

/**
 * Validates whether entered PIN matches any of the candidate PINs.
 */
export function isPinMatching(enteredPin: string, candidatePin?: string | null, fallbackDefaults: string[] = ['1234', '0000']): boolean {
  const normEntered = normalizePin(enteredPin);
  if (!normEntered) return false;

  if (candidatePin) {
    const normCandidate = normalizePin(candidatePin);
    if (normCandidate && normEntered === normCandidate) {
      return true;
    }
  }

  // If candidate is unset or empty, check defaults
  if (!candidatePin || !normalizePin(candidatePin)) {
    return fallbackDefaults.some((def) => normEntered === normalizePin(def));
  }

  return false;
}
