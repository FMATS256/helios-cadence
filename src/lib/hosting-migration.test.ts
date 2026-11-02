import { describe, it, expect } from "vitest";
import { readMigration, writeMigration, nextStage, pointsToImt } from "./hosting-migration";

describe("hosting migration workflow", () => {
  it("keeps staff notes and round-trips migration state", () => {
    const n = writeMigration("Old note", { type: "cpanel_full", stage: "requested", history: [] });
    expect(n.startsWith("Old note")).toBe(true);
    expect(readMigration(n)?.stage).toBe("requested");
  });
  it("advances in order and stops after completed", () => {
    expect(nextStage("backup_received")).toBe("target_created");
    expect(nextStage("completed")).toBeNull();
  });
  it("detects DNS pointing to IMT by IP or nameserver", () => {
    expect(pointsToImt(["1.2.3.4"], [], "1.2.3.4", null)).toBe(true);
    expect(pointsToImt(["9.9.9.9"], ["ns1.zwcpanel.com"], null, "server.zwcpanel.com")).toBe(true);
    expect(pointsToImt(["9.9.9.9"], ["ns1.godaddy.com"], "1.2.3.4", "server.zwcpanel.com")).toBe(false);
  });
});
