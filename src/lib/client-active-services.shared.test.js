import { expect, test } from "bun:test";
import { activePortalServices } from "./client-active-services.shared";
test("active client services are listed while cancelled subscriptions are excluded", () => {
  const result = activePortalServices({ services: [{ id: "m365", status: "active" }, { id: "old", status: "cancelled" }], starlink: [{ id: "kit", status: "active" }], assets: [{ id: "cctv", status: "installed" }] });
  expect(result.services.map((s) => s.id)).toEqual(["m365"]);
  expect(result.starlink.map((s) => s.id)).toEqual(["kit"]);
  expect(result.assets.map((s) => s.id)).toEqual(["cctv"]);
  expect(result.hosting).toEqual([]);
});