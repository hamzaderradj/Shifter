import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, SIZES, RADIUS } from '../../utils/theme';

const { width, height } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <LinearGradient
        colors={[COLORS.secondary, '#1A2744', COLORS.secondary]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Logo & Branding */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="bicycle" size={60} color={COLORS.primary} />
        </View>
        <Text style={styles.appName}>TaxaMoto</Text>
        <Text style={styles.tagline}>Votre moto-taxi en quelques secondes</Text>
      </View>

      {/* Features */}
      <View style={styles.features}>
        {[
          { icon: 'flash', text: 'Rapide & fiable', sub: 'Chauffeur en moins de 5 min' },
          { icon: 'shield-checkmark', text: 'Sécurisé', sub: 'Chauffeurs vérifiés' },
          { icon: 'cash', text: 'Prix transparent', sub: 'Estimation avant la course' },
        ].map((f, i) => (
          <View key={i} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={22} color={COLORS.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.text}</Text>
              <Text style={styles.featureSub}>{f.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('Phone')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Commencer</Text>
          <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.terms}>
          En continuant, vous acceptez nos{' '}
          <Text style={styles.termsLink}>Conditions d'utilisation</Text>
          {' '}et notre{' '}
          <Text style={styles.termsLink}>Politique de confidentialité</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  header: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  logoContainer: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,107,53,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 2, borderColor: 'rgba(255,107,53,0.3)',
  },
  appName: {
    fontSize: 42, fontWeight: '800', color: COLORS.white,
    letterSpacing: -1, marginBottom: 8,
  },
  tagline: { fontSize: 16, color: COLORS.gray[400], textAlign: 'center' },
  features: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  feature: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  featureIcon: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitle: { color: COLORS.white, fontSize: SIZES.large, fontWeight: '600' },
  featureSub: { color: COLORS.gray[400], fontSize: SIZES.small, marginTop: 2 },
  footer: { padding: SPACING.xl, gap: SPACING.md },
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.sm,
  },
  primaryBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  terms: { textAlign: 'center', color: COLORS.gray[500], fontSize: 12, lineHeight: 18 },
  termsLink: { color: COLORS.primary, fontWeight: '600' },
});
