import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useDriverAuthStore } from '../store';

// Auth screens
import DriverWelcomeScreen from '../screens/auth/WelcomeScreen';
import DriverPhoneScreen from '../screens/auth/PhoneScreen';
import DriverOTPScreen from '../screens/auth/OTPScreen';

// App screens
import DriverHomeScreen from '../screens/home/HomeScreen';
import EarningsScreen from '../screens/earnings/EarningsScreen';
import TripsScreen from '../screens/trips/TripsScreen';
import HelpScreen from '../screens/help/HelpScreen';
import DriverProfileScreen from '../screens/profile/ProfileScreen';
import RegistrationScreen from '../screens/profile/RegistrationScreen';
import ActiveRideScreen from '../screens/ride/ActiveRideScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import DocumentsScreen from '../screens/profile/DocumentsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const DARK = {
  bg: '#0F0F1A',
  card: '#1A1A2E',
  border: '#252545',
  primary: '#2ECC71',
  inactive: '#555E7A',
  text: '#FFFFFF',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: DARK.card,
          borderTopWidth: 1,
          borderTopColor: DARK.border,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarActiveTintColor: DARK.primary,
        tabBarInactiveTintColor: DARK.inactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      })}
    >
      <Tab.Screen
        name="Home"
        component={DriverHomeScreen}
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => <Ionicons name="navigate" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          title: 'Revenus',
          tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Trips"
        component={TripsScreen}
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Help"
        component={HelpScreen}
        options={{
          title: 'Aide',
          tabBarIcon: ({ color, size }) => <Ionicons name="help-circle-outline" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={DriverProfileScreen}
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={DriverWelcomeScreen} />
      <Stack.Screen name="Phone" component={DriverPhoneScreen} />
      <Stack.Screen name="OTP" component={DriverOTPScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  const { driver, updateDriver } = useDriverAuthStore();
  const [ready, setReady] = React.useState(false);
  const [hasDriver, setHasDriver] = React.useState(!!driver?.id);

  React.useEffect(() => {
    // Toujours vérifier le vrai profil depuis le serveur au démarrage
    const { driverAPI } = require('../services/api');
    driverAPI.getMe()
      .then(({ data }) => {
        if (data.driver?.id) {
          updateDriver(data.driver);
          setHasDriver(true);
        } else {
          setHasDriver(false);
        }
      })
      .catch(() => {
        // Si le serveur ne répond pas, utiliser ce qui est en cache
        setHasDriver(!!driver?.id);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={DARK.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={hasDriver ? 'MainTabs' : 'Registration'}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Registration" component={RegistrationScreen} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Documents" component={DocumentsScreen} />
    </Stack.Navigator>
  );
}

export default function DriverNavigation() {
  const { isAuthenticated, isLoading } = useDriverAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={DARK.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
