import { jsPDF } from 'jspdf';
import type { AppSettings, Quote } from '@/types';
import { formatDate } from '@/lib/format';

type RGB = [number, number, number];

const NAVY: RGB = [10, 37, 64];
const NAVY_700: RGB = [18, 60, 104];
const NAVY_50: RGB = [243, 247, 251];
const GOLD: RGB = [201, 162, 39];
const GOLD_300: RGB = [231, 206, 132];
const SLATE: RGB = [100, 116, 139];
const SLATE_LIGHT: RGB = [148, 163, 184];
const LINE: RGB = [230, 235, 242];
const WHITE: RGB = [255, 255, 255];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  refused: 'Refusé',
  expired: 'Expiré',
};

const MARGIN = 16;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Keeps the built-in PDF fonts happy with French typography. */
function clean(value?: string | null): string {
  return String(value ?? '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u202F\u00A0]/g, ' ')
    .replace(/\u20AC/g, 'EUR');
}

export function generateQuotePdf(quote: Quote, settings: AppSettings): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const company = settings.company || { name: 'Copil' };
  const currency = settings.currency || 'MAD';
  const items = quote.items || [];
  const totals = quote.totals;
  const number = clean(quote.number);

  const money = (value: number) => `${(Number(value) || 0)
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202F\u00A0]/g, ' ')} ${currency}`;

  const drawFirstHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_WIDTH, 50, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 50, PAGE_WIDTH, 1.4, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(MARGIN, 13.5, 1.5, 18, 'F');

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(clean(company.name || 'Copil'), MARGIN + 5.5, 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_300);
    doc.text(clean(company.tagline || "Conseil & pilotage d'activité"), MARGIN + 5.5, 27);

    doc.setTextColor(196, 214, 230);
    doc.setFontSize(7.1);
    const identity = [company.address, company.city].filter(Boolean).map(clean).join(' · ');
    const contact = [company.phone, company.email].filter(Boolean).map(clean).join('  ·  ');
    if (identity) doc.text(identity, MARGIN, 33.5);
    if (contact) doc.text(contact, MARGIN, 37.8);
    const legal = [
      company.ice ? `ICE ${clean(company.ice)}` : '',
      company.rc ? `RC ${clean(company.rc)}` : '',
      company.if ? `IF ${clean(company.if)}` : '',
    ].filter(Boolean).join('   ·   ');
    if (legal) doc.text(legal, MARGIN, 42.1);

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(23);
    doc.text('DEVIS', PAGE_WIDTH - MARGIN, 20, { align: 'right' });

    doc.setFontSize(9.5);
    doc.setTextColor(...GOLD_300);
    doc.text(number, PAGE_WIDTH - MARGIN, 27.5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(196, 214, 230);
    doc.text(`Émis le ${formatDate(quote.issue_date, 'long')}`, PAGE_WIDTH - MARGIN, 34, { align: 'right' });

    const status = STATUS_LABEL[quote.effective_status || quote.status] || 'Devis';
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.25);
    doc.roundedRect(PAGE_WIDTH - MARGIN - 30, 38.2, 30, 6.4, 3.2, 3.2, 'S');
    doc.setFontSize(7.2);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GOLD_300);
    doc.text(clean(status).toUpperCase(), PAGE_WIDTH - MARGIN - 15, 42.3, { align: 'center' });
  };

  const drawContinuationHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PAGE_WIDTH, 21, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 21, PAGE_WIDTH, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(clean(company.name || 'Copil'), MARGIN, 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...GOLD_300);
    doc.text(`Devis ${number}`, MARGIN, 14.5);
    doc.setTextColor(196, 214, 230);
    doc.text('Suite de la proposition commerciale', MARGIN, 18.4);
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DEVIS', PAGE_WIDTH - MARGIN, 13, { align: 'right' });
  };

  drawFirstHeader();

  /* --------------------------------- Emitter -------------------------------- */

  let y = 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('ÉMETTEUR', MARGIN, y);

  y += 5.5;
  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  doc.text(clean(company.name || 'Copil'), MARGIN, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  const emitterLines = [
    company.address,
    company.city,
    company.phone,
    company.email,
    company.website,
  ].filter(Boolean).map((value) => clean(value)) as string[];
  for (const line of emitterLines) {
    doc.text(line, MARGIN, y);
    y += 3.6;
  }

  /* --------------------------------- Client --------------------------------- */

  const boxWidth = 82;
  const boxX = PAGE_WIDTH - MARGIN - boxWidth;
  const boxY = 58;
  const boxHeight = 44;

  doc.setFillColor(...NAVY_50);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 2, 2, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(boxX, boxY + 3, 1.1, boxHeight - 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...GOLD);
  doc.text('CLIENT', boxX + 6, boxY + 7.5);

  doc.setFontSize(10.5);
  doc.setTextColor(...NAVY);
  const clientName = quote.client_company || quote.prospect_name || quote.client_name || 'Prospect';
  const nameLines = doc.splitTextToSize(clean(clientName), boxWidth - 12).slice(0, 2) as string[];
  let cy = boxY + 13.5;
  for (const line of nameLines) {
    doc.text(line, boxX + 6, cy);
    cy += 4.6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...SLATE);
  const contactName = quote.client_name && quote.client_name !== clientName ? clean(quote.client_name) : '';
  const clientLines = [
    contactName,
    quote.client_address,
    quote.client_city,
    quote.client_email,
    quote.client_phone,
  ].filter(Boolean).map((value) => clean(value as string)) as string[];
  for (const line of clientLines.slice(0, 5)) {
    if (cy > boxY + boxHeight - 3) break;
    doc.text(line, boxX + 6, cy);
    cy += 3.7;
  }

  /* ---------------------------------- Meta ---------------------------------- */

  y = 106;
  const meta = [
    { label: "DATE D'ÉMISSION", value: formatDate(quote.issue_date, 'long') },
    { label: 'VALABLE JUSQU’AU', value: quote.valid_until ? formatDate(quote.valid_until, 'long') : '—' },
    { label: 'RÈGLEMENT', value: quote.payment_terms || settings.quote?.payment_terms || 'À réception' },
  ];
  let mx = MARGIN;
  for (const entry of meta) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...SLATE_LIGHT);
    doc.text(entry.label, mx, y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.3);
    doc.setTextColor(...NAVY);
    const valueLines = doc.splitTextToSize(clean(entry.value), 48).slice(0, 1) as string[];
    doc.text(valueLines[0] || '—', mx, y + 4.6);
    mx += 60;
  }

  /* ---------------------------------- Table --------------------------------- */

  const cols = {
    designation: 82,
    qty: 14,
    unit: 28,
    discount: 20,
    total: CONTENT_WIDTH - 82 - 14 - 28 - 20,
  };
  const xDesignation = MARGIN;
  const xQty = xDesignation + cols.designation;
  const xUnit = xQty + cols.qty;
  const xDiscount = xUnit + cols.unit;
  const xTotal = xDiscount + cols.discount;

  const drawTableHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    doc.setTextColor(...WHITE);
    const baseline = y + 5.9;
    doc.text('DÉSIGNATION', xDesignation + 4, baseline);
    doc.text('QTÉ', xQty + cols.qty - 3, baseline, { align: 'right' });
    doc.text('P.U. HT', xUnit + cols.unit - 3, baseline, { align: 'right' });
    doc.text('REMISE', xDiscount + cols.discount - 3, baseline, { align: 'right' });
    doc.text('TOTAL HT', xTotal + cols.total - 3, baseline, { align: 'right' });
    y += 9;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed <= 262) return;
    doc.addPage();
    drawContinuationHeader();
    y = 29;
    drawTableHeader();
  };

  y = 118;
  drawTableHeader();

  if (!items.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text('Aucune prestation renseignée.', MARGIN + 4, y + 8);
    y += 14;
  }

  items.forEach((item, index) => {
    const designation = clean(item.designation);
    const description = item.description ? clean(item.description) : '';
    const descriptionLines = description ? doc.splitTextToSize(description, cols.designation - 8) as string[] : [];
    const rowHeight = 7.5 + descriptionLines.length * 3.4 + 2.4;
    ensureSpace(rowHeight + 1);

    if (index % 2 === 0) {
      doc.setFillColor(249, 251, 253);
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(designation, cols.designation - 8)[0] || '—', xDesignation + 4, y + 5.6);

    if (descriptionLines.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      let dy = y + 9.3;
      for (const line of descriptionLines) {
        doc.text(line, xDesignation + 4, dy);
        dy += 3.2;
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(String(item.qty), xQty + cols.qty - 3, y + 5.8, { align: 'right' });
    doc.text(money(item.unitPrice), xUnit + cols.unit - 3, y + 5.8, { align: 'right' });
    doc.text(item.discount ? `${item.discount} %` : '—', xDiscount + cols.discount - 3, y + 5.8, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY_700);
    doc.text(money(item.lineTotal ?? item.qty * item.unitPrice), xTotal + cols.total - 3, y + 5.8, { align: 'right' });

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y + rowHeight, MARGIN + CONTENT_WIDTH, y + rowHeight);
    y += rowHeight;
  });

  /* --------------------------------- Totals --------------------------------- */

  y += 6;
  if (y + 52 > 268) {
    doc.addPage();
    drawContinuationHeader();
    y = 32;
  }

  const totalsWidth = 76;
  const totalsX = MARGIN + CONTENT_WIDTH - totalsWidth;
  const textLeft = totalsX;
  const textRight = MARGIN + CONTENT_WIDTH;

  const totalRow = (label: string, value: string, options: { bold?: boolean; color?: RGB } = {}) => {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.bold ? 8.5 : 8);
    doc.setTextColor(...(options.color || SLATE));
    doc.text(clean(label), textLeft, y);
    doc.setTextColor(...(options.color ? options.color : NAVY));
    doc.text(value, textRight, y, { align: 'right' });
    y += 5.4;
  };

  totalRow('Sous-total HT', money(totals.subtotal));
  if (totals.discountTotal > 0) {
    totalRow('Remise commerciale', `- ${money(totals.discountTotal)}`, { color: [16, 122, 87] });
  }
  totalRow('Base HT', money(totals.base), { bold: true });
  totalRow(`TVA ${totals.taxRate} %`, money(totals.tax));

  y += 1.6;
  doc.setFillColor(...NAVY);
  doc.roundedRect(totalsX, y, totalsWidth, 12, 1.8, 1.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...WHITE);
  doc.text('TOTAL TTC', totalsX + 5, y + 7.6);
  doc.setFontSize(11);
  doc.setTextColor(...GOLD_300);
  doc.text(money(totals.total), textRight - 5, y + 7.8, { align: 'right' });
  y += 12;

  /* ------------------------------ Notes & Terms ----------------------------- */

  y += 8;
  const notesWidth = CONTENT_WIDTH;
  const notes: Array<{ label: string; body: string }> = [];
  if (quote.notes) notes.push({ label: 'NOTES', body: clean(quote.notes) });
  if (quote.payment_terms) notes.push({ label: 'CONDITIONS DE RÈGLEMENT', body: clean(quote.payment_terms) });
  if (quote.delivery_days) notes.push({ label: 'DÉLAI DE LIVRAISON', body: clean(quote.delivery_days) });

  if (notes.length) {
    let blockHeight = 6;
    const prepared = notes.map((note) => {
      const lines = doc.splitTextToSize(note.body, notesWidth - 8) as string[];
      blockHeight += 4.5 + lines.length * 3.5;
      return { ...note, lines };
    });
    if (y + blockHeight > 268) {
      doc.addPage();
      drawContinuationHeader();
      y = 30;
    }

    doc.setFillColor(249, 251, 253);
    doc.roundedRect(MARGIN, y, notesWidth, blockHeight, 2, 2, 'F');
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN, y, notesWidth, blockHeight, 2, 2, 'S');

    let ny = y + 7;
    for (const note of prepared) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...GOLD);
      doc.text(note.label, MARGIN + 4, ny);
      ny += 4.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.6);
      doc.setTextColor(...SLATE);
      for (const line of note.lines) {
        doc.text(line, MARGIN + 4, ny);
        ny += 3.4;
      }
      ny += 1.5;
    }
    y += blockHeight + 6;
  }

  /* -------------------------------- Validation ------------------------------- */

  if (quote.author_name && y < 262) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...SLATE_LIGHT);
    doc.text(`Proposition préparée par ${clean(quote.author_name)}`, MARGIN, y + 2);
  }

  /* --------------------------------- Footers -------------------------------- */

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, 276, PAGE_WIDTH - MARGIN, 276);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(...SLATE_LIGHT);
    const footerLegal = [
      company.name,
      company.ice ? `ICE ${clean(company.ice)}` : '',
      company.rc ? `RC ${clean(company.rc)}` : '',
      company.if ? `IF ${clean(company.if)}` : '',
      company.cnss ? `CNSS ${clean(company.cnss)}` : '',
    ].filter(Boolean).map(clean).join(' · ');
    doc.text(footerLegal || 'Document généré par Copil', MARGIN, 280.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(`Devis ${number}`, MARGIN, 284.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...SLATE_LIGHT);
    doc.text(`Page ${page} / ${pageCount}`, PAGE_WIDTH - MARGIN, 284.8, { align: 'right' });

    if (company.bank && page === pageCount) {
      doc.setFontSize(6.4);
      doc.text(`Coordonnées bancaires : ${clean(company.bank)}`, MARGIN, 289);
    }
  }

  return doc;
}

export function downloadQuotePdf(quote: Quote, settings: AppSettings) {
  const doc = generateQuotePdf(quote, settings);
  doc.save(`Devis-${quote.number || 'Copil'}.pdf`);
}
