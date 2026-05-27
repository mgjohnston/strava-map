import { useEffect, useRef, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  CircularProgress,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import { decodePolyline } from '../../utils/polyline';

export type Basemap = 'light' | 'terrain' | 'satellite';
export type MapShape =
  | 'standard'
  | 'tall'
  | 'landscape'
  | 'portrait'
  | 'square'
  | 'banner';

export interface RunRoute {
  id: number;
  polyline: string;
  /** Per-route opacity (0..1). */
  opacity: number;
  /** Run distance in km — used to sum visible distance for the overlay. */
  distanceKm: number;
}

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

interface RunsMapProps {
  routes: RunRoute[];
  title?: string;
  subtitle?: string;
  timeframe?: string;
  /** Activity count rendered as the second line of the timeframe overlay. */
  activityCount?: number;
  /** Total distance across all routes (km) — third line of the overlay. */
  totalDistanceKm?: number;
  defaultBasemap?: Basemap;
  defaultShape?: MapShape;
  exportFilename?: string;
  globalOpacity: number;
  onGlobalOpacityChange: (next: number) => void;
}

const HEATMAP_COLOR = '#FC4C02';
const HEATMAP_WEIGHT = 4;

// Default view centred on Cambridge city centre — keeps the map tight on
// the city even when the synced set contains outlier runs (holidays, away
// trips) that would otherwise zoom the heatmap out to nothing.
const CAMBRIDGE_CENTER: [number, number] = [52.2053, 0.1218];
const CAMBRIDGE_ZOOM = 13;
// If the route bounds fit roughly within this radius (km) of Cambridge,
// we fit to them; otherwise we stay at the default Cambridge view.
const CAMBRIDGE_FIT_RADIUS_KM = 25;

function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

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

function makeBaseLayer(basemap: Basemap): L.TileLayer {
  const def = BASEMAPS[basemap];
  return L.tileLayer(def.url, {
    maxZoom: def.maxZoom,
    attribution: def.attribution,
    subdomains: def.subdomains ?? 'abc',
    crossOrigin: 'anonymous',
  });
}

export function RunsMap({
  routes,
  title = 'Your runs',
  subtitle,
  timeframe,
  activityCount,
  totalDistanceKm,
  defaultBasemap = 'light',
  defaultShape = 'standard',
  exportFilename = 'cambridge-runs',
  globalOpacity,
  onGlobalOpacityChange,
}: RunsMapProps) {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const polylinesByIdRef = useRef<Map<number, L.Polyline>>(new Map());

  const [basemap, setBasemap] = useState<Basemap>(defaultBasemap);
  const [shape, setShape] = useState<MapShape>(defaultShape);
  const [isExporting, setIsExporting] = useState(false);
  // Count + distance of routes whose polyline intersects the current
  // viewport. Updated on Leaflet moveend (pan + zoom + invalidateSize all
  // fire this).
  const [visibleCount, setVisibleCount] = useState<number>(0);
  const [visibleDistanceKm, setVisibleDistanceKm] = useState<number>(0);

  // Lookup of route id -> distance for the visible-distance sum. Held in a
  // ref so the moveend handler (set up once per route-set change) always
  // reads the latest map without re-binding listeners.
  const distanceByIdRef = useRef<Map<number, number>>(new Map());
  const distanceById = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of routes) m.set(r.id, r.distanceKm);
    return m;
  }, [routes]);
  useEffect(() => {
    distanceByIdRef.current = distanceById;
  }, [distanceById]);

  const decoded = useMemo(() => {
    const map = new Map<number, [number, number][]>();
    for (const r of routes) {
      const coords = decodePolyline(r.polyline);
      if (coords.length > 0) map.set(r.id, coords);
    }
    return map;
  }, [routes]);

  // The "shape" of the route set (which ids are mapped) — when this changes
  // we tear down and rebuild polylines. Pure opacity edits are handled by
  // the lightweight setStyle effect below.
  const routeIdsKey = useMemo(
    () => routes.map((r) => r.id).join(','),
    [routes],
  );

  // Build / rebuild map and the route layer when the *set* of routes changes.
  useEffect(() => {
    if (!mapWrapperRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    polylinesByIdRef.current = new Map();

    if (routes.length === 0) return;

    const map = L.map(mapWrapperRef.current, {
      // Disable default top-left zoom — we add it at bottom-left below so
      // it doesn't overlap the timeframe / stats legend overlay.
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      wheelPxPerZoomLevel: 120,
    }).setView(CAMBRIDGE_CENTER, CAMBRIDGE_ZOOM);
    mapInstanceRef.current = map;

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

    baseLayerRef.current = makeBaseLayer(basemap).addTo(map);

    const group = L.layerGroup();
    const bounds = L.latLngBounds([]);

    for (const r of routes) {
      const coords = decoded.get(r.id);
      if (!coords) continue;
      const line = L.polyline(coords, {
        color: HEATMAP_COLOR,
        weight: HEATMAP_WEIGHT,
        opacity: r.opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);
      polylinesByIdRef.current.set(r.id, line);
      bounds.extend(line.getBounds());
    }

    group.addTo(map);
    routesLayerRef.current = group;

    // Only fit to route bounds when the runs are roughly *in* Cambridge.
    // Outlier activities (e.g. a holiday) would otherwise zoom the heatmap
    // out to a continent and shrink the city to a dot.
    if (bounds.isValid()) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const farFromCambridge =
        distanceKm(CAMBRIDGE_CENTER, [ne.lat, ne.lng]) > CAMBRIDGE_FIT_RADIUS_KM ||
        distanceKm(CAMBRIDGE_CENTER, [sw.lat, sw.lng]) > CAMBRIDGE_FIT_RADIUS_KM;
      if (!farFromCambridge) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }

    const recomputeVisible = () => {
      const m = mapInstanceRef.current;
      if (!m) return;
      const viewport = m.getBounds();
      let n = 0;
      let km = 0;
      // Point-by-point check is more reliable than bounds-intersects here —
      // a route's bounding box can extend off-map even when the actual path
      // passes through the viewport, and vice versa.
      for (const [id, line] of polylinesByIdRef.current.entries()) {
        const latlngs = line.getLatLngs() as L.LatLng[];
        for (let i = 0; i < latlngs.length; i++) {
          if (viewport.contains(latlngs[i])) {
            n++;
            km += distanceByIdRef.current.get(id) ?? 0;
            break;
          }
        }
      }
      setVisibleCount(n);
      setVisibleDistanceKm(km);
    };
    // Defer the first compute past fitBounds's animation frame so the
    // viewport we read reflects the post-fit bounds, not the pre-fit ones.
    const raf = window.requestAnimationFrame(recomputeVisible);
    map.on('moveend', recomputeVisible);
    map.on('zoomend', recomputeVisible);

    return () => {
      window.cancelAnimationFrame(raf);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        baseLayerRef.current = null;
        routesLayerRef.current = null;
        polylinesByIdRef.current = new Map();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeIdsKey]);

  // Lightweight opacity update — runs every render but is essentially free
  // because we only call setStyle on polylines whose opacity actually changed.
  useEffect(() => {
    for (const r of routes) {
      const line = polylinesByIdRef.current.get(r.id);
      if (!line) continue;
      const current = (line.options as L.PolylineOptions).opacity;
      if (current !== r.opacity) {
        line.setStyle({ opacity: r.opacity });
      }
    }
  }, [routes]);

  // Swap basemap without rebuilding routes.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (baseLayerRef.current) map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = makeBaseLayer(basemap).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [basemap]);

  // Tell Leaflet to recompute its size after a shape change; without this
  // the tiles stay at the old dimensions until the next pan/zoom.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const raf = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [shape]);

  const handleExport = async () => {
    const el = mapWrapperRef.current;
    const map = mapInstanceRef.current;
    if (!el) return;
    setIsExporting(true);
    try {
      if (map) map.invalidateSize({ animate: false });
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
          No runs with route data in the selected window. Pick a date range and sync.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
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
            {subtitle ?? `${routes.length} run${routes.length !== 1 ? 's' : ''} mapped`}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 220 }}>
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
              Opacity
            </Typography>
            <Slider
              size="small"
              min={0.05}
              max={1}
              step={0.05}
              value={globalOpacity}
              onChange={(_, v) => onGlobalOpacityChange(v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => v.toFixed(2)}
              sx={{ minWidth: 140 }}
            />
          </Stack>

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
          height: SHAPES[shape].height,
          width: SHAPES[shape].width,
          maxWidth: '100%',
          mx: typeof SHAPES[shape].width === 'number' ? 'auto' : 0,
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
        }}
      >
        {(timeframe || activityCount != null) && (
          <Box
            sx={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 500,
              px: 1.25,
              py: 0.5,
              bgcolor: 'rgba(255,255,255,0.92)',
              borderRadius: 1,
              color: 'rgba(0,0,0,0.78)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
            }}
          >
            {timeframe && (
              <Box sx={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: 0.2 }}>
                {timeframe}
              </Box>
            )}
            {activityCount != null && activityCount > 0 && (
              <Box sx={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.85 }}>
                {visibleCount < activityCount
                  ? `${visibleCount} of ${activityCount} run${activityCount !== 1 ? 's' : ''}`
                  : `${activityCount} run${activityCount !== 1 ? 's' : ''}`}
              </Box>
            )}
            {totalDistanceKm != null && totalDistanceKm > 0 && (
              <Box sx={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.85 }}>
                {visibleDistanceKm < totalDistanceKm - 0.05
                  ? `${visibleDistanceKm.toFixed(1)} / ${totalDistanceKm.toFixed(1)} km`
                  : `${totalDistanceKm.toFixed(1)} km`}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
}
