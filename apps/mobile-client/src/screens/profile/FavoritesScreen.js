import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { usersAPI, ridesAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const PRESET_LABELS = [
  { key: 'Maison', icon: 'home' },
  { key: 'Bureau', icon: 'briefcase' },
  { key: 'Gym', icon: 'fitness' },
  { key: 'Famille', icon: 'people' },
  { key: 'Autre', icon: 'heart' },
];

const LABEL_ICONS = { Maison: 'home', Bureau: 'briefcase', Gym: 'fitness', Famille: 'people' };

export default function FavoritesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  // Form state
  const [label, setLabel] = useState('Maison');
  const [customLabel, setCustomLabel] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    usersAPI.getFavorites()
      .then(({ data }) => setFavorites(data.favorites || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  const searchAddress = async (q) => {
    setAddressQuery(q);
    setSelectedAddress(null);
    if (q.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const { data } = await ridesAPI.autocomplete(q, 48.8566, 2.3522);
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const selectSuggestion = (s) => {
    setSelectedAddress(s);
    setAddressQuery(s.description || s.address);
    setSuggestions([]);
  };

  const handleSave = async () => {
    const finalLabel = label === 'Autre' ? customLabel.trim() : label;
    if (!finalLabel) return Alert.alert('Erreur', 'Donne un nom à ce favori');
    if (!selectedAddress) return Alert.alert('Erreur', 'Choisis une adresse');
    setSaving(true);
    try {
      const { data } = await usersAPI.addFavorite({
        label: finalLabel,
        address: selectedAddress.description || selectedAddress.address,
        lat: selectedAddress.lat,
        lng: selectedAddress.lng,
      });
      setFavorites(f => [data.favorite, ...f]);
      closeModal();
    } catch {
      Alert.alert('Erreur', 'Impossible de sauvegarder ce favori');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Alert.alert('Supprimer', 'Supprimer cette adresse favorite ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await usersAPI.deleteFavorite(id).catch(() => {});
        setFavorites(f => f.filter(x => x.id !== id));
      }}
    ]);
  };

  const closeModal = () => {
    setModalVisible(false);
    setLabel('Maison');
    setCustomLabel('');
    setAddressQuery('');
    setSuggestions([]);
    setSelectedAddress(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Favoris</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={64} color={COLORS.gray[300]} />
              <Text style={styles.emptyText}>Aucun favori</Text>
              <Text style={styles.emptySub}>Appuie sur + pour ajouter tes adresses fréquentes</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setModalVisible(true)}>
                <Ionicons name="add" size={18} color={COLORS.white} />
                <Text style={styles.emptyBtnText}>Ajouter un favori</Text>
              </TouchableOpacity>
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
                <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Modal ajout favori */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouveau favori</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color={COLORS.gray[500]} />
              </TouchableOpacity>
            </View>

            {/* Choix du label */}
            <Text style={styles.sectionLabel}>Nom</Text>
            <View style={styles.labelRow}>
              {PRESET_LABELS.map(({ key, icon }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.labelChip, label === key && styles.labelChipActive]}
                  onPress={() => setLabel(key)}
                >
                  <Ionicons name={icon} size={16} color={label === key ? COLORS.white : COLORS.gray[500]} />
                  <Text style={[styles.labelChipText, label === key && styles.labelChipTextActive]}>{key}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {label === 'Autre' && (
              <TextInput
                style={styles.customInput}
                placeholder="Nom personnalisé"
                placeholderTextColor={COLORS.gray[400]}
                value={customLabel}
                onChangeText={setCustomLabel}
              />
            )}

            {/* Recherche adresse */}
            <Text style={styles.sectionLabel}>Adresse</Text>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={COLORS.gray[400]} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher une adresse..."
                placeholderTextColor={COLORS.gray[400]}
                value={addressQuery}
                onChangeText={searchAddress}
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color={COLORS.primary} />}
              {selectedAddress && <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />}
            </View>

            {suggestions.length > 0 && (
              <View style={styles.suggestionsList}>
                {suggestions.slice(0, 4).map((s, i) => (
                  <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => selectSuggestion(s)}>
                    <Ionicons name="location-outline" size={16} color={COLORS.gray[400]} />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {s.description || s.address}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, (!selectedAddress || saving) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!selectedAddress || saving}
            >
              {saving
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.saveBtnText}>Sauvegarder</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  list: { padding: SPACING.md, gap: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: SPACING.md, paddingHorizontal: SPACING.xl },
  emptyText: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.gray[600] },
  emptySub: { color: COLORS.gray[400], textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.md,
  },
  emptyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.medium },
  favCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.md, ...SHADOWS.small,
  },
  favIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  favInfo: { flex: 1 },
  favLabel: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
  favAddress: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  deleteBtn: { padding: SPACING.sm },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.lg, paddingBottom: 40, gap: SPACING.sm,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.gray[200], alignSelf: 'center', marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  sectionLabel: { fontSize: SIZES.small, fontWeight: '600', color: COLORS.gray[500], textTransform: 'uppercase', marginTop: 8 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  labelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.gray[100], borderWidth: 1.5, borderColor: COLORS.gray[200],
  },
  labelChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  labelChipText: { fontSize: SIZES.small, fontWeight: '600', color: COLORS.gray[500] },
  labelChipTextActive: { color: COLORS.white },
  customInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: SIZES.medium, color: COLORS.secondary,
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: SIZES.medium, color: COLORS.secondary },
  suggestionsList: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    backgroundColor: COLORS.white, overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gray[100],
  },
  suggestionText: { flex: 1, fontSize: SIZES.small, color: COLORS.secondary },
  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center', marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.medium },
});
