import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import imtLogo from "@/assets/imt-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

export type ServicePackage = {
  name: string;
  price: string;
  cadence: string;
  summary: string;
  includes: string[];
  highlight?: boolean;
};

export type ServiceCategory = {
  slug: string;
  title: string;
  tagline: string;
  blurb: string;
  features: string[];
  overview: string;
  useCases: string[];
  packages: ServicePackage[];
  faqs: { q: string; a: string }[];
};

export const serviceCategories: ServiceCategory[] = [
  {
    slug: "connectivity",
    title: "Connectivity",
    tagline: "Always-on internet",
    blurb: "Starlink satellite and Fibre Uplink Backup — high-speed, resilient connectivity for every site.",
    features: ["Starlink satellite", "Fibre Uplink Backup", "Failover & redundancy", "SD-WAN routing", "Managed CPE", "24/7 NOC"],
    overview: "Keep every branch, warehouse and remote site online with layered connectivity. We combine licensed fibre, Starlink and LTE failover behind a managed router so your team never notices when one link drops.",
    useCases: ["Multi-branch retail with tills that can't go offline", "Remote mining, farming or logistics sites beyond fibre reach", "Head offices needing dual-carrier redundancy for VoIP and cloud apps"],
    packages: [
      { name: "Starter", price: "$149", cadence: "/month", summary: "Single-site business fibre with LTE failover.", includes: ["Up to 50 Mbps fibre", "LTE backup SIM", "Managed router", "8x5 support"] },
      { name: "Business", price: "$389", cadence: "/month", summary: "Fibre + Starlink failover for critical sites.", includes: ["Up to 200 Mbps fibre", "Starlink secondary link", "Auto-failover SD-WAN", "24/7 monitoring", "4-hour on-site SLA"], highlight: true },
      { name: "Enterprise", price: "Custom", cadence: "quote", summary: "Multi-branch SD-WAN with guaranteed uptime.", includes: ["Dual-carrier per site", "Central SD-WAN orchestration", "MPLS / VPN mesh", "Dedicated account engineer", "99.9% uptime SLA"] },
    ],
    faqs: [
      { q: "How fast can you install?", a: "Starlink and LTE kits go live within 24–48 hours. Fibre depends on the carrier — typically 5–10 working days." },
      { q: "Do you own the last mile?", a: "We partner with every licensed carrier in Zimbabwe, so we pick the fastest path per site rather than locking you to one ISP." },
    ],
  },
  {
    slug: "cloud",
    title: "Cloud Solutions",
    tagline: "Hosting that scales",
    blurb: "Cloud compute, storage, data centre and multi-cloud — scale on demand without managing hardware.",
    features: ["Cloud compute", "Storage as a service", "Business continuity", "Backup & DR", "Multi-cloud orchestration", "Managed patching"],
    overview: "Move workloads off ageing servers onto managed cloud infrastructure. We design, migrate and run your compute, storage and backup — locally hosted or across Kamatera, Vultr, Contabo and hyperscalers.",
    useCases: ["Replacing an ageing on-prem server without capex", "Disaster recovery for finance and ERP systems", "Hosting line-of-business apps close to your users"],
    packages: [
      { name: "Cloud VM", price: "from $29", cadence: "/month", summary: "Managed virtual machine with backups.", includes: ["2 vCPU / 4 GB RAM", "80 GB SSD", "Daily backups", "OS patching"] },
      { name: "Business Cloud", price: "from $189", cadence: "/month", summary: "Production workload with HA and DR.", includes: ["8 vCPU / 16 GB RAM", "250 GB SSD + snapshots", "Off-site DR replica", "Firewall & VPN", "24/7 monitoring"], highlight: true },
      { name: "Private Cloud", price: "Custom", cadence: "quote", summary: "Dedicated tenancy across multi-cloud.", includes: ["Dedicated hosts", "Multi-region replication", "Migration & re-platforming", "Named cloud architect"] },
    ],
    faqs: [
      { q: "Which cloud do you host on?", a: "We're provider-agnostic — Kamatera, Vultr, Contabo, AWS, Azure and GCP are all wired into our provisioning agent." },
      { q: "Can you migrate our existing servers?", a: "Yes. We audit the workload, plan cutover windows and handle P2V / V2V migrations with rollback options." },
    ],
  },
  {
    slug: "voip",
    title: "VoIP Services",
    tagline: "Talk smarter",
    blurb: "PBX configuration, call-centre setup and unified communications integrated with your CRM.",
    features: ["PBX configuration", "Call centre setup", "CRM & unified comms", "SIP trunking", "Softphone apps", "Call recording"],
    overview: "Replace legacy phone systems with cloud-hosted VoIP. Ring groups, IVR, call recording and softphones — all integrated with your CRM and ticketing so agents have context on every call.",
    useCases: ["Call centres needing dashboards, wallboards and QA recording", "Multi-branch teams sharing one extension plan", "Sales teams that want click-to-dial from their CRM"],
    packages: [
      { name: "Extension", price: "$6", cadence: "/user / month", summary: "Hosted extension with softphone.", includes: ["1 extension", "Softphone (mobile + desktop)", "Voicemail-to-email", "Local DID"] },
      { name: "Team PBX", price: "$14", cadence: "/user / month", summary: "Full PBX for 10+ users.", includes: ["IVR & ring groups", "Call recording", "Queues & wallboards", "SIP trunking", "CRM click-to-dial"], highlight: true },
      { name: "Contact Centre", price: "Custom", cadence: "quote", summary: "Omni-channel contact centre.", includes: ["Voice + WhatsApp + email", "Real-time supervisor dashboards", "Predictive dialler", "QA & speech analytics"] },
    ],
    faqs: [
      { q: "Can we keep our numbers?", a: "Yes — we port existing landline and mobile DIDs from every local carrier." },
      { q: "Do you integrate with our CRM?", a: "We ship connectors for HubSpot, Zoho, Salesforce and custom systems via REST." },
    ],
  },
  {
    slug: "cyber-security",
    title: "Cyber Security",
    tagline: "Defend the perimeter",
    blurb: "Firewall, endpoint protection, data backup, VAPT and 24/7 security operations centre monitoring.",
    features: ["Firewall & EDR", "VAPT audits", "SOC monitoring", "Email security", "Backup & ransomware recovery", "Awareness training"],
    overview: "Layered defence across perimeter, endpoint and identity. We deploy next-gen firewalls, EDR, email filtering and back it with a 24/7 SOC that hunts threats before they become incidents.",
    useCases: ["Finance and legal firms with regulatory exposure", "Companies recovering from a ransomware or phishing incident", "Boards requiring annual VAPT and compliance reporting"],
    packages: [
      { name: "Essentials", price: "$19", cadence: "/endpoint / month", summary: "Baseline endpoint & email protection.", includes: ["EDR on every endpoint", "Email filtering", "Monthly patch reporting", "Business-hours response"] },
      { name: "Managed SOC", price: "$49", cadence: "/endpoint / month", summary: "24/7 detect & respond.", includes: ["Managed firewall", "24/7 SOC monitoring", "Threat hunting", "Immutable backups", "Incident response retainer"], highlight: true },
      { name: "Assurance", price: "Custom", cadence: "quote", summary: "VAPT, compliance and vCISO.", includes: ["Annual VAPT", "ISO 27001 / PCI gap analysis", "vCISO advisory", "Board-level reporting"] },
    ],
    faqs: [
      { q: "Do you cover incident response?", a: "Yes — managed customers get a 1-hour response SLA and forensic support included in the retainer." },
      { q: "Do you handle phishing simulations?", a: "Included at the Managed SOC tier — quarterly campaigns with reporting and follow-up training." },
    ],
  },
  {
    slug: "networking",
    title: "Networking Services",
    tagline: "Built to perform",
    blurb: "LAN/WAN design, VPN, structured cabling and 24/7 network monitoring across every branch.",
    features: ["LAN/WAN design", "VPN & VLAN", "Structured cabling", "Wi-Fi 6 rollout", "Network monitoring", "Firmware & config management"],
    overview: "Design and build networks that just work. From structured cabling and Wi-Fi 6 to VLAN segmentation and site-to-site VPN — with monitoring that catches issues before your users do.",
    useCases: ["New office fit-outs needing cabling, racks and Wi-Fi", "Hotels and retail chains needing guest + staff SSIDs", "Warehouses with barcode scanners and IoT that need reliable coverage"],
    packages: [
      { name: "Site Audit", price: "$249", cadence: "one-off", summary: "Full network health assessment.", includes: ["Cabling & rack audit", "Wi-Fi heatmap", "Security posture review", "Written remediation plan"] },
      { name: "Managed Network", price: "from $299", cadence: "/site / month", summary: "Fully-managed LAN + Wi-Fi.", includes: ["Managed switches & APs", "VLAN & VPN", "24/7 monitoring", "Firmware & config backups", "4-hour response SLA"], highlight: true },
      { name: "Design & Build", price: "Custom", cadence: "quote", summary: "Turnkey network project.", includes: ["Structured cabling", "Rack & core switching", "Wi-Fi 6 deployment", "Documentation & handover"] },
    ],
    faqs: [
      { q: "Do you install cabling?", a: "Yes — Cat6/6A, fibre and rack build-outs, all tested and certified." },
      { q: "What vendors do you use?", a: "Ubiquiti, MikroTik, Cisco Meraki, Aruba and FortiNet — chosen per site, not per contract." },
    ],
  },
  {
    slug: "cctv",
    title: "CCTV & Alarms",
    tagline: "Eyes everywhere",
    blurb: "Professional install of CCTV cameras, DVR systems, alarms and biometric access control.",
    features: ["IP & HD CCTV", "DVR + storage", "Alarms & access control", "Remote viewing", "Number-plate recognition", "Biometric time & attendance"],
    overview: "Protect people, assets and premises with professionally installed CCTV, alarms and access control. Every site is remotely viewable and integrated with our 24/7 monitoring desk.",
    useCases: ["Retail stores needing shrinkage reduction and remote monitoring", "Estates and factories with perimeter and gate control", "Offices needing biometric time & attendance"],
    packages: [
      { name: "Home / Shop", price: "from $649", cadence: "install", summary: "4-camera HD kit.", includes: ["4x HD cameras", "1 TB DVR", "Mobile viewing app", "12-month warranty"] },
      { name: "Business", price: "from $1,899", cadence: "install", summary: "8–16 IP cameras with NVR.", includes: ["8–16 IP cameras", "NVR + 4 TB storage", "Alarm integration", "Remote viewing", "Annual maintenance"], highlight: true },
      { name: "Enterprise", price: "Custom", cadence: "quote", summary: "Multi-site CCTV, ANPR and access control.", includes: ["Multi-site VMS", "ANPR & analytics", "Biometric access control", "24/7 monitoring desk"] },
    ],
    faqs: [
      { q: "Can we view cameras from our phones?", a: "Yes — every install ships with a secure mobile app for iOS and Android." },
      { q: "Do you monitor the alarms?", a: "Our enterprise tier includes 24/7 monitoring desk response and armed reaction coordination." },
    ],
  },
];

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
