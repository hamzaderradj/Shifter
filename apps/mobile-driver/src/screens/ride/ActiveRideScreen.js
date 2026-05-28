import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking, StatusBar } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ridesAPI } from '../../services/api';
import { useRideStore } from '../../store';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const RIDE_ACTIONS = {
  accepted:       { label: 'Je pars chercher le client', nextStatus: 'driver_en_route', icon: 'bicycle', color: COLORS.primary },
  driver_en_route:{ label: 'Je suis arrivé', nextStatus: 'arrived', icon: 'location', color: COLORS.warning },
  arrived:        { label: 'Démarrer la course', nextStatus: 'in_progress', icon: 'play', color: COLORS.success },
  in_progress:    { label: 'Terminer la course', nextStatus: 'completed', icon: 'checkmark-circle', color: COLORS.success },
};

export default function ActiveRideScreen({ navigation, route }) {
  const { rideId } = route.params;
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const { currentRide, setCurrentRide, clearCurrentRide } = useRideStore();
  const [ride, setRide] = useState(currentRide);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ridesAPI.getById(rideId).then(({ data }) => {
      setRide(data.ride);
      setCurrentRide(data.ride);
    }).catch(() => {});
  }, [rideId]);

  const handleStatusUpdate = async () => {
    const action = RIDE_ACTIONS[ride?.status];
    if (!action) return;

    if (action.nextStatus === 'completed') {
      Alert.alert('Terminer la course', 'Confirmer la fin de course ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => updateStatus(action.nextStatus) }
      ]);
    } else {
      updateStatus(action.nextStatus);
    }
  };

  const updateStatus = async (status) => {
    setLoading(true);
    try {
      await ridesAPI.updateStatus(rideId, status);
      const updatedRide = { ...ride, status };
      setRide(updatedRide);
      setCurrentRide(updatedRide);

      if (status === 'completed') {
        clearCurrentRide();
        Alert.alert('✅ Course terminée !', `Montant: ${ride.estimatedPrice} FCFA`, [
          { text: 'OK', onPress: () => navigation.navigate('Home') }
        ]);
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut.');
    } finally {
      setLoading(false);
    }
  };

  const callClient = () => {
    const phone = ride?.client?.phone;
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const action = RIDE_ACTIONS[ride?.status];
  const pickupCoord = ride ? { latitude: parseFloat(ride.pickupLat), longitude: parseFloat(ride.pickupLng) } : null;
  const dropoffCoord = ride ? { latitude: parseFloat(ride.dropoffLat), longitude: parseFloat(ride.dropoffLng) } : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        initialRegion={pickupCoord ? { ...pickupCoord, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}
      >
        {pickupCoord && <Marker coordinate={pickupCoord} title="Départ" pinColor={COLORS.success} />}
        {dropoffCoord && <Marker coordinate={dropoffCoord} title="Arrivée" pinColor={COLORS.error} />}
        {pickupCoord && dropoffCoord && (
          <Polyline coordinates={[pickupCoord, dropoffCoord]} strokeColor={COLORS.primary} strokeWidth={3} lineDashPattern={[10,5]} />
        )}
      </MapView>

      <TouchableOpacity style={[styles.backBtn, { top: insets.top + SPACING.sm }]} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color={COLORS.secondary} />
      </TouchableOpacity>

      <View style={[styles.panel, { paddingBottom: insets.bottom + SPACING.sm }]}>
        {/* Client info */}
        <View style={styles.clientCard}>
          <View style={styles.clientAvatar}>
            <Ionicons name="person" size={28} color={COLORS.gray[400]} />
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{ride?.client?.firstName} {ride?.client?.lastName}</Text>
            <View style={styles.routeSmall}>
              <Text style={styles.routeSmallText} numberOfLines={1}>📍 {ride?.pickupAddress}</Text>
              <Text style={styles.routeSmallText} numberOfLines={1}>🏁 {ride?.dropoffAddress}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.callBtn} onPress={callClient}>
            <Ionicons name="call" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Prix */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Montant estimé :</Text>
          <Text style={styles.priceValue}>{ride?.estimatedPrice || '---'} FCFA</Text>
        </View>

        {/* Action principale */}
        {action && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: action.color }, loading && styles.actionBtnLoading]}
            onPress={handleStatusUpdate}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Ionicons name={action.icon} size={22} color={COLORS.white} />
            <Text style={styles.actionBtnText}>{action.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    position: 'absolute', left: SPACING.md,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.medium,
  },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.md, gap: SPACING.md, ...SHADOWS.large,
  },
  clientCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.gray[50], borderRadius: RADIUS.md, padding: SPACING.md,
  },
  clientAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.gray[200], alignItems: 'center', justifyContent: 'center' },
  clientInfo: { flex: 1 },
  clientName: { fontSize: SIZES.large, fontWeight: '700', color: COLORS.secondary },
  routeSmall: { marginTop: 4 },
  routeSmallText: { fontSize: SIZES.small, color: COLORS.gray[500] },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '20', alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  priceLabel: { color: COLORS.gray[600] },
  priceValue: { fontSize: SIZES.xLarge, fontWeight: '800', color: COLORS.secondary },
  actionBtn: {
    height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, borderRadius: RADIUS.lg,
  },
  actionBtnLoading: { opacity: 0.7 },
  actionBtnText: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
});
