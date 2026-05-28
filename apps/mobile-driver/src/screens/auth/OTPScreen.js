import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { OtpInput } from 'react-native-otp-entry';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS } from '../../utils/theme';

export default function OTPScreen({ navigation, route }) {
  const { phone } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const { login } = useAuthStore();

  useEffect(() => {
    const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  const handleVerify = async (code) => {
    if ((code || otp).length !== 6) return;
    setLoading(true);
    try {
      const { data } = await authAPI.verifyOtp(phone, code || otp);
      if (data.success) await login(data.accessToken, data.refreshToken, data.user);
    } catch (err) {
      Alert.alert('Code incorrect', err.response?.data?.message || 'Vérifiez le code.');
    } finally { setLoading(false); }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
      </TouchableOpacity>
      <View style={styles.content}>
        <Text style={styles.title}>Code de vérification</Text>
        <Text style={styles.sub}>Envoyé au {phone}</Text>
        <OtpInput numberOfDigits={6} focusColor={COLORS.primary} onTextChange={setOtp} onFilled={handleVerify} theme={{ containerStyle: { marginBottom: SPACING.xl }, pinCodeContainerStyle: { borderWidth: 2, borderColor: COLORS.gray[300], borderRadius: RADIUS.md, width: 48, height: 56 }, pinCodeTextStyle: { fontSize: 24, fontWeight: '700', color: COLORS.secondary } }} />
        <TouchableOpacity style={[styles.btn, (loading || otp.length < 6) && styles.btnDisabled]} onPress={() => handleVerify(otp)} disabled={loading || otp.length < 6}>
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.btnText}>Vérifier</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  back: { padding: SPACING.md, marginTop: 40 },
  content: { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.secondary, marginBottom: 8 },
  sub: { fontSize: SIZES.medium, color: COLORS.gray[600], marginBottom: SPACING.xl },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, height: 56, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
