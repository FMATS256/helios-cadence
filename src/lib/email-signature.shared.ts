import promotion from "@/assets/imt-signature-m365.png.asset.json";
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
export const IMT_WHATSAPP = "+263 776 568 526";
const whatsappLink = (value: string) => `https://wa.me/${value.replace(/[^\d]/g, "")}`;
export function imtSignature({ name, role, email, phone = "+263 86 12 004321", whatsapp = IMT_WHATSAPP }: { name: string; role: string; email: string; phone?: string; whatsapp?: string }) {
  const title = signatureTitle(name, role);
  return `<style>@media screen and (min-width:601px){.imt-signature .imt-identity{font-size:12px!important;line-height:14px!important}.imt-signature .imt-contact{font-size:10px!important;line-height:13px!important}.imt-signature .imt-closing{font-size:11px!important;line-height:16px!important}.imt-signature .imt-tagline{font-size:14px!important;line-height:18px!important}.imt-signature .imt-service{font-size:11px!important;line-height:14px!important}}</style>
  <table class="imt-signature" role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#3b4658;-webkit-text-size-adjust:none;text-size-adjust:none">
  <tr><td class="imt-closing" colspan="2" style="padding:0 0 16px;font-size:7px;line-height:10px;mso-line-height-rule:exactly">Kind regards,</td></tr>
  <tr><td class="imt-identity" colspan="2" style="font-size:7px;font-weight:700;letter-spacing:1px;line-height:8px;mso-line-height-rule:exactly">${escape(name.toUpperCase())}</td></tr>
  <tr><td class="imt-identity" colspan="2" style="font-size:7px;letter-spacing:1px;line-height:8px;mso-line-height-rule:exactly;padding-bottom:9px">${escape(title.toUpperCase())}</td></tr>
   <tr><td class="imt-contact" style="width:56%;vertical-align:bottom;font-size:6px;line-height:8px;mso-line-height-rule:exactly;overflow-wrap:anywhere">T: ${escape(phone)}<br/>WhatsApp: <a href="${whatsappLink(whatsapp)}" style="color:#3b4658;text-decoration:none">${escape(whatsapp)}</a><br/>E: <a href="mailto:${escape(email)}" style="color:#3b4658;text-decoration:none">${escape(email)}</a><br/>W: <a href="https://imtsolutions.co.zw" style="color:#3b4658;text-decoration:none">imtsolutions.co.zw</a></td>
  <td style="width:44%;vertical-align:bottom;text-align:right;padding-left:8px"><img src="${origin}${logo.url}" width="250" alt="IMT Solutions" style="width:100%;max-width:250px;height:auto;display:block;border:0" /></td></tr>
  <tr><td colspan="2" style="padding-top:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-collapse:collapse;-webkit-text-size-adjust:none;text-size-adjust:none"><tr><td class="imt-tagline" colspan="4" style="background-color:#16233f;color:#ffffff;padding:4px;font-size:8px;line-height:10px;mso-line-height-rule:exactly">YOUR TRUSTED PARTNER FOR BUSINESS TECHNOLOGIES</td></tr><tr><td class="imt-service" style="background-color:#1f6be0;color:#ffffff;padding:5px 1px;font-size:7px;line-height:9px;mso-line-height-rule:exactly;white-space:nowrap;text-align:center">CONNECTIVITY</td><td class="imt-service" style="background-color:#25806f;color:#ffffff;padding:5px 1px;font-size:7px;line-height:9px;mso-line-height-rule:exactly;white-space:nowrap;text-align:center">CLOUD SERVICES</td><td class="imt-service" style="background-color:#b69030;color:#ffffff;padding:5px 1px;font-size:7px;line-height:9px;mso-line-height-rule:exactly;white-space:nowrap;text-align:center">CYBERSECURITY</td><td class="imt-service" style="background-color:#a84c38;color:#ffffff;padding:5px 1px;font-size:7px;line-height:9px;mso-line-height-rule:exactly;white-space:nowrap;text-align:center">IT SUPPORT</td></tr></table></td></tr>
  <tr><td colspan="2" style="padding:16px 0 0"><a href="https://imtsolutions.co.zw/microsoft-365" style="display:block;text-decoration:none"><img src="${origin}${promotion.url}" width="600" alt="IMT Solutions Microsoft 365 — Explore More" style="width:100%;max-width:600px;height:auto;display:block;border:0" /></a></td></tr>
  <tr><td colspan="2" style="padding-top:24px;font-size:11px;line-height:17px;color:#6b7280"><strong>Disclaimer</strong><br/>The information contained in this communication is confidential and intended solely for the recipient and others authorized to receive it. If you are not the intended recipient, please notify the sender and delete this email. Disclosure, copying, distribution or action taken in reliance on its contents is prohibited. Email transmission cannot be guaranteed secure or error-free; please scan attachments before opening them. <a href="https://imtsolutions.co.zw/microsoft-365" style="color:#1f6be0;text-decoration:underline">View more</a></td></tr>
  </table>`;
}