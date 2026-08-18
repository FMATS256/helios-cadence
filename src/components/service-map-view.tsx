import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import type { MapSite } from "@/lib/servicemap.functions";

export const KIND_COLOR: Record<string, string> = {
  customer: "#1F6BE0",
  branch: "#7C3AED",
  starlink: "#0EA5E9",
  nas: "#F59E0B",
  asset: "#10B981",
  stock: "#64748B",
};

function tone(site: MapSite) {
  const s = (site.status ?? "").toLowerCase();
  if (["suspended", "cancelled", "inactive", "retired", "faulty"].includes(s)) return "#EF4444";
  return KIND_COLOR[site.kind] ?? "#1F6BE0";
}

export default function ServiceMapView({
  sites,
  onSelect,
  height = 560,
}: {
  sites: MapSite[];
  onSelect?: (s: MapSite) => void;
  height?: number;
}) {
  const points = sites.filter((s) => s.lat != null && s.lng != null);
  const center: [number, number] = points.length
    ? [
        points.reduce((a, p) => a + (p.lat as number), 0) / points.length,
        points.reduce((a, p) => a + (p.lng as number), 0) / points.length,
      ]
    : [-17.8252, 31.0335]; // Harare

  return (
    <MapContainer
      center={center}
      zoom={points.length > 1 ? 6 : 12}
      scrollWheelZoom
      style={{ height, width: "100%" }}
      className="rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat as number, s.lng as number]}
          radius={8}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: tone(s), fillOpacity: 0.95 }}
          eventHandlers={{ click: () => onSelect?.(s) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{s.label}</Tooltip>
          <Popup>
            <div className="text-xs">
              <div className="font-semibold text-sm">{s.label}</div>
              {s.customer_name && <div>{s.customer_name}</div>}
              {s.account_number && <div className="font-mono">{s.account_number}</div>}
              <div className="mt-1 capitalize">{s.kind} · {s.status ?? "unknown"}</div>
              <div className="mt-1 opacity-70">{s.resolved_address || s.address}</div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
