import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store';
import { COLORS } from '../utils/theme';

// Auth
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneScreen from '../screens/auth/PhoneScreen';
import OTPScreen from '../screens/auth/OTPScreen';

// App
import HomeScreen from '../screens/home/HomeScreen';
import ActiveRideScreen from '../screens/ride/ActiveRideScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import RegistrationScreen from '../screens/profile/RegistrationScreen';
import HistoryScreen from '../screens/history/HistoryScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray[500],
        tabBarStyle: { backgroundColor: COLORS.white, height: 60, paddingBottom: 8 },
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Accueil', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: 'Courses', tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} /> }} />
      <Tab.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Revenus', tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.secondary }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
          <Stack.Screen name="Registration" component={RegistrationScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Phone" component={PhoneScreen} />
          <Stack.Screen name="OTP" component={OTPScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
