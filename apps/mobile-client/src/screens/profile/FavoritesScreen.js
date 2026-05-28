import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const LABEL_ICONS = { Maison: 'home', Bureau: 'briefcase' };

export default function FavoritesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    usersAPI.getFavorites().then(({ data }) => setFavorites(data.favorites || [])).catch(() => {});
  }, []);

  const handleDelete = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette adresse favorite ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await usersAPI.deleteFavorite(id).catch(() => {});
        setFavorites(f => f.filter(x => x.id !== id));
      }}
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Favoris</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={favorites}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={64} color={COLORS.gray[300]} />
            <Text style={styles.emptyText}>Aucun favori</Text>
            <Text style={styles.emptySub}>Ajoutez vos adresses fréquentes pour aller plus vite</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.favCard}>
            <View style={styles.favIcon}>
              <Ionicons name={LABEL_ICONS[item.label] || 'heart'} size={22} color={COLORS.primary} />
            </View>
            <View style={styles.favInfo}>
              <Text style={styles.favLabel}>{item.label}</Text>
              <Text style={styles.favAddress} numberOfLines={2}>{item.address}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, backgroundColor: COLORS.white, ...SHADOWS.small,
  },
  title: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  list: { padding: SPACING.md, gap: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyText: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.gray[600] },
  emptySub: { color: COLORS.gray[400], textAlign: 'center', lineHeight: 20 },
  favCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md, ...SHADOWS.small,
  },
  favIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,107,53,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  favInfo: { flex: 1 },
  favLabel: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
  favAddress: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  deleteBtn: { padding: SPACING.sm },
});
