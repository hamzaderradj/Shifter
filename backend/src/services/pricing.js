const config = require('../config');

/**
 * Haversine — distance à vol d'oiseau (fallback si Routes API indisponible)
 */
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Google Routes API — vraie distance routière + durée en trafic réel
 * Retourne { distanceKm, durationMinutes } ou null si erreur
 */
const getRouteFromGoogle = async (originLat, originLng, destLat, destLng) => {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin:      { location: { latLng: { latitude: parseFloat(originLat), longitude: parseFloat(originLng) } } },
        destination: { location: { latLng: { latitude: parseFloat(destLat),   longitude: parseFloat(destLng)   } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        units: 'METRIC',
      }),
    });

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const distanceKm      = route.distanceMeters / 1000;
    const durationSeconds = parseInt(route.duration?.replace('s', '') || '0');
    const durationMinutes = Math.ceil(durationSeconds / 60);

    return { distanceKm, durationMinutes };
  } catch (err) {
    console.warn('[Routes API] erreur:', err.message);
    return null;
  }
};

/**
 * Durée estimée (fallback Haversine — moto ~30 km/h en ville)
 */
const estimateDuration = (distanceKm) => Math.ceil((distanceKm / 30) * 60);

/**
 * Calcul du prix
 */
const calculatePrice = (distanceKm, durationMinutes) => {
  const { baseFare, pricePerKm, pricePerMinute, minFare } = config.pricing;
  const raw   = baseFare + (distanceKm * pricePerKm) + (durationMinutes * pricePerMinute);
  const price = Math.max(raw, minFare);
  return Math.round(price * 100) / 100;
};

const platformFee    = (price) => Math.round(price * config.pricing.platformCommission * 100) / 100;
const driverEarnings = (price) => Math.round((price - platformFee(price)) * 100) / 100;

/**
 * Estimation complète — utilise Google Routes API, fallback Haversine
 */
const estimateRide = async (pickupLat, pickupLng, dropoffLat, dropoffLng) => {
  // Essayer Google Routes API d'abord
  const google = await getRouteFromGoogle(pickupLat, pickupLng, dropoffLat, dropoffLng);

  const distanceKm      = google ? Math.round(google.distanceKm * 100) / 100
                                 : Math.round(haversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng) * 100) / 100;
  const durationMinutes = google ? google.durationMinutes
                                 : estimateDuration(distanceKm);
  const price           = calculatePrice(distanceKm, durationMinutes);

  return {
    distanceKm,
    durationMinutes,
    estimatedPrice: price,
    source: google ? 'google_routes' : 'haversine', // debug
    breakdown: {
      baseFare:     config.pricing.baseFare,
      distanceFare: Math.round(distanceKm * config.pricing.pricePerKm * 100) / 100,
      timeFare:     Math.round(durationMinutes * config.pricing.pricePerMinute * 100) / 100,
    }
  };
};

module.exports = {
  haversineDistance, estimateDuration, calculatePrice,
  estimateRide, getRouteFromGoogle, platformFee, driverEarnings
};
