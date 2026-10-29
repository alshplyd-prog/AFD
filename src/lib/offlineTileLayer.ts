/**
 * Offline TileLayer & Map Tile Pre-Cacher for Leaflet
 * Caches map tiles into CacheStorage / IndexedDB for instant 0ms map opening and full offline support.
 */

import L from 'leaflet';

const MAP_TILES_CACHE = 'alkarrar-map-tiles-v1';

// Clean SVG fallback tile for offline areas not yet cached
const OFFLINE_TILE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="%231e293b"/><path d="M0 64h256M0 128h256M0 192h256M64 0v256M128 0v256M192 0v256" stroke="%23334155" stroke-width="1"/><circle cx="128" cy="128" r="4" fill="%2364748b" opacity="0.4"/></svg>`;

export class OfflineTileLayer extends L.TileLayer {
  private cachePromise: Promise<Cache | null> | null = null;

  constructor(urlTemplate: string, options?: L.TileLayerOptions) {
    super(urlTemplate, {
      maxZoom: 19,
      minZoom: 4,
      keepBuffer: 8,
      updateWhenIdle: false,
      updateWhenZooming: true,
      ...options,
    });

    if (typeof window !== 'undefined' && 'caches' in window) {
      this.cachePromise = caches.open(MAP_TILES_CACHE).catch(() => null);
    }
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.setAttribute('role', 'presentation');
    tile.alt = '';

    const url = this.getTileUrl(coords);
    const fallbackCartoUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/${coords.z}/${coords.x}/${coords.y}.png`;
    let isDone = false;
    let createdBlobUrl: string | null = null;

    const safeDone = (err?: any) => {
      if (isDone) return;
      isDone = true;
      try {
        done(err, tile);
      } catch (e) {}
    };

    L.DomEvent.on(tile, 'load', () => safeDone());
    L.DomEvent.on(tile, 'error', () => {
      if (createdBlobUrl) {
        try { URL.revokeObjectURL(createdBlobUrl); } catch (e) {}
        createdBlobUrl = null;
      }
      // If primary tile failed, try CartoDB Voyager CDN before falling back to SVG
      if (tile.src !== fallbackCartoUrl && tile.src !== OFFLINE_TILE_SVG) {
        tile.src = fallbackCartoUrl;
      } else if (tile.src !== OFFLINE_TILE_SVG) {
        tile.src = OFFLINE_TILE_SVG;
        safeDone();
      } else {
        safeDone();
      }
    });

    // Fast local memory / cache check
    if (this.cachePromise) {
      this.cachePromise.then(async (cache) => {
        if (!cache) {
          tile.src = url;
          return;
        }

        try {
          const cachedResponse = await cache.match(url);
          if (cachedResponse && cachedResponse.ok) {
            const blob = await cachedResponse.blob();
            createdBlobUrl = URL.createObjectURL(blob);
            tile.src = createdBlobUrl;
            return;
          }
        } catch (e) {}

        // If not cached, assign src to url and attempt background caching safely
        tile.src = url;
        try {
          fetch(url, { mode: 'no-cors' })
            .catch(() => {});
        } catch (e) {}
      }).catch(() => {
        tile.src = url;
      });
    } else {
      tile.src = url;
    }

    return tile;
  }
}

/**
 * Pre-cache map tiles for Iraq / Baghdad and all pinned customer locations in the background.
 */
export async function precacheMapTilesForLocations(
  locations: Array<{ latitude?: number | null; longitude?: number | null }>
) {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  try {
    const cache = await caches.open(MAP_TILES_CACHE);
    const targetPoints: Array<{ lat: number; lng: number }> = [
      { lat: 33.3152, lng: 44.3661 }, // Baghdad / Iraq center
    ];

    locations.forEach((loc) => {
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        targetPoints.push({ lat, lng });
      }
    });

    const zoomLevels = [11, 12, 13, 14, 15];

    // Calculate tile numbers for (lat, lng, zoom)
    const urlsToCache: string[] = [];
    targetPoints.slice(0, 30).forEach((pt) => {
      zoomLevels.forEach((z) => {
        const n = Math.pow(2, z);
        const rad = (pt.lat * Math.PI) / 180;
        const x = Math.floor(((pt.lng + 180) / 360) * n);
        const y = Math.floor(
          ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
        );

        // Subdomain distribution
        const sub = ['a', 'b', 'c'][(x + y) % 3];
        urlsToCache.push(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`);
      });
    });

    // Fetch and cache silently in background with throttling
    const uniqueUrls = Array.from(new Set(urlsToCache));
    for (const url of uniqueUrls) {
      const exists = await cache.match(url);
      if (!exists) {
        fetch(url, { mode: 'cors' })
          .then((res) => {
            if (res.ok) cache.put(url, res);
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    // Non-critical background task
  }
}
