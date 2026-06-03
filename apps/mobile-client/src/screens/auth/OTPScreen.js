import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar,
  Alert, ActivityIndicator, Keyboard
} from 'react-native';
import { OtpInput } from 'react-native-otp-entry';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../../services/api';
import { useAuthStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS } from '../../utils/theme';
import { getConfirmation, clearConfirmation, setConfirmation } from '../../services/firebaseConfirmation';
import auth from '@react-native-firebase/auth';

export default function OTPScreen({ navigation, route }) {
  const { phone } = route.params;
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [otp, setOtp] = useState('');
  const { login } = useAuthStore();

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVerify = async (code) => {
    const finalCode = code || otp;
    if (finalCode.length !== 6) return;
    Keyboard.dismiss();
    setLoading(true);

    try {
      const confirmation = getConfirmation();
      if (!confirmation) {
        Alert.alert('Erreur', 'Session expirée. Veuillez recommencer.');
        navigation.goBack();
        return;
      }

      // 1. Confirmer le code OTP auprès de Firebase
      const credential = await confirmation.confirm(finalCode);

      // 2. Récupérer l'ID token Firebase (valable 1h, signé par Google)
      const idToken = await credential.user.getIdToken();

      // 3. Envoyer l'ID token à notre backend qui le vérifie et émet nos JWT
      const { data } = await authAPI.verifyFirebaseToken(idToken);

      if (data.success) {
        clearConfirmation();
        await login(data.accessToken, data.refreshToken, data.user);
      }
    } catch (err) {
      console.error('[OTPScreen] Error:', err.code, err.message);
      const msg =
        err.code === 'auth/invalid-verification-code' ? 'Code incorrect. Vérifiez et réessayez.' :
        err.code === 'auth/code-expired'              ? 'Code expiré. Demandez un nouveau code.' :
        err.code === 'auth/too-many-requests'         ? 'Trop de tentatives. Réessayez plus tard.' :
        err.response?.data?.message                  || 'Une erreur est survenue.';
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const confirmation = await auth().signInWithPhoneNumber(phone);
      setConfirmation(confirmation);
      setCountdown(60);
      Alert.alert('Code renvoyé', 'Un nouveau code a été envoyé.');
    } catch (err) {
      const msg =
        err.code === 'auth/too-many-requests' ? 'Trop de tentatives. Attendez quelques minutes.' :
        'Impossible de renvoyer le code.';
      Alert.alert('Erreur', msg);
    } finally {
      setResending(false);
    }
  };

  const maskedPhone = phone.replace(/(\+\d{3})(\d{2})(\d+)(\d{2})/, '$1 $2 *** ** $4');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="chatbubble-ellipses" size={36} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Code de vérification</Text>
        <Text style={styles.subtitle}>
          Entrez le code à 6 chiffres envoyé au{'\n'}
          <Text style={styles.phone}>{maskedPhone}</Text>
        </Text>

        <OtpInput
          numberOfDigits={6}
          focusColor={COLORS.primary}
          onTextChange={setOtp}
          onFilled={handleVerify}
          theme={{
            containerStyle:      styles.otpContainer,
            inputsContainerStyle:styles.otpInputsContainer,
            pinCodeContainerStyle:styles.otpBox,
            pinCodeTextStyle:    styles.otpText,
            focusStickStyle:     { backgroundColor: COLORS.primary },
          }}
        />

        <TouchableOpacity
          style={[styles.verifyBtn, (loading || otp.length < 6) && styles.btnDisabled]}
          onPress={() => handleVerify(otp)}
          disabled={loading || otp.length < 6}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={COLORS.white} />
            : <Text style={styles.verifyBtnText}>Vérifier</Text>
          }
        </TouchableOpacity>

        <View style={styles.resendRow}>
          {countdown > 0 ? (
            <Text style={styles.countdownText}>
              Renvoyer dans <Text style={styles.countdown}>{countdown}s</Text>
            </Text>
          ) : (
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              <Text style={styles.resendLink}>
                {resending ? 'Envoi...' : 'Renvoyer le code'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.white },
  back:         { padding: SPACING.md, marginTop: 40 },
  content:      { flex: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  iconBox:      {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title:        { fontSize: 28, fontWeight: '800', color: COLORS.secondary, marginBottom: 8 },
  subtitle:     { fontSize: SIZES.medium, color: COLORS.gray[600], lineHeight: 24, marginBottom: SPACING.xl },
  phone:        { fontWeight: '700', color: COLORS.secondary },
  otpContainer: { marginBottom: SPACING.xl },
  otpInputsContainer: { gap: SPACING.sm },
  otpBox:       { borderWidth: 2, borderColor: COLORS.gray[300], borderRadius: RADIUS.md, width: 48, height: 56 },
  otpText:      { fontSize: 24, fontWeight: '700', color: COLORS.secondary },
  verifyBtn:    {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  btnDisabled:  { opacity: 0.5 },
  verifyBtnText:{ color: COLORS.white, fontSize: 18, fontWeight: '700' },
  resendRow:    { alignItems: 'center' },
  countdownText:{ color: COLORS.gray[500], fontSize: SIZES.medium },
  countdown:    { fontWeight: '700', color: COLORS.secondary },
  resendLink:   { color: COLORS.primary, fontSize: SIZES.medium, fontWeight: '600' },
});
