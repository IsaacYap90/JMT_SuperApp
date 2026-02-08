import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../shared/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

import { ClassesScreen } from '../portals/member/screens/ClassesScreen';
import { PTSessionsScreen } from '../portals/member/screens/PTSessionsScreen';
import { ProfileScreen } from '../portals/member/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export const MemberNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0F', // Dark background matching design
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
      <Tab.Screen
        name="Classes"
        component={ClassesScreen}
        options={{
          tabBarLabel: 'Schedule',
        }}
      />
      <Tab.Screen
        name="PT"
        component={PTSessionsScreen}
        options={{
          tabBarLabel: 'My PT',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};
