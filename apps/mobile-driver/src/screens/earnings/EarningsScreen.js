import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { driverAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const PERIODS = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' },
];

export default function EarningsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await driverAPI.getEarnings(period);
      setData(res.data);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { setLoading(true); load(); }, [period]);

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Mes revenus</Text>
      </View>

      {/* Période */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.periodChip, period === p.id && styles.periodChipActive]}
            onPress={() => setPeriod(p.id)}
          >
            <Text style={[styles.periodText, period === p.id && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : data ? (
        <>
          {/* Carte principale */}
          <View style={styles.mainCard}>
            <Text style={styles.mainLabel}>Revenus nets</Text>
            <Text style={styles.mainValue}>{data.netEarnings?.toLocaleString() || 0}</Text>
            <Text style={styles.mainUnit}>FCFA</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="bicycle" size={24} color={COLORS.primary} />
              <Text style={styles.statValue}>{data.totalRides}</Text>
              <Text style={styles.statLabel}>Courses</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="cash" size={24} color={COLORS.success} />
              <Text style={styles.statValue}>{data.grossRevenue?.toLocaleString() || 0}</Text>
              <Text style={styles.statLabel}>Brut (FCFA)</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="remove-circle" size={24} color={COLORS.error} />
              <Text style={styles.statValue}>{((data.grossRevenue || 0) - (data.netEarnings || 0))?.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Commission</Text>
            </View>
          </View>

          {/* Courses récentes */}
          {data.rides?.length > 0 && (
            <View style={styles.ridesSection}>
              <Text style={styles.sectionTitle}>Courses récentes</Text>
              {data.rides.slice(0, 10).map((r) => (
                <View key={r.id} style={styles.rideItem}>
                  <View style={styles.rideIcon}>
                    <Ionicons name="bicycle" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.rideInfo}>
                    <Text style={styles.rideDate}>
                      {r.completedAt ? format(new Date(r.completedAt), 'dd MMM · HH:mm', { locale: fr }) : '-'}
                    </Text>
                    <Text style={styles.rideDistance}>{parseFloat(r.distanceKm || 0).toFixed(1)} km</Text>
                  </View>
                  <Text style={styles.rideEarning}>
                    +{Math.round((parseFloat(r.finalPrice) || 0) * 0.8)} FCFA
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={64} color={COLORS.gray[300]} />
          <Text style={styles.emptyText}>Aucune donnée</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.md, backgroundColor: COLORS.white, ...SHADOWS.small },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.secondary },
  periodRow: { flexDirection: 'row', padding: SPACING.md, gap: SPACING.sm },
  periodChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: COLORS.gray[200] },
  periodChipActive: { backgroundColor: COLORS.primary },
  periodText: { fontSize: SIZES.small, fontWeight: '600', color: COLORS.gray[600] },
  periodTextActive: { color: COLORS.white },
  mainCard: {
    margin: SPACING.md, backgroundColor: COLORS.secondary, borderRadius: RADIUS.xl,
    padding: SPACING.xl, alignItems: 'center', ...SHADOWS.medium,
  },
  mainLabel: { color: 'rgba(255,255,255,0.6)', fontSize: SIZES.medium, marginBottom: SPACING.sm },
  mainValue: { color: COLORS.white, fontSize: 48, fontWeight: '900' },
  mainUnit: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.medium },
  statsRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, gap: SPACING.md, marginBottom: SPACING.md },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md,
    alignItems: 'center', gap: 4, ...SHADOWS.small,
  },
  statValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  statLabel: { fontSize: SIZES.small, color: COLORS.gray[500] },
  ridesSection: { paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[500], marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  rideItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  rideIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  rideInfo: { flex: 1 },
  rideDate: { fontSize: SIZES.medium, fontWeight: '600', color: COLORS.secondary },
  rideDistance: { fontSize: SIZES.small, color: COLORS.gray[500] },
  rideEarning: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.success },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: SPACING.md },
  emptyText: { color: COLORS.gray[500], fontSize: SIZES.large },
});
