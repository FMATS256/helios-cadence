import { describe, it, expect } from "vitest";
import { isBilling } from "./pos.functions";

describe("POS reconciliation access", () => {
  it("lets finance reconcile", () => expect(isBilling(new Set(["finance"]))).toBe(true));
  it("does not let sales staff reconcile their own sales", () => expect(isBilling(new Set(["sales"]))).toBe(false));
  it("does not let inventory staff reconcile", () => expect(isBilling(new Set(["inventory"]))).toBe(false));
});
