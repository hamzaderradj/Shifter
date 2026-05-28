import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, driver, logout } = useAuthStore();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Chauffeur';
  const statusColor = { pending: COLORS.warning, approved: COLORS.success, rejected: COLORS.error, suspended: COLORS.error }[driver?.status] || COLORS.gray[500];
  const statusLabel = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', suspended: 'Suspendu' }[driver?.status] || driver?.status;

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{fullName[0]?.toUpperCase()}</Text></View>
        <Text style={styles.name}>{fullName}</Text>
        <Text style={styles.phone}>{user?.phone}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {driver && (
        <View style={styles.vehicleCard}>
          <Ionicons name="bicycle" size={24} color={COLORS.primary} />
          <View>
            <Text style={styles.vehicleName}>{driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel}</Text>
            <Text style={styles.vehiclePlate}>{driver.vehiclePlate}</Text>
          </View>
        </View>
      )}

      {!driver && (
        <TouchableOpacity style={styles.registerBtn} onPress={() => navigation.navigate('Registration')}>
          <Ionicons name="add-circle" size={22} color={COLORS.white} />
          <Text style={styles.registerBtnText}>S'inscrire comme chauffeur</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert('Déconnexion', 'Se déconnecter ?', [{ text: 'Annuler', style: 'cancel' }, { text: 'Déconnexion', style: 'destructive', onPress: logout }])}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.secondary, padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.white, fontSize: 32, fontWeight: '800' },
  name: { fontSize: SIZES.xxLarge, fontWeight: '800', color: COLORS.white },
  phone: { color: 'rgba(255,255,255,0.7)', fontSize: SIZES.medium },
  statusBadge: { paddingHorizontal: SPACING.md, paddingVertical: 4, borderRadius: RADIUS.full },
  statusText: { fontWeight: '700', fontSize: SIZES.small },
  vehicleCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.white, margin: SPACING.md, borderRadius: RADIUS.lg, padding: SPACING.md, ...SHADOWS.small },
  vehicleName: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
  vehiclePlate: { color: COLORS.gray[500], fontSize: SIZES.small },
  registerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.primary, margin: SPACING.md, borderRadius: RADIUS.lg, height: 52 },
  registerBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.large },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, margin: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.error },
  logoutText: { color: COLORS.error, fontWeight: '600' },
});
