import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { quotationBrand, quotationDate, quotationMoney, type QuotationDocument } from "./quotation-document.shared";

// Document ink is intentionally fixed for printed quotations, independent of the app theme.
const ink = rgb(0.14, 0.17, 0.21), blue = rgb(0.12, 0.38, 0.68), rule = rgb(0.45, 0.49, 0.54), pale = rgb(0.94, 0.96, 0.98);
export async function renderQuotationPdf(data: QuotationDocument, logoBytes?: Uint8Array, kind: "quotation" | "invoice" = "quotation"): Promise<Uint8Array> {
  const inv = kind === "invoice";
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  let page = doc.addPage([595.28, 841.89]);
  const safe = (s: string) => s.replace(/[—–]/g, "-").replace(/•/g, "·").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  function text(value: string, x: number, top: number, size = 9, strong = false) {
    page.drawText(safe(value), { x, y: 841.89 - top - size, size, font: strong ? bold : regular, color: ink });
  }
  function wrap(value: string, width: number, size = 9): string[] {
    const result: string[] = [];
    for (const paragraph of value.split(/\r?\n/)) {
      let line = "";
      for (const word of safe(paragraph).split(/\s+/)) {
        if (regular.widthOfTextAtSize(`${line} ${word}`.trim(), size) > width && line) { result.push(line); line = ""; }
        // Split long codes/URLs rather than allowing them to cross table columns.
        for (const letter of word) {
          if (regular.widthOfTextAtSize(line + letter, size) > width) { result.push(line); line = ""; }
          line += letter;
        }
        line += " ";
      }
      result.push(line.trimEnd());
    }
    return result;
  }
  function box(x: number, top: number, width: number, height: number, title: string) {
    page.drawRectangle({ x, y: 841.89 - top - height, width, height, borderColor: rule, borderWidth: 0.6 });
    page.drawRectangle({ x: x + 0.3, y: 841.89 - top - 22, width: width - 0.6, height: 21.7, color: pale });
    text(title, x + (width - bold.widthOfTextAtSize(title, 9)) / 2, top + 6, 9, true);
  }
  function block(value: string, x: number, top: number, width: number, size = 9) {
    const rows = wrap(value, width, size); rows.forEach((row, i) => text(row, x, top + i * (size + 4), size));
    return rows.length * (size + 4);
  }
  function header(continuation = false) {
    if (logo) { const dims = logo.scaleToFit(155, 52); page.drawImage(logo, { x: 32, y: 841.89 - 28 - dims.height, width: dims.width, height: dims.height }); }
    else text(quotationBrand.name, 32, 30, 22, true);
    page.drawText(inv ? "INVOICE" : "QUOTATION", { x: 420, y: 798, font: bold, size: 18, color: blue });
    text(data.reference, 420, 49, 10, true);
    text(continuation ? `${data.title} (continued)` : data.title, 32, 88, 11, true);
  }
  function tableHeader(top: number) {
    page.drawRectangle({ x: 32, y: 841.89 - top - 23, width: 531, height: 23, color: pale, borderColor: rule, borderWidth: 0.6 });
    [["Item code", 38], ["Description", 104], ["Qty", 360], ["Unit price", 391], ["VAT %", 455], ["Line total", 502]].forEach(([value, x]) => text(String(value), Number(x), top + 7, 8, true));
  }
  header();
  const customerHeight = Math.max(100, 38 + wrap([data.customer.name, data.customer.address, data.customer.email, data.customer.phone].filter(Boolean).join("\n"), 240).length * 13);
  box(32, 112, 263, 96, inv ? "From" : "Quote From");
  text(quotationBrand.name, 42, 143, 10, true);
  block(`${quotationBrand.website}\n${quotationBrand.email}\n${quotationBrand.phone}`, 42, 161, 240, 8);
  box(300, 112, 263, 96, inv ? "Invoice Details" : "Quotation Details");
  [[inv ? "Invoice date" : "Quote date", quotationDate(data.date)], [inv ? "Due date" : "Valid until", quotationDate(data.validUntil)], ["Currency", data.currency]].forEach(([label, value], i) => { text(label, 310, 144 + i * 17, 8, true); text(value, 409, 144 + i * 17, 8); });
  box(32, 213, 263, customerHeight, inv ? "Bill To" : "Quote To");
  block([data.customer.name, data.customer.address, data.customer.email, data.customer.phone].filter(Boolean).join("\n"), 42, 246, 240);
  box(300, 213, 263, customerHeight, "Deliver To");
  block([data.customer.name, data.customer.address].filter(Boolean).join("\n"), 310, 246, 240);
  let y = 213 + customerHeight + 14;
  [["Account No", data.customer.account, 32, 100], [inv ? "Invoice Date" : "Quote Date", quotationDate(data.date), 140, 88], ["Representative", data.representative, 236, 185], [inv ? "Invoice Number" : "Quote Number", data.reference, 433, 130]].forEach(([label, value, x, width]) => { text(String(label), Number(x), y, 8, true); block(String(value), Number(x), y + 15, Number(width), 8); });
  y += 51; tableHeader(y); y += 23;
  for (const [index, item] of data.items.entries()) {
    const desc = wrap(item.description, 247, 8), code = wrap(item.code, 59, 7);
    const height = Math.max(24, Math.max(desc.length, code.length) * 12 + 12);
    if (y + height > 735) { page = doc.addPage([595.28, 841.89]); header(true); y = 116; tableHeader(y); y += 23; }
    if (index % 2 === 1) page.drawRectangle({ x: 32, y: 841.89 - y - height, width: 531, height, color: pale });
    code.forEach((row, i) => text(row, 38, y + 8 + i * 12, 7));
    desc.forEach((row, i) => text(row, 104, y + 8 + i * 12, 8));
    [String(item.quantity), quotationMoney(item.price), `${item.taxRate}%`, quotationMoney(item.total)].forEach((value, i) => {
      const right = [381, 448, 492, 557][i]; text(value, right - regular.widthOfTextAtSize(value, 8), y + 8, 8);
    });
    page.drawLine({ start: { x: 32, y: 841.89 - y - height }, end: { x: 563, y: 841.89 - y - height }, thickness: 0.3, color: rule });
    y += height;
  }
  const notes = [data.validUntil ? `${inv ? "Due by" : "Valid until"} ${quotationDate(data.validUntil)}` : "", data.notes].filter(Boolean).join("\n");
  const noteRows = wrap(notes || "—", 235, 8);
  const summaryHeight = Math.max(110, noteRows.length * 12 + 39);
  if (y + summaryHeight + 28 > 751) { page = doc.addPage([595.28, 841.89]); header(true); y = 116; }
  y += 22;
  box(32, y, 258, summaryHeight, "Notes & Terms");
  noteRows.forEach((row, i) => text(row, 42, y + 31 + i * 12, 8));
  box(299, y, 70, summaryHeight, "Items"); text(String(data.items.length), 325, y + 46, 16, true);
  box(378, y, 185, summaryHeight, inv ? "Invoice Total" : "Quotation Total");
  [["Subtotal (excl.)", data.subtotal], ["Discount", data.discount], ["VAT", data.tax], [`Total (${data.currency})`, data.total]].forEach(([label, value], i) => { text(String(label), 388, y + 30 + i * 18, 8, i === 3); const amount = quotationMoney(Number(value)); text(amount, 553 - (i === 3 ? bold : regular).widthOfTextAtSize(amount, 9), y + 30 + i * 18, 9, i === 3); });
  const pages = doc.getPages();
  pages.forEach((p, i) => { page = p; page.drawLine({ start: { x: 32, y: 55 }, end: { x: 563, y: 55 }, thickness: 0.6, color: blue }); text(`${quotationBrand.name}  |  ${quotationBrand.website}  |  ${quotationBrand.email}`, 32, 798, 8); text(`${i + 1} of ${pages.length}`, 525, 798, 8); });
  doc.setTitle(`${data.reference} — ${data.title}`); doc.setAuthor(quotationBrand.name);
  return doc.save();
}