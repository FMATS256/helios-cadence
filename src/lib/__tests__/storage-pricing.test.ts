import { describe, expect, it } from "vitest";
import { storageSellPrice, storageWholesaleCost } from "../storage-pricing";

describe("storage pricing", () => {
  it("charges $13.50 per 1 TB", () => expect(storageSellPrice(1000)).toBe(13.5));
  it("sells 500 GB for half price", () => expect(storageSellPrice(500)).toBe(6.75));
  it("scales per TB", () => expect(storageSellPrice(3000)).toBe(40.5));
  it("rejects non-500 GB chunks", () => expect(() => storageSellPrice(750)).toThrow());
  it("stays above Vultr cost", () => {
    for (const gb of [500, 1000, 2000, 5000]) expect(storageSellPrice(gb)).toBeGreaterThan(storageWholesaleCost(gb));
  });
});
