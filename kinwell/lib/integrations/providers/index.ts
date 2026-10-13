import "server-only";
import { env } from "@/lib/config/env";
import { getDb } from "@/lib/database/client";

export interface ProviderSearchParams {
  speciality?: string;
  query?: string;
  language?: string;
  consultationType?: string;
  kind?: string;
  near?: { lat: number; lon: number };
  maxDistanceKm?: number;
}

export interface HealthcareProvider {
  id: string;
  name: string;
  kind: string;
  speciality: string | null;
  clinic: string | null;
  address: string | null;
  city: string | null;
  languages: string[];
  consultation_types: string[];
  phone: string | null;
  availability: string | null;
  distance_km: number | null;
  source: string;
  latitude: number | null;
  longitude: number | null;
}

/** Search providers by speciality, location, language and consultation type. Never ranks anyone as "best". */
export interface HealthcareProviderSearchProvider {
  readonly name: string;
  readonly isMock: boolean;
  search(params: ProviderSearchParams): Promise<HealthcareProvider[]>;
}

export interface MapProvider {
  readonly name: string;
  distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number;
  directionsUrl(dest: { lat: number; lon: number; label?: string }): string;
}

export class HaversineMapProvider implements MapProvider {
  readonly name = "haversine";
  distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  directionsUrl(dest: { lat: number; lon: number }) {
    return `https://www.openstreetmap.org/directions?route=%3B${dest.lat}%2C${dest.lon}`;
  }
}

/** Development adapter: searches the fictional `providers` table seeded with demo data. */
export class MockHealthcareProviderSearchProvider implements HealthcareProviderSearchProvider {
  readonly name = "mock-directory";
  readonly isMock = true;
  private map = new HaversineMapProvider();

  async search(p: ProviderSearchParams): Promise<HealthcareProvider[]> {
    const db = await getDb();
    const where: string[] = [];
    const args: unknown[] = [];
    if (p.speciality) {
      args.push(`%${p.speciality}%`);
      where.push(`speciality ilike $${args.length}`);
    }
    if (p.kind) {
      args.push(p.kind);
      where.push(`kind = $${args.length}`);
    }
    if (p.language) {
      args.push(p.language);
      where.push(`$${args.length} = any(languages)`);
    }
    if (p.consultationType) {
      args.push(p.consultationType);
      where.push(`$${args.length} = any(consultation_types)`);
    }
    if (p.query) {
      args.push(`%${p.query}%`);
      where.push(`(name ilike $${args.length} or clinic ilike $${args.length} or city ilike $${args.length} or speciality ilike $${args.length})`);
    }
    const { rows } = await db.query<Omit<HealthcareProvider, "distance_km">>(
      `select id, name, kind, speciality, clinic, address, city, languages, consultation_types, phone, availability, source, latitude, longitude
       from providers ${where.length ? "where " + where.join(" and ") : ""} order by name limit 100`,
      args,
    );
    const withDistance = rows.map((r) => ({
      ...r,
      distance_km: p.near && r.latitude != null && r.longitude != null ? Math.round(this.map.distanceKm(p.near, { lat: r.latitude, lon: r.longitude }) * 10) / 10 : null,
    }));
    const filtered = p.maxDistanceKm ? withDistance.filter((r) => r.distance_km == null || r.distance_km <= p.maxDistanceKm!) : withDistance;
    return p.near ? filtered.sort((a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9)) : filtered;
  }
}

/** Production placeholder: Google Places (New) Text Search. Requires MAPS_API_KEY. */
export class GoogleMapsHealthcareProviderSearchProvider implements HealthcareProviderSearchProvider {
  readonly name = "google-places";
  readonly isMock = false;
  async search(p: ProviderSearchParams): Promise<HealthcareProvider[]> {
    const key = env.keys.maps;
    if (!key) throw new Error("MAPS_API_KEY is not configured");
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.primaryTypeDisplayName",
      },
      body: JSON.stringify({
        textQuery: [p.speciality, p.query, p.kind ?? "clinic"].filter(Boolean).join(" "),
        locationBias: p.near ? { circle: { center: { latitude: p.near.lat, longitude: p.near.lon }, radius: (p.maxDistanceKm ?? 10) * 1000 } } : undefined,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`Places search failed: ${res.status}`);
    const json = (await res.json()) as { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; nationalPhoneNumber?: string; primaryTypeDisplayName?: { text: string } }[] };
    const map = new HaversineMapProvider();
    return (json.places ?? []).map((pl) => ({
      id: pl.id,
      name: pl.displayName?.text ?? "Unknown",
      kind: "clinic",
      speciality: pl.primaryTypeDisplayName?.text ?? p.speciality ?? null,
      clinic: null,
      address: pl.formattedAddress ?? null,
      city: null,
      languages: [],
      consultation_types: [],
      phone: pl.nationalPhoneNumber ?? null,
      availability: null,
      source: "google-places",
      latitude: pl.location?.latitude ?? null,
      longitude: pl.location?.longitude ?? null,
      distance_km: p.near && pl.location ? Math.round(map.distanceKm(p.near, { lat: pl.location.latitude, lon: pl.location.longitude }) * 10) / 10 : null,
    }));
  }
}

export function getProviderSearch(): HealthcareProviderSearchProvider {
  return env.providerSearch === "google" && env.keys.maps ? new GoogleMapsHealthcareProviderSearchProvider() : new MockHealthcareProviderSearchProvider();
}

export function getMapProvider(): MapProvider {
  return new HaversineMapProvider();
}
