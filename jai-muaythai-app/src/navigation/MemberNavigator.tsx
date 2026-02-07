import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../shared/constants/Colors';

const Tab = createBottomTabNavigator();

// Placeholder screens - we'll build these next
const ClassesScreen = () => (
  <View style={styles.screen}>
    <Text style={styles.text}>Classes</Text>
  </View>
);

const PTScreen = () => (
  <View style={styles.screen}>
    <Text style={styles.text}>Personal Training</Text>
  </View>
);

const MembershipScreen = () => (
  <View style={styles.screen}>
    <Text style={styles.text}>Membership</Text>
  </View>
);

export const MemberNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.darkCharcoal,
          borderTopColor: Colors.border,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: Colors.jaiBlue,
        tabBarInactiveTintColor: Colors.darkGray,
      }}
    >
      <Tab.Screen
        name="Classes"
        component={ClassesScreen}
        options={{
          tabBarLabel: 'Classes',
        }}
      />
      <Tab.Screen
        name="PT"
        component={PTScreen}
        options={{
          tabBarLabel: 'PT',
        }}
      />
      <Tab.Screen
        name="Membership"
        component={MembershipScreen}
        options={{
          tabBarLabel: 'Membership',
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: Colors.white,
    fontSize: 24,
  },
});
