# Roadmap

## Open
- [ ] Remove demo clients/services/payments while preserving the real UK2AFRICA account; verify remaining service counts and transactions.
- [x] Customer 360: shared green active/red inactive service states and immediate red overdue/missing-information warnings; nine tests pass. Signed-in M10460 desktop/phone checks verified missing contact warnings, Review action, green active services, no mobile overflow and no browser errors; billing and department permissions unchanged.
- [x] Customer 360: opening overview shows all recorded service categories, licences, renewal dates and complete invoice/payment history; Request invoice removed, quotation conversion and Finance approval preserved. Signed-in M10460 desktop/phone checks verified five service records, three transactions, service detail opening, quote controls and no mobile overflow or browser errors; visibility tests pass.
- [x] Customer 360: full saved quotation builder, client PDF email transport, accepted-quote conversion with row locking, draft invoice links and cash/bank evidence submission. Signed-in administrator created a temporary USD 361.52 quote, converted it and read back a pending USD 1.23 payment with paid balance unchanged; mobile overflow check and 36 tests passed. Account-manager UI/session and live recipient delivery remain unverified; Billing must issue drafts and approve payments.
- [ ] Connect Kaspersky Security Center live client devices, protection status and alerts to Customer 360; blocked by confirmation of Kaspersky product, reachable Administration Server address and authorized read-only connection, then client-to-Kaspersky group mapping.
- [x] Replaced boxed invoice emails with business correspondence and one signature; two PDF transport tests pass. INV-01027 test accepted by the website gateway for fmats256@gmail.com, with sender copy to Ammara. Recipient inbox receipt remains unconfirmed.
- Project moved to a new workspace: integrations from the previous workspace must be relinked one by one. Firecrawl is done; other previously used services still need connecting as the user names them.

## Done
- Draft quotation QT-2026-0004 (walk-in "Domboshava Client"): Starlink Kit USD 260 + Starlink Flex Package USD 53/month with 15.5% VAT on top — subtotal USD 313.00, VAT USD 48.52, total USD 361.52; saved quotation PDF and the quotation-engine copy both read back those figures and six quotation tests pass. Not sent; no client contact or expiry recorded because none was supplied.
- FortiGate month-to-month rentals added to the service catalogue under a new firewall category: small unit FW-FG-SMALL $185/month and large unit FW-FG-LARGE $270/month, each all-inclusive of unit rental, licence, subscription and support; assigning either starts automatic monthly billing. Four pricing tests pass and the rows were read back signed-in in the catalogue with the firewall filter applied.

- Firecrawl relinked in the new workspace (gateway-backed, Lovable-managed credentials); credential probe returned a live result.
- Desktop client portal matches reference structure with IMT branding: inline gradient header, grey heading bands, document rows/action footers, photo welcome and four-column footer. Desktop 1280/1024 and mobile sign-in checked without overflow; hydration error corrected; ten portal tests passed.
- Added My Statements for every linked client account, current and monthly 21st cutoffs, private per-currency PDF downloads independent of email; seven tests passed, real M10466 PDF downloaded through signed-in portal and visually inspected, desktop/phone checked without errors or overflow.
- Added finance@ monthly statements on the 21st at 09:17 Harare, unique client-month delivery reservations, existing Quote Studio invoice attachments, Finance mailbox access and statement downloads; eight tests passed, actual UK2AFRICA PDF visually inspected, unsigned callback blocked and authorized non-due callback sends nothing.
- Automatic subscription invoices scheduled daily at 02:00 Harare; creation-day anchoring, covered-month input, atomic invoice/line creation and subscription-period deduplication added. Four date tests, eleven invoice tests and rolled-back database expiry/amount/duplicate/permission checks passed; IMT Cloud Basic renews 28 November 2026. No email delivery or payment approval added.
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
- [ ] Verify redesigned desktop portal with real linked-account data; requesting user has no matching login, so visual checks used sample rows and signed-out pages.
- [ ] Activate monthly statement delivery by publishing; obtain UK2AFRICA billing email and verify a real Finance send/readback after sign-in. No delivery was attempted on October 31; the requesting user's own sign-in could not be minted.
- [ ] Verify covered-month subscription creation through signed-in Finance UI; requesting user has no matching login. Database generation and safeguards are verified.
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
- [x] NOC Command Centre: removed toolkit/diagnostics/remote tabs; added Client Resources tab with register-server and create-hosting forms plus clickable resource details with power/lifecycle actions

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance

- [x] Security: scheduled jobs locked behind secret; cron rescheduled
- [ ] Security: remaining email-recipient, export-formula, link-expiry warnings (awaiting user go-ahead)
- [x] Vultr storage: real instance + bucket + monthly subscription billing (not live-tested, incurs charges)

- [x] Invoice/quote email uses IMT website mail gateway (Resend declined)
- [x] Website mail gateway already connected
