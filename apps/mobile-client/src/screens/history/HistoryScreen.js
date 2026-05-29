import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ridesAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const StatusBadge = ({ status }) => {
  const config = {
    completed: { label: 'Terminée', color: COLORS.success },
    cancelled: { label: 'Annulée', color: COLORS.error },
  }[status] || { label: status, color: COLORS.gray[500] };

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20' }]}>
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const RideCard = ({ ride, onPress }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.cardHeader}>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={14} color={COLORS.gray[500]} />
        <Text style={styles.dateText}>
          {format(new Date(ride.requestedAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
        </Text>
      </View>
      <StatusBadge status={ride.status} />
    </View>

    <View style={styles.route}>
      <View style={styles.routeRow}>
        <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
        <Text style={styles.routeText} numberOfLines={1}>{ride.pickupAddress}</Text>
      </View>
      <View style={styles.routeConnector} />
      <View style={styles.routeRow}>
        <View style={[styles.dot, { backgroundColor: COLORS.error }]} />
        <Text style={styles.routeText} numberOfLines={1}>{ride.dropoffAddress}</Text>
      </View>
    </View>

    <View style={styles.cardFooter}>
      {ride.driver && (
        <View style={styles.driverRow}>
          <Ionicons name="person" size={14} color={COLORS.gray[500]} />
          <Text style={styles.driverName}>
            {ride.driver.user?.firstName} {ride.driver.user?.lastName}
          </Text>
          {ride.rating && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={COLORS.accent} />
              <Text style={styles.ratingText}>{ride.rating.score}/5</Text>
            </View>
          )}
        </View>
      )}
      {ride.finalPrice && (
        <Text style={styles.price}>{parseFloat(ride.finalPrice || 0).toFixed(2)} €</Text>
      )}
    </View>
  </TouchableOpacity>
);

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchRides = async (p = 1, refresh = false) => {
    try {
      const { data } = await ridesAPI.getHistory(p);
      const newRides = data.rides || [];
      if (refresh) setRides(newRides);
      else setRides(prev => [...prev, ...newRides]);
      setHasMore(p < data.pagination.pages);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchRides(1); }, []);

  const onRefresh = () => { setRefreshing(true); setPage(1); fetchRides(1, true); };
  const onEndReached = () => { if (hasMore && !loading) { const next = page + 1; setPage(next); fetchRides(next); } };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes courses</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : rides.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bicycle-outline" size={64} color={COLORS.gray[300]} />
          <Text style={styles.emptyTitle}>Aucune course</Text>
          <Text style={styles.emptySub}>Vos courses apparaîtront ici</Text>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RideCard ride={item} onPress={() => navigation.navigate('RideDetail', { rideId: item.id })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={hasMore ? <ActivityIndicator color={COLORS.primary} style={{ margin: SPACING.md }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.md, paddingBottom: SPACING.sm, backgroundColor: COLORS.white, ...SHADOWS.small },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.secondary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  emptyTitle: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.gray[600] },
  emptySub: { color: COLORS.gray[400] },
  list: { padding: SPACING.md, gap: SPACING.md },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { color: COLORS.gray[500], fontSize: SIZES.small },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 2, borderRadius: RADIUS.full },
  badgeText: { fontSize: SIZES.small, fontWeight: '700' },
  route: { gap: 4, marginBottom: SPACING.md },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  routeConnector: { width: 2, height: 16, backgroundColor: COLORS.gray[300], marginLeft: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  routeText: { flex: 1, color: COLORS.gray[700], fontSize: SIZES.small },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  driverName: { color: COLORS.gray[600], fontSize: SIZES.small },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { fontSize: SIZES.small, color: COLORS.secondary, fontWeight: '600' },
  price: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
});
