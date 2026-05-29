const config = require('../config');

/**
 * Calcule la distance entre deux coordonnées GPS (formule Haversine)
 * @returns distance en kilomètres
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
 * Estimation du temps de trajet (simple, basé sur vitesse moto ~30 km/h en ville)
 */
const estimateDuration = (distanceKm) => Math.ceil((distanceKm / 30) * 60);

/**
 * Calcule le prix estimé d'une course
 */
const calculatePrice = (distanceKm, durationMinutes) => {
  const { baseFare, pricePerKm, pricePerMinute, minFare } = config.pricing;
  const raw = baseFare + (distanceKm * pricePerKm) + (durationMinutes * pricePerMinute);
  const price = Math.max(raw, minFare);
  return Math.round(price * 100) / 100; // arrondi à 2 décimales (euros)
};

/**
 * Calcule la commission plateforme
 */
const platformFee = (price) => Math.round(price * config.pricing.platformCommission);

/**
 * Calcule les gains chauffeur
 */
const driverEarnings = (price) => price - platformFee(price);

/**
 * Estimation complète pour l'affichage client
 */
const estimateRide = (pickupLat, pickupLng, dropoffLat, dropoffLng) => {
  const distanceKm = haversineDistance(pickupLat, pickupLng, dropoffLat, dropoffLng);
  const durationMinutes = estimateDuration(distanceKm);
  const price = calculatePrice(distanceKm, durationMinutes);

  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes,
    estimatedPrice: price,
    breakdown: {
      baseFare: config.pricing.baseFare,
      distanceFare: Math.round(distanceKm * config.pricing.pricePerKm),
      timeFare: Math.round(durationMinutes * config.pricing.pricePerMinute),
    }
  };
};

module.exports = { haversineDistance, estimateDuration, calculatePrice, estimateRide, platformFee, driverEarnings };
