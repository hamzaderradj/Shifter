import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, FlatList, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../utils/theme';

const FILTERS = ['Toutes', 'Terminées', 'Annulées'];

const MOCK_TRIPS = [
  { id: '1', from: '12 Rue de Rivoli, 75001 Paris', to: '8 Av. de la République, 93200 Saint-Denis', amount: 18.40, distanceKm: 9.2, date: 'Aujourd\'hui, 14h32', status: 'completed', rating: 5 },
  { id: '2', from: '5 Bd Voltaire, 75011 Paris', to: '3 Rue Victor Hugo, 94300 Vincennes', amount: 12.80, distanceKm: 5.4, date: 'Aujourd\'hui, 11h05', status: 'completed', rating: 4 },
  { id: '3', from: 'Gare de Lyon, 75012 Paris', to: '22 Av. de Clichy, 75017 Paris', amount: 0, distanceKm: 7.1, date: 'Hier, 18h49', status: 'cancelled', rating: null },
  { id: '4', from: '48 Rue d\'Alésia, 75014 Paris', to: '9 Pl. de la Nation, 75011 Paris', amount: 22.60, distanceKm: 11.3, date: 'Hier, 10h17', status: 'completed', rating: 5 },
  { id: '5', from: 'Châtelet, 75001 Paris', to: '100 Bd de la Chapelle, 75018 Paris', amount: 14.20, distanceKm: 6.1, date: '26 mai, 16h03', status: 'completed', rating: 4 },
  { id: '6', from: '33 Av. d\'Italie, 75013 Paris', to: 'Orly Ouest, 94390 Orly', amount: 0, distanceKm: 14.5, date: '25 mai, 08h55', status: 'cancelled', rating: null },
  { id: '7', from: 'Opéra, 75009 Paris', to: '7 Rue de Metz, 93100 Montreuil', amount: 31.00, distanceKm: 15.5, date: '24 mai, 20h11', status: 'completed', rating: 5 },
];

const statusConfig = {
  completed: { color: COLORS.primary, label: 'Terminée', icon: 'checkmark-circle' },
  cancelled: { color: COLORS.danger, label: 'Annulée', icon: 'close-circle' },
};

function TripCard({ trip }) {
  const cfg = statusConfig[trip.status];
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => Alert.alert('Détail course', `De : ${trip.from}\nVers : ${trip.to}\nDistance : ${trip.distanceKm} km\nMontant : ${trip.amount > 0 ? trip.amount.toFixed(2) + ' €' : '—'}`)}
    >
      <View style={styles.cardTop}>
        {/* Route */}
        <View style={styles.route}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.accent }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{trip.from}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.routeAddr} numberOfLines={1}>{trip.to}</Text>
          </View>
        </View>

        {/* Amount */}
        <Text style={[styles.amount, { color: trip.amount > 0 ? COLORS.primary : COLORS.textSub }]}>
          {trip.amount > 0 ? `+${trip.amount.toFixed(2)} €` : '—'}
        </Text>
      </View>

      <View style={styles.cardBottom}>
        <View style={styles.metaRow}>
          <Ionicons name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.sep}>·</Text>
          <Ionicons name="navigate-outline" size={12} color={COLORS.textSub} />
          <Text style={styles.meta}>{trip.distanceKm} km</Text>
          {trip.rating && (
            <>
              <Text style={styles.sep}>·</Text>
              <Ionicons name="star" size={12} color={COLORS.accent} />
              <Text style={styles.meta}>{trip.rating}</Text>
            </>
          )}
        </View>
        <Text style={styles.date}>{trip.date}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TripsScreen() {
  const [filter, setFilter] = useState(0);

  const filtered = MOCK_TRIPS.filter((t) => {
    if (filter === 0) return true;
    if (filter === 1) return t.status === 'completed';
    if (filter === 2) return t.status === 'cancelled';
    return true;
  });

  const completedCount = MOCK_TRIPS.filter((t) => t.status === 'completed').length;
  const cancelledCount = MOCK_TRIPS.filter((t) => t.status === 'cancelled').length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Mes courses</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{MOCK_TRIPS.length} total</Text>
        </View>
      </View>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
          <Text style={styles.summaryValue}>{completedCount}</Text>
          <Text style={styles.summaryLabel}>Terminées</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="close-circle" size={18} color={COLORS.danger} />
          <Text style={styles.summaryValue}>{cancelledCount}</Text>
          <Text style={styles.summaryLabel}>Annulées</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="star" size={18} color={COLORS.accent} />
          <Text style={styles.summaryValue}>4.87</Text>
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
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bicycle-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>Aucune course</Text>
          </View>
        }
      />
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
    marginHorizontal: 20, marginBottom: 10,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  route: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeAddr: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '500' },
  routeLine: { width: 1.5, height: 12, backgroundColor: COLORS.border, marginLeft: 3.5, marginVertical: 2 },
  amount: { fontSize: 17, fontWeight: '800' },

  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  sep: { color: COLORS.textMuted, fontSize: 12 },
  meta: { fontSize: 12, color: COLORS.textSub },
  date: { fontSize: 11, color: COLORS.textMuted },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.textSub, fontWeight: '600' },
});
