import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, Dimensions, Animated, Alert, Vibration,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, Circle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDriverAuthStore, useDriverStatusStore, useEarningsStore } from '../../store';
import { driverAPI, ridesAPI } from '../../services/api';
import { COLORS, RADIUS, SHADOW } from '../../utils/theme';
import {
  connectSocket, disconnectSocket,
  onRideRequest, sendRideResponse, joinRide,
} from '../../services/socket';

const { height, width } = Dimensions.get('window');
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

export default function DriverHomeScreen() {
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const locationIntervalRef = useRef(null);
  const unsubRideRef = useRef(null);

  const navigation = useNavigation();
  const { driver, token, logout, updateDriver } = useDriverAuthStore();
  const { isOnline, setOnline, rideRequest, setRideRequest } = useDriverStatusStore();
  const { today, trips, setEarnings } = useEarningsStore();

  const [location, setLocation] = useState(null);
  const [toggling, setToggling] = useState(false);
  const [acceptingRide, setAcceptingRide] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const timerRef = useRef(null);

  // ── Rafraîchir le statut chauffeur + gains + courses en attente à chaque focus ──────────
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [meRes, earningsRes, requestsRes] = await Promise.allSettled([
            driverAPI.getMe(),
            driverAPI.getEarnings('today'),
            driverAPI.getRequests(),
          ]);
          if (meRes.status === 'fulfilled' && meRes.value.data.driver) {
            const freshDriver = meRes.value.data.driver;
            updateDriver(freshDriver);
            const reallyOnline = freshDriver.availability === 'online';
            setOnline(reallyOnline);
          }
          setStatusChecked(true);
          if (earningsRes.status === 'fulfilled') {
            const d = earningsRes.value.data;
            setEarnings({
              today: d.netEarnings ?? 0,
              week: d.netEarnings ?? 0,
              trips: d.totalRides ?? 0,
            });
          }
          const driverAvailability = meRes.status === 'fulfilled'
            ? meRes.value.data.driver?.availability
            : null;

          // Vérifier s'il y a une course ACTIVE déjà acceptée → naviguer dessus
          try {
            const activeRes = await ridesAPI.getActive();
            const activeRide = activeRes.data.ride;
            if (activeRide && ['accepted', 'driver_en_route', 'arrived', 'in_progress'].includes(activeRide.status)) {
              navigation.navigate('ActiveRide', { rideId: activeRide.id });
              return;
            }
          } catch {}

          // Si en ligne et une course en attente (searching) → afficher la bannière
          if (requestsRes.status === 'fulfilled' && driverAvailability === 'online') {
            const rides = requestsRes.value.data.rides || [];
            if (rides.length > 0 && !useDriverStatusStore.getState().rideRequest) {
              const ride = rides[0];
              setRideRequest({
                id: ride.id,
                from: ride.pickupAddress,
                to: ride.dropoffAddress,
                price: ride.estimatedPrice,
                distanceKm: ride.distanceKm,
                estimatedMin: ride.durationMinutes,
                client: ride.client,
              });
            }
          }
        } catch {} finally {
          setStatusChecked(true);
        }
      })();
    }, [])
  );

  // ── Géolocalisation ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
  }, []);

  // ── Socket.io — reçoit les demandes de courses ───────────────
  useEffect(() => {
    if (!token) return;

    const sock = connectSocket(token);

    unsubRideRef.current = onRideRequest((data) => {
      // Pas de garde isOnline ici — le backend n'envoie des courses qu'aux chauffeurs en ligne
      setRideRequest({
        id: data.ride.id,
        from: data.ride.pickupAddress,
        to: data.ride.dropoffAddress,
        price: data.ride.estimatedPrice,
        distanceKm: data.ride.distanceKm,
        estimatedMin: data.ride.durationMinutes,
        client: data.ride.client,
      });
    });

    return () => {
      if (unsubRideRef.current) unsubRideRef.current();
      disconnectSocket();
    };
  }, [token]);

  // ── Envoi position GPS quand en ligne ───────────────────────
  useEffect(() => {
    if (isOnline) {
      locationIntervalRef.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { getSocket } = require('../../services/socket');
          const sock = getSocket();
          if (sock?.connected) {
            sock.emit('driver:update_location', {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              speed: loc.coords.speed || 0,
              heading: loc.coords.heading || 0,
            });
          }
          setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } catch {}
      }, 10000);
    } else {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    }
    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [isOnline]);

  // ── Pulse animation ──────────────────────────────────────────
  useEffect(() => {
    if (isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isOnline]);

  // ── Slide ride request banner ────────────────────────────────
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: rideRequest ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [rideRequest]);

  // ── Timer 30s + vibration ────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (rideRequest) {
      setTimeLeft(30);
      // Vibration pattern : 3 impulsions courtes
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);

      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            timerRef.current = null;
            // Refus automatique à 0
            sendRideResponse(rideRequest.id, false);
            setRideRequest(null);
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [rideRequest?.id]);

  // ── Toggle disponibilité via driverAPI (avec refresh token auto) ──
  const toggleOnline = async () => {
    if (toggling) return;
    setToggling(true);
    const nextOnline = !isOnline;

    try {
      // Si on passe en ligne, envoyer la position d'abord
      if (nextOnline) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude, speed, heading } = loc.coords;
          setLocation({ latitude, longitude });
          // driverAPI utilise l'intercepteur axios → refresh token automatique si expiré
          await driverAPI.updateLocation(latitude, longitude, speed || 0, heading || 0).catch(() => {});
        } catch {}
      }

      await driverAPI.setAvailability(nextOnline ? 'online' : 'offline');
      setOnline(nextOnline);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || err.message;

      if (status === 401) {
        // Token vraiment invalide (refresh échoué aussi) → déconnexion forcée
        Alert.alert(
          'Session expirée',
          'Ta session a expiré. Reconnecte-toi.',
          [{ text: 'OK', onPress: () => logout() }]
        );
      } else if (status === 403) {
        // Compte non approuvé ou profil manquant — PAS une déconnexion
        const driverStatus = err.response?.data?.status;
        Alert.alert(
          'Accès refusé',
          driverStatus === 'pending'
            ? 'Ton dossier est en cours de vérification par notre équipe.'
            : msg || 'Ton compte chauffeur n\'est pas encore validé.'
        );
      } else if (err.code === 'ECONNABORTED' || !err.response) {
        // Pas de réseau → bascule localement sans déconnexion
        setOnline(nextOnline);
      } else {
        Alert.alert('Erreur', msg || 'Impossible de changer la disponibilité.');
      }
    } finally {
      setToggling(false);
    }
  };

  const centerMap = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...location, latitudeDelta: 0.015, longitudeDelta: 0.015 }, 500
      );
    }
  };

  // ── Accepter une course ──────────────────────────────────────
  const acceptRide = async () => {
    if (!rideRequest || acceptingRide) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setAcceptingRide(true);
    const ride = rideRequest;
    try {
      await ridesAPI.accept(ride.id);
      joinRide(ride.id);
      setRideRequest(null);
      navigation.navigate('ActiveRide', { rideId: ride.id, ride });
    } catch (err) {
      const msg = err.response?.data?.message || 'Course non disponible';
      Alert.alert('Impossible', msg);
      setRideRequest(null);
    } finally {
      setAcceptingRide(false);
    }
  };

  const refuseRide = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (rideRequest) sendRideResponse(rideRequest.id, false);
    setRideRequest(null);
  };

  const firstName = driver?.firstName || 'Chauffeur';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const rideTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0],
  });

  // ── Bannière statut compte ───────────────────────────────────
  const driverStatus = driver?.status;
  const isPending  = driverStatus === 'pending';
  const isRejected = driverStatus === 'rejected';

  // Attendre la réponse serveur avant de bloquer (évite le flash sur données cachées)
  if (!statusChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isPending || isRejected) {
    return (
      <View style={styles.statusContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <Ionicons
          name={isRejected ? 'close-circle' : 'time-outline'}
          size={64}
          color={isRejected ? '#FF4B4B' : COLORS.primary}
        />
        <Text style={styles.statusTitle}>
          {isRejected ? 'Dossier refusé' : 'Dossier en vérification'}
        </Text>
        <Text style={styles.statusText}>
          {isRejected
            ? 'Ton dossier a été refusé. Contacte le support pour plus d\'informations.'
            : 'Notre équipe vérifie tes documents. Tu seras notifié par SMS une fois validé (24-48h).'}
        </Text>
        {isRejected && (
          <TouchableOpacity
            style={styles.statusBtn}
            onPress={() => logout()}
          >
            <Text style={styles.statusBtnText}>Se déconnecter</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* MAP */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: location?.latitude ?? PARIS.latitude,
          longitude: location?.longitude ?? PARIS.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        customMapStyle={darkMapStyle}
      >
        {location && (
          <>
            <Marker coordinate={location}>
              <View style={styles.driverDot}>
                <View style={styles.driverDotInner} />
              </View>
            </Marker>
            {isOnline && (
              <Circle
                center={location}
                radius={800}
                fillColor="rgba(46,204,113,0.07)"
                strokeColor="rgba(46,204,113,0.3)"
                strokeWidth={1.5}
              />
            )}
          </>
        )}
      </MapView>

      {/* Top header */}
      <View style={styles.topBar}>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.online : COLORS.offline }]} />
          <Text style={styles.statusLabel}>{isOnline ? 'En ligne' : 'Hors ligne'}</Text>
        </View>
        <View style={styles.earningsBubble}>
          <Text style={styles.earningsLabel}>Aujourd'hui</Text>
          <Text style={styles.earningsValue}>{today.toFixed(2)} €</Text>
        </View>
      </View>

      {/* Recenter */}
      <TouchableOpacity style={styles.locBtn} onPress={centerMap} activeOpacity={0.8}>
        <Ionicons name="locate" size={20} color={COLORS.text} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        {!isOnline ? (
          <>
            <Text style={styles.greeting}>{greeting}, {firstName} 👋</Text>
            <Text style={styles.sheetSub}>Tu es hors ligne. Passe en ligne pour recevoir des courses.</Text>
          </>
        ) : (
          <>
            <Text style={styles.onlineTitle}>Tu es en ligne ✅</Text>
            <Text style={styles.sheetSub}>En attente de courses dans ta zone…</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="bicycle" size={20} color={COLORS.primary} />
                <Text style={styles.statValue}>{trips}</Text>
                <Text style={styles.statLabel}>Courses</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="cash-outline" size={20} color={COLORS.accent} />
                <Text style={styles.statValue}>{today.toFixed(0)} €</Text>
                <Text style={styles.statLabel}>Gains</Text>
              </View>
              <View style={styles.statCard}>
                <Ionicons name="time-outline" size={20} color={COLORS.textSub} />
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statLabel}>Heures</Text>
              </View>
            </View>
          </>
        )}

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.toggleBtn, isOnline ? styles.toggleBtnOnline : styles.toggleBtnOffline]}
            onPress={toggleOnline}
            activeOpacity={0.85}
            disabled={toggling}
          >
            {toggling ? (
              <Text style={[styles.toggleText, { color: isOnline ? COLORS.bg : COLORS.primary }]}>
                Mise à jour…
              </Text>
            ) : (
              <>
                <Ionicons
                  name={isOnline ? 'pause-circle' : 'play-circle'}
                  size={26}
                  color={isOnline ? COLORS.bg : COLORS.primary}
                />
                <Text style={[styles.toggleText, { color: isOnline ? COLORS.bg : COLORS.primary }]}>
                  {isOnline ? 'Passer hors ligne' : 'Aller en ligne'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Ride request banner */}
      {rideRequest && (
        <Animated.View style={[styles.rideRequest, { transform: [{ translateY: rideTranslateY }] }]}>
          <View style={styles.rideHeader}>
            <View style={styles.rideTag}>
              <Ionicons name="bicycle" size={14} color={COLORS.bg} />
              <Text style={styles.rideTagText}>Nouvelle course</Text>
            </View>
            <Text style={styles.ridePrice}>{rideRequest.price} €</Text>
          </View>
          <View style={styles.rideRoute}>
            <View style={styles.rideDot} />
            <Text style={styles.rideAddr}>{rideRequest.from}</Text>
          </View>
          <View style={[styles.rideRoute, { marginTop: 4 }]}>
            <View style={[styles.rideDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.rideAddr}>{rideRequest.to}</Text>
          </View>
          <View style={styles.rideInfoRow}>
            <Text style={styles.rideDistance}>
              {rideRequest.distanceKm} km · ~{rideRequest.estimatedMin} min
            </Text>
            <View style={[styles.timerBadge, timeLeft <= 10 && styles.timerBadgeUrgent]}>
              <Text style={[styles.timerText, timeLeft <= 10 && styles.timerTextUrgent]}>
                {timeLeft}s
              </Text>
            </View>
          </View>
          <View style={styles.timerBar}>
            <View style={[
              styles.timerBarFill,
              { width: `${(timeLeft / 30) * 100}%` },
              timeLeft <= 10 && styles.timerBarFillUrgent
            ]} />
          </View>
          <View style={styles.rideBtns}>
            <TouchableOpacity style={styles.btnRefuse} onPress={refuseRide}>
              <Text style={styles.btnRefuseText}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnAccept, acceptingRide && { opacity: 0.6 }]}
              onPress={acceptRide}
              disabled={acceptingRide}
            >
              <Text style={styles.btnAcceptText}>{acceptingRide ? 'Confirmation…' : 'Accepter'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  topBar: {
    position: 'absolute', top: 56, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.card,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  earningsBubble: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'flex-end', borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.card,
  },
  earningsLabel: { fontSize: 10, color: COLORS.textSub, fontWeight: '600', textTransform: 'uppercase' },
  earningsValue: { fontSize: 18, fontWeight: '800', color: COLORS.accent },

  locBtn: {
    position: 'absolute', bottom: 260, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card,
  },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
    borderTopWidth: 1, borderColor: COLORS.border,
    ...SHADOW.card,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  onlineTitle: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginBottom: 6 },
  sheetSub: { fontSize: 14, color: COLORS.textSub, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: COLORS.bgInput, borderRadius: RADIUS.md,
    padding: 12, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '600' },

  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: RADIUS.xl, paddingVertical: 16, borderWidth: 2,
  },
  toggleBtnOffline: { backgroundColor: 'transparent', borderColor: COLORS.primary },
  toggleBtnOnline: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { fontSize: 17, fontWeight: '800' },

  driverDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(46,204,113,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  driverDotInner: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.primary, borderWidth: 2, borderColor: '#fff',
  },

  rideRequest: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xxl, borderTopRightRadius: RADIUS.xxl,
    padding: 20, paddingBottom: 36,
    borderTopWidth: 1.5, borderColor: COLORS.primary,
    ...SHADOW.green,
  },
  rideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  rideTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5,
  },
  rideTagText: { color: COLORS.bg, fontSize: 12, fontWeight: '800' },
  ridePrice: { fontSize: 28, fontWeight: '900', color: COLORS.primary },
  rideRoute: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  rideDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.accent },
  rideAddr: { fontSize: 14, color: COLORS.text, flex: 1, fontWeight: '500' },
  rideInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  rideDistance: { fontSize: 12, color: COLORS.textSub },
  timerBadge: {
    backgroundColor: COLORS.bgInput, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  timerBadgeUrgent: { backgroundColor: '#3d1a1a', borderColor: '#FF4B4B' },
  timerText: { fontSize: 13, fontWeight: '800', color: COLORS.textSub },
  timerTextUrgent: { color: '#FF4B4B' },
  timerBar: {
    height: 3, backgroundColor: COLORS.bgInput,
    borderRadius: 2, marginBottom: 14, overflow: 'hidden',
  },
  timerBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  timerBarFillUrgent: { backgroundColor: '#FF4B4B' },
  rideBtns: { flexDirection: 'row', gap: 12 },
  btnRefuse: {
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bgInput, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  btnRefuseText: { color: COLORS.textSub, fontWeight: '700', fontSize: 15 },
  btnAccept: {
    flex: 2, paddingVertical: 14, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary, alignItems: 'center',
    ...SHADOW.green,
  },
  btnAcceptText: { color: COLORS.bg, fontWeight: '800', fontSize: 15 },

  // Écran d'attente validation
  statusContainer: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  statusTitle: {
    fontSize: 24, fontWeight: '800', color: '#FFFFFF',
    marginTop: 20, marginBottom: 12, textAlign: 'center',
  },
  statusText: {
    fontSize: 15, color: '#8693a5', textAlign: 'center', lineHeight: 24,
  },
  statusBtn: {
    marginTop: 32, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: '#FF4B4B',
  },
  statusBtnText: { color: '#FF4B4B', fontWeight: '700', fontSize: 15 },
});

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0f0f1a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8693a5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f0f1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#252545' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1e1e35' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2e2e50' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0a16' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];
