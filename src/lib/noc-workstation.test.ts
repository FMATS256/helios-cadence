import { describe, it, expect } from "vitest";
import { isNocWorkstation } from "./department-access";
describe("NOC engineer workstation", () => {
  it("applies to NOC engineers", () => expect(isNocWorkstation(["noc"])).toBe(true));
  it("does not apply to finance", () => expect(isNocWorkstation(["finance"])).toBe(false));
  it("does not apply to account managers", () => expect(isNocWorkstation(["account_manager"])).toBe(false));
  it("does not apply to admins with tech roles", () => expect(isNocWorkstation(["noc", "master_admin"])).toBe(false));
});
