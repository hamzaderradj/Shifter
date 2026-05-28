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

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export default function App() {
  const { init, updateUser } = useAuthStore();

  useEffect(() => {
    init().finally(() => SplashScreen.hideAsync());
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const { data: token } = await Notifications.getExpoPushTokenAsync();
      if (token) await authAPI.updateProfile({ pushToken: token }).catch(() => {});
    })();
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
