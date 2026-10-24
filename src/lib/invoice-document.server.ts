import { PDFDocument, PDFRawStream, decodePDFRawStream, StandardFonts } from "pdf-lib";
import { quoteStudio, type StudioActor } from "./quote-studio.server";
import { invoiceSettlement, invoiceStudioPayload } from "./invoice-document.shared";

/** Keep the API's actual document, logo, boxes, bank details and QR image intact.
 * The engine fixes its invoice heading and recalculates taxes; replace only text
 * operators for the local payment label and saved amounts, never repaint the page.
 */
export async function officialInvoicePdf(invoice: any, lines: any[], customer: any, allocations: Array<{ amount: unknown }>, actor?: StudioActor) {
  const settlement = invoiceSettlement(invoice, allocations);
  const result = await quoteStudio.renderPdf(invoiceStudioPayload(invoice, lines, customer, actor?.userName || "IMT Solutions"), actor);
  if (!result.ok) throw new Error(result.error);
  return { ...settlement, bytes: await applyInvoiceValues(result.data.bytes, invoice, lines, settlement) };
}

export async function applyInvoiceValues(bytes: Uint8Array, invoice: any, lines: any[], settlement: ReturnType<typeof invoiceSettlement>) {
  const doc = await PDFDocument.load(bytes);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const hex = (value: string) => Array.from(value).map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
  const money = (value: unknown) => Number(value || 0).toFixed(2);
  let headings = 0;
  let itemIndex = 0;
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) throw new Error("Quote Studio invoice layout has no content");
    const refs = "size" in contents ? Array.from({ length: contents.size() }, (_, i) => contents.get(i)) : [contents];
    for (const ref of refs) {
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
        } else if (x > 500 && Math.abs(y - 198) < 0.1) replacement = money(invoice.subtotal ?? invoice.total);
        else if (x > 500 && Math.abs(y - 182) < 0.1) replacement = money(invoice.subtotal ?? Number(invoice.total) - Number(invoice.tax || 0));
        else if (x > 500 && Math.abs(y - 166) < 0.1) replacement = money(invoice.tax);
        else if (x > 500 && Math.abs(y - 150) < 0.1) replacement = money(invoice.total);
        else if (x > 500 && y > 220 && y < 470 && /^\d+[,.]\d{2}$/.test(text)) {
          const line = lines[itemIndex++];
          if (line) replacement = money(Number(line.line_total ?? Number(line.quantity) * Number(line.unit_price)) * (1 + Number(line.tax_rate || 0) / 100));
        }
        if (replacement === undefined) return block;
        if (newX === x && x > 500) newX = x + regular.widthOfTextAtSize(text, size) - regular.widthOfTextAtSize(replacement, size);
        return block.replace(value[0], `<${hex(replacement)}> Tj`).replace(matrix[0], `1 0 0 1 ${newX} ${y} Tm`);
      });
      const updated = doc.context.flateStream(source);
      doc.context.assign(ref, updated);
    }
  }
  if (!headings) throw new Error("Quote Studio invoice layout changed. Invoice could not be safely labelled.");
  doc.setTitle(`${settlement.settled ? "Sales Invoice" : "Invoice"} ${invoice.invoice_number}`);
  return doc.save();
}

export function invoicePdfResponse(bytes: Uint8Array, invoiceNumber: string) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { filename: `${invoiceNumber}.pdf`.replace(/[^\w.-]+/g, "-"), base64: btoa(binary) };
}