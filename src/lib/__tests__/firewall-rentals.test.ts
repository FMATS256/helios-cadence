import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

// FortiGate month-to-month rentals: $185 small unit, $270 large unit, all-inclusive.
// The catalogue rows are the prices staff quote and auto-bill from, so they are checked
// against the live service catalogue rather than a copy in code.
function catalogueRows(): any[] {
  const out = execFileSync(
    "lovable",
    ["supabase", "query", "select code, name, unit_price::numeric as price, billing_cycle, currency, is_active, description from service_catalog where category='firewall' order by code"],
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

describe("FortiGate firewall rentals", () => {
  const rows = catalogueRows();
  const small = rows.find((r) => r.code === "FW-FG-SMALL");
  const large = rows.find((r) => r.code === "FW-FG-LARGE");

  it("lists the small FortiGate unit at $185 per month", () => {
    expect(Number(small?.price)).toBe(185);
    expect(small?.billing_cycle).toBe("monthly");
    expect(small?.currency).toBe("USD");
    expect(small?.is_active).toBe(true);
  });

  it("lists the large FortiGate unit at $270 per month", () => {
    expect(Number(large?.price)).toBe(270);
    expect(large?.billing_cycle).toBe("monthly");
    expect(large?.currency).toBe("USD");
    expect(large?.is_active).toBe(true);
  });

  it("prices both units as all-inclusive of unit rental, licence, subscription and support", () => {
    for (const row of [small, large]) {
      const text = `${row?.description ?? ""}`.toLowerCase();
      for (const part of ["rental", "license", "subscription", "support"]) expect(text).toContain(part);
    }
  });

  it("keeps only the two agreed firewall rental services", () => {
    expect(rows.map((r) => r.code)).toEqual(["FW-FG-LARGE", "FW-FG-SMALL"]);
  });
});
