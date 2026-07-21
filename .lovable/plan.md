# Email Studio

A new `/email-studio` page in the admin app to manage every transactional email end-to-end. Fully database-driven — code templates become seed defaults, all customizations live in the DB.

## What ships

### 1. Preview page (`/email-studio`)
- Sidebar: list of all templates (welcome, invoice, receipt, server-ready, payment-reminder, renewal-reminder, ticket-update, license-issued) with status pill (Default / Customized / Draft).
- Main pane tabs per template:
  - **Preview** — live iframe rendering with sample data, desktop/mobile toggle
  - **Design** — drag-and-drop editor (Unlayer / react-email-editor)
  - **HTML** — paste/upload raw HTML with `{{variable}}` merge tokens
  - **Settings** — subject line, from name, preview text, sample data JSON
  - **Send Test** — send to any address (defaults to logged-in user)

### 2. Branded theme settings (`/email-studio/theme`)
Global tokens applied to all code-default templates and injectable into custom HTML via `{{theme.*}}`:
- Logo URL, brand name, tagline
- Colors: primary, accent, ink, body, background
- Footer: support email, phone, address, website
- Font family
Live preview updates as you edit.

### 3. Deliverability check (`/email-studio/deliverability`)
- Domain verification status (DNS/SPF/DKIM) via `email_domain--check_email_domain_status`
- Last 100 delivery events with filter chips (sent/bounced/complained/suppressed/rate-limited) via `listEmailLogs`
- Per-recipient suppression lookup
- Bounce rate + complaint rate over 30 days with color-coded thresholds

### 4. Drag-and-drop editor + HTML upload
- Unlayer (`react-email-editor`) embedded per template
- Save button persists design JSON + rendered HTML to `email_templates` table
- "Import HTML" uploads a `.html` file and stores it as the active version
- "Reset to default" reverts to code-based template

### 5. Separate template per email
Already 8 separate template files. Adding: per-template DB override so each can be independently customized, versioned, and reset.

## Data model (new tables)

```
email_theme                 -- singleton row of brand tokens
email_templates             -- one row per template name (welcome, invoice, …)
  ├─ subject, preview_text, from_name
  ├─ mode: 'code' | 'unlayer' | 'html'
  ├─ unlayer_design (jsonb)  -- Unlayer editor state
  ├─ html_content (text)     -- rendered/uploaded HTML with {{tokens}}
  ├─ sample_data (jsonb)
  └─ updated_at, updated_by
email_template_versions     -- history for rollback
```

All tables `master_admin`-only via RLS.

## Send pipeline changes

`sendTemplateEmail` becomes theme-aware and DB-first:
1. Load template row + theme row
2. If `mode='code'` → render existing React Email component with theme tokens injected
3. If `mode='unlayer'` or `'html'` → render stored HTML with Mustache-style `{{variable}}` and `{{theme.*}}` substitution
4. Fall back to code default if row missing

Existing call sites (customer created, payment recorded, invoice issued, etc.) don't change — pipeline is transparent.

## Technical notes

- New package: `react-email-editor` (Unlayer, free tier)
- Route: `src/routes/_authenticated/email-studio.tsx` + sub-routes for theme/deliverability
- Server fns in `src/lib/email-studio.functions.ts` (list, get, save, sendTest, resetToDefault)
- Migration adds three tables with grants + RLS
- Preview iframe uses `srcDoc` with rendered HTML — never executes scripts

## Out of scope (this build)
- Marketing / broadcast sending (transactional only, per platform policy)
- Multi-language templates
- A/B testing
- WYSIWYG for code-mode templates (edit code directly)

Estimated: one focused build. Ready to proceed?