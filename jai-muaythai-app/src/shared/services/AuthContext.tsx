import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { User } from '../../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[Auth] Initializing AuthProvider...');

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] getSession result:', session ? `user=${session.user.id}` : 'no session');
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, session ? `user=${session.user.id}` : 'no session');
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
          return;
        }
        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    console.log('[Auth] Fetching user profile for:', userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[Auth] fetchUserProfile error:', error.message);
      }

      if (data) {
        console.log('[Auth] User profile loaded:', data.email, 'role:', data.role, 'is_first_login:', data.is_first_login);
        setUser(data);
      } else {
        console.warn('[Auth] No user profile found for id:', userId);
      }
    } catch (err: any) {
      console.error('[Auth] fetchUserProfile exception:', err.message);
    }
    setLoading(false);
  };

  const signOut = async () => {
    console.log('[Auth] Signing out...');
    await supabase.auth.signOut();
    setUser(null);
  };

  const refreshUser = async () => {
    console.log('[Auth] refreshUser called');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[Auth] refreshUser session:', session ? `user=${session.user.id}` : 'no session');
      if (session?.user) {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        if (error) {
          console.error('[Auth] refreshUser DB error:', error.message);
        }
        if (data) {
          console.log('[Auth] refreshUser success:', data.email, 'is_first_login:', data.is_first_login);
          setUser(data);
        } else {
          console.warn('[Auth] refreshUser: no data returned');
        }
      } else {
        console.warn('[Auth] refreshUser: no active session — cannot refresh');
      }
    } catch (err: any) {
      console.error('[Auth] refreshUser exception:', err.message);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
