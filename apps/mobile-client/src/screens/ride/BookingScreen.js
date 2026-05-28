import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, ScrollView, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ridesAPI } from '../../services/api';
import { useMapStore, useRideStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';
import { joinRide } from '../../services/socket';

const PAYMENT_METHODS = [
  { id: 'cash', icon: 'cash', label: 'Espèces' },
  { id: 'mobile_money', icon: 'phone-portrait', label: 'Mobile Money' },
];

export default function BookingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { pickup, dropoff } = useMapStore();
  const { setActiveRide } = useRideStore();

  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  useEffect(() => {
    if (!pickup || !dropoff) return;
    (async () => {
      try {
        const { data } = await ridesAPI.estimate({
          pickupLat: pickup.lat, pickupLng: pickup.lng,
          dropoffLat: dropoff.lat, dropoffLng: dropoff.lng
        });
        setEstimate(data.estimate);
      } catch {
        Alert.alert('Erreur', 'Impossible de calculer l\'estimation.');
      } finally {
        setLoading(false);
      }
    })();
  }, [pickup, dropoff]);

  const handleBook = async () => {
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
      });

      if (data.success) {
        setActiveRide(data.ride);
        joinRide(data.ride.id);
        navigation.replace('Tracking', { rideId: data.ride.id });
      }
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.message || 'Impossible de créer la course.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Votre course</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Itinéraire */}
        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeDots}>
              <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
              <View style={styles.routeLine} />
              <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
            </View>
            <View style={styles.routeText}>
              <Text style={styles.routeLabel}>Départ</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>{pickup?.address}</Text>
              <View style={{ height: SPACING.lg }} />
              <Text style={styles.routeLabel}>Arrivée</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>{dropoff?.address}</Text>
            </View>
          </View>
        </View>

        {/* Estimation */}
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Calcul du tarif...</Text>
          </View>
        ) : estimate ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Estimation</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <Text style={styles.statValue}>{estimate.distanceKm} km</Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Ionicons name="time" size={20} color={COLORS.primary} />
                <Text style={styles.statValue}>{estimate.durationMinutes} min</Text>
                <Text style={styles.statLabel}>Durée</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Ionicons name="cash" size={20} color={COLORS.primary} />
                <Text style={styles.statValue}>{estimate.estimatedPrice}</Text>
                <Text style={styles.statLabel}>FCFA</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Paiement */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Paiement</Text>
          <View style={styles.paymentMethods}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.paymentChip, paymentMethod === m.id && styles.paymentChipActive]}
                onPress={() => setPaymentMethod(m.id)}
              >
                <Ionicons name={m.icon} size={20} color={paymentMethod === m.id ? COLORS.white : COLORS.gray[600]} />
                <Text style={[styles.paymentLabel, paymentMethod === m.id && styles.paymentLabelActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Prix final */}
        {estimate && (
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>Prix estimé</Text>
            <Text style={styles.priceValue}>{estimate.estimatedPrice} FCFA</Text>
            <Text style={styles.priceNote}>Tarif final peut varier selon le trajet réel</Text>
          </View>
        )}
      </ScrollView>

      {/* Commander */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        <TouchableOpacity
          style={[styles.bookBtn, booking && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={booking || loading}
          activeOpacity={0.85}
        >
          {booking ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Ionicons name="bicycle" size={22} color={COLORS.white} />
              <Text style={styles.bookBtnText}>
                Commander · {estimate?.estimatedPrice || '---'} FCFA
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, backgroundColor: COLORS.white, ...SHADOWS.small,
  },
  headerTitle: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  content: { flex: 1, padding: SPACING.md },
  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small,
  },
  routeRow: { flexDirection: 'row', gap: SPACING.md },
  routeDots: { alignItems: 'center', paddingTop: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  routeLine: { width: 2, flex: 1, backgroundColor: COLORS.gray[300], marginVertical: 4 },
  routeText: { flex: 1 },
  routeLabel: { fontSize: SIZES.small, color: COLORS.gray[500], marginBottom: 2 },
  routeAddress: { fontSize: SIZES.medium, fontWeight: '600', color: COLORS.secondary },
  loadingCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm,
    marginBottom: SPACING.md, ...SHADOWS.small,
  },
  loadingText: { color: COLORS.gray[500] },
  sectionTitle: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary, marginBottom: SPACING.md },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  statLabel: { fontSize: SIZES.small, color: COLORS.gray[500] },
  statDivider: { width: 1, backgroundColor: COLORS.gray[200] },
  paymentMethods: { flexDirection: 'row', gap: SPACING.sm },
  paymentChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: RADIUS.md,
    borderWidth: 2, borderColor: COLORS.gray[200], backgroundColor: COLORS.gray[50],
  },
  paymentChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  paymentLabel: { fontWeight: '600', color: COLORS.gray[600] },
  paymentLabelActive: { color: COLORS.white },
  priceCard: {
    backgroundColor: COLORS.secondary, borderRadius: RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.md,
  },
  priceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.small },
  priceValue: { color: COLORS.white, fontSize: 36, fontWeight: '800', marginVertical: 4 },
  priceNote: { color: 'rgba(255,255,255,0.5)', fontSize: SIZES.small, textAlign: 'center' },
  footer: { padding: SPACING.md, backgroundColor: COLORS.white, ...SHADOWS.medium },
  bookBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.sm,
  },
  bookBtnDisabled: { opacity: 0.7 },
  bookBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
