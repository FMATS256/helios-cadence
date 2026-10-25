const keys = ["services", "starlink", "licenses", "hosting", "storage", "assets"] as const;
export function activePortalServices(data: Record<string, any>) {
  return Object.fromEntries(keys.map((key) => [key, (data[key] ?? []).filter((row: { status: string }) => ["active", "installed", "in_use", "operational"].includes(row.status.toLowerCase()))]));
}