import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { driverAPI } from '../../services/api';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../utils/theme';

const DOC_CONFIG = {
  id_card:              { label: 'Carte d\'identité',       icon: 'card-outline' },
  driving_license:      { label: 'Permis de conduire',      icon: 'ribbon-outline' },
  vehicle_registration: { label: 'Carte grise',             icon: 'document-text-outline' },
  insurance:            { label: 'Attestation d\'assurance', icon: 'shield-checkmark-outline' },
  profile_photo:        { label: 'Photo de profil',          icon: 'person-circle-outline' },
  vehicle_photo:        { label: 'Photo du véhicule',        icon: 'bicycle-outline' },
};

const STATUS_CONFIG = {
  approved: {
    label: 'Validé',
    color: COLORS.primary,
    bg: 'rgba(46,204,113,0.12)',
    icon: 'checkmark-circle',
  },
  pending: {
    label: 'En attente',
    color: '#F39C12',
    bg: 'rgba(243,156,18,0.12)',
    icon: 'time-outline',
  },
  rejected: {
    label: 'Refusé',
    color: '#FF4B4B',
    bg: 'rgba(255,75,75,0.12)',
    icon: 'close-circle',
  },
};

// Tous les types de documents requis
const ALL_DOC_TYPES = Object.keys(DOC_CONFIG);

export default function DocumentsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [documents, setDocuments] = useState([]);
  const [driverStatus, setDriverStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await driverAPI.getMe();
      setDocuments(data.driver?.documents || []);
      setDriverStatus(data.driver?.status);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const onRefresh = () => { setRefreshing(true); load(); };

  // Créer une map type → document
  const docMap = {};
  documents.forEach(d => { docMap[d.type] = d; });

  const totalDocs = ALL_DOC_TYPES.length;
  const approvedDocs = ALL_DOC_TYPES.filter(t => docMap[t]?.status === 'approved').length;
  const rejectedDocs = ALL_DOC_TYPES.filter(t => docMap[t]?.status === 'rejected').length;
  const allApproved = approvedDocs === totalDocs;

  const accountStatusConfig = {
    approved:  { label: 'Compte validé ✅',       color: COLORS.primary,  bg: 'rgba(46,204,113,0.12)' },
    pending:   { label: 'Vérification en cours…', color: '#F39C12',        bg: 'rgba(243,156,18,0.12)' },
    rejected:  { label: 'Compte refusé',          color: '#FF4B4B',        bg: 'rgba(255,75,75,0.12)'  },
    suspended: { label: 'Compte suspendu',        color: '#FF4B4B',        bg: 'rgba(255,75,75,0.12)'  },
  };
  const acSt = accountStatusConfig[driverStatus] || accountStatusConfig.pending;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes documents</Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        >
          {/* Statut compte */}
          <View style={[styles.accountBadge, { backgroundColor: acSt.bg }]}>
            <Text style={[styles.accountBadgeText, { color: acSt.color }]}>{acSt.label}</Text>
            {driverStatus === 'pending' && (
              <Text style={styles.accountBadgeSub}>Notre équipe vérifie tes documents (24-48h)</Text>
            )}
          </View>

          {/* Barre de progression */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Progression</Text>
              <Text style={styles.progressCount}>
                <Text style={{ color: COLORS.primary, fontWeight: '800' }}>{approvedDocs}</Text>
                /{totalDocs} validés
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(approvedDocs / totalDocs) * 100}%` }]} />
            </View>
            {rejectedDocs > 0 && (
              <Text style={styles.rejectedWarning}>
                ⚠️ {rejectedDocs} document{rejectedDocs > 1 ? 's' : ''} refusé{rejectedDocs > 1 ? 's' : ''} — renvoie-le{rejectedDocs > 1 ? 's' : ''} pour être validé
              </Text>
            )}
          </View>

          {/* Liste documents */}
          <View style={styles.docList}>
            {ALL_DOC_TYPES.map((type) => {
              const doc = docMap[type];
              const config = DOC_CONFIG[type];
              const st = doc ? STATUS_CONFIG[doc.status] : null;

              return (
                <View key={type} style={styles.docCard}>
                  {/* Icône doc */}
                  <View style={[styles.docIcon, { backgroundColor: st ? st.bg : COLORS.bgInput }]}>
                    <Ionicons
                      name={config.icon}
                      size={22}
                      color={st ? st.color : COLORS.textSub}
                    />
                  </View>

                  {/* Infos */}
                  <View style={styles.docInfo}>
                    <Text style={styles.docLabel}>{config.label}</Text>
                    {doc ? (
                      <View style={styles.docStatusRow}>
                        <Ionicons name={st.icon} size={14} color={st.color} />
                        <Text style={[styles.docStatusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    ) : (
                      <Text style={styles.docMissing}>Non soumis</Text>
                    )}
                    {doc?.status === 'rejected' && doc?.rejectionReason && (
                      <Text style={styles.rejectionReason}>
                        Motif : {doc.rejectionReason}
                      </Text>
                    )}
                  </View>

                  {/* Badge statut */}
                  {doc ? (
                    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                      <Ionicons name={st.icon} size={18} color={st.color} />
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, { backgroundColor: COLORS.bgInput }]}>
                      <Ionicons name="ellipse-outline" size={18} color={COLORS.textSub} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Message final */}
          {allApproved ? (
            <View style={styles.successBanner}>
              <Text style={styles.successEmoji}>🎉</Text>
              <Text style={styles.successText}>Tous tes documents sont validés !</Text>
              <Text style={styles.successSub}>Tu peux recevoir des courses sans restriction.</Text>
            </View>
          ) : (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.textSub} />
              <Text style={styles.infoText}>
                Tire vers le bas pour actualiser le statut de tes documents.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    backgroundColor: COLORS.bgCard, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },

  accountBadge: {
    borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', gap: 4,
  },
  accountBadgeText: { fontSize: 16, fontWeight: '800' },
  accountBadgeSub: { fontSize: 12, color: COLORS.textSub, textAlign: 'center' },

  progressSection: {
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSub },
  progressCount: { fontSize: 13, color: COLORS.textSub },
  progressBar: {
    height: 6, backgroundColor: COLORS.bgInput,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 3,
  },
  rejectedWarning: { fontSize: 12, color: '#FF4B4B', fontWeight: '600' },

  docList: { gap: SPACING.sm },

  docCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOW.card,
  },
  docIcon: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  docStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  docStatusText: { fontSize: 12, fontWeight: '600' },
  docMissing: { fontSize: 12, color: COLORS.textSub },
  rejectionReason: { fontSize: 11, color: '#FF4B4B', marginTop: 3, fontStyle: 'italic' },

  statusBadge: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  successBanner: {
    backgroundColor: 'rgba(46,204,113,0.1)', borderRadius: RADIUS.lg,
    padding: SPACING.lg, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(46,204,113,0.3)',
  },
  successEmoji: { fontSize: 32 },
  successText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  successSub: { fontSize: 13, color: COLORS.textSub, textAlign: 'center' },

  infoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: SPACING.md,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.textSub, lineHeight: 18 },
});
