import photograph from "@/assets/imt-signature-network.jpg.asset.json";
import logo from "@/assets/imt-solutions-logo.png.asset.json";

const origin = "https://management.imtsolutions.co.zw";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function signatureTitle(name: string, role: string): string {
  if (name.trim().toLowerCase() === "farai matare") return "Head of IT Department";
  if (/account.manager|sales/i.test(role)) return "Corporate Account Manager";
  if (/technical|cloud.engineer|cyber.security|noc/i.test(role)) return "NOC Engineer";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Email-only fixed brand colors and table layout survive Outlook's mail renderer. */
export function imtSignature({ name, role, email, phone = "+263 86 12 004321" }: { name: string; role: string; email: string; phone?: string }) {
  const title = signatureTitle(name, role);
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#3b4658">
  <tr><td colspan="2" style="padding:0 0 24px;font-size:11px;line-height:16px">Kind regards,</td></tr>
  <tr><td colspan="2" style="font-size:12px;font-weight:700;letter-spacing:2px;line-height:16px">${escape(name.toUpperCase())}</td></tr>
  <tr><td colspan="2" style="font-size:12px;letter-spacing:2px;line-height:16px;padding-bottom:12px">${escape(title.toUpperCase())}</td></tr>
  <tr><td style="width:56%;vertical-align:bottom;font-size:10px;line-height:13px">T: ${escape(phone)}<br/>E: <a href="mailto:${escape(email)}" style="color:#3b4658;text-decoration:none">${escape(email)}</a><br/>W: <a href="https://imtsolutions.co.zw" style="color:#3b4658;text-decoration:none">imtsolutions.co.zw</a></td>
  <td style="width:44%;vertical-align:bottom;text-align:right"><img src="${origin}${logo.url}" width="250" alt="IMT Solutions" style="width:100%;max-width:250px;height:auto;display:block;border:0" /></td></tr>
  <tr><td colspan="2" style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td colspan="4" style="background-color:#16233f;color:#ffffff;padding:8px;font-size:14px;line-height:18px">YOUR TRUSTED PARTNER FOR BUSINESS TECHNOLOGIES</td></tr><tr><td style="background-color:#1f6be0;color:#ffffff;padding:8px 4px;font-size:11px;text-align:center">CONNECTIVITY</td><td style="background-color:#25806f;color:#ffffff;padding:8px 4px;font-size:11px;text-align:center">CLOUD SERVICES</td><td style="background-color:#b69030;color:#ffffff;padding:8px 4px;font-size:11px;text-align:center">CYBERSECURITY</td><td style="background-color:#a84c38;color:#ffffff;padding:8px 4px;font-size:11px;text-align:center">IT SUPPORT</td></tr></table></td></tr>
  <tr><td colspan="2" style="padding:20px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="width:58%;background-color:#16233f"><img src="${origin}${photograph.url}" width="348" alt="IMT network infrastructure" style="width:100%;height:auto;display:block;border:0" /></td><td style="width:42%;padding:12px;background-color:#ffffff;vertical-align:middle"><img src="${origin}${logo.url}" width="200" alt="IMT Solutions" style="width:100%;height:auto;display:block;border:0" /><div style="font-size:12px;font-weight:700;color:#16233f;margin-top:10px">Connect. Protect. Grow.</div><a href="https://imtsolutions.co.zw" style="display:inline-block;font-size:10px;line-height:16px;margin-top:8px;color:#1f6be0">Find out more</a></td></tr></table></td></tr>
  <tr><td colspan="2" style="padding-top:24px;font-size:11px;line-height:17px;color:#6b7280"><strong>Disclaimer</strong><br/>The information contained in this communication is confidential and intended solely for the recipient and others authorized to receive it. If you are not the intended recipient, please notify the sender and delete this email. Disclosure, copying, distribution or action taken in reliance on its contents is prohibited. Email transmission cannot be guaranteed secure or error-free; please scan attachments before opening them.</td></tr>
  </table>`;
}