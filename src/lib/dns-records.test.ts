import { describe, it, expect } from "vitest";
import { validateDnsRecord, fqdn } from "./dns-records";

describe("dns record editor rules", () => {
  it("rejects A record without a valid IPv4", () => {
    expect(validateDnsRecord({ type: "A", name: "@", value: "300.1.1.1" })).not.toBeNull();
    expect(validateDnsRecord({ type: "A", name: "www", value: "45.76.1.2" })).toBeNull();
  });
  it("requires MX priority", () => {
    expect(validateDnsRecord({ type: "MX", name: "@", value: "mail.example.com" })).not.toBeNull();
    expect(validateDnsRecord({ type: "MX", name: "@", value: "mail.example.com", priority: 10 })).toBeNull();
  });
  it("only allows A, MX and NS", () => {
    expect(validateDnsRecord({ type: "TXT" as any, name: "@", value: "x" })).not.toBeNull();
  });
  it("qualifies names to the zone", () => {
    expect(fqdn("@", "acme.co.zw")).toBe("acme.co.zw.");
    expect(fqdn("www", "acme.co.zw")).toBe("www.acme.co.zw.");
  });
});
