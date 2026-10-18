import { test, expect } from "bun:test";
import { websiteAccountSchema } from "./website-accounts.shared";
import { preferredRolesFor } from "./account-managers.shared";

test("personal clients prefer customer account managers", () => {
  expect(preferredRolesFor("personal")[0]).toBe("customer_account_manager");
});
test("companies prefer general account managers", () => {
  expect(preferredRolesFor("company")[0]).toBe("account_manager");
});
test("corporates prefer corporate account managers", () => {
  expect(preferredRolesFor("corporate")[0]).toBe("corporate_account_manager");
});
test("key accounts prefer key account managers", () => {
  expect(preferredRolesFor("key_account")[0]).toBe("key_account_manager");
});
test("website applications cannot select their own manager", () => {
  expect(websiteAccountSchema.safeParse({ external_id: "web-1", category: "personal", name: "Test Client", contact_name: "Test Client", email: "test@example.com", phone: "+26312345", account_manager_id: "chosen-id" }).success).toBe(false);
});