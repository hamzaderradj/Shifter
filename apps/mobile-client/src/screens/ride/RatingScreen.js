import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ridesAPI } from '../../services/api';
import { useRideStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

export default function RatingScreen({ navigation, route }) {
  const { rideId } = route.params;
  const insets = useSafeAreaInsets();
  const { clearRide } = useRideStore();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const QUICK_COMMENTS = ['Excellent !', 'Très professionnel', 'Conduite prudente', 'Ponctuel', 'Souriant'];

  const handleSubmit = async () => {
    if (!score) return Alert.alert('Note requise', 'Donnez une note avant de valider.');
    setLoading(true);
    try {
      await ridesAPI.rate(rideId, score, comment);
      clearRide();
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'envoyer la note.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    clearRide();
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        {/* Icône */}
        <View style={styles.icon}>
          <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
        </View>
        <Text style={styles.title}>Course terminée !</Text>
        <Text style={styles.subtitle}>Évaluez votre chauffeur</Text>

        {/* Étoiles */}
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((s) => (
            <TouchableOpacity key={s} onPress={() => setScore(s)} activeOpacity={0.7}>
              <Ionicons
                name={s <= score ? 'star' : 'star-outline'}
                size={44}
                color={s <= score ? COLORS.accent : COLORS.gray[300]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.scoreLabel}>
          {score === 1 && 'Très mauvais'}{score === 2 && 'Mauvais'}{score === 3 && 'Correct'}
          {score === 4 && 'Bien'}{score === 5 && 'Excellent !'}
        </Text>

        {/* Commentaires rapides */}
        <View style={styles.quickComments}>
          {QUICK_COMMENTS.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.quickChip, comment === c && styles.quickChipActive]}
              onPress={() => setComment(comment === c ? '' : c)}
            >
              <Text style={[styles.quickChipText, comment === c && styles.quickChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Commentaire libre */}
        <TextInput
          style={styles.commentInput}
          placeholder="Laisser un commentaire..."
          placeholderTextColor={COLORS.gray[400]}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={300}
        />
      </View>

      {/* Actions */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipBtnText}>Passer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, !score && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!score || loading}
        >
          {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.submitBtnText}>Valider</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, alignItems: 'center', padding: SPACING.xl },
  icon: { marginBottom: SPACING.md, marginTop: SPACING.xl },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.secondary, marginBottom: 8 },
  subtitle: { fontSize: SIZES.medium, color: COLORS.gray[500], marginBottom: SPACING.xl },
  stars: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  scoreLabel: { fontSize: SIZES.large, fontWeight: '600', color: COLORS.secondary, marginBottom: SPACING.xl, minHeight: 24 },
  quickComments: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, justifyContent: 'center', marginBottom: SPACING.md },
  quickChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.gray[300],
  },
  quickChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  quickChipText: { color: COLORS.gray[600], fontSize: SIZES.small, fontWeight: '600' },
  quickChipTextActive: { color: COLORS.white },
  commentInput: {
    width: '100%', borderWidth: 1.5, borderColor: COLORS.gray[200], borderRadius: RADIUS.md,
    padding: SPACING.md, fontSize: SIZES.medium, color: COLORS.secondary,
    height: 80, textAlignVertical: 'top',
  },
  footer: { flexDirection: 'row', gap: SPACING.md, padding: SPACING.md },
  skipBtn: {
    flex: 1, height: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.gray[300],
  },
  skipBtnText: { color: COLORS.gray[600], fontWeight: '600' },
  submitBtn: {
    flex: 2, height: 52, alignItems: 'center', justifyContent: 'center',
    borderRadius: RADIUS.md, backgroundColor: COLORS.primary,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: COLORS.white, fontWeight: '700', fontSize: SIZES.large },
});
