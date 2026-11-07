import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn(), render: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('../email-templates/render.server', () => ({ renderTemplateHtml: mocks.render }))
vi.mock('../inbox.server', () => ({ sendInboxEmail: mocks.send }))
import { sendResendEmail } from '../email-templates/send-resend'

describe('invoice PDF transport', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only')
    vi.stubEnv('RESEND_API_KEY', 'test-only')
    vi.stubEnv('LOVABLE_API_KEY', '')
    mocks.render.mockResolvedValue({ html: '<html><body>Invoice</body></html>', text: 'Invoice', subject: 'Invoice test' })
    mocks.send.mockResolvedValue({ ok: true, id: 'confirmed-id' })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
  const options = () => ({ templateName: 'invoice', to: 'fmats256@gmail.com', from: 'IMT <sales@imtsolutions.co.zw>', templateData: { recipientTitle: 'Mr', senderRole: 'Account Manager' }, attachments: [{ filename: 'INV-01027.pdf', content: new Uint8Array([37, 80, 68, 70, 45]), contentType: 'application/pdf' }] })
  it('forwards the exact PDF bytes to the website gateway even when Resend is configured', async () => {
    expect(await sendResendEmail(options())).toEqual({ sent: true, id: 'confirmed-id' })
    const attachment = mocks.send.mock.calls[0]?.[0].attachments[0]
    expect(attachment.filename).toBe('INV-01027.pdf')
    expect(attachment.contentType).toBe('application/pdf')
    expect(Array.from(attachment.content)).toEqual([37, 80, 68, 70, 45])
  })
  it('does not report a send when the gateway rejects the attachment', async () => {
    mocks.send.mockResolvedValue({ ok: false, error: 'Gateway 422: invalid attachment' })
    expect(await sendResendEmail(options())).toEqual({ sent: false, error: 'Gateway 422: invalid attachment' })
  })
  it('quotation PDFs also use the existing IMT gateway with exact attachment bytes', async () => {
    const quote = { ...options(), templateName: 'quote', attachments: [{ filename: 'QT-2026-0005.pdf', content: new Uint8Array([37, 80, 68, 70, 45]), contentType: 'application/pdf' }] }
    expect(await sendResendEmail(quote)).toEqual({ sent: true, id: 'confirmed-id' })
    const attachment = mocks.send.mock.calls[0]?.[0].attachments[0]
    expect(attachment.filename).toBe('QT-2026-0005.pdf')
    expect(Array.from(attachment.content)).toEqual([37, 80, 68, 70, 45])
  })
})