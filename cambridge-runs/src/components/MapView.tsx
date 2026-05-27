import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import HistoryIcon from '@mui/icons-material/History';
import type { StravaActivity } from '../types';
import { DateRangePicker } from './DateRangePicker';
import { RunsMap, type RunRoute } from './map';
import { RunList } from './runs';

const DEFAULT_GLOBAL_OPACITY = 0.35;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return isoDate(d);
}

function defaultEndDate(): string {
  return isoDate(new Date());
}

interface MapViewProps {
  isConnected: boolean;
  isSyncing: boolean;
  activities: StravaActivity[];
  onSync: (startDate: string, endDate: string) => Promise<void>;
}

export function MapView({ isConnected, isSyncing, activities, onSync }: MapViewProps) {
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [weeksBack, setWeeksBack] = useState<number>(70);
  const [globalOpacity, setGlobalOpacity] = useState<number>(DEFAULT_GLOBAL_OPACITY);
  const [opacityOverrides, setOpacityOverrides] = useState<Map<number, number>>(
    () => new Map(),
  );

  const applyWeeksBack = useCallback((weeks: number) => {
    if (!Number.isFinite(weeks) || weeks < 1) return;
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - weeks * 7);
    setStartDate(isoDate(from));
    setEndDate(isoDate(today));
  }, []);

  const inRange = useCallback(
    (a: StravaActivity): boolean => {
      const ts = new Date(a.start_date).getTime();
      const from = new Date(startDate).getTime();
      const to = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;
      return ts >= from && ts <= to;
    },
    [startDate, endDate],
  );

  // The cache already contains only runs; we still date-filter client-side
  // so the user can narrow without re-syncing.
  const inWindow = useMemo(
    () => activities.filter(inRange),
    [activities, inRange],
  );

  const mappable = useMemo(
    () =>
      inWindow.filter(
        (a) => (a.map?.summary_polyline ?? a.map?.polyline ?? '').length > 0,
      ),
    [inWindow],
  );

  const routes = useMemo<RunRoute[]>(
    () =>
      mappable.map((a) => ({
        id: a.id,
        polyline: a.map?.summary_polyline ?? a.map?.polyline ?? '',
        opacity: opacityOverrides.get(a.id) ?? globalOpacity,
        distanceKm: (a.distance || 0) / 1000,
      })),
    [mappable, opacityOverrides, globalOpacity],
  );

  const totalDistanceKm = inWindow.reduce((sum, a) => sum + (a.distance || 0) / 1000, 0);
  // Total across just the *mapped* runs (drives the map overlay so it can
  // collapse to a single number when everything is in the viewport).
  const mappedDistanceKm = mappable.reduce((sum, a) => sum + (a.distance || 0) / 1000, 0);

  const timeframe = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString('en-GB', {
        month: 'short',
        year: 'numeric',
      });
    const from = fmt(startDate);
    const to = fmt(endDate);
    return from === to ? from : `${from} – ${to}`;
  }, [startDate, endDate]);

  const exportFilename = useMemo(
    () => `cambridge-runs-${startDate}_${endDate}`,
    [startDate, endDate],
  );

  const handleSync = async () => {
    await onSync(startDate, endDate);
  };

  const handleOverride = useCallback((id: number, opacity: number | null) => {
    setOpacityOverrides((prev) => {
      const next = new Map(prev);
      if (opacity === null) {
        next.delete(id);
      } else {
        next.set(id, opacity);
      }
      return next;
    });
  }, []);

  const handleResetAll = useCallback(() => {
    setOpacityOverrides(new Map());
  }, []);

  if (!isConnected) {
    return (
      <Paper
        elevation={0}
        sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          Connect Strava to start mapping
        </Typography>
        <Typography color="text.secondary">
          Use the Connect Strava button in the top-right. Once connected, choose a date range and
          sync to plot every run on one map.
        </Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{ p: 2.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <Stack spacing={2}>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            disabled={isSyncing}
          />

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              Quick set:
            </Typography>
            <TextField
              size="small"
              type="number"
              label="Weeks"
              value={weeksBack}
              onChange={(e) => setWeeksBack(Number(e.target.value))}
              inputProps={{ min: 1, max: 520, step: 1 }}
              disabled={isSyncing}
              sx={{ width: 100 }}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={<HistoryIcon />}
              onClick={() => applyWeeksBack(weeksBack)}
              disabled={isSyncing || !Number.isFinite(weeksBack) || weeksBack < 1}
              sx={{ textTransform: 'none' }}
            >
              Last {weeksBack || '?'} weeks
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {activities.length === 0
                ? 'No runs cached yet — hit Sync to fetch.'
                : `${routes.length} of ${activities.length} cached run${activities.length === 1 ? '' : 's'} in view · ${totalDistanceKm.toFixed(1)} km`}
            </Typography>
            <Button
              variant="contained"
              startIcon={isSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing…' : 'Sync this range'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <RunsMap
        routes={routes}
        title="Your runs"
        subtitle={`${routes.length} run${routes.length !== 1 ? 's' : ''} mapped · ${totalDistanceKm.toFixed(1)} km`}
        timeframe={timeframe}
        activityCount={routes.length}
        totalDistanceKm={mappedDistanceKm}
        exportFilename={exportFilename}
        globalOpacity={globalOpacity}
        onGlobalOpacityChange={setGlobalOpacity}
      />

      <RunList
        runs={mappable}
        overrides={opacityOverrides}
        globalOpacity={globalOpacity}
        onOverride={handleOverride}
        onResetAll={handleResetAll}
      />
    </Stack>
  );
}
