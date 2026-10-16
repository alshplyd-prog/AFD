/**
 * Advanced Search & Arabic Normalization Utilities
 * Gives strict priority to name prefix matches (e.g. "علي حسين" before "حسين علي" when searching "علي")
 * and matches instantly from the very first typed character.
 */

/**
 * Normalizes Arabic text by unifying different forms of alef, yaa, taa marbuta,
 * removing diacritics (tashkeel), tatweel (kashida), and excess whitespaces.
 */
export function normalizeArabicText(text: string | null | undefined): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    // Remove diacritics (Tashkeel: Fatha, Damma, Kasra, Tanween, Shadda, Sukun, etc.)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel / Kashida
    .replace(/\u0640/g, '')
    // Unify Alef variations: أ, إ, آ, ٱ -> ا
    .replace(/[أإآٱ]/g, 'ا')
    // Unify Yaa / Alef Maqsura: ى, ي -> ي
    .replace(/[ىي]/g, 'ي')
    // Unify Taa Marbuta / Haa: ة, ه -> ه
    .replace(/[ةه]/g, 'ه')
    // Unify Waw with Hamza: ؤ -> و
    .replace(/ؤ/g, 'و')
    // Unify Nabrah / Hamza: ئ, ء -> ي
    .replace(/[ئء]/g, 'ي')
    // Collapse multiple whitespaces
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes phone numbers (removes spaces, dashes, country code prefix if needed)
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/[\s\-\+\(\)]/g, '');
}

export interface SearchScoreResult<T> {
  item: T;
  score: number;
}

/**
 * Calculates priority relevance score for customer contract search:
 * - Score > 0: matches query
 * - Higher score = displayed first
 * - First-name starting with query gets HIGHEST score (e.g. "علي حسين" > "حسين علي")
 */
export function calculateCustomerSearchScore(
  contract: {
    customerName?: string;
    customerPhone?: string;
    itemName?: string;
    customerAddress?: string;
    notes?: string;
    repName?: string;
  },
  rawQuery: string
): number {
  if (!rawQuery || !rawQuery.trim()) return 1;

  const normQ = normalizeArabicText(rawQuery);
  if (!normQ) return 1;

  const rawPhoneQ = normalizePhone(rawQuery);

  const normName = normalizeArabicText(contract.customerName);
  const normPhone = normalizePhone(contract.customerPhone);
  const normItem = normalizeArabicText(contract.itemName);
  const normAddress = normalizeArabicText(contract.customerAddress);
  const normNotes = normalizeArabicText(contract.notes);
  const normRep = normalizeArabicText(contract.repName);

  let score = 0;

  // 1. Customer Name Matching (Highest Priority)
  if (normName) {
    // 1.1 First-name prefix exact match (starts with query from the 1st character)
    // E.g. Query "علي" -> "علي حسين" or "ع" -> "علي"
    if (normName.startsWith(normQ)) {
      // Shorter name / closer match gets higher bonus
      const lengthPenalty = Math.min(normName.length, 50);
      return 10000 + (100 - lengthPenalty);
    }

    // 1.2 Words in full name starting with query
    // E.g. "حسين علي" where second word is "علي"
    const nameWords = normName.split(' ');
    for (let i = 1; i < nameWords.length; i++) {
      if (nameWords[i].startsWith(normQ)) {
        // Earlier word index gets higher priority
        const wordRankPenalty = i * 200;
        const lengthPenalty = Math.min(nameWords[i].length, 50);
        return 8000 - wordRankPenalty + (50 - lengthPenalty);
      }
    }

    // 1.3 Substring anywhere in customer name
    const nameSubIndex = normName.indexOf(normQ);
    if (nameSubIndex !== -1) {
      return 5000 - Math.min(nameSubIndex * 50, 1000);
    }
  }

  // 2. Phone Number Matching
  if (rawPhoneQ && normPhone) {
    if (normPhone.startsWith(rawPhoneQ)) {
      return 4500;
    }
    if (normPhone.includes(rawPhoneQ)) {
      return 3500;
    }
  }

  // 3. Item Name Matching
  if (normItem) {
    if (normItem.startsWith(normQ)) {
      return 2500;
    }
    if (normItem.includes(normQ)) {
      return 2000;
    }
  }

  // 4. Representative Name Matching
  if (normRep) {
    if (normRep.startsWith(normQ)) {
      return 1800;
    }
    if (normRep.includes(normQ)) {
      return 1500;
    }
  }

  // 5. Address / Notes Matching
  if (normAddress && normAddress.includes(normQ)) {
    score = Math.max(score, 1200);
  }
  if (normNotes && normNotes.includes(normQ)) {
    score = Math.max(score, 1000);
  }

  return score;
}

/**
 * Generic customer search filter & priority sorter
 */
export function filterAndSortByCustomerSearch<T extends {
  customerName?: string;
  customerPhone?: string;
  itemName?: string;
  customerAddress?: string;
  notes?: string;
  repName?: string;
}>(items: T[], rawQuery: string): T[] {
  if (!rawQuery || !rawQuery.trim()) {
    return items;
  }

  const scoredList: { item: T; score: number }[] = [];

  for (const item of items) {
    const score = calculateCustomerSearchScore(item, rawQuery);
    if (score > 0) {
      scoredList.push({ item, score });
    }
  }

  // Sort strictly descending by relevance score
  scoredList.sort((a, b) => b.score - a.score);

  return scoredList.map((entry) => entry.item);
}
