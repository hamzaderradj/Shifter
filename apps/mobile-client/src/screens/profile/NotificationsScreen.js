import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { usersAPI } from '../../services/api';
import { COLORS, SPACING, SIZES, RADIUS, SHADOWS } from '../../utils/theme';

const NOTIF_ICONS = {
  ride_request: { icon: 'bicycle', color: COLORS.primary },
  ride_accepted: { icon: 'checkmark-circle', color: COLORS.success },
  driver_arrived: { icon: 'location', color: COLORS.warning },
  ride_completed: { icon: 'checkmark-done-circle', color: COLORS.success },
  ride_cancelled: { icon: 'close-circle', color: COLORS.error },
  account_approved: { icon: 'shield-checkmark', color: COLORS.success },
  account_rejected: { icon: 'shield-outline', color: COLORS.error },
  promo: { icon: 'gift', color: COLORS.accent },
  system: { icon: 'information-circle', color: COLORS.primary },
};

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await usersAPI.getNotifications();
      setNotifications(data.notifications || []);
      await usersAPI.markNotificationsRead();
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.secondary} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={64} color={COLORS.gray[300]} />
            <Text style={styles.emptyText}>Aucune notification</Text>
          </View>
        }
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const config = NOTIF_ICONS[item.type] || NOTIF_ICONS.system;
          return (
            <View style={[styles.notifCard, !item.isRead && styles.notifUnread]}>
              <View style={[styles.notifIcon, { backgroundColor: config.color + '20' }]}>
                <Ionicons name={config.icon} size={22} color={config.color} />
              </View>
              <View style={styles.notifContent}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={styles.notifBody}>{item.body}</Text>
                <Text style={styles.notifDate}>
                  {format(new Date(item.createdAt), 'dd MMM · HH:mm', { locale: fr })}
                </Text>
              </View>
              {!item.isRead && <View style={styles.unreadDot} />}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, backgroundColor: COLORS.white, ...SHADOWS.small,
  },
  title: { fontSize: SIZES.xLarge, fontWeight: '700', color: COLORS.secondary },
  list: { padding: SPACING.md, gap: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100, gap: SPACING.md },
  emptyText: { color: COLORS.gray[500], fontSize: SIZES.large },
  notifCard: {
    flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.md, gap: SPACING.md, ...SHADOWS.small,
  },
  notifUnread: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  notifIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: SIZES.medium, fontWeight: '700', color: COLORS.secondary, marginBottom: 2 },
  notifBody: { fontSize: SIZES.small, color: COLORS.gray[600], lineHeight: 18, marginBottom: 4 },
  notifDate: { fontSize: 11, color: COLORS.gray[400] },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 4 },
});
