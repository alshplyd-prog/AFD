import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface ExcelSheetData {
  sheetName: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  colWidths?: number[];
}

/**
 * Universal Excel exporter supporting:
 * 1. Capacitor Native Android APK / iOS
 * 2. Mobile Web Share API with real .xlsx files
 * 3. Browser Blob Download
 * 4. Data URI Fallback
 * 5. Clipboard fallback if all file system write operations fail
 */
export async function exportToExcelFile({
  filename,
  sheets,
  title,
  text,
}: {
  filename: string;
  sheets: ExcelSheetData[];
  title?: string;
  text?: string;
}): Promise<{ success: boolean; method: string; error?: string }> {
  try {
    // 1. Create XLSX Workbook
    const wb = XLSX.utils.book_new();

    sheets.forEach((sheet) => {
      const sheetData = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);

      // Enable Right-to-Left (RTL) for Arabic sheets across all spreadsheet applications
      ws['!views'] = [{ rightToLeft: true, RTL: true }];
      (ws as any)['!sheetPr'] = { rightToLeft: true, RTL: true };

      // Set column widths if provided or calculate auto widths
      if (sheet.colWidths && sheet.colWidths.length > 0) {
        ws['!cols'] = sheet.colWidths.map((w) => ({ wch: Math.max(w, 10) }));
      } else {
        // Auto-calculate generous column widths
        const maxCols = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length));
        const colWidths: { wch: number }[] = [];
        for (let colIdx = 0; colIdx < maxCols; colIdx++) {
          let maxLen = (sheet.headers[colIdx] || '').toString().length;
          sheet.rows.forEach((row) => {
            const val = row[colIdx];
            if (val !== undefined && val !== null) {
              const len = val.toString().length;
              if (len > maxLen) maxLen = len;
            }
          });
          colWidths.push({ wch: Math.max(maxLen + 4, 14) });
        }
        ws['!cols'] = colWidths;
      }

      XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName || 'Sheet1');
    });

    // Configure Workbook level RTL
    (wb as any).Workbook = (wb as any).Workbook || {};
    (wb as any).Workbook.Views = [{ RTL: true }];

    const cleanFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;

    // 2. Generate Base64 and Binary Array
    const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([arrayBuffer], { type: mimeType });

    // 3. CAPACITOR NATIVE (Android APK / iOS)
    if (Capacitor.isNativePlatform()) {
      try {
        // Write file strictly to temporary Cache directory (auto-purged, not saved to persistent user storage)
        const writeResult = await Filesystem.writeFile({
          path: cleanFilename,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });

        const fileUri = writeResult.uri || (await Filesystem.getUri({
          path: cleanFilename,
          directory: Directory.Cache,
        })).uri;

        // Share Excel file directly to native share chooser (WhatsApp, Telegram, Excel, Drive, etc.)
        if (await Share.canShare().then((res) => res.value).catch(() => true)) {
          await Share.share({
            title: title || cleanFilename,
            text: text || 'ملف كشف الحسابات (Excel)',
            files: [fileUri],
            dialogTitle: title || 'مشاركة كشف Excel',
          });
          return { success: true, method: 'capacitor_share' };
        }
      } catch (capErr: any) {
        console.warn('Capacitor Filesystem/Share error:', capErr);
        if (capErr?.name === 'AbortError' || capErr?.message?.includes('cancel')) {
          return { success: true, method: 'user_cancelled' };
        }
      }
    }

    // 4. Web Share API with File object (Modern Mobile Web / Android Chrome)
    if (typeof navigator !== 'undefined' && navigator.share && typeof File !== 'undefined') {
      try {
        const file = new File([blob], cleanFilename, { type: mimeType });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: title || cleanFilename,
            text: text || 'كشف الحساب وسجل الحركات (Excel)',
          });
          return { success: true, method: 'navigator_share_file' };
        }
      } catch (shareErr: any) {
        if (shareErr?.name === 'AbortError' || shareErr?.message?.includes('cancel')) {
          return { success: true, method: 'user_cancelled' };
        }
        console.warn('Navigator share file failed:', shareErr);
      }
    }

    // 5. Clipboard Fallback
    try {
      const tsvContent = sheets
        .map((s) => [`--- ${s.sheetName} ---`, s.headers.join('\t'), ...s.rows.map((r) => r.join('\t'))].join('\n'))
        .join('\n\n');
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsvContent);
        return { success: true, method: 'clipboard_copy' };
      }
    } catch (clipErr) {
      console.warn('Clipboard writeText unavailable or permission denied, using Blob URL fallback:', clipErr);
    }

    // 6. Blob URL fallback (For desktop web or iframe where clipboard permission is restricted)
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = cleanFilename;
      link.target = '_blank';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 2000);
      return { success: true, method: 'blob_download' };
    } catch (blobErr) {
      console.warn('Blob URL fallback failed:', blobErr);
    }

    return { success: false, method: 'none', error: 'جميع طرق التصدير والمشاركة غير مدعومة على هذا المتصفح' };
  } catch (err: any) {
    console.error('Export to Excel error:', err);
    return { success: false, method: 'error', error: err?.message || 'فشل التصدير' };
  }
}
