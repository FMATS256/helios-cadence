import { describe, it, expect } from "vitest";
import { classifyIdentifier, usernameBase, temporaryPassword } from "./portal-login.shared";
import { welcomeDetails } from "./customer-welcome.shared";
describe("portal login", () => {
  it("accepts email, account number and username", () => {
    expect(classifyIdentifier(" Jane@X.com ")).toEqual({ kind: "email", value: "jane@x.com" });
    expect(classifyIdentifier("m10460")).toEqual({ kind: "account", value: "M10460" });
    expect(classifyIdentifier("UK2Africa")).toEqual({ kind: "username", value: "uk2africa" });
  });
  it("builds usernames from company name", () => { expect(usernameBase("UK2Africa Ltd", "M10460")).toBe("uk2africa.ltd"); expect(usernameBase("@@", "M10460")).toBe("m10460"); });
  it("generates strong temporary passwords", () => { const p = temporaryPassword(); expect(p.length).toBe(17); expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/\d/); });
  it("welcome email carries username and password", () => {
    const d = welcomeDetails({ company_name: "Acme", account_number: "M10470" }, { full_name: "Tendai Moyo", email: "tendai@imtsolutions.co.zw" }, [], { username: "acme", password: "Secret-Pass#Ka7", email: "a@b.com", url: "https://x/client" });
    expect(d.body).toContain("Username: acme"); expect(d.body).toContain("Temporary password: Secret-Pass#Ka7");
  });
});
