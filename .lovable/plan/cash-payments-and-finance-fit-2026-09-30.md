# Cash payments and Finance fit

## What will change
- Make cash payment recording clear for authorized Finance/Billing staff, including an explicit destination account so cash is posted to **Main Cash** rather than an unrelated account.
- Keep Account Managers on the existing submit-for-verification workflow; separation of duties will not change.
- Make the Finance workspace, filters, tables, cards, dialogs, and tab strip fit cleanly on desktop and phones without overlapping or forcing the whole page sideways.
- Preserve the existing Customer 360 design language and anchored, colorful Finance tabs.

## Validation
- Verify the cash-payment flow and ledger/account posting path.
- Check Finance at desktop and phone widths, including Payments and the record-payment dialog.
- Confirm the preview builds without errors.

## Technical details
- Reuse existing cash accounts and payment posting logic; no new financial model is planned.
- Add responsive wrapping/min-width guards and local horizontal scrolling only where dense tables require it.
