import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Switch, Alert,
  StatusBar, Modal, Vibration
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import { useAuthStore, useRideStore } from '../../store';
import { driverAPI, ridesAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

const RideRequestModal = ({ ride, visible, onAccept, onDecline, loading }) => {
  if (!ride) return null;
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.rideModal}>
          <View style={styles.modalHeader}>
            <View style={styles.pulse}>
              <Ionicons name="bicycle" size={28} color={COLORS.primary} />
            </View>
            <Text style={styles.modalTitle}>Nouvelle course !</Text>
            <Text style={styles.modalSub}>
              {ride.client?.firstName} {ride.client?.lastName}
            </Text>
          </View>

          <View style={styles.modalRoute}>
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
              <Text style={styles.routeText} numberOfLines={2}>{ride.pickupAddress}</Text>
            </View>
            <View style={styles.routeConnector} />
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
              <Text style={styles.routeText} numberOfLines={2}>{ride.dropoffAddress}</Text>
            </View>
          </View>

          <View style={styles.modalStats}>
            <View style={styles.modalStat}>
              <Text style={styles.modalStatValue}>{ride.distanceKm} km</Text>
              <Text style={styles.modalStatLabel}>Distance</Text>
            </View>
            <View style={styles.modalStat}>
              <Text style={styles.modalStatValue}>{ride.durationMinutes} min</Text>
              <Text style={styles.modalStatLabel}>Durée</Text>
            </View>
            <View style={styles.modalStat}>
              <Text style={[styles.modalStatValue, { color: COLORS.success }]}>{ride.estimatedPrice} FCFA</Text>
              <Text style={styles.modalStatLabel}>Prix</Text>
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.declineBtn} onPress={onDecline} disabled={loading}>
              <Ionicons name="close" size={24} color={COLORS.error} />
              <Text style={styles.declineBtnText}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} disabled={loading}>
              <Ionicons name="checkmark" size={24} color={COLORS.white} />
              <Text style={styles.acceptBtnText}>Accepter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const socketRef = useRef(null);
  const locationWatchRef = useRef(null);
  const { user, driver, updateDriver } = useAuthStore();
  const { isOnline, setIsOnline, currentRide, setCurrentRide, addRideRequest, rideRequests, removeRideRequest } = useRideStore();
  const [userLocation, setUserLocation] = useState(null);
  const [pendingRide, setPendingRide] = useState(null);
  const [showRideModal, setShowRideModal] = useState(false);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [todayStats, setTodayStats] = useState({ rides: 0, earnings: 0 });

  // Charger stats
  useEffect(() => {
    driverAPI.getEarnings('today').then(({ data }) => {
      setTodayStats({ rides: data.totalRides, earnings: data.netEarnings });
    }).catch(() => {});
  }, []);

  // Géolocalisation
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(pos);
      mapRef.current?.animateToRegion({
        latitude: pos.lat, longitude: pos.lng,
        latitudeDelta: 0.01, longitudeDelta: 0.01
      }, 1000);
    })();
  }, []);

  // Socket
  useEffect(() => {
    const connectSocket = async () => {
      const token = await SecureStore.getItemAsync('driver_access_token');
      if (!token) return;

      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
      });

      socket.on('connect', () => console.log('[Driver Socket] Connected'));

      // Nouvelle course disponible
      socket.on('new_ride_request', ({ ride }) => {
        if (isOnline) {
          Vibration.vibrate([0, 500, 200, 500]);
          setPendingRide(ride);
          setShowRideModal(true);
          addRideRequest(ride);
        }
      });

      socket.on('ride_status_changed', ({ rideId, status }) => {
        if (currentRide?.id === rideId) {
          setCurrentRide({ ...currentRide, status });
        }
      });

      socketRef.current = socket;
    };

    connectSocket();
    return () => socketRef.current?.disconnect();
  }, [isOnline]);

  // Tracking GPS quand online
  useEffect(() => {
    if (isOnline) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
    return () => stopLocationTracking();
  }, [isOnline]);

  const startLocationTracking = async () => {
    const { status } = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
    locationWatchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 20, timeInterval: 5000 },
      async (loc) => {
        const { latitude: lat, longitude: lng, speed, heading } = loc.coords;
        setUserLocation({ lat, lng });

        // Envoyer position au serveur
        try {
          await driverAPI.updateLocation(lat, lng, speed, heading);
          socketRef.current?.emit('driver:update_location', { lat, lng, speed, heading });
        } catch {}
      }
    );
  };

  const stopLocationTracking = () => {
    locationWatchRef.current?.remove();
    locationWatchRef.current = null;
  };

  const toggleOnline = async (value) => {
    try {
      await driverAPI.setAvailability(value ? 'online' : 'offline');
      setIsOnline(value);
      updateDriver({ availability: value ? 'online' : 'offline' });
    } catch {
      Alert.alert('Erreur', 'Impossible de changer la disponibilité.');
    }
  };

  const handleAcceptRide = async () => {
    if (!pendingRide) return;
    setAcceptLoading(true);
    try {
      const { data } = await ridesAPI.accept(pendingRide.id);
      setCurrentRide(data.ride);
      setShowRideModal(false);
      removeRideRequest(pendingRide.id);
      navigation.navigate('ActiveRide', { rideId: data.ride.id });
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.message || 'Course non disponible');
      setShowRideModal(false);
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleDeclineRide = () => {
    setShowRideModal(false);
    removeRideRequest(pendingRide?.id);
    socketRef.current?.emit('driver:ride_response', { rideId: pendingRide?.id, accepted: false });
    setPendingRide(null);
  };

  const isApproved = driver?.status === 'approved';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        initialRegion={{ latitude: 14.7167, longitude: -17.4677, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <View>
          <Text style={styles.greeting}>Bonjour{user?.firstName ? `, ${user.firstName}` : ''} 👋</Text>
          <View style={[styles.statusBadge, { backgroundColor: isOnline ? COLORS.success + '20' : COLORS.gray[100] }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.gray[400] }]} />
            <Text style={[styles.statusText, { color: isOnline ? COLORS.success : COLORS.gray[500] }]}>
              {isOnline ? 'En ligne' : 'Hors ligne'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person" size={22} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={[styles.statsCard, { top: insets.top + 90 }]}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{todayStats.rides}</Text>
          <Text style={styles.statLabel}>Courses</Text>
        </View>
        <View style={styles.statDiv} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{todayStats.earnings}</Text>
          <Text style={styles.statLabel}>FCFA gagnés</Text>
        </View>
        <View style={styles.statDiv} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.accent }]}>
            {parseFloat(driver?.rating || 0).toFixed(1)} ⭐
          </Text>
          <Text style={styles.statLabel}>Note</Text>
        </View>
      </View>

      {/* Panel bas */}
      <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {!isApproved ? (
          <View style={styles.pendingCard}>
            <Ionicons name="hourglass" size={32} color={COLORS.warning} />
            <View>
              <Text style={styles.pendingTitle}>Compte en attente de validation</Text>
              <Text style={styles.pendingSub}>
                {driver?.status === 'pending' ? 'Vos documents sont en cours de vérification.' : driver?.rejectionReason || 'Compte non approuvé.'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleLabel}>Mode disponible</Text>
                <Text style={styles.toggleSub}>
                  {isOnline ? 'Vous recevez des courses' : 'Activez pour recevoir des courses'}
                </Text>
              </View>
              <Switch
                value={isOnline}
                onValueChange={toggleOnline}
                trackColor={{ false: COLORS.gray[300], true: COLORS.primary }}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.gray[300]}
              />
            </View>

            {!isOnline && currentRide && (
              <TouchableOpacity
                style={styles.resumeBtn}
                onPress={() => navigation.navigate('ActiveRide', { rideId: currentRide.id })}
              >
                <Ionicons name="bicycle" size={20} color={COLORS.white} />
                <Text style={styles.resumeBtnText}>Reprendre la course en cours</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Modal course */}
      <RideRequestModal
        ride={pendingRide}
        visible={showRideModal}
        onAccept={handleAcceptRide}
        onDecline={handleDeclineRide}
        loading={acceptLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, backgroundColor: 'rgba(255,255,255,0.95)',
    ...SHADOWS.small,
  },
  greeting: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: SIZES.small, fontWeight: '700' },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center',
  },
  statsCard: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    flexDirection: 'row', padding: SPACING.md,
    ...SHADOWS.medium,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, backgroundColor: COLORS.gray[200] },
  statValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  statLabel: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.md, ...SHADOWS.large,
  },
  pendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.warning + '15', borderRadius: RADIUS.md, padding: SPACING.md,
  },
  pendingTitle: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
  pendingSub: { fontSize: SIZES.small, color: COLORS.gray[600], marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },
  toggleSub: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  resumeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    height: 48, marginTop: SPACING.md,
  },
  resumeBtnText: { color: COLORS.white, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  rideModal: { backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl },
  modalHeader: { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  pulse: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 24, fontWeight: '800', color: COLORS.secondary },
  modalSub: { color: COLORS.gray[500] },
  modalRoute: { gap: 4, marginBottom: SPACING.lg },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeConnector: { width: 2, height: 16, backgroundColor: COLORS.gray[300], marginLeft: 5 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeText: { flex: 1, color: COLORS.gray[700], fontSize: SIZES.small },
  modalStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.gray[50], borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg },
  modalStat: { alignItems: 'center' },
  modalStatValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  modalStatLabel: { fontSize: SIZES.small, color: COLORS.gray[500] },
  modalActions: { flexDirection: 'row', gap: SPACING.md },
  declineBtn: {
    flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.error,
  },
  declineBtnText: { color: COLORS.error, fontWeight: '700', fontSize: SIZES.large },
  acceptBtn: {
    flex: 2, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary,
  },
  acceptBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.large },
});
