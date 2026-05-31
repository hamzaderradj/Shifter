import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store';

const MenuItem = ({ icon, label, subtitle, onPress, danger, badge }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
      <Ionicons name={icon} size={20} color={danger ? '#EF4444' : '#6B7280'} />
    </View>
    <View style={styles.menuText}>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
    </View>
    {badge ? (
      <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
    ) : null}
    {!danger && <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Se déconnecter', 'Tu veux vraiment te déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', style: 'destructive', onPress: logout },
    ]);
  };

  const soon = (f) => Alert.alert(f, 'Cette section sera disponible dans la prochaine version.', [{ text: 'OK' }]);

  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || null;
  const initial = name ? name[0].toUpperCase() : user?.phone?.[3] || 'U';

  // Note : seulement affichée si l'utilisateur a fait des courses
  const ridesCount = user?.totalRides || 0;
  const rating = user?.rating;
  const showRating = ridesCount > 0 && rating;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* En-tête */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Mon compte</Text>
        </View>

        {/* Carte profil */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <TouchableOpacity style={styles.avatarEdit} onPress={() => soon('Photo de profil')}>
              <Ionicons name="camera" size={13} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileInfo}>
            {name ? (
              <Text style={styles.profileName}>{name}</Text>
            ) : (
              <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={styles.addNameBtn}>
                <Text style={styles.addNameText}>+ Ajouter mon prénom</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.profilePhone}>{user?.phone || ''}</Text>
            {showRating ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={styles.ratingText}>{parseFloat(rating).toFixed(2)}</Text>
                <Text style={styles.ratingCount}>({ridesCount} courses)</Text>
              </View>
            ) : (
              <View style={styles.ratingRow}>
                <Ionicons name="bicycle-outline" size={14} color="#6B7280" />
                <Text style={styles.newUserText}>Nouveau client</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bannière complétion */}
        {!name && (
          <TouchableOpacity style={styles.setupBanner} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.85}>
            <View style={styles.setupIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#3B82F6" />
            </View>
            <View style={styles.setupText}>
              <Text style={styles.setupTitle}>Complète ton profil</Text>
              <Text style={styles.setupSub}>Ajoute ton prénom et ton e-mail</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#3B82F6" />
          </TouchableOpacity>
        )}

        {/* Section principale */}
        <View style={styles.section}>
          <MenuItem icon="person-outline" label="Modifier le profil" subtitle="Prénom, nom, e-mail" onPress={() => navigation.navigate('EditProfile')} />
          <MenuItem icon="card-outline" label="Paiement" subtitle="Espèces · Mobile Money" onPress={() => soon('Paiement')} />
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => navigation.navigate('Notifications')} />
          <MenuItem icon="help-circle-outline" label="Support" onPress={() => navigation.navigate('Support')} />
          <MenuItem icon="location-outline" label="Lieux enregistrés" onPress={() => navigation.navigate('Favorites')} />
          <MenuItem icon="shield-outline" label="Sécurité" onPress={() => soon('Sécurité')} />
        </View>

        {/* Section extras */}
        <View style={styles.section}>
          <MenuItem icon="pricetag-outline" label="Promotions" subtitle="Codes promo et offres" onPress={() => soon('Promotions')} />
          <MenuItem icon="people-outline" label="Inviter des amis" subtitle="Gagnez des crédits ensemble" onPress={() => soon('Inviter des amis')} />
          <MenuItem icon="star-outline" label="Noter l'application" onPress={() => soon("Noter l'application")} />
        </View>

        {/* Déconnexion */}
        <View style={styles.section}>
          <MenuItem icon="log-out-outline" label="Se déconnecter" onPress={handleLogout} danger />
        </View>

        <Text style={styles.version}>Shifter v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff' },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  avatarEdit: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 3 },
  addNameBtn: { marginBottom: 3 },
  addNameText: { fontSize: 15, fontWeight: '600', color: '#3B82F6' },
  profilePhone: { fontSize: 13, color: '#6B7280', marginBottom: 5 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  ratingCount: { fontSize: 12, color: '#9CA3AF' },
  newUserText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  setupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#EFF6FF', marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BFDBFE',
  },
  setupIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  setupText: { flex: 1 },
  setupTitle: { fontSize: 14, fontWeight: '700', color: '#1D4ED8' },
  setupSub: { fontSize: 13, color: '#3B82F6', marginTop: 2 },
  section: {
    backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginTop: 12, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  menuIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center',
  },
  menuIconDanger: { backgroundColor: '#FEF2F2' },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  menuLabelDanger: { color: '#EF4444' },
  menuSub: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  badge: {
    backgroundColor: '#3B82F6', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, marginRight: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: 12, color: '#D1D5DB', paddingVertical: 24 },
});
