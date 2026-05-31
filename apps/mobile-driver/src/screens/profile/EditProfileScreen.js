import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDriverAuthStore } from '../../store';
import { authAPI } from '../../services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../utils/theme';

export default function EditProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { driver, updateDriver } = useDriverAuthStore();

  const [firstName, setFirstName] = useState(driver?.firstName || '');
  const [lastName, setLastName] = useState(driver?.lastName || '');
  const [email, setEmail] = useState(driver?.email || '');
  const [saving, setSaving] = useState(false);

  const hasChanges =
    firstName.trim() !== (driver?.firstName || '') ||
    lastName.trim() !== (driver?.lastName || '') ||
    email.trim() !== (driver?.email || '');

  const handleSave = async () => {
    if (!firstName.trim()) {
      return Alert.alert('Champ requis', 'Le prénom est obligatoire.');
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return Alert.alert('Email invalide', 'Vérifie le format de l\'adresse email.');
    }

    setSaving(true);
    try {
      const { data } = await authAPI.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
      });
      updateDriver({
        ...driver,
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
      });
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
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Modifier le profil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!hasChanges || saving}
            style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          >
            {saving
              ? <ActivityIndicator size="small" color={COLORS.bg} />
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
                {firstName?.[0]?.toUpperCase() || driver?.phone?.[3] || 'C'}
              </Text>
            </View>
            <Text style={styles.avatarHint}>{driver?.phone}</Text>
          </View>

          {/* Champs */}
          <View style={styles.form}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>PRÉNOM *</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSub} />
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Ton prénom"
                  placeholderTextColor={COLORS.textSub}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NOM</Text>
              <View style={styles.inputRow}>
                <Ionicons name="person-outline" size={18} color={COLORS.textSub} />
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Ton nom de famille"
                  placeholderTextColor={COLORS.textSub}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ADRESSE EMAIL</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color={COLORS.textSub} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ton@email.com"
                  placeholderTextColor={COLORS.textSub}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                {email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                )}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NUMÉRO DE TÉLÉPHONE</Text>
              <View style={[styles.inputRow, styles.inputRowDisabled]}>
                <Ionicons name="call-outline" size={18} color={COLORS.textSub} />
                <Text style={styles.inputDisabled}>{driver?.phone}</Text>
                <Ionicons name="lock-closed-outline" size={14} color={COLORS.textSub} />
              </View>
              <Text style={styles.fieldHint}>Le numéro de téléphone ne peut pas être modifié.</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBottomBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving
              ? <ActivityIndicator color={COLORS.bg} />
              : <Text style={styles.saveBottomBtnText}>Enregistrer les modifications</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    backgroundColor: COLORS.bgCard, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: RADIUS.md,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 13 },

  content: { padding: SPACING.md, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: 28 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: COLORS.bg },
  avatarHint: { fontSize: 13, color: COLORS.textSub },

  form: { gap: SPACING.md },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textSub, letterSpacing: 0.5 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.bgInput, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputRowDisabled: { opacity: 0.5 },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  inputDisabled: { flex: 1, fontSize: 15, color: COLORS.textSub },
  fieldHint: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },

  saveBottomBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    paddingVertical: 16, alignItems: 'center', marginTop: 28,
    ...SHADOW.green,
  },
  saveBottomBtnText: { color: COLORS.bg, fontWeight: '800', fontSize: 15 },
});
