# Roadmap

## Done
- Payment submission → billing approval → ledger/account posting (verified end to end; test data removed)
- Customer Accounts tab under Finance (per-customer financial statement)
- Firecrawl reconnected in the new workspace
- Tightened audit log write rule; updated app libraries for the security advisory

## Open
- [ ] Fix inbox post-send error without duplicate delivery; bring Email Inbox closer to Outlook on desktop and mobile
- [ ] Make cash payment recording explicit and fix Finance workspace overlap across screen sizes
- [ ] Outlook-style Email Inbox enhancements: compose mail, functional mail actions, quotation PDF sending and retained outbound attachments
- [ ] AM Email Inbox: engine, API functions, inbound webhook route, /inbox UI and nav all built; awaiting Resend connection + RESEND_WEBHOOK_SECRET from user to go live (then point Resend webhook at /api/public/hooks/email-inbound)

## Later (from earlier plan)
- Banking & reconciliation depth, accounts payable, financial reports, multi-branch finance, project finance
