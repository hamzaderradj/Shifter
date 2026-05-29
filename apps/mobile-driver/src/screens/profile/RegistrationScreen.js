import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, StatusBar, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { driverAPI } from '../../services/api';
import { useDriverAuthStore } from '../../store';
import { COLORS, SPACING, RADIUS, SHADOW } from '../../utils/theme';

const STEPS = ['Véhicule', 'Documents', 'Terminé'];

const DOCUMENTS = [
  { type: 'id_card',              label: "Pièce d'identité",      icon: 'card'             },
  { type: 'driving_license',      label: 'Permis de conduire',     icon: 'document-text'    },
  { type: 'vehicle_registration', label: 'Carte grise',            icon: 'document'         },
  { type: 'insurance',            label: 'Assurance',              icon: 'shield-checkmark' },
  { type: 'profile_photo',        label: 'Photo de profil',        icon: 'camera'           },
  { type: 'vehicle_photo',        label: 'Photo de la moto',       icon: 'bicycle'          },
];

const FIELDS = [
  { key: 'make',  label: 'Marque',                   placeholder: 'Honda, Yamaha…'  },
  { key: 'model', label: 'Modèle',                   placeholder: 'CBF125, FZ…'     },
  { key: 'year',  label: 'Année',                    placeholder: '2022', keyboard: 'numeric' },
  { key: 'plate', label: "Plaque d'immatriculation", placeholder: 'AA-1234-BA'      },
  { key: 'color', label: 'Couleur',                  placeholder: 'Rouge, Noir…'    },
];

