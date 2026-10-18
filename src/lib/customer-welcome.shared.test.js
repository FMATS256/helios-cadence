import { expect, test } from "bun:test";
import { welcomeDetails } from "./customer-welcome.shared";
const customer = { company_name: "Test Client", account_number: "M10457" };
const manager = { full_name: "Tendai Moyo", email: "tendai.moyo@imtsolutions.co.zw" };
test("welcome sends from the assigned manager's actual IMT address", () => {
  expect(welcomeDetails(customer, manager).from).toBe("tendai.moyo@imtsolutions.co.zw");
});
test("welcome contains the assigned manager and account number", () => {
  const result = welcomeDetails(customer, manager);
  expect(result.body).toContain("Tendai Moyo");
  expect(result.body).toContain("M10457");
});
test("welcome includes an available service", () => {
  expect(welcomeDetails(customer, manager, ["Microsoft 365 Business Standard"]).body).toContain("Microsoft 365 Business Standard");
});
test("welcome does not invent services when none are assigned", () => {
  expect(welcomeDetails(customer, manager, []).body).not.toContain("Your services:");
});
test("welcome does not substitute an external manager mailbox", () => {
  expect(() => welcomeDetails(customer, { ...manager, email: "manager@example.com" })).toThrow();
});