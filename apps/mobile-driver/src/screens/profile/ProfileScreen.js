import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useDriverAuthStore, useEarningsStore } from '../../store';
import { COLORS, RADIUS } from '../../utils/theme';

const MenuItem = ({ icon, label, subtitle, onPress, danger, value, badge }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
      <Ionicons name={icon} size={20} color={danger ? COLORS.danger : COLORS.textSub} />
    </View>
    <View style={styles.menuText}>
      <Text style={[styles.menuLabel, danger && { color: COLORS.danger }]}>{label}</Text>
      {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
    </View>
    {value ? <Text style={styles.menuValue}>{value}</Text> : null}
    {badge ? (
      <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
    ) : null}
    {!danger && <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />}
  </TouchableOpacity>
);

export default function DriverProfileScreen() {
  const navigation = useNavigation();
  const { driver, logout } = useDriverAuthStore();
  const { today, trips } = useEarningsStore();

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', style: 'destructive', onPress: logout },
    ]);
  };

  const soon = (f) => Alert.alert(f, 'Disponible dans la prochaine version.', [{ text: 'OK' }]);

  const firstName = driver?.firstName || 'Chauffeur';
  const lastName = driver?.lastName || '';
  const name = `${firstName} ${lastName}`.trim();
  const initial = name[0]?.toUpperCase() || 'C';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mon profil</Text>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.onlineBadge} />
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profilePhone}>{driver?.phone || '+33 6 XX XX XX XX'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={COLORS.accent} />
              <Text style={styles.ratingText}>4.87</Text>
              <Text style={styles.ratingCount}>({trips} courses)</Text>
            </View>
          </View>
        </View>

        {/* Stats band */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{today.toFixed(0)} €</Text>
            <Text style={styles.statLabel}>Aujourd'hui</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{trips}</Text>
            <Text style={styles.statLabel}>Courses</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: COLORS.primary }]}>Actif</Text>
            <Text style={styles.statLabel}>Statut</Text>
          </View>
        </View>

        {/* Documents section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compte</Text>
          <MenuItem icon="person-outline" label="Modifier le profil" subtitle="Nom, e-mail" onPress={() => navigation.navigate('EditProfile')} />
          <MenuItem icon="document-text-outline" label="Documents" subtitle="Permis, assurance, carte grise" onPress={() => navigation.navigate('Documents')} />
          <MenuItem icon="card-outline" label="Paiement" subtitle="Virement bancaire" onPress={() => soon('Paiement')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activité</Text>
          <MenuItem icon="cash-outline" label="Revenus" value="487 €" onPress={() => soon('Revenus')} />
          <MenuItem icon="gift-outline" label="Bonus" subtitle="Objectifs et récompenses" onPress={() => soon('Bonus')} badge="3" />
          <MenuItem icon="star-outline" label="Évaluations" subtitle="Tes notes clients" onPress={() => soon('Évaluations')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Préférences</Text>
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => soon('Notifications')} />
          <MenuItem icon="language-outline" label="Langue" value="Français" onPress={() => soon('Langue')} />
          <MenuItem icon="shield-outline" label="Sécurité" onPress={() => soon('Sécurité')} />
        </View>

        <View style={styles.section}>
          <MenuItem icon="log-out-outline" label="Se déconnecter" onPress={handleLogout} danger />
        </View>

        <Text style={styles.version}>Shifter Rider v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: COLORS.bgCard, paddingHorizontal: 20, paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(46,204,113,0.4)',
  },
  avatarText: { fontSize: 28, fontWeight: '900', color: COLORS.bg },
  onlineBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.bgCard,
  },

  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  profilePhone: { fontSize: 13, color: COLORS.textSub, marginBottom: 6 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  ratingCount: { fontSize: 12, color: COLORS.textMuted },

  statsRow: {
    flexDirection: 'row', backgroundColor: COLORS.bgCard,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    marginBottom: 12,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  statLabel: { fontSize: 11, color: COLORS.textSub, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: COLORS.border },

  section: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    marginHorizontal: 16, marginTop: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  menuIcon: {
    width: 38, height: 38, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgInput, alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: 'rgba(231,76,60,0.1)' },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  menuSub: { fontSize: 12, color: COLORS.textSub, marginTop: 1 },
  menuValue: { fontSize: 13, fontWeight: '600', color: COLORS.textSub, marginRight: 6 },
  badge: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, marginRight: 6,
  },
  badgeText: { color: COLORS.bg, fontSize: 11, fontWeight: '800' },

  version: { textAlign: 'center', fontSize: 12, color: COLORS.textMuted, paddingVertical: 24 },
});
