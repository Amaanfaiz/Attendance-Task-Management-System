import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { Response } from 'express';

// AC-010-005-01/03: MVP supports CSV and XLSX, both stamped with generation time and
// period. CSV previously had no title/period/generated-time metadata at all - only the
// XLSX path stamped it (found via live AC testing: a downloaded CSV was pure data with
// no way to tell, once saved to disk, what date range or report it came from). Uses the
// same `# comment line` convention most spreadsheet tools skip/tolerate above a CSV's
// real header row, so this doesn't break straightforward CSV parsing of the data itself.
export function sendCsv(
  res: Response,
  filename: string,
  rows: Record<string, unknown>[],
  meta: { title: string; periodFrom: string; periodTo: string },
) {
  const metaLines = [
    `# ${meta.title}`,
    `# Period: ${meta.periodFrom} to ${meta.periodTo}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ].join('\n');
  const csv = metaLines + stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}.csv"`,
  );
  res.send(csv);
}

export async function sendXlsx(
  res: Response,
  filename: string,
  rows: Record<string, unknown>[],
  meta: { title: string; periodFrom: string; periodTo: string },
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(meta.title.slice(0, 31));

  sheet.addRow([meta.title]).font = { bold: true, size: 14 };
  sheet.addRow([`Period: ${meta.periodFrom} to ${meta.periodTo}`]);
  sheet.addRow([`Generated: ${new Date().toISOString()}`]);
  sheet.addRow([]);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    for (const row of rows) {
      sheet.addRow(headers.map((h) => row[h] as never));
    }
    sheet.columns.forEach((col) => {
      col.width = 20;
    });
  }

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}.xlsx"`,
  );
  await workbook.xlsx.write(res);
}
