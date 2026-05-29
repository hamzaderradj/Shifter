import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { useDriverAuthStore } from '../../store';
import { authAPI, driverAPI } from '../../services/api';
import { COLORS, RADIUS } from '../../utils/theme';

const CODE_LENGTH = 6;

export default function DriverOTPScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { phone } = route.params || {};
  const { login } = useDriverAuthStore();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const inputs = useRef([]);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((v) => v - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  const handleChange = (text, idx) => {
    const val = text.replace(/\D/g, '');
    const newCode = [...code];
    newCode[idx] = val;
    setCode(newCode);
    setError('');
    if (val && idx < CODE_LENGTH - 1) inputs.current[idx + 1]?.focus();
    if (newCode.every((c) => c !== '')) verify(newCode.join(''));
  };

  const handleKeyPress = (e, idx) => {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const verify = async (fullCode) => {
    setLoading(true);
    try {
      // 1. Vérifier le code OTP
      const { data } = await authAPI.verifyOtp(phone, fullCode);
      if (!data.success) throw new Error(data.message || 'Code invalide');

      // 2. Stocker les tokens dans SecureStore
      await SecureStore.setItemAsync('driver_access_token', data.accessToken);
      await SecureStore.setItemAsync('driver_refresh_token', data.refreshToken);

      // 3. Récupérer le profil chauffeur s'il existe
      let driver = null;
      try {
        const driverRes = await driverAPI.getMe();
        driver = driverRes.data.driver;
      } catch {
        // Pas encore de profil chauffeur — on ira sur Registration
      }

      // 4. Mettre à jour le store (isAuthenticated → true → AppStack s'affiche)
      login({ user: data.user, driver, token: data.accessToken, refreshToken: data.refreshToken });

    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Code invalide. Réessaie.');
      setCode(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendTimer > 0) return;
    try {
      await authAPI.sendOtp(phone);
      setResendTimer(30);
      setError('');
    } catch {}
  };

  const phoneDisplay = phone ? phone.replace('+33', '0') : '';

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
            <Ionicons name="lock-closed-outline" size={30} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Code de vérification</Text>
          <Text style={styles.subtitle}>
            Saisis le code envoyé au{'\n'}
            <Text style={styles.phoneNum}>{phoneDisplay}</Text>
          </Text>

          {/* OTP inputs */}
          <View style={styles.codeRow}>
            {code.map((digit, i) => (
              <TextInput
                key={i}
                ref={(r) => (inputs.current[i] = r)}
                style={[
                  styles.codeInput,
                  digit ? styles.codeInputFilled : null,
                  error ? styles.codeInputError : null,
                ]}
                value={digit}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                autoFocus={i === 0}
                selectTextOnFocus
              />
            ))}
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={15} color={COLORS.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.loadingText}>Vérification…</Text>
            </View>
          )}

          {/* Resend */}
          <TouchableOpacity
            style={[styles.resendBtn, resendTimer > 0 && styles.resendBtnDisabled]}
            onPress={resend}
            disabled={resendTimer > 0}
          >
            <Text style={[styles.resendText, resendTimer > 0 && { color: COLORS.textMuted }]}>
              {resendTimer > 0 ? `Renvoyer le code (${resendTimer}s)` : 'Renvoyer le code'}
            </Text>
          </TouchableOpacity>
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
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  subtitle: { fontSize: 14, color: COLORS.textSub, marginBottom: 36, lineHeight: 22 },
  phoneNum: { color: COLORS.primary, fontWeight: '700' },

  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  codeInput: {
    flex: 1, height: 58, borderRadius: RADIUS.md, textAlign: 'center',
    fontSize: 22, fontWeight: '800', color: COLORS.text,
    backgroundColor: COLORS.bgCard, borderWidth: 1.5, borderColor: COLORS.border,
  },
  codeInputFilled: { borderColor: COLORS.primary, backgroundColor: 'rgba(46,204,113,0.08)' },
  codeInputError: { borderColor: COLORS.danger },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  errorText: { fontSize: 13, color: COLORS.danger, fontWeight: '500' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  loadingText: { fontSize: 14, color: COLORS.textSub },

  resendBtn: { alignItems: 'center', paddingVertical: 12 },
  resendBtnDisabled: {},
  resendText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
});
