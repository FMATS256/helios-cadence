import { PDFDocument, PDFRawStream, PDFRef, decodePDFRawStream, StandardFonts, rgb } from "pdf-lib";
import { quoteStudio, type StudioActor } from "./quote-studio.server";
import { IMT_ADDRESS, INVOICE_TERMS, initialsOf, invoiceSettlement, invoiceStudioPayload } from "./invoice-document.shared";

/** Who the invoice is sold by — always the customer's account manager. */
export type InvoiceRep = { name: string; code?: string };

/** Keep the API's actual document, logo, boxes, bank details and QR image intact.
 * The engine fixes its invoice heading and recalculates taxes; replace only text
 * operators for the local payment label and saved amounts, never repaint the page.
 */
export async function officialInvoicePdf(invoice: any, lines: any[], customer: any, allocations: Array<{ amount: unknown }>, actor?: StudioActor, rep?: InvoiceRep) {
  const settlement = invoiceSettlement(invoice, allocations);
  const repName = rep?.name || actor?.userName || "IMT Solutions";
  const result = await quoteStudio.renderPdf(invoiceStudioPayload(invoice, lines, customer, repName), actor);
  if (!result.ok) throw new Error(result.error);
  return { ...settlement, bytes: await applyInvoiceValues(result.data.bytes, invoice, lines, settlement, { name: repName, code: rep?.code ?? initialsOf(repName) }) };
}

const BLANK = "<> Tj";

export async function applyInvoiceValues(bytes: Uint8Array, invoice: any, lines: any[], settlement: ReturnType<typeof invoiceSettlement>, rep?: InvoiceRep) {
  const doc = await PDFDocument.load(bytes);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const hex = (value: string) => Array.from(value).map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
  const money = (value: unknown) => Number(value || 0).toFixed(2);
  let headings = 0;
  let itemIndex = 0;
  let firstPage: ReturnType<PDFDocument["getPages"]>[number] | undefined;
  for (const page of doc.getPages()) {
    firstPage ??= page;
    const contents = page.node.Contents();
    if (!contents) throw new Error("Quote Studio invoice layout has no content");
    const refs = "size" in contents ? Array.from({ length: contents.size() }, (_, i) => contents.get(i)) : [contents];
    for (const ref of refs) {
      if (!(ref instanceof PDFRef)) throw new Error("Quote Studio invoice content reference changed");
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      let source = new TextDecoder().decode(decodePDFRawStream(stream).decode());
      source = source.replace(/q\s+BT\b[\s\S]*?ET\s+Q/g, (block) => {
        const value = block.match(/<([0-9A-F]+)> Tj/);
        const matrix = block.match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
        const font = block.match(/\/([^\s]+) ([\d.]+) Tf/);
        if (!value || !matrix || !font) return block;
        const text = value[1].replace(/../g, h => String.fromCharCode(parseInt(h, 16)));
        const x = Number(matrix[1]), y = Number(matrix[2]), size = Number(font[2]);
        let replacement: string | undefined;
        let newX = x;
        if (text === "SALES INVOICE") {
          headings++;
          if (!settlement.settled) { replacement = "INVOICE"; newX = x + (bold.widthOfTextAtSize(text, size) - bold.widthOfTextAtSize(replacement, size)) / 2; }
        } else if (text.startsWith("Account Balance:")) {
          replacement = `Account Balance:  ${money(settlement.balance)}`;
          newX = x + (regular.widthOfTextAtSize(text, size) - regular.widthOfTextAtSize(replacement, size)) / 2;
        }
        // Registered IMT address on the company block.
        else if (text === "49 Agtets Avenue, George Silundika") replacement = IMT_ADDRESS;
        // Customer box: no account number, no VAT line.
        else if (text.startsWith("Account No:")) replacement = "";
        else if (text.trim() === "Vat:" || text.trim() === "Vat") replacement = "";
        // VAT removed entirely: no excl-Vat / tax rows, no per-line VAT.
        else if (text === "Amount Excl Vat" || text === "Tax Total") replacement = "";
        else if (x > 500 && Math.abs(y - 182) < 0.1) replacement = "";
        else if (x > 500 && Math.abs(y - 166) < 0.1) replacement = "";
        else if (x > 440 && x < 500 && y > 220 && y < 470 && /%$/.test(text)) replacement = "";
        // The unused Tax Reference box becomes the Sales Rep box.
        else if (text === "Tax Reference") replacement = "Sales Rep";
        // Real IMT terms in the small terms space above the bank details.
        else if (x < 60 && Math.abs(y - 196) < 0.5) replacement = INVOICE_TERMS[0];
        else if (x < 60 && Math.abs(y - 185) < 0.5) replacement = INVOICE_TERMS[1];
        else if (x < 60 && Math.abs(y - 174) < 0.5) replacement = INVOICE_TERMS[2];
        // Saved amounts: subtotal and invoice total only (VAT rows are gone).
        else if (x > 500 && Math.abs(y - 198) < 0.1) replacement = money(invoice.subtotal ?? invoice.total);
        else if (x > 500 && Math.abs(y - 150) < 0.1) replacement = money(invoice.total);
        else if (x > 500 && y > 220 && y < 470 && /^\d+[,.]\d{2}$/.test(text)) {
          const line = lines[itemIndex++];
          if (line) replacement = money(Number(line.line_total ?? Number(line.quantity) * Number(line.unit_price)) * (1 + Number(line.tax_rate || 0) / 100));
        }
        if (replacement === undefined) return block;
        if (replacement === "") return block.replace(value[0], BLANK);
        if (newX === x && x > 500) newX = x + regular.widthOfTextAtSize(text, size) - regular.widthOfTextAtSize(replacement, size);
        return block.replace(value[0], `<${hex(replacement)}> Tj`).replace(matrix[0], `1 0 0 1 ${newX} ${y} Tm`);
      });
      const updated = doc.context.flateStream(source);
      doc.context.assign(ref, updated);
    }
  }
  if (!headings) throw new Error("Quote Studio invoice layout changed. Invoice could not be safely labelled.");
  // The engine leaves the Sales Rep / Sales Code values blank; write the
  // account manager's name and initials into those boxes on page one.
  if (rep?.name && firstPage) {
    const ink = rgb(0.09, 0.09, 0.11);
    firstPage.drawText(rep.name, { x: 248.9, y: 483.7, size: 8.5, font: regular, color: ink });
    if (rep.code) firstPage.drawText(rep.code, { x: 322.7, y: 483.7, size: 8.5, font: regular, color: ink });
  }
  doc.setTitle(`${settlement.settled ? "Sales Invoice" : "Invoice"} ${invoice.invoice_number}`);
  return doc.save();
}

export function invoicePdfResponse(bytes: Uint8Array, invoiceNumber: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { filename: `${invoiceNumber}.pdf`.replace(/[^\w.-]+/g, "-"), base64: btoa(binary) };
}
