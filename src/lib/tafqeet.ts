/**
 * Converts a number into Arabic words (Tafqeet) for Iraqi Dinars / Receipts
 */
export function numberToArabicWords(n: number): string {
  if (isNaN(n) || n === 0) return 'صفر دينار';

  const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertGroup(num: number): string {
    if (num === 0) return '';
    let result = '';

    const h = Math.floor(num / 100);
    const r = num % 100;
    const t = Math.floor(r / 10);
    const u = r % 10;

    if (h > 0) {
      result += hundreds[h];
    }

    if (r > 0) {
      if (result.length > 0) result += ' و';
      if (r >= 10 && r < 20) {
        result += teens[r - 10];
      } else {
        if (u > 0) {
          result += units[u];
          if (t > 0) result += ' و';
        }
        if (t > 0) {
          result += tens[t];
        }
      }
    }

    return result;
  }

  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const remainder = Math.floor(n % 1000);

  const parts: string[] = [];

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(`${convertGroup(millions)} ملايين`);
    else parts.push(`${convertGroup(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertGroup(thousands)} آلاف`);
    else parts.push(`${convertGroup(thousands)} ألف`);
  }

  if (remainder > 0) {
    parts.push(convertGroup(remainder));
  }

  return parts.join(' و') + ' دينار';
}
