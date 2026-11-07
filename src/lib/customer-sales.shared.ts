import { departmentsOf } from './department-access';

export const QUOTE_SALES_ROLES = ['operations_manager', 'finance', 'sales', 'account_manager', 'corporate_account_manager', 'customer_account_manager', 'key_account_manager', 'customer_success'];

export function customerSalesPermissions(roles: readonly string[]) {
  const departments = departmentsOf(roles);
  const billing = roles.some(r => ['finance', 'operations_manager', 'master_admin'].includes(r));
  return { canQuote: billing || departments.includes('sales'), canSubmitPayment: billing || departments.includes('sales'), canRecordPayment: billing };
}

export function quoteCanConvert(quote: { status: string; invoice_id?: string | null; customer_id?: string | null }) {
  return quote.status === 'accepted' && Boolean(quote.customer_id) && !quote.invoice_id;
}