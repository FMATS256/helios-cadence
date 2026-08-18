import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAddresses } from "./geocode.server";

export type MapSite = {
  id: string;
  kind: "customer" | "branch" | "starlink" | "nas" | "asset" | "stock";
  label: string;
  address: string;
  customer_name: string | null;
  account_number: string | null;
  status: string | null;
  detail: string | null;
  lat: number | null;
  lng: number | null;
  resolved_address: string | null;
};

const norm = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

export const getServiceMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb: any = context.supabase;

    const [customersRes, branchesRes, starlinkRes, nasRes, assetsRes, stockRes] = await Promise.all([
      sb.from("customers").select("id,account_number,company_name,status,billing_address").is("archived_at", null),
      sb.from("customer_branches").select("id,customer_id,account_number,name,address,city,country,is_headquarters").is("archived_at", null),
      sb.from("starlink_accounts").select("id,customer_id,account_number,service_address,plan_type,status,kit_serial").is("archived_at", null),
      sb.from("managed_nas_accounts").select("id,customer_id,account_number,name,location,status,vendor,capacity_tb").is("archived_at", null),
      sb.from("assets").select("id,customer_id,account_number,asset_tag,asset_type,make,model,location,status").is("archived_at", null).not("location", "is", null),
      sb.from("inventory_items").select("id,name,sku,location,quantity").is("archived_at", null).not("location", "is", null),
    ]);

    const customers = (customersRes.data ?? []) as any[];
    const byId = new Map(customers.map((c) => [c.id, c]));
    const nameOf = (cid?: string | null) => (cid ? byId.get(cid)?.company_name ?? null : null);
    const acctOf = (cid?: string | null) => (cid ? byId.get(cid)?.account_number ?? null : null);

    const sites: MapSite[] = [];
    const push = (s: Omit<MapSite, "lat" | "lng" | "resolved_address">) => {
      if (!s.address) return;
      sites.push({ ...s, lat: null, lng: null, resolved_address: null });
    };

    for (const c of customers) {
      push({
        id: `customer:${c.id}`, kind: "customer", label: c.company_name,
        address: norm(c.billing_address), customer_name: c.company_name,
        account_number: c.account_number, status: c.status, detail: "Billing address",
      });
    }
    for (const b of (branchesRes.data ?? []) as any[]) {
      push({
        id: `branch:${b.id}`, kind: "branch", label: b.name || "Branch",
        address: norm([b.address, b.city, b.country].filter(Boolean).join(", ")),
        customer_name: nameOf(b.customer_id), account_number: b.account_number ?? acctOf(b.customer_id),
        status: b.is_headquarters ? "headquarters" : "branch",
        detail: b.is_headquarters ? "Head office" : "Branch site",
      });
    }
    for (const s of (starlinkRes.data ?? []) as any[]) {
      push({
        id: `starlink:${s.id}`, kind: "starlink", label: `Starlink ${s.plan_type ?? ""}`.trim(),
        address: norm(s.service_address), customer_name: nameOf(s.customer_id),
        account_number: s.account_number ?? acctOf(s.customer_id), status: s.status,
        detail: s.kit_serial ? `Kit ${s.kit_serial}` : "Starlink terminal",
      });
    }
    for (const n of (nasRes.data ?? []) as any[]) {
      push({
        id: `nas:${n.id}`, kind: "nas", label: n.name || "Managed NAS",
        address: norm(n.location), customer_name: nameOf(n.customer_id),
        account_number: n.account_number ?? acctOf(n.customer_id), status: n.status,
        detail: [n.vendor, n.capacity_tb ? `${n.capacity_tb} TB` : null].filter(Boolean).join(" · ") || "Managed NAS",
      });
    }
    for (const a of (assetsRes.data ?? []) as any[]) {
      push({
        id: `asset:${a.id}`, kind: "asset", label: a.asset_tag || [a.make, a.model].filter(Boolean).join(" ") || "Asset",
        address: norm(a.location), customer_name: nameOf(a.customer_id),
        account_number: a.account_number ?? acctOf(a.customer_id), status: a.status,
        detail: [a.asset_type, a.make, a.model].filter(Boolean).join(" · ") || "Deployed asset",
      });
    }
    for (const i of (stockRes.data ?? []) as any[]) {
      push({
        id: `stock:${i.id}`, kind: "stock", label: i.name,
        address: norm(i.location), customer_name: null, account_number: null,
        status: "stock", detail: `${i.sku ?? ""} · qty ${i.quantity ?? 0}`.replace(/^ · /, ""),
      });
    }

    const geo = await resolveAddresses(sb, sites.map((s) => s.address));
    for (const s of sites) {
      const hit = geo.get(s.address);
      if (hit) { s.lat = hit.lat; s.lng = hit.lng; s.resolved_address = hit.display_name; }
    }

    const located = sites.filter((s) => s.lat != null);
    const pending = sites.length - located.length;
    const kinds = sites.reduce<Record<string, number>>((acc, s) => {
      acc[s.kind] = (acc[s.kind] ?? 0) + 1;
      return acc;
    }, {});

    return {
      sites,
      stats: {
        total: sites.length,
        located: located.length,
        pending,
        customers: kinds.customer ?? 0,
        branches: kinds.branch ?? 0,
        starlink: kinds.starlink ?? 0,
        nas: kinds.nas ?? 0,
        assets: kinds.asset ?? 0,
        stock: kinds.stock ?? 0,
        cities: new Set(
          located.map((s) => (s.resolved_address ?? "").split(",").slice(-3, -2)[0]?.trim()).filter(Boolean),
        ).size,
      },
    };
  });
