import { describe, it, expect } from "vitest";
import { canOpenPage } from "./department-access";

describe("department page access", () => {
  it("account managers cannot open Finance", () => expect(canOpenPage("/finance", ["account_manager"])).toBe(false));
  it("NOC engineers cannot open Quotations", () => expect(canOpenPage("/quotes", ["noc"])).toBe(false));
  it("Finance cannot open the Credential Vault", () => expect(canOpenPage("/techops/vault", ["finance"])).toBe(false));
  it("Finance cannot open NOC Command", () => expect(canOpenPage("/noc", ["finance"])).toBe(false));
  it("every department can open client accounts", () => {
    for (const r of ["finance", "noc", "account_manager"]) expect(canOpenPage("/customers/M10460", [r])).toBe(true);
  });
  it("account managers can open their hub", () => expect(canOpenPage("/account-manager", ["key_account_manager"])).toBe(true));
  it("operations managers open department pages but not Permissions", () => {
    expect(canOpenPage("/finance", ["operations_manager"])).toBe(true);
    expect(canOpenPage("/admin", ["operations_manager"])).toBe(false);
  });
});

describe("department page access v2", () => {
  it("NOC engineers can see payments", () => expect(canOpenPage("/payments", ["noc"])).toBe(true));
  it("NOC engineers still cannot see expenses", () => expect(canOpenPage("/expenses", ["noc"])).toBe(false));
  it("Finance can view service pages", () => expect(canOpenPage("/starlink", ["finance"])).toBe(true));
  it("account managers can open Reports", () => expect(canOpenPage("/reports", ["account_manager"])).toBe(true));
  it("read-only staff can open Reports but not Finance", () => {
    expect(canOpenPage("/reports", ["read_only"])).toBe(true);
    expect(canOpenPage("/finance", ["read_only"])).toBe(false);
  });
});
