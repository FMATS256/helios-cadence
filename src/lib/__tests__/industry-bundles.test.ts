import { describe, it, expect } from "vitest";
import { INDUSTRY_BUNDLES, resolveBundle } from "../industry-bundles.shared";

const voice = INDUSTRY_BUNDLES.find((b) => b.key === "voice")!;
describe("industry bundles", () => {
  it("has the six bundles from the brief", () => expect(INDUSTRY_BUNDLES.map((b) => b.name)).toEqual(["Clinic Cloud", "Legal Private Cloud", "Accounting Cloud", "Business Cloud", "Enterprise Voice", "Disaster Recovery"]));
  it("prices from catalogue times quantity", () => {
    const r = resolveBundle(voice, [{ code: "VOIP-SRV-SILVER", name: "PBX", price: 49 }, { code: "VOIP-EXT", name: "Ext", price: 2.5 }, { code: "VOIP-DID", name: "DID", price: 5 }, { code: "ADDON-PRIO-SLA", name: "SLA", price: 35 }]);
    expect(r.monthly).toBe(144);
  });
  it("reports codes that are not on sale instead of pricing them", () => {
    const r = resolveBundle(voice, [{ code: "VOIP-EXT", name: "Ext", price: 2.5 }]);
    expect(r.missing).toEqual(["VOIP-SRV-SILVER", "VOIP-DID", "ADDON-PRIO-SLA"]);
  });
});
