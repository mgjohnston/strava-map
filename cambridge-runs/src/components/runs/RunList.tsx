import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import type { StravaActivity } from '../../types';

interface RunListProps {
  runs: StravaActivity[];
  /** Map of run id -> override opacity (0..1). Missing entry = use global. */
  overrides: Map<number, number>;
  globalOpacity: number;
  onOverride: (id: number, opacity: number | null) => void;
  onResetAll: () => void;
}

function formatRunRow(a: StravaActivity): { label: string; sub: string } {
  const date = new Date(a.start_date_local).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const km = (a.distance / 1000).toFixed(2);
  return {
    label: a.name || 'Run',
    sub: `${date} · ${km} km`,
  };
}

export function RunList({
  runs,
  overrides,
  globalOpacity,
  onOverride,
  onResetAll,
}: RunListProps) {
  const [expanded, setExpanded] = useState(false);

  if (runs.length === 0) return null;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, v) => setExpanded(v)}
      elevation={0}
      sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}
      disableGutters
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Per-run opacity
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {overrides.size === 0
              ? `${runs.length} runs · all using global (${globalOpacity.toFixed(2)})`
              : `${overrides.size} of ${runs.length} overridden`}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {overrides.size > 0 && (
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={(e) => {
                e.stopPropagation();
                onResetAll();
              }}
              sx={{ textTransform: 'none' }}
            >
              Reset all
            </Button>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack spacing={1} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
          {runs.map((run) => {
            const { label, sub } = formatRunRow(run);
            const override = overrides.get(run.id);
            const effective = override ?? globalOpacity;
            return (
              <Stack
                key={run.id}
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ sm: 'center' }}
                spacing={1.5}
                sx={{ py: 1 }}
              >
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sub}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 260 }}>
                  <Typography variant="caption" sx={{ width: 32, textAlign: 'right' }}>
                    {effective.toFixed(2)}
                  </Typography>
                  <Slider
                    size="small"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={effective}
                    onChange={(_, v) => onOverride(run.id, v as number)}
                    sx={{ minWidth: 140 }}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => v.toFixed(2)}
                  />
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => onOverride(run.id, null)}
                    disabled={override === undefined}
                    sx={{ textTransform: 'none', minWidth: 56 }}
                  >
                    {override === undefined ? 'Global' : 'Reset'}
                  </Button>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
