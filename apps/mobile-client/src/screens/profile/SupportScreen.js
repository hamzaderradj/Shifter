import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usersAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

export default function SupportScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!subject || !message) return Alert.alert('Champs requis', 'Remplissez le sujet et le message.');
    setLoading(true);
    try {
      await usersAPI.submitSupport({ subject, message });
      Alert.alert('Message envoyé', 'Notre équipe vous répondra dans les 24h.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer le message.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Support</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.info}>
          <Ionicons name="chatbubbles" size={32} color={COLORS.primary} />
          <Text style={styles.infoTitle}>Contactez-nous</Text>
          <Text style={styles.infoSub}>Notre équipe répond sous 24h</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Sujet</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Problème avec une course"
            placeholderTextColor={COLORS.gray[400]}
            value={subject}
            onChangeText={setSubject}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            placeholder="Décrivez votre problème..."
            placeholderTextColor={COLORS.gray[400]}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.submitBtnText}>Envoyer</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, ...SHADOWS.small,
  },
  title: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  content: { flex: 1, padding: SPACING.md },
  info: { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xl, paddingVertical: SPACING.lg },
  infoTitle: { fontSize: SIZES.xxLarge, fontWeight: '800', color: COLORS.secondary },
  infoSub: { color: COLORS.gray[500] },
  field: { marginBottom: SPACING.md },
  label: { fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[600], marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: SIZES.medium, color: COLORS.secondary,
  },
  messageInput: { height: 140 },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
