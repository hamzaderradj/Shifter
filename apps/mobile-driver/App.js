import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import Toast from 'react-native-toast-message';
import Navigation from './src/navigation';
import { useAuthStore } from './src/store';
import { authAPI } from './src/services/api';

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Référence globale pour la navigation depuis les notifications
export const navigationRef = React.createRef();

export default function App() {
  const { init } = useAuthStore();
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    init().finally(() => SplashScreen.hideAsync());
    registerPushToken();

    // Notif reçue en foreground (app ouverte)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      console.log('[PUSH] Reçue en foreground:', data?.notificationType);
    });

    // Tap sur une notif (app en background ou fermée)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[PUSH] Tap notif:', data);
      if (data?.action === 'ride_request' && data?.rideId) {
        // La navigation se fait via le socket dans RideRequestModal,
        // mais on peut forcer l'ouverture si besoin
        navigationRef.current?.navigate('RideRequest', { rideId: data.rideId });
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export const registerPushToken = async () => {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) {
      await authAPI.updateProfile({ pushToken: token }).catch(() => {});
    }
    return token;
  } catch (err) {
    console.warn('[PUSH] Erreur enregistrement token:', err.message);
    return null;
  }
};
