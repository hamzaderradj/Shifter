import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const MenuItem = ({ icon, label, sublabel, onPress, danger }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
      <Ionicons name={icon} size={22} color={danger ? COLORS.error : COLORS.primary} />
    </View>
    <View style={styles.menuText}>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      {sublabel && <Text style={styles.menuSublabel}>{sublabel}</Text>}
    </View>
    <Ionicons name="chevron-forward" size={18} color={COLORS.gray[400]} />
  </TouchableOpacity>
);

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: logout }
    ]);
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Utilisateur';

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} showsVerticalScrollIndicator={false}>
      {/* Header profil */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{fullName[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={styles.verifiedText}>Compte vérifié</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsCard}>
        {[
          { value: '0', label: 'Courses', icon: 'bicycle' },
          { value: '4.8', label: 'Note', icon: 'star' },
          { value: '0', label: 'Km parcourus', icon: 'navigate' },
        ].map((s, i) => (
          <View key={i} style={[styles.stat, i !== 2 && styles.statBorder]}>
            <Ionicons name={s.icon} size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Menu */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mon compte</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="person-outline" label="Modifier le profil" onPress={() => {}} />
          <MenuItem icon="heart-outline" label="Adresses favorites" onPress={() => navigation.navigate('Favorites')} />
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="help-circle-outline" label="Centre d'aide" onPress={() => {}} />
          <MenuItem icon="chatbubble-outline" label="Contacter le support" onPress={() => navigation.navigate('Support')} />
          <MenuItem icon="document-text-outline" label="Conditions d'utilisation" onPress={() => {}} />
          <MenuItem icon="shield-outline" label="Politique de confidentialité" onPress={() => {}} />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.menuCard}>
          <MenuItem icon="log-out-outline" label="Se déconnecter" onPress={handleLogout} danger />
        </View>
      </View>

      <Text style={styles.version}>TaxaMoto v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.secondary, padding: SPACING.xl, paddingBottom: SPACING.xl,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.white, fontSize: 28, fontWeight: '800' },
  profileInfo: { flex: 1 },
  name: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.white, marginBottom: 4 },
  phone: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.medium, marginBottom: 6 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: COLORS.success, fontSize: SIZES.small, fontWeight: '600' },
  statsCard: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    marginHorizontal: SPACING.md, borderRadius: RADIUS.lg,
    marginTop: -SPACING.md, ...SHADOWS.medium,
    marginBottom: SPACING.md,
  },
  stat: { flex: 1, alignItems: 'center', padding: SPACING.md, gap: 4 },
  statBorder: { borderRightWidth: 1, borderRightColor: COLORS.gray[200] },
  statValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  statLabel: { fontSize: SIZES.small, color: COLORS.gray[500] },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionTitle: { fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[500], marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },
  menuCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, ...SHADOWS.small },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100] },
  menuIcon: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,107,53,0.1)', alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.md,
  },
  menuIconDanger: { backgroundColor: 'rgba(255,71,87,0.1)' },
  menuText: { flex: 1 },
  menuLabel: { fontSize: SIZES.medium, fontWeight: '600', color: COLORS.secondary },
  menuLabelDanger: { color: COLORS.error },
  menuSublabel: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  version: { textAlign: 'center', color: COLORS.gray[400], fontSize: SIZES.small, padding: SPACING.xl },
});
