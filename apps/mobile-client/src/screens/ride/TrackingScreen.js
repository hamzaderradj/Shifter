import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, Alert,
  Animated, StatusBar
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRideStore } from '../../store';
import { ridesAPI } from '../../services/api';
import { initSocket, getSocket, joinRide, subscribeToDriver, unsubscribeFromDriver } from '../../services/socket';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const STATUS_CONFIG = {
  searching:        { icon: 'search', label: 'Recherche d\'un chauffeur...', color: COLORS.warning },
  accepted:         { icon: 'checkmark-circle', label: 'Chauffeur accepté !', color: COLORS.success },
  driver_en_route:  { icon: 'bicycle', label: 'Chauffeur en route...', color: COLORS.primary },
  arrived:          { icon: 'location', label: 'Votre chauffeur est arrivé !', color: COLORS.success },
  in_progress:      { icon: 'navigate', label: 'Course en cours', color: COLORS.primary },
  completed:        { icon: 'checkmark-done-circle', label: 'Course terminée !', color: COLORS.success },
  cancelled:        { icon: 'close-circle', label: 'Course annulée', color: COLORS.error },
};

export default function TrackingScreen({ navigation, route }) {
  const { rideId } = route.params;
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { activeRide, setActiveRide, rideStatus, updateRideStatus, driverLocation, setDriverLocation, clearRide } = useRideStore();
  const [ride, setRide] = useState(activeRide);

  // Animation de pulsation pour "recherche"
  useEffect(() => {
    if (rideStatus === 'searching') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [rideStatus]);

  // Ref pour accéder aux valeurs courantes dans les callbacks socket sans re-créer les listeners
  const rideRef = useRef(ride);
  useEffect(() => { rideRef.current = ride; }, [ride]);

  // Charger la course + attacher les listeners socket (une seule fois)
  useEffect(() => {
    let socket = null;

    const setup = async () => {
      // Charger la course depuis l'API
      try {
        const { data } = await ridesAPI.getById(rideId);
        setRide(data.ride);
        setActiveRide(data.ride);
        updateRideStatus(data.ride.status);
        rideRef.current = data.ride;
      } catch {}

      // S'assurer que le socket est connecté
      socket = getSocket() || await initSocket();
      if (!socket) return;

      // Rejoindre la room de la course
      joinRide(rideId);

      // Abonnement au chauffeur si déjà assigné
      if (rideRef.current?.driver) {
        subscribeToDriver(rideRef.current.driver.id);
      }

      // ── Listeners socket ─────────────────────────────────
      socket.on('ride_status_changed', ({ rideId: id, status }) => {
        if (id !== rideId) return;
        updateRideStatus(status);
        if (status === 'completed') {
          navigation.replace('Rating', { rideId });
        }
        if (status === 'cancelled') {
          Alert.alert('Course annulée', 'La course a été annulée.', [
            { text: 'OK', onPress: () => { clearRide(); navigation.navigate('Home'); } }
          ]);
        }
      });

      socket.on('driver:location_updated', ({ driverId, lat, lng }) => {
        if (rideRef.current?.driver?.id !== driverId) return;
        setDriverLocation({ lat, lng });
        mapRef.current?.animateToRegion({
          latitude: lat, longitude: lng,
          latitudeDelta: 0.01, longitudeDelta: 0.01
        }, 500);
      });

      socket.on('ride_accepted', ({ ride: updatedRide }) => {
        if (updatedRide.id !== rideId) return;
        setRide(updatedRide);
        setActiveRide(updatedRide);
        updateRideStatus('accepted');
        subscribeToDriver(updatedRide.driver.id);
      });
    };

    setup();

    return () => {
      // Cleanup : retirer les listeners spécifiques à cet écran
      const s = getSocket();
      if (s) {
        s.off('ride_status_changed');
        s.off('driver:location_updated');
        s.off('ride_accepted');
      }
    };
  }, [rideId]); // dépend uniquement de rideId — stable pendant toute la vie de l'écran

  const handleCancel = () => {
    Alert.alert('Annuler la course', 'Êtes-vous sûr ?', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui, annuler', style: 'destructive',
        onPress: async () => {
          try {
            await ridesAPI.updateStatus(rideId, 'cancelled', 'Client a annulé');
            clearRide();
            navigation.navigate('Home');
          } catch {
            Alert.alert('Erreur', 'Impossible d\'annuler.');
          }
        }
      }
    ]);
  };

  const handleSOS = async () => {
    Alert.alert('🆘 SOS', 'Envoyer une alerte d\'urgence ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Envoyer SOS', style: 'destructive',
        onPress: async () => {
          await ridesAPI.sos(rideId).catch(() => {});
          Alert.alert('SOS envoyé', 'Notre équipe a été alertée.');
        }
      }
    ]);
  };

  const callDriver = () => {
    const phone = ride?.driver?.user?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const status = rideStatus || ride?.status || 'searching';
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.searching;
  const driver = ride?.driver;

  const pickupCoord = ride ? { latitude: parseFloat(ride.pickupLat), longitude: parseFloat(ride.pickupLng) } : null;
  const dropoffCoord = ride ? { latitude: parseFloat(ride.dropoffLat), longitude: parseFloat(ride.dropoffLng) } : null;
  const driverCoord = driverLocation ? { latitude: driverLocation.lat, longitude: driverLocation.lng } : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Carte */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
      >
        {pickupCoord && (
          <Marker coordinate={pickupCoord} title="Départ">
            <View style={styles.pickupMarker}>
              <Ionicons name="ellipse" size={16} color={COLORS.success} />
            </View>
          </Marker>
        )}
        {dropoffCoord && (
          <Marker coordinate={dropoffCoord} title="Arrivée">
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={28} color={COLORS.error} />
            </View>
          </Marker>
        )}
        {driverCoord && (
          <Marker coordinate={driverCoord} title="Chauffeur">
            <View style={styles.driverMarker}>
              <Ionicons name="bicycle" size={20} color={COLORS.secondary} />
            </View>
          </Marker>
        )}
        {pickupCoord && dropoffCoord && (
          <Polyline
            coordinates={[pickupCoord, dropoffCoord]}
            strokeColor={COLORS.primary}
            strokeWidth={3}
            lineDashPattern={[10, 5]}
          />
        )}
      </MapView>

      {/* Bouton retour */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + SPACING.sm }]} onPress={() => navigation.navigate('Home')}>
        <Ionicons name="arrow-back" size={22} color={COLORS.secondary} />
      </TouchableOpacity>

      {/* Panel info */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {/* Statut */}
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
          <Ionicons name={statusConfig.icon} size={20} color={statusConfig.color} />
          <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          {status === 'searching' && (
            <Animated.View style={[styles.pulse, { transform: [{ scale: pulseAnim }] }]} />
          )}
        </View>

        {/* Info chauffeur (si assigné) */}
        {driver && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              <Ionicons name="person" size={28} color={COLORS.gray[400]} />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>
                {driver.user?.firstName} {driver.user?.lastName}
              </Text>
              <View style={styles.driverMeta}>
                <Ionicons name="star" size={14} color={COLORS.accent} />
                <Text style={styles.driverRating}>{parseFloat(driver.rating).toFixed(1)}</Text>
                <Text style={styles.driverVehicle}>
                  · {driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel}
                </Text>
              </View>
              <Text style={styles.driverPlate}>{driver.vehiclePlate}</Text>
            </View>

            <View style={styles.driverActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={callDriver}>
                <Ionicons name="call" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Prix estimé */}
        {ride?.estimatedPrice && (
          <View style={styles.priceRow}>
            <Ionicons name="cash" size={18} color={COLORS.gray[600]} />
            <Text style={styles.priceText}>Prix estimé: <Text style={styles.priceValue}>{ride.estimatedPrice} FCFA</Text></Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {['searching', 'accepted', 'driver_en_route'].includes(status) && (
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Ionicons name="close" size={18} color={COLORS.error} />
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.sosBtn} onPress={handleSOS}>
            <Text style={styles.sosBtnText}>🆘 SOS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: 'absolute', left: SPACING.md,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.medium,
  },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.md, gap: SPACING.md,
    ...SHADOWS.large,
  },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: RADIUS.md, position: 'relative',
  },
  statusText: { fontWeight: '700', fontSize: SIZES.medium, flex: 1 },
  pulse: {
    position: 'absolute', right: SPACING.md,
    width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.warning,
  },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.gray[50], borderRadius: RADIUS.md, padding: SPACING.md,
  },
  driverAvatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.gray[200], alignItems: 'center', justifyContent: 'center',
  },
  driverInfo: { flex: 1 },
  driverName: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  driverRating: { fontWeight: '600', color: COLORS.secondary },
  driverVehicle: { color: COLORS.gray[500], fontSize: SIZES.small },
  driverPlate: { color: COLORS.gray[600], fontSize: SIZES.small, marginTop: 2 },
  driverActions: { gap: SPACING.sm },
  actionBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  priceText: { color: COLORS.gray[600], fontSize: SIZES.medium },
  priceValue: { fontWeight: '700', color: COLORS.secondary },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  cancelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, height: 48, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  cancelBtnText: { color: COLORS.error, fontWeight: '600' },
  sosBtn: {
    height: 48, paddingHorizontal: SPACING.lg, borderRadius: RADIUS.md,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center',
  },
  sosBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.medium },
  pickupMarker: { padding: 4, backgroundColor: COLORS.white, borderRadius: 12, ...SHADOWS.small },
  dropoffMarker: {},
  driverMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white, ...SHADOWS.medium,
  },
});
