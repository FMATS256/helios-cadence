export type ProvisionKind =
  | "starlink" | "hosting" | "domain" | "cloud-storage" | "managed-nas"
  | "vps" | "license" | "voip" | "cloud" | "none";

export type ProvisionField = { key: string; label: string; required?: boolean; placeholder?: string; type?: "text" | "number" };

export function kindForCategory(category: string): ProvisionKind {
  switch ((category || "").toLowerCase()) {
    case "connectivity": return "starlink";
    case "hosting":
    case "email-hosting": return "hosting";
    case "domain": return "domain";
    case "cloud-storage": return "cloud-storage";
    case "managed-nas": return "managed-nas";
    case "vps": return "vps";
    case "m365":
    case "productivity":
    case "licensing": return "license";
    case "voip": return "voip";
    case "cloud": return "cloud";
    default: return "none";
  }
}

export const PROVISION_FIELDS: Record<ProvisionKind, ProvisionField[]> = {
  starlink: [
    { key: "service_address", label: "Service address", placeholder: "Site / installation address" },
    { key: "kit_serial", label: "Kit serial" },
    { key: "starlink_account_number", label: "Starlink account #" },
  ],
  hosting: [
    { key: "domain", label: "Domain", required: true, placeholder: "example.co.zw" },
    { key: "username", label: "cPanel username" },
    { key: "provider", label: "Provider" },
  ],
  domain: [
    { key: "domain", label: "Domain name", required: true, placeholder: "example.co.zw" },
    { key: "provider", label: "Registrar" },
  ],
  "cloud-storage": [
    { key: "name", label: "Workspace name" },
    { key: "storage_tb", label: "Storage (TB)", type: "number" },
    { key: "provider", label: "Provider" },
  ],
  "managed-nas": [
    { key: "name", label: "NAS name" },
    { key: "vendor", label: "Vendor", placeholder: "Synology" },
    { key: "model", label: "Model" },
    { key: "serial_number", label: "Serial number" },
    { key: "capacity_tb", label: "Capacity (TB)", type: "number" },
    { key: "location", label: "Location" },
  ],
  vps: [
    { key: "name", label: "Server label" },
    { key: "hostname", label: "Hostname" },
    { key: "provider", label: "Provider", placeholder: "Kamatera" },
  ],
  cloud: [
    { key: "name", label: "Service label" },
    { key: "provider", label: "Provider" },
  ],
  license: [
    { key: "vendor", label: "Vendor", placeholder: "Microsoft" },
    { key: "license_key", label: "License key" },
  ],
  voip: [
    { key: "voip_number", label: "VoIP number", required: true, placeholder: "+263..." },
    { key: "sip_username", label: "SIP username" },
    { key: "extensions", label: "Extensions", type: "number" },
  ],
  none: [],
};

export const KIND_LABEL: Record<ProvisionKind, string> = {
  starlink: "Starlink account", hosting: "Hosting account", domain: "Domain",
  "cloud-storage": "Cloud storage account", "managed-nas": "Managed NAS",
  vps: "VPS / cloud service", cloud: "Cloud service", license: "License",
  voip: "VoIP account", none: "",
};
