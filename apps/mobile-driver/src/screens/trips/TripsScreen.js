import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ridesAPI } from '../../services/api';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

const FILTERS = ['Toutes', 'Terminées', 'Annulées'];

const statusConfig = {
  completed: { color: COLORS.primary, label: 'Terminée', icon: 'checkmark-circle' },
  cancelled: { color: '#FF4B4B', label: 'Annulée', icon: 'close-circle' },
};

function TripCard({ trip }) {
  const cfg = statusConfig[trip.status] || statusConfig.completed;
  const earned = trip.status === 'completed'
    ? (parseFloat(trip.finalPrice || trip.estimatedPrice || 0) * 0.8)
    : 0;
  const rating = Array.isArray(trip.ratings) && trip.ratings.length > 0
    ? trip.ratings[0].score
    : null;

  const dateStr = trip.completedAt || trip.createdAt
    ? new Date(trip.completedAt || trip.createdAt).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.route}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: '#F39C12' }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{trip.pickupAddress}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{trip.dropoffAddress}</Text>
          </View>
        </View>
        <Text style={[styles.amount, { color: earned > 0 ? COLORS.primary : COLORS.textSub }]}>
          {earned > 0 ? `+${earned.toFixed(0)}` : '—'}
          {earned > 0 ? <Text style={styles.amountCurrency}> FCFA</Text> : null}
        </Text>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.metaRow}>
          <Ionicons name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          {trip.distanceKm ? (
            <>
              <Text style={styles.sep}>·</Text>
              <Ionicons name="navigate-outline" size={12} color={COLORS.textSub} />
              <Text style={styles.meta}>{parseFloat(trip.distanceKm).toFixed(1)} km</Text>
            </>
          ) : null}
          {rating !== null ? (
            <>
              <Text style={styles.sep}>·</Text>
              <Ionicons name="star" size={12} color="#F39C12" />
              <Text style={styles.meta}>{rating}</Text>
            </>
          ) : null}
        </View>
        <Text style={styles.date}>{dateStr}</Text>
      </View>
    </View>
  );
}

export default function TripsScreen() {
  const [filter, setFilter] = useState(0);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await ridesAPI.getHistory(1);
      setRides(data.rides || []);
    } catch {
      setRides([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory(true);
  };

  const filtered = rides.filter((r) => {
    if (filter === 0) return true;
    if (filter === 1) return r.status === 'completed';
    if (filter === 2) return r.status === 'cancelled';
    return true;
  });

  const completedCount = rides.filter((r) => r.status === 'completed').length;
  const cancelledCount = rides.filter((r) => r.status === 'cancelled').length;
  const ratings = rides
    .flatMap((r) => r.ratings || [])
    .map((r) => r.score)
    .filter((v) => v != null);
  const avgRating = ratings.length > 0
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
    : '—';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mes courses</Text>
        {!loading && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{rides.length} total</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 80 }} />
      ) : (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
              <Text style={styles.summaryValue}>{completedCount}</Text>
              <Text style={styles.summaryLabel}>Terminées</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="close-circle" size={18} color="#FF4B4B" />
              <Text style={styles.summaryValue}>{cancelledCount}</Text>
              <Text style={styles.summaryLabel}>Annulées</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="star" size={18} color="#F39C12" />
              <Text style={styles.summaryValue}>{avgRating}</Text>
              <Text style={styles.summaryLabel}>Note moy.</Text>
            </View>
          </View>

          {/* Filters */}
          <View style={styles.filterRow}>
            {FILTERS.map((f, i) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, filter === i && styles.filterBtnActive]}
                onPress={() => setFilter(i)}
              >
                <Text style={[styles.filterText, filter === i && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TripCard trip={item} />}
            contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="bicycle-outline" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Aucune course sur cette période</Text>
              </View>
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  headerBadge: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },

  summaryRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 16 },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 12, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  summaryValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  summaryLabel: { fontSize: 10, color: COLORS.textSub, fontWeight: '600' },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  filterBtn: {
    paddingVertical: 7, paddingHorizontal: 16, borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '700', color: COLORS.textSub },
  filterTextActive: { color: COLORS.bg },

  card: {
    marginBottom: 10,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  route: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeAddr: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },
  routeLine: { width: 1.5, height: 12, backgroundColor: COLORS.border, marginLeft: 3.5, marginVertical: 2 },
  amount: { fontSize: 16, fontWeight: '800', minWidth: 60, textAlign: 'right' },
  amountCurrency: { fontSize: 11, fontWeight: '600' },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  statusText: { fontSize: 12, fontWeight: '700' },
  sep: { color: COLORS.textMuted, fontSize: 12 },
  meta: { fontSize: 12, color: COLORS.textSub },
  date: { fontSize: 11, color: COLORS.textMuted },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.textSub, fontWeight: '600' },
});
