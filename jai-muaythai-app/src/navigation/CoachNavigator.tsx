import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../shared/constants/Colors';
import { CoachOverviewScreen } from '../portals/coach/screens/OverviewScreen';
import { CoachScheduleScreen } from '../portals/coach/screens/ScheduleScreen';
import { CoachLeaveScreen } from '../portals/coach/screens/LeaveScreen';
import { CoachEarningsScreen } from '../portals/coach/screens/EarningsScreen';
import { CoachNotificationsScreen } from '../portals/coach/screens/NotificationsScreen';
import { ProfileScreen } from '../shared/screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const CoachTabs: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a1a',
          borderTopWidth: 1,
          borderTopColor: '#1a1a2e',
          height: 85,
          paddingBottom: 20,
          paddingTop: 10,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: Colors.jaiBlue,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
      }}
    >
      <Tab.Screen
        name="Overview"
        component={CoachOverviewScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Overview</Text>
          ) : null,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={CoachScheduleScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Schedule</Text>
          ) : null,
        }}
      />
      <Tab.Screen
        name="Leave"
        component={CoachLeaveScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "document-text" : "document-text-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Leave</Text>
          ) : null,
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={CoachEarningsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Earnings</Text>
          ) : null,
        }}
      />
    </Tab.Navigator>
  );
};

export const CoachNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CoachTabs" component={CoachTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Notifications" component={CoachNotificationsScreen} />
    </Stack.Navigator>
  );
};
