import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ridesAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const STATUS_LABEL = {
  completed: { label: 'Terminée', color: COLORS.success },
  cancelled:  { label: 'Annulée',  color: COLORS.error },
};

const Row = ({ icon, label, value, valueColor }) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={16} color={COLORS.gray[500]} />
    </View>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
  </View>
);

export default function RideDetailScreen({ navigation, route }) {
  const { rideId } = route.params;
  const insets = useSafeAreaInsets();
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await ridesAPI.getById(rideId);
        setRide(data.ride);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [rideId]);

  const handleShare = async () => {
    if (!ride) return;
    await Share.share({
      message: `Course Shifter du ${format(new Date(ride.requestedAt), 'dd MMM yyyy', { locale: fr })}\n` +
        `De : ${ride.pickupAddress}\nVers : ${ride.dropoffAddress}\n` +
        `Prix : ${parseFloat(ride.finalPrice || ride.estimatedPrice || 0).toFixed(2)} €`,
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.gray[300]} />
        <Text style={styles.errorText}>Course introuvable</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusCfg = STATUS_LABEL[ride.status] || { label: ride.status, color: COLORS.gray[500] };
  const price = parseFloat(ride.finalPrice || ride.estimatedPrice || 0).toFixed(2);
  const distance = ride.distanceKm ? `${parseFloat(ride.distanceKm).toFixed(1)} km` : '—';
  const duration = ride.durationMinutes ? `${ride.durationMinutes} min` : '—';
  const driverName = ride.driver
    ? `${ride.driver.user?.firstName || ''} ${ride.driver.user?.lastName || ''}`.trim()
    : null;

  // note laissée par le client sur cette course
  const myRating = Array.isArray(ride.ratings)
    ? ride.ratings.find(r => r.toUser === ride.driver?.userId)
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={22} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail de la course</Text>
        <TouchableOpacity onPress={handleShare}>
          <Ionicons name="share-outline" size={22} color={COLORS.secondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Statut + date */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.color + '20' }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          <Text style={styles.dateText}>
            {format(new Date(ride.requestedAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
          </Text>
        </View>

        {/* Trajet */}
        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeIcons}>
              <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
              <View style={styles.routeLine} />
              <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
            </View>
            <View style={styles.routeAddresses}>
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Départ</Text>
                <Text style={styles.addressText}>{ride.pickupAddress}</Text>
              </View>
              <View style={styles.addressBlock}>
                <Text style={styles.addressLabel}>Destination</Text>
                <Text style={styles.addressText}>{ride.dropoffAddress}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Infos course */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Détails</Text>
          <Row icon="cash-outline" label="Prix" value={`${price} €`} valueColor={COLORS.secondary} />
          <Row icon="navigate-outline" label="Distance" value={distance} />
          <Row icon="time-outline" label="Durée" value={duration} />
          <Row icon="card-outline" label="Paiement" value={ride.paymentMethod === 'cash' ? 'Espèces' : 'Mobile Money'} />
        </View>

        {/* Chauffeur */}
        {driverName ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Chauffeur</Text>
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{driverName[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driverName}</Text>
                {myRating && (
                  <View style={styles.ratingRow}>
                    {[1,2,3,4,5].map(s => (
                      <Ionicons
                        key={s}
                        name={s <= myRating.score ? 'star' : 'star-outline'}
                        size={16}
                        color={COLORS.accent}
                      />
                    ))}
                    {myRating.comment ? (
                      <Text style={styles.ratingComment}>« {myRating.comment} »</Text>
                    ) : null}
                  </View>
                )}
                {!myRating && ride.status === 'completed' && (
                  <Text style={styles.noRating}>Course non notée</Text>
                )}
              </View>
            </View>
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  errorText: { color: COLORS.gray[500], fontSize: SIZES.large, fontWeight: '600' },
  backBtn: {
    marginTop: SPACING.sm, backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, borderRadius: RADIUS.md,
  },
  backBtnText: { color: COLORS.white, fontWeight: '700' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    backgroundColor: COLORS.white, ...SHADOWS.small,
  },
  headerBack: { padding: 4 },
  headerTitle: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },

  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { paddingHorizontal: SPACING.md, paddingVertical: 5, borderRadius: RADIUS.full },
  statusText: { fontSize: SIZES.small, fontWeight: '700' },
  dateText: { fontSize: SIZES.small, color: COLORS.gray[500] },

  card: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.md, ...SHADOWS.small, gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[400],
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },

  routeRow: { flexDirection: 'row', gap: SPACING.md },
  routeIcons: { alignItems: 'center', paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, flex: 1, backgroundColor: COLORS.gray[200], marginVertical: 4 },
  routeAddresses: { flex: 1, gap: SPACING.md },
  addressBlock: { gap: 2 },
  addressLabel: { fontSize: 11, color: COLORS.gray[400], fontWeight: '600', textTransform: 'uppercase' },
  addressText: { fontSize: SIZES.medium, color: COLORS.secondary, fontWeight: '500' },

  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 6 },
  rowIcon: {
    width: 30, height: 30, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.gray[100], alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: SIZES.medium, color: COLORS.gray[600] },
  rowValue: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },

  driverRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  driverAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarText: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  driverInfo: { flex: 1 },
  driverName: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap' },
  ratingComment: { fontSize: SIZES.small, color: COLORS.gray[500], fontStyle: 'italic', marginLeft: 4 },
  noRating: { fontSize: SIZES.small, color: COLORS.gray[400] },
});
