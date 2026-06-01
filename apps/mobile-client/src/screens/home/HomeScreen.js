import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, ActivityIndicator
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuthStore, useMapStore, useRideStore } from '../../store';
import { ridesAPI, usersAPI } from '../../services/api';

const { height } = Dimensions.get('window');

// Centre par défaut : Paris (Île-de-France)
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { userLocation, setUserLocation } = useMapStore();
  const { setActiveRide } = useRideStore();
  const mapRef = useRef(null);
  const [locError, setLocError] = useState(false);

  // ── Vérifier course active ou course terminée non notée ──
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          // 1. Course en cours → reprendre le suivi
          const { data } = await ridesAPI.getActive();
          if (data.ride) {
            setActiveRide(data.ride);
            navigation.navigate('Tracking', { rideId: data.ride.id });
            return;
          }
        } catch {}

        try {
          // 2. Course récemment terminée non notée → aller noter
          const { data } = await ridesAPI.getUnrated();
          if (data.ride) {
            navigation.navigate('Rating', { rideId: data.ride.id });
          }
        } catch {}
      })();
    }, [])
  );

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLocError(true); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
        setLocError(true);
      }
    })();
  }, []);

  const centerMap = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        { ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500
      );
    }
  };

  const goToBooking = () => navigation.navigate('Booking');

  const firstName = user?.firstName || 'toi';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Carte */}
      {userLocation || true ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: userLocation?.latitude ?? PARIS.latitude,
            longitude: userLocation?.longitude ?? PARIS.longitude,
            latitudeDelta: userLocation ? 0.012 : 0.15,
            longitudeDelta: userLocation ? 0.012 : 0.15,
          }}
          showsUserLocation
          showsMyLocationButton={false}
        >
          <Marker coordinate={userLocation}>
            <View style={styles.dot}>
              <View style={styles.dotInner} />
            </View>
          </Marker>
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      )}

      {/* Bouton recentrage */}
      <TouchableOpacity style={styles.locBtn} onPress={centerMap} activeOpacity={0.8}>
        <Ionicons name="locate" size={22} color="#111827" />
      </TouchableOpacity>

      {/* Feuille du bas */}
      <View style={styles.sheet}>
        <Text style={styles.greeting}>{greeting}, {firstName} 👋</Text>
        <Text style={styles.subtitle}>Où veux-tu aller ?</Text>

        {/* Barre de recherche */}
        <TouchableOpacity style={styles.searchBar} onPress={goToBooking} activeOpacity={0.8}>
          <Ionicons name="search" size={18} color="#6B7280" />
          <Text style={styles.searchPlaceholder}>Destination…</Text>
          <View style={styles.laterBadge}>
            <Ionicons name="time-outline" size={14} color="#6B7280" />
            <Text style={styles.laterText}>Planifier</Text>
          </View>
        </TouchableOpacity>

        {/* Actions rapides */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickCard} onPress={goToBooking} activeOpacity={0.85}>
            <View style={styles.quickIcon}>
              <Ionicons name="bicycle" size={26} color="#3B82F6" />
            </View>
            <Text style={styles.quickLabel}>Moto-taxi</Text>
            <Text style={styles.quickSub}>Partir maintenant</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickCard} onPress={goToBooking} activeOpacity={0.85}>
            <View style={styles.quickIcon}>
              <Ionicons name="calendar" size={26} color="#6366F1" />
            </View>
            <Text style={styles.quickLabel}>Planifier</Text>
            <Text style={styles.quickSub}>Réserver à l'avance</Text>
          </TouchableOpacity>
        </View>

        {/* Raccourcis */}
        <Text style={styles.sectionTitle}>Favoris</Text>

        <TouchableOpacity style={styles.recentItem} onPress={goToBooking} activeOpacity={0.7}>
          <View style={styles.recentIcon}>
            <Ionicons name="home" size={18} color="#6B7280" />
          </View>
          <View style={styles.recentText}>
            <Text style={styles.recentLabel}>Domicile</Text>
            <Text style={styles.recentAddr}>Ajouter votre adresse</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.recentItem} onPress={goToBooking} activeOpacity={0.7}>
          <View style={styles.recentIcon}>
            <Ionicons name="briefcase" size={18} color="#6B7280" />
          </View>
          <View style={styles.recentText}>
            <Text style={styles.recentLabel}>Travail</Text>
            <Text style={styles.recentAddr}>Ajouter votre bureau</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.45 },
  mapPlaceholder: { backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' },
  locBtn: {
    position: 'absolute', top: height * 0.36, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, top: height * 0.38,
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 10,
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB', marginBottom: 16,
  },
  searchPlaceholder: { flex: 1, fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  laterBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  laterText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  quickCard: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  quickIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  quickLabel: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  quickSub: { fontSize: 12, color: '#6B7280' },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  recentIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  recentText: { flex: 1 },
  recentLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  recentAddr: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
});
