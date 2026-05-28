import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Dimensions, Image
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

export default function WelcomeScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />

      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Ionicons name="bicycle" size={44} color="#3B82F6" />
          </View>
        </View>
        <Text style={styles.appName}>Shifter</Text>
        <Text style={styles.tagline}>Your moto-taxi, instantly</Text>

        <View style={styles.features}>
          {[
            { icon: 'flash', label: 'Fast' },
            { icon: 'shield-checkmark', label: 'Safe' },
            { icon: 'wallet', label: 'Affordable' },
          ].map((f) => (
            <View key={f.label} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={22} color="#3B82F6" />
              </View>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>Get started</Text>
        <Text style={styles.sheetSub}>Fast, reliable moto-taxi rides in your city</Text>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Phone')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Continue with phone</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.socialBtn}>
          <Ionicons name="logo-apple" size={20} color="#111827" />
          <Text style={styles.socialBtnText}>Continue with Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.socialBtn}>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.socialBtnText}>Continue with Google</Text>
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing, you agree to our{' '}
          <Text style={styles.link}>Terms</Text> and{' '}
          <Text style={styles.link}>Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  logoWrap: { marginBottom: 20 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#3B82F6',
  },
  appName: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 8 },
  tagline: { fontSize: 16, color: '#94A3B8', marginBottom: 48 },
  features: { flexDirection: 'row', gap: 28 },
  feature: { alignItems: 'center', gap: 8 },
  featureIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center',
  },
  featureLabel: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40,
  },
  sheetTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 8 },
  sheetSub: { fontSize: 15, color: '#6B7280', marginBottom: 28, lineHeight: 22 },
  primaryBtn: {
    backgroundColor: '#3B82F6', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    paddingVertical: 15, marginBottom: 12,
  },
  socialBtnText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  googleG: { fontSize: 18, fontWeight: '900', color: '#4285F4' },
  terms: { textAlign: 'center', fontSize: 12, color: '#9CA3AF', lineHeight: 18, marginTop: 8 },
  link: { color: '#3B82F6', fontWeight: '600' },
});
