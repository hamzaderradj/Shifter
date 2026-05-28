import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEarningsStore } from '../../store';
import { COLORS, RADIUS, SPACING } from '../../utils/theme';

const { width } = Dimensions.get('window');

const PERIODS = ['Aujourd\'hui', 'Cette semaine', 'Ce mois'];

const MOCK_WEEK = [
  { day: 'Lun', amount: 42, trips: 3 },
  { day: 'Mar', amount: 68, trips: 5 },
  { day: 'Mer', amount: 35, trips: 2 },
  { day: 'Jeu', amount: 81, trips: 6 },
  { day: 'Ven', amount: 95, trips: 7 },
  { day: 'Sam', amount: 112, trips: 8 },
  { day: 'Dim', amount: 54, trips: 4 },
];

const maxAmount = Math.max(...MOCK_WEEK.map((d) => d.amount));

export default function EarningsScreen() {
  const [period, setPeriod] = useState(1); // default: this week
  const { today, week, trips } = useEarningsStore();

  const totalWeek = MOCK_WEEK.reduce((s, d) => s + d.amount, 0);
  const totalTrips = MOCK_WEEK.reduce((s, d) => s + d.trips, 0);
  const todayData = MOCK_WEEK[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];

  const displayTotal = period === 0 ? todayData.amount : period === 1 ? totalWeek : totalWeek * 4.3;
  const displayTrips = period === 0 ? todayData.trips : period === 1 ? totalTrips : totalTrips * 4;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mes revenus</Text>
          <TouchableOpacity style={styles.calBtn}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.textSub} />
          </TouchableOpacity>
        </View>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {PERIODS.map((p, i) => (
            <TouchableOpacity
              key={p} style={[styles.periodBtn, period === i && styles.periodBtnActive]}
              onPress={() => setPeriod(i)}
            >
              <Text style={[styles.periodText, period === i && styles.periodTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Big total card */}
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total gagné</Text>
          <Text style={styles.totalAmount}>{displayTotal.toFixed(2)} €</Text>
          <View style={styles.totalRow}>
            <View style={styles.totalStat}>
              <Ionicons name="bicycle-outline" size={16} color={COLORS.textSub} />
              <Text style={styles.totalStatText}>{Math.round(displayTrips)} courses</Text>
            </View>
            <View style={styles.totalDivider} />
            <View style={styles.totalStat}>
              <Ionicons name="trending-up-outline" size={16} color={COLORS.primary} />
              <Text style={[styles.totalStatText, { color: COLORS.primary }]}>+12% vs semaine dernière</Text>
            </View>
          </View>
        </View>

        {/* Weekly bar chart */}
        {period >= 1 && (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Revenus par jour</Text>
            <View style={styles.bars}>
              {MOCK_WEEK.map((d) => {
                const pct = d.amount / maxAmount;
                const isToday = d.day === ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][new Date().getDay()];
                return (
                  <View key={d.day} style={styles.barWrap}>
                    <Text style={styles.barAmount}>{d.amount}€</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${Math.round(pct * 100)}%` },
                          isToday && styles.barFillToday,
                        ]}
                      />
                    </View>
                    <Text style={[styles.barDay, isToday && { color: COLORS.primary }]}>{d.day}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Breakdown cards */}
        <View style={styles.breakdownRow}>
          <View style={styles.breakCard}>
            <View style={[styles.breakIcon, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
              <Ionicons name="cash-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.breakValue}>{(displayTotal * 0.85).toFixed(2)} €</Text>
            <Text style={styles.breakLabel}>Courses</Text>
          </View>
          <View style={styles.breakCard}>
            <View style={[styles.breakIcon, { backgroundColor: 'rgba(243,156,18,0.15)' }]}>
              <Ionicons name="gift-outline" size={22} color={COLORS.accent} />
            </View>
            <Text style={styles.breakValue}>{(displayTotal * 0.15).toFixed(2)} €</Text>
            <Text style={styles.breakLabel}>Bonus</Text>
          </View>
          <View style={styles.breakCard}>
            <View style={[styles.breakIcon, { backgroundColor: 'rgba(160,168,192,0.1)' }]}>
              <Ionicons name="star-outline" size={22} color={COLORS.textSub} />
            </View>
            <Text style={styles.breakValue}>4.87</Text>
            <Text style={styles.breakLabel}>Note moy.</Text>
          </View>
        </View>

        {/* Recent earnings list */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Dernières courses</Text>
        </View>

        {MOCK_WEEK.map((d, i) => (
          <View key={i} style={styles.earningItem}>
            <View style={styles.earningLeft}>
              <View style={styles.earningIcon}>
                <Ionicons name="bicycle" size={18} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.earningDay}>{d.day} — {d.trips} course{d.trips > 1 ? 's' : ''}</Text>
                <Text style={styles.earningTime}>Île-de-France</Text>
              </View>
            </View>
            <Text style={styles.earningAmount}>+{d.amount} €</Text>
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },
  calBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  periodRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 20,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  periodBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { fontSize: 12, fontWeight: '700', color: COLORS.textSub },
  periodTextActive: { color: COLORS.bg },

  totalCard: {
    marginHorizontal: 20, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: 24, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  totalLabel: { fontSize: 13, color: COLORS.textSub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  totalAmount: { fontSize: 48, fontWeight: '900', color: COLORS.primary, marginBottom: 16 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  totalStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalStatText: { fontSize: 13, color: COLORS.textSub, fontWeight: '600' },
  totalDivider: { width: 1, height: 16, backgroundColor: COLORS.border },

  chartCard: {
    marginHorizontal: 20, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.xl,
    padding: 20, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  barWrap: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barAmount: { fontSize: 9, color: COLORS.textMuted, marginBottom: 4 },
  barTrack: {
    width: '70%', height: 80, backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.sm, overflow: 'hidden', justifyContent: 'flex-end',
  },
  barFill: { width: '100%', backgroundColor: COLORS.bgElevated, borderRadius: RADIUS.sm },
  barFillToday: { backgroundColor: COLORS.primary },
  barDay: { fontSize: 10, color: COLORS.textSub, marginTop: 6, fontWeight: '600' },

  breakdownRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 20 },
  breakCard: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 14, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  breakIcon: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  breakValue: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  breakLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '600' },

  sectionHeader: { paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.textSub,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  earningItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  earningLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  earningIcon: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: 'rgba(46,204,113,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  earningDay: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  earningTime: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },
  earningAmount: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
});
