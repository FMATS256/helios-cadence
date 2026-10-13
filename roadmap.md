# Roadmap

## Done
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
- [ ] Gateway must supply signed download URLs or base64 file content for private inbound attachments; opaque paths alone cannot be downloaded
- [ ] Independently verify external mailbox delivery, inbound reply round-trip and Bcc behavior; gateway acceptance is verified, not delivery
- [ ] Add verified bank details to Quick Parts once supplied
- [ ] Make cash payment recording explicit and fix Finance workspace overlap across screen sizes

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance
