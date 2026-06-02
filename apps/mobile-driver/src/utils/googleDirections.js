import Constants from 'expo-constants';

const GMAPS_KEY = Constants.expoConfig?.extra?.googleMapsKey;

export function decodePolyline(encoded) {
  if (!encoded) return [];
  let index = 0, lat = 0, lng = 0;
  const result = [];
  while (index < encoded.length) {
    let b, shift = 0, val = 0;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (val & 1) ? ~(val >> 1) : val >> 1;
    shift = 0; val = 0;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (val & 1) ? ~(val >> 1) : val >> 1;
    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return result;
}

export async function fetchRoute(originLat, originLng, destLat, destLng) {
  try {
    const params = new URLSearchParams({
      origin:      `${originLat},${originLng}`,
      destination: `${destLat},${destLng}`,
      key:         GMAPS_KEY,
      mode:        'driving',
      language:    'fr',
    });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK' || !json.routes[0]) return null;
    const points = json.routes[0].overview_polyline?.points;
    return points ? decodePolyline(points) : null;
  } catch (e) {
    console.warn('[fetchRoute] error:', e.message);
    return null;
  }
}
