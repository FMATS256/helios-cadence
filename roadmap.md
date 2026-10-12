# Roadmap

## Done
- Created the Base44 client account and reassigned existing Base44 tickets; webhook ownership is fixed by protected configuration rather than requester details
- Client-app API for Base44: portal endpoints for account, invoices/statement, tickets, jobs (+ existing payments); integration brief saved to Files
- Fixed inbox.tsx build error (missing MoreHorizontal import)
- Outlook-style Home toolbar, functional reply focus, phone folder switcher and stable three-pane inbox verified without browser errors or page overflow
- Outgoing messages and quotation archives saved before gateway delivery; failures displayed in compose instead of disappearing with missing toast notifications

- Payment submission → billing approval → ledger/account posting (verified end to end; test data removed)
- Customer Accounts tab under Finance (per-customer financial statement)
- Firecrawl reconnected in the new workspace
- Tightened audit log write rule; updated app libraries for the security advisory

## Open
- [ ] Complete successful email round-trip: blocked by IMT website send and history endpoints returning HTTP 500 on 10 October 2026; existing inbox messages load correctly
- [ ] Make cash payment recording explicit and fix Finance workspace overlap across screen sizes
- [ ] Outlook-style Email Inbox enhancements: compose mail, functional mail actions, quotation PDF sending and retained outbound attachments
- [ ] Verify current IMT website gateway sending, received messages and retained email history; no direct Resend connection required

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance
