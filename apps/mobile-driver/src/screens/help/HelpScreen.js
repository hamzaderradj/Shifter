import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, ScrollView, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../utils/theme';

const FAQ = [
  { q: 'Comment recevoir mes paiements ?', a: 'Les virements sont effectués chaque lundi sur ton compte bancaire enregistré. Tu peux consulter l\'historique dans la section Revenus.' },
  { q: 'Que faire si un client ne se présente pas ?', a: 'Si le client ne se présente pas dans les 5 minutes après ton arrivée au point de prise en charge, tu peux annuler la course sans pénalité.' },
  { q: 'Comment améliorer ma note ?', a: 'Sois ponctuel, maintiens ton véhicule propre et sois courtois. Les clients peuvent laisser une note après chaque course.' },
  { q: 'Mon compte est suspendu, que faire ?', a: 'Contacte notre support par e-mail ou téléphone. Un agent te répondra sous 24h ouvrées pour étudier ta situation.' },
  { q: 'Comment modifier mes informations ?', a: 'Va dans Profil → Modifier le profil. Pour les documents officiels, envoie une demande au support.' },
];

export default function HelpScreen() {
  const [openFaq, setOpenFaq] = useState(null);

  const soon = () => Alert.alert('Support', 'Fonctionnalité disponible dans la prochaine version.', [{ text: 'OK' }]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        <View style={styles.header}>
          <Text style={styles.title}>Aide</Text>
          <Text style={styles.subtitle}>Comment pouvons-nous t'aider ?</Text>
        </View>

        {/* Contact options */}
        <View style={styles.contactRow}>
          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => Linking.openURL('tel:+33800000000')}
            activeOpacity={0.8}
          >
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(46,204,113,0.15)' }]}>
              <Ionicons name="call" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.contactLabel}>Appeler</Text>
            <Text style={styles.contactSub}>08 00 00 00 00</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.contactCard}
            onPress={() => Linking.openURL('mailto:support@shifterapp.fr')}
            activeOpacity={0.8}
          >
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(243,156,18,0.15)' }]}>
              <Ionicons name="mail" size={24} color={COLORS.accent} />
            </View>
            <Text style={styles.contactLabel}>E-mail</Text>
            <Text style={styles.contactSub}>Sous 24h</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={soon} activeOpacity={0.8}>
            <View style={[styles.contactIcon, { backgroundColor: 'rgba(160,168,192,0.1)' }]}>
              <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.textSub} />
            </View>
            <Text style={styles.contactLabel}>Chat</Text>
            <Text style={styles.contactSub}>Bientôt</Text>
          </TouchableOpacity>
        </View>

        {/* Quick links */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.quickItem} onPress={soon} activeOpacity={0.7}>
            <View style={styles.quickIcon}>
              <Ionicons name="document-text-outline" size={20} color={COLORS.textSub} />
            </View>
            <View style={styles.quickText}>
              <Text style={styles.quickLabel}>Centre d'aide en ligne</Text>
              <Text style={styles.quickSub}>Guides et tutoriels complets</Text>
            </View>
            <Ionicons name="open-outline" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickItem} onPress={soon} activeOpacity={0.7}>
            <View style={styles.quickIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.textSub} />
            </View>
            <View style={styles.quickText}>
              <Text style={styles.quickLabel}>Signaler un incident</Text>
              <Text style={styles.quickSub}>Accident, problème de sécurité</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickItem} onPress={soon} activeOpacity={0.7}>
            <View style={styles.quickIcon}>
              <Ionicons name="star-outline" size={20} color={COLORS.textSub} />
            </View>
            <View style={styles.quickText}>
              <Text style={styles.quickLabel}>Contester une note</Text>
              <Text style={styles.quickSub}>Demander une révision</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickItem} onPress={soon} activeOpacity={0.7}>
            <View style={styles.quickIcon}>
              <Ionicons name="cash-outline" size={20} color={COLORS.textSub} />
            </View>
            <View style={styles.quickText}>
              <Text style={styles.quickLabel}>Problème de paiement</Text>
              <Text style={styles.quickSub}>Virement manquant, erreur</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* FAQ */}
        <View style={styles.faqHeader}>
          <Text style={styles.faqTitle}>Questions fréquentes</Text>
        </View>

        {FAQ.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.faqItem, openFaq === i && styles.faqItemOpen]}
            onPress={() => setOpenFaq(openFaq === i ? null : i)}
            activeOpacity={0.8}
          >
            <View style={styles.faqTop}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Ionicons
                name={openFaq === i ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.textSub}
              />
            </View>
            {openFaq === i && (
              <Text style={styles.faqA}>{item.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Legal */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={soon}><Text style={styles.legalLink}>Conditions générales</Text></TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={soon}><Text style={styles.legalLink}>Confidentialité</Text></TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={soon}><Text style={styles.legalLink}>Cookies</Text></TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 15, color: COLORS.textSub },

  contactRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 20 },
  contactCard: {
    flex: 1, backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: 16, alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  contactIcon: { width: 50, height: 50, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  contactSub: { fontSize: 11, color: COLORS.textSub },

  section: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    marginHorizontal: 16, marginBottom: 20, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  quickIcon: {
    width: 38, height: 38, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.bgInput, alignItems: 'center', justifyContent: 'center',
  },
  quickText: { flex: 1 },
  quickLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  quickSub: { fontSize: 12, color: COLORS.textSub, marginTop: 1 },

  faqHeader: { paddingHorizontal: 20, marginBottom: 10 },
  faqTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.textSub,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  faqItem: {
    backgroundColor: COLORS.bgCard, marginHorizontal: 16, marginBottom: 8,
    borderRadius: RADIUS.lg, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  faqItemOpen: { borderColor: COLORS.primary },
  faqTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  faqA: { fontSize: 13, color: COLORS.textSub, lineHeight: 20, marginTop: 12 },

  legalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 24,
  },
  legalLink: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },
  legalSep: { color: COLORS.textMuted, fontSize: 12 },
});
