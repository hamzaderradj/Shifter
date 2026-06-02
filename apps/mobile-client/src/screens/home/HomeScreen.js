import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, ScrollView,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useMapStore, useRideStore } from '../../store';
import { ridesAPI, usersAPI } from '../../services/api';

const { height } = Dimensions.get('window');
const PARIS = { latitude: 48.8566, longitude: 2.3522 };
const MAP_HEIGHT = height * 0.42;

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { userLocation, setUserLocation } = useMapStore();
  const { setActiveRide, skippedRideIds } = useRideStore();
  const mapRef = useRef(null);
  const [favorites, setFavorites] = useState([]);

  // Vérifier course active ou non notée
  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const { data } = await ridesAPI.getActive();
        if (data.ride) {
          setActiveRide(data.ride);
          navigation.navigate('Tracking', { rideId: data.ride.id });
          return;
        }
      } catch {}
      try {
        const { data } = await ridesAPI.getUnrated();
        // Ne pas rediriger si le client a déjà skippé cette notation
        if (data.ride && !skippedRideIds.includes(data.ride.id)) {
          navigation.navigate('Rating', { rideId: data.ride.id });
        }
      } catch {}
    })();
  }, [skippedRideIds]));

  // GPS
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
  }, []);

  // Favoris
  useFocusEffect(useCallback(() => {
    usersAPI.getFavorites()
      .then(({ data }) => setFavorites(data.favorites || []))
      .catch(() => {});
  }, []));

  const centerMap = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    }
  };

  const goToBooking = (destination) => navigation.navigate('Booking', destination ? { destination } : undefined);

  const firstName = user?.firstName || null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── Carte ── */}
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
        showsCompass={false}
      />

      {/* Bouton recentrage */}
      <TouchableOpacity
        style={[styles.locBtn, { top: insets.top + 12 }]}
        onPress={centerMap}
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={20} color="#111827" />
      </TouchableOpacity>

      {/* ── Feuille du bas ── */}
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Salutation */}
        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greeting}>
              {greeting}{firstName ? `, ${firstName}` : ''} 👋
            </Text>
            <Text style={styles.subtitle}>Où veux-tu aller ?</Text>
          </View>
        </View>

        {/* Barre de recherche */}
        <TouchableOpacity style={styles.searchBar} onPress={() => goToBooking()} activeOpacity={0.9}>
          <View style={styles.searchDot} />
          <Text style={styles.searchPlaceholder}>Destination…</Text>
          <View style={styles.searchArrow}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </View>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* Actions rapides */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickCard} onPress={() => goToBooking()} activeOpacity={0.85}>
              <View style={[styles.quickIcon, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="flash" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.quickLabel}>Maintenant</Text>
              <Text style={styles.quickSub}>Course immédiate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickCard} onPress={() => goToBooking()} activeOpacity={0.85}>
              <View style={[styles.quickIcon, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="calendar" size={24} color="#6366F1" />
              </View>
              <Text style={styles.quickLabel}>Planifier</Text>
              <Text style={styles.quickSub}>Réserver à l'avance</Text>
            </TouchableOpacity>
          </View>

          {/* Favoris */}
          {favorites.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Favoris</Text>
              {favorites.map(fav => (
                <TouchableOpacity
                  key={fav.id}
                  style={styles.favItem}
                  onPress={() => goToBooking({ address: fav.address, lat: fav.lat, lng: fav.lng })}
                  activeOpacity={0.7}
                >
                  <View style={styles.favIcon}>
                    <Ionicons
                      name={fav.label.toLowerCase().includes('domicile') || fav.label.toLowerCase().includes('maison') ? 'home' :
                            fav.label.toLowerCase().includes('travail') || fav.label.toLowerCase().includes('bureau') ? 'briefcase' : 'star'}
                      size={18}
                      color="#6B7280"
                    />
                  </View>
                  <View style={styles.favText}>
                    <Text style={styles.favLabel}>{fav.label}</Text>
                    <Text style={styles.favAddr} numberOfLines={1}>{fav.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Accès rapide</Text>
              <TouchableOpacity style={styles.favItem} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
                <View style={styles.favIcon}>
                  <Ionicons name="home" size={18} color="#6B7280" />
                </View>
                <View style={styles.favText}>
                  <Text style={styles.favLabel}>Domicile</Text>
                  <Text style={styles.favAddr}>Ajouter votre adresse</Text>
                </View>
                <View style={styles.addBadge}>
                  <Text style={styles.addBadgeText}>+ Ajouter</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.favItem} onPress={() => navigation.navigate('Profile')} activeOpacity={0.7}>
                <View style={styles.favIcon}>
                  <Ionicons name="briefcase" size={18} color="#6B7280" />
                </View>
                <View style={styles.favText}>
                  <Text style={styles.favLabel}>Travail</Text>
                  <Text style={styles.favAddr}>Ajouter votre bureau</Text>
                </View>
                <View style={styles.addBadge}>
                  <Text style={styles.addBadgeText}>+ Ajouter</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  map: { position: 'absolute', top: 0, left: 0, right: 0, height: MAP_HEIGHT },

  locBtn: {
    position: 'absolute', right: 16,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },

  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    top: MAP_HEIGHT - 24,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 12,
  },
  handle: {
    width: 36, height: 4, backgroundColor: '#E5E7EB',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },

  greetingRow: { marginBottom: 16 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#9CA3AF', marginTop: 2 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#111827', borderRadius: 16,
    paddingHorizontal: 18, paddingVertical: 16, marginBottom: 20,
    shadowColor: '#111827', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  searchDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981',
  },
  searchPlaceholder: { flex: 1, fontSize: 16, color: '#9CA3AF', fontWeight: '500' },
  searchArrow: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },

  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  quickCard: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#F3F4F6',
  },
  quickIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  quickLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  quickSub: { fontSize: 12, color: '#9CA3AF' },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  favItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  favIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#F3F4F6',
  },
  favText: { flex: 1 },
  favLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  favAddr: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  addBadge: {
    backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  addBadgeText: { fontSize: 11, fontWeight: '700', color: '#3B82F6' },
});
