import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, RADIUS } from '../../utils/theme';

const API_URL = 'https://shifter-bmbf.onrender.com';

export default function DriverPhoneScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const mode = route.params?.mode || 'login'; // 'login' | 'register'
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhone = (text) => {
    const clean = text.replace(/\D/g, '').slice(0, 10);
    const parts = clean.match(/.{1,2}/g) || [];
    setPhone(parts.join(' '));
    setError('');
  };

  const handleSend = async () => {
    const raw = phone.replace(/\s/g, '');
    if (raw.length < 9) return;
    setLoading(true);
    try {
      // Supprimer le 0 initial si présent (06xxx → +336xxx)
      const normalized = raw.startsWith('0') ? raw.slice(1) : raw;
      const fullPhone = '+33' + normalized;
      await fetch(`${API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, role: 'driver' }),
      });
      navigation.navigate('OTP', { phone: fullPhone, mode });
    } catch {
      setError("Erreur réseau. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.replace(/\s/g, '').length >= 9;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="phone-portrait-outline" size={30} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>
            {mode === 'register' ? 'Inscription\nchauffeur' : 'Connexion\nchauffeur'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'register'
              ? 'Entre ton numéro pour créer ton compte Shifter Rider'
              : 'Entre ton numéro pour te connecter à ton compte'}
          </Text>

          <View style={styles.inputRow}>
            <View style={styles.countryBox}>
              <Text style={styles.flag}>🇫🇷</Text>
              <Text style={styles.code}>+33</Text>
            </View>
            <TextInput
              style={[styles.phoneInput, error ? styles.phoneInputError : null]}
              value={phone}
              onChangeText={formatPhone}
              keyboardType="phone-pad"
              placeholder="6 00 00 00 00"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
          </View>

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, !isValid && styles.btnDisabled]}
            onPress={handleSend}
            disabled={loading || !isValid}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <>
                <Text style={styles.btnText}>Recevoir le code</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.bg} />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.terms}>
            En continuant, tu acceptes nos{' '}
            <Text style={styles.link}>Conditions d'utilisation</Text>
            {' '}et notre{' '}
            <Text style={styles.link}>Politique de confidentialité</Text>.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  back: {
    width: 40, height: 40, justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  iconWrap: {
    width: 60, height: 60, borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(46,204,113,0.12)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(46,204,113,0.25)',
  },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text, lineHeight: 38, marginBottom: 10 },
  subtitle: { fontSize: 14, color: COLORS.textSub, marginBottom: 32, lineHeight: 20 },

  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  countryBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  flag: { fontSize: 18 },
  code: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  phoneInput: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: COLORS.text,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  phoneInputError: { borderColor: COLORS.danger },
  errorText: { fontSize: 13, color: COLORS.danger, marginBottom: 12 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, paddingVertical: 17,
    marginTop: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  btnDisabled: { backgroundColor: 'rgba(46,204,113,0.3)', shadowOpacity: 0 },
  btnText: { color: COLORS.bg, fontSize: 16, fontWeight: '800' },

  terms: {
    textAlign: 'center', fontSize: 11, color: COLORS.textMuted,
    marginTop: 20, lineHeight: 17,
  },
  link: { color: COLORS.textSub, fontWeight: '600' },
});
