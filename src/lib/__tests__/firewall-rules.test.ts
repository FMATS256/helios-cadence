import { describe, it, expect } from "vitest";
import { validateRule } from "../firewall.functions";
describe("firewall rule validation", () => {
  it("accepts a port range", () => expect(validateRule({ protocol: "udp", port: "9000:10999", source: "0.0.0.0/0" }).port).toBe("9000:10999"));
  it("rejects ports above 65535", () => expect(() => validateRule({ protocol: "tcp", port: "70000", source: "0.0.0.0/0" })).toThrow());
  it("rejects a bad source range", () => expect(() => validateRule({ protocol: "tcp", port: "22", source: "300.1.1.1/8" })).toThrow());
  it("defaults empty source to anywhere", () => expect(validateRule({ protocol: "tcp", port: "443", source: "" }).source).toBe("0.0.0.0/0"));
});
