import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../shared/services/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { FirstLoginScreen } from '../shared/screens/FirstLoginScreen';
import { MemberNavigator } from './MemberNavigator';
import { CoachNavigator } from './CoachNavigator';
import { AdminNavigator } from './AdminNavigator';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../shared/constants/Colors';

const Stack = createStackNavigator();

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.black }}>
        <ActivityIndicator size="large" color={Colors.jaiBlue} />
      </View>
    );
  }

  const getNavigatorForRole = () => {
    if (!user) return <LoginScreen />;

    if (user.is_first_login) {
      return <FirstLoginScreen />;
    }

    switch (user.role) {
      case 'member':
        return <MemberNavigator />;
      case 'coach':
        return <CoachNavigator />;
      case 'admin':
      case 'master_admin':
        return <AdminNavigator />;
      default:
        return <LoginScreen />;
    }
  };

  return (
    <NavigationContainer>
      {getNavigatorForRole()}
    </NavigationContainer>
  );
};
