import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { driverAPI } from '../../services/api';
import { useDriverAuthStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const STEPS = ['Véhicule', 'Documents', 'Terminé'];

const DOCUMENTS = [
  { type: 'id_card', label: "Pièce d'identité", icon: 'card', required: true },
  { type: 'driving_license', label: 'Permis de conduire', icon: 'document-text', required: true },
  { type: 'vehicle_registration', label: 'Carte grise', icon: 'document', required: true },
  { type: 'insurance', label: 'Assurance', icon: 'shield-checkmark', required: true },
  { type: 'profile_photo', label: 'Photo de profil', icon: 'camera', required: true },
  { type: 'vehicle_photo', label: 'Photo de la moto', icon: 'bicycle', required: true },
];

export default function RegistrationScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { updateDriver } = useDriverAuthStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [vehicle, setVehicle] = useState({ make: '', model: '', year: '', plate: '', color: '' });
  const [uploadedDocs, setUploadedDocs] = useState({});

  const handleVehicleNext = async () => {
    if (!vehicle.make || !vehicle.model || !vehicle.plate || !vehicle.color) {
      return Alert.alert('Champs requis', 'Remplissez tous les champs du véhicule.');
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
      if (err.response?.status === 409) setStep(1);
      else Alert.alert('Erreur', err.response?.data?.message || 'Erreur inscription.');
    } finally {
      setLoading(false);
    }
  };

  const pickDocument = async (docType) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    });

    if (!result.canceled) {
      const file = result.assets[0];
      setLoading(true);
      try {
        await driverAPI.uploadDocument(docType, { uri: file.uri, name: `${docType}.jpg`, mimeType: 'image/jpeg' });
        setUploadedDocs(prev => ({ ...prev, [docType]: true }));
      } catch {
        Alert.alert('Erreur', 'Impossible d\'uploader ce document.');
      } finally {
        setLoading(false);
      }
    }
  };

  const allDocsUploaded = DOCUMENTS.filter(d => d.required).every(d => uploadedDocs[d.type]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header + Steps */}
      <View style={styles.header}>
        <Text style={styles.title}>Inscription chauffeur</Text>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <View style={[styles.stepDot, step >= i && styles.stepDotActive]}>
                {step > i ? (
                  <Ionicons name="checkmark" size={14} color={COLORS.white} />
                ) : (
                  <Text style={[styles.stepNum, step >= i && styles.stepNumActive]}>{i + 1}</Text>
                )}
              </View>
              {i < STEPS.length - 1 && <View style={[styles.stepLine, step > i && styles.stepLineActive]} />}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.stepLabel}>{STEPS[step]}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Étape 1: Véhicule */}
        {step === 0 && (
          <View style={styles.section}>
            {[
              { key: 'make', label: 'Marque', placeholder: 'Honda, Yamaha...' },
              { key: 'model', label: 'Modèle', placeholder: 'CBF125, FZ...' },
              { key: 'year', label: 'Année', placeholder: '2022', keyboard: 'numeric' },
              { key: 'plate', label: 'Plaque d\'immatriculation', placeholder: 'AA-1234-BA' },
              { key: 'color', label: 'Couleur', placeholder: 'Rouge, Noir...' },
            ].map(f => (
              <View key={f.key} style={styles.field}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={f.placeholder}
                  placeholderTextColor={COLORS.gray[400]}
                  value={vehicle[f.key]}
                  onChangeText={v => setVehicle(p => ({ ...p, [f.key]: v }))}
                  keyboardType={f.keyboard || 'default'}
                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleVehicleNext}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.btnText}>Suivant →</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Étape 2: Documents */}
        {step === 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionHint}>
              Uploadez les documents requis pour valider votre compte
            </Text>
            {DOCUMENTS.map(doc => (
              <TouchableOpacity
                key={doc.type}
                style={[styles.docItem, uploadedDocs[doc.type] && styles.docItemDone]}
                onPress={() => pickDocument(doc.type)}
                disabled={loading}
              >
                <View style={[styles.docIcon, uploadedDocs[doc.type] && styles.docIconDone]}>
                  <Ionicons
                    name={uploadedDocs[doc.type] ? 'checkmark' : doc.icon}
                    size={22}
                    color={uploadedDocs[doc.type] ? COLORS.white : COLORS.primary}
                  />
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docLabel}>{doc.label}</Text>
                  <Text style={styles.docStatus}>
                    {uploadedDocs[doc.type] ? 'Uploadé ✓' : 'Appuyez pour uploader'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.gray[400]} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.btn, !allDocsUploaded && styles.btnDisabled]}
              onPress={() => setStep(2)}
              disabled={!allDocsUploaded}
            >
              <Text style={styles.btnText}>Terminer →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Étape 3: Terminé */}
        {step === 2 && (
          <View style={styles.successSection}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
            <Text style={styles.successTitle}>Inscription terminée !</Text>
            <Text style={styles.successText}>
              Votre dossier est en cours de vérification. Notre équipe vous contactera dans les 24-48h.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => navigation.replace('MainTabs')}>
              <Text style={styles.btnText}>Accéder à l'application</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { padding: SPACING.md, paddingBottom: SPACING.lg, backgroundColor: COLORS.white, ...SHADOWS.small },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.secondary, marginBottom: SPACING.lg },
  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2,
    borderColor: COLORS.gray[300], alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepNum: { fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[500] },
  stepNumActive: { color: COLORS.white },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.gray[200] },
  stepLineActive: { backgroundColor: COLORS.primary },
  stepLabel: { fontSize: SIZES.small, color: COLORS.gray[500], fontWeight: '600' },
  content: { flex: 1, padding: SPACING.md },
  section: { gap: SPACING.sm },
  sectionHint: { fontSize: SIZES.medium, color: COLORS.gray[600], lineHeight: 22, marginBottom: SPACING.sm },
  field: { marginBottom: SPACING.sm },
  fieldLabel: { fontSize: SIZES.small, fontWeight: '700', color: COLORS.gray[600], marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: SIZES.medium, color: COLORS.secondary,
  },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 56, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.md,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
  docItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.gray[50],
    borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.md,
    borderWidth: 1.5, borderColor: COLORS.gray[200], marginBottom: SPACING.sm,
  },
  docItemDone: { borderColor: COLORS.success, backgroundColor: COLORS.success + '08' },
  docIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center' },
  docIconDone: { backgroundColor: COLORS.success },
  docInfo: { flex: 1 },
  docLabel: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary },
  docStatus: { fontSize: SIZES.small, color: COLORS.gray[500], marginTop: 2 },
  successSection: { flex: 1, alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.md },
  successTitle: { fontSize: 28, fontWeight: '800', color: COLORS.secondary },
  successText: { fontSize: SIZES.medium, color: COLORS.gray[600], textAlign: 'center', lineHeight: 24 },
});
