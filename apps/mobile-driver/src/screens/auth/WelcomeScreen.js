import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Dimensions, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, RADIUS } from '../../utils/theme';

const { height } = Dimensions.get('window');

export default function DriverWelcomeScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Top decoration */}
      <View style={styles.topDecor}>
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />
      </View>

      {/* Logo + Brand */}
      <View style={styles.brand}>
        <View style={styles.logoWrap}>
          <Ionicons name="bicycle" size={44} color={COLORS.primary} />
        </View>
        <Text style={styles.logoText}>Shifter</Text>
        <Text style={styles.logoSub}>RIDER</Text>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>Chauffeur professionnel</Text>
          </View>
        </View>
      </View>

      {/* Illustration zone */}
      <View style={styles.illustrationZone}>
        <View style={styles.featCard}>
          <Ionicons name="cash-outline" size={22} color={COLORS.primary} />
          <View style={styles.featText}>
            <Text style={styles.featTitle}>Gagnez plus</Text>
            <Text style={styles.featSub}>Revenus transparents, virements hebdomadaires</Text>
          </View>
        </View>
        <View style={styles.featCard}>
          <Ionicons name="time-outline" size={22} color={COLORS.accent} />
          <View style={styles.featText}>
            <Text style={styles.featTitle}>Horaires flexibles</Text>
            <Text style={styles.featSub}>Travaillez quand vous voulez, où vous voulez</Text>
          </View>
        </View>
        <View style={styles.featCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.textSub} />
          <View style={styles.featText}>
            <Text style={styles.featTitle}>Support 24h/24</Text>
            <Text style={styles.featSub}>Une équipe dédiée à votre réussite</Text>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('Phone')}
          activeOpacity={0.88}
        >
          <Text style={styles.btnPrimaryText}>Commencer maintenant</Text>
          <Ionicons name="arrow-forward" size={20} color={COLORS.bg} />
        </TouchableOpacity>

        <Text style={styles.legal}>
          En continuant, tu acceptes nos{' '}
          <Text style={styles.legalLink}>Conditions d'utilisation</Text>
          {' '}et notre{' '}
          <Text style={styles.legalLink}>Politique de confidentialité</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  topDecor: { position: 'absolute', top: -60, right: -60 },
  decCircle1: {
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(46,204,113,0.06)',
  },
  decCircle2: {
    position: 'absolute', top: 40, right: 40,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(46,204,113,0.04)',
  },

  brand: { alignItems: 'center', paddingTop: 60, paddingBottom: 32 },
  logoWrap: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: 'rgba(46,204,113,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5, borderColor: 'rgba(46,204,113,0.3)',
  },
  logoText: { fontSize: 36, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  logoSub: {
    fontSize: 13, fontWeight: '800', color: COLORS.primary,
    letterSpacing: 6, marginTop: -4, marginBottom: 14,
  },
  tagRow: { flexDirection: 'row' },
  tag: {
    backgroundColor: 'rgba(46,204,113,0.12)', borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.25)',
  },
  tagText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  illustrationZone: { paddingHorizontal: 20, gap: 10, flex: 1 },
  featCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  featText: { flex: 1 },
  featTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  featSub: { fontSize: 12, color: COLORS.textSub },

  bottom: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  btnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl, paddingVertical: 17,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  btnPrimaryText: { fontSize: 17, fontWeight: '800', color: COLORS.bg },

  legal: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', lineHeight: 17 },
  legalLink: { color: COLORS.textSub, fontWeight: '600' },
});
