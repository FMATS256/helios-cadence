import { Link } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck } from "lucide-react";

export function ClientPortalFooter() {
  const groups = [
    { title: "Quick Links", links: [{ title: "My Services", to: "/client/services" }, { title: "My Bills", to: "/client/invoices" }, { title: "My Payments", to: "/client/payments" }] },
    { title: "My Account", links: [{ title: "Account overview", to: "/client" }, { title: "Account statements", to: "/client/statements" }, { title: "Profile & contacts", to: "/client/support" }] },
    { title: "Help & Support", links: [{ title: "Contact your account manager", to: "/client/support" }, { title: "Support requests", to: "/client/support" }, { title: "Payments & receipts", to: "/client/payments" }] },
  ] as const;
  return <>
    <footer className="portal-reference-footer hidden">
      <div className="portal-footer-inner">
        {groups.map(group => <section key={group.title}><h2>{group.title}</h2><ul>{group.links.map(link => <li key={link.title}><ChevronRight aria-hidden="true" /><Link to={link.to} resetScroll={false}>{link.title}</Link></li>)}</ul></section>)}
        <section><h2>IMT Solutions</h2><ul><li><ChevronRight aria-hidden="true" /><a href="https://imtsolutions.co.zw" target="_blank" rel="noopener noreferrer">Our website</a></li><li><ShieldCheck aria-hidden="true" /><span>Secure account access</span></li></ul></section>
      </div>
    </footer>
    <footer className="portal-original-footer max-w-6xl mx-auto px-4 sm:px-8 py-6 border-t border-border flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>IMT Solutions · Client accounts</span><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-teal" />Secure account access</span></footer>
  </>;
}