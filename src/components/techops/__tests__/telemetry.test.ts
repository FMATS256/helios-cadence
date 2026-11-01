import { test, expect } from "vitest";
import { summarizeResults } from "@/components/techops/telemetry-section";
test("hourly uptime and p50", () => {
  const r = summarizeResults([{checked_at:"2026-11-01T10:01",response_ms:100,status:"up"},{checked_at:"2026-11-01T10:05",response_ms:300,status:"down"}]);
  expect(r[0].uptime).toBe(50); expect(r[0].p95).toBe(300);
});
