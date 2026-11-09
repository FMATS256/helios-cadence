export type HostingPackage = {
  name: string;
  diskMb: number | null;
  bandwidthMb: number | null;
  emailAccounts: number | null;
  databases: number | null;
  addonDomains: number | null;
};

export type HostingPackageServer = {
  id: string;
  name: string;
  isDefault: boolean;
  nameservers: string[];
  packages: HostingPackage[];
  error: string | null;
};

function limit(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text || text === "unlimited" || text === "0") return null;
  const parsed = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** WHM listpkgs has returned both an array and { pkg: [...] } across versions. */
export function normalizeWhmPackages(payload: unknown): HostingPackage[] {
  const source = payload as any;
  const rows = Array.isArray(source)
    ? source
    : Array.isArray(source?.pkg)
      ? source.pkg
      : Array.isArray(source?.package)
        ? source.package
        : Array.isArray(source?.packages)
          ? source.packages
          : [];

  return rows
    .map((row: any): HostingPackage | null => {
      const name = String(row?.name ?? row?.NAME ?? "").trim();
      if (!name) return null;
      return {
        name,
        diskMb: limit(row?.DISKSPACE ?? row?.diskspace ?? row?.QUOTA ?? row?.quota),
        bandwidthMb: limit(row?.BWLIMIT ?? row?.bwlimit),
        emailAccounts: limit(row?.MAXPOP ?? row?.maxpop),
        databases: limit(row?.MAXSQL ?? row?.maxsql),
        addonDomains: limit(row?.MAXADDON ?? row?.maxaddon),
      };
    })
    .filter((row: HostingPackage | null): row is HostingPackage => Boolean(row))
    .sort((a: HostingPackage, b: HostingPackage) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function packageLimit(value: number | null, unit = ""): string {
  return value == null ? "Unlimited" : `${value.toLocaleString()}${unit}`;
}

export function megabytesToGb(value: number | null): number | null {
  return value == null ? null : Math.round((value / 1024) * 100) / 100;
}
