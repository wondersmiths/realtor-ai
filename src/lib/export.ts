import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Download a CSV file from the given headers and row data.
 */
export function exportCSV(
  headers: string[],
  rows: string[][],
  filename: string
): void {
  if (rows.length === 0) return;

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download a PDF file with a title and tabular data.
 */
export function exportPDF(
  title: string,
  headers: string[],
  rows: string[][],
  filename: string
): void {
  if (rows.length === 0) return;

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 34,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(filename);
}
