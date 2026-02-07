import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://xioimcyqglfxqumvbqsg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpb2ltY3lxZ2xmeHF1bXZicXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Mzk5NTcsImV4cCI6MjA4NTMxNTk1N30.mgEsMIJUZqWmFVST0roe33XPU_KBASXgnwo0FEV1BvA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
