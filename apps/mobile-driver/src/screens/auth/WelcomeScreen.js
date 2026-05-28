import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../utils/theme';

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[COLORS.secondary, '#1A2744']} style={StyleSheet.absoluteFillObject} />

      <View style={styles.content}>
        <View style={styles.logo}>
          <Ionicons name="bicycle" size={60} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>TaxaMoto</Text>
        <Text style={styles.subtitle}>Espace Chauffeur</Text>
        <Text style={styles.desc}>Rejoignez notre flotte de moto-taxis et gagnez en toute liberté</Text>

        <View style={styles.benefits}>
          {['Soyez votre propre patron', 'Gains instantanés', 'Support 24/7'].map(b => (
            <View key={b} style={styles.benefit}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Phone')} activeOpacity={0.85}>
          <Text style={styles.btnText}>Démarrer</Text>
          <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  logo: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md, borderWidth: 2, borderColor: 'rgba(255,107,53,0.3)' },
  title: { fontSize: 40, fontWeight: '800', color: COLORS.white, letterSpacing: -1 },
  subtitle: { fontSize: 18, color: COLORS.primary, fontWeight: '600', marginBottom: SPACING.md },
  desc: { fontSize: 15, color: COLORS.gray[400], textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  benefits: { gap: SPACING.sm, width: '100%' },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  benefitText: { color: COLORS.white, fontSize: 15, fontWeight: '500' },
  footer: { padding: SPACING.xl },
  btn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  btnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
