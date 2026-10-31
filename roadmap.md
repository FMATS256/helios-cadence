# Roadmap

## Done
- Built /account-manager using the shared portfolio, client counts, support/invoice request queues, renewals and existing technician dispatch; ownership rules tested.
- Connected Finance agent to the existing live billing mailbox, approved reminder sends and email-payment claims entering pending Finance verification; mailbox read returned 200 with no messages, 13 tests pass and pages require sign-in.
- Invoice-style service/subscription/equipment cards, Liquid-inspired mobile dropdown and welcome screen verified in a layout fixture on mobile/desktop with no horizontal overflow; service details open and ten service/payment tests pass. Real linked-client checks remain blocked by no requesting-user login.
- Mobile services and receipt cards follow the supplied examples; active-service filter tests pass and receipt View/details checked with a layout fixture. Real client-session verification remains unavailable.
- Invoice payment buttons and payment choices exclude fully gateway-paid invoices while Finance approval is pending; shared server preflight blocks repeat charges, nine payment-rule tests pass. Signed-in readback awaits a linked client session.
- Connected Leads & Accounts portfolio, quotes/invoice requests/contact logs, Customer 360 Portal & Support tab and NOC client access; 12 tests passed and signed-out recovery-page desktop/mobile checks passed.
- Preserved Quote Studio invoice design; mandatory persisted item codes, billing-period fields, no-VAT/date/price validation, saved-line totals and received-allocation payment status synchronization; 25 tests and rolled-back partial/full/failed-payment database checks passed; actual INV-01024 PDF rendered and inspected
- Exact Quote Studio PDFs used for client and staff invoice downloads; unpaid/part-paid Invoice and fully allocated Sales Invoice tested; actual UK2AFRICA INV-01024 USD 200 download verified through staff UI
- UK2AFRICA M10460 client invitation accepted for matarefarai833@gmail.com; profile linked without staff roles; Starlink, Microsoft 365 (five demo seats, three assigned), and CCTV maintenance demo services read back in a client-only session; staff administration redirects to /client
- Client portal published to the custom domain at https://management.imtsolutions.co.zw/client; anonymous visitors see the client sign-in only, staff navigation is absent, pages carry noindex, and the requesting administrator's own sign-in correctly reports "not linked" instead of client data
- Built client portal at /client with administrator-managed account links, invoice balances, payments/proof, services and support; linked-account upload/pending-payment readback and support replies verified on desktop/mobile; temporary records removed
- Published management platform; public email account-opening endpoint verified responding 401 to an unsigned request instead of 404
- Automatic welcome emails across staff creation, lead conversion and website opening use the assigned manager's address, account details and personalized Microsoft signature; clean live send, saved inbox readback and no duplicate on application replay verified
- Email API account-opening address shares the signed action; atomic assigned-manager in-app alerts cover all account inserts; API replay, exactly one alert and Customer 360 readback verified (six tests); temporary records removed
- IMT website account-opening endpoint uses the existing signed connection; category routing, atomic account/contact saving and safe replay verified; temporary account read back in Customer 360 and removed
- Reference-style IMT quotation preview and PDF with existing logo, saved prices and terms; authenticated download and phone overflow checked
- Outlook-style compact mail panes, latest-message-first collapsed threads, quick reply, foreground refresh, conversation prefetching and docked compose verified with real signed-in conversations on desktop and phone
- Recipient confirmed both test PDFs arrived; signature banner now shows Microsoft Word and links to the Microsoft 365 page, with a blue disclaimer View more link
- Matched WhatsApp color to other signature contacts; sent two valid test PDFs via the signed-in composer and confirmed both application attachment cards and gateway attachment metadata
- Matched compact mobile signature proportions (7px identity, 6px contacts); Microsoft 365 / Explore More banner replaces network promotion; desktop/mobile rendering checked without overflow
- Reference-style IMT signature with compact Arial typography, generated network imagery and staff titles; test accepted for fmats256@gmail.com
- Added separate View and Download actions with prepared files, image/PDF/text previews and phone file sharing; existing retained text attachment preview and nonempty download verified in the signed-in inbox
- Department mailboxes with role checks: sales for AMs, accounts/billing for Finance, support/helpdesk for Technical
- Sanitized HTML email, inline images/signatures, colored reply attribution, personal drafts, flags/pins/categories and shared internal notes
- Rich-text/Cc/Bcc/Quick Parts composer, quote PDFs and retained outgoing attachments; removed unverified bank-details template
- Gateway accepted an HTML/attachment test; retained attachment opened and draft restoration verified in the signed-in portal
- Created the Base44 client account and reassigned existing Base44 tickets; webhook ownership is fixed by protected configuration rather than requester details
- Client-app API for Base44: portal endpoints for account, invoices/statement, tickets, jobs (+ existing payments); integration brief saved to Files
- Fixed inbox.tsx build error (missing MoreHorizontal import)
- Outlook-style Home toolbar, functional reply focus, phone folder switcher and stable three-pane inbox verified without browser errors or page overflow
- Outgoing messages and quotation archives saved before gateway delivery; failures displayed in compose instead of disappearing with missing toast notifications

- Payment submission → billing approval → ledger/account posting (verified end to end; test data removed)
- Customer Accounts tab under Finance (per-customer financial statement)
- Firecrawl reconnected in the new workspace
- Firecrawl re-linked again after the 13 October 2026 workspace move (gateway-backed, verified with a live read)
- Tightened audit log write rule; updated app libraries for the security advisory

## Open
- [ ] Verify signed-in portfolio/dispatch and billing reminder/payment-email round-trip; requesting user has no matching login and billing mailbox is empty, so sign-in and real payment correspondence are needed. No reminder was sent or payment recorded during this task.
- [ ] Verify new workspace signed-in account readback, client invitation and recovery email round-trip: the requesting user has no matching staff login; needs preview sign-in.
- [ ] Complete INV-01024 exact Microsoft 365 product/billing period and UK2AFRICA contact/address: real details are missing; demo licence cannot establish what the $200 invoice covers
- [ ] Verify general-ledger posting/reversal coverage for legacy/POS receipts and authenticated invoice download; requesting user has no matching staff login, so the actual PDF was verified directly instead
- [ ] Verify UK2AFRICA invitation receipt and initial password setup with the client; invitation accepted, but mailbox delivery and first-time password setup remain unverified
- [ ] Connect the separate IMT website account form: its current forwarding sends an event envelope instead of the required account fields; edits must be made from the website project because cross-project access here is read-only
- [ ] Gateway must supply signed download URLs or base64 file content for private inbound attachments; opaque paths alone cannot be downloaded
- [ ] Independently verify external mailbox delivery, inbound reply round-trip and Bcc behavior; gateway acceptance is verified, not delivery
- [ ] Add verified bank details to Quick Parts once supplied
- [ ] Make cash payment recording explicit and fix Finance workspace overlap across screen sizes

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance
