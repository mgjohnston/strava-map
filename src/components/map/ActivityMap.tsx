import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Switch,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import { decodePolyline } from '../../utils/polyline';
import { fetchSkiLifts, liftColor, type LiftWay } from '../../services/overpass';
import type { ActivityStream } from '../../services/stravaStreams';

export type Basemap = 'light' | 'terrain' | 'satellite';
export type SkiOverlay = 'none' | 'pistes' | 'lifts';
export type MapShape =
  | 'standard'
  | 'tall'
  | 'landscape'
  | 'portrait'
  | 'square'
  | 'banner';

export interface ActivityRoute {
  id: number;
  polyline: string;
  stream?: ActivityStream | null; // null = activity has no stream available
}

interface ActivityMapProps {
  routes: ActivityRoute[];
  title?: string;
  subtitle?: string;
  defaultBasemap?: Basemap;
  defaultOverlay?: SkiOverlay;
  defaultShape?: MapShape;
  watermark?: string;
  exportFilename?: string;
  colorByDirection: boolean;
  onColorByDirectionChange: (next: boolean) => void;
  directionsLoading?: boolean;
}

const HEATMAP_COLOR = '#FC4C02';
const HEATMAP_WEIGHT = 4;
const HEATMAP_OPACITY = 0.35;

const DOWN_COLOR = '#FC4C02'; // Strava orange — downhill
const UP_COLOR = '#1976d2'; // blue — uphill
const FLAT_COLOR = '#9e9e9e'; // grey — flat
const ELEVATION_WEIGHT = 4;
const ELEVATION_OPACITY = 0.55;
const ALTITUDE_SMOOTH_WINDOW = 9; // ±9 samples → 19-pt window
const DELTA_LOOKBACK = 6; // compare against the point N samples earlier
const FLAT_GRADE = 0.015; // |Δalt / Δhoriz| under 1.5% → flat
const MIN_HORIZONTAL_M = 2; // ignore stationary jitter

interface ShapeDef {
  width: number | string;
  height: number;
  label: string;
}

const SHAPES: Record<MapShape, ShapeDef> = {
  standard: { width: '100%', height: 600, label: 'Standard (wide × 600)' },
  tall: { width: '100%', height: 900, label: 'Tall (wide × 900)' },
  landscape: { width: '100%', height: 500, label: 'Landscape 16:9' },
  portrait: { width: 720, height: 1080, label: 'Portrait 2:3' },
  square: { width: 800, height: 800, label: 'Square 1:1' },
  banner: { width: '100%', height: 380, label: 'Banner (wide × 380)' },
};

interface BasemapDef {
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string;
}

const BASEMAPS: Record<Basemap, BasemapDef> = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap, © CARTO',
    maxZoom: 19,
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap, © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    subdomains: 'abc',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri & contributors',
    maxZoom: 19,
  },
};

const SKI_PISTES_URL = 'https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png';

function makeBaseLayer(basemap: Basemap): L.TileLayer {
  const def = BASEMAPS[basemap];
  return L.tileLayer(def.url, {
    maxZoom: def.maxZoom,
    attribution: def.attribution,
    subdomains: def.subdomains ?? 'abc',
    crossOrigin: 'anonymous',
  });
}

function makePistesLayer(): L.TileLayer {
  return L.tileLayer(SKI_PISTES_URL, {
    maxZoom: 18,
    opacity: 0.85,
    attribution: '© OpenSnowMap',
    crossOrigin: 'anonymous',
  });
}

function metersBetween(a: [number, number], b: [number, number]): number {
  // Equirectangular approx — accurate enough for the few-metre point-to-point
  // distances we compare against altitude deltas.
  const dLat = (b[0] - a[0]) * 111000;
  const dLng = (b[1] - a[1]) * 111000 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function classifyByGrade(deltaAlt: number, deltaMeters: number): string {
  if (deltaMeters < MIN_HORIZONTAL_M) return FLAT_COLOR;
  const grade = deltaAlt / deltaMeters;
  if (Math.abs(grade) < FLAT_GRADE) return FLAT_COLOR;
  return grade > 0 ? UP_COLOR : DOWN_COLOR;
}

// Centred moving-average over `radius` samples each side. Kills the high-
// frequency altitude noise (~0.5 m jitter) that fragments long descents into
// dozens of tiny same-direction stubs.
function smoothAltitudes(alt: number[], radius: number): number[] {
  const n = alt.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += alt[j];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

function buildColoredSegments(
  latlng: [number, number][],
  altitude: number[],
): Array<{ coords: [number, number][]; color: string }> {
  const n = Math.min(latlng.length, altitude.length);
  if (n < 2) return [];

  const smooth = smoothAltitudes(altitude, ALTITUDE_SMOOTH_WINDOW);
  const segments: Array<{ coords: [number, number][]; color: string }> = [];
  let current: { coords: [number, number][]; color: string } | null = null;

  for (let i = 1; i < n; i++) {
    // Grade = Δalt / Δhoriz over a fixed lookback window. Using grade rather
    // than raw Δalt keeps classification consistent across slow activities
    // (ski touring at 3 km/h) and fast ones (alpine skiing at 50 km/h).
    const j = Math.max(0, i - DELTA_LOOKBACK);
    const deltaAlt = smooth[i] - smooth[j];
    const deltaMeters = metersBetween(latlng[j], latlng[i]);
    const color = classifyByGrade(deltaAlt, deltaMeters);

    if (!current) {
      current = { coords: [latlng[i - 1], latlng[i]], color };
    } else if (current.color === color) {
      current.coords.push(latlng[i]);
    } else {
      // Don't duplicate the joint vertex into the next segment — combined
      // with lineCap:'butt' below this stops the double-painted overlap that
      // made downhill stretches look more opaque than uphill.
      segments.push(current);
      current = { coords: [latlng[i - 1], latlng[i]], color };
    }
  }
  if (current) segments.push(current);
  return segments;
}

export function ActivityMap({
  routes,
  title = 'Activities',
  subtitle,
  defaultBasemap = 'light',
  defaultOverlay = 'none',
  defaultShape = 'standard',
  watermark,
  exportFilename = 'strava-map',
  colorByDirection,
  onColorByDirectionChange,
  directionsLoading = false,
}: ActivityMapProps) {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const pisteLayerRef = useRef<L.TileLayer | null>(null);
  const liftsLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const liftsFetchTimer = useRef<number | null>(null);

  const [basemap, setBasemap] = useState<Basemap>(defaultBasemap);
  const [overlay, setOverlay] = useState<SkiOverlay>(defaultOverlay);
  const [shape, setShape] = useState<MapShape>(defaultShape);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingLifts, setIsLoadingLifts] = useState(false);

  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  // Decode summary polylines as a fallback for routes without streams.
  const decodedFallback = useMemo(() => {
    const map = new Map<number, [number, number][]>();
    for (const route of routes) {
      const coords = decodePolyline(route.polyline);
      if (coords.length > 0) map.set(route.id, coords);
    }
    return map;
  }, [routes]);

  const drawLifts = useCallback((map: L.Map, lifts: LiftWay[]) => {
    if (liftsLayerRef.current) {
      map.removeLayer(liftsLayerRef.current);
      liftsLayerRef.current = null;
    }
    if (lifts.length === 0) return;

    const group = L.layerGroup();
    for (const lift of lifts) {
      L.polyline(lift.coordinates, {
        color: liftColor(lift.type),
        weight: 2,
        opacity: 0.55,
        dashArray: '5,5',
      }).addTo(group);
    }
    group.addTo(map);
    liftsLayerRef.current = group;
  }, []);

  const LIFT_ATTRIBUTION = 'Lifts © OpenStreetMap (via Overpass)';

  const refreshLifts = useCallback(
    async (map: L.Map) => {
      const bounds = map.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      setIsLoadingLifts(true);
      try {
        const lifts = await fetchSkiLifts(sw.lat, sw.lng, ne.lat, ne.lng);
        drawLifts(map, lifts);
        map.attributionControl?.addAttribution(LIFT_ATTRIBUTION);
      } catch (err) {
        console.error('Failed to fetch ski lifts', err);
      } finally {
        setIsLoadingLifts(false);
      }
    },
    [drawLifts],
  );

  const scheduleLiftRefresh = useCallback(
    (map: L.Map, delay = 500) => {
      if (liftsFetchTimer.current) window.clearTimeout(liftsFetchTimer.current);
      liftsFetchTimer.current = window.setTimeout(() => refreshLifts(map), delay);
    },
    [refreshLifts],
  );

  // Draw all activity routes; honours colorByDirection if stream data exists.
  const drawRoutes = useCallback(
    (map: L.Map) => {
      if (routesLayerRef.current) {
        map.removeLayer(routesLayerRef.current);
        routesLayerRef.current = null;
      }

      const group = L.layerGroup();
      const bounds = L.latLngBounds([]);

      for (const route of routes) {
        const decoded = decodedFallback.get(route.id);
        const useStream = colorByDirection && route.stream;

        if (useStream && route.stream) {
          const segments = buildColoredSegments(route.stream.latlng, route.stream.altitude);
          for (const seg of segments) {
            const line = L.polyline(seg.coords, {
              color: seg.color,
              weight: ELEVATION_WEIGHT,
              opacity: ELEVATION_OPACITY,
              lineCap: 'butt', // flat caps — adjacent segments don't double-paint at joints
              lineJoin: 'round',
            }).addTo(group);
            bounds.extend(line.getBounds());
          }
        } else if (decoded) {
          const line = L.polyline(decoded, {
            color: HEATMAP_COLOR,
            weight: HEATMAP_WEIGHT,
            opacity: HEATMAP_OPACITY,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(group);
          bounds.extend(line.getBounds());
        }
      }

      group.addTo(map);
      routesLayerRef.current = group;
      return bounds;
    },
    [routes, decodedFallback, colorByDirection],
  );

  // Create the map (once per route-set change at construction time).
  useEffect(() => {
    if (!mapWrapperRef.current || routes.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapWrapperRef.current, {
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 120,
    });

    mapInstanceRef.current = map;

    L.control
      .attribution({ position: 'bottomleft', prefix: false })
      .addTo(map);

    baseLayerRef.current = makeBaseLayer(basemap).addTo(map);
    if (overlay === 'pistes') {
      pisteLayerRef.current = makePistesLayer().addTo(map);
    }

    const bounds = drawRoutes(map);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    map.on('moveend', () => {
      if (overlayRef.current !== 'lifts') return;
      scheduleLiftRefresh(map);
    });

    if (overlay === 'lifts') {
      refreshLifts(map);
    }

    return () => {
      if (liftsFetchTimer.current) {
        window.clearTimeout(liftsFetchTimer.current);
        liftsFetchTimer.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        baseLayerRef.current = null;
        pisteLayerRef.current = null;
        liftsLayerRef.current = null;
        routesLayerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes.length === 0 ? 'empty' : routes.map((r) => r.id).join(',')]);

  // Redraw routes when color mode or stream data changes (no map rebuild,
  // preserves pan/zoom).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    drawRoutes(map);
  }, [colorByDirection, routes, drawRoutes]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }
    baseLayerRef.current = makeBaseLayer(basemap).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [basemap]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pisteLayerRef.current) {
      map.removeLayer(pisteLayerRef.current);
      pisteLayerRef.current = null;
    }
    if (liftsLayerRef.current) {
      map.removeLayer(liftsLayerRef.current);
      liftsLayerRef.current = null;
    }
    map.attributionControl?.removeAttribution('Lifts © OpenStreetMap (via Overpass)');

    if (overlay === 'pistes') {
      pisteLayerRef.current = makePistesLayer().addTo(map);
    } else if (overlay === 'lifts') {
      refreshLifts(map);
    }
  }, [overlay, refreshLifts]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const raf = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      if (overlayRef.current === 'lifts') {
        scheduleLiftRefresh(map, 150);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [shape, scheduleLiftRefresh]);

  const handleExport = async () => {
    const el = mapWrapperRef.current;
    const map = mapInstanceRef.current;
    if (!el) return;
    setIsExporting(true);
    try {
      if (map) map.invalidateSize({ animate: false });
      // Let Leaflet finish laying out + give any tiles in the newly-visible
      // area time to actually load before we rasterise.
      await new Promise<void>((resolve) => setTimeout(resolve, 250));

      const rect = el.getBoundingClientRect();
      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        scale: 2,
        logging: false,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        // Strip the +/− zoom control from the snapshot. Keep attribution
        // (legally required) and our own watermark/legend (decorative,
        // inside the wrapper so handled separately).
        ignoreElements: (node) =>
          node instanceof HTMLElement && node.classList.contains('leaflet-control-zoom'),
      });

      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${exportFilename}.png`;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png');
    } catch (err) {
      console.error('PNG export failed', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (routes.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={{ p: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
      >
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography color="text.secondary">
          No activities with route data in the selected window yet. Pick a date range and sync.
        </Typography>
      </Paper>
    );
  }

  const dims = SHAPES[shape];
  const isFixedWidth = typeof dims.width === 'number';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
        sx={{ mb: 1.5 }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle ??
              `${routes.length} activit${routes.length !== 1 ? 'ies' : 'y'} mapped · drag/scroll to compose, then export`}
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{ flexWrap: 'wrap', gap: 1 }}
        >
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel id="shape-label">Shape</InputLabel>
            <Select
              labelId="shape-label"
              label="Shape"
              value={shape}
              onChange={(e) => setShape(e.target.value as MapShape)}
            >
              {(Object.keys(SHAPES) as MapShape[]).map((s) => (
                <MenuItem key={s} value={s}>
                  {SHAPES[s].label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={basemap}
            exclusive
            size="small"
            onChange={(_, v) => v && setBasemap(v)}
          >
            <ToggleButton value="light" sx={{ textTransform: 'none' }}>Light</ToggleButton>
            <ToggleButton value="terrain" sx={{ textTransform: 'none' }}>Terrain</ToggleButton>
            <ToggleButton value="satellite" sx={{ textTransform: 'none' }}>Satellite</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            value={overlay}
            exclusive
            size="small"
            onChange={(_, v) => v && setOverlay(v)}
          >
            <ToggleButton value="none" sx={{ textTransform: 'none' }}>No overlay</ToggleButton>
            <ToggleButton value="pistes" sx={{ textTransform: 'none' }}>Pistes+lifts</ToggleButton>
            <ToggleButton value="lifts" sx={{ textTransform: 'none' }}>
              Lifts only{isLoadingLifts ? '…' : ''}
            </ToggleButton>
          </ToggleButtonGroup>

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={colorByDirection}
                onChange={(e) => onColorByDirectionChange(e.target.checked)}
              />
            }
            label={
              <Box component="span" sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                Up/down{directionsLoading ? '…' : ''}
              </Box>
            }
            sx={{ mr: 0 }}
          />

          <Button
            variant="outlined"
            size="small"
            startIcon={isExporting ? <CircularProgress size={14} /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting…' : 'PNG'}
          </Button>
        </Stack>
      </Stack>

      <Box
        ref={mapWrapperRef}
        sx={{
          position: 'relative',
          height: dims.height,
          width: dims.width,
          maxWidth: '100%',
          mx: isFixedWidth ? 'auto' : 0,
          borderRadius: 1,
          overflow: 'hidden',
          '& .leaflet-container': {
            height: '100%',
            width: '100%',
            background: '#f0f0f0',
          },
          '& .leaflet-control-attribution': {
            fontSize: '10px',
            background: 'rgba(255,255,255,0.78)',
            padding: '1px 6px',
            borderRadius: '3px',
            color: 'rgba(0,0,0,0.7)',
          },
          '& .leaflet-control-attribution a': {
            color: 'rgba(0,0,0,0.7)',
          },
        }}
      >
        {colorByDirection && (
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              right: 10,
              px: 1.25,
              py: 0.5,
              bgcolor: 'rgba(255,255,255,0.92)',
              borderRadius: 1,
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'rgba(0,0,0,0.78)',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              display: 'flex',
              gap: 1.25,
              alignItems: 'center',
            }}
          >
            <LegendDot color={UP_COLOR} label="Up" />
            <LegendDot color={DOWN_COLOR} label="Down" />
            <LegendDot color={FLAT_COLOR} label="Flat" />
          </Box>
        )}
        {watermark && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              px: 1.25,
              py: 0.5,
              bgcolor: 'rgba(255,255,255,0.92)',
              borderRadius: 1,
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'rgba(0,0,0,0.78)',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              letterSpacing: 0.2,
            }}
          >
            {watermark}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 10, height: 4, bgcolor: color, borderRadius: 0.5 }} />
      <span>{label}</span>
    </Box>
  );
}
