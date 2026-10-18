# Roadmap

## Done
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
- [ ] Automated account-manager welcome email for every new account, with account number, available service and personalized signature
- [ ] Connect the separate IMT website account form to the new account-opening endpoint after publishing; website source is outside this project
- [ ] Gateway must supply signed download URLs or base64 file content for private inbound attachments; opaque paths alone cannot be downloaded
- [ ] Independently verify external mailbox delivery, inbound reply round-trip and Bcc behavior; gateway acceptance is verified, not delivery
- [ ] Add verified bank details to Quick Parts once supplied
- [ ] Make cash payment recording explicit and fix Finance workspace overlap across screen sizes

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance
