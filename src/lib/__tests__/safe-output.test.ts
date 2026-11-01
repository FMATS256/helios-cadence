import { describe, expect, it } from "vitest";
import { csvCell, escapeHtml, safeSearchTerm, maskEmail } from "../safe-output";

describe("safe output", () => {
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });
  it("keeps negative numbers as numbers", () => {
    expect(csvCell("-12.50")).toBe(`"-12.50"`);
  });
  it("escapes markup", () => {
    expect(escapeHtml("<img src=x onerror=1>")).toBe("&lt;img src=x onerror=1&gt;");
  });
  it("strips filter syntax from searches", () => {
    expect(safeSearchTerm("acme,id.eq.1)")).toBe("acme id eq 1");
  });
  it("masks emails in logs", () => {
    expect(maskEmail("farai@imtsolutions.co.zw")).toBe("fa***@imtsolutions.co.zw");
  });
});
