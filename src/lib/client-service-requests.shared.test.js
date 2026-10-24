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
describe("upgrade and add-on forms", () => {
  it("Starlink upgrade does not ask for installation address", () => { expect(missingRequired("connectivity", {}, "upgrade")).toEqual([]); });
  it("Microsoft 365 add user requires name and email", () => { expect(missingRequired("m365", {}, "addon")).toEqual(["New user's full name", "Email address wanted"]); });
  it("VoIP add extension requires the user's name", () => { expect(missingRequired("voip", {}, "addon")).toEqual(["Extension user's name"]); });
});
