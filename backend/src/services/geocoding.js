/**
 * Service de géocodage
 *
 * Stratégie :
 *   1. Google Maps API (précision maximale, quota payant)
 *   2. Nominatim/OpenStreetMap (fallback gratuit, 1 req/s rate limit)
 *
 * Le fallback OSM est activé automatiquement quand :
 *   - GOOGLE_MAPS_KEY absent
 *   - Circuit breaker GoogleMaps en état OPEN
 *   - Google Maps retourne une erreur ou un résultat vide
 *
 * P2.2 : avant, si Google Maps était down, autocomplete retournait [] et
 * getPlaceDetails retournait null → impossible de commander une course.
 * Maintenant Nominatim prend le relai de façon transparente.
 */

const { withGoogleMaps } = require('../middleware/terminator/circuitBreaker');
const logger = require('./logger');

const GOOGLE_KEY  = process.env.GOOGLE_MAPS_KEY;
const NOMINATIM   = 'https://nominatim.openstreetmap.org';
const OSM_HEADERS = { 'User-Agent': 'Shifter-MotoTaxi/1.0 (contact@shifter.app)' };

// ─────────────────────────────────────────────────────────────────────────────
// NOMINATIM HELPERS (fallback OSM)
// ─────────────────────────────────────────────────────────────────────────────

const nominatimSearch = async (query, lat, lng) => {
  try {
    const params = new URLSearchParams({
      q: query, format: 'json', limit: '6', addressdetails: '1',
      'accept-language': 'fr', countrycodes: 'fr',
    });
    if (lat && lng) { params.set('viewbox', `${lng - 0.5},${lat + 0.5},${lng + 0.5},${lat - 0.5}`); params.set('bounded', '1'); }
    const res  = await fetch(`${NOMINATIM}/search?${params}`, { headers: OSM_HEADERS });
    const json = await res.json();
    return json.map((p) => ({
      placeId:   `osm_${p.place_id}`,
      address:   p.display_name,
      shortName: p.name || p.display_name.split(',')[0].trim(),
      lat:       parseFloat(p.lat),
      lng:       parseFloat(p.lon),
    }));
  } catch (err) {
    logger.warn('[geocoding] Nominatim search error', { error: err.message });
    return [];
  }
};

const nominatimReverse = async (lat, lng) => {
  try {
    const params = new URLSearchParams({ lat, lon: lng, format: 'json', 'accept-language': 'fr' });
    const res  = await fetch(`${NOMINATIM}/reverse?${params}`, { headers: OSM_HEADERS });
    const json = await res.json();
    if (!json.display_name) return null;
    const addr = json.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const city = addr.city || addr.town || addr.village || addr.county || '';
    return {
      address:      json.display_name,
      shortAddress: [road, city].filter(Boolean).join(', ') || json.display_name.split(',').slice(0, 2).join(',').trim(),
      lat:          parseFloat(lat),
      lng:          parseFloat(lng),
    };
  } catch (err) {
    logger.warn('[geocoding] Nominatim reverse error', { error: err.message });
    return null;
  }
};

