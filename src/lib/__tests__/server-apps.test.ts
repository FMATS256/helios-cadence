import { describe, it, expect } from "vitest";
import { needsApproval } from "../server-apps";
describe("server action approval", () => {
  it("rebuild, restore and app install need manager approval", () => {
    expect(needsApproval("rebuild")).toBe(true);
    expect(needsApproval("restore_snapshot")).toBe(true);
    expect(needsApproval("install_app")).toBe(true);
  });
  it("reboot does not", () => expect(needsApproval("reboot")).toBe(false));
});
