/**
 * Service de géocodage - utilise Nominatim (OpenStreetMap) - GRATUIT & sans limite
 * Documentation: https://nominatim.org/release-docs/develop/api/Overview/
 */

const BASE_URL = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  'User-Agent': 'TaxaMoto/1.0 (contact@taxamoto.com)',
  'Accept-Language': 'fr'
};

/**
 * Geocodage: adresse → coordonnées GPS
 */
const geocode = async (address, countryCode = 'sn') => {
  const params = new URLSearchParams({
    q: address,
    format: 'json',
    limit: 5,
    countrycodes: countryCode,
    addressdetails: 1
  });

  const response = await fetch(`${BASE_URL}/search?${params}`, { headers: HEADERS });
  if (!response.ok) throw new Error('Geocoding failed');

  const results = await response.json();
  return results.map(r => ({
    address: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    type: r.type,
    importance: r.importance
  }));
};

/**
 * Géocodage inverse: coordonnées → adresse
 */
const reverseGeocode = async (lat, lng) => {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: 'json',
    addressdetails: 1
  });

  const response = await fetch(`${BASE_URL}/reverse?${params}`, { headers: HEADERS });
  if (!response.ok) throw new Error('Reverse geocoding failed');

  const result = await response.json();
  return {
    address: result.display_name,
    shortAddress: [
      result.address?.road,
      result.address?.suburb,
      result.address?.city || result.address?.town || result.address?.village
    ].filter(Boolean).join(', '),
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    details: result.address
  };
};

/**
 * Autocomplete pour la recherche d'adresse
 */
const autocomplete = async (query, lat, lng, countryCode = 'sn') => {
  if (query.length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: 8,
    countrycodes: countryCode,
    viewbox: lng - 0.5 + ',' + (lat - 0.5) + ',' + (lng + 0.5) + ',' + (lat + 0.5),
    bounded: 1,
    addressdetails: 1
  });

  try {
    const response = await fetch(`${BASE_URL}/search?${params}`, { headers: HEADERS });
    if (!response.ok) return [];

    const results = await response.json();
    return results.map(r => ({
      placeId: r.place_id,
      address: r.display_name,
      shortName: r.name || r.display_name.split(',')[0],
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon)
    }));
  } catch {
    return [];
  }
};

module.exports = { geocode, reverseGeocode, autocomplete };
