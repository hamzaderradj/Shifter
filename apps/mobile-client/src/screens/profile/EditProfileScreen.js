import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { authAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

export default function EditProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const hasChanges =
    firstName.trim() !== (user?.firstName || '') ||
    lastName.trim() !== (user?.lastName || '') ||
    email.trim() !== (user?.email || '');

  const handleSave = async () => {
    if (!firstName.trim()) {
      return Alert.alert('Champ requis', 'Le prénom est obligatoire.');
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return Alert.alert('Email invalide', 'Vérifie le format de ton adresse email.');
    }

    setSaving(true);
    try {
      const { data } = await authAPI.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      });
      updateUser(data.user);
      Alert.alert('✅ Profil mis à jour', 'Tes informations ont été sauvegardées.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      const msg = err.response?.data?.message || 'Impossible de sauvegarder.';
      Alert.alert('Erreur', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.secondary} />
          </TouchableOpacity>
          <Text style={styles.title}>Modifier le profil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!hasChanges || saving}
            style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          >
            {saving
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Text style={styles.saveBtnText}>Enregistrer</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {firstName?.[0]?.toUpperCase() || user?.phone?.[3] || 'U'}
              </Text>
            </View>
            <Text style={styles.avatarHint}>
              {user?.phone}
            </Text>
          </View>

          {/* Champs */}
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PRÉNOM *</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={COLORS.gray[400]} />
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Ton prénom"
                  placeholderTextColor={COLORS.gray[400]}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NOM</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={COLORS.gray[400]} />
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Ton nom de famille"
                  placeholderTextColor={COLORS.gray[400]}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ADRESSE EMAIL</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={COLORS.gray[400]} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ton@email.com"
                  placeholderTextColor={COLORS.gray[400]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                {email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                )}
              </View>
            </View>

            {/* Info téléphone non modifiable */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NUMÉRO DE TÉLÉPHONE</Text>
              <View style={[styles.inputRow, styles.inputRowDisabled]}>
                <Ionicons name="call-outline" size={18} color={COLORS.gray[300]} />
                <Text style={styles.inputDisabled}>{user?.phone}</Text>
                <Ionicons name="lock-closed-outline" size={14} color={COLORS.gray[300]} />
              </View>
              <Text style={styles.fieldHint}>Le numéro de téléphone ne peut pas être modifié.</Text>
            </View>
          </View>

          {/* Bouton save bas */}
          <TouchableOpacity
            style={[styles.saveBottomBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.saveBottomBtnText}>Enregistrer les modifications</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    backgroundColor: COLORS.white, ...SHADOWS.small,
  },
  backBtn: { padding: 4 },
  title: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },
  saveBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: RADIUS.md,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.small },

  content: { padding: SPACING.md, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: SPACING.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  avatarHint: { fontSize: SIZES.small, color: COLORS.gray[500] },

  form: { gap: SPACING.md },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.gray[400],
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderWidth: 1.5, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  inputRowDisabled: { backgroundColor: COLORS.gray[50], borderColor: COLORS.gray[100] },
  input: { flex: 1, fontSize: SIZES.medium, color: COLORS.secondary },
  inputDisabled: { flex: 1, fontSize: SIZES.medium, color: COLORS.gray[400] },
  fieldHint: { fontSize: 11, color: COLORS.gray[400], marginTop: 2 },

  saveBottomBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingVertical: 16, alignItems: 'center', marginTop: SPACING.xl,
    ...SHADOWS.medium,
  },
  saveBottomBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.medium },
});
