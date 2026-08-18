/**
 * Maps a service_catalog category to the operational table that must be
 * created when the service is assigned to a customer from Customer 360.
 */

export type ProvisionInput = Record<string, string | undefined>;

export type ProvisionField = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

export type ProvisionKind =
  | "starlink"
  | "hosting"
  | "domain"
  | "cloud-storage"
  | "managed-nas"
  | "vps"
  | "license"
  | "voip"
  | "cloud"
  | "none";

/** Shared with the client via service-provision.shared.ts (kept in sync). */
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

type Ctx = {
  admin: any;
  customerId: string;
  accountNumber: string;
  userId: string;
  catalog: any;
  quantity: number;
  unitPrice: number;
  provision: ProvisionInput;
};

function monthlyOf(amount: number, cycle: string) {
  const c = (cycle || "monthly").toLowerCase();
  if (c.startsWith("annual") || c === "yearly") return amount / 12;
  if (c.startsWith("quarter")) return amount / 3;
  if (c.startsWith("week")) return (amount * 52) / 12;
  if (c.startsWith("day") || c === "daily") return (amount * 365) / 12;
  if (c.includes("one")) return 0;
  return amount;
}

/**
 * Creates the operational record for an assigned catalog item.
 * Returns { table, id } when a record was created, otherwise null.
 */
export async function provisionServiceRecord(ctx: Ctx): Promise<{ table: string; id: string } | null> {
  const { admin, catalog, provision } = ctx;
  const kind = kindForCategory(catalog.category);
  const monthly = Number(monthlyOf(ctx.unitPrice * ctx.quantity, catalog.billing_cycle).toFixed(2));
  const base = { customer_id: ctx.customerId, account_number: ctx.accountNumber, created_by: ctx.userId };
  const renewal = nextRenewal(catalog.billing_cycle);

  const insert = async (table: string, payload: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).insert(payload as any).select("id").single();
    if (error) throw new Error(`${table}: ${error.message}`);
    return { table, id: data.id as string };
  };

  switch (kind) {
    case "starlink":
      return insert("starlink_accounts", {
        ...base,
        plan_type: /BIZ|BUS/i.test(catalog.code) ? "business" : "residential",
        monthly_price: ctx.unitPrice,
        service_address: provision.service_address?.trim() || null,
        kit_serial: provision.kit_serial?.trim() || null,
        starlink_account_number: provision.starlink_account_number?.trim() || null,
        status: "active",
        notes: catalog.name,
      });

    case "hosting":
      if (!provision.domain?.trim()) throw new Error(`${catalog.name}: domain is required`);
      return insert("web_hosting_accounts", {
        ...base,
        domain: provision.domain.trim().toLowerCase(),
        plan: catalog.name,
        provider: provision.provider?.trim() || "IMT Solutions",
        control_panel: "cPanel",
        username: provision.username?.trim() || null,
        monthly_cost: monthly,
        currency: catalog.currency || "USD",
        status: "active",
        provisioning_status: "manual",
        renewal_date: renewal,
      });

    case "domain":
      if (!provision.domain?.trim()) throw new Error(`${catalog.name}: domain is required`);
      return insert("cloud_services", {
        ...base,
        service_type: "Domain",
        service_name: provision.domain.trim().toLowerCase(),
        vendor: provision.provider?.trim() || "IMT Solutions",
        plan: catalog.name,
        seats: 1,
        monthly_cost: monthly,
        status: "active",
        renewal_date: renewal,
      });

    case "cloud-storage":
      return insert("cloud_storage_accounts", {
        ...base,
        name: provision.name?.trim() || `${catalog.name}`,
        provider: provision.provider?.trim() || "IMT Cloud",
        storage_tb: Number(provision.storage_tb) || null,
        monthly_cost: monthly,
        currency: catalog.currency || "USD",
        status: "active",
        provisioning_status: "manual",
        renewal_date: renewal,
      });

    case "managed-nas":
      return insert("managed_nas_accounts", {
        ...base,
        name: provision.name?.trim() || catalog.name,
        vendor: provision.vendor?.trim() || "Synology",
        model: provision.model?.trim() || null,
        serial_number: provision.serial_number?.trim() || null,
        capacity_tb: Number(provision.capacity_tb) || null,
        location: provision.location?.trim() || null,
        monthly_cost: monthly,
        currency: catalog.currency || "USD",
        status: "active",
        renewal_date: renewal,
      });

    case "vps":
    case "cloud":
      return insert("cloud_services", {
        ...base,
        service_type: kind === "vps" ? "VPS" : "Cloud",
        service_name: provision.name?.trim() || catalog.name,
        vendor: provision.provider?.trim() || "IMT Cloud",
        plan: catalog.code,
        seats: ctx.quantity,
        monthly_cost: monthly,
        status: "active",
        renewal_date: renewal,
        notes: provision.hostname?.trim() ? `Hostname: ${provision.hostname.trim()}` : null,
      });

    case "license":
      return insert("licenses", {
        ...base,
        product: catalog.name,
        vendor: provision.vendor?.trim() || (/^M365/i.test(catalog.code) ? "Microsoft" : null),
        category: catalog.category,
        seats: ctx.quantity,
        license_key: provision.license_key?.trim() || null,
        cost: ctx.unitPrice * ctx.quantity,
        currency: catalog.currency || "USD",
        purchase_date: new Date().toISOString().slice(0, 10),
        expiry_date: renewal,
        status: "active",
        auto_renew: true,
      });

    case "voip":
      if (!provision.voip_number?.trim()) throw new Error(`${catalog.name}: VoIP number is required`);
      return insert("voip_accounts", {
        ...base,
        voip_number: provision.voip_number.trim(),
        sip_username: provision.sip_username?.trim() || null,
        extensions: Number(provision.extensions) || ctx.quantity,
        status: "active",
      });

    default:
      return null;
  }
}

function nextRenewal(cycle: string): string | null {
  const c = (cycle || "monthly").toLowerCase();
  const d = new Date();
  if (c.includes("one")) return null;
  if (c.startsWith("annual") || c === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (c.startsWith("quarter")) d.setMonth(d.getMonth() + 3);
  else if (c.startsWith("week")) d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
