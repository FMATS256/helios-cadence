import { describe, it, expect } from "vitest";
import { missingRequired, describeRequest } from "./client-service-requests.shared";
describe("client service requests", () => {
  it("VoIP requires number of extensions", () => { expect(missingRequired("voip", {})).toEqual(["Number of extensions"]); });
  it("Microsoft 365 requires the user list", () => { expect(missingRequired("m365", { users: "Jane — j@x.co" })).toEqual([]); });
  it("upgrade awaits account manager confirmation", () => {
    const r = describeRequest({ type: "upgrade", catalog_id: null, current_service: "Starlink residential", quantity: 1, details: {}, notes: "" }, { name: "Starlink Business", code: "SL-BIZ", category: "connectivity", unit_price: 120, currency: "USD", billing_cycle: "monthly" });
    expect(r.subject).toBe("Plan upgrade request: Starlink Business");
    expect(r.description).toContain("awaiting account manager confirmation");
  });
});