export default function RegistrationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { updateDriver } = useDriverAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState({ make: '', model: '', year: '', plate: '', color: '' });
  const [uploadedDocs, setUploadedDocs] = useState({});

  // ── Étape 1 : soumettre les infos véhicule ─────────────────────
  const handleVehicleNext = async () => {
    if (!vehicle.make || !vehicle.model || !vehicle.plate || !vehicle.color) {
      return Alert.alert('Champs requis', 'Remplissez tous les champs obligatoires.');
    }
    setLoading(true);
    try {
      const { data } = await driverAPI.register({
        vehicleMake: vehicle.make, vehicleModel: vehicle.model,
        vehicleYear: vehicle.year, vehiclePlate: vehicle.plate, vehicleColor: vehicle.color,
      });
      updateDriver(data.driver);
      setStep(1);
    } catch (err) {
      if (err.response?.status === 409) { setStep(1); return; }
      Alert.alert('Erreur', err.response?.data?.message || 'Erreur lors de l\'inscription.');
    } finally {
      setLoading(false);
    }
  };

  // ── Upload d'un document : caméra ou galerie ───────────────────
  const pickDocument = async (docType) => {
    Alert.alert(
      'Ajouter un document',
      'Comment voulez-vous envoyer ce document ?',
      [
        {
          text: '📷 Prendre une photo',
          onPress: () => launchPicker(docType, 'camera'),
        },
        {
          text: '🖼️ Choisir depuis la galerie',
          onPress: () => launchPicker(docType, 'library'),
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const launchPicker = async (docType, source) => {
    let result;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission refusée', 'Autorisez l\'accès à la caméra dans les réglages.');
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        // pas de allowsEditing → document complet
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permission refusée', 'Autorisez l\'accès à la galerie dans les réglages.');
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        // pas de allowsEditing → image complète non recadrée
      });
    }

    if (result.canceled) return;

    const file = result.assets[0];
    setLoading(true);
    try {
      await driverAPI.uploadDocument(docType, {
        uri: file.uri,
        name: `${docType}_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      setUploadedDocs(prev => ({ ...prev, [docType]: true }));
    } catch (err) {
      Alert.alert('Erreur upload', err.response?.data?.message || 'Impossible d\'uploader ce document.');
    } finally {
      setLoading(false);
    }
  };

  const allDocsUploaded = DOCUMENTS.every(d => uploadedDocs[d.type]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Header + Steps ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Inscription chauffeur</Text>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <View style={[styles.stepDot, step >= i && styles.stepDotActive]}>
                {step > i
                  ? <Ionicons name="checkmark" size={14} color={COLORS.bg} />
                  : <Text style={[styles.stepNum, step >= i && styles.stepNumActive]}>{i + 1}</Text>
                }
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepLine, step > i && styles.stepLineActive]} />
              )}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.stepLabel}>{STEPS[step]}</Text>
      </View>

      {/* ── Contenu scrollable ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Étape 1 : Véhicule */}
        {step === 0 && (
          <>
            {FIELDS.map(f => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  value={vehicle[f.key]}
                  onChangeText={v => setVehicle(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.keyboard || 'default'}
                  returnKeyType="next"
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVehicleNext}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.bg} />
                : <Text style={styles.btnText}>Suivant →</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {/* Étape 2 : Documents */}
        {step === 1 && (
          <>
            <Text style={styles.sectionHint}>
              Uploadez les documents requis. Prenez-les en photo ou importez-les depuis votre galerie.
            </Text>

            {DOCUMENTS.map(doc => (
              <TouchableOpacity
                key={doc.type}
                style={[styles.docItem, uploadedDocs[doc.type] && styles.docItemDone]}
                onPress={() => pickDocument(doc.type)}
                disabled={loading}
                activeOpacity={0.75}
              >
                <View style={[styles.docIcon, uploadedDocs[doc.type] && styles.docIconDone]}>
                  <Ionicons
                    name={uploadedDocs[doc.type] ? 'checkmark' : doc.icon}
                    size={22}
                    color={uploadedDocs[doc.type] ? COLORS.bg : COLORS.primary}
                  />
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docStatus}>
                    {uploadedDocs[doc.type] ? '✓ Uploadé' : 'Appuyer pour envoyer'}
                  </Text>
                </View>
                <Ionicons
                  name={uploadedDocs[doc.type] ? 'checkmark-circle' : 'chevron-forward'}
                  size={18}
                  color={uploadedDocs[doc.type] ? COLORS.primary : COLORS.textMuted}
                />
              </TouchableOpacity>
            ))}

            {loading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.primary} />
                <Text style={styles.loadingText}>Upload en cours…</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.btn, (!allDocsUploaded || loading) && styles.btnDisabled]}
              onPress={() => setStep(2)}
              disabled={!allDocsUploaded || loading}
            >
              <Text style={styles.btnText}>Soumettre le dossier →</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Les documents sont vérifiés manuellement. Tout document illisible sera rejeté.
            </Text>
          </>
        )}

        {/* Étape 3 : Terminé */}
        {step === 2 && (
          <View style={styles.successSection}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.primary} />
            <Text style={styles.successTitle}>Dossier envoyé !</Text>
            <Text style={styles.successText}>
              Notre équipe vérifie vos documents.{'\n'}
              Vous serez notifié par SMS une fois validé (24-48h).
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => navigation.replace('MainTabs')}
            >
              <Text style={styles.btnText}>Accéder à l'application</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    padding: SPACING.md,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.lg },
  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepNum: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  stepNumActive: { color: COLORS.bg },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border },
  stepLineActive: { backgroundColor: COLORS.primary },
  stepLabel: { fontSize: 12, color: COLORS.textSub, fontWeight: '600' },

  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: 48 },

  field: { marginBottom: SPACING.md },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.textSub,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.bgCard,
  },

  btn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md,
    ...SHADOW.green,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: COLORS.bg, fontSize: 17, fontWeight: '800' },

  sectionHint: { fontSize: 14, color: COLORS.textSub, lineHeight: 22, marginBottom: SPACING.md },
  hint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.md, lineHeight: 18 },

  docItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgCard, borderRadius: RADIUS.md,
    padding: SPACING.md, gap: SPACING.md,
    borderWidth: 1.5, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  docItemDone: { borderColor: COLORS.primary, backgroundColor: 'rgba(46,204,113,0.08)' },
  docIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(46,204,113,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  docIconDone: { backgroundColor: COLORS.primary },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  docStatus: { fontSize: 12, color: COLORS.textSub, marginTop: 2 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  loadingText: { fontSize: 13, color: COLORS.textSub },

  successSection: { alignItems: 'center', paddingTop: SPACING.xl * 2, gap: SPACING.md },
  successTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  successText: { fontSize: 15, color: COLORS.textSub, textAlign: 'center', lineHeight: 24 },
});
