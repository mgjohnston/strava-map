import { useEffect, useState, useRef } from 'react';
import {
  fetchActivityStream,
  getCachedStream,
  type ActivityStream,
} from '../services/stravaStreams';

export interface UseActivityStreamsResult {
  streams: Map<number, ActivityStream | null>; // null = stream unavailable for this activity
  loading: boolean;
  error: string | null;
}

/**
 * Lazily fetches altitude+latlng streams for the given activity IDs.
 * Sequential to keep us friendly with Strava's 100 req / 15 min rate limit.
 */
export function useActivityStreams(
  activityIds: number[],
  enabled: boolean,
): UseActivityStreamsResult {
  const [streams, setStreams] = useState<Map<number, ActivityStream | null>>(() => {
    // Seed from cache on mount so toggling the feature is instant for prior fetches.
    const map = new Map<number, ActivityStream | null>();
    for (const id of activityIds) {
      const c = getCachedStream(id);
      if (c !== undefined) map.set(id, c);
    }
    return map;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idsKey = activityIds.join(',');
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!enabled || activityIds.length === 0) {
      setLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    // First, fill anything we already have cached without async work.
    setStreams((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of activityIds) {
        if (!next.has(id)) {
          const c = getCachedStream(id);
          if (c !== undefined) {
            next.set(id, c);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });

    const missing = activityIds.filter((id) => getCachedStream(id) === undefined);
    if (missing.length === 0) {
      setLoading(false);
      return () => {
        cancelledRef.current = true;
      };
    }

    setLoading(true);
    setError(null);

    (async () => {
      for (const id of missing) {
        if (cancelledRef.current) return;
        try {
          const stream = await fetchActivityStream(id);
          if (cancelledRef.current) return;
          setStreams((prev) => {
            const next = new Map(prev);
            next.set(id, stream);
            return next;
          });
        } catch (err) {
          if (cancelledRef.current) return;
          setError(err instanceof Error ? err.message : 'Stream fetch failed');
          break;
        }
      }
      if (!cancelledRef.current) setLoading(false);
    })();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, enabled]);

  return { streams, loading, error };
}
