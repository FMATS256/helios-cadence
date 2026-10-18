import { quotationBrand, quotationDocument } from "./quotation-document.shared";
import { renderQuotationPdf } from "./quotation-pdf";

/** Uses saved quote values; document rendering never changes prices or lifecycle. */
export async function brandedQuotationPdf(quote: any, lines: any[], representative?: string) {
  const response = await fetch(quotationBrand.logoUrl);
  if (!response.ok) throw new Error("The IMT quotation logo could not be loaded. Please try again.");
  return renderQuotationPdf(quotationDocument(quote, lines, representative), new Uint8Array(await response.arrayBuffer()));
}