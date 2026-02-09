import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Failed to load user profile:', error.message);
        setUser(null);
      } else {
        setUser(data);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setUser(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user?.id) {
        await fetchUserProfile(data.session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'SIGNED_OUT' || !nextSession?.user?.id) {
        setUser(null);
        setLoading(false);
        return;
      }
      await fetchUserProfile(nextSession.user.id);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    return {
      session,
      user,
      role: user?.role || null,
      loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      refreshUser: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user?.id) {
          await fetchUserProfile(data.session.user.id);
        }
      }
    };
  }, [session, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