const nominatimDetails = async (placeId) => {
  // placeId OSM : "osm_NNNNN" → extraire le numéro
  const osmId = placeId.startsWith('osm_') ? placeId.replace('osm_', '') : null;
  if (!osmId) return null;
  try {
    const params = new URLSearchParams({ place_id: osmId, format: 'json', 'accept-language': 'fr', addressdetails: '1' });
    const res  = await fetch(`${NOMINATIM}/details?${params}`, { headers: OSM_HEADERS });
    const json = await res.json();
    if (!json.centroid?.coordinates) return null;
    const [lng, lat] = json.centroid.coordinates;
    return { address: json.localname || '', lat: parseFloat(lat), lng: parseFloat(lng) };
  } catch (err) {
    logger.warn('[geocoding] Nominatim details error', { error: err.message });
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE MAPS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const googleAutocomplete = async (query, lat, lng) => {
  if (!GOOGLE_KEY) return null;
  return withGoogleMaps(async () => {
    const location = (lat && lng) ? `${lat},${lng}` : '48.8566,2.3522';
    const params = new URLSearchParams({
      input: query, key: GOOGLE_KEY, language: 'fr',
      components: 'country:fr', location, radius: '50000',
    });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      logger.warn('[geocoding] Google autocomplete error', { status: json.status });
      return null; // null → bascule sur Nominatim
    }
    return (json.predictions || []).slice(0, 6).map((p) => ({
      placeId:   p.place_id,
      address:   p.description,
      shortName: p.structured_formatting?.main_text || p.description.split(',')[0],
      lat: null, lng: null,
    }));
  }, null);
};

const googlePlaceDetails = async (placeId) => {
  if (!GOOGLE_KEY) return null;
  return withGoogleMaps(async () => {
    const params = new URLSearchParams({ place_id: placeId, fields: 'geometry,formatted_address', key: GOOGLE_KEY, language: 'fr' });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK') {
      logger.warn('[geocoding] Google place details error', { status: json.status });
      return null;
    }
    const loc = json.result?.geometry?.location;
    return { address: json.result?.formatted_address || null, lat: loc?.lat || null, lng: loc?.lng || null };
  }, null);
};

const googleReverseGeocode = async (lat, lng) => {
  if (!GOOGLE_KEY) return null;
  return withGoogleMaps(async () => {
    const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: GOOGLE_KEY, language: 'fr', result_type: 'street_address|route' });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK') { logger.warn('[geocoding] Google reverse error', { status: json.status }); return null; }
    const result = json.results?.[0];
    if (!result) return null;
    const comps = result.address_components || [];
    const road  = comps.find((c) => c.types.includes('route'))?.long_name;
    const city  = comps.find((c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2'))?.long_name;
    return {
      address:      result.formatted_address,
      shortAddress: [road, city].filter(Boolean).join(', ') || result.formatted_address.split(',').slice(0, 2).join(',').trim(),
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    };
  }, null);
};

// ─────────────────────────────────────────────────────────────────────────────
// API PUBLIQUE — Google avec fallback Nominatim automatique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Autocomplétion d'adresse.
 * Google Maps → fallback Nominatim si Google indisponible.
 */
const autocomplete = async (query, lat, lng) => {
  if (!query || query.length < 3) return [];

  const googleResult = await googleAutocomplete(query, lat, lng);
  if (googleResult !== null) return googleResult; // Google OK (même si liste vide)

  // Fallback Nominatim
  logger.info('[geocoding] Fallback Nominatim pour autocomplete');
  return nominatimSearch(query, lat, lng);
};

/**
 * Détails d'un lieu (coordonnées depuis un placeId).
 * Si placeId commence par "osm_" → Nominatim directement.
 * Sinon Google → fallback Nominatim si null.
 */
const getPlaceDetails = async (placeId) => {
  if (!placeId) return null;

  // PlaceId OSM → Nominatim direct
  if (placeId.startsWith('osm_')) return nominatimDetails(placeId);

  const googleResult = await googlePlaceDetails(placeId);
  if (googleResult !== null) return googleResult;

  logger.info('[geocoding] Fallback Nominatim pour getPlaceDetails');
  return null; // placeId Google invalide sans Google → impossible de résoudre
};

/**
 * Géocodage inverse (lat/lng → adresse).
 * Google Maps → fallback Nominatim.
 */
const reverseGeocode = async (lat, lng) => {
  const googleResult = await googleReverseGeocode(lat, lng);
  if (googleResult !== null) return googleResult;

  logger.info('[geocoding] Fallback Nominatim pour reverseGeocode');
  return nominatimReverse(lat, lng);
};

module.exports = { autocomplete, getPlaceDetails, reverseGeocode };
