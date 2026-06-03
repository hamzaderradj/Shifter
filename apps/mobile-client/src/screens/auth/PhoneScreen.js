import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, SafeAreaView, StatusBar,
  ActivityIndicator, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import auth from '@react-native-firebase/auth';
import { setConfirmation } from '../../services/firebaseConfirmation';

export default function PhoneScreen() {
  const navigation = useNavigation();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const formatPhone = (text) => {
    const clean = text.replace(/\D/g, '').slice(0, 10);
    const parts = clean.match(/.{1,2}/g) || [];
    setPhone(parts.join(' '));
  };

  const handleSend = async () => {
    const raw = phone.replace(/\s/g, '');
    if (raw.length < 9) return;
    setLoading(true);
    try {
      const normalized = raw.startsWith('0') ? raw.slice(1) : raw;
      const fullPhone = '+33' + normalized;

      // Firebase envoie le SMS directement — plus besoin de passer par notre backend
      const confirmation = await auth().signInWithPhoneNumber(fullPhone);
      setConfirmation(confirmation);
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (err) {
      console.error('[PhoneScreen] Firebase error:', err.code, err.message);
      const msg =
        err.code === 'auth/invalid-phone-number'   ? 'Numéro de téléphone invalide.' :
        err.code === 'auth/too-many-requests'       ? 'Trop de tentatives. Réessayez plus tard.' :
        err.code === 'auth/quota-exceeded'          ? 'Quota SMS dépassé. Réessayez demain.' :
        "Impossible d'envoyer le code. Vérifiez votre numéro.";
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.replace(/\s/g, '').length >= 9;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Enter your{'\n'}number</Text>
          <Text style={styles.subtitle}>We'll send you a verification code</Text>

          <View style={styles.inputRow}>
            <View style={styles.countryBox}>
              <Text style={styles.flag}>🇫🇷</Text>
              <Text style={styles.code}>+33</Text>
              <Ionicons name="chevron-down" size={14} color="#6B7280" />
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={formatPhone}
              keyboardType="phone-pad"
              placeholder="06 00 00 00 00"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, !isValid && styles.btnDisabled]}
            onPress={handleSend}
            disabled={loading || !isValid}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>OR</Text>
            <View style={styles.line} />
          </View>

          {[
            { icon: 'logo-apple',    label: 'Continue with Apple',    color: '#111827' },
            { icon: 'logo-google',   label: 'Continue with Google',   color: '#4285F4' },
            { icon: 'logo-facebook', label: 'Continue with Facebook', color: '#1877F2' },
          ].map((s) => (
            <TouchableOpacity key={s.label} style={styles.social}>
              <Ionicons name={s.icon} size={20} color={s.color} />
              <Text style={styles.socialText}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.terms}>
          By signing up, you agree to our{' '}
          <Text style={styles.link}>Terms & Conditions</Text> and{' '}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fff' },
  inner:       { flex: 1 },
  header:      { paddingHorizontal: 20, paddingTop: 12 },
  back:        { width: 40, height: 40, justifyContent: 'center' },
  content:     { flex: 1, paddingHorizontal: 24, paddingTop: 28 },
  title:       { fontSize: 32, fontWeight: '800', color: '#111827', lineHeight: 42, marginBottom: 8 },
  subtitle:    { fontSize: 15, color: '#6B7280', marginBottom: 32 },
  inputRow:    { flexDirection: 'row', gap: 10, marginBottom: 20 },
  countryBox:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F9FAFB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 15,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  flag:        { fontSize: 20 },
  code:        { fontSize: 15, fontWeight: '700', color: '#111827' },
  phoneInput:  {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: '#111827',
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  btn:         { backgroundColor: '#3B82F6', borderRadius: 14, paddingVertical: 17, alignItems: 'center', marginBottom: 28 },
  btnDisabled: { backgroundColor: '#BFDBFE' },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  divider:     { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  line:        { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  or:          { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  social:      {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 20, marginBottom: 12,
  },
  socialText:  { fontSize: 15, fontWeight: '600', color: '#111827' },
  terms:       { textAlign: 'center', fontSize: 12, color: '#9CA3AF', paddingHorizontal: 24, paddingBottom: 24, lineHeight: 18 },
  link:        { color: '#3B82F6', fontWeight: '600' },
});
