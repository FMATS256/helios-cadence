import { quotationBrand, quotationDate, quotationMoney, type QuotationDocument } from "@/lib/quotation-document.shared";

export function QuotationPreview({ document: d }: { document: QuotationDocument }) {
  return <div className="quotation-preview-scroll"><article className="quotation-sheet" aria-label="IMT quotation design">
    <header className="quotation-heading"><img src={quotationBrand.logoUrl} alt="IMT Solutions" /><div><h2>QUOTATION</h2><strong>{d.reference}</strong></div></header>
    <h3 className="quotation-title">{d.title}</h3>
    <div className="quotation-panels">
      <section><h4>Quote From</h4><div><strong>{quotationBrand.name}</strong><p>{quotationBrand.website}</p><p>{quotationBrand.email}</p><p>{quotationBrand.phone}</p></div></section>
      <section><h4>Quotation Details</h4><dl><dt>Quote date</dt><dd>{quotationDate(d.date)}</dd><dt>Valid until</dt><dd>{quotationDate(d.validUntil)}</dd><dt>Currency</dt><dd>{d.currency}</dd></dl></section>
      <section><h4>Quote To</h4><div><strong>{d.customer.name}</strong><p>{d.customer.address}</p><p>{d.customer.email}</p><p>{d.customer.phone}</p></div></section>
      <section><h4>Deliver To</h4><div><strong>{d.customer.name}</strong><p>{d.customer.address}</p></div></section>
    </div>
    <div className="quotation-meta">{[["Account No", d.customer.account], ["Quote Date", quotationDate(d.date)], ["Representative", d.representative], ["Quote Number", d.reference]].map(([label, value]) => <div key={label}><strong>{label}</strong><span>{value}</span></div>)}</div>
    <table className="quotation-items"><thead><tr><th>Item code</th><th>Description</th><th>Qty</th><th>Unit price</th><th>VAT %</th><th>Line total</th></tr></thead><tbody>{d.items.map((item, i) => <tr key={i}><td>{item.code}</td><td>{item.description}</td><td>{item.quantity}</td><td>{quotationMoney(item.price)}</td><td>{item.taxRate}%</td><td>{quotationMoney(item.total)}</td></tr>)}</tbody></table>
    <div className="quotation-summary"><section><h4>Notes &amp; Terms</h4><div>{d.validUntil && <strong>Valid until {quotationDate(d.validUntil)}</strong>}<p>{d.notes || "—"}</p></div></section><section><h4>Items</h4><div className="quotation-count">{d.items.length}</div></section><section><h4>Quotation Total</h4><dl>{[["Subtotal (excl.)", d.subtotal], ["Discount", d.discount], ["VAT", d.tax], [`Total (${d.currency})`, d.total]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{quotationMoney(Number(value))}</dd></div>)}</dl></section></div>
    <footer><strong>{quotationBrand.name}</strong><span>{quotationBrand.website} · {quotationBrand.email}</span></footer>
  </article></div>;
}