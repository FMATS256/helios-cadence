export type VendorId = "sophos" | "veeam" | "kaspersky" | "microsoft365" | "zoho";

export type VendorConfig = {
  id: VendorId;
  name: string;
  route: "/sophos" | "/veeam" | "/kaspersky" | "/microsoft-365" | "/zoho";
  tenantLabel: string;
  domainLabel?: string;
  regions?: { value: string; label: string }[];
  products: string[];
  credentialHint: string;
  envKeys: string[];
};

export const VENDORS: VendorConfig[] = [
  {
    id: "sophos", name: "Sophos", route: "/sophos", tenantLabel: "Sophos Central tenant",
    regions: [{ value: "eu", label: "Europe" }, { value: "us", label: "United States" }, { value: "ca", label: "Canada" }, { value: "au", label: "Australia" }],
    products: ["Intercept X Essentials", "Intercept X Advanced", "Intercept X Advanced with XDR", "MDR Essentials", "MDR Complete", "Intercept X for Server", "Email Security", "Firewall (XGS) Subscription", "Phish Threat"],
    credentialHint: "Client ID and Secret from Sophos Central Partner → API Management.",
    envKeys: ["SOPHOS_CLIENT_ID", "SOPHOS_CLIENT_SECRET"],
  },
  {
    id: "veeam", name: "Veeam", route: "/veeam", tenantLabel: "Veeam Service Provider Console company",
    products: ["Veeam Data Platform Foundation", "Veeam Data Platform Advanced", "Veeam Backup for Microsoft 365", "Veeam Agent for Windows", "Veeam Agent for Linux", "Veeam Cloud Connect Backup", "VCSP Rental (VUL)"],
    credentialHint: "Service Provider Console URL and API key from your Veeam VCSP partner account.",
    envKeys: ["VEEAM_VSPC_URL", "VEEAM_VSPC_API_KEY"],
  },
  {
    id: "kaspersky", name: "Kaspersky", route: "/kaspersky", tenantLabel: "Kaspersky Security Center group",
    products: ["Endpoint Security Cloud", "Endpoint Security Cloud Plus", "Endpoint Security Cloud Pro", "Endpoint Security for Business Select", "Endpoint Security for Business Advanced", "Kaspersky Security for Mail Server", "Kaspersky EDR Optimum", "Kaspersky MDR"],
    credentialHint: "Security Center server address and a read/write API account (or Business Hub API token).",
    envKeys: ["KASPERSKY_KSC_URL", "KASPERSKY_KSC_USER", "KASPERSKY_KSC_PASSWORD"],
  },
  {
    id: "microsoft365", name: "Microsoft 365", route: "/microsoft-365", tenantLabel: "Microsoft 365 tenant", domainLabel: "Tenant domain (e.g. client.onmicrosoft.com)",
    products: ["Microsoft 365 Business Basic", "Microsoft 365 Business Standard", "Microsoft 365 Business Premium", "Microsoft 365 E3", "Microsoft 365 E5", "Exchange Online (Plan 1)", "Exchange Online (Plan 2)", "Microsoft Teams Essentials", "Microsoft Defender for Business", "Power BI Pro", "Copilot for Microsoft 365"],
    credentialHint: "Partner Center app ID, secret and partner tenant ID (direct CSP or indirect provider such as Tarsus).",
    envKeys: ["MS_PARTNER_APP_ID", "MS_PARTNER_APP_SECRET", "MS_PARTNER_TENANT_ID"],
  },
  {
    id: "zoho", name: "Zoho", route: "/zoho", tenantLabel: "Zoho organisation", domainLabel: "Organisation domain",
    regions: [{ value: "com", label: "Global (.com)" }, { value: "eu", label: "Europe (.eu)" }, { value: "in", label: "India (.in)" }],
    products: ["Zoho Workplace Standard", "Zoho Workplace Professional", "Zoho Mail Lite", "Zoho Mail Premium", "Zoho One", "Zoho CRM Standard", "Zoho CRM Professional", "Zoho Books", "Zoho Desk", "Zoho People"],
    credentialHint: "Zoho Partner OAuth client ID, secret and refresh token from the Zoho partner console.",
    envKeys: ["ZOHO_PARTNER_CLIENT_ID", "ZOHO_PARTNER_CLIENT_SECRET", "ZOHO_PARTNER_REFRESH_TOKEN"],
  },
];

export const vendorById = (id: VendorId) => VENDORS.find((v) => v.id === id)!;

/** Days until expiry (negative = expired). */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00Z").getTime();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((d - t) / 86_400_000);
}

export function renewalState(days: number | null): "expired" | "due" | "soon" | "ok" | "unknown" {
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "due";
  if (days <= 60) return "soon";
  return "ok";
}
