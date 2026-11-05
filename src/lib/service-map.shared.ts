/** Browser-safe shared values for the service map. The map view itself imports
 * Leaflet and must stay behind React.lazy — never import it statically. */
export const KIND_COLOR: Record<string, string> = {
  customer: "#1F6BE0",
  branch: "#7C3AED",
  starlink: "#0EA5E9",
  nas: "#F59E0B",
  asset: "#10B981",
  stock: "#64748B",
};
