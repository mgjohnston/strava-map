import { Paper, Stack, Typography, Chip, Button, Box } from '@mui/material';
import ExploreIcon from '@mui/icons-material/Explore';
import type { TripSuggestion } from '../../utils/tripDetection';
import { SPORT_BUCKETS } from '../../utils/sportBuckets';

interface TripSuggestionsProps {
  trips: TripSuggestion[];
  onPick: (trip: TripSuggestion) => void;
}

function formatDateRange(start: string, end: string): string {
  if (start === end) {
    return new Date(start).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const startFmt = startDate.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const endFmt = endDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startFmt} → ${endFmt}`;
}

export function TripSuggestions({ trips, onPick }: TripSuggestionsProps) {
  if (trips.length === 0) {
    return null;
  }

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <ExploreIcon color="primary" fontSize="small" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Suggested trips
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {trips.length} found
        </Typography>
      </Stack>

      <Stack spacing={1}>
        {trips.map((trip) => (
          <Box
            key={trip.id}
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { sm: 'center' },
              justifyContent: 'space-between',
              gap: 1,
              p: 1.25,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {formatDateRange(trip.startDate, trip.endDate)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {trip.activityCount} activit{trip.activityCount === 1 ? 'y' : 'ies'} ·{' '}
                {Math.round(trip.distanceFromHomeKm)} km from home
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                {trip.buckets.map((b) => (
                  <Chip
                    key={b}
                    size="small"
                    label={`${SPORT_BUCKETS[b].emoji} ${SPORT_BUCKETS[b].label}`}
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Box>
            <Button variant="contained" size="small" onClick={() => onPick(trip)}>
              View
            </Button>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
