import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../shared/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

import { ClassesScreen } from '../portals/member/screens/ClassesScreen';
import { PTSessionsScreen } from '../portals/member/screens/PTSessionsScreen';
import { ProfileScreen } from '../portals/member/screens/ProfileScreen';

import { createStackNavigator } from '@react-navigation/stack';
import { NotificationsScreen } from '../portals/member/screens/NotificationsScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const MemberTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F',
          borderTopColor: '#2A2A35',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: Colors.jaiBlue,
        tabBarInactiveTintColor: Colors.darkGray,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Classes') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'PT') {
            iconName = focused ? 'fitness' : 'fitness-outline';
          } else if (route.name === 'Profile') {
            iconName = focused ? 'person' : 'person-outline';
          }

          return <Ionicons name={iconName as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Classes" component={ClassesScreen} options={{ tabBarLabel: 'Schedule' }} />
      <Tab.Screen name="PT" component={PTSessionsScreen} options={{ tabBarLabel: 'My PT' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
};

export const MemberNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MemberTabs" component={MemberTabs} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
};
