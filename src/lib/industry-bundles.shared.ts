// Industry quotation bundles: named sets of existing catalogue codes. Prices always
// come from the live catalogue at quote time, so margins stay managed in one place.
export type BundleItem = { code: string; qty: number };
export type IndustryBundle = { key: string; name: string; market: string; items: BundleItem[]; notes: string };

export const INDUSTRY_BUNDLES: IndustryBundle[] = [
  { key: "clinic", name: "Clinic Cloud", market: "Hospitals & clinics",
    items: [{ code: "CLINIC-SILVER", qty: 1 }, { code: "CLOUD-BUSINESS", qty: 1 }, { code: "ADDON-BACKUP-30D", qty: 1 }, { code: "ADDON-SEC-HARDEN", qty: 1 }, { code: "ADDON-24-7-MON", qty: 1 }],
    notes: "Clinical/HMS software licences are quoted separately. Access via VPN with MFA; encrypted, retained backups with restore tests." },
  { key: "legal", name: "Legal Private Cloud", market: "Law firms",
    items: [{ code: "LEGAL-SILVER", qty: 1 }, { code: "ADDON-BACKUP-30D", qty: 1 }, { code: "ADDON-SEC-HARDEN", qty: 1 }, { code: "CYBER-STARTER", qty: 1 }],
    notes: "Includes secure document storage, VPN access with MFA and per-user permissions." },
  { key: "accounting", name: "Accounting Cloud", market: "Accounting firms",
    items: [{ code: "ACCT-SILVER", qty: 1 }, { code: "ADDON-MGD-DB", qty: 1 }, { code: "ADDON-BACKUP-30D", qty: 1 }, { code: "ADDON-24-7-MON", qty: 1 }, { code: "ADDON-MIGRATION", qty: 1 }],
    notes: "Sage/QuickBooks/Palladium and SQL Server licences are quoted separately. Remote Desktop only via VPN. Performance subject to measured latency from your office." },
  { key: "business", name: "Business Cloud", market: "SMEs",
    items: [{ code: "VPS-STARTER", qty: 1 }, { code: "MAIL-SRV-ENTRY", qty: 1 }, { code: "NC-SRV-ENTRY", qty: 1 }, { code: "ADDON-BACKUPS", qty: 1 }],
    notes: "Server, business email, shared files and automated backups." },
  { key: "voice", name: "Enterprise Voice", market: "Corporates",
    items: [{ code: "VOIP-SRV-SILVER", qty: 1 }, { code: "VOIP-EXT", qty: 20 }, { code: "VOIP-DID", qty: 2 }, { code: "ADDON-PRIO-SLA", qty: 1 }],
    notes: "Hosted 3CX/FreePBX with IVR. Adjust extension and number quantities to suit. Handsets quoted separately." },
  { key: "dr", name: "Disaster Recovery", market: "All industries",
    items: [{ code: "BKP-SRV-SILVER", qty: 1 }, { code: "CLOUD-BACKUP-SRV", qty: 1 }, { code: "ADDON-BACKUP-30D", qty: 1 }, { code: "ADDON-24-7-MON", qty: 1 }],
    notes: "Snapshots, offsite backups and quarterly restore tests." },
];

type CatalogRow = { code?: string | null; name: string; price: number; billing_cycle?: string | null };

/** Resolve a bundle against the live catalogue; codes not on sale are reported, never priced. */
export function resolveBundle(bundle: IndustryBundle, catalog: CatalogRow[]) {
  const byCode = new Map(catalog.filter((c) => c.code).map((c) => [String(c.code), c]));
  const lines: { row: CatalogRow; qty: number }[] = [];
  const missing: string[] = [];
  for (const it of bundle.items) {
    const row = byCode.get(it.code);
    if (row) lines.push({ row, qty: it.qty }); else missing.push(it.code);
  }
  const monthly = lines.reduce((s, l) => s + l.row.price * l.qty, 0);
  return { lines, missing, monthly: Math.round(monthly * 100) / 100 };
}
