# Plan

Make Finance feel consistent with Customer 360 while keeping the official layout and preventing duplicate record creation.

## What will change

- Update the shared workspace tab strip used by Finance to the colorful, pressable Customer 360 tab style.
- Add scroll-stable tab content behavior so switching Finance tabs does not jump the page unnecessarily.
- Keep the existing Finance workspace structure, pages, permissions and separation-of-duties rules intact.
- After creating a customer, invoice, ticket, quote or work order, navigate to the created record where a detail page exists.
- For forms without a detail page, close/reset once and move users to the most relevant filtered tab or customer account instead of leaving them on the same create form.
- Preserve customer onboarding’s existing redirect to Customer 360 and avoid changing Customer 360 itself.

## Technical details

- `WorkspaceTabs` will get Customer 360-inspired tab accents with per-tab color tokens and deep-link-friendly search params.
- `FinanceHub` will reserve tab body height during tab changes, following the Customer 360 min-height pattern.
- Billing invoice creation will redirect to `/invoices/$id` after a new invoice is saved.
- Payment recording/submission will reset once and route users to the relevant Finance Payments/Customer Accounts view where appropriate.
- Generic `ModulePage` will gain optional post-create handling so future modules can redirect safely without forcing every form to navigate blindly.
