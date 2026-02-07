import React, { useEffect, useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../shared/constants/Colors';
import { useAuth } from '../shared/services/AuthContext';
import { supabase } from '../shared/services/supabase';
import { AdminOverviewScreen } from '../portals/admin/screens/OverviewScreen';
import { AdminMembersScreen } from '../portals/admin/screens/MembersScreen';
import { AdminScheduleScreen } from '../portals/admin/screens/ScheduleScreen';
import { AdminCoachesScreen } from '../portals/admin/screens/CoachesScreen';
import { AdminEarningsScreen } from '../portals/admin/screens/EarningsScreen';
import { AdminNotificationsScreen } from '../portals/admin/screens/NotificationsScreen';
import { AdminBroadcastScreen } from '../portals/admin/screens/BroadcastScreen';
import { ProfileScreen } from '../shared/screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const AdminTabs: React.FC = () => {
  const { user } = useAuth();
  const isMasterAdmin = user?.role === 'master_admin';
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  useEffect(() => {
    if (!isMasterAdmin) return;

    const fetchCount = async () => {
      const { count } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingLeaveCount(count || 0);
    };

    fetchCount();

    // Listen for leave_requests changes to update badge in real-time
    const channel = supabase
      .channel('leave-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        fetchCount();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isMasterAdmin]);

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
        component={AdminOverviewScreen}
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
        name="Members"
        component={AdminMembersScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Members</Text>
          ) : null,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={AdminScheduleScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />
          ),
          tabBarLabel: ({ focused }) => focused ? (
            <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Schedule</Text>
          ) : null,
        }}
      />
      {isMasterAdmin && (
        <Tab.Screen
          name="HR"
          component={AdminCoachesScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "people" : "people-outline"} size={22} color={color} />
            ),
            tabBarLabel: ({ focused }) => focused ? (
              <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>HR</Text>
            ) : null,
            tabBarBadge: pendingLeaveCount > 0 ? pendingLeaveCount : undefined,
            tabBarBadgeStyle: {
              backgroundColor: '#FF3B30',
              fontSize: 10,
              fontWeight: '700',
              minWidth: 18,
              height: 18,
              lineHeight: 18,
            },
          }}
        />
      )}
      {isMasterAdmin && (
        <Tab.Screen
          name="Earnings"
          component={AdminEarningsScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
            ),
            tabBarLabel: ({ focused }) => focused ? (
              <Text style={{ color: Colors.jaiBlue, fontSize: 10, fontWeight: '600', marginTop: 2 }}>Earnings</Text>
            ) : null,
          }}
        />
      )}
    </Tab.Navigator>
  );
};

export const AdminNavigator: React.FC = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AdminTabs" component={AdminTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Notifications" component={AdminNotificationsScreen} />
      <Stack.Screen name="Broadcast" component={AdminBroadcastScreen} />
    </Stack.Navigator>
  );
};
