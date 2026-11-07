import { describe, expect, it } from 'vitest';
import { customerSalesPermissions, quoteCanConvert } from './customer-sales.shared';

describe('Customer 360 separation of duties', () => {
  for (const role of ['account_manager', 'corporate_account_manager', 'customer_account_manager', 'key_account_manager']) {
    it(`${role} can quote and submit cash/bank evidence but cannot post payments`, () => {
      expect(customerSalesPermissions([role])).toEqual({ canQuote: true, canSubmitPayment: true, canRecordPayment: false });
    });
  }
  it('Finance can record payments', () => {
    expect(customerSalesPermissions(['finance']).canRecordPayment).toBe(true);
  });
  it('NOC cannot quote or record sales payments', () => {
    expect(customerSalesPermissions(['noc'])).toEqual({ canQuote: false, canSubmitPayment: false, canRecordPayment: false });
  });
  it('only accepted customer quotes without an invoice can be converted', () => {
    expect(quoteCanConvert({ status: 'accepted', customer_id: 'client' })).toBe(true);
    expect(quoteCanConvert({ status: 'draft', customer_id: 'client' })).toBe(false);
    expect(quoteCanConvert({ status: 'accepted', customer_id: 'client', invoice_id: 'existing' })).toBe(false);
    expect(quoteCanConvert({ status: 'accepted' })).toBe(false);
  });
});