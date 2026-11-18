export interface LocalMapsParseResult {
  latitude: number;
  longitude: number;
  label: string | null;
  source: 'google_maps_url' | 'coordinates';
}

const PIN_3D_4D_REGEX = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g;
const AT_COORDS_REGEX = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|$|\/)/;
const COORDS_PAIR_REGEX = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const PLACE_PATH_REGEX = /\/maps\/place\/([^/@?#]+)/;
const SEARCH_PATH_REGEX = /\/maps\/search\/([^/@?#]+)/;

const GOOGLE_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'maps.google.com.vn',
  'www.google.com',
  'google.com',
  'www.google.com.vn',
  'google.com.vn',
]);

export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function decodeLabel(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw.replace(/\+/g, ' ').trim();
  }
}

export function isGoogleMapsUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.com\/maps|maps\.google\.com)/i.test(trimmed)
    ? `https://${trimmed}`
    : '';
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (!GOOGLE_MAPS_HOSTS.has(host)) return false;
    if (host === 'goo.gl') return parsed.pathname.startsWith('/maps');
    if (host.endsWith('google.com') || host.endsWith('google.com.vn')) {
      return (
        host.startsWith('maps.') ||
        parsed.pathname.startsWith('/maps') ||
        parsed.pathname.startsWith('/search')
      );
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts instant client-side coordinate extraction for Google Maps URLs containing
 * coordinates (@lat,lng, !3d!4d, ?q=lat,lng, query=lat,lng, ll=lat,lng) or direct "lat, lng".
 * Returns null if Backend resolution (short links, search queries, or text geocoding) is needed.
 */
export function parseGoogleMapsLocally(input: string): LocalMapsParseResult | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct coordinate pair "21.0285, 105.8542"
  const direct = COORDS_PAIR_REGEX.exec(trimmed);
  if (direct) {
    const lat = Number(direct[1]);
    const lng = Number(direct[2]);
    if (isValidLatLng(lat, lng)) {
      return {
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        label: null,
        source: 'coordinates',
      };
    }
    return null;
  }

  if (!isGoogleMapsUrl(trimmed)) {
    return null;
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return null;
  }

  // Short links must be resolved by Backend
  const host = parsed.hostname.toLowerCase();
  if (host === 'maps.app.goo.gl' || host === 'goo.gl') {
    return null;
  }

  let lat: number | null = null;
  let lng: number | null = null;
  let label: string | null = null;

  const placeMatch = PLACE_PATH_REGEX.exec(parsed.pathname);
  if (placeMatch) {
    const decoded = decodeLabel(placeMatch[1]);
    if (decoded && !COORDS_PAIR_REGEX.test(decoded)) {
      label = decoded;
    }
  } else {
    const searchMatch = SEARCH_PATH_REGEX.exec(parsed.pathname);
    if (searchMatch) {
      const decoded = decodeLabel(searchMatch[1]);
      const pair = COORDS_PAIR_REGEX.exec(decoded);
      if (pair) {
        lat = Number(pair[1]);
        lng = Number(pair[2]);
      } else if (decoded) {
        label = decoded;
      }
    }
  }

  // 1. Prefer exact pin !3dLAT!4dLNG over @viewport
  let pinMatch: RegExpExecArray | null = null;
  let lastPin: RegExpExecArray | null = null;
  PIN_3D_4D_REGEX.lastIndex = 0;
  while ((pinMatch = PIN_3D_4D_REGEX.exec(normalizedUrl)) !== null) {
    lastPin = pinMatch;
  }
  if (lastPin) {
    lat = Number(lastPin[1]);
    lng = Number(lastPin[2]);
  }

  // 2. Fallback to @lat,lng
  if (lat === null || lng === null) {
    const atMatch = AT_COORDS_REGEX.exec(normalizedUrl);
    if (atMatch) {
      lat = Number(atMatch[1]);
      lng = Number(atMatch[2]);
    }
  }

  // 3. Query params: q=, query=, ll=, center=
  for (const key of ['q', 'query', 'll', 'center']) {
    const val = parsed.searchParams.get(key);
    if (!val) continue;
    const decoded = decodeLabel(val);
    const pair = COORDS_PAIR_REGEX.exec(decoded);
    if (pair) {
      if (lat === null || lng === null) {
        lat = Number(pair[1]);
        lng = Number(pair[2]);
      }
    } else if (!label) {
      label = decoded;
    }
  }

  if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
    return {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      label,
      source: 'google_maps_url',
    };
  }

  return null;
}
