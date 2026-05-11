// Fetches aerialway (ski lifts, gondolas, chairlifts) from OpenStreetMap via Overpass API.

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export interface LiftWay {
  id: number;
  type: string; // chair_lift, gondola, drag_lift, t-bar, etc.
  name?: string;
  coordinates: [number, number][]; // [lat, lng] pairs
}

interface OverpassNode {
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: { aerialway?: string; name?: string };
  geometry?: OverpassNode[];
}

interface OverpassResponse {
  elements: OverpassWay[];
}

// Round bbox to 2 decimal places (~1 km) so micro-pans hit cache.
function bboxKey(s: number, w: number, n: number, e: number): string {
  return [s, w, n, e].map((v) => v.toFixed(2)).join(',');
}

const cache = new Map<string, LiftWay[]>();
const inflight = new Map<string, Promise<LiftWay[]>>();

export async function fetchSkiLifts(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<LiftWay[]> {
  const key = bboxKey(south, west, north, east);
  const hit = cache.get(key);
  if (hit) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const query = `[out:json][timeout:15];(way["aerialway"](${south},${west},${north},${east}););out geom;`;

  const request = (async () => {
    try {
      const response = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = (await response.json()) as OverpassResponse;
      const lifts: LiftWay[] = data.elements
        .filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2)
        .map((el) => ({
          id: el.id,
          type: el.tags?.aerialway ?? 'lift',
          name: el.tags?.name,
          coordinates: el.geometry!.map((n) => [n.lat, n.lon] as [number, number]),
        }));

      cache.set(key, lifts);
      return lifts;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}

// Color-code by lift type so lifts read at a glance.
export function liftColor(type: string): string {
  switch (type) {
    case 'gondola':
    case 'cable_car':
      return '#1565c0'; // blue
    case 'chair_lift':
      return '#d32f2f'; // red
    case 'drag_lift':
    case 't-bar':
    case 'j-bar':
    case 'platter':
    case 'rope_tow':
    case 'magic_carpet':
      return '#6a1b9a'; // purple
    default:
      return '#212121'; // dark grey
  }
}
