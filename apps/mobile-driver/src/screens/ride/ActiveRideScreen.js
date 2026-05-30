import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Linking, StatusBar, ActivityIndicator, Modal
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ridesAPI, driverAPI } from '../../services/api';
import { useDriverStatusStore, useEarningsStore } from '../../store';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../utils/theme';

// ── Haversine distance (km) ────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Statuts et actions ────────────────────────────────────────
const STEPS = {
  accepted: {
    label: 'Je pars chercher le client',
    sublabel: 'Confirmez que vous êtes en route',
    nextStatus: 'driver_en_route',
    icon: 'bicycle',
    color: COLORS.primary,
    mapTarget: 'pickup',
  },
  driver_en_route: {
    label: 'Je suis arrivé',
    sublabel: 'Prévenez le client de votre arrivée',
    nextStatus: 'arrived',
    icon: 'location',
    color: '#F39C12',
    mapTarget: 'pickup',
  },
  arrived: {
    label: 'Démarrer la course',
    sublabel: "Le client est monté, c'est parti !",
    nextStatus: 'in_progress',
    icon: 'play-circle',
    color: COLORS.primary,
    mapTarget: 'dropoff',
    requiresProximity: true, // géofencing : 1 km autour de pickup
  },
  in_progress: {
    label: 'Terminer la course',
    sublabel: "Confirmez l'arrivée à destination",
    nextStatus: 'completed',
    icon: 'checkmark-circle',
    color: COLORS.primary,
    mapTarget: 'dropoff',
  },
};

const STATUS_LABELS = {
  accepted:        '🛵 En route vers le client',
  driver_en_route: '🛵 En route vers le client',
  arrived:         '📍 Arrivé au point de départ',
  in_progress:     '🏁 Course en cours',
};

export default function ActiveRideScreen({ navigation, route }) {
  const { rideId, ride: initialRide } = route.params;
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const { setCurrentRide, clearRide } = useDriverStatusStore();
  const { setEarnings } = useEarningsStore();

  const [ride, setRide] = useState(initialRide || null);
  const [loading, setLoading] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const completedRideRef = useRef(null);

  // Charger les données fraîches de la course
  useEffect(() => {
    ridesAPI.getById(rideId).then(({ data }) => {
      setRide(data.ride);
      setCurrentRide(data.ride);
    }).catch(() => {});
  }, [rideId]);

  // GPS en temps réel (pour géofencing)
  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 20 },
        (loc) => setDriverLocation(loc.coords)
      );
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  // Centrer la carte selon le statut
  useEffect(() => {
    if (!ride || !mapRef.current) return;
    const step = STEPS[ride.status];
    if (!step) return;
    const coord = step.mapTarget === 'pickup'
      ? { latitude: parseFloat(ride.pickupLat), longitude: parseFloat(ride.pickupLng) }
      : { latitude: parseFloat(ride.dropoffLat), longitude: parseFloat(ride.dropoffLng) };
    mapRef.current.animateToRegion({ ...coord, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 600);
  }, [ride?.status]);

  const handleAction = async () => {
    const step = STEPS[ride?.status];
    if (!step) return;

    // Géofencing : vérifier proximité avant de démarrer la course
    if (step.requiresProximity) {
      if (!driverLocation) {
        Alert.alert('GPS indisponible', 'Impossible de vérifier votre position. Réessayez.');
        return;
      }
      const dist = haversine(
        driverLocation.latitude, driverLocation.longitude,
        parseFloat(ride.pickupLat), parseFloat(ride.pickupLng)
      );
      if (dist > 1) {
        Alert.alert(
          '🛵 Trop loin du client',
          `Vous êtes à ${dist.toFixed(1)} km du point de prise en charge. Approchez-vous à moins de 1 km pour démarrer la course.`
        );
        return;
      }
    }

    if (step.nextStatus === 'completed') {
      // Si paiement cash → confirmation de réception avant de terminer
      if (ride.paymentMethod === 'cash') {
        const amount = parseFloat(ride.finalPrice || ride.estimatedPrice || 0);
        const net = (amount * 0.8).toFixed(2);
        Alert.alert(
          '💵 Confirmation de paiement',
          `Le client doit vous régler :\n\n💰 ${amount.toFixed(2)} € en espèces\n\nVotre part : ${net} €\n\nConfirmez que vous avez bien reçu le cash.`,
          [
            { text: 'Pas encore', style: 'cancel' },
            { text: '✅ Cash reçu, terminer', onPress: () => updateStatus('completed') },
          ]
        );
      } else {
        Alert.alert('Terminer la course ?', "Confirmez l'arrivée à destination.", [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: () => updateStatus('completed') },
        ]);
      }
    } else {
      updateStatus(step.nextStatus);
    }
  };

  const updateStatus = async (status) => {
    setLoading(true);
    try {
      await ridesAPI.updateStatus(rideId, status);
      const updated = { ...ride, status };
      setRide(updated);
      setCurrentRide(updated);

      if (status === 'completed') {
        clearRide();

        // Mettre à jour le store des gains
        try {
          const { data } = await driverAPI.getEarnings('today');
          setEarnings({
            today: data.netEarnings ?? 0,
            week: data.netEarnings ?? 0,
            trips: data.totalRides ?? 0,
          });
        } catch {}

        // Sauvegarder la course pour le modal de notation
        completedRideRef.current = { ...ride, status: 'completed' };
        setShowRatingModal(true);
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const callClient = () => {
    const phone = ride?.client?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
    else Alert.alert('Numéro indisponible');
  };

  const openGPS = () => {
    if (!ride) return;
    const step = STEPS[ride.status];
    const isPickup = step?.mapTarget !== 'dropoff';
    const lat = isPickup ? ride.pickupLat : ride.dropoffLat;
    const lng = isPickup ? ride.pickupLng : ride.dropoffLng;
    Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`);
  };

  const step = STEPS[ride?.status];
  const isPickupPhase = step?.mapTarget !== 'dropoff';
  const pickupCoord = ride ? { latitude: parseFloat(ride.pickupLat), longitude: parseFloat(ride.pickupLng) } : null;
  const dropoffCoord = ride ? { latitude: parseFloat(ride.dropoffLat), longitude: parseFloat(ride.dropoffLng) } : null;

  // Vérifier si le bouton "Démarrer" est bloqué par la distance
  let tooFar = false;
  if (step?.requiresProximity && driverLocation && ride) {
    const dist = haversine(
      driverLocation.latitude, driverLocation.longitude,
      parseFloat(ride.pickupLat), parseFloat(ride.pickupLng)
    );
    tooFar = dist > 1;
  }

  const submitRating = async (score) => {
    if (!completedRideRef.current || ratingSubmitting) return;
    setRatingSubmitting(true);
    try {
      await ridesAPI.rate(completedRideRef.current.id, { score });
    } catch {} finally {
      setRatingSubmitting(false);
      setShowRatingModal(false);
      navigation.replace('MainTabs');
    }
  };

  const skipRating = () => {
    setShowRatingModal(false);
    navigation.replace('MainTabs');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Modal notation client ── */}
      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingSheet}>
            <View style={styles.ratingHandle} />
            <Text style={styles.ratingEmoji}>🏁</Text>
            <Text style={styles.ratingTitle}>Course terminée !</Text>
            <Text style={styles.ratingSubtitle}>
              Comment s'est passé le trajet avec votre client ?
            </Text>

            {/* Étoiles */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(i => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setRatingScore(i)}
                  activeOpacity={0.7}
                  style={styles.starBtn}
                >
                  <Text style={[styles.starIcon, i <= ratingScore && styles.starIconActive]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.ratingHint}>
              {ratingScore === 0 ? 'Appuyez sur une étoile' :
               ratingScore === 5 ? 'Excellent client !' :
               ratingScore >= 4 ? 'Très bon client' :
               ratingScore >= 3 ? 'Client correct' :
               ratingScore >= 2 ? 'Quelques soucis' : 'Client difficile'}
            </Text>

            <TouchableOpacity
              style={[styles.ratingSubmitBtn, ratingScore === 0 && styles.ratingSubmitBtnDisabled]}
              onPress={() => submitRating(ratingScore)}
              disabled={ratingScore === 0 || ratingSubmitting}
            >
              {ratingSubmitting
                ? <ActivityIndicator color={COLORS.bg} />
                : <Text style={styles.ratingSubmitText}>Envoyer la note</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={skipRating} style={styles.ratingSkipBtn}>
              <Text style={styles.ratingSkipText}>Passer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Carte ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={pickupCoord
          ? { ...pickupCoord, latitudeDelta: 0.015, longitudeDelta: 0.015 }
          : { latitude: 48.8566, longitude: 2.3522, latitudeDelta: 0.1, longitudeDelta: 0.1 }
        }
        customMapStyle={darkMapStyle}
      >
        {pickupCoord && (
          <Marker coordinate={pickupCoord} title="Client">
            <View style={styles.markerPickup}>
              <Ionicons name="person" size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {dropoffCoord && (
          <Marker coordinate={dropoffCoord} title="Destination">
            <View style={styles.markerDropoff}>
              <Ionicons name="flag" size={14} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* ── Bouton GPS ── */}
      <TouchableOpacity
        style={[styles.gpsBtn, { top: insets.top + 12 }]}
        onPress={openGPS}
        activeOpacity={0.85}
      >
        <Ionicons name="navigate" size={20} color={COLORS.primary} />
        <Text style={styles.gpsBtnText}>Ouvrir GPS</Text>
      </TouchableOpacity>

      {/* ── Panel bas ── */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>

        {/* Statut */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{STATUS_LABELS[ride?.status] || 'Chargement…'}</Text>
        </View>

        {/* Adresse cible */}
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: isPickupPhase ? '#F39C12' : COLORS.primary }]} />
          <View style={styles.addressInfo}>
            <Text style={styles.addressLabel}>{isPickupPhase ? 'Prise en charge' : 'Destination'}</Text>
            <Text style={styles.addressText} numberOfLines={2}>
              {isPickupPhase ? ride?.pickupAddress : ride?.dropoffAddress}
            </Text>
          </View>
        </View>

        {/* Client */}
        <View style={styles.clientRow}>
          <View style={styles.clientAvatar}>
            <Ionicons name="person" size={24} color={COLORS.textMuted} />
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>
              {ride?.client?.firstName} {ride?.client?.lastName}
            </Text>
            <Text style={styles.clientMeta}>
              {ride?.distanceKm ? `${parseFloat(ride.distanceKm).toFixed(1)} km` : '—'} · {parseFloat(ride?.estimatedPrice || 0).toFixed(2)} €
            </Text>
            <View style={styles.paymentBadge}>
              <Ionicons
                name={ride?.paymentMethod === 'cash' ? 'cash-outline' : 'phone-portrait-outline'}
                size={12}
                color={ride?.paymentMethod === 'cash' ? '#10B981' : COLORS.primary}
              />
              <Text style={[styles.paymentBadgeText, { color: ride?.paymentMethod === 'cash' ? '#10B981' : COLORS.primary }]}>
                {ride?.paymentMethod === 'cash' ? 'Espèces' : 'Mobile Money'}
              </Text>
            </View>
          </View>
          <TouchableOpacity style={styles.callBtn} onPress={callClient} activeOpacity={0.8}>
            <Ionicons name="call" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Alerte trop loin */}
        {tooFar && (
          <View style={styles.geoAlert}>
            <Ionicons name="location-outline" size={16} color="#F39C12" />
            <Text style={styles.geoAlertText}>Approchez-vous du client (&lt;1 km) pour démarrer</Text>
          </View>
        )}

        {/* Bouton action */}
        {step && (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: tooFar ? COLORS.bgInput : step.color },
              (loading || tooFar) && styles.actionBtnDisabled,
            ]}
            onPress={handleAction}
            disabled={loading || tooFar}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={COLORS.bg} />
              : <>
                  <Ionicons name={step.icon} size={24} color={tooFar ? COLORS.textSub : COLORS.bg} />
                  <View>
                    <Text style={[styles.actionBtnText, tooFar && { color: COLORS.textSub }]}>{step.label}</Text>
                    <Text style={[styles.actionBtnSub, tooFar && { color: COLORS.textMuted }]}>{step.sublabel}</Text>
                  </View>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  gpsBtn: {
    position: 'absolute', left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.bgCard, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
  },
  gpsBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  markerPickup: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#F39C12', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  markerDropoff: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },

  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.md, gap: SPACING.md,
    borderTopWidth: 1, borderColor: COLORS.border,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(46,204,113,0.12)',
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.3)',
  },
  statusText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  addressRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  addressDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  addressInfo: { flex: 1 },
  addressLabel: {
    fontSize: 10, color: COLORS.textMuted, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  addressText: { fontSize: 14, color: COLORS.text, fontWeight: '600', marginTop: 2 },

  clientRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.md, padding: SPACING.md,
  },
  clientAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.bgInput, alignItems: 'center', justifyContent: 'center',
  },
  clientInfo: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  clientMeta: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  paymentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  paymentBadgeText: { fontSize: 11, fontWeight: '700' },

  // Modal notation
  ratingOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  ratingSheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    padding: 28, paddingBottom: 48, alignItems: 'center',
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  ratingHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, marginBottom: 20,
  },
  ratingEmoji: { fontSize: 48, marginBottom: 8 },
  ratingTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  ratingSubtitle: { fontSize: 14, color: COLORS.textSub, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  starBtn: { padding: 4 },
  starIcon: { fontSize: 44, color: COLORS.border },
  starIconActive: { color: '#F4C542' },
  ratingHint: { fontSize: 13, color: COLORS.textSub, marginBottom: 28, height: 20 },
  ratingSubmitBtn: {
    width: '100%', paddingVertical: 16, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary, alignItems: 'center', marginBottom: 12,
    ...SHADOW.green,
  },
  ratingSubmitBtnDisabled: { opacity: 0.4 },
  ratingSubmitText: { color: COLORS.bg, fontWeight: '800', fontSize: 16 },
  ratingSkipBtn: { paddingVertical: 8 },
  ratingSkipText: { color: COLORS.textSub, fontSize: 14, fontWeight: '600' },
  callBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(46,204,113,0.12)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.3)',
  },

  geoAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(243,156,18,0.1)', borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(243,156,18,0.3)',
  },
  geoAlertText: { color: '#F39C12', fontSize: 13, fontWeight: '600', flex: 1 },

  actionBtn: {
    height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.md, borderRadius: RADIUS.lg,
    ...SHADOW.green,
  },
  actionBtnDisabled: { opacity: 0.7 },
  actionBtnText: { color: COLORS.bg, fontSize: 17, fontWeight: '800' },
  actionBtnSub: { color: COLORS.bg, fontSize: 11, opacity: 0.7 },
});

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8693a5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#252545' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e1e35' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a16' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
