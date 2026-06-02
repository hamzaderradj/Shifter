import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, TextInput, FlatList, KeyboardAvoidingView, Platform,
  StatusBar, ScrollView, Keyboard, TouchableWithoutFeedback, SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useMapStore, useRideStore } from '../../store';
import { COLORS } from '../../utils/theme';
import { joinRide, initSocket, getSocket } from '../../services/socket';
import { ridesAPI, usersAPI } from '../../services/api';

// ── Geocoding via Nominatim (OSM) — gratuit, sans clé ──────────
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const NOM_HEADERS = { 'User-Agent': 'ShifterApp/1.0', 'Accept-Language': 'fr' };

async function searchAddress(query, lat, lng) {
  if (!query || query.length < 2) return [];
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '8',
      addressdetails: '1',
      countrycodes: 'fr',
      'accept-language': 'fr',
      dedupe: '1',
      ...(lat && lng ? {
        viewbox: `${lng - 0.3},${lat + 0.3},${lng + 0.3},${lat - 0.3}`,
        bounded: '0',
      } : {}),
    });
    const res = await fetch(`${NOMINATIM}/search?${params}`, { headers: NOM_HEADERS });
    const json = await res.json();
    const seen = new Set();
    return json
      .map(item => {
        const a = item.address || {};
        const num = a.house_number || '';
        const street = a.road || a.pedestrian || a.footway || a.path || a.cycleway || '';
        const city = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
        const postcode = a.postcode || '';
        const line1 = num && street
          ? `${num} ${street}`
          : street || item.display_name.split(',')[0].trim();
        const line2 = [postcode, city].filter(Boolean).join(' ');
        const address = line2 ? `${line1}, ${line2}` : line1;
        return { address, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
      })
      .filter(item => {
        const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return item.address.length > 3;
      });
  } catch (e) {
    console.warn('[searchAddress] error:', e.message);
    return [];
  }
}

async function reverseGeocodeAddr(lat, lng) {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: NOM_HEADERS }
    );
    const item = await res.json();
    if (!item || item.error) return null;
    const a = item.address || {};
    const num = a.house_number || '';
    const street = a.road || a.pedestrian || a.footway || '';
    const city = a.city || a.town || a.village || a.suburb || '';
    const postcode = a.postcode || '';
    const line1 = num && street ? `${num} ${street}` : street || item.display_name.split(',')[0];
    const line2 = postcode && city ? `${postcode} ${city}` : city;
    return {
      address: item.display_name,
      shortAddress: line2 ? `${line1}, ${line2}` : line1,
    };
  } catch (e) {
    console.warn('[reverseGeocode] error:', e.message);
    return null;
  }
}

// ── Calcul de distance (formule Haversine) ──────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Formule de prix (alignée sur le backend) ────────────────────
// Base 2.50€ + 1.50€/km + 0.15€/min (vitesse ~30km/h), min 5.00€
function calcPrice(distanceKm) {
  const durationMin = Math.ceil((distanceKm / 30) * 60);
  const raw = 2.50 + distanceKm * 1.50 + durationMin * 0.15;
  return Math.max(raw, 5.00).toFixed(2);
}

// ── Durée estimée (vitesse moto ~30 km/h en ville) ─────────────
function estimateDuration(distanceKm) {
  return Math.round((distanceKm / 30) * 60);
}

// ── Geocoding via backend (Google Maps) ────────────────────────
const PARIS_CENTER = { latitude: 48.8566, longitude: 2.3522 };

// ───────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { id: 'cash', icon: 'cash-outline', label: 'Espèces' },
  { id: 'mobile_money', icon: 'phone-portrait-outline', label: 'Mobile Money' },
];

