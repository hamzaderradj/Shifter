import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  FlatList, Keyboard, StatusBar, Alert
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { debounce } from 'lodash';

import { useAuthStore, useMapStore, useRideStore } from '../../store';
import { ridesAPI } from '../../services/api';
import { COLORS, SPACING, RADIUS, SHADOWS, SIZES } from '../../utils/theme';
import { getSocket, initSocket } from '../../services/socket';

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const { user } = useAuthStore();
  const { userLocation, setUserLocation, pickup, setPickup, dropoff, setDropoff, searchResults, setSearchResults } = useMapStore();
  const { activeRide, setActiveRide } = useRideStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);

  // ── Géolocalisation initiale ───────────────────────────────
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'TaxaMoto nécessite votre localisation.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const pos = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLocation(pos);
      setPickup({ lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Ma position' });

      // Centrer la carte
      mapRef.current?.animateToRegion({
        latitude: pos.lat, longitude: pos.lng,
        latitudeDelta: 0.01, longitudeDelta: 0.01
      }, 1000);

      // Charger adresse actuelle
      try {
        const { data } = await ridesAPI.reverseGeocode(pos.lat, pos.lng);
        setPickup({ ...pos, address: data.result.shortAddress || 'Ma position' });
      } catch {}

      // Charger chauffeurs proches
      loadNearbyDrivers(pos.lat, pos.lng);
    })();
  }, []);

  // ── Course active → aller au suivi ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await ridesAPI.getActive();
        if (data.ride) {
          setActiveRide(data.ride);
          navigation.navigate('Tracking', { rideId: data.ride.id });
        }
      } catch {}
    })();
  }, []);

  // ── Socket: nouvelles notifications ─────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('ride_accepted', ({ ride }) => {
      setActiveRide(ride);
      navigation.navigate('Tracking', { rideId: ride.id });
    });

    return () => socket.off('ride_accepted');
  }, []);

  const loadNearbyDrivers = async (lat, lng) => {
    try {
      const { data } = await ridesAPI.nearbyDrivers(lat, lng);
      setNearbyDrivers(data.drivers || []);
    } catch {}
  };

  // ── Recherche d'adresse (autocomplete) ────────────────────
  const searchAddress = useCallback(debounce(async (q) => {
    if (!q || q.length < 3 || !userLocation) return setSearchResults([]);
    try {
      const { data } = await ridesAPI.autocomplete(q, userLocation.lat, userLocation.lng);
      setSearchResults(data.results || []);
    } catch {}
  }, 400), [userLocation]);

  const handleSearchChange = (text) => {
    setSearchQuery(text);
    searchAddress(text);
  };

  const selectDestination = (result) => {
    setDropoff({ lat: result.lat, lng: result.lng, address: result.shortName || result.address });
    setSearchQuery(result.shortName || result.address);
    setSearchResults([]);
    Keyboard.dismiss();

    // Zoom sur la destination
    mapRef.current?.animateToRegion({
      latitude: result.lat, longitude: result.lng,
      latitudeDelta: 0.01, longitudeDelta: 0.01
    }, 800);
  };

  const handleBook = () => {
    if (!dropoff) {
      Alert.alert('Destination requise', 'Veuillez choisir une destination.');
      return;
    }
    navigation.navigate('Booking');
  };

  const userName = user?.firstName || 'vous';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Carte */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{ latitude: 14.7167, longitude: -17.4677, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        {/* Chauffeurs proches */}
        {nearbyDrivers.map((d) => (
          <Marker
            key={d.driver_id}
            coordinate={{ latitude: parseFloat(d.current_lat), longitude: parseFloat(d.current_lng) }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <Ionicons name="bicycle" size={20} color={COLORS.secondary} />
            </View>
          </Marker>
        ))}

        {/* Destination */}
        {dropoff && (
          <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }}>
            <View style={styles.dropoffMarker}>
              <Ionicons name="location" size={24} color={COLORS.error} />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={styles.greeting}>Bonjour, {userName} 👋</Text>
        <TouchableOpacity
          style={styles.notifBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>

      {/* Panneau de recherche */}
      <View style={[styles.searchPanel, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {/* Pickup (position actuelle) */}
        <View style={styles.locationRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {pickup?.address || 'Chargement de votre position...'}
          </Text>
        </View>

        <View style={styles.separator} />

        {/* Destination Search */}
        <View style={styles.searchRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Où allez-vous ?"
            placeholderTextColor={COLORS.gray[400]}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={() => setIsSearching(true)}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setDropoff(null); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={20} color={COLORS.gray[400]} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Résultats de recherche */}
        {searchResults.length > 0 && (
          <FlatList
            data={searchResults}
            keyExtractor={(_, i) => i.toString()}
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.resultItem} onPress={() => selectDestination(item)}>
                <Ionicons name="location-outline" size={18} color={COLORS.gray[500]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle} numberOfLines={1}>{item.shortName}</Text>
                  <Text style={styles.resultSub} numberOfLines={1}>{item.address}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Favoris rapides */}
        {!isSearching && !dropoff && (
          <View style={styles.favRow}>
            {[
              { icon: 'home', label: 'Maison' },
              { icon: 'briefcase', label: 'Bureau' },
              { icon: 'heart', label: 'Favoris' },
            ].map((f) => (
              <TouchableOpacity key={f.label} style={styles.favChip}
                onPress={() => f.label === 'Favoris' ? navigation.navigate('Favorites') : null}>
                <Ionicons name={f.icon} size={16} color={COLORS.primary} />
                <Text style={styles.favLabel}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Bouton Commander */}
        {dropoff && (
          <TouchableOpacity style={styles.bookBtn} onPress={handleBook} activeOpacity={0.85}>
            <Ionicons name="bicycle" size={22} color={COLORS.white} />
            <Text style={styles.bookBtnText}>Commander un moto-taxi</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bouton Ma position */}
      <TouchableOpacity
        style={[styles.myLocationBtn, { bottom: 220 + insets.bottom }]}
        onPress={() => {
          if (userLocation) {
            mapRef.current?.animateToRegion({
              latitude: userLocation.lat, longitude: userLocation.lng,
              latitudeDelta: 0.01, longitudeDelta: 0.01
            }, 800);
          }
        }}
      >
        <Ionicons name="locate" size={22} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.95)',
    ...SHADOWS.small,
  },
  greeting: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center',
  },
  driverMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
    ...SHADOWS.small,
  },
  dropoffMarker: { alignItems: 'center' },
  myLocationBtn: {
    position: 'absolute', right: SPACING.md,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.medium,
  },
  searchPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.md, paddingTop: SPACING.lg,
    ...SHADOWS.large,
  },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  locationText: { flex: 1, fontSize: SIZES.medium, color: COLORS.gray[700] },
  separator: { height: 1, backgroundColor: COLORS.gray[200], marginVertical: 4, marginLeft: 20 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1, fontSize: SIZES.medium, color: COLORS.secondary,
    paddingVertical: 4,
  },
  resultsList: { maxHeight: 250, marginTop: SPACING.xs },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
  },
  resultTitle: { fontSize: SIZES.medium, fontWeight: '600', color: COLORS.secondary },
  resultSub: { fontSize: SIZES.small, color: COLORS.gray[500] },
  favRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  favChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.gray[100], borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  favLabel: { fontSize: SIZES.small, fontWeight: '600', color: COLORS.secondary },
  bookBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md,
  },
  bookBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
