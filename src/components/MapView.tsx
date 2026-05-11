import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import type { StravaActivity } from '../types';
import { ActivityMap } from './map';
import { SportPicker, DateRangePicker, TripSuggestions } from './trip';
import {
  ALL_BUCKET_IDS,
  bucketOf,
  matchesBuckets,
  uniqueSportTypes,
  type BucketId,
} from '../utils/sportBuckets';
import { detectTrips } from '../utils/tripDetection';

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
  const [selectedBuckets, setSelectedBuckets] = useState<Set<BucketId>>(
    () => new Set<BucketId>(ALL_BUCKET_IDS),
  );
  const [selectedSportTypes, setSelectedSportTypes] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);

  // Trip suggestions run over the FULL cached set so trips outside the current
  // date window still surface (the whole point of auto-suggest).
  const tripSuggestions = useMemo(() => detectTrips(activities), [activities]);

  const inRange = (a: StravaActivity): boolean => {
    const ts = new Date(a.start_date).getTime();
    const from = new Date(startDate).getTime();
    const to = new Date(endDate).getTime() + 24 * 60 * 60 * 1000;
    return ts >= from && ts <= to;
  };

  // Date-and-bucket filtered set (drives the dynamic chip row)
  const bucketedActivities = useMemo(
    () =>
      activities.filter(
        (a) => inRange(a) && selectedBuckets.has(bucketOf(a)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, startDate, endDate, selectedBuckets],
  );

  const availableSportTypes = useMemo(
    () => uniqueSportTypes(bucketedActivities),
    [bucketedActivities],
  );

  // Final filtered set (after optional chip narrowing) — feeds the map
  const filtered = useMemo(
    () =>
      bucketedActivities.filter((a) =>
        matchesBuckets(a, selectedBuckets, selectedSportTypes),
      ),
    [bucketedActivities, selectedBuckets, selectedSportTypes],
  );

  const polylines = useMemo(
    () =>
      filtered
        .map((a) => a.map?.summary_polyline ?? a.map?.polyline ?? '')
        .filter((s) => s.length > 0),
    [filtered],
  );

  const skiOnly = selectedBuckets.size === 1 && selectedBuckets.has('ski');
  const totalDistanceKm = filtered.reduce((sum, a) => sum + (a.distance || 0) / 1000, 0);

  const watermark = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} – ${fmt(endDate)}`;
  }, [startDate, endDate]);

  const exportFilename = useMemo(
    () => `strava-map-${startDate}_${endDate}`,
    [startDate, endDate],
  );

  const handleSync = async () => {
    await onSync(startDate, endDate);
  };

  const handlePickTrip = (trip: { startDate: string; endDate: string; buckets: BucketId[] }) => {
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setSelectedBuckets(new Set(trip.buckets));
    setSelectedSportTypes(new Set());
  };

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
          Use the Connect Strava button in the top-right. Once connected, choose your sports and
          date range and we'll plot every activity on one map.
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
          <SportPicker
            selectedBuckets={selectedBuckets}
            onBucketsChange={setSelectedBuckets}
            availableSportTypes={availableSportTypes}
            selectedSportTypes={selectedSportTypes}
            onSportTypesChange={setSelectedSportTypes}
          />

          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            disabled={isSyncing}
          />

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {activities.length === 0
                ? 'No activities cached yet — hit Sync to fetch.'
                : `${filtered.length} of ${activities.length} cached activit${activities.length === 1 ? 'y' : 'ies'} in view · ${totalDistanceKm.toFixed(1)} km`}
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

      <TripSuggestions trips={tripSuggestions} onPick={handlePickTrip} />

      <Box>
        <ActivityMap
          key={skiOnly ? 'ski' : 'default'}
          polylines={polylines}
          title="🗺️ Your activity map"
          defaultBasemap={skiOnly ? 'terrain' : 'light'}
          defaultOverlay={skiOnly ? 'pistes' : 'none'}
          watermark={watermark}
          exportFilename={exportFilename}
        />
      </Box>
    </Stack>
  );
}
