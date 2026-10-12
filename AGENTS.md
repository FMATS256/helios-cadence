# Architecture decisions

- Direct Finance payment recording must require a destination cash account and post both its cash movement and balanced journal entry, so recorded receipts always update account and ledger balances.
- Inbox outbound mail uses only the IMT website gateway and saves its message and quotation snapshot before delivery, so persistence failures cannot cause an unrecorded send or a direct-provider fallback.
- Base44 webhook resolves client ownership from the protected system setting, not incoming customer identifiers, so requester data cannot route tickets to another client.