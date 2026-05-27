import { useState, useEffect, useCallback } from 'react';
import type { StravaActivity, StravaAuthState } from '../types';
import { stravaAuth } from '../services/stravaAuth';
import { stravaApi } from '../services/stravaApi';

const ACTIVITIES_KEY = 'cambridge_runs_activities';
const LAST_SYNC_KEY = 'cambridge_runs_last_sync';

interface UseStravaReturn {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  athleteName: string | null;
  activities: StravaActivity[];
  lastSyncTime: string | null;
  connect: () => void;
  disconnect: () => void;
  sync: (startDate: string, endDate: string) => Promise<void>;
}

export function useStrava(): UseStravaReturn {
  const [auth, setAuth] = useState<StravaAuthState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);

      const callbackAuth = await stravaAuth.handleOAuthCallback();
      if (callbackAuth) {
        setAuth(callbackAuth);
        setIsLoading(false);
        return;
      }

      const storedAuth = stravaAuth.getStoredAuth();
      setAuth(storedAuth);
      setIsLoading(false);

      const cachedActivities = localStorage.getItem(ACTIVITIES_KEY);
      if (cachedActivities) {
        try {
          setActivities(JSON.parse(cachedActivities));
        } catch {
          // Ignore parse errors
        }
      }

      const cachedSyncTime = localStorage.getItem(LAST_SYNC_KEY);
      if (cachedSyncTime) {
        setLastSyncTime(cachedSyncTime);
      }
    };

    initialize();
  }, []);

  const connect = useCallback(() => {
    stravaAuth.initiateOAuth();
  }, []);

  const disconnect = useCallback(() => {
    stravaAuth.clearAuth();
    setAuth(null);
    setActivities([]);
    setLastSyncTime(null);
    localStorage.removeItem(ACTIVITIES_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  }, []);

  const sync = useCallback(async (startDate: string, endDate: string) => {
    if (!auth?.accessToken) {
      setError('Not connected to Strava');
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      const fetched = await stravaApi.fetchRunsInDateRange(startDate, endDate);

      setActivities(fetched);
      localStorage.setItem(ACTIVITIES_KEY, JSON.stringify(fetched));

      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      localStorage.setItem(LAST_SYNC_KEY, syncTime);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync activities';
      setError(errorMessage);

      if (errorMessage.includes('401') || errorMessage.includes('authorization')) {
        stravaAuth.clearAuth();
        setAuth(null);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [auth?.accessToken]);

  return {
    isConnected: !!auth?.accessToken,
    isLoading,
    isSyncing,
    error,
    athleteName: auth?.athleteName ?? null,
    activities,
    lastSyncTime,
    connect,
    disconnect,
    sync,
  };
}
