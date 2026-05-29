import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, TextInput, FlatList, KeyboardAvoidingView, Platform,
  StatusBar, ScrollView, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ridesAPI } from '../../services/api';
import { useMapStore, useRideStore } from '../../store';
import { joinRide, initSocket, getSocket } from '../../services/socket';

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

// ── Zone de couverture : Île-de-France ─────────────────────────
const IDF_BOUNDS = {
  viewbox: '1.44,48.12,3.56,49.12', // lon_min,lat_min,lon_max,lat_max
  bounded: 1,
};
const PARIS_CENTER = { latitude: 48.8566, longitude: 2.3522 };

// ── Geocoding via Nominatim (OSM, gratuit, sans clé API) ────────
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'User-Agent': 'ShifterApp/1.0', 'Accept-Language': 'fr' };

function formatAddress(item) {
  const a = item.address || {};
  const number   = a.house_number || '';
  const street   = a.road || a.pedestrian || a.footway || a.path || '';
  const postcode = a.postcode || '';
  const city     = a.city || a.town || a.village || a.suburb || a.municipality || '';

  let line1 = '';
  if (number && street) line1 = `${number} ${street}`;
  else if (street) line1 = street;
  else line1 = item.display_name.split(',')[0].trim();

  let line2 = '';
  if (postcode && city) line2 = `${postcode} ${city}`;
  else if (city) line2 = city;

  return line2 ? `${line1}, ${line2}` : line1;
}

async function searchAddress(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '8',
    addressdetails: '1',
    viewbox: IDF_BOUNDS.viewbox, // préférence IDF, pas strict
    bounded: '0',               // pas de blocage strict
    countrycodes: 'fr',
  });
  const res = await fetch(`${NOMINATIM}/search?${params}`, { headers: HEADERS });
  const json = await res.json();
  return json.map((item) => ({
    address: formatAddress(item),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
  const res = await fetch(url, { headers: HEADERS });
  const json = await res.json();
  return formatAddress(json);
}

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

  const dropoffRef = useRef(null);
  const debounceRef = useRef(null);

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
        const addr = await reverseGeocode(lat, lng);
        // Simplifier l'adresse (supprimer les détails inutiles)
        const short = addr.split(',').slice(0, 3).join(',');
        setPickupText(short);
        setPickup({ address: short, lat, lng });
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
        const results = await searchAddress(text);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggest(false);
      }
    }, 400);
  };

  const selectSuggestion = (item) => {
    Keyboard.dismiss();
    if (activeField === 'pickup') {
      setPickupText(item.address);
      setPickup(item);
    } else {
      setDropoffText(item.address);
      setDropoff(item);
    }
    setSuggestions([]);
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
