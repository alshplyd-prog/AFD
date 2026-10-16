import { fetchWithFallback } from './apiConfig';

export interface RouteResult {
  success: boolean;
  coordinates: [number, number][]; // [lat, lng]
  distance: number; // meters
  duration: number; // seconds
  error?: string;
}

// In-memory client cache for driving routes
const clientRouteCache = new Map<string, { result: RouteResult; expiry: number }>();

/**
 * Fetch real street-following driving directions between two coordinates.
 * Multi-tiered strategy ensures street navigation works in both Web and Android APK.
 * Never returns a straight 2-point line.
 */
export async function fetchStreetDrivingRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<RouteResult> {
  const cacheKey = `${start.lat.toFixed(4)},${start.lng.toFixed(4)}->${end.lat.toFixed(4)},${end.lng.toFixed(4)}`;
  const cached = clientRouteCache.get(cacheKey);
  if (cached && cached.expiry > Date.now() && cached.result.success) {
    return cached.result;
  }

  // Tier 1: Backend Route Proxy (Universal - works in web and APK via fetchWithFallback)
  try {
    const proxyEndpoint = `/api/route?fromLat=${start.lat}&fromLng=${start.lng}&toLat=${end.lat}&toLng=${end.lng}`;
    const res = await fetchWithFallback(proxyEndpoint, undefined, 7500);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
        const result: RouteResult = {
          success: true,
          coordinates: data.coordinates,
          distance: data.distance || 0,
          duration: data.duration || 0,
        };
        clientRouteCache.set(cacheKey, { result, expiry: Date.now() + 5 * 60 * 1000 });
        return result;
      }
    }
  } catch (err) {
    // Continue to direct public mirrors
  }

  // Tier 2: Direct Public OSRM API (CORS enabled)
  const publicEndpoints = [
    `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`,
    `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`,
  ];

  for (const url of publicEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.code === 'Ok' && data.routes && data.routes[0]) {
          const route = data.routes[0];
          const rawCoords = route.geometry?.coordinates;
          if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
            // OSRM returns [lng, lat], convert to [lat, lng] for Leaflet
            const coordinates: [number, number][] = rawCoords.map(([lng, lat]: [number, number]) => [lat, lng]);
            const result: RouteResult = {
              success: true,
              coordinates,
              distance: Math.round(route.distance),
              duration: Math.round(route.duration),
            };
            clientRouteCache.set(cacheKey, { result, expiry: Date.now() + 5 * 60 * 1000 });
            return result;
          }
        }
      }
    } catch (endpointErr) {
      // Try next mirror
    }
  }

  return {
    success: false,
    coordinates: [],
    distance: 0,
    duration: 0,
    error: 'تعذر جلب مسار الشوارع من خوادم التوجيه المتاحة حالياً',
  };
}
