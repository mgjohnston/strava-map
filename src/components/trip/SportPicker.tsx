import { Box, Stack, Typography, ToggleButton, ToggleButtonGroup, Chip } from '@mui/material';
import { SPORT_BUCKETS, ALL_BUCKET_IDS, type BucketId } from '../../utils/sportBuckets';

interface SportPickerProps {
  selectedBuckets: Set<BucketId>;
  onBucketsChange: (next: Set<BucketId>) => void;
  availableSportTypes: string[];
  selectedSportTypes: Set<string>;
  onSportTypesChange: (next: Set<string>) => void;
}

export function SportPicker({
  selectedBuckets,
  onBucketsChange,
  availableSportTypes,
  selectedSportTypes,
  onSportTypesChange,
}: SportPickerProps) {
  const handleBucketChange = (_: React.MouseEvent<HTMLElement>, next: BucketId[]) => {
    onBucketsChange(new Set(next));
    // clear sport-type chips that no longer fit any selected bucket
    onSportTypesChange(new Set());
  };

  const toggleSportType = (sport: string) => {
    const next = new Set(selectedSportTypes);
    if (next.has(sport)) {
      next.delete(sport);
    } else {
      next.add(sport);
    }
    onSportTypesChange(next);
  };

  return (
    <Stack spacing={1.5}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Sports
        </Typography>
        <ToggleButtonGroup
          value={Array.from(selectedBuckets)}
          onChange={handleBucketChange}
          size="small"
          color="primary"
          sx={{ flexWrap: 'wrap' }}
        >
          {ALL_BUCKET_IDS.map((id) => (
            <ToggleButton key={id} value={id} sx={{ textTransform: 'none' }}>
              <span style={{ marginRight: 6 }}>{SPORT_BUCKETS[id].emoji}</span>
              {SPORT_BUCKETS[id].label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {availableSportTypes.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Narrow by activity type {selectedSportTypes.size === 0 && '(all shown)'}
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {availableSportTypes.map((sport) => {
              const active = selectedSportTypes.has(sport);
              return (
                <Chip
                  key={sport}
                  label={sport}
                  size="small"
                  variant={active ? 'filled' : 'outlined'}
                  color={active ? 'primary' : 'default'}
                  onClick={() => toggleSportType(sport)}
                  clickable
                />
              );
            })}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
