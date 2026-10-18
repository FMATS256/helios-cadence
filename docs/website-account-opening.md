# IMT website account opening

## Connection contract

POST `https://management.imtsolutions.co.zw/api/public/accounts/open` from the website server, not the browser. Reuse the existing IMT email gateway shared key; do not expose it to applicants.

Set `Content-Type: application/json` and `X-IMT-Signature: sha256=<hex HMAC-SHA256 of the exact raw request body using the existing shared key>`.

```json
{
  "external_id": "unique-website-application-id",
  "category": "personal",
  "name": "Applicant or company name",
  "contact_name": "Primary contact name",
  "email": "applicant@example.com",
  "phone": "+263...",
  "industry": "Optional",
  "billing_address": "Optional"
}
```

Categories and preferred managers:
- `personal`: Customer Account Manager
- `company`: Account Manager
- `corporate`: Corporate Account Manager
- `key_account`: Key Account Manager

Assignment selects the least-loaded active, non-archived manager within the preferred category, then falls back to other active manager categories if none exist. No active manager means no account is created (503). Staff manager categories use existing protected roles managed by administrators; this does not change any user's role automatically.

The website must allocate and retain `external_id` before submission. Repeat identical submissions return 200 with `replayed: true` and the same account. Reusing that ID with different validated details returns 409. New accounts return 201 with `account_number`, `name`, `category`, and `account_manager` (name/email/role). Accounts and primary contacts are saved atomically; legacy personal/corporate account types remain compatible with Customer 360. Website applicants cannot submit a manager, account number, status, roles, invoices or payment terms.

The management side is implemented and locally verified. The separate website must submit its account-opening form to this endpoint, and the management changes must be published before the public URL serves it. This endpoint does not create a login or send welcome emails.