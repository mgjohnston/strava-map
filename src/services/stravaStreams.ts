import { stravaAuth } from './stravaAuth';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const STREAM_CACHE_KEY = 'strava_streams_cache_v1';

export interface ActivityStream {
  latlng: [number, number][];
  altitude: number[];
}

interface StreamCacheEntry {
  stream: ActivityStream | null; // null = activity has no stream available (don't retry)
  cachedAt: number;
}

interface StravaStreamSet {
  latlng?: { data: [number, number][] };
  altitude?: { data: number[] };
}

function readCache(): Record<string, StreamCacheEntry> {
  try {
    const raw = localStorage.getItem(STREAM_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, StreamCacheEntry>): void {
  try {
    localStorage.setItem(STREAM_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Quota exceeded — drop the oldest half and try again.
    const entries = Object.entries(cache);
    entries.sort(([, a], [, b]) => a.cachedAt - b.cachedAt);
    const trimmed = Object.fromEntries(entries.slice(Math.floor(entries.length / 2)));
    try {
      localStorage.setItem(STREAM_CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      console.warn('Stream cache write failed', err);
    }
  }
}

function saveEntry(activityId: number, stream: ActivityStream | null): void {
  const cache = readCache();
  cache[String(activityId)] = { stream, cachedAt: Date.now() };
  writeCache(cache);
}

export function getCachedStream(activityId: number): ActivityStream | null | undefined {
  const cache = readCache();
  return cache[String(activityId)]?.stream;
}

export async function fetchActivityStream(
  activityId: number,
): Promise<ActivityStream | null> {
  const cached = getCachedStream(activityId);
  if (cached !== undefined) return cached;

  const token = await stravaAuth.getValidAccessToken();
  if (!token) throw new Error('Not authenticated with Strava');

  const url = `${STRAVA_API_BASE}/activities/${activityId}/streams?keys=latlng,altitude&key_by_type=true`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // 404 = activity has no streams (e.g., manual upload). Cache as null.
    if (response.status === 404) {
      saveEntry(activityId, null);
      return null;
    }
    if (response.status === 429) {
      throw new Error('Strava rate limit exceeded — try again in a few minutes');
    }
    throw new Error(`Strava streams API error: ${response.status}`);
  }

  const data = (await response.json()) as StravaStreamSet;
  if (!data.latlng?.data || !data.altitude?.data || data.latlng.data.length === 0) {
    saveEntry(activityId, null);
    return null;
  }

  const stream: ActivityStream = {
    latlng: data.latlng.data,
    altitude: data.altitude.data,
  };
  saveEntry(activityId, stream);
  return stream;
}
