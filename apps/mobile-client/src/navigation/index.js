import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store';
import { COLORS } from '../utils/theme';

// Auth Screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import PhoneScreen from '../screens/auth/PhoneScreen';
import OTPScreen from '../screens/auth/OTPScreen';

// App Screens
import HomeScreen from '../screens/home/HomeScreen';
import BookingScreen from '../screens/ride/BookingScreen';
import TrackingScreen from '../screens/ride/TrackingScreen';
import RatingScreen from '../screens/ride/RatingScreen';
import HistoryScreen from '../screens/history/HistoryScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import NotificationsScreen from '../screens/profile/NotificationsScreen';
import FavoritesScreen from '../screens/profile/FavoritesScreen';
import SupportScreen from '../screens/profile/SupportScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const tabBarIcon = (name) => ({ color, size }) => (
  <Ionicons name={name} color={color} size={size} />
);

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Accueil', tabBarIcon: tabBarIcon('home') }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: 'Courses', tabBarIcon: tabBarIcon('time-outline') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profil', tabBarIcon: tabBarIcon('person-outline') }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="OTP" component={OTPScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Booking" component={BookingScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Tracking" component={TrackingScreen} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
