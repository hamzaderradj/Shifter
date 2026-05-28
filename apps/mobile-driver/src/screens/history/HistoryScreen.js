import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ridesAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await ridesAPI.getHistory();
      setRides(data.rides || []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}><Text style={styles.title}>Mes courses</Text></View>
      {loading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 60 }} /> : (
        <FlatList
          data={rides}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="bicycle-outline" size={64} color={COLORS.gray[300]} /><Text style={styles.emptyText}>Aucune course</Text></View>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.date}>{format(new Date(item.requestedAt), 'dd MMM · HH:mm', { locale: fr })}</Text>
                <Text style={[styles.price, { color: item.status === 'completed' ? COLORS.success : COLORS.error }]}>
                  {item.status === 'completed' ? '+' + Math.round((parseFloat(item.finalPrice) || 0) * 0.8) + ' FCFA' : 'Annulée'}
                </Text>
              </View>
              <Text style={styles.route} numberOfLines={1}>Depart: {item.pickupAddress}</Text>
              {item.client && <Text style={styles.client}>Client: {item.client.firstName} {item.client.lastName}</Text>}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.md, backgroundColor: COLORS.white, elevation: 2 },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.secondary },
  list: { padding: SPACING.md, gap: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: SPACING.md },
  emptyText: { color: COLORS.gray[500], fontSize: SIZES.large },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  date: { color: COLORS.gray[500], fontSize: SIZES.small },
  price: { fontSize: SIZES.medium, fontWeight: '700' },
  route: { fontSize: SIZES.small, color: COLORS.gray[700], marginBottom: 4 },
  client: { fontSize: SIZES.small, color: COLORS.gray[500] },
});
