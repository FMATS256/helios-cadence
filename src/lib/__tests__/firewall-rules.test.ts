import { describe, it, expect } from "vitest";
import { validateRule } from "../firewall.functions";
describe("firewall rule validation", () => {
  it("accepts a port range", () => expect(validateRule({ protocol: "udp", port: "9000:10999", source: "0.0.0.0/0" }).port).toBe("9000:10999"));
  it("rejects ports above 65535", () => expect(() => validateRule({ protocol: "tcp", port: "70000", source: "0.0.0.0/0" })).toThrow());
  it("rejects a bad source range", () => expect(() => validateRule({ protocol: "tcp", port: "22", source: "300.1.1.1/8" })).toThrow());
  it("defaults empty source to anywhere", () => expect(validateRule({ protocol: "tcp", port: "443", source: "" }).source).toBe("0.0.0.0/0"));
  it("blocks RDP open to the internet", () => expect(() => validateRule({ protocol: "tcp", port: "3389", source: "0.0.0.0/0" })).toThrow(/Remote Desktop/));
  it("allows RDP from a single office IP", () => expect(validateRule({ protocol: "tcp", port: "3389", source: "41.57.10.4/32" }).port).toBe("3389"));
  it("blocks a range that covers SQL Server", () => expect(() => validateRule({ protocol: "tcp", port: "1400:1500", source: "0.0.0.0/0" })).toThrow(/SQL Server/));
  it("blocks wide ranges open to everyone", () => expect(() => validateRule({ protocol: "udp", port: "20000:40000", source: "0.0.0.0/0" })).toThrow());
});
