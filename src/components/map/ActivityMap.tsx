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
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import { decodePolyline } from '../../utils/polyline';
import { fetchSkiLifts, liftColor, type LiftWay } from '../../services/overpass';

export type Basemap = 'light' | 'terrain' | 'satellite';
export type SkiOverlay = 'none' | 'pistes' | 'lifts';
export type MapShape =
  | 'standard'
  | 'tall'
  | 'landscape'
  | 'portrait'
  | 'square'
  | 'banner';

interface ActivityMapProps {
  polylines: string[];
  title?: string;
  subtitle?: string;
  defaultBasemap?: Basemap;
  defaultOverlay?: SkiOverlay;
  defaultShape?: MapShape;
  watermark?: string;
  exportFilename?: string;
}

const HEATMAP_COLOR = '#FC4C02';
const HEATMAP_WEIGHT = 4;
const HEATMAP_OPACITY = 0.35;

interface ShapeDef {
  width: number | string; // numeric → centered fixed; string ('100%') → full container
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

export function ActivityMap({
  polylines,
  title = 'Activities',
  subtitle,
  defaultBasemap = 'light',
  defaultOverlay = 'none',
  defaultShape = 'standard',
  watermark,
  exportFilename = 'strava-map',
}: ActivityMapProps) {
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const pisteLayerRef = useRef<L.TileLayer | null>(null);
  const liftsLayerRef = useRef<L.LayerGroup | null>(null);
  const liftsFetchTimer = useRef<number | null>(null);

  const [basemap, setBasemap] = useState<Basemap>(defaultBasemap);
  const [overlay, setOverlay] = useState<SkiOverlay>(defaultOverlay);
  const [shape, setShape] = useState<MapShape>(defaultShape);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingLifts, setIsLoadingLifts] = useState(false);

  // Keep an up-to-date ref of `overlay` for use inside the Leaflet event
  // handler — without this the moveend closure captures a stale value and
  // lift refetches stop firing after the user changes the overlay.
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
  }, [overlay]);

  const allCoordinates = useMemo(() => {
    return polylines
      .map((p) => decodePolyline(p))
      .filter((coords) => coords.length > 0);
  }, [polylines]);

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

  // Create the map + draw polylines whenever the activity set changes.
  useEffect(() => {
    if (!mapWrapperRef.current || allCoordinates.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    const map = L.map(mapWrapperRef.current, {
      zoomControl: true,
      attributionControl: false, // we add our own control positioned bottom-left
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

    const allBounds = L.latLngBounds([]);
    allCoordinates.forEach((coordinates) => {
      const routeLine = L.polyline(coordinates, {
        color: HEATMAP_COLOR,
        weight: HEATMAP_WEIGHT,
        opacity: HEATMAP_OPACITY,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      allBounds.extend(routeLine.getBounds());
    });

    if (allBounds.isValid()) {
      map.fitBounds(allBounds, { padding: [20, 20] });
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
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCoordinates]);

  // Swap basemap without rebuilding the map (preserves pan/zoom).
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }
    baseLayerRef.current = makeBaseLayer(basemap).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [basemap]);

  // Overlay state changes (none / pistes / lifts).
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
    // Drop lift attribution; refreshLifts re-adds it if needed.
    map.attributionControl?.removeAttribution('Lifts © OpenStreetMap (via Overpass)');

    if (overlay === 'pistes') {
      pisteLayerRef.current = makePistesLayer().addTo(map);
    } else if (overlay === 'lifts') {
      refreshLifts(map);
    }
  }, [overlay, refreshLifts]);

  // Reshape: invalidateSize so Leaflet re-measures, then refetch lifts
  // explicitly since the visible bounds just changed.
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
      // Make sure Leaflet has finished any pending render before we snapshot.
      if (map) map.invalidateSize({ animate: false });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(el, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: null,
        scale: 2,
        logging: false,
        width: el.clientWidth,
        height: el.clientHeight,
        windowWidth: el.clientWidth,
        windowHeight: el.clientHeight,
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

  if (polylines.length === 0) {
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
              `${polylines.length} activit${polylines.length !== 1 ? 'ies' : 'y'} mapped · drag/scroll to compose, then export`}
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
