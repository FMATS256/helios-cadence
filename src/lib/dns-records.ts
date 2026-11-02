/** Validation for staff-edited DNS records (A, MX, NS) in a hosted zone. */
export type DnsRecordInput = { type: "A" | "MX" | "NS"; name: string; value: string; priority?: number; ttl?: number };

const HOST = /^(?=.{1,253}$)([a-z0-9_]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.?$/i;

export function isIPv4(v: string) {
  const p = v.split(".");
  return p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x) && Number(x) <= 255);
}

/** Returns an error message, or null when the record is acceptable. */
export function validateDnsRecord(r: DnsRecordInput): string | null {
  if (!["A", "MX", "NS"].includes(r.type)) return "Only A, MX and NS records can be edited here";
  const name = r.name.trim();
  if (name !== "@" && !HOST.test(name)) return "Name must be @ or a valid host name";
  const value = r.value.trim();
  if (r.type === "A" && !isIPv4(value)) return "A record needs a valid IPv4 address";
  if (r.type !== "A" && !HOST.test(value)) return `${r.type} record needs a valid host name`;
  if (r.type === "MX") {
    const p = r.priority ?? -1;
    if (!Number.isInteger(p) || p < 0 || p > 65535) return "MX priority must be 0–65535";
  }
  const ttl = r.ttl ?? 14400;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 604800) return "TTL must be between 60 and 604800 seconds";
  return null;
}

/** Convert "@"/relative names into the fully-qualified form WHM expects. */
export function fqdn(name: string, domain: string) {
  const n = name.trim().replace(/\.$/, "");
  if (n === "@" || n === "") return `${domain}.`;
  if (n === domain || n.endsWith(`.${domain}`)) return `${n}.`;
  return `${n}.${domain}.`;
}
