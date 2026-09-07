import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { Response } from 'express';

// AC-010-005-01/03: MVP supports CSV and XLSX, both stamped with generation time and period.
export function sendCsv(res: Response, filename: string, rows: Record<string, unknown>[]) {
  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
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
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
}
