import { describe, expect, it } from "vitest";
import { megabytesToGb, normalizeWhmPackages, packageLimit } from "./hosting-packages";

describe("WHM hosting packages", () => {
  it("reads real package limits from the WHM pkg response", () => {
    const packages = normalizeWhmPackages({
      pkg: [{
        name: "imthosti_Business",
        DISKSPACE: "10240",
        BWLIMIT: "51200",
        MAXPOP: "25",
        MAXSQL: "10",
        MAXADDON: "5",
      }],
    });

    expect(packages).toEqual([{
      name: "imthosti_Business",
      diskMb: 10240,
      bandwidthMb: 51200,
      emailAccounts: 25,
      databases: 10,
      addonDomains: 5,
    }]);
    expect(megabytesToGb(packages[0].diskMb)).toBe(10);
  });

  it("supports array responses, ignores malformed rows and treats zero as unlimited", () => {
    const packages = normalizeWhmPackages([
      { NAME: "Starter", DISKSPACE: "unlimited", BWLIMIT: "0", MAXPOP: "0" },
      { DISKSPACE: "100" },
    ]);

    expect(packages).toHaveLength(1);
    expect(packages[0].name).toBe("Starter");
    expect(packageLimit(packages[0].diskMb, " MB")).toBe("Unlimited");
    expect(packageLimit(packages[0].bandwidthMb, " MB")).toBe("Unlimited");
  });
});