export default function BookingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userLocation } = useMapStore();
  const { setActiveRide } = useRideStore();

  const [pickupText, setPickupText] = useState('Localisation en cours...');
  const [dropoffText, setDropoffText] = useState('');
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [booking, setBooking] = useState(false);
  const [favorites, setFavorites] = useState([]);

  const dropoffRef = useRef(null);
  const debounceRef = useRef(null);

  // Charger les favoris au montage
  useEffect(() => {
    usersAPI.getFavorites()
      .then(({ data }) => setFavorites(data.favorites || []))
      .catch(() => {});
  }, []);

  // Prix calculé localement (instantané)
  const distance = pickup && dropoff
    ? haversineKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng)
    : null;
  const price = distance ? calcPrice(distance) : null;
  const duration = distance ? estimateDuration(distance) : null;

  // Remplir le départ avec la position GPS + reverse geocode
  useEffect(() => {
    (async () => {
      try {
        let lat, lng;
        if (userLocation) {
          lat = userLocation.latitude;
          lng = userLocation.longitude;
        } else {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { setPickupText('Point de départ'); return; }
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
        const geo = await reverseGeocodeAddr(lat, lng);
        if (geo) {
          const short = geo.shortAddress || geo.address.split(',').slice(0, 2).join(',').trim();
          setPickupText(short);
          setPickup({ address: geo.address, lat, lng });
        } else {
          setPickupText('Ma position actuelle');
          setPickup({ address: 'Ma position actuelle', lat, lng });
        }
      } catch {
        setPickupText('Ma position actuelle');
        if (userLocation) {
          setPickup({
            address: 'Ma position actuelle',
            lat: userLocation.latitude,
            lng: userLocation.longitude,
          });
        }
      }
    })();
  }, []);

  // Recherche d'adresse avec debounce 400ms
  const handleSearch = (text, field) => {
    if (field === 'pickup') setPickupText(text);
    else setDropoffText(text);
    setActiveField(field);
    setSuggestions([]);

    clearTimeout(debounceRef.current);
    if (text.length < 3) return;

    debounceRef.current = setTimeout(async () => {
      setLoadingSuggest(true);
      try {
        const results = await searchAddress(text, userLocation?.latitude, userLocation?.longitude);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggest(false);
      }
    }, 400);
  };

  const selectSuggestion = async (item) => {
    Keyboard.dismiss();
    setSuggestions([]);
    // Afficher l'adresse tout de suite
    if (activeField === 'pickup') setPickupText(item.address);
    else setDropoffText(item.address);

    // Nominatim retourne directement lat/lng dans les suggestions
    let finalItem = item;

    if (activeField === 'pickup') {
      setPickupText(finalItem.address);
      setPickup(finalItem);
    } else {
      setDropoffText(finalItem.address);
      setDropoff(finalItem);
    }
    setActiveField(null);
  };

  const handleBook = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Incomplet', 'Veuillez saisir votre point de départ et destination.');
      return;
    }
    setBooking(true);
    try {
      const { data } = await ridesAPI.create({
        pickupAddress: pickup.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffAddress: dropoff.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        paymentMethod,
        estimatedPrice: price,
      });
      if (data.success) {
        setActiveRide(data.ride);
        // S'assurer que le socket est connecté avant de rejoindre la room
        if (!getSocket()?.connected) await initSocket();
        joinRide(data.ride.id);
        navigation.replace('Tracking', { rideId: data.ride.id });
      }
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.message || 'Impossible de créer la course. Réessaie.');
    } finally {
      setBooking(false);
    }
  };

  const showSuggestions = suggestions.length > 0 || (loadingSuggest && activeField);
  const bothSet = pickup && dropoff;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Réserver une course</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Champs adresse */}
      <View style={styles.addressCard}>
        {/* Départ */}
        <View style={styles.addressRow}>
          <View style={styles.dotGreen} />
          <TextInput
            style={styles.addressInput}
            value={pickupText}
            onChangeText={(t) => handleSearch(t, 'pickup')}
            onFocus={() => {
              setActiveField('pickup');
              if (pickupText.length >= 3) handleSearch(pickupText, 'pickup');
            }}
            placeholder="Point de départ"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            onSubmitEditing={() => dropoffRef.current?.focus()}
          />
          {pickupText.length > 0 && (
            <TouchableOpacity onPress={() => { setPickupText(''); setPickup(null); }}>
              <Ionicons name="close-circle" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.dotLine} />

        {/* Destination */}
        <View style={styles.addressRow}>
          <View style={styles.dotBlue} />
          <TextInput
            ref={dropoffRef}
            style={styles.addressInput}
            value={dropoffText}
            onChangeText={(t) => handleSearch(t, 'dropoff')}
            onFocus={() => setActiveField('dropoff')}
            placeholder="Où voulez-vous aller ?"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            autoFocus
          />
          {dropoffText.length > 0 && (
            <TouchableOpacity onPress={() => { setDropoffText(''); setDropoff(null); }}>
              <Ionicons name="close-circle" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Liste des suggestions */}
      {showSuggestions ? (
        <View style={styles.suggestBox}>
          {loadingSuggest ? (
            <View style={styles.suggestLoading}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.suggestLoadingText}>Recherche...</Text>
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestItem} onPress={() => selectSuggestion(item)}>
                  <View style={styles.suggestIconWrap}>
                    <Ionicons name="location-outline" size={18} color="#3B82F6" />
                  </View>
                  <Text style={styles.suggestText} numberOfLines={2}>
                    {item.address.split(',').slice(0, 3).join(',')}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>

          {/* Favoris — accès rapide aux adresses sauvegardées */}
          {favorites.length > 0 && !dropoff && (
            <View style={styles.favSection}>
              <Text style={styles.favSectionTitle}>Favoris</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.favScroll}>
                {favorites.map((fav) => (
                  <TouchableOpacity
                    key={fav.id}
                    style={styles.favChip}
                    onPress={() => {
                      setDropoffText(fav.address);
                      setDropoff({ address: fav.address, lat: fav.lat, lng: fav.lng });
                      Keyboard.dismiss();
                    }}
                  >
                    <Ionicons
                      name={{ Maison: 'home', Bureau: 'briefcase', Gym: 'fitness', Famille: 'people' }[fav.label] || 'heart'}
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.favChipText}>{fav.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Prix et infos du trajet */}
          {bothSet && price ? (
            <View style={styles.priceCard}>
              <View style={styles.priceMain}>
                <Text style={styles.priceLabel}>Prix estimé</Text>
                <Text style={styles.priceValue}>{price} €</Text>
                <Text style={styles.priceFormula}>2,50 € fixe + {distance.toFixed(1)} km × 1,50 €</Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceStats}>
                <View style={styles.priceStat}>
                  <Ionicons name="location-outline" size={18} color="#3B82F6" />
                  <Text style={styles.priceStatVal}>{distance.toFixed(1)} km</Text>
                  <Text style={styles.priceStatLbl}>Distance</Text>
                </View>
                <View style={styles.priceStatDiv} />
                <View style={styles.priceStat}>
                  <Ionicons name="time-outline" size={18} color="#3B82F6" />
                  <Text style={styles.priceStatVal}>{duration} min</Text>
                  <Text style={styles.priceStatLbl}>Durée est.</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.hintCard}>
              <Ionicons name="search-outline" size={22} color="#3B82F6" />
              <View style={{ flex: 1 }}>
                <Text style={styles.hintTitle}>Saisissez votre destination</Text>
                <Text style={styles.hintSub}>Le prix s'affiche instantanément</Text>
              </View>
            </View>
          )}

          {/* Paiement */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Mode de paiement</Text>
            <View style={styles.paymentRow}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.payChip, paymentMethod === m.id && styles.payChipActive]}
                  onPress={() => setPaymentMethod(m.id)}
                >
                  <Ionicons name={m.icon} size={20} color={paymentMethod === m.id ? '#fff' : '#374151'} />
                  <Text style={[styles.payLabel, paymentMethod === m.id && styles.payLabelActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Info tarif */}
          <View style={styles.tariffInfo}>
            <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
            <Text style={styles.tariffText}>
              Tarif transparent : 2,50 € de prise en charge + 1,50 € /km. Prix fixé avant la course.
            </Text>
          </View>

        </ScrollView>
      )}

      {/* Bouton commander */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.bookBtn, (!bothSet || booking) && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={!bothSet || booking}
          activeOpacity={0.85}
        >
          {booking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="bicycle" size={22} color="#fff" />
              <Text style={styles.bookBtnText}>
                {bothSet && price ? `Commander · ${price} €` : 'Choisissez votre destination'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  addressCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12,
    borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  dotGreen: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981', flexShrink: 0 },
  dotBlue: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#3B82F6', flexShrink: 0 },
  dotLine: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 40 },
  addressInput: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500', paddingVertical: 0 },

  suggestBox: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 4,
    borderRadius: 16, maxHeight: 300, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 14, elevation: 5,
  },
  suggestLoading: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 18, justifyContent: 'center',
  },
  suggestLoadingText: { color: '#6B7280', fontSize: 14 },
  suggestItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  suggestIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  suggestText: { flex: 1, fontSize: 14, color: '#111827', lineHeight: 20 },

  // Favoris
  favSection: { marginBottom: 12 },
  favSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 },
  favScroll: { flexDirection: 'row' },
  favChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EFF6FF', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9,
    marginRight: 8, borderWidth: 1, borderColor: '#DBEAFE',
  },
  favChipText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  priceCard: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  priceMain: {
    backgroundColor: '#111827', padding: 24, alignItems: 'center',
  },
  priceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  priceValue: { color: '#fff', fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  priceFormula: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 },
  priceDivider: { height: 1, backgroundColor: '#F3F4F6' },
  priceStats: {
    flexDirection: 'row', padding: 20,
  },
  priceStat: { flex: 1, alignItems: 'center', gap: 4 },
  priceStatVal: { fontSize: 20, fontWeight: '800', color: '#111827' },
  priceStatLbl: { fontSize: 12, color: '#6B7280' },
  priceStatDiv: { width: 1, backgroundColor: '#E5E7EB' },

  hintCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#EFF6FF', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 12,
  },
  hintTitle: { fontSize: 15, fontWeight: '700', color: '#1D4ED8' },
  hintSub: { fontSize: 13, color: '#3B82F6', marginTop: 2 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 14 },
  paymentRow: { flexDirection: 'row', gap: 10 },
  payChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB',
  },
  payChipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  payLabel: { fontWeight: '600', color: '#374151', fontSize: 14 },
  payLabelActive: { color: '#fff' },

  tariffInfo: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    paddingHorizontal: 4, paddingBottom: 24,
  },
  tariffText: { flex: 1, fontSize: 12, color: '#9CA3AF', lineHeight: 18 },

  footer: {
    backgroundColor: '#fff', padding: 16,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  bookBtn: {
    backgroundColor: '#111827', borderRadius: 16,
    height: 58, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10,
  },
  bookBtnDisabled: { backgroundColor: '#9CA3AF' },
  bookBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
