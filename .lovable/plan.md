# Outlook-style Email Inbox and quotation attachments

## Goal
Make the Email Inbox work as the Account Manager’s main Outlook-like workspace, including sending quotations to customers while keeping the sent quotation in the conversation.

## What will change
- Keep the current three-pane Outlook layout and make **New mail**, **Reply**, **Forward**, **Archive**, and **Sent** functional.
- Add a compose window with To, Cc, subject, message, and customer/enquiry context.
- Add a quotation picker to the reply and compose areas. Account Managers can select an existing quotation for that customer, preview its PDF, and send it with the email.
- Record every outgoing email in the correct enquiry, including sender, recipients, time, delivery result, quotation identity, and retained PDF attachment metadata.
- Show outbound quotation PDFs as attachment chips in the conversation so authorized staff can reopen or download them later.
- Keep access scoped to the assigned Account Manager/customer owner, with administrators retaining reassignment access.
- Preserve the current IMT email banner, plain message wording, signature, enquiry references, and reply threading.

## Technical details
- Extend the inbox server functions with compose, forward/archive, sent-mail listing, quotation lookup, quotation PDF generation, and attachment retrieval.
- Store generated quotation PDF snapshots in private email attachment storage and link them to `email_message_attachments`; use short-lived authenticated links for viewing.
- Use the existing quotation document engine and delivery flow rather than duplicating quotation calculations.
- Add the required database fields/policies and private storage configuration with role-scoped access.
- Update the inbox interface only; Customer 360 structure remains unchanged.

## Verification
- Verify desktop and mobile inbox layouts.
- Send or simulate an email with a quotation, confirm the sent message appears in the thread, and confirm its retained PDF opens.
- Confirm unauthorized users cannot access another Account Manager’s enquiries or attachments.
- Confirm the app builds without errors.
