import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { quotationBrand } from "./quotation-document.shared";
import { STATEMENT_MAILBOX, statementModel } from "./statement-document.shared";

/** Approved IMT statement hierarchy, with fine field and column dividers. */
export async function statementPdf(model: ReturnType<typeof statementModel>, manager: string, contact?: { email?: string | null; phone?: string | null; accountsPhone?: string | null }) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.122, 0.38, 0.682), ink = rgb(0.137, 0.169, 0.216), muted = rgb(0.467, 0.514, 0.576), ruleColor = rgb(0.863, 0.902, 0.945), pale = rgb(0.937, 0.957, 0.98), paper = rgb(1, 1, 1);
  const logoResponse = await fetch(quotationBrand.logoUrl);
  if (!logoResponse.ok) throw new Error("IMT statement logo is unavailable");
  const logo = await doc.embedPng(await logoResponse.arrayBuffer());
  let page = doc.addPage([595.28, 841.89]);
  const clean = (s: unknown) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "-");
  function text(x: number, y: number, value: unknown, size = 8, strong = false, color = ink, right = false, width?: number) {
    const font = strong ? bold : regular;
    let s = clean(value);
    if (width) while (s.length && font.widthOfTextAtSize(s, size) > width) s = s.slice(0, -1);
    page.drawText(s, { x: right ? x - font.widthOfTextAtSize(s, size) : x, y: 841.89 - y - size, size, font, color });
  }
  function rule(y: number, x = 36, end = 559.28) { page.drawLine({ start: { x, y: 841.89 - y }, end: { x: end, y: 841.89 - y }, thickness: 0.6, color: ruleColor }); }
  function vertical(x: number, top: number, bottom: number) { page.drawLine({ start: { x, y: 841.89 - top }, end: { x, y: 841.89 - bottom }, thickness: 0.5, color: ruleColor }); }
  function band(y: number, height: number, color = pale) { page.drawRectangle({ x: 36, y: 841.89 - y - height, width: 523.28, height, color }); }
  function header() {
    page.drawImage(logo, { x: 36, y: 841.89 - 81, width: 222, height: 222 * logo.height / logo.width });
    text(559, 33, "ACCOUNT STATEMENT", 18, true, blue, true);
    text(36, 94, "2 Margaret Close Hatfield Zimbabwe", 8, false, muted);
    text(559, 94, STATEMENT_MAILBOX, 8, false, muted, true);
    band(116, 1.7, blue);
    text(36, 132, "STATEMENT TO", 8, true, muted);
    text(36, 150, model.customer.company_name, 17, true, ink, false, 270);
    text(36, 179, `Account number: ${model.customer.account_number}`, 9);
    text(36, 200, `Account manager: ${manager}`, 8, false, ink, false, 275);
    for (const [n, field] of [["Period", `${model.from} to ${model.to}`], ["Statement date", model.to], ["Currency", model.currency], ["Reference", `${model.customer.account_number}-${model.to.slice(0, 7)}`]].entries()) {
      const y = 132 + n * 24; text(323, y, field[0], 8, false, muted); text(559, y, field[1], 8, true, ink, true); rule(y + 18, 323);
    }
    rule(234);
    const values = [["OPENING BALANCE", model.opening], ["INVOICES / DEBITS", model.totalDebit], ["PAYMENTS RECEIVED", model.totalCredit], ["NET ACCOUNT BALANCE", model.closing]];
    values.forEach(([label, amount], i) => { const x = 36 + i * 132; if (i) vertical(x - 8, 248, 301); text(x, 250, label, 7, true, muted); text(x, 270, Number(amount).toFixed(2), 19, true, i === 3 ? blue : ink); });
    text(559, 303, `${model.currency} / ${model.closing < 0 ? "credit balance" : "debit balance"}`, 7, false, muted, true);
  }
  const cols = [36, 84, 158, 212, 394, 452, 502, 559.28];
  function tableHeader(y: number) { band(y, 24, blue); ["Date", "Reference", "Type", "Description", "Debit", "Credit", "Balance"].forEach((label, i) => text(i < 4 ? cols[i] + 7 : cols[i + 1] - 6, y + 8, label, 7.3, true, paper, i >= 4)); }
  header(); text(36, 326, "ACCOUNT ACTIVITY", 10, true, blue); tableHeader(348);
  let y = 372;
  const movements = [{ date: model.from, kind: "Balance", ref: "Opening", description: "Balance brought forward", debit: 0, credit: 0, balance: model.opening }, ...model.lines];
  for (const [n, l] of movements.entries()) {
    if (y > 700) { page = doc.addPage([595.28, 841.89]); header(); tableHeader(348); y = 372; }
    const height = 34; if (n % 2) band(y, height); rule(y + height);
    cols.slice(1, -1).forEach(x => vertical(x, y, y + height));
    const row = [l.date.slice(5), l.ref, l.kind, l.description, l.debit ? l.debit.toFixed(2) : "-", l.credit ? l.credit.toFixed(2) : "-", l.balance.toFixed(2)];
    row.forEach((s, i) => text(i < 4 ? cols[i] + 7 : cols[i + 1] - 6, y + 12, s, 7.2, false, ink, i >= 4, cols[i + 1] - cols[i] - 12)); y += height;
  }
  if (y > 565) { page = doc.addPage([595.28, 841.89]); header(); y = 330; }
  text(36, y + 14, "Closing balance / period totals", 8, true);
  text(446, y + 14, model.totalDebit.toFixed(2), 8, true, ink, true); text(496, y + 14, model.totalCredit.toFixed(2), 8, true, ink, true); text(553, y + 14, model.closing.toFixed(2), 8, true, blue, true); y += 58;
  text(36, y, `BALANCE AGEING / INVOICE AMOUNTS (${model.currency})`, 9, true, blue); y += 22;
  band(y, 23, blue); band(y + 23, 25);
  ["Not yet due", "1-30 days", "31-60 days", "61-90 days", "90+ days", "Total overdue"].forEach((l, i) => { const x = 36 + i * 523.28 / 6; if (i) vertical(x, y, y + 48); text(x + 7, y + 8, l, 7, true, paper); text(x + 7, y + 31, (i < 5 ? model.ageing[i] : model.ageing.slice(1).reduce((a, b) => a + b, 0)).toFixed(2), 8, true); }); y += 62;
  text(36, y, "Invoice balances reflect allocated payments; net account balance also includes unallocated receipts.", 8); text(36, y + 17, "This statement is not a tax invoice or payment receipt. Only verified received payments are included.", 8, false, muted);
  rule(754);
  text(36, 763, "YOUR ACCOUNT MANAGER", 7.5, true, blue); text(36, 776, manager, 8, true);
  if (contact?.email) text(36, 788, contact.email, 7.5, false, ink, false, 260);
  if (contact?.phone) text(36, 799, contact.phone, 7.5);
  text(559, 763, "ACCOUNTS TEAM", 7.5, true, blue, true); text(559, 776, "IMT Solutions Finance", 8, true, ink, true);
  text(559, 788, STATEMENT_MAILBOX, 7.5, false, ink, true); text(559, 799, contact?.accountsPhone || "+263 86 12 004321", 7.5, false, ink, true);
  doc.getPages().forEach((p, i) => { page = p; text(36, 820, "IMT Solutions / Customer account statement", 7, false, muted); text(559, 820, `Page ${i + 1} of ${doc.getPageCount()}`, 7, false, muted, true); });
  doc.setTitle(`Account statement ${model.customer.account_number} ${model.to}`);
  return doc.save();
}