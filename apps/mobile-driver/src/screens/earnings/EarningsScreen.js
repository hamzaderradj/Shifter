import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { driverAPI } from '../../services/api';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

const PERIODS = [
  { label: "Aujourd'hui", key: 'today' },
  { label: 'Cette semaine', key: 'week' },
  { label: 'Ce mois', key: 'month' },
];

export default function EarningsScreen() {
  const [periodIdx, setPeriodIdx] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEarnings = useCallback(async (periodKey, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: res } = await driverAPI.getEarnings(periodKey);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchEarnings(PERIODS[periodIdx].key);
    }, [periodIdx])
  );

  useEffect(() => {
    fetchEarnings(PERIODS[periodIdx].key);
  }, [periodIdx]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEarnings(PERIODS[periodIdx].key, true);
  };

  const netEarnings = data?.netEarnings ?? 0;
  const totalRides = data?.totalRides ?? 0;
  const grossRevenue = data?.grossRevenue ?? 0;
  const platformFee = data?.platformFee ?? 0;
  const rides = data?.rides ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mes revenus</Text>
        </View>

        {/* Période */}
        <View style={styles.periodRow}>
          {PERIODS.map((p, i) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, periodIdx === i && styles.periodBtnActive]}
              onPress={() => setPeriodIdx(i)}
            >
              <Text style={[styles.periodText, periodIdx === i && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Total card */}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Vos gains nets</Text>
              <Text style={styles.totalAmount}>{netEarnings.toFixed(2)} €</Text>
              <View style={styles.totalRow}>
                <View style={styles.totalStat}>
                  <Ionicons name="bicycle-outline" size={16} color={COLORS.textSub} />
                  <Text style={styles.totalStatText}>{totalRides} course{totalRides > 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.totalDivider} />
                <View style={styles.totalStat}>
                  <Ionicons name="cash-outline" size={16} color={COLORS.primary} />
                  <Text style={[styles.totalStatText, { color: COLORS.primary }]}>
                    {grossRevenue.toFixed(2)} € brut
                  </Text>
                </View>
              </View>
            </View>

            {/* Répartition */}
            <View style={styles.splitCard}>
              <Text style={styles.splitTitle}>Répartition</Text>
              <View style={styles.splitRow}>
                <Text style={styles.splitLabel}>Vos gains (80%)</Text>
                <Text style={[styles.splitValue, { color: COLORS.primary }]}>{netEarnings.toFixed(2)} €</Text>
              </View>
              <View style={styles.splitRow}>
                <Text style={styles.splitLabel}>Commission Shifter (20%)</Text>
                <Text style={styles.splitValue}>{platformFee.toFixed(2)} €</Text>
              </View>
              <View style={[styles.splitRow, styles.splitTotal]}>
                <Text style={styles.splitTotalLabel}>Total généré</Text>
                <Text style={styles.splitTotalValue}>{grossRevenue.toFixed(2)} €</Text>
              </View>
            </View>

            {/* Historique des courses */}
            {rides.length > 0 && (
              <View style={styles.ridesSection}>
                <Text style={styles.sectionTitle}>Courses ({rides.length})</Text>
                {rides.map((ride) => (
                  <View key={ride.id} style={styles.rideCard}>
                    <View style={styles.rideLeft}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                      <View>
                        <Text style={styles.rideDate}>
                          {new Date(ride.completedAt).toLocaleDateString('fr-FR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </Text>
                        <Text style={styles.rideKm}>{parseFloat(ride.distanceKm || 0).toFixed(1)} km</Text>
                      </View>
                    </View>
                    <Text style={styles.rideAmount}>
                      +{(parseFloat(ride.finalPrice || 0) * 0.8).toFixed(2)} €
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {rides.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="cash-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Aucune course sur cette période</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, paddingTop: SPACING.lg },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.text },

  periodRow: { flexDirection: 'row', marginHorizontal: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg, padding: 4 },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.md, alignItems: 'center' },
  periodBtnActive: { backgroundColor: COLORS.primary },
  periodText: { fontSize: 12, fontWeight: '600', color: COLORS.textSub },
  periodTextActive: { color: COLORS.bg },

  totalCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  totalLabel: { fontSize: 13, color: COLORS.textSub, marginBottom: 6, fontWeight: '600' },
  totalAmount: { fontSize: 40, fontWeight: '900', color: COLORS.text, marginBottom: SPACING.md },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  totalStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalStatText: { fontSize: 13, color: COLORS.textSub, fontWeight: '600' },
  totalDivider: { width: 1, height: 16, backgroundColor: COLORS.border },

  splitCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  splitTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  splitLabel: { fontSize: 13, color: COLORS.textSub },
  splitValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  splitTotal: { borderBottomWidth: 0, marginTop: 4 },
  splitTotalLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  splitTotalValue: { fontSize: 14, fontWeight: '800', color: COLORS.primary },

  ridesSection: { marginHorizontal: SPACING.md },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textSub, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  rideCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  rideLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rideDate: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  rideKm: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
  rideAmount: { fontSize: 15, fontWeight: '800', color: COLORS.primary },

  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.md },
  emptyText: { fontSize: 15, color: COLORS.textMuted },
});
