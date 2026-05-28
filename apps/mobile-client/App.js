import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';

import Navigation from './src/navigation';
import { useAuthStore } from './src/store';
import { authAPI } from './src/services/api';

// Garder le splash screen visible pendant le chargement
SplashScreen.preventAutoHideAsync();

// Config notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  const { init, isLoading, updateUser } = useAuthStore();

  useEffect(() => {
    // Initialiser l'auth
    init().finally(() => SplashScreen.hideAsync());

    // Enregistrer le token push
    registerPushToken();

    // Écouter les notifications en foreground
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification reçue:', notification);
    });

    return () => sub.remove();
  }, []);

  const registerPushToken = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const { data: token } = await Notifications.getExpoPushTokenAsync();
      if (token) {
        await authAPI.updateProfile({ pushToken: token }).catch(() => {});
        updateUser({ pushToken: token });
      }
    } catch {}
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Navigation />
        <Toast />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
