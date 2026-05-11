import type { StravaActivity } from '../types';
import { bucketOf, type BucketId } from './sportBuckets';

const GAP_DAYS = 3;
const HOME_DISTANCE_KM = 50;
const MIN_ACTIVITIES = 2;
const MAX_CLUSTER_DIAMETER_KM = 150;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface TripSuggestion {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  sports: string[];
  buckets: BucketId[];
  activityCount: number;
  centroid: [number, number];
  distanceFromHomeKm: number;
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hasGeo(a: StravaActivity): a is StravaActivity & { start_latlng: [number, number] } {
  return Array.isArray(a.start_latlng) && a.start_latlng.length === 2;
}

function dayDiff(aIso: string, bIso: string): number {
  const da = new Date(aIso).getTime();
  const db = new Date(bIso).getTime();
  return Math.abs(db - da) / MS_PER_DAY;
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function detectTrips(activities: StravaActivity[]): TripSuggestion[] {
  const geo = activities.filter(hasGeo);
  if (geo.length < 2) return [];

  const home: [number, number] = [
    median(geo.map((a) => a.start_latlng[0])),
    median(geo.map((a) => a.start_latlng[1])),
  ];

  // away-from-home activities only — anchor for cluster detection
  const away = geo
    .filter((a) => haversineKm(a.start_latlng, home) > HOME_DISTANCE_KM)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  if (away.length === 0) return [];

  const clusters: (StravaActivity & { start_latlng: [number, number] })[][] = [];
  let current: (StravaActivity & { start_latlng: [number, number] })[] = [];

  for (const a of away) {
    if (current.length === 0) {
      current = [a];
      continue;
    }
    const prev = current[current.length - 1];
    if (dayDiff(prev.start_date, a.start_date) > GAP_DAYS) {
      clusters.push(current);
      current = [a];
    } else {
      current.push(a);
    }
  }
  if (current.length > 0) clusters.push(current);

  const suggestions: TripSuggestion[] = [];
  for (const cluster of clusters) {
    if (cluster.length < MIN_ACTIVITIES) continue;

    // Reject clusters that span huge distances — likely two trips that
    // happen to fall within the date-gap threshold.
    let maxPairwise = 0;
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const d = haversineKm(cluster[i].start_latlng, cluster[j].start_latlng);
        if (d > maxPairwise) maxPairwise = d;
      }
    }
    if (maxPairwise > MAX_CLUSTER_DIAMETER_KM) continue;

    const startDate = toDateOnly(cluster[0].start_date);
    const endDate = toDateOnly(cluster[cluster.length - 1].start_date);

    const centroid: [number, number] = [
      cluster.reduce((s, a) => s + a.start_latlng[0], 0) / cluster.length,
      cluster.reduce((s, a) => s + a.start_latlng[1], 0) / cluster.length,
    ];

    const sports = Array.from(
      new Set(cluster.map((a) => a.sport_type || a.type).filter(Boolean)),
    );
    const buckets = Array.from(new Set(cluster.map((a) => bucketOf(a))));

    suggestions.push({
      id: `${startDate}_${endDate}`,
      startDate,
      endDate,
      sports,
      buckets,
      activityCount: cluster.length,
      centroid,
      distanceFromHomeKm: haversineKm(centroid, home),
    });
  }

  return suggestions.sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
  );
}
