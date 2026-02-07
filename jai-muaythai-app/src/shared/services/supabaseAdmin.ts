import { createClient } from '@supabase/supabase-js';

// Use the SAME URL and key as your main supabase.ts file
const supabaseUrl = 'https://xioimcyqglfxqumvbqsg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpb2ltY3lxZ2xmeHF1bXZicXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Mzk5NTcsImV4cCI6MjA4NTMxNTk1N30.mgEsMIJUZqWmFVST0roe33XPU_KBASXgnwo0FEV1BvA';

// This client does NOT save sessions
// So creating a new user won't log out the current admin
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
