export const BILLING_MAILBOX = "billing@imtsolutions.co.zw";

export function validEmailPayment(amount: number, currency: string, customerId: string, invoice: { customer_id: string; currency: string } | null) {
  return Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) && Boolean(customerId) && (!invoice || (invoice.customer_id === customerId && invoice.currency === currency));
}