/**
 * Address -> coordinates resolution with a persistent cache.
 * Uses OpenStreetMap Nominatim (no key required). Results are cached in
 * public.geo_locations so the map never re-geocodes the same site.
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const UA = "IMT-Operations-Platform/1.0 (service map)";

export type GeoPoint = { lat: number; lng: number; display_name: string | null };

async function lookup(q: string): Promise<GeoPoint | null> {
  const url = `${ENDPOINT}?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  const hit = rows?.[0];
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, display_name: hit.display_name ?? null };
}

/**
 * Resolves the given address strings, reading from cache first and geocoding
 * at most `budget` new addresses per call (Nominatim fair-use).
 */
export async function resolveAddresses(
  sb: any,
  queries: string[],
  budget = 8,
): Promise<Map<string, GeoPoint>> {
  const out = new Map<string, GeoPoint>();
  const unique = Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean)));
  if (!unique.length) return out;

  const { data: cached } = await sb
    .from("geo_locations")
    .select("query,lat,lng,display_name")
    .in("query", unique.slice(0, 500));

  const seen = new Set<string>();
  for (const row of (cached ?? []) as any[]) {
    seen.add(row.query);
    if (row.lat != null && row.lng != null) {
      out.set(row.query, { lat: Number(row.lat), lng: Number(row.lng), display_name: row.display_name });
    }
  }

  const missing = unique.filter((q) => !seen.has(q)).slice(0, budget);
  for (const q of missing) {
    let hit: GeoPoint | null = null;
    try {
      hit = (await lookup(q)) ?? (/zimbabwe/i.test(q) ? null : await lookup(`${q}, Zimbabwe`));
    } catch {
      hit = null;
    }
    await sb
      .from("geo_locations")
      .upsert(
        { query: q, lat: hit?.lat ?? null, lng: hit?.lng ?? null, display_name: hit?.display_name ?? null },
        { onConflict: "query" },
      );
    if (hit) out.set(q, hit);
    // Nominatim fair-use: max 1 request/second.
    await new Promise((r) => setTimeout(r, 1100));
  }

  return out;
}
