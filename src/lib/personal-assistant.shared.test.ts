import { describe, it, expect } from "vitest";
import { allowedAssistantRoles } from "./personal-assistant.shared";
describe("assistant roles", () => {
  it("general task gets every enabled role", () => expect(allowedAssistantRoles(["email_summary", "daily_briefing"], "general")).toEqual(["email_summary", "daily_briefing"]));
  it("disabled role cannot be used", () => expect(allowedAssistantRoles(["email_summary"], "reply_drafting")).toEqual([]));
});
