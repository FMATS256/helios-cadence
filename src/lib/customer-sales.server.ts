/** Customer-scoped authorization before privileged sales/payment operations. */
export async function assertCustomerSalesAccess(context: { supabase: any; userId: string }, customerId: string) {
  const [billing, sales, owned] = await Promise.all([
    context.supabase.rpc('is_billing_staff', { _user_id: context.userId }),
    context.supabase.rpc('is_sales_staff', { _uid: context.userId }),
    context.supabase.rpc('manages_customer', { _uid: context.userId, _customer: customerId }),
  ]);
  if (billing.error || sales.error || owned.error || !(billing.data || (sales.data && owned.data))) {
    throw new Error('Only Billing or the customer’s account team can perform this action.');
  }
}