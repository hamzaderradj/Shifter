import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS } from '../../utils/theme';

const COUNTRY_CODE = '+221';

export default function PhoneScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const fullPhone = `${COUNTRY_CODE}${phone.replace(/\s/g, '')}`;

  const handleSend = async () => {
    if (phone.replace(/\s/g, '').length < 7) return Alert.alert('Numéro invalide', 'Saisissez un numéro valide.');
    setLoading(true);
    try {
      await authAPI.sendOtp(fullPhone);
      navigation.navigate('OTP', { phone: fullPhone });
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.message || 'Impossible d\'envoyer le code.');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
      </TouchableOpacity>
      <View style={styles.content}>
        <Text style={styles.title}>Votre numéro</Text>
        <Text style={styles.subtitle}>Nous enverrons un code de vérification par SMS.</Text>
        <View style={styles.inputRow}>
          <View style={styles.flag}><Text style={styles.flagCode}>{COUNTRY_CODE}</Text></View>
          <TextInput style={styles.input} placeholder="77 000 00 00" placeholderTextColor={COLORS.gray[400]} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={12} autoFocus />
        </View>
        <Text style={styles.hint}>En développement, code: <Text style={styles.hintBold}>123456</Text></Text>
        <TouchableOpacity style={[styles.btn, (!phone || loading) && styles.btnDisabled]} onPress={handleSend} disabled={!phone || loading}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.btnText}>Recevoir le code →</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  back: { padding: SPACING.md, marginTop: 40 },
  content: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.secondary, marginBottom: 8 },
  subtitle: { fontSize: SIZES.medium, color: COLORS.gray[600], lineHeight: 22, marginBottom: SPACING.xl },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: COLORS.gray[200], borderRadius: RADIUS.md, marginBottom: SPACING.sm, overflow: 'hidden' },
  flag: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, backgroundColor: COLORS.gray[100], borderRightWidth: 1, borderRightColor: COLORS.gray[200] },
  flagCode: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },
  input: { flex: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, fontSize: 18, color: COLORS.secondary, letterSpacing: 2 },
  hint: { fontSize: 13, color: COLORS.gray[500], marginBottom: SPACING.xl },
  hintBold: { fontWeight: '700', color: COLORS.primary },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, height: 56, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
