// Client-safe pricing for Vultr-backed IMT cloud storage.
// Wholesale cost stays server/staff-side; clients only see the sell price.
export const STORAGE_PRICE_PER_TB_USD = 13.5;
export const STORAGE_PLANS_GB = [500, 1000, 2000, 3000, 5000, 10000] as const;
export const VULTR_STORAGE_BASE_USD = 6; // Vultr base subscription (includes 1 TB)
export const VULTR_STORAGE_PER_GB_USD = 0.006; // Vultr per-GB above the included 1 TB

/** Sell price: $13.50 per TB, charged pro-rata in 500 GB chunks. */
export function storageSellPrice(gb: number): number {
  if (!(gb > 0) || gb % 500 !== 0) throw new Error("Storage is sold in 500 GB chunks");
  return Math.round((gb / 1000) * STORAGE_PRICE_PER_TB_USD * 100) / 100;
}

/** Our worst-case Vultr cost if the client fills their allocation. */
export function storageWholesaleCost(gb: number): number {
  return Math.round((VULTR_STORAGE_BASE_USD + Math.max(0, gb - 1000) * VULTR_STORAGE_PER_GB_USD) * 100) / 100;
}
