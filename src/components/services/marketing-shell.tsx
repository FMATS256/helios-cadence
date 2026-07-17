import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import imtLogo from "@/assets/imt-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

export const serviceCategories = [
  { slug: "connectivity", title: "Connectivity", tagline: "Always-on internet", blurb: "Starlink satellite and Fibre Uplink Backup — high-speed, resilient connectivity for every site.", features: ["Starlink satellite", "Fibre Uplink Backup", "Failover & redundancy"] },
  { slug: "cloud", title: "Cloud Solutions", tagline: "Hosting that scales", blurb: "Cloud compute, storage, data centre and multi-cloud — scale on demand without managing hardware.", features: ["Cloud compute", "Storage as a service", "Business continuity"] },
  { slug: "voip", title: "VoIP Services", tagline: "Talk smarter", blurb: "PBX configuration, call-centre setup and unified communications integrated with your CRM.", features: ["PBX configuration", "Call centre setup", "CRM & unified comms"] },
  { slug: "cyber-security", title: "Cyber Security", tagline: "Defend the perimeter", blurb: "Firewall, endpoint protection, data backup, VAPT and 24/7 security operations centre monitoring.", features: ["Firewall & EDR", "VAPT audits", "SOC monitoring"] },
  { slug: "networking", title: "Networking Services", tagline: "Built to perform", blurb: "LAN/WAN design, VPN, structured cabling and 24/7 network monitoring across every branch.", features: ["LAN/WAN design", "VPN & VLAN", "Structured cabling"] },
  { slug: "cctv", title: "CCTV & Alarms", tagline: "Eyes everywhere", blurb: "Professional install of CCTV cameras, DVR systems, alarms and biometric access control.", features: ["IP & HD CCTV", "DVR + storage", "Alarms & access control"] },
] as const;

export type ServiceCategory = typeof serviceCategories[number];

export function MarketingShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center gap-4 px-4 md:px-8 h-16">
          <Link to="/services" className="flex items-center gap-2">
            <img src={imtLogo.url} alt="IMT Solutions" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block leading-tight">
              <div className="font-display font-bold text-sm">IMT Solutions</div>
              <div className="text-[10px] tracking-[2px] text-muted-foreground">SMARTER TECHNOLOGY</div>
            </div>
          </Link>
          <nav className="ml-auto hidden md:flex items-center gap-1">
            {serviceCategories.map((c) => {
              const active = pathname === `/services/${c.slug}`;
              return (
                <Link key={c.slug} to={`/services/${c.slug}` as any} className={`px-3 py-2 rounded-md text-sm font-medium transition ${active ? "bg-navy text-navy-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                  {c.title}
                </Link>
              );
            })}
          </nav>
          <Button asChild size="sm" className="ml-2 text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
            <Link to="/auth">Get a Quote</Link>
          </Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border mt-16">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 text-sm text-muted-foreground flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} IMT Solutions — Trusted IT partner across Zimbabwe.</p>
          <div className="flex gap-4">
            <Link to="/services" className="hover:text-foreground">All services</Link>
            <Link to="/auth" className="hover:text-foreground">Get a quote</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function ServicesLayout() {
  return <MarketingShell><Outlet /></MarketingShell>;
}
