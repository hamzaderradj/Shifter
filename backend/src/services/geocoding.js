/**
 * Service de géocodage — Google Maps API
 * Toutes les fonctions protégées par le circuit breaker TERMINATOR T3
 */

const { withGoogleMaps } = require('../middleware/terminator/circuitBreaker');
const logger = require('./logger');
const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;

// ── autocomplete ──────────────────────────────────────────────
const autocomplete = async (query, lat, lng) => {
  if (!query || query.length < 3) return [];
  return withGoogleMaps(async () => {
    const location = (lat && lng) ? `${lat},${lng}` : '48.8566,2.3522';
    const params = new URLSearchParams({
      input: query, key: GOOGLE_KEY, language: 'fr',
      components: 'country:fr', location, radius: '50000',
    });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      logger.warn('[geocoding] autocomplete error', { status: json.status });
      return [];
    }
    return (json.predictions || []).slice(0, 6).map((p) => ({
      placeId:   p.place_id,
      address:   p.description,
      shortName: p.structured_formatting?.main_text || p.description.split(',')[0],
      lat: null, lng: null,
    }));
  }, []); // fallback circuit ouvert : liste vide
};

// ── getPlaceDetails ───────────────────────────────────────────
const getPlaceDetails = async (placeId) => {
  return withGoogleMaps(async () => {
    const params = new URLSearchParams({
      place_id: placeId,
      fields:   'geometry,formatted_address',
      key:      GOOGLE_KEY,
      language: 'fr',
    });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK') {
      logger.warn('[geocoding] place details error', { status: json.status, placeId });
      return null;
    }
    const loc = json.result?.geometry?.location;
    return {
      address: json.result?.formatted_address || null,
      lat:     loc?.lat || null,
      lng:     loc?.lng || null,
    };
  }, null); // fallback : null
};

// ── reverseGeocode ────────────────────────────────────────────
const reverseGeocode = async (lat, lng) => {
  return withGoogleMaps(async () => {
    const params = new URLSearchParams({
      latlng:      `${lat},${lng}`,
      key:         GOOGLE_KEY,
      language:    'fr',
      result_type: 'street_address|route',
    });
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const json = await res.json();
    if (json.status !== 'OK') {
      logger.warn('[geocoding] reverse error', { status: json.status });
      return null;
    }
    const result = json.results?.[0];
    if (!result) return null;
    const comps = result.address_components || [];
    const route = comps.find((c) => c.types.includes('route'))?.long_name;
    const city  = comps.find((c) =>
      c.types.includes('locality') || c.types.includes('administrative_area_level_2')
    )?.long_name;
    return {
      address:      result.formatted_address,
      shortAddress: [route, city].filter(Boolean).join(', ')
                    || result.formatted_address.split(',').slice(0, 2).join(',').trim(),
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    };
  }, null); // fallback : null
};

module.exports = { autocomplete, getPlaceDetails, reverseGeocode };
